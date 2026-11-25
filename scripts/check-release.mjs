#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
if (manifest.version !== lock.version || manifest.version !== lock.packages[""].version) throw new Error("Manifest and lockfile versions differ.");
const html = read("index.html");
if (!html.includes(`id="appVersion">v${manifest.version}</span>`)) throw new Error("Visible version differs from package.json.");
for (const file of ["index.html", "privacy-policy.html", "terms-of-use.html"]) {
  for (const match of read(file).matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))(?:\?([^"#]*))?"/g)) {
    if (!existsSync(path.join(root, match[1]))) throw new Error(`Missing asset: ${match[1]}`);
    if (match[2] !== `v=${manifest.version}`) throw new Error(`Stale asset version: ${match[1]}`);
  }
}
console.log(`Release v${manifest.version}: manifest, lockfile, footer and asset URLs agree.`);
