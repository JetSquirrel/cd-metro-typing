import { useCallback, useEffect, useRef } from "react";
import { resolveClipPath } from "../lib/audio.js";

const MANIFEST_URL = "/audio/manifest.json";

/**
 * Voice announcement playback.
 * - Unlock audio on start()
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

  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) manifestRef.current = data;
      })
      .catch(() => {
        if (!cancelled) manifestRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  const preload = useCallback((url) => {
    if (!url || cacheRef.current.has(url)) return;
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = url;
    cacheRef.current.set(url, audio);
    audio.load();
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
      const url = resolveClipPath(manifest, voice, station);
      const nextUrl = nextStation ? resolveClipPath(manifest, voice, nextStation) : null;

      if (nextUrl) preload(nextUrl);
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
    },
    [preload, voice],
  );

  const preloadStations = useCallback(
    (stations = []) => {
      if (!voice || voice === "off") return;
      const manifest = manifestRef.current;
      for (const station of stations.slice(0, 3)) {
        const url = resolveClipPath(manifest, voice, station);
        if (url) preload(url);
      }
    },
    [preload, voice],
  );

  return {
    unlock,
    stop,
    announceStation,
    preloadStations,
  };
}
