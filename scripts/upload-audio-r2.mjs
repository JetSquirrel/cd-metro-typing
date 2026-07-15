#!/usr/bin/env node
/**
 * Upload local wav clips to the R2 bucket used by the production Worker.
 *
 * Usage:
 *   node scripts/upload-audio-r2.mjs
 *   node scripts/upload-audio-r2.mjs --voice mandarin
 *   node scripts/upload-audio-r2.mjs --dry-run
 *   node scripts/upload-audio-r2.mjs --concurrency 6
 */
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUDIO_ROOT = path.join(ROOT, "public", "audio");
const BUCKET = process.env.R2_AUDIO_BUCKET || "cd-metro-typing-audio";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const voiceIdx = args.indexOf("--voice");
const voiceFilter = voiceIdx >= 0 ? args[voiceIdx + 1] : null;
const concurrencyIdx = args.indexOf("--concurrency");
const concurrency = Math.max(
  1,
  Number(concurrencyIdx >= 0 ? args[concurrencyIdx + 1] : process.env.R2_UPLOAD_CONCURRENCY || 6) || 6,
);

function runQuiet(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim() || "(no stderr)"}`));
    });
  });
}

async function listWavs(voice) {
  const dir = path.join(AUDIO_ROOT, voice);
  const names = await readdir(dir);
  return names
    .filter((name) => name.endsWith(".wav"))
    .map((name) => ({
      voice,
      file: path.join(dir, name),
      key: `${voice}/${name}`,
    }));
}

async function mapPool(items, limit, worker) {
  let next = 0;
  let active = 0;
  let failed = null;
  return new Promise((resolve, reject) => {
    const kick = () => {
      if (failed) return;
      while (active < limit && next < items.length) {
        const index = next;
        next += 1;
        active += 1;
        Promise.resolve(worker(items[index], index))
          .then(() => {
            active -= 1;
            if (next >= items.length && active === 0) resolve();
            else kick();
          })
          .catch((error) => {
            failed = error;
            reject(error);
          });
      }
      if (items.length === 0) resolve();
    };
    kick();
  });
}

async function putWithRetry(item, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await runQuiet("npx", [
        "wrangler",
        "r2",
        "object",
        "put",
        `${BUCKET}/${item.key}`,
        "--file",
        item.file,
        "--content-type",
        "audio/wav",
        "--remote",
      ]);
      return;
    } catch (error) {
      lastError = error;
      const delay = Math.min(10000, 500 * 2 ** (attempt - 1));
      console.warn(`retry ${attempt}/${attempts} ${item.key} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function main() {
  const voices = voiceFilter ? [voiceFilter] : ["mandarin", "sichuan"];
  const files = [];
  for (const voice of voices) {
    try {
      files.push(...(await listWavs(voice)));
    } catch (error) {
      if (error && error.code === "ENOENT") {
        console.warn(`skip missing directory: public/audio/${voice}`);
        continue;
      }
      throw error;
    }
  }

  if (!files.length) {
    console.error("No wav files found under public/audio/. Generate locally first.");
    process.exit(1);
  }

  console.log(
    `Uploading ${files.length} object(s) to R2 bucket ${BUCKET} (concurrency ${concurrency})${dryRun ? " (dry-run)" : ""}`,
  );

  if (dryRun) {
    for (const item of files) console.log(item.key);
    console.log("Done.");
    return;
  }

  let completed = 0;
  await mapPool(files, concurrency, async (item) => {
    await putWithRetry(item);
    completed += 1;
    if (completed % 25 === 0 || completed === files.length) {
      console.log(`progress ${completed}/${files.length}`);
    }
  });

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
