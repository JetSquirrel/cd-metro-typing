#!/usr/bin/env node
/** Ensure local wavs under dist/audio are not uploaded as Worker static assets. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
await mkdir(dist, { recursive: true });
await writeFile(
  path.join(dist, ".assetsignore"),
  ["audio/**/*.wav", "**/*.wav", ""].join("\n"),
  "utf8",
);
console.log("wrote dist/.assetsignore");
