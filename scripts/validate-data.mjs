#!/usr/bin/env node
/**
 * Validate public/data/chengdu-metro.json against manual-overrides expectations.
 *
 * Fails on: missing included lines, duplicate station ids, missing coords/names,
 * segments shorter than 2, deferred stations still present.
 * Warns on: asymmetric transferLineIds.
 *
 * Usage: node scripts/validate-data.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const METRO_PATH = path.join(ROOT, "public", "data", "chengdu-metro.json");
const OVERRIDES_PATH = path.join(ROOT, "data", "manual-overrides.json");

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function main() {
  const overrides = await readJson(OVERRIDES_PATH);
  const data = await readJson(METRO_PATH);
  const errors = [];
  const warnings = [];

  const included = overrides.includedLineRefs || [];
  const deferred = new Set(overrides.deferredStationNamesZh || []);
  const lines = data.lines || [];
  const byLineId = new Map(lines.map((l) => [l.lineId, l]));

  for (const ref of included) {
    if (!byLineId.has(ref)) {
      errors.push(`Missing line for includedLineRefs entry: ${ref}`);
    }
  }

  const allStationIds = new Map();

  for (const line of lines) {
    if (!line.lineId) errors.push(`Line missing lineId: ${line.id}`);
    if (!line.lineName) errors.push(`Line ${line.lineId}: missing lineName`);
    if (!line.color) errors.push(`Line ${line.lineId}: missing color`);

    const localIds = new Set();
    for (const st of line.stations || []) {
      if (!st.stationId) {
        errors.push(`Line ${line.lineId}: station missing stationId`);
        continue;
      }
      if (localIds.has(st.stationId) || allStationIds.has(st.stationId)) {
        errors.push(`Duplicate station id: ${st.stationId}`);
      }
      localIds.add(st.stationId);
      allStationIds.set(st.stationId, { lineId: line.lineId, station: st });

      if (!st.nameZh) errors.push(`${st.stationId}: missing nameZh`);
      if (!st.nameEn) errors.push(`${st.stationId}: missing nameEn`);
      if (st.lat == null || st.lon == null || Number.isNaN(st.lat) || Number.isNaN(st.lon)) {
        errors.push(`${st.stationId}: missing lat/lon`);
      }
      if (st.nameZh && deferred.has(st.nameZh)) {
        errors.push(`${st.stationId}: deferred station included (${st.nameZh})`);
      }
    }

    const idSet = new Set((line.stations || []).map((s) => s.stationId));
    for (const [kind, segs] of [
      ["segments", line.segments],
      ["mapSegments", line.mapSegments],
    ]) {
      if (!Array.isArray(segs) || segs.length === 0) {
        errors.push(`Line ${line.lineId}: missing ${kind}`);
        continue;
      }
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        if (!Array.isArray(seg) || seg.length < 2) {
          errors.push(`Line ${line.lineId}: ${kind}[${i}] shorter than 2`);
          continue;
        }
        for (const sid of seg) {
          if (!idSet.has(sid)) {
            errors.push(
              `Line ${line.lineId}: ${kind}[${i}] references unknown station ${sid}`,
            );
          }
        }
      }
    }
  }

  // Transfer symmetry (warn only): if A lists B, B should list A for same nameZh.
  /** @type {Map<string, Map<string, object>>} nameZh -> lineId -> station */
  const byName = new Map();
  for (const line of lines) {
    for (const st of line.stations || []) {
      if (!byName.has(st.nameZh)) byName.set(st.nameZh, new Map());
      byName.get(st.nameZh).set(line.lineId, st);
    }
  }

  for (const [nameZh, lineMap] of byName) {
    const lineIds = [...lineMap.keys()];
    if (lineIds.length < 2) continue;
    for (const lineId of lineIds) {
      const st = lineMap.get(lineId);
      const expected = lineIds.filter((id) => id !== lineId).sort();
      const actual = [...(st.transferLineIds || [])].sort();
      const missing = expected.filter((id) => !actual.includes(id));
      const extra = actual.filter((id) => !expected.includes(id));
      if (missing.length || extra.length) {
        warnings.push(
          `Transfer asymmetry at ${nameZh} on line ${lineId}: expected [${expected}], got [${actual}]`,
        );
      }
    }
  }

  for (const w of warnings) console.warn(`WARN: ${w}`);
  if (errors.length) {
    console.error(`Validation failed with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(
    `OK: ${lines.length} lines, ${allStationIds.size} stations, ${warnings.length} warning(s)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
