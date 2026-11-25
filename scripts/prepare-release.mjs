#!/usr/bin/env node
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// Keep release commands in their own process group so cancellation also stops
// npm's child processes before any release files are restored (macOS/Linux).
function runCommand(command, args, cwd, { signal } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawn(command, args, { cwd, stdio: "inherit", detached: grouped });
    let closed = false;
    let interrupted = false;
    let stopped = false;
    let failure = null;
    let exitCode;
    let exitSignal;
    const stop = (name) => {
      if (!child.pid) return;
      try {
        if (grouped) process.kill(-child.pid, name);
        else child.kill(name);
      } catch (error) {
        if (error.code !== "ESRCH") failure = error;
      }
    };
    const finish = () => {
      if (!closed || (interrupted && !stopped)) return;
      signal?.removeEventListener("abort", abort);
      if (interrupted) reject(signal.reason);
      else if (failure) reject(failure);
      else if (exitCode === 0) resolve();
      else reject(new Error(`${command} failed (${exitSignal || exitCode}).`));
    };
    const abort = () => {
      if (interrupted) return;
      interrupted = true;
      stop("SIGTERM");
      // Allow graceful cleanup, then stop any remaining descendants that ignore SIGTERM.
      setTimeout(() => {
        stop("SIGKILL");
        stopped = true;
        finish();
      }, 1000);
    };
    child.on("error", (error) => { failure = error; });
    child.on("close", (code, name) => {
      closed = true;
      exitCode = code;
      exitSignal = name;
      finish();
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function prepareRelease(root, inputVersion, { run = runCommand, signal } = {}) {
  signal?.throwIfAborted();
  const execute = async (command, args) => {
    signal?.throwIfAborted();
    await run(command, args, root, { signal });
    signal?.throwIfAborted();
  };
  const version = String(inputVersion || "").replace(/^v/, "");
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("Usage: npm run prepare:release -- 0.1.5");
  }
  const files = ["package.json", "package-lock.json", "index.html", "privacy-policy.html", "terms-of-use.html", "assets/satoshi-demo-snapshot.js"];
  const originals = new Map(await Promise.all(files.map(async (file) => [file, await readFile(path.join(root, file))])));
  const temp = await mkdtemp(path.join(tmpdir(), "bitkit-watch-release-"));
  let changed = false;
  try {
    // Network or validation failures cannot replace the bundled snapshot.
    const snapshotPath = path.join(temp, "snapshot.js");
    await execute(process.execPath, ["scripts/build-satoshi-demo-snapshot.mjs", snapshotPath]);
    await execute(process.execPath, ["--check", snapshotPath]);
    const snapshot = await readFile(snapshotPath);
    changed = true;
    for (const file of files) {
      signal?.throwIfAborted();
      let next = originals.get(file).toString();
      if (file.endsWith(".json")) {
        const json = JSON.parse(next);
        json.version = version;
        if (json.packages?.[""]) json.packages[""].version = version;
        next = JSON.stringify(json, null, 2) + "\n";
      } else if (file.endsWith(".html")) {
        next = next.replace(/((?:src|href)="[^"?#]+\.(?:js|css))(?:\?[^"#]*)?"/g, `$1?v=${version}"`);
        if (file === "index.html") next = next.replace(/(id="appVersion">)v\d+\.\d+\.\d+/, `$1v${version}`);
      } else next = snapshot;
      await writeFile(path.join(root, file), next);
    }
    await execute("npm", ["run", "verify"]);
    await execute("npm", ["run", "test:browser"]);
    console.log(`Prepared v${version}. Review the diff, then commit -S and push in your Terminal.`);
  } catch (error) {
    if (changed) {
      for (const [file, bytes] of originals) await writeFile(path.join(root, file), bytes);
      console.error("Release preparation did not complete; restored the previous versions and snapshot.");
    }
    throw error;
  } finally { await rm(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  let interruptedBy = null;
  const interrupt = (name) => {
    if (controller.signal.aborted) return;
    interruptedBy = name;
    controller.abort(new Error(`Release preparation interrupted (${name}).`));
  };
  const onInterrupt = () => interrupt("SIGINT");
  const onTerminate = () => interrupt("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try {
    await prepareRelease(fileURLToPath(new URL("../", import.meta.url)), process.argv[2], { signal: controller.signal });
  } catch (error) {
    console.error(error.message);
    process.exitCode = interruptedBy === "SIGINT" ? 130 : interruptedBy === "SIGTERM" ? 143 : 1;
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}
