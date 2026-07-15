import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";

/** Approximate Chengdu urban + near-suburb extent for overview framing. */
export const CHENGDU_BOUNDS = {
  minLon: 103.6,
  maxLon: 104.9,
  minLat: 30.2,
  maxLat: 31.1,
};

export const ROUTE_DIRECTIONS = [
  { id: "forward", labelZh: "正向", labelEn: "Outbound" },
  { id: "reverse", labelZh: "反向", labelEn: "Inbound" },
];

const MAP_WIDTH = 960;
const MAP_HEIGHT = 720;
const ROUTE_PAD = 28;

export const MAP_VIEWBOX = [0, 0, MAP_WIDTH, MAP_HEIGHT];

function stationLookup(line) {
  const byId = new Map();
  for (const station of line.stations || []) {
    byId.set(String(station.stationId ?? station.id), station);
  }
  return byId;
}

function terminalsLabel(stations) {
  if (!stations?.length) return { labelZh: "全程", labelEn: "Full run" };
  const first = stations[0];
  const last = stations[stations.length - 1];
  return {
    labelZh: `${first.nameZh} → ${last.nameZh}`,
    labelEn: `${first.nameEn || first.nameZh} → ${last.nameEn || last.nameZh}`,
  };
}

/**
 * Derive playable runs from segments (preferred) or a single full-line run.
 */
export function getLineRuns(line) {
  if (!line) return [];
  if (Array.isArray(line.runs) && line.runs.length) {
    return line.runs.map((run, index) => ({
      id: run.id || `${line.lineId}-run-${index}`,
      labelZh: run.labelZh,
      labelEn: run.labelEn,
      stationIds: (run.stations || run.stationIds || []).map((item) =>
        typeof item === "string" || typeof item === "number"
          ? String(item)
          : String(item.stationId ?? item.id),
      ),
    }));
  }

  const byId = stationLookup(line);
  const segments = line.segments?.length ? line.segments : null;

  if (segments) {
    const runs = segments
      .map((segment, index) => {
        const stationIds = segment.map(String);
        const stations = stationIds.map((id) => byId.get(id)).filter(Boolean);
        const labels = terminalsLabel(stations);
        return {
          id: `${line.lineId}-seg-${index}`,
          labelZh: labels.labelZh,
          labelEn: labels.labelEn,
          stationIds,
        };
      })
      .filter((run) => run.stationIds.length >= 2);

    // Prefer substantive service patterns; drop tiny shuttle stubs when longer runs exist.
    const longRuns = runs.filter((run) => run.stationIds.length >= 3);
    return longRuns.length ? longRuns : runs;
  }

  const sorted = [...(line.stations || [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const stationIds = sorted.map((s) => String(s.stationId ?? s.id));
  const labels = terminalsLabel(sorted);
  return [
    {
      id: `${line.lineId}-main`,
      labelZh: labels.labelZh,
      labelEn: labels.labelEn,
      stationIds,
    },
  ];
}

export function getPlayableStations(line, runId, direction = "forward") {
  if (!line) return [];
  const runs = getLineRuns(line);
  const run = runs.find((item) => item.id === runId) || runs[0];
  if (!run) return [];

  const byId = stationLookup(line);
  let stations = run.stationIds.map((id) => byId.get(String(id))).filter(Boolean);

  if (direction === "reverse") {
    stations = [...stations].reverse();
  }

  // Type every station along the selected run, including the origin.
  return stations;
}

export function pointsToString(points) {
  if (!points?.length) return "";
  return points.map((point) => `${point[0]},${point[1]}`).join(" ");
}

export function getRouteViewBox(points, pad = ROUTE_PAD) {
  if (!points?.length) {
    return {
      minX: 0,
      minY: 0,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const width = Math.max(maxX - minX, 24) + pad * 2;
  const height = Math.max(maxY - minY, 24) + pad * 2;
  return {
    minX: minX - pad,
    minY: minY - pad,
    width,
    height,
    viewBox: `${minX - pad} ${minY - pad} ${width} ${height}`,
  };
}

/** Same as getRouteViewBox but returns `[x, y, w, h]` for animated viewBox lerps. */
export function getRouteViewBoxArray(points, pad = ROUTE_PAD, minSpan = 24) {
  if (!points?.length) return [...MAP_VIEWBOX];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const width = Math.max(maxX - minX, minSpan) + pad * 2;
  const height = Math.max(maxY - minY, minSpan) + pad * 2;
  return [minX - pad, minY - pad, width, height];
}

function createProjection(lines = []) {
  const points = [];
  for (const line of lines) {
    for (const station of line.stations || []) {
      if (station.lon == null || station.lat == null) continue;
      points.push([station.lon, station.lat]);
    }
  }

  // Prefer real station extent; fall back to Chengdu overview box.
  // d3-geo spherical polygons use clockwise exterior rings — CCW collapses the fit.
  const fitGeo =
    points.length >= 2
      ? {
          type: "FeatureCollection",
          features: points.map((coordinates) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates },
          })),
        }
      : {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [CHENGDU_BOUNDS.minLon, CHENGDU_BOUNDS.minLat],
                [CHENGDU_BOUNDS.minLon, CHENGDU_BOUNDS.maxLat],
                [CHENGDU_BOUNDS.maxLon, CHENGDU_BOUNDS.maxLat],
                [CHENGDU_BOUNDS.maxLon, CHENGDU_BOUNDS.minLat],
                [CHENGDU_BOUNDS.minLon, CHENGDU_BOUNDS.minLat],
              ],
            ],
          },
        };

  return geoMercator().fitExtent(
    [
      [36, 36],
      [MAP_WIDTH - 36, MAP_HEIGHT - 36],
    ],
    fitGeo,
  );
}

function projectStation(project, station) {
  if (station.lon == null || station.lat == null) return null;
  const point = project([station.lon, station.lat]);
  if (!point || Number.isNaN(point[0]) || Number.isNaN(point[1])) return null;
  return point;
}

/**
 * Build SVG-ready map model from district topology + metro lines.
 */
export function buildMapModel(topology, lines = []) {
  const project = createProjection(lines);
  const path = geoPath(project);

  let districts = [];
  if (topology?.objects) {
    const objectKey =
      Object.keys(topology.objects).find((key) => /district|county|region|chengdu/i.test(key)) ||
      Object.keys(topology.objects)[0];
    if (objectKey) {
      const collection = feature(topology, topology.objects[objectKey]);
      const features = collection.type === "FeatureCollection" ? collection.features : [collection];
      districts = features.map((feat, index) => ({
        id: feat.id ?? feat.properties?.adcode ?? feat.properties?.name ?? `d-${index}`,
        name: feat.properties?.name || feat.properties?.NAME || "",
        path: path(feat) || "",
      }));
    }
  }

  const mappedLines = (lines || []).map((line) => {
    const byId = stationLookup(line);
    const stations = (line.stations || []).map((station) => {
      const xy = projectStation(project, station);
      return {
        ...station,
        x: xy?.[0] ?? null,
        y: xy?.[1] ?? null,
      };
    });

    const segmentSource =
      line.mapSegments?.length > 0
        ? line.mapSegments
        : line.segments?.length > 0
          ? line.segments
          : [
              [...stations]
                .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
                .map((s) => String(s.stationId ?? s.id)),
            ];

    const polylines = segmentSource.map((segment) => {
      const points = segment
        .map((id) => {
          const station = byId.get(String(id));
          return station ? projectStation(project, station) : null;
        })
        .filter(Boolean);
      return {
        points,
        pointsString: pointsToString(points),
      };
    });

    return {
      id: line.id || line.lineId,
      lineId: line.lineId,
      lineName: line.lineName,
      lineNameEn: line.lineNameEn,
      color: line.color || "#666666",
      stations,
      polylines,
      runs: getLineRuns(line),
      pointsById: new Map(
        stations
          .filter((s) => s.x != null && s.y != null)
          .map((s) => [String(s.stationId ?? s.id), [s.x, s.y]]),
      ),
    };
  });

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
    districts,
    lines: mappedLines,
    project,
  };
}

/** Collect projected points for a run (and optional direction) for route zoom. */
export function getRunProjectedPoints(mappedLine, runId, direction = "forward") {
  if (!mappedLine) return [];
  const run = mappedLine.runs?.find((item) => item.id === runId) || mappedLine.runs?.[0];
  const byId = new Map((mappedLine.stations || []).map((s) => [String(s.stationId ?? s.id), s]));
  let ids = run?.stationIds || mappedLine.stations.map((s) => String(s.stationId ?? s.id));
  if (direction === "reverse") ids = [...ids].reverse();
  return ids
    .map((id) => {
      const station = byId.get(String(id));
      if (station?.x == null || station?.y == null) return null;
      return [station.x, station.y];
    })
    .filter(Boolean);
}
