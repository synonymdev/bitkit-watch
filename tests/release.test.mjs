import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareRelease } from "../scripts/prepare-release.mjs";
import history from "../assets/market-history.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "bitkit-release-test-"));
  await mkdir(path.join(root, "assets"));
  const files = {
    "package.json": '{"version":"0.1.4"}',
    "package-lock.json": '{"version":"0.1.4","packages":{"":{"version":"0.1.4"}}}',
    "index.html": '<span id="appVersion">v0.1.4</span><script src="app.js?v=0.1.4"></script>',
    "privacy-policy.html": '<link href="styles.css?v=old">',
    "terms-of-use.html": '<link href="styles.css?v=old">',
    "assets/satoshi-demo-snapshot.js": 'old snapshot',
  };
  for (const [file, bytes] of Object.entries(files)) await writeFile(path.join(root, file), bytes);
  return { root, files };
}

test("release preparation synchronizes all versions, refreshes the snapshot, runs checks, and never invokes git", async () => {
  const { root } = await fixture();
  const calls = [];
  try {
    await prepareRelease(root, "v0.1.5", { run: async (command, args) => {
      calls.push([command, args]);
      if (args[0] === "scripts/build-satoshi-demo-snapshot.mjs") await writeFile(args[1], "new snapshot");
    } });
    assert.equal(JSON.parse(await readFile(path.join(root, "package.json"))).version, "0.1.5");
    assert.equal(JSON.parse(await readFile(path.join(root, "package-lock.json"))).packages[""].version, "0.1.5");
    assert.match(await readFile(path.join(root, "index.html"), "utf8"), /v0\.1\.5<\/span>/);
    assert.match(await readFile(path.join(root, "privacy-policy.html"), "utf8"), /styles.css\?v=0\.1\.5/);
    assert.equal(await readFile(path.join(root, "assets/satoshi-demo-snapshot.js"), "utf8"), "new snapshot");
    assert.deepEqual(calls.slice(-2).map(([, args]) => args), [["run", "verify"], ["run", "test:browser"]]);
    assert.ok(calls.every(([command]) => command !== "git"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed browser validation restores exact previous release files", async () => {
  const { root, files } = await fixture();
  try {
    await assert.rejects(prepareRelease(root, "0.1.5", { run: async (_, args) => {
      if (args[0] === "scripts/build-satoshi-demo-snapshot.mjs") await writeFile(args[1], "new snapshot");
      if (args.includes("test:browser")) throw new Error("browser failed");
    } }), /browser failed/);
    for (const [file, bytes] of Object.entries(files)) assert.equal(await readFile(path.join(root, file), "utf8"), bytes);
    await assert.rejects(prepareRelease(root, "0.14; command"), /Usage/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("shared snapshot coverage counts missing observations before rendering", () => {
  const start = Date.UTC(2020, 0, 1), end = Date.UTC(2020, 0, 5);
  const raw = new Map([["2020-01-03", 7000], ["2020-01-06", 8000]]);
  const result = history.summarizePriceHistory(raw, start, end);
  assert.deepEqual([...result.series], [["2020-01-03", 7000]]);
  assert.equal(result.missingDays, 4);
  assert.equal(raw.size, 2);
  assert.throws(() => history.summarizePriceHistory(raw, 0, 1e100), /Unsupported/);
});

for (const [signal, expectedCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  test(`release CLI restores exact files on ${signal} and stops child writers first`, { timeout: 15_000, skip: process.platform === "win32" }, async () => {
    const { root, files } = await fixture();
    let child;
    let writerPid;
    try {
      await mkdir(path.join(root, "scripts"));
      await copyFile(new URL("../scripts/prepare-release.mjs", import.meta.url), path.join(root, "scripts/prepare-release.mjs"));
      files["package.json"] = JSON.stringify({ version: "0.1.4", scripts: { verify: "node scripts/hold.mjs" } });
      await writeFile(path.join(root, "package.json"), files["package.json"]);
      await writeFile(path.join(root, "scripts/build-satoshi-demo-snapshot.mjs"), 'import {writeFile} from "node:fs/promises"; await writeFile(process.argv[2], "// fresh snapshot");');
      await writeFile(path.join(root, "scripts/hold.mjs"), 'import {spawn} from "node:child_process"; spawn(process.execPath,["scripts/writer.mjs"],{stdio:"inherit"}); setInterval(()=>{},1000);');
      // This grandchild ignores graceful termination and would corrupt a premature rollback.
      await writeFile(path.join(root, "scripts/writer.mjs"), `
        import {writeFileSync} from "node:fs";
        process.on("SIGTERM",()=>{}); process.on("SIGINT",()=>{});
        writeFileSync("ready", String(process.pid));
        setInterval(()=>writeFileSync("package.json", "late child write"), 30);
      `);
      child = spawn(process.execPath, ["scripts/prepare-release.mjs", "0.1.5"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", chunk => { output += chunk; });
      child.stderr.on("data", chunk => { output += chunk; });
      const closed = new Promise((resolve, reject) => { child.on("error", reject); child.on("close", (code, name) => resolve({code, name})); });
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        try { writerPid = Number(await readFile(path.join(root, "ready"), "utf8")); break; }
        catch (error) { if (error.code !== "ENOENT") throw error; }
        if (child.exitCode !== null) assert.fail(output);
        await delay(20);
      }
      assert.ok(writerPid, `Child validation never started: ${output}`);
      child.kill(signal);
      assert.deepEqual(await closed, { code: expectedCode, name: null }, output);
      assert.match(output, /restored the previous versions and snapshot/);
      // Give any surviving writer a chance to reveal itself after restoration.
      await delay(120);
      for (const [file, bytes] of Object.entries(files)) assert.equal(await readFile(path.join(root, file), "utf8"), bytes, file);
    } finally {
      if (child?.exitCode === null) child.kill("SIGKILL");
      if (writerPid) { try { process.kill(writerPid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; } }
      await rm(root, { recursive: true, force: true });
    }
  });
}
