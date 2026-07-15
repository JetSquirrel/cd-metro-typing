import { getRouteViewBoxArray, pointsToString } from "../lib/map.js";

export default function MetroMap({
  mapModel,
  selectedLine,
  stations,
  stationIndex,
  trainProgress = 0,
}) {
  if (!mapModel || !selectedLine) {
    return <div className="metro-map metro-map--empty" />;
  }

  const route = mapModel.lines.find((item) => item.lineId === selectedLine.lineId) || null;
  if (!route) return <div className="metro-map metro-map--empty" />;

  const routePoints = stations
    .map((station) => route.pointsById?.get(String(station.stationId ?? station.id)))
    .filter(Boolean);
  const routeViewBox = getRouteViewBoxArray(routePoints.length ? routePoints : [[0, 0]], 44, 40);
  // Bias the frame upward so the station card doesn't cover the active stretch.
  routeViewBox[1] += routeViewBox[3] * 0.12;
  const viewBox = routeViewBox.join(" ");

  const nextIndex = stationIndex + 1 < stations.length ? stationIndex + 1 : null;
  const currentId = String(stations[stationIndex]?.stationId ?? stations[stationIndex]?.id ?? "");
  const nextId =
    nextIndex == null
      ? currentId
      : String(stations[nextIndex]?.stationId ?? stations[nextIndex]?.id ?? "");
  const currentPoint = route.pointsById?.get(currentId);
  const nextPoint = route.pointsById?.get(nextId) || currentPoint;

  if (!currentPoint) return <div className="metro-map metro-map--empty" />;

  const journeyProgress = nextIndex == null ? 0 : Math.min(Math.max(trainProgress, 0), 1);
  const train = [
    currentPoint[0] + (nextPoint[0] - currentPoint[0]) * journeyProgress,
    currentPoint[1] + (nextPoint[1] - currentPoint[1]) * journeyProgress,
  ];

  const progressPoints = stations
    .slice(0, stationIndex + 1)
    .map((station) => route.pointsById?.get(String(station.stationId ?? station.id)))
    .filter(Boolean);
  if (journeyProgress > 0) progressPoints.push(train);

  return (
    <svg className="metro-map" viewBox={viewBox} aria-hidden="true">
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
            r="3.2"
          />
        );
      })}
      <g className="map-train" style={{ transform: `translate(${train[0]}px, ${train[1]}px)` }}>
        <g className="map-train-icon" transform="scale(1)">
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
