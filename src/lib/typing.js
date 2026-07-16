export const TYPING_LANGUAGES = [
  { id: "en", labelZh: "英文站名", labelEn: "English" },
  { id: "zh", labelZh: "中文站名", labelEn: "Chinese" },
];

/** Language-aware typing target. English uses `target` (normalized); Chinese uses 站名. */
export function getTypingTarget(station, typingLanguage = "en") {
  if (!station) return "";
  if (typingLanguage === "zh") return station.nameZh || "";
  if (station.target) return String(station.target);
  return station.nameEn || station.nameZh || "";
}

/**
 * Normalize committed input before comparison.
 * - Collapse whitespace runs
 * - Strip zero-width / BOM characters
 * - NFC normalize for CJK compatibility
 */
export function normalizeCommittedText(text) {
  if (text == null) return "";
  return String(text)
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Character-level match used while typing.
 * EN: case-insensitive. ZH: exact after NFC + strip zero-width.
 */
export function isTypingCharacterMatch(expectedChar, typedChar, typingLanguage = "en") {
  if (expectedChar == null || typedChar == null) return false;
  const expected = String(expectedChar)
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "");
  const typed = String(typedChar)
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "");
  if (typingLanguage === "zh") return expected === typed;
  return expected.toLocaleLowerCase("en") === typed.toLocaleLowerCase("en");
}

/** Full-string match after normalize; EN ignores case. */
export function isTypingTargetComplete(target, committed, typingLanguage = "en") {
  const left = normalizeCommittedText(target);
  const right = normalizeCommittedText(committed);
  if (typingLanguage === "zh") return left === right;
  return left.toLocaleLowerCase("en") === right.toLocaleLowerCase("en");
}

/**
 * Length of the correct prefix of committed input.
 * Wrong characters do not count toward train / progress advancement.
 */
export function getMatchedTypingLength(target, committed, typingLanguage = "en") {
  if (!target) return 0;
  const targetChars = [...String(target)];
  const typedChars = [...String(committed ?? "")];
  let matched = 0;
  while (
    matched < typedChars.length &&
    matched < targetChars.length &&
    isTypingCharacterMatch(targetChars[matched], typedChars[matched], typingLanguage)
  ) {
    matched += 1;
  }
  return matched;
}

/**
 * Score newly committed characters since the previous committed buffer.
 * `prev` must be the last *committed* value (not IME preview), otherwise
 * Chinese composition can look "already typed" and skip scoring on compositionend.
 */
export function scoreCommittedDelta(target, prev, next, typingLanguage = "en") {
  const prevChars = [...String(prev ?? "")];
  const nextChars = [...String(next ?? "")];
  if (nextChars.length <= prevChars.length) {
    return { added: 0, correct: 0, hasWrong: false };
  }
  const added = nextChars.slice(prevChars.length);
  const targetChars = [...String(target ?? "")];
  let correct = 0;
  let hasWrong = false;
  for (let i = 0; i < added.length; i += 1) {
    const expected = targetChars[prevChars.length + i];
    if (expected == null) break;
    if (isTypingCharacterMatch(expected, added[i], typingLanguage)) correct += 1;
    else hasWrong = true;
  }
  return { added: added.length, correct, hasWrong };
}
