import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHENGDU_BOUNDS,
  ROUTE_DIRECTIONS,
  getLineRuns,
  getPlayableStations,
  getRouteViewBox,
  getRouteViewBoxArray,
  getOverlayAwareRouteViewBox,
  getFollowingCameraViewBox,
  sliceRouteCameraPoints,
  pointsToString,
  buildMapModel,
  MAP_VIEWBOX,
} from "./map.js";

const sampleLine = {
  id: "line-1",
  lineId: "1",
  lineName: "1号线",
  lineNameEn: "Line 1",
  color: "#10069F",
  stations: [
    {
      id: "s1",
      stationId: "s1",
      sequence: 1,
      nameZh: "韦家碾",
      nameEn: "Weijianian",
      lat: 30.72,
      lon: 104.08,
      transferLineIds: [],
    },
    {
      id: "s2",
      stationId: "s2",
      sequence: 2,
      nameZh: "升仙湖",
      nameEn: "Shengxian Lake",
      lat: 30.707,
      lon: 104.081,
      transferLineIds: [],
    },
    {
      id: "s3",
      stationId: "s3",
      sequence: 3,
      nameZh: "火车北站",
      nameEn: "North Railway Station",
      lat: 30.698,
      lon: 104.071,
      transferLineIds: ["7"],
    },
    {
      id: "s4",
      stationId: "s4",
      sequence: 4,
      nameZh: "天府广场",
      nameEn: "Tianfu Square",
      lat: 30.66,
      lon: 104.064,
      transferLineIds: ["2"],
    },
  ],
  segments: [
    ["s1", "s2", "s3", "s4"],
    ["s2", "s3"],
  ],
  mapSegments: [["s1", "s2", "s3", "s4"]],
};

describe("ROUTE_DIRECTIONS", () => {
  it("has forward and reverse", () => {
    assert.deepEqual(ROUTE_DIRECTIONS.map((d) => d.id).sort(), ["forward", "reverse"]);
  });
});

describe("CHENGDU_BOUNDS", () => {
  it("covers Chengdu metro extent", () => {
    assert.ok(CHENGDU_BOUNDS.minLon < CHENGDU_BOUNDS.maxLon);
    assert.ok(CHENGDU_BOUNDS.minLat < CHENGDU_BOUNDS.maxLat);
    assert.ok(CHENGDU_BOUNDS.minLon <= 103.7);
    assert.ok(CHENGDU_BOUNDS.maxLon >= 104.8);
  });
});

describe("getLineRuns", () => {
  it("builds substantive runs and drops tiny shuttle stubs", () => {
    const runs = getLineRuns(sampleLine);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].stationIds.length, 4);
    assert.match(runs[0].labelZh, /韦家碾/);
    assert.match(runs[0].labelZh, /天府广场/);
  });
});

describe("getPlayableStations", () => {
  it("includes every station and respects reverse", () => {
    const runs = getLineRuns(sampleLine);
    const forward = getPlayableStations(sampleLine, runs[0].id, "forward");
    assert.deepEqual(
      forward.map((s) => s.stationId),
      ["s1", "s2", "s3", "s4"],
    );

    const reverse = getPlayableStations(sampleLine, runs[0].id, "reverse");
    assert.deepEqual(
      reverse.map((s) => s.stationId),
      ["s4", "s3", "s2", "s1"],
    );
  });
});

describe("pointsToString / getRouteViewBox", () => {
  it("serializes points", () => {
    assert.equal(
      pointsToString([
        [1, 2],
        [3, 4],
      ]),
      "1,2 3,4",
    );
  });

  it("pads route viewBox", () => {
    const box = getRouteViewBox(
      [
        [100, 200],
        [140, 260],
      ],
      10,
    );
    assert.equal(box.minX, 90);
    assert.equal(box.minY, 190);
    assert.equal(box.width, 60);
    assert.equal(box.height, 80);
  });

  it("builds a focused viewBox array tighter than the city frame", () => {
    const focused = getRouteViewBoxArray(
      [
        [120, 180],
        [160, 220],
      ],
      12,
      24,
    );
    assert.equal(focused.length, 4);
    assert.ok(focused[2] < MAP_VIEWBOX[2], "focused width should be smaller than city map");
    assert.ok(focused[3] < MAP_VIEWBOX[3], "focused height should be smaller than city map");
    assert.ok(focused[0] <= 120 - 12);
    assert.ok(focused[1] <= 180 - 12);
  });

  it("expands tall routes so chrome insets leave the line in the middle band", () => {
    // Long N–S corridor similar to Line 5
    const tight = getRouteViewBoxArray(
      [
        [200, 40],
        [210, 520],
      ],
      10,
      24,
    );
    const framed = getOverlayAwareRouteViewBox(
      [
        [200, 40],
        [210, 520],
      ],
      { pad: 10, minSpan: 24, topInset: 0.18, bottomInset: 0.36, sideInset: 0.1 },
    );
    assert.ok(framed[3] > tight[3], "overlay frame should be taller than tight fit");
    assert.ok(framed[1] < tight[1], "should add space above the route");
    assert.ok(framed[2] > tight[2], "should widen skinny N–S corridors");
    const contentBottom = tight[1] + tight[3];
    const frameBottom = framed[1] + framed[3];
    assert.ok(frameBottom > contentBottom, "should add space below the route");
  });

  it("follows a local camera window instead of the full long route", () => {
    const corridor = Array.from({ length: 20 }, (_, index) => [100, index * 30]);
    const windowPoints = sliceRouteCameraPoints(corridor, 4, 2, 5);
    assert.equal(windowPoints.length, 8);
    const full = getFollowingCameraViewBox(corridor, { pad: 8, minSpan: 40 });
    const local = getFollowingCameraViewBox(windowPoints, { pad: 8, minSpan: 40 });
    assert.ok(local[3] < full[3] * 0.6, "local window should be much shorter than full line");
  });
});

describe("buildMapModel", () => {
  it("projects districts and line polylines", () => {
    const topology = {
      type: "Topology",
      objects: {
        districts: {
          type: "GeometryCollection",
          geometries: [
            {
              type: "Polygon",
              properties: { name: "锦江区" },
              arcs: [[0]],
            },
          ],
        },
      },
      arcs: [
        [
          [104.05, 30.64],
          [0.04, 0],
          [0, 0.03],
          [-0.04, 0],
          [0, -0.03],
        ],
      ],
      transform: {
        scale: [1, 1],
        translate: [0, 0],
      },
    };

    const model = buildMapModel(topology, [sampleLine]);
    assert.equal(model.districts.length, 1);
    assert.equal(model.lines.length, 1);
    assert.ok(model.lines[0].polylines[0].points.length >= 2);
    assert.ok(model.lines[0].stations.every((s) => s.x != null && s.y != null));
    const xs = model.lines[0].stations.map((s) => s.x);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 20, "stations should span the map");
  });
});
