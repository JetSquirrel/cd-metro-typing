#!/usr/bin/env node
/**
 * Generate arrival/transfer announcement scripts from chengdu-metro.json
 * Phrase: 前方到站，{站名}。可换乘{线路列表}。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const metroPath = join(root, "public/data/chengdu-metro.json");
const outPath = join(root, "audio/scripts.json");

const metro = JSON.parse(readFileSync(metroPath, "utf8"));
const lineNameById = new Map(
  metro.lines.map((line) => [line.lineId, line.lineName]),
);

const byStation = new Map();

for (const line of metro.lines) {
  for (const station of line.stations) {
    const key = station.nameZh;
    if (!byStation.has(key)) {
      byStation.set(key, {
        id: station.stationId || station.id,
        nameZh: station.nameZh,
        nameEn: station.nameEn,
        servingLineIds: new Set([line.lineId]),
      });
    } else {
      byStation.get(key).servingLineIds.add(line.lineId);
    }
  }
}

function servingPhrase(servingLineIds) {
  const names = [...servingLineIds]
    .sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    })
    .map((id) => lineNameById.get(id) || (String(id).startsWith("S") ? id : `${id}号线`))
    .filter(Boolean);
  if (names.length <= 1) return "";
  return `换乘站：${names.join("、")}。`;
}

const scripts = {
  revision: 2,
  generatedAt: new Date().toISOString(),
  template: "前方到站，{nameZh}。{serving}",
  stations: [...byStation.values()]
    .sort((a, b) => a.nameZh.localeCompare(b.nameZh, "zh"))
    .map((station) => {
      const serving = servingPhrase(station.servingLineIds);
      const text = `前方到站，${station.nameZh}。${serving}`.replace(/。。/gu, "。");
      return {
        id: station.id,
        nameZh: station.nameZh,
        nameEn: station.nameEn,
        servingLineIds: [...station.servingLineIds],
        transferLineIds: [...station.servingLineIds].filter((id, _, arr) => arr.length > 1),
        text,
      };
    }),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(scripts, null, 2)}\n`);
console.log(`Wrote ${scripts.stations.length} scripts → ${outPath}`);
