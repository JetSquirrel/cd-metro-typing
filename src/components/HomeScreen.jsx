import { ArrowLeft, ArrowRight } from "lucide-react";
import ChengduMap from "./ChengduMap.jsx";
import { getLineRuns, getPlayableStations } from "../lib/map.js";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "英文" },
  { value: "zh", label: "中文" },
];

const GAME_MODE_OPTIONS = [
  { value: "line", label: "全部" },
  { value: "timed", label: "30 秒" },
];

const VOICE_OPTIONS = [
  { value: "off", label: "静音" },
  { value: "mandarin", label: "普通话" },
  { value: "sichuan", label: "四川话" },
];

export default function HomeScreen({
  lines,
  mapModel,
  selectedLineId,
  runId,
  direction,
  mode,
  typingLanguage,
  voice,
  onSelectLine,
  onResetLine,
  onChangeRun,
  onChangeDirection,
  onChangeMode,
  onChangeLanguage,
  onChangeVoice,
  onStart,
  loading,
  error,
}) {
  const selectedLine = lines.find((line) => line.lineId === selectedLineId) || null;
  const runs = selectedLine ? getLineRuns(selectedLine) : [];
  const selectedRun = runs.find((run) => run.id === runId) || runs[0] || null;
  const playableStations = selectedLine
    ? getPlayableStations(selectedLine, selectedRun?.id || runId, direction)
    : [];
  const stationCount = lines.reduce((sum, line) => sum + (line.stations?.length || 0), 0);

  return (
    <section className={`home-map-screen${selectedLine ? " focused" : ""}`}>
      {loading ? (
        <div className="loading">
          <span />
          正在铺开成都线网…
        </div>
      ) : error ? (
        <div className="data-error">
          <strong>线网数据加载失败</strong>
          <span>{error}</span>
        </div>
      ) : (
        <ChengduMap
          mapModel={mapModel}
          selectedLineId={selectedLine?.lineId ?? null}
          onSelect={onSelectLine}
        />
      )}

      <div className="home-copy" aria-hidden={selectedLine ? "true" : undefined}>
        <div className="eyebrow">
          <span /> REAL ROUTES · REAL STATIONS
        </div>
        <h1>
          一站一站，<em>越打越顺。</em>
        </h1>
        <p className="lede">
          在真实成都地图上选择线路，沿着精确站位完成中文或英文站名。每打对一站，列车就往下一站前进。
        </p>
        <div className="home-instruction">
          <b>01</b>
          <span>从地图或下方路线列选择线路</span>
        </div>
        <span className="data-status">
          {lines.length} 条线路 · {stationCount} 笔站位坐标
        </span>
      </div>

      {selectedLine ? (
        <>
          <button className="map-reset" type="button" onClick={onResetLine}>
            <ArrowLeft size={15} /> 返回成都全图 <kbd>ESC</kbd>
          </button>
          <div className="route-focus-card" aria-live="polite">
            <span className="focus-kicker">SELECTED ROUTE</span>
            <div className="focus-route-title">
              <span className="focus-line-code" style={{ "--focus-color": selectedLine.color }}>
                {selectedLine.lineId}
              </span>
              <div>
                <h2>{selectedLine.lineName}</h2>
                <p>
                  {selectedLine.lineNameEn} · {playableStations.length} 站
                </p>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div className="home-control-deck">
        <div className="route-carousel" aria-label="可选择的地铁线路">
          {lines.map((line) => (
            <button
              key={line.lineId}
              className={`route-button${selectedLine?.lineId === line.lineId ? " selected" : ""}`}
              type="button"
              style={{ "--route": line.color }}
              onClick={() => onSelectLine(line.lineId)}
            >
              <span className="route-symbol">{line.lineId}</span>
              <span>
                <strong>{line.lineName}</strong>
                <small>
                  {line.lineNameEn} · {line.stations?.length || 0} 站
                </small>
              </span>
            </button>
          ))}
        </div>

        {selectedLine ? (
          <div className="focus-actions" style={{ "--focus-color": selectedLine.color }}>
            {runs.length > 1 ? (
              <div className="run-picker" aria-label="选择行驶区间">
                <span className="control-label">区间</span>
                <div className="run-options">
                  {runs.map((run) => (
                    <label
                      key={run.id}
                      className={`run-option${(selectedRun?.id || runId) === run.id ? " selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="run"
                        value={run.id}
                        checked={(selectedRun?.id || runId) === run.id}
                        onChange={() => onChangeRun(run.id)}
                      />
                      <span>
                        <b>{run.labelZh}</b>
                        <small>{run.stationIds?.length || 0} 站</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedRun ? (
              <DirectionPicker
                line={selectedLine}
                run={selectedRun}
                value={direction}
                onChange={onChangeDirection}
              />
            ) : null}

            <div className="option-toolbar">
              <SegmentedControl
                label="站名"
                name="typing-language"
                value={typingLanguage}
                onChange={onChangeLanguage}
                options={LANGUAGE_OPTIONS}
              />
              <SegmentedControl
                label="玩法"
                name="mode"
                value={mode}
                onChange={onChangeMode}
                options={GAME_MODE_OPTIONS}
              />
              <SegmentedControl
                label="报站"
                name="voice"
                value={voice}
                onChange={onChangeVoice}
                options={VOICE_OPTIONS}
              />
              <button className="start-button" type="button" onClick={onStart}>
                <span>开始这趟练习</span>
                <b>
                  <ArrowRight size={20} />
                </b>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DirectionPicker({ line, run, value, onChange }) {
  const byId = new Map(
    (line.stations || []).map((station) => [String(station.stationId ?? station.id), station]),
  );
  const stations = (run.stationIds || []).map((id) => byId.get(String(id))).filter(Boolean);
  if (stations.length < 2) return null;
  const firstStation = stations[0];
  const lastStation = stations[stations.length - 1];
  const options = [
    {
      value: "forward",
      origin: firstStation,
      destination: lastStation,
    },
    {
      value: "reverse",
      origin: lastStation,
      destination: firstStation,
    },
  ];

  return (
    <div className="direction-picker" role="radiogroup" aria-label="行驶方向">
      <span className="control-label">方向</span>
      <div className="direction-options">
        {options.map((option) => (
          <label
            key={option.value}
            className={`direction-option${value === option.value ? " selected" : ""}`}
          >
            <input
              type="radio"
              name="direction"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>
              <small>从 {option.origin.nameZh}</small>
              <b>
                往 {option.destination.nameZh}
                <ArrowRight size={14} aria-hidden="true" />
              </b>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SegmentedControl({ label, name, value, onChange, options }) {
  return (
    <div className="segmented-control" role="group" aria-label={label}>
      <span className="control-label">{label}</span>
      <div className="segmented-options">
        {options.map((option) => (
          <label
            key={option.value}
            className={`segment-option${value === option.value ? " selected" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
