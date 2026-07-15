#!/usr/bin/env node
/**
 * Refresh Chengdu Metro OSM raw data via the official OSM API.
 *
 * Data source: OpenStreetMap (https://www.openstreetmap.org)
 * License: Open Database License (ODbL) 1.0
 *   https://opendatacommons.org/licenses/odbl/1-0/
 * Attribution: © OpenStreetMap contributors
 *
 * Network relation: 16229446 (Chengdu Metro)
 *
 * Queries use numeric relation IDs only (no Chinese characters), so this
 * script stays compatible with tooling that mishandles CJK in URLs.
 *
 * Usage: node scripts/fetch-osm-data.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RAW_DIR = path.join(ROOT, "data", "raw");

const NETWORK_RELATION_ID = 16229446;
const OSM_API = "https://api.openstreetmap.org/api/0.6";
const USER_AGENT = "cd-metro-typing/0.1 (metro data refresh; local tooling)";
const REQUEST_GAP_MS = 1100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function osmGet(urlPath) {
  const url = `${OSM_API}${urlPath}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OSM GET ${urlPath} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data)}\n`, "utf8");
}

async function main() {
  await fs.mkdir(RAW_DIR, { recursive: true });

  console.log(`Fetching network relation ${NETWORK_RELATION_ID}…`);
  console.log("Attribution: © OpenStreetMap contributors (ODbL 1.0)");
  const network = await osmGet(`/relation/${NETWORK_RELATION_ID}.json`);
  await writeJson(path.join(RAW_DIR, "network.json"), network);

  const networkRel = network.elements?.find((e) => e.type === "relation");
  if (!networkRel) {
    throw new Error("network.json missing relation element");
  }

  const masterIds = networkRel.members
    .filter((m) => m.type === "relation")
    .map((m) => m.ref);

  await writeJson(path.join(RAW_DIR, "network-members.json"), {
    networkRelationId: NETWORK_RELATION_ID,
    masterIds,
    fetchedAt: new Date().toISOString(),
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    sourceUrl: "https://www.openstreetmap.org/copyright",
  });

  const routeIds = new Set();
  const masters = [];

  for (const masterId of masterIds) {
    await sleep(REQUEST_GAP_MS);
    console.log(`Fetching route_master ${masterId}…`);
    const masterDoc = await osmGet(`/relation/${masterId}.json`);
    await writeJson(path.join(RAW_DIR, `line-${masterId}.json`), masterDoc);

    const masterRel = masterDoc.elements?.find((e) => e.type === "relation");
    if (!masterRel) continue;
    masters.push({
      id: masterId,
      ref: masterRel.tags?.ref ?? null,
      name: masterRel.tags?.name ?? null,
    });

    for (const member of masterRel.members ?? []) {
      if (member.type === "relation") routeIds.add(member.ref);
    }
  }

  await writeJson(path.join(RAW_DIR, "route-masters.json"), {
    fetchedAt: new Date().toISOString(),
    masters,
  });

  const sortedRouteIds = [...routeIds].sort((a, b) => a - b);
  await fs.writeFile(
    path.join(RAW_DIR, "route-ids.txt"),
    `${sortedRouteIds.join("\n")}\n`,
    "utf8",
  );

  for (const routeId of sortedRouteIds) {
    await sleep(REQUEST_GAP_MS);
    console.log(`Fetching full route ${routeId}…`);
    const full = await osmGet(`/relation/${routeId}/full.json`);
    await writeJson(path.join(RAW_DIR, `route-full-${routeId}.json`), full);
  }

  console.log(
    `Done. Wrote ${masterIds.length} line masters and ${sortedRouteIds.length} full routes to ${RAW_DIR}`,
  );
  console.log(
    "License reminder: OpenStreetMap data is available under the Open Database License (ODbL).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
