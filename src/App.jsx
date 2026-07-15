import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import HomeScreen from "./components/HomeScreen.jsx";
import GameScreen from "./components/GameScreen.jsx";
import ResultScreen from "./components/ResultScreen.jsx";
import { useMapData } from "./hooks/useMapData.js";
import { useAnnouncement } from "./hooks/useAnnouncement.js";
import { getLineRuns, getPlayableStations } from "./lib/map.js";
import { getTypingTarget, isTypingCharacterMatch, isTypingTargetComplete } from "./lib/typing.js";

const TIMED_MS = 30_000;
const STORAGE_THEME = "cd-metro-typing:theme";
const STORAGE_VOICE = "cd-metro-typing:voice";

function readStored(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function computeSpeed(correctChars, elapsedMs) {
  if (elapsedMs <= 0) return { cpm: 0, wpm: 0 };
  const minutes = elapsedMs / 60_000;
  const cpm = Math.round(correctChars / minutes);
  const wpm = Math.round(cpm / 5);
  return { cpm, wpm };
}

function computeAccuracy(correctChars, totalKeystrokes) {
  if (totalKeystrokes <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((correctChars / totalKeystrokes) * 100)));
}

export default function App() {
  const { status, error, lines, mapModel } = useMapData();

  const [screen, setScreen] = useState("home");
  const [theme, setTheme] = useState(() => readStored(STORAGE_THEME, "light"));
  const [voice, setVoice] = useState(() => readStored(STORAGE_VOICE, "off"));
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [runId, setRunId] = useState(null);
  const [direction, setDirection] = useState("forward");
  const [typingLanguage, setTypingLanguage] = useState("zh");
  const [mode, setMode] = useState("line");

  const [stationIndex, setStationIndex] = useState(0);
  const [typedBuffer, setTypedBuffer] = useState("");
  const [composing, setComposing] = useState(false);
  const [correctChars, setCorrectChars] = useState(0);
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [remainingMs, setRemainingMs] = useState(TIMED_MS);
  const [result, setResult] = useState(null);
  const [shake, setShake] = useState(false);

  const inputRef = useRef(null);
  const playableRef = useRef([]);
  const advancingRef = useRef(false);
  const finishedRef = useRef(false);
  const composingRef = useRef(false);
  const typedBufferRef = useRef("");
  const statsRef = useRef({
    correctChars: 0,
    totalKeystrokes: 0,
    startedAt: null,
    mode: "line",
  });
  const announcement = useAnnouncement(voice);

  useEffect(() => {
    document.body.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_THEME, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_VOICE, voice);
    } catch {
      /* ignore */
    }
  }, [voice]);

  const selectedLine = useMemo(
    () => lines.find((line) => line.lineId === selectedLineId) || null,
    [lines, selectedLineId],
  );

  const playableStations = useMemo(() => {
    if (!selectedLine || !runId) return [];
    return getPlayableStations(selectedLine, runId, direction);
  }, [selectedLine, runId, direction]);

  playableRef.current = playableStations;
  typedBufferRef.current = typedBuffer;
  statsRef.current = { correctChars, totalKeystrokes, startedAt, mode };

  const currentStation = playableStations[stationIndex] || null;
  const liveElapsed =
    screen === "game" && startedAt != null ? Math.max(elapsedMs, 1) : Math.max(elapsedMs, 1);
  const { cpm, wpm } = computeSpeed(correctChars, liveElapsed);
  const accuracy = computeAccuracy(correctChars, totalKeystrokes);
  const showSiteChrome = screen !== "game";

  const selectLine = useCallback(
    (lineId) => {
      window.scrollTo({ top: 0 });
      const line = lines.find((item) => item.lineId === lineId);
      setSelectedLineId(lineId);
      const runs = line ? getLineRuns(line) : [];
      setRunId(runs[0]?.id || null);
      setDirection("forward");
    },
    [lines],
  );

  const resetLineSelection = useCallback(() => {
    setSelectedLineId(null);
    setRunId(null);
    setDirection("forward");
  }, []);

  const finishRun = useCallback(
    (completedIndex) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      announcement.stop();
      const {
        correctChars: cc,
        totalKeystrokes: tk,
        startedAt: start,
        mode: gameMode,
      } = statsRef.current;
      const endElapsed = start == null ? 0 : Date.now() - start;
      const speed = computeSpeed(cc, endElapsed || 1);
      setElapsedMs(endElapsed);
      setResult({
        stationsCompleted: completedIndex,
        totalStations: playableRef.current.length,
        elapsedMs: endElapsed,
        cpm: speed.cpm,
        wpm: speed.wpm,
        accuracy: computeAccuracy(cc, tk),
        mode: gameMode,
      });
      setScreen("result");
      advancingRef.current = false;
    },
    [announcement],
  );

  useEffect(() => {
    if (screen !== "game" || startedAt == null) return undefined;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      if (mode === "timed") {
        const remaining = Math.max(0, TIMED_MS - elapsed);
        setRemainingMs(remaining);
        if (remaining <= 0) finishRun(stationIndex);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [screen, startedAt, mode, finishRun, stationIndex]);

  const beginGame = useCallback(async () => {
    if (!selectedLine || !runId) return;
    const stations = getPlayableStations(selectedLine, runId, direction);
    if (!stations.length) return;

    await announcement.unlock();
    announcement.preloadStations(stations);

    advancingRef.current = false;
    finishedRef.current = false;
    composingRef.current = false;
    typedBufferRef.current = "";
    setStationIndex(0);
    setTypedBuffer("");
    setComposing(false);
    setCorrectChars(0);
    setTotalKeystrokes(0);
    setStartedAt(Date.now());
    setElapsedMs(0);
    setRemainingMs(TIMED_MS);
    setResult(null);
    setShake(false);
    setScreen("game");
    queueMicrotask(() => inputRef.current?.focus({ preventScroll: true }));

    announcement.announceStation(stations[0], stations[1] || null);
  }, [announcement, selectedLine, runId, direction]);

  const goToStation = useCallback(
    (nextIndex) => {
      setTypedBuffer("");
      typedBufferRef.current = "";
      if (nextIndex >= playableRef.current.length) {
        finishRun(playableRef.current.length);
        return;
      }
      setStationIndex(nextIndex);
      advancingRef.current = false;
      const stations = playableRef.current;
      announcement.announceStation(stations[nextIndex], stations[nextIndex + 1] || null);
    },
    [announcement, finishRun],
  );

  const triggerShake = useCallback(() => {
    setShake(false);
    requestAnimationFrame(() => setShake(true));
    window.setTimeout(() => setShake(false), 170);
  }, []);

  const handleTypedBufferChange = useCallback(
    (value) => {
      if (screen !== "game" || !currentStation) {
        typedBufferRef.current = value;
        setTypedBuffer(value);
        return;
      }

      if (composingRef.current) {
        typedBufferRef.current = value;
        setTypedBuffer(value);
        return;
      }

      const target = getTypingTarget(currentStation, typingLanguage);
      const prev = typedBufferRef.current;
      const prevChars = [...prev];
      const nextChars = [...value];

      if (nextChars.length > prevChars.length) {
        const added = nextChars.slice(prevChars.length);
        let ok = 0;
        for (let i = 0; i < added.length; i += 1) {
          const expected = [...target][prevChars.length + i];
          if (expected == null) break;
          if (isTypingCharacterMatch(expected, added[i], typingLanguage)) ok += 1;
          else triggerShake();
        }
        setTotalKeystrokes((count) => count + added.length);
        setCorrectChars((count) => count + ok);
      }

      typedBufferRef.current = value;
      setTypedBuffer(value);

      if (!advancingRef.current && isTypingTargetComplete(target, value, typingLanguage)) {
        advancingRef.current = true;
        goToStation(stationIndex + 1);
      }
    },
    [screen, currentStation, typingLanguage, stationIndex, goToStation, triggerShake],
  );

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
    setComposing(true);
  }, []);

  const onCompositionEnd = useCallback(
    (value) => {
      composingRef.current = false;
      setComposing(false);
      handleTypedBufferChange(value);
    },
    [handleTypedBufferChange],
  );

  const backToHome = useCallback(() => {
    announcement.stop();
    finishedRef.current = false;
    setScreen("home");
    resetLineSelection();
  }, [announcement, resetLineSelection]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (screen === "game") {
        event.preventDefault();
        announcement.stop();
        setScreen("home");
      } else if (screen === "result") {
        event.preventDefault();
        backToHome();
      } else if (screen === "home" && selectedLineId) {
        event.preventDefault();
        resetLineSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, announcement, selectedLineId, resetLineSelection, backToHome]);

  return (
    <div className="app-shell">
      <input
        ref={inputRef}
        className="mobile-typing-input"
        type="text"
        value={typedBuffer}
        inputMode="text"
        lang={typingLanguage === "zh" ? "zh-CN" : "en"}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={typingLanguage === "zh" ? "中文站名输入" : "英文站名输入"}
        aria-describedby={screen === "game" ? "typing-instruction" : undefined}
        onChange={(event) => handleTypedBufferChange(event.target.value)}
        onCompositionStart={onCompositionStart}
        onCompositionUpdate={(event) => {
          if (composingRef.current) {
            typedBufferRef.current = event.currentTarget.value;
            setTypedBuffer(event.currentTarget.value);
          }
        }}
        onCompositionEnd={(event) => onCompositionEnd(event.target.value)}
      />

      {showSiteChrome ? (
        <header className="topbar">
          <button className="brand" type="button" onClick={backToHome} aria-label="回到首页">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-text">
              <strong>成都地铁打字</strong>
              <small>Chengdu Metro Typing</small>
            </span>
          </button>
          <div className="top-actions">
            <button
              className="icon-button"
              type="button"
              aria-pressed={theme === "dark"}
              aria-label="切换深色模式"
              onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>
      ) : null}

      <main>
        {screen === "game" && selectedLine ? (
          <GameScreen
            mapModel={mapModel}
            line={selectedLine}
            stations={playableStations}
            mode={mode}
            stationIndex={stationIndex}
            typedBuffer={typedBuffer}
            composing={composing}
            typingLanguage={typingLanguage}
            remainingMs={remainingMs}
            elapsedMs={elapsedMs}
            cpm={cpm}
            wpm={wpm}
            accuracy={accuracy}
            voice={voice}
            shake={shake}
            onBack={() => {
              announcement.stop();
              setScreen("home");
            }}
            onFocusTyping={() => inputRef.current?.focus({ preventScroll: true })}
          />
        ) : null}

        {screen === "result" && selectedLine && result ? (
          <ResultScreen
            elapsedMs={result.elapsedMs}
            stationsCompleted={result.stationsCompleted}
            cpm={result.cpm}
            wpm={result.wpm}
            accuracy={result.accuracy}
            typingLanguage={typingLanguage}
            routeColor={selectedLine.color}
            onBack={backToHome}
            onRetry={beginGame}
          />
        ) : null}

        {screen === "home" ? (
          <HomeScreen
            lines={lines}
            mapModel={mapModel}
            selectedLineId={selectedLineId}
            runId={runId}
            direction={direction}
            mode={mode}
            typingLanguage={typingLanguage}
            voice={voice}
            onSelectLine={selectLine}
            onResetLine={resetLineSelection}
            onChangeRun={setRunId}
            onChangeDirection={setDirection}
            onChangeMode={setMode}
            onChangeLanguage={setTypingLanguage}
            onChangeVoice={setVoice}
            onStart={beginGame}
            loading={status === "loading"}
            error={error}
          />
        ) : null}
      </main>

      {showSiteChrome ? (
        <footer>
          <div className="footer-brand">
            <span className="footer-wordmark">成都地铁打字</span>
            <div className="footer-lines" aria-hidden="true">
              {lines.slice(0, 8).map((line) => (
                <i key={line.lineId} style={{ background: line.color }} />
              ))}
            </div>
          </div>
          <div className="footer-meta">
            <span>
              <span className="footer-label">蓉城</span>
              真实线网 · 双语站名 · 合成报站
            </span>
            <span>四川话报站为测试片段，非官方录音</span>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
