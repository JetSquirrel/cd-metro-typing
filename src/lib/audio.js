/**
 * Build Chengdu-style arrival announcement script text.
 * Template: 前方到站，{站名}。可换乘{线路}。
 */
export function buildAnnouncementText(station, lineNameById = new Map()) {
  if (!station?.nameZh) return "";
  const transferIds = station.transferLineIds || [];
  const names = transferIds
    .map((id) => lineNameById.get(String(id)) || `${id}号线`)
    .filter(Boolean);
  const transfer = names.length ? `可换乘${names.join("、")}。` : "";
  return `前方到站，${station.nameZh}。${transfer}`.replace(/。。/gu, "。");
}

/**
 * Resolve clip path from voice pack manifest.
 * Manifest entry may be a string path or { path | file | url }.
 * Prefer stationId / id so transfer hubs do not reuse another line's clip.
 * Fallback order: stationId → id → nameZh → nameEn.
 */
export function resolveClipPath(manifest, voice, station) {
  if (!manifest || !voice || voice === "off" || !station) return null;
  const pack = manifest.voices?.[voice];
  if (!pack || typeof pack !== "object") return null;

  const keys = [station.stationId, station.id, station.nameZh, station.nameEn]
    .filter(Boolean)
    .map(String);

  for (const key of keys) {
    const entry = pack[key];
    if (!entry) continue;
    const relative =
      typeof entry === "string" ? entry : entry.path || entry.file || entry.url || null;
    if (!relative) continue;
    if (/^https?:\/\//i.test(relative) || relative.startsWith("/")) {
      return relative;
    }
    return `/audio/${voice}/${relative.replace(/^\.?\//, "")}`;
  }
  return null;
}

export function lineNameLookup(lines = []) {
  return new Map(lines.map((line) => [String(line.lineId), line.lineName]));
}
