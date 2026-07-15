import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAnnouncementText, resolveClipPath, lineNameLookup } from "./audio.js";

describe("buildAnnouncementText", () => {
  it("omits transfer sentence when alone", () => {
    const text = buildAnnouncementText({ nameZh: "天府广场", transferLineIds: [] });
    assert.equal(text, "前方到站，天府广场。");
  });

  it("lists transfers with line names", () => {
    const lookup = lineNameLookup([
      { lineId: "1", lineName: "1号线" },
      { lineId: "2", lineName: "2号线" },
    ]);
    const text = buildAnnouncementText({ nameZh: "天府广场", transferLineIds: ["2"] }, lookup);
    assert.match(text, /可换乘2号线/);
  });
});

describe("resolveClipPath", () => {
  const manifest = {
    voices: {
      sichuan: {
        天府广场: { path: "/audio/sichuan/1-07.wav" },
        "1-07": { path: "/audio/sichuan/1-07.wav" },
        "2-12": { path: "/audio/sichuan/2-12.wav" },
      },
    },
  };

  it("prefers stationId over shared Chinese name at transfer hubs", () => {
    const path = resolveClipPath(manifest, "sichuan", {
      stationId: "2-12",
      nameZh: "天府广场",
    });
    assert.equal(path, "/audio/sichuan/2-12.wav");
  });

  it("falls back to Chinese name when stationId missing from pack", () => {
    const path = resolveClipPath(manifest, "sichuan", {
      stationId: "7-99",
      nameZh: "天府广场",
    });
    assert.equal(path, "/audio/sichuan/1-07.wav");
  });

  it("returns null when muted or missing", () => {
    assert.equal(resolveClipPath(manifest, "off", { nameZh: "天府广场" }), null);
    assert.equal(resolveClipPath(manifest, "mandarin", { nameZh: "天府广场" }), null);
  });
});
