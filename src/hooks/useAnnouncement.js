import { useCallback, useEffect, useRef, useState } from "react";
import { getManifestUrl, resolveClipPath } from "../lib/audio.js";

/**
 * Voice announcement playback.
 * - Unlock audio on start()
 * - Wait for manifest ready before resolving clips (queues first station)
 * - Preload current + next station clips
 * - Latest-station-wins: starting a new clip cancels the previous
 * - Silent fail on any media/network error
 */
export function useAnnouncement(voice = "off") {
  const manifestRef = useRef(null);
  const unlockedRef = useRef(false);
  const currentAudioRef = useRef(null);
  const generationRef = useRef(0);
  const cacheRef = useRef(new Map());
  const pendingRef = useRef(null);
  const voiceRef = useRef(voice);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("loading");

  voiceRef.current = voice;

  const preload = useCallback((url) => {
    if (!url || cacheRef.current.has(url)) return;
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = url;
    cacheRef.current.set(url, audio);
    audio.load();
  }, []);

  const playUrl = useCallback((url) => {
    if (!url) return;
    const generation = ++generationRef.current;
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
      } catch {
        /* ignore */
      }
      currentAudioRef.current = null;
    }

    const audio = cacheRef.current.get(url) || new Audio(url);
    cacheRef.current.set(url, audio);
    currentAudioRef.current = audio;

    const play = async () => {
      try {
        audio.currentTime = 0;
        await audio.play();
        if (generation !== generationRef.current) {
          audio.pause();
        }
      } catch {
        /* silent fail */
      }
    };
    play();
  }, []);

  const announceWithManifest = useCallback(
    (manifest, station, nextStation = null, voiceId = voiceRef.current) => {
      if (!voiceId || voiceId === "off" || !station || !manifest) return;
      const url = resolveClipPath(manifest, voiceId, station);
      const nextUrl = nextStation ? resolveClipPath(manifest, voiceId, nextStation) : null;
      if (nextUrl) preload(nextUrl);
      if (!url) return;
      playUrl(url);
    },
    [playUrl, preload],
  );

  useEffect(() => {
    let cancelled = false;
    fetch(getManifestUrl())
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        manifestRef.current = data;
        setReady(true);
        setStatus(data ? "ready" : "empty");
        const pending = pendingRef.current;
        if (pending) {
          pendingRef.current = null;
          announceWithManifest(data, pending.station, pending.nextStation);
        }
      })
      .catch(() => {
        if (cancelled) return;
        manifestRef.current = null;
        setReady(true);
        setStatus("empty");
        pendingRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [announceWithManifest]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  const unlock = useCallback(async () => {
    if (unlockedRef.current) return;
    try {
      const silent = new Audio(
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
      );
      silent.volume = 0.01;
      await silent.play();
      silent.pause();
      unlockedRef.current = true;
    } catch {
      // Autoplay may still be blocked; try again on next user gesture.
    }
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    pendingRef.current = null;
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch {
        /* ignore */
      }
      currentAudioRef.current = null;
    }
  }, []);

  const announceStation = useCallback(
    (station, nextStation = null) => {
      if (!voice || voice === "off" || !station) return;
      const manifest = manifestRef.current;
      if (!ready) {
        pendingRef.current = { station, nextStation };
        return;
      }
      pendingRef.current = null;
      announceWithManifest(manifest, station, nextStation, voice);
    },
    [announceWithManifest, ready, voice],
  );

  const preloadStations = useCallback(
    (stations = []) => {
      if (!voice || voice === "off") return;
      const manifest = manifestRef.current;
      if (!manifest) return;
      for (const station of stations.slice(0, 3)) {
        const url = resolveClipPath(manifest, voice, station);
        if (url) preload(url);
      }
    },
    [preload, voice],
  );

  return {
    ready,
    status,
    unlock,
    stop,
    announceStation,
    preloadStations,
  };
}
