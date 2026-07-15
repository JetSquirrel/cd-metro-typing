import { useEffect, useState } from "react";
import { buildMapModel } from "../lib/map.js";

const METRO_URL = "/data/chengdu-metro.json";
const DISTRICTS_URL = "/data/chengdu-districts.topo.json";

export function useMapData() {
  const [state, setState] = useState({
    status: "loading",
    error: null,
    metro: null,
    topology: null,
    mapModel: null,
    lines: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [metroRes, topoRes] = await Promise.all([fetch(METRO_URL), fetch(DISTRICTS_URL)]);
        if (!metroRes.ok) {
          throw new Error(`Failed to load metro data (${metroRes.status})`);
        }
        if (!topoRes.ok) {
          throw new Error(`Failed to load district map (${topoRes.status})`);
        }
        const metro = await metroRes.json();
        const topology = await topoRes.json();
        const lines = metro.lines || [];
        const mapModel = buildMapModel(topology, lines);
        if (!cancelled) {
          setState({
            status: "ready",
            error: null,
            metro,
            topology,
            mapModel,
            lines,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
