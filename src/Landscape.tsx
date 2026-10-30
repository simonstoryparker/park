import type { Lot } from '../shared/domain';
import {
  coastX as terrainCoastX,
  coastalPath as terrainCoastalPath,
  noise,
  roadOffset,
  worldLayout,
} from '../shared/landscape';
import { Office, Tree } from './art';

export function LandscapeArt({
  lots,
  width,
  layout = worldLayout(lots, width),
}: {
  lots: Lot[];
  width: number;
  layout?: ReturnType<typeof worldLayout>;
}) {
  const coastX = terrainCoastX;
  const coastalPath = (height: number, w: number, offset = 0) =>
    terrainCoastalPath(height, w, offset);
  const h = layout.height,
    mobile = width < 1000;
  const coast = coastalPath(h, width),
    offset = roadOffset(width);
  const positions = [...layout.positions];
  const parkingPositions = positions.filter(([id]) => id !== 'general');
  const clearing = layout.positions.get('general');
  const clearingBottom = clearing ? clearing.y + clearing.height + 8 : 0;
  const road = coastalPath(h, width, offset);
  const inlandRoadX = width - 9;
  const streets = layout.streets.map((s) => `M${s.x1} ${s.y}H${inlandRoadX}`);
  const roads = [road, `M${inlandRoadX} 0V${h}`, ...streets];
  const scenery = Array.from({ length: Math.ceil(h / 42) }, (_, n) => {
    const y = n * 42 + noise(24, n) * 23;
    const shore = coastX(y, width);
    const trees = Array.from({ length: mobile ? 8 : 26 }, (_, k) => {
      const x = shore + offset + 18 + noise(n + 418, k) * (width - shore - 25);
      const inLot = positions.some(
        ([id, p]) =>
          x > p.x - 44 &&
          x < p.x + p.width + 20 &&
          y > p.y - 62 &&
          y < (id === 'general' ? clearingBottom : p.y + p.height + 16),
      );
      const inStreet = layout.streets.some((s) => Math.abs(y + 18 - s.y) < 36 && x + 35 > s.x1);
      const inBuilding = layout.buildings.some(
        (b) =>
          x + 42 > b.x - 10 &&
          x < b.x + b.width + 12 &&
          y + 46 > b.y - 10 &&
          y < b.y + b.height + 24,
      );
      if (inLot || inStreet || inBuilding || x + 40 > inlandRoadX - 14 || x < shore + offset + 18)
        return null;
      return <Tree key={k} x={x} y={y} scale={0.7 + noise(n + 90, k) * 0.7} />;
    });
    return <g key={n}>{trees}</g>;
  });
  return (
    <svg
      className="world-art"
      viewBox={`0 0 ${width} ${h}`}
      width={width}
      height={h}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <defs>
        <pattern id="world-grass" width="83" height="97" patternUnits="userSpaceOnUse">
          <path fill="#94a16b" d="M0 0h83v97H0z" />
          <path fill="#a4af79" d="M3 12h8v3H3zM34 51h12v4H34zM59 21h7v2h-7zM17 80h11v3H17z" />
          <path fill="#88985f" d="M18 32h6v2h-6zM51 70h8v3h-8zM72 89h5v2h-5z" />
        </pattern>
        <pattern id="world-water" width="113" height="127" patternUnits="userSpaceOnUse">
          <path fill="#167fac" d="M0 0h113v127H0z" />
          <path fill="#258fb8" d="M4 12h12v2H4zM39 66h9v2h-9zM76 37h13v2H76zM12 111h16v2H12z" />
          <path fill="#80c4d5" d="M22 80h4v1h-4zM50 8h3v1h-3zM94 104h5v1h-5z" />
        </pattern>
        <pattern id="sand-grain" width="19" height="31" patternUnits="userSpaceOnUse">
          <path fill="#b39c6b" d="M3 5h2v2H3zM13 22h3v1h-3z" />
        </pattern>
      </defs>
      <path fill="url(#world-grass)" d={`M0 0h${width}v${h}H0z`} />
      {/* The Drop-off is a meadow, not asphalt or a UI card. Its soft, irregular
          boundary is painted into the terrain; interactive rows remain real HTML. */}
      {clearing && (
        <path
          fill="#94a16b"
          d={`M${clearing.x - 10} ${clearing.y - 20}
        Q${clearing.x + 90} ${clearing.y - 36} ${clearing.x + clearing.width - 14} ${clearing.y - 16}
        Q${clearing.x + clearing.width + 20} ${clearing.y + 15} ${clearing.x + clearing.width + 8} ${clearingBottom - 20}
        Q${clearing.x + clearing.width - 40} ${clearingBottom + 3} ${clearing.x + 10} ${clearingBottom}
        Q${clearing.x - 22} ${clearingBottom - 20} ${clearing.x - 10} ${clearing.y - 20} Z`}
        />
      )}
      <path fill="url(#world-water)" d={`${coast} L0 ${h} L0 0 Z`} />
      <path
        fill="none"
        stroke="#309ab9"
        strokeWidth={mobile ? 26 : 48}
        d={coastalPath(h, width, mobile ? -14 : -25)}
      />
      <path
        fill="none"
        stroke="#6abcc9"
        strokeWidth={mobile ? 11 : 20}
        d={coastalPath(h, width, mobile ? -8 : -16)}
      />
      <path
        data-shore="true"
        fill="none"
        stroke="#e3ce96"
        strokeWidth={mobile ? 13 : 24}
        d={coast}
      />
      <path fill="none" stroke="url(#sand-grain)" strokeWidth={mobile ? 13 : 24} d={coast} />
      <path
        fill="none"
        stroke="#e7eee0"
        strokeWidth="2"
        strokeDasharray="13 4 3 7"
        d={coastalPath(h, width, mobile ? -9 : -15)}
      />
      {Array.from({ length: Math.ceil(h / 79) }, (_, n) => {
        const y = n * 79 + noise(912, n) * 24,
          x = coastX(y, width) - 5;
        return (
          <g key={`shore-rock-${n}`} transform={`translate(${x} ${y})`}>
            <path fill="#9e9c7b" d="M0 1h7v3h3v5H1v-2H-2V3H0z" />
            <path fill="#cfca9e" d="M0 1h6v2H0zM-1 3h3v2H-1z" />
          </g>
        );
      })}
      {Array.from({ length: Math.floor(h / 850) }, (_, n) => {
        const y = 660 + n * 850,
          x = coastX(y, width);
        return (
          <g key={`pier-${n}`} transform={`translate(${x} ${y})`}>
            <path fill="#745e3e" opacity=".3" d="M-42 5h51v12h-51z" />
            <path fill="#b68f58" d="M-45 0h52v9h-52zM-45 -12h8v31h-8z" />
            <path fill="#dcc08a" d="M-45 0h52v2h-52zM-45 -12h2v31h-2z" />
            <path fill="#8d7046" d="M-29 2h1v7h-1zM-17 2h1v7h-1zM-5 2h1v7h-1z" />
          </g>
        );
      })}
      {/* Draw every curb before the asphalt so intersections remain open. */}
      {roads.map((d, n) => (
        <path
          key={`curb-${n}`}
          fill="none"
          stroke="#b5b59a"
          strokeWidth={mobile ? 18 : 30}
          strokeLinejoin="round"
          d={d}
        />
      ))}
      {roads.map((d, n) => (
        <path
          key={`road-${n}`}
          fill="none"
          stroke="#6b7066"
          strokeWidth={mobile ? 12 : 23}
          strokeLinejoin="round"
          d={d}
        />
      ))}
      {roads.map((d, n) => (
        <path
          key={`line-${n}`}
          fill="none"
          stroke="#d4ccaa"
          strokeWidth="1"
          strokeDasharray={mobile ? '5 11' : '9 15'}
          d={d}
        />
      ))}
      {parkingPositions.map(([id, p]) => (
        <g key={id}>
          <circle
            data-road-for={id}
            cx={coastX(p.y + 234, width) + offset}
            cy={p.y + 234}
            r="1"
            fill="transparent"
          />
          {Array.from({ length: mobile ? 7 : 12 }, (_, n) => {
            const x = p.x + 5 + (n * (p.width - 20)) / (mobile ? 6 : 11);
            return (
              <g key={n}>
                <Tree
                  x={x}
                  y={p.y + 267 + noise(p.seed, n) * 8}
                  scale={0.65 + noise(p.seed, n + 12) * 0.3}
                />
                <rect
                  x={x + 7}
                  y={p.y + 277}
                  width="3"
                  height="2"
                  fill={n % 3 ? '#d4bd65' : '#d2a691'}
                />
              </g>
            );
          })}
        </g>
      ))}
      {scenery}
      {layout.buildings.map((b, n) => (
        <g key={`building-${n}`} data-scenery-building={b.variant}>
          <path
            fill="#c5bb94"
            d={`M${b.x - 5} ${b.y + b.height - 12}h${b.width + 10}v24h-${b.width + 10}Z`}
          />
          <g transform={`translate(${b.x} ${b.y}) scale(${b.width / 140} ${b.height / 100})`}>
            <Office variant={b.variant} />
          </g>
        </g>
      ))}
      {layout.streets.map((s, n) => (
        <g key={`crossing-${n}`} fill="#d5d1b8" opacity=".8">
          {Array.from({ length: 4 }, (_, i) => (
            <rect
              key={i}
              x={s.x1 + 15 + i * 4}
              y={s.y - (mobile ? 5 : 10)}
              width="2"
              height={mobile ? 10 : 20}
            />
          ))}
        </g>
      ))}
      {Array.from({ length: Math.ceil(h / 540) }, (_, n) => {
        const y = n * 540 + 260,
          x = Math.max(14, coastX(y, width) - (mobile ? 35 : 90));
        return (
          <g key={`boat-${n}`} transform={`translate(${x} ${y}) scale(${mobile ? 0.65 : 1})`}>
            <path fill="#216783" d="M-9 36h40v3H-9zM-15 42h25v2h-25z" />
            <path
              fill="#f6eed5"
              d="M10 0h2v30h-2zM8 5h2v22H-3v-4H0v-6h3v-5h3V7h2zM13 7h4v7h4v12h-8z"
            />
            <path fill="#ac774e" d="M-1 30h27v3H-1z" />
            <path fill="#e0c99e" d="M3 29h19v2H3z" />
          </g>
        );
      })}
    </svg>
  );
}
