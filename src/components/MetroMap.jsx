import { useEffect, useMemo, useRef } from "react";
import {
  getFollowingCameraViewBox,
  pointsToString,
  sliceRouteCameraPoints,
} from "../lib/map.js";

function lerpViewBox(from, to, t) {
  return from.map((value, index) => value + (to[index] - value) * t);
}

export default function MetroMap({
  mapModel,
  selectedLine,
  stations,
  stationIndex,
  trainProgress = 0,
}) {
  const svgRef = useRef(null);
  const viewBoxRef = useRef(null);

  const route = useMemo(() => {
    if (!mapModel || !selectedLine) return null;
    return mapModel.lines.find((item) => item.lineId === selectedLine.lineId) || null;
  }, [mapModel, selectedLine]);

  const stationPoints = useMemo(() => {
    if (!route) return [];
    return stations
      .map((station) => route.pointsById?.get(String(station.stationId ?? station.id)))
      .filter(Boolean);
  }, [route, stations]);

  const nextIndex = stationIndex + 1 < stations.length ? stationIndex + 1 : null;
  const currentPoint = stationPoints[stationIndex] || null;
  const nextPoint = (nextIndex == null ? currentPoint : stationPoints[nextIndex]) || currentPoint;
  const journeyProgress = nextIndex == null ? 0 : Math.min(Math.max(trainProgress, 0), 1);
  const train =
    currentPoint && nextPoint
      ? [
          currentPoint[0] + (nextPoint[0] - currentPoint[0]) * journeyProgress,
          currentPoint[1] + (nextPoint[1] - currentPoint[1]) * journeyProgress,
        ]
      : null;

  const targetViewBox = useMemo(() => {
    if (!stationPoints.length || !currentPoint || !nextPoint) return null;
    const focus = [
      currentPoint[0] + (nextPoint[0] - currentPoint[0]) * journeyProgress,
      currentPoint[1] + (nextPoint[1] - currentPoint[1]) * journeyProgress,
    ];
    const windowPoints = sliceRouteCameraPoints(stationPoints, stationIndex, 2, 5, focus);
    return getFollowingCameraViewBox(windowPoints, {
      pad: 28,
      minSpan: 80,
      topInset: 0.14,
      bottomInset: 0.3,
      sideInset: 0.12,
    });
  }, [stationPoints, stationIndex, currentPoint, nextPoint, journeyProgress]);

  const prevStationRef = useRef(stationIndex);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !targetViewBox) return undefined;
    const from = viewBoxRef.current || targetViewBox;
    const stationChanged = prevStationRef.current !== stationIndex;
    prevStationRef.current = stationIndex;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Station hops ease; within-segment typing should track the train tightly.
    const duration = reduce ? 1 : stationChanged ? 480 : 72;
    const startedAt = performance.now();
    let frameId;
    const frame = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const next = lerpViewBox(from, targetViewBox, eased);
      viewBoxRef.current = next;
      svg.setAttribute("viewBox", next.join(" "));
      if (progress < 1) frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [targetViewBox, stationIndex]);

  if (!mapModel || !selectedLine || !route || !currentPoint || !train || !targetViewBox) {
    return <div className="metro-map metro-map--empty" />;
  }

  const progressPoints = stations
    .slice(0, stationIndex + 1)
    .map((station) => route.pointsById?.get(String(station.stationId ?? station.id)))
    .filter(Boolean);
  if (journeyProgress > 0) progressPoints.push(train);

  const initialViewBox = (viewBoxRef.current || targetViewBox).join(" ");

  return (
    <svg ref={svgRef} className="metro-map" viewBox={initialViewBox} aria-hidden="true">
      <g className="game-counties">
        {(mapModel.districts || []).map((district) => (
          <path key={district.id} d={district.path} />
        ))}
      </g>
      {(mapModel.lines || []).map((item) =>
        (item.polylines || []).map((poly, index) => (
          <polyline
            key={`${item.lineId}-${index}`}
            className={`map-line ${item.lineId === route.lineId ? "selected" : "network"}`}
            points={poly.pointsString || pointsToString(poly.points)}
            stroke={item.color}
          />
        )),
      )}
      {(route.polylines || []).map((poly, index) => (
        <polyline
          key={`casing-${index}`}
          className="map-casing"
          points={poly.pointsString || pointsToString(poly.points)}
        />
      ))}
      {(route.polylines || []).map((poly, index) => (
        <polyline
          key={`selected-${index}`}
          className="map-line selected"
          points={poly.pointsString || pointsToString(poly.points)}
          stroke={route.color}
        />
      ))}
      {progressPoints.length >= 2 ? (
        <polyline
          className="map-progress"
          points={pointsToString(progressPoints)}
          stroke={route.color}
        />
      ) : null}
      {(route.stations || []).map((station) => {
        if (station.x == null || station.y == null) return null;
        const id = String(station.stationId ?? station.id);
        const index = stations.findIndex((item) => String(item.stationId ?? item.id) === id);
        const state =
          index < stationIndex && index >= 0
            ? " is-passed"
            : index === stationIndex
              ? " is-current"
              : index === nextIndex
                ? " is-next"
                : "";
        return (
          <circle
            key={id}
            className={`map-node on-route${state}`}
            cx={station.x}
            cy={station.y}
            r="3.6"
          />
        );
      })}
      <g className="map-train" style={{ transform: `translate(${train[0]}px, ${train[1]}px)` }}>
        <g className="map-train-icon" transform="scale(1.15)">
          <circle className="train-halo" r="14" />
          <rect className="train-body" x="-11" y="-7" width="22" height="14" rx="4" />
          <rect className="train-window" x="-7" y="-3.5" width="5" height="4" rx="1" />
          <rect className="train-window" x="2" y="-3.5" width="5" height="4" rx="1" />
          <circle className="train-light" cx="-5.5" cy="4.5" r="1.3" />
          <circle className="train-light" cx="5.5" cy="4.5" r="1.3" />
        </g>
      </g>
    </svg>
  );
}
