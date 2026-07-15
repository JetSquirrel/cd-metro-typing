#!/usr/bin/env node
/**
 * Build playable Chengdu Metro JSON + a simple districts TopoJSON.
 *
 * Station / route geometry: OpenStreetMap © OpenStreetMap contributors (ODbL 1.0)
 * Manual line sequences (13/27/30): data/manual-overrides.json
 * Geocoding fallback: Nominatim (OSM) with cached results
 *
 * Usage: node scripts/build-metro-data.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { topology } from "topojson-server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RAW_DIR = path.join(ROOT, "data", "raw");
const OUT_DIR = path.join(ROOT, "public", "data");
const OVERRIDES_PATH = path.join(ROOT, "data", "manual-overrides.json");
const NOMINATIM_CACHE_PATH = path.join(RAW_DIR, "nominatim-cache.json");

const CHENGDU_CITY_RELATION_ID = 2110264; // 成都市 administrative boundary (not 912940)
const OSM_API = "https://api.openstreetmap.org/api/0.6";
const NOMINATIM_API = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "cd-metro-typing/0.1";

/** Approximate Chengdu metro / city viewbox for Nominatim (left,top,right,bottom). */
const CHENGDU_VIEWBOX = "103.6,31.1,104.9,30.1";

const STOP_ROLES = new Set([
  "stop",
  "stop_entry_only",
  "stop_exit_only",
  "station",
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function padSeq(n, width = 2) {
  return String(n).padStart(width, "0");
}

function canonicalName(nameZh, aliases = {}) {
  if (!nameZh) return nameZh;
  return aliases[nameZh] ?? nameZh;
}

function toTarget(nameEn) {
  return String(nameEn || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isStopMember(member) {
  return member.type === "node" && STOP_ROLES.has(String(member.role || ""));
}

function routeLooksExpress(tags, keywords) {
  const hay = [tags.name, tags["name:en"], tags["name:zh"], tags.service]
    .filter(Boolean)
    .join(" ");
  return keywords.some((kw) => hay.includes(kw));
}

function fingerprintSequence(names) {
  return names.join("\u0001");
}

function reverseFingerprint(names) {
  return [...names].reverse().join("\u0001");
}

function preferRoute(a, b, preferKeywords) {
  const score = (route) => {
    const name = route.tags.name || "";
    let s = route.stops.length;
    if (preferKeywords.some((kw) => name.includes(kw))) s += 1000;
    return s;
  };
  return score(a) >= score(b) ? a : b;
}

function extractStopsFromRouteDoc(doc, aliases, deferred) {
  const rel = doc.elements?.find((e) => e.type === "relation");
  if (!rel) return null;

  const nodes = new Map(
    (doc.elements || [])
      .filter((e) => e.type === "node")
      .map((n) => [n.id, n]),
  );

  const stops = [];
  for (const member of rel.members || []) {
    if (!isStopMember(member)) continue;
    const node = nodes.get(member.ref);
    if (!node) continue;
    const tags = node.tags || {};
    const rawZh = tags["name:zh"] || tags.name;
    if (!rawZh) continue;
    const nameZh = canonicalName(rawZh, aliases);
    if (deferred.has(nameZh) || deferred.has(rawZh)) continue;
    const nameEn = tags["name:en"] || tags["name:zh-Latn"] || nameZh;
    stops.push({
      osmNodeId: node.id,
      nameZh,
      nameEn,
      lat: node.lat,
      lon: node.lon,
    });
  }

  return {
    id: rel.id,
    tags: rel.tags || {},
    stops,
  };
}

function isContiguousSubsequence(needle, haystack) {
  if (needle.length > haystack.length) return false;
  if (needle.length === haystack.length) {
    return fingerprintSequence(needle) === fingerprintSequence(haystack);
  }
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function isSameOrSubRun(aNames, bNames) {
  return (
    isContiguousSubsequence(aNames, bNames) ||
    isContiguousSubsequence(aNames, [...bNames].reverse())
  );
}

function selectPlayableRoutes(routes, overrides) {
  const keywords = overrides.expressRouteKeywords || [];
  const preferKeywords = overrides.preferDirectionKeywords || [];

  const nonExpress = routes.filter((r) => !routeLooksExpress(r.tags, keywords));
  const pool = nonExpress.length > 0 ? nonExpress : routes;

  /** @type {Map<string, typeof pool[0]>} */
  const chosen = new Map();

  // Prefer longer routes first so short service patterns can be dropped as subsets.
  const ordered = [...pool].sort((a, b) => b.stops.length - a.stops.length);

  for (const route of ordered) {
    const names = route.stops.map((s) => s.nameZh);
    if (names.length < 2) continue;
    const fwd = fingerprintSequence(names);
    const rev = reverseFingerprint(names);

    if (chosen.has(fwd)) {
      chosen.set(fwd, preferRoute(chosen.get(fwd), route, preferKeywords));
      continue;
    }
    if (chosen.has(rev)) {
      // Reverse of an already-kept run — skip (keep one direction).
      continue;
    }

    const isSubsetOfKept = [...chosen.values()].some((kept) => {
      const keptNames = kept.stops.map((s) => s.nameZh);
      return isSameOrSubRun(names, keptNames);
    });
    if (isSubsetOfKept) continue;

    // Drop non-contiguous connectors/shuttles whose stops all already appear on
    // a longer kept run (e.g. Line 19 airport-to-airport shortcut chord).
    const isStationSetSubsetOfKept = [...chosen.values()].some((kept) => {
      if (kept.stops.length <= names.length) return false;
      const keptSet = new Set(kept.stops.map((s) => s.nameZh));
      return names.every((n) => keptSet.has(n));
    });
    if (isStationSetSubsetOfKept) continue;

    // Drop any already-kept runs that are subsets of this longer route.
    for (const [key, kept] of [...chosen.entries()]) {
      const keptNames = kept.stops.map((s) => s.nameZh);
      if (keptNames.length >= names.length) continue;
      if (isSameOrSubRun(keptNames, names)) {
        chosen.delete(key);
        continue;
      }
      // Shorter kept connector fully covered by this longer geographic run.
      if (keptNames.every((n) => names.includes(n))) {
        chosen.delete(key);
      }
    }

    chosen.set(fwd, route);
  }

  return [...chosen.values()];
}

function buildStationIndex(routeDocs, aliases) {
  /** @type {Map<string, {nameZh:string,nameEn:string,lat:number,lon:number,osmNodeId:number}>} */
  const byZh = new Map();

  for (const doc of routeDocs) {
    for (const el of doc.elements || []) {
      if (el.type !== "node" || el.lat == null || el.lon == null) continue;
      const tags = el.tags || {};
      const rawZh = tags["name:zh"] || tags.name;
      if (!rawZh) continue;
      const nameZh = canonicalName(rawZh, aliases);
      const nameEn = tags["name:en"] || tags["name:zh-Latn"] || nameZh;
      const prev = byZh.get(nameZh);
      // Prefer nodes tagged as subway stop/station.
      const score =
        (tags.subway === "yes" ? 2 : 0) +
        (tags.public_transport === "stop_position" ||
        tags.public_transport === "station" ||
        tags.railway === "station" ||
        tags.railway === "stop"
          ? 1
          : 0);
      const prevScore = prev?._score ?? -1;
      if (!prev || score >= prevScore) {
        byZh.set(nameZh, {
          nameZh,
          nameEn,
          lat: el.lat,
          lon: el.lon,
          osmNodeId: el.id,
          _score: score,
        });
      }
    }
  }

  for (const v of byZh.values()) delete v._score;
  return byZh;
}

async function loadNominatimCache() {
  try {
    return await readJson(NOMINATIM_CACHE_PATH);
  } catch {
    return {};
  }
}

async function nominatimSearch(query, cache) {
  if (cache[query]?.lat != null && cache[query]?.lon != null) {
    return cache[query];
  }

  const params = new URLSearchParams({
    q: `${query}, Chengdu, Sichuan, China`,
    format: "json",
    limit: "1",
    viewbox: CHENGDU_VIEWBOX,
    bounded: "1",
  });

  const url = `${NOMINATIM_API}?${params}`;
  console.log(`Nominatim: ${query}`);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    console.warn(`Nominatim failed for ${query}: ${res.status}`);
    cache[query] = { lat: null, lon: null, error: res.status, at: new Date().toISOString() };
    await writeJson(NOMINATIM_CACHE_PATH, cache);
    await sleep(1100);
    return cache[query];
  }

  const results = await res.json();
  const hit = results[0];
  cache[query] = hit
    ? {
        lat: Number(hit.lat),
        lon: Number(hit.lon),
        display_name: hit.display_name,
        at: new Date().toISOString(),
      }
    : { lat: null, lon: null, at: new Date().toISOString() };

  await writeJson(NOMINATIM_CACHE_PATH, cache);
  await sleep(1100);
  return cache[query];
}

function buildLineFromRuns(lineRef, runs, meta, nameOverrides) {
  /** @type {Map<string, object>} */
  const stationByZh = new Map();
  const segmentNameRuns = [];

  for (const run of runs) {
    const names = [];
    for (const stop of run) {
      if (!stationByZh.has(stop.nameZh)) {
        const overrideEn = nameOverrides[stop.nameZh]?.en;
        stationByZh.set(stop.nameZh, {
          nameZh: stop.nameZh,
          nameEn: overrideEn || stop.nameEn,
          lat: stop.lat,
          lon: stop.lon,
          transferLineIds: [],
        });
      } else {
        const existing = stationByZh.get(stop.nameZh);
        if ((existing.lat == null || existing.lon == null) && stop.lat != null) {
          existing.lat = stop.lat;
          existing.lon = stop.lon;
        }
        if (!existing.nameEn && stop.nameEn) existing.nameEn = stop.nameEn;
      }
      names.push(stop.nameZh);
    }
    if (names.length >= 2) segmentNameRuns.push(names);
  }

  const stations = [...stationByZh.values()].map((s, idx) => {
    const sequence = idx + 1;
    const stationId = `${lineRef}-${padSeq(sequence)}`;
    return {
      id: stationId,
      stationId,
      sequence,
      nameZh: s.nameZh,
      nameEn: s.nameEn,
      target: toTarget(s.nameEn),
      lat: s.lat ?? null,
      lon: s.lon ?? null,
      transferLineIds: [],
    };
  });

  const idByZh = new Map(stations.map((s) => [s.nameZh, s.stationId]));
  const segments = segmentNameRuns.map((names) =>
    names.map((zh) => idByZh.get(zh)).filter(Boolean),
  );
  const mapSegments = segments.map((seg) => [...seg]);

  return {
    id: `CD-${lineRef}`,
    lineId: lineRef,
    lineName: meta.lineName,
    lineNameEn: meta.lineNameEn,
    color: meta.color,
    operatorName: meta.operatorName,
    stations,
    segments,
    mapSegments,
  };
}

async function buildManualLine(lineRef, manual, stationIndex, overrides, cache) {
  const nameMeta = overrides.lineNames[lineRef];
  const runs = [];

  for (const run of manual.runs || []) {
    const stops = [];
    for (const st of run.stations) {
      const nameZh = canonicalName(st.zh, overrides.stationAliases || {});
      if ((overrides.deferredStationNamesZh || []).includes(nameZh)) continue;

      let lat = null;
      let lon = null;
      let nameEn = overrides.nameOverrides?.[nameZh]?.en || st.en;

      const fromOsm = stationIndex.get(nameZh);
      if (fromOsm && !nameEn) nameEn = fromOsm.nameEn;

      const coordOverride = overrides.stationCoordinates?.[nameZh];
      if (coordOverride?.lat != null && coordOverride?.lon != null) {
        lat = coordOverride.lat;
        lon = coordOverride.lon;
      } else if (fromOsm) {
        lat = fromOsm.lat;
        lon = fromOsm.lon;
      } else {
        const geo = await nominatimSearch(nameZh, cache);
        if (geo?.lat != null && geo?.lon != null) {
          lat = geo.lat;
          lon = geo.lon;
        }
      }

      stops.push({ nameZh, nameEn: nameEn || nameZh, lat, lon });
    }
    if (stops.length >= 2) runs.push(stops);
  }

  return buildLineFromRuns(
    lineRef,
    runs,
    {
      lineName: nameMeta?.zh || `${lineRef}号线`,
      lineNameEn: nameMeta?.en || `Line ${lineRef}`,
      color: manual.color || overrides.lineColors[lineRef],
      operatorName: overrides.operatorName,
    },
    overrides.nameOverrides || {},
  );
}

function applyTransfers(lines) {
  /** @type {Map<string, Set<string>>} */
  const nameToLines = new Map();

  for (const line of lines) {
    for (const st of line.stations) {
      const key = st.nameZh;
      if (!nameToLines.has(key)) nameToLines.set(key, new Set());
      nameToLines.get(key).add(line.lineId);
    }
  }

  for (const line of lines) {
    for (const st of line.stations) {
      const all = nameToLines.get(st.nameZh) || new Set();
      st.transferLineIds = [...all]
        .filter((id) => id !== line.lineId)
        .sort((a, b) => {
          const na = Number(a);
          const nb = Number(b);
          if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
          return String(a).localeCompare(String(b));
        });
    }
  }
}

function simplifyRing(coords, maxPoints = 80) {
  if (coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  const out = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  const first = out[0];
  const last = out[out.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([...first]);
  return out;
}

function ringFromWays(wayNodes) {
  // wayNodes: array of [lon,lat][]
  if (wayNodes.length === 0) return null;
  const rings = wayNodes.map((w) => [...w]);
  const used = new Set();
  let chain = rings[0];
  used.add(0);

  let guard = 0;
  while (used.size < rings.length && guard < rings.length * 2) {
    guard += 1;
    const end = chain[chain.length - 1];
    let found = false;
    for (let i = 0; i < rings.length; i++) {
      if (used.has(i)) continue;
      const w = rings[i];
      const a = w[0];
      const b = w[w.length - 1];
      if (a[0] === end[0] && a[1] === end[1]) {
        chain = chain.concat(w.slice(1));
        used.add(i);
        found = true;
        break;
      }
      if (b[0] === end[0] && b[1] === end[1]) {
        chain = chain.concat([...w].reverse().slice(1));
        used.add(i);
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  if (chain.length < 4) return null;
  const first = chain[0];
  const last = chain[chain.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) chain.push([...first]);
  return simplifyRing(chain);
}

async function buildDistrictsTopo(lines) {
  let feature = null;

  try {
    console.log(`Fetching Chengdu city boundary relation ${CHENGDU_CITY_RELATION_ID}…`);
    const res = await fetch(
      `${OSM_API}/relation/${CHENGDU_CITY_RELATION_ID}/full.json`,
      { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
    );
    if (res.ok) {
      const doc = await res.json();
      const nodes = new Map(
        (doc.elements || [])
          .filter((e) => e.type === "node")
          .map((n) => [n.id, [n.lon, n.lat]]),
      );
      const ways = new Map(
        (doc.elements || [])
          .filter((e) => e.type === "way")
          .map((w) => [w.id, w]),
      );
      const rel = doc.elements?.find(
        (e) => e.type === "relation" && e.id === CHENGDU_CITY_RELATION_ID,
      );
      const outerWayIds = (rel?.members || [])
        .filter((m) => m.type === "way" && (m.role === "outer" || m.role === ""))
        .map((m) => m.ref);

      const wayCoords = [];
      for (const wid of outerWayIds) {
        const way = ways.get(wid);
        if (!way?.nodes?.length) continue;
        const coords = way.nodes.map((nid) => nodes.get(nid)).filter(Boolean);
        if (coords.length >= 2) wayCoords.push(coords);
      }

      const ring = ringFromWays(wayCoords);
      if (ring && ring.length >= 4) {
        feature = {
          type: "Feature",
          properties: { id: "chengdu", name: "成都市" },
          geometry: { type: "Polygon", coordinates: [ring] },
        };
        console.log(`Using simplified Chengdu outline (${ring.length} vertices)`);
      }
    } else {
      console.warn(`City boundary HTTP ${res.status}; falling back to metro bbox`);
    }
  } catch (err) {
    console.warn(`City boundary fetch failed: ${err.message}`);
  }

  if (!feature) {
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const line of lines) {
      for (const st of line.stations) {
        if (st.lat == null || st.lon == null) continue;
        minLon = Math.min(minLon, st.lon);
        maxLon = Math.max(maxLon, st.lon);
        minLat = Math.min(minLat, st.lat);
        maxLat = Math.max(maxLat, st.lat);
      }
    }
    const pad = 0.08;
    const ring = [
      [minLon - pad, minLat - pad],
      [maxLon + pad, minLat - pad],
      [maxLon + pad, maxLat + pad],
      [minLon - pad, maxLat + pad],
      [minLon - pad, minLat - pad],
    ];
    feature = {
      type: "Feature",
      properties: { id: "chengdu-metro-extent", name: "成都地铁范围" },
      geometry: { type: "Polygon", coordinates: [ring] },
    };
    console.log("Using metro-extent bbox outline for districts TopoJSON");
  }

  const collection = {
    type: "FeatureCollection",
    features: [feature],
  };

  return topology({ map: collection }, 1e5);
}

async function main() {
  const overrides = await readJson(OVERRIDES_PATH);
  const deferred = new Set(overrides.deferredStationNamesZh || []);
  const aliases = overrides.stationAliases || {};
  const included = overrides.includedLineRefs || [];

  const rawFiles = await fs.readdir(RAW_DIR);
  const lineFiles = rawFiles.filter((f) => /^line-\d+\.json$/.test(f));
  const routeFiles = rawFiles.filter((f) => /^route-full-\d+\.json$/.test(f));

  /** @type {Map<string, {masterId:number, tags:object, routeIds:number[]}>} */
  const mastersByRef = new Map();
  for (const file of lineFiles) {
    const doc = await readJson(path.join(RAW_DIR, file));
    const rel = doc.elements?.find((e) => e.type === "relation");
    if (!rel?.tags?.ref) continue;
    const ref = String(rel.tags.ref);
    mastersByRef.set(ref, {
      masterId: rel.id,
      tags: rel.tags,
      routeIds: (rel.members || [])
        .filter((m) => m.type === "relation")
        .map((m) => m.ref),
    });
  }

  /** @type {Map<number, object>} */
  const routeDocsById = new Map();
  const allRouteDocs = [];
  for (const file of routeFiles) {
    const doc = await readJson(path.join(RAW_DIR, file));
    const rel = doc.elements?.find((e) => e.type === "relation");
    if (!rel) continue;
    routeDocsById.set(rel.id, doc);
    allRouteDocs.push(doc);
  }

  const stationIndex = buildStationIndex(allRouteDocs, aliases);
  const nominatimCache = await loadNominatimCache();

  const lines = [];
  const missingCoords = [];

  for (const lineRef of included) {
    if (overrides.manualLines?.[lineRef]) {
      console.log(`Building manual line ${lineRef}…`);
      const line = await buildManualLine(
        lineRef,
        overrides.manualLines[lineRef],
        stationIndex,
        overrides,
        nominatimCache,
      );
      lines.push(line);
      continue;
    }

    const master = mastersByRef.get(lineRef);
    if (!master) {
      console.warn(`No OSM route_master for ref ${lineRef}`);
      continue;
    }

    const parsedRoutes = [];
    for (const routeId of master.routeIds) {
      const doc = routeDocsById.get(routeId);
      if (!doc) {
        console.warn(`Missing route-full-${routeId}.json for line ${lineRef}`);
        continue;
      }
      const parsed = extractStopsFromRouteDoc(doc, aliases, deferred);
      if (parsed) parsedRoutes.push(parsed);
    }

    // Also attach orphan routes that share the same ref (e.g. S3 reverse).
    for (const [routeId, doc] of routeDocsById) {
      if (master.routeIds.includes(routeId)) continue;
      const rel = doc.elements?.find((e) => e.type === "relation");
      const ref = rel?.tags?.ref != null ? String(rel.tags.ref) : null;
      if (ref === lineRef) {
        const parsed = extractStopsFromRouteDoc(doc, aliases, deferred);
        if (parsed) parsedRoutes.push(parsed);
      }
    }

    // S3 reverse route may lack ref — match by route_master membership only (already covered)
    // or by name containing "S3".
    if (lineRef === "S3") {
      for (const [routeId, doc] of routeDocsById) {
        if (parsedRoutes.some((r) => r.id === routeId)) continue;
        const rel = doc.elements?.find((e) => e.type === "relation");
        const name = rel?.tags?.name || "";
        if (/S3|资阳/.test(name) || master.routeIds.includes(routeId)) {
          const parsed = extractStopsFromRouteDoc(doc, aliases, deferred);
          if (parsed && !parsedRoutes.some((r) => r.id === parsed.id)) {
            parsedRoutes.push(parsed);
          }
        }
      }
    }

    const playable = selectPlayableRoutes(parsedRoutes, overrides);
    const nameMeta = overrides.lineNames[lineRef];
    const runs = playable.map((r) =>
      r.stops.map((s) => ({
        nameZh: s.nameZh,
        nameEn: overrides.nameOverrides?.[s.nameZh]?.en || s.nameEn,
        lat: s.lat,
        lon: s.lon,
      })),
    );

    const line = buildLineFromRuns(
      lineRef,
      runs,
      {
        lineName: nameMeta?.zh || master.tags.name || `Line ${lineRef}`,
        lineNameEn:
          nameMeta?.en || master.tags["name:en"] || `Line ${lineRef}`,
        color: overrides.lineColors[lineRef] || master.tags.colour || "#666666",
        operatorName: overrides.operatorName,
      },
      overrides.nameOverrides || {},
    );
    lines.push(line);
    console.log(
      `Line ${lineRef}: ${line.stations.length} stations, ${line.segments.length} segments`,
    );
  }

  applyTransfers(lines);

  for (const line of lines) {
    for (const st of line.stations) {
      if (st.lat == null || st.lon == null) {
        missingCoords.push({ lineId: line.lineId, nameZh: st.nameZh, stationId: st.stationId });
      }
    }
  }

  const output = {
    source: "OpenStreetMap + manual overrides",
    sourceUrl: "https://www.openstreetmap.org/relation/16229446",
    license: "ODbL-1.0",
    generatedAt: new Date().toISOString(),
    asOf: overrides.asOf,
    lines,
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  const metroPath = path.join(OUT_DIR, "chengdu-metro.json");
  await writeJson(metroPath, output);

  const topo = await buildDistrictsTopo(lines);
  const topoPath = path.join(OUT_DIR, "chengdu-districts.topo.json");
  await writeJson(topoPath, topo);

  console.log(`\nWrote ${metroPath}`);
  console.log(`Wrote ${topoPath}`);
  console.log(`Lines: ${lines.length}`);
  console.log(
    `Stations: ${lines.reduce((n, l) => n + l.stations.length, 0)} (per-line counts; transfers share names)`,
  );
  if (missingCoords.length) {
    console.log(`Stations missing coordinates (${missingCoords.length}):`);
    for (const m of missingCoords) {
      console.log(`  - ${m.lineId} ${m.stationId} ${m.nameZh}`);
    }
  } else {
    console.log("All stations have coordinates.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
