#!/usr/bin/env node
// Local preview only. Production uses nginx; never expose development sources.
import http from "node:http";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { readFile, realpath, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const port = Number(process.env.PORT || 8765);
const allowed = new Set(["index.html", "privacy-policy.html", "terms-of-use.html", "app.js", "styles.css", "site.webmanifest", "LICENSE.txt", "favicon.ico", "favicon.svg", "favicon-96x96.png", "apple-touch-icon.png", "web-app-manifest-192x192.png", "web-app-manifest-512x512.png"]);
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ttf": "font/ttf", ".woff2": "font/woff2", ".ico": "image/x-icon" };
const secure = process.argv.includes("--https");
let tls;
if (secure) {
  const directory = await mkdtemp(path.join(tmpdir(), "bitkit-watch-tls-"));
  try {
    const key = path.join(directory, "key.pem");
    const cert = path.join(directory, "cert.pem");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost"], { stdio: ["ignore", "ignore", "pipe"] });
    tls = { key: await readFile(key), cert: await readFile(cert) };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
const server = secure ? https.createServer(tls) : http.createServer();
server.on("request", async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    if (!["GET", "HEAD"].includes(request.method) || (!allowed.has(relative) && !relative.startsWith("assets/")) || relative.split("/").some((part) => part.startsWith("."))) throw new Error("Not found");
    const file = await realpath(path.resolve(root, relative));
    if (!file.startsWith(root + path.sep)) throw new Error("Not found");
    const data = await readFile(file);
    response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    response.end(request.method === "HEAD" ? undefined : data);
  } catch { response.writeHead(404); response.end("Not found"); }
}).listen(port, "127.0.0.1", () => console.log(`Bitkit Watch: ${secure ? "https" : "http"}://127.0.0.1:${port}`));
