import { RotateCcw } from "lucide-react";

export default function ResultScreen({
  elapsedMs,
  stationsCompleted,
  cpm,
  wpm,
  accuracy,
  typingLanguage,
  routeColor,
  onBack,
  onRetry,
}) {
  const elapsed = Math.max(0, Math.floor((elapsedMs || 0) / 1000));
  const speed = typingLanguage === "zh" ? cpm : wpm;
  const speedUnit = typingLanguage === "zh" ? "CPM" : "WPM";
  const smooth = accuracy >= 95;

  return (
    <section className="results" style={{ "--result-route": routeColor }}>
      <div className="result-card">
        <span className="result-kicker">稳稳到站</span>
        <h2>{smooth ? "这趟跑得很顺。" : "这趟到站了。"}</h2>
        <p>
          用时 {elapsed} 秒，走过 {stationsCompleted} 站。
        </p>
        <div className="result-metrics">
          <div>
            <strong>{stationsCompleted}</strong>
            <span>通过站数</span>
          </div>
          <div>
            <strong>{speed}</strong>
            <span>平均 {speedUnit}</span>
          </div>
          <div>
            <strong>{accuracy}%</strong>
            <span>正确率</span>
          </div>
        </div>
        <div className="result-actions">
          <button className="secondary-button" type="button" onClick={onBack}>
            返回成都全图
          </button>
          <button className="start-button" type="button" onClick={onRetry}>
            <span>再跑一趟</span>
            <b>
              <RotateCcw size={19} />
            </b>
          </button>
        </div>
      </div>
    </section>
  );
}
