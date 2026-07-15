import { ArrowLeft, ArrowRight } from "lucide-react";
import MetroMap from "./MetroMap.jsx";
import { getTypingTarget } from "../lib/typing.js";

function formatSeconds(total) {
  return Math.max(0, Math.floor(total));
}

export default function GameScreen({
  mapModel,
  line,
  stations,
  mode,
  stationIndex,
  typedBuffer,
  composing,
  typingLanguage,
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
  const target = getTypingTarget(station, typingLanguage);
  const targetCharacters = [...(target || "")];
  const typedCharacters = composing ? [] : [...(typedBuffer || "")];
  const typedIndex = composing ? 0 : Math.min(typedCharacters.length, targetCharacters.length);
  const trainProgress = targetCharacters.length ? typedIndex / targetCharacters.length : 0;
  const isChinese = typingLanguage === "zh";
  const compositionText = composing ? typedBuffer : "";
  const timeValue =
    mode === "timed"
      ? formatSeconds((remainingMs ?? 0) / 1000)
      : formatSeconds((elapsedMs ?? 0) / 1000);

  if (!station) return null;

  return (
    <section className="game" style={{ "--active-route": line.color }}>
      <p className="screen-reader-status" aria-live="polite" aria-atomic="true">
        目前车站 {station.nameZh}，请输入 {isChinese ? station.nameZh : station.nameEn}
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
        <div className="route-pill" style={{ background: line.color }}>
          {line.lineName} · 往 {stations[stations.length - 1]?.nameZh}
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
              ? `换乘 ${station.transferLineIds
                  .map((id) =>
                    String(id).toUpperCase().startsWith("S") ? String(id) : `${id}号线`,
                  )
                  .join(" · ")}`
              : "本站无换乘"}
          </span>
        </div>
        <div className="station-main">
          <div>
            <p>NOW ARRIVING</p>
            <h2>{station.nameZh}</h2>
          </div>
          <div className={`next-station${next ? "" : " is-terminal"}`}>
            <span>{next ? "下一站" : "终点站"}</span>
            <strong>{next?.nameZh ?? "本线终点"}</strong>
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
                "使用输入法选字"
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
