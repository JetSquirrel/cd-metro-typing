import { ArrowLeft, ArrowRight } from "lucide-react";
import MetroMap from "./MetroMap.jsx";
import { getMatchedTypingLength, getTypingTarget } from "../lib/typing.js";

function formatSeconds(total) {
  return Math.max(0, Math.floor(total));
}

const VOICE_STATUS = {
  off: { label: "报站关闭", detail: "静音" },
  mandarin: { label: "普通话报站", detail: "普通话" },
  sichuan: { label: "四川话报站·测试", detail: "四川话·测试" },
};

export default function GameScreen({
  mapModel,
  line,
  stations,
  mode,
  stationIndex,
  typedBuffer,
  composing,
  typingLanguage,
  voice = "off",
  remainingMs,
  elapsedMs,
  cpm,
  wpm,
  accuracy,
  shake,
  onBack,
  onFocusTyping,
}) {
  const station = stations[stationIndex];
  const next = stations[stationIndex + 1] ?? null;
  const destination = stations[stations.length - 1] ?? null;
  const target = getTypingTarget(station, typingLanguage);
  const targetCharacters = [...(target || "")];
  const matchedLength = composing ? 0 : getMatchedTypingLength(target, typedBuffer, typingLanguage);
  const typedIndex = Math.min(matchedLength, targetCharacters.length);
  const trainProgress = targetCharacters.length ? typedIndex / targetCharacters.length : 0;
  const isChinese = typingLanguage === "zh";
  const compositionText = composing ? typedBuffer : "";
  const voiceStatus = VOICE_STATUS[voice] || VOICE_STATUS.off;
  const timeValue =
    mode === "timed"
      ? formatSeconds((remainingMs ?? 0) / 1000)
      : formatSeconds((elapsedMs ?? 0) / 1000);

  if (!station) return null;

  return (
    <section className="game" style={{ "--active-route": line.color }}>
      <p className="screen-reader-status" aria-live="polite" aria-atomic="true">
        当前到站 {station.nameZh}
        {station.nameEn ? `，${station.nameEn}` : ""}。请输入{" "}
        {isChinese ? station.nameZh : station.nameEn}
        {composing ? "。正在选字" : ""}。报站：{voiceStatus.label}
      </p>
      <MetroMap
        mapModel={mapModel}
        selectedLine={line}
        stations={stations}
        stationIndex={stationIndex}
        trainProgress={trainProgress}
      />
      <div className="game-chrome">
        <button className="back-button" type="button" onClick={onBack}>
          <ArrowLeft size={15} /> 返回选线 <kbd>ESC</kbd>
        </button>
        <div className="game-chrome-end">
          <span
            className={`voice-chip${voice === "sichuan" ? " is-test" : ""}`}
            title={voiceStatus.label}
          >
            {voiceStatus.detail}
          </span>
          <div className="route-pill" style={{ background: line.color }}>
            {line.lineName} · 开往 {destination?.nameZh || "终点"}
          </div>
        </div>
      </div>
      <div className="scorebar">
        <Metric label={mode === "timed" ? "剩余" : "用时"} value={timeValue} unit="秒" />
        <Metric label="到站" value={stationIndex} unit="站" />
        <Metric label="速度" value={isChinese ? cpm : wpm} unit={isChinese ? "CPM" : "WPM"} />
        <Metric label="正确率" value={accuracy} unit="%" />
      </div>
      <article className={`station-card${shake ? " shake" : ""}`} onClick={onFocusTyping}>
        <div className="station-meta">
          <span>{String(stationIndex + 1).padStart(2, "0")}</span>
          <span>
            {station.transferLineIds?.length
              ? `可换乘 ${station.transferLineIds
                  .map((id) =>
                    String(id).toUpperCase().startsWith("S") ? String(id) : `${id}号线`,
                  )
                  .join(" · ")}`
              : "本站无换乘"}
          </span>
        </div>
        <div className="station-main">
          <div>
            <p className="arrive-kicker">
              当前到站 <small>Now arriving</small>
            </p>
            <h2>{station.nameZh}</h2>
            <p className="station-en">{station.nameEn}</p>
            {destination ? <p className="bound-for">本次列车开往 {destination.nameZh}</p> : null}
          </div>
          <div className={`next-station${next ? "" : " is-terminal"}`}>
            <span>{next ? "下一站" : "终点站"}</span>
            <strong>{next?.nameZh ?? "本线终点"}</strong>
            {next?.nameEn ? <em>{next.nameEn}</em> : null}
            {next ? (
              <b>
                <ArrowRight size={22} />
              </b>
            ) : null}
          </div>
        </div>
        <div className={`typing-area${isChinese ? " is-chinese" : ""}`}>
          <div
            className="typing-target"
            style={{
              "--fit-font": `calc((min(760px, 94vw) - 48px) / ${(targetCharacters.length * (isChinese ? 1 : 0.65) || 1).toFixed(2)})`,
            }}
            aria-label={`请输入 ${isChinese ? station.nameZh : station.nameEn}`}
          >
            {targetCharacters.map((character, index) => (
              <span
                key={`${character}-${index}`}
                className={index < typedIndex ? "typed" : index === typedIndex ? "current" : ""}
              >
                {character === " " ? "\u00A0" : character}
              </span>
            ))}
          </div>
          {isChinese ? (
            <p
              id="typing-instruction"
              className={`composition-status${compositionText ? " is-composing" : ""}`}
            >
              {compositionText ? (
                <>
                  选字中 · <strong>{compositionText}</strong>
                </>
              ) : (
                "使用中文输入法选字后上屏"
              )}
            </p>
          ) : (
            <span id="typing-instruction" className="screen-reader-status">
              直接输入画面上的英文站名
            </span>
          )}
        </div>
        <div className="line-strip">
          <i />
          <span>{line.lineName}</span>
        </div>
      </article>
    </section>
  );
}

function Metric({ label, value, unit }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{unit}</span>
    </div>
  );
}
