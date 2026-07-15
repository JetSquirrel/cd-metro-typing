import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TYPING_LANGUAGES,
  getTypingTarget,
  normalizeCommittedText,
  isTypingCharacterMatch,
  isTypingTargetComplete,
  getMatchedTypingLength,
} from "./typing.js";

describe("TYPING_LANGUAGES", () => {
  it("includes en and zh", () => {
    assert.deepEqual(TYPING_LANGUAGES.map((item) => item.id).sort(), ["en", "zh"]);
  });
});

describe("getTypingTarget", () => {
  const station = {
    nameZh: "天府广场",
    nameEn: "Tianfu Square",
    target: "Custom Target",
  };

  it("uses English target for en, Chinese name for zh", () => {
    assert.equal(getTypingTarget(station, "en"), "Custom Target");
    assert.equal(getTypingTarget(station, "zh"), "天府广场");
  });

  it("falls back to language name", () => {
    const plain = { nameZh: "春熙路", nameEn: "Chunxi Road" };
    assert.equal(getTypingTarget(plain, "en"), "Chunxi Road");
    assert.equal(getTypingTarget(plain, "zh"), "春熙路");
  });
});

describe("normalizeCommittedText", () => {
  it("trims and collapses whitespace", () => {
    assert.equal(normalizeCommittedText("  Tianfu   Square  "), "Tianfu Square");
  });

  it("strips zero-width characters and NFC-normalizes", () => {
    const raw = "天\u200B府\uFEFF广\u200D场";
    assert.equal(normalizeCommittedText(raw), "天府广场");
  });
});

describe("isTypingCharacterMatch", () => {
  it("matches English case-insensitively", () => {
    assert.equal(isTypingCharacterMatch("T", "t", "en"), true);
    assert.equal(isTypingCharacterMatch("a", "A", "en"), true);
    assert.equal(isTypingCharacterMatch("a", "b", "en"), false);
  });

  it("matches Chinese exactly after normalize", () => {
    assert.equal(isTypingCharacterMatch("府", "府", "zh"), true);
    assert.equal(isTypingCharacterMatch("府", "路", "zh"), false);
    assert.equal(isTypingCharacterMatch("府", "\u200B府", "zh"), true);
  });
});

describe("isTypingTargetComplete", () => {
  it("completes English ignoring case and outer spaces", () => {
    assert.equal(isTypingTargetComplete("Tianfu Square", "  tianfu square ", "en"), true);
  });

  it("completes Chinese exactly after normalize", () => {
    assert.equal(isTypingTargetComplete("天府广场", "天府广场", "zh"), true);
    assert.equal(isTypingTargetComplete("天府广场", "天府广", "zh"), false);
  });
});

describe("getMatchedTypingLength", () => {
  it("stops before the first wrong character so train progress does not advance", () => {
    assert.equal(getMatchedTypingLength("天府广场", "天府", "zh"), 2);
    assert.equal(getMatchedTypingLength("天府广场", "天府路", "zh"), 2);
    assert.equal(getMatchedTypingLength("Tianfu", "Tiax", "en"), 3);
  });

  it("counts a full correct prefix", () => {
    assert.equal(getMatchedTypingLength("春熙路", "春熙路", "zh"), 3);
    assert.equal(getMatchedTypingLength("ABC", "abc", "en"), 3);
  });
});
