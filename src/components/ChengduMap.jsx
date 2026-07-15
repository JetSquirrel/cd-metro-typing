import { memo, useEffect, useMemo, useRef, useState } from "react";
import { getRouteViewBoxArray, MAP_VIEWBOX, pointsToString } from "../lib/map.js";

export default memo(function ChengduMap({ mapModel, selectedLineId, onSelect }) {
  const svgRef = useRef(null);
  const [intro, setIntro] = useState(true);

  const selectedRoute = useMemo(
    () => mapModel?.lines?.find((line) => line.lineId === selectedLineId) ?? null,
    [mapModel, selectedLineId],
  );

  const targetViewBox = useMemo(() => {
    if (!selectedRoute) return MAP_VIEWBOX;
    const points = (selectedRoute.stations || [])
      .filter((station) => station.x != null && station.y != null)
      .map((station) => [station.x, station.y]);
    return getRouteViewBoxArray(points, 48, 36);
  }, [selectedRoute]);

  useEffect(() => {
    if (!mapModel?.lines?.length) return undefined;
    const maxSegments = Math.max(
      ...mapModel.lines.map((line) => Math.max(line.polylines?.length || 1, 1)),
    );
    const introDuration = (0.25 + mapModel.lines.length * 0.1 + maxSegments * 0.35 + 1.6) * 1000;
    const timer = setTimeout(() => setIntro(false), introDuration);
    return () => clearTimeout(timer);
  }, [mapModel]);

  useEffect(() => {
    if (selectedLineId) setIntro(false);
  }, [selectedLineId]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const from = (svg.getAttribute("viewBox") ?? MAP_VIEWBOX.join(" ")).split(/\s+/).map(Number);
    const startedAt = performance.now();
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 680;
    let frameId;
    const frame = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      svg.setAttribute(
        "viewBox",
        from.map((value, index) => value + (targetViewBox[index] - value) * eased).join(" "),
      );
      if (progress < 1) frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [targetViewBox]);

  if (!mapModel) return null;

  return (
    <svg
      ref={svgRef}
      className={`chengdu-map${intro ? " intro" : ""}`}
      viewBox={MAP_VIEWBOX.join(" ")}
      role="img"
      aria-label="依真实经纬度绘制的成都地铁线网"
    >
      <defs>
        <filter id="district-shadow" x="-40%" y="-30%" width="180%" height="180%">
          <feDropShadow dx="0" dy="16" stdDeviation="18" floodColor="#39352c" floodOpacity=".12" />
        </filter>
        <pattern id="map-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path
            d="M24 0H0V24"
            fill="none"
            stroke="currentColor"
            strokeOpacity=".055"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect
        className="home-map-grid"
        x="-200"
        y="-120"
        width="1400"
        height="1000"
        fill="url(#map-grid)"
      />
      <g className="chengdu-districts" filter="url(#district-shadow)">
        {(mapModel.districts || []).map((district) => (
          <path key={district.id} d={district.path} aria-label={district.name || undefined} />
        ))}
      </g>
      <g className="home-routes">
        {(mapModel.lines || []).map((line, routeIndex) => {
          const selected = line.lineId === selectedLineId;
          const routeDelay = 0.25 + routeIndex * 0.1;
          const nodes = (line.stations || [])
            .filter((station) => station.x != null && station.y != null)
            .map((station) => [station.x, station.y]);
          return (
            <g
              key={line.lineId}
              className={`home-route${selected ? " selected" : ""}${selectedLineId && !selected ? " muted" : ""}`}
              style={{ "--draw-delay": `${routeDelay.toFixed(2)}s` }}
              role="button"
              tabIndex={0}
              aria-label={`选择${line.lineName}`}
              onClick={() => onSelect?.(line.lineId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect?.(line.lineId);
                }
              }}
            >
              {(line.polylines || []).map((poly, index) => {
                const points = poly.pointsString || pointsToString(poly.points);
                return (
                  <g
                    key={`${line.lineId}-${index}`}
                    style={{
                      "--seg-delay": `${(routeDelay + index * 0.35).toFixed(2)}s`,
                    }}
                  >
                    <polyline className="home-route-hit" points={points} />
                    <polyline className="home-route-casing" pathLength="1" points={points} />
                    <polyline
                      className="home-route-line"
                      pathLength="1"
                      points={points}
                      stroke={line.color}
                    />
                  </g>
                );
              })}
              {selected
                ? nodes.map(([x, y], index) => (
                    <circle key={index} className="home-route-node" cx={x} cy={y} r="3.1" />
                  ))
                : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
});
