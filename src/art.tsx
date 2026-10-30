import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { seedOf } from '../shared/landscape';
import type { Idea, Lot } from '../shared/domain';
import { occupancy, units } from '../shared/domain';
export function Wordmark() {
  return (
    <span role="img" aria-label="Parker" className="wordmark">
      parker.
    </span>
  );
}
export function Vehicle({ truck = false, color = '#387d9f' }: { truck?: boolean; color?: string }) {
  const h = truck ? 76 : 42;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 24 ${h}`}
      className={`vehicle ${truck ? 'truck' : ''}`}
      shapeRendering="crispEdges"
    >
      <path fill="#223336" opacity=".25" d={`M6 4h17v${h - 5}H6z`} />
      <path fill="#1c3036" d={`M5 1h14v2h2v${h - 7}h-2v3H5v-3H3V3h2z`} />
      <path fill="#17272d" d={`M1 8h3v8H1zM20 8h3v8h-3zM1 ${h - 15}h3v8H1zM20 ${h - 15}h3v8h-3z`} />
      <path fill={color} d={`M5 3h14v${h - 7}H5z`} />
      <path fill="#f1efc9" d="M5 4h4v3H5zM15 4h4v3h-4z" />
      <path fill="#d4e5df" opacity=".5" d={`M5 8h2v${h - 15}H5z`} />
      <path fill="#1c3b4b" d="M6 11h12v8H6z" />
      <path fill="#94c0cb" d="M7 12h10v3H7z" />
      <path fill="#507c94" d="M8 15h8v3H8z" />
      <path fill="#f3f3cf" opacity=".35" d="M8 7h8v1H8zM8 9h8v1H8zM7 20h1v5H7z" />
      <path fill="#16343b" opacity=".55" d="M17 20h1v5h-1zM4 18h1v9H4zM19 18h1v9h-1z" />
      <path fill="#d3e2dc" d="M1 17h3v2H1zM20 17h3v2h-3z" />
      {truck ? (
        <>
          <path fill="#283d40" d="M5 26h14v45H5z" />
          <path fill="#c3c6b4" d="M6 28h12v41H6z" />
          <path fill="#e1dfcc" d="M7 28h10v3H7zM7 31h2v35H7z" />
          <path fill="#9da99f" d="M16 31h2v38h-2zM8 66h10v3H8z" />
          <path fill="#aeb7a8" d="M10 34h1v29h-1zM13 34h1v29h-1z" />
        </>
      ) : (
        <>
          <path fill="#74a3ac" d="M6 26h12v7H6z" />
          <path fill="#203e4b" d="M7 27h10v4H7z" />
          <path fill="#d5e4da" opacity=".45" d="M8 20h8v3H8z" />
        </>
      )}
      <path fill="#c16c56" d={`M5 ${h - 6}h4v3H5zM15 ${h - 6}h4v3h-4z`} />
      <path fill="#b3b9a8" d={`M8 ${h - 3}h8v2H8z`} />
    </svg>
  );
}
export function Tree({ x = 0, y = 0, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path fill="#263e2d" opacity=".28" d="M7 29h30v8H7zM30 25h10v9H30z" />
      <path fill="#716849" d="M16 25h5v13h-5z" />
      <path fill="#b19a5a" d="M17 26h2v10h-2z" />
      <path fill="#203f30" d="M9 3h14v3h7v5h4v7h3v10h-6v5h-8v3H10v-4H4v-6H1V15h4V8h4z" />
      <path fill="#355d32" d="M9 5h14v3h6v6h4v12h-5v5H10v-3H5V17h2V10h2z" />
      <path fill="#507535" d="M10 5h12v3h6v8h3v8h-7v5H11v-3H6V16h3z" />
      <path fill="#6f8d3b" d="M10 6h10v3h7v8h-5v6H10v-4H6v-6h4z" />
      <path fill="#91a94c" d="M11 6h8v4h5v6h-7v3H9v-7h2z" />
      <path fill="#b5bd61" d="M12 7h5v4h-5zM9 13h5v4H9zM21 11h3v3h-3z" />
      <path fill="#284e32" d="M24 20h6v7h-8v5h-8v-4h7v-4h3zM4 20h4v7H4z" />
      <path fill="#476c32" d="M13 20h7v5h-7zM27 15h5v5h-5zM8 26h5v4H8z" />
      <path fill="#7e973d" d="M17 18h5v3h-5zM6 18h4v5H6zM13 26h5v3h-5zM26 11h3v4h-3z" />
      <path fill="#d0cc72" d="M12 8h2v2h-2zM10 14h2v2h-2zM19 10h2v2h-2z" />
      <path fill="#3c6231" d="M9 3h4v3H9zM22 5h3v4h-3zM1 17h4v5H1zM30 25h4v4h-4z" />
      <path
        fill="#a2ae51"
        d="M8 10h2v2H8zM15 5h2v1h-2zM19 8h2v1h-2zM23 13h2v2h-2zM7 16h2v1H7zM12 18h2v2h-2zM17 15h2v1h-2zM20 21h2v1h-2zM10 24h2v1h-2z"
      />
      <path
        fill="#536f31"
        d="M14 12h2v2h-2zM20 15h2v1h-2zM25 18h2v3h-2zM9 20h2v2H9zM17 24h2v2h-2zM7 28h2v1H7zM28 23h2v1h-2zM23 28h2v2h-2z"
      />
      <path
        fill="#c9c96b"
        d="M11 9h1v1h-1zM16 8h2v1h-2zM10 15h1v1h-1zM21 12h1v1h-1zM17 18h1v1h-1z"
      />
    </g>
  );
}
export function Building({ x = 0, y = 0 }: { x?: number; y?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path fill="#3c5544" opacity=".25" d="M8 13h85v48H8z" />
      <path fill="#ad9e79" d="M4 13h82v39H4z" />
      <path fill="#d3c295" d="M4 32h82v15H4z" />
      <path fill="#8d9a93" d="M1 4h88v31H1z" />
      <path fill="#c5c9b9" d="M2 2h85v3H2zM2 5h3v27H2z" />
      <path fill="#4e6268" d="M8 8h71v20H8z" />
      <path fill="#55768d" d="M11 9h19v16H11zM33 9h19v16H33zM55 9h20v16H55z" />
      <path fill="#8ba8ae" d="M13 10h15v2H13zM35 10h15v2H35zM57 10h16v2H57z" />
      <path fill="#8b958c" d="M9 31h15v3H9zM67 31h12v3H67z" />
      <path fill="#416a7d" d="M11 38h10v7H11zM29 38h10v7H29zM47 38h10v7H47zM65 38h10v7H65z" />
      <path fill="#abc1be" d="M12 38h8v2h-8zM30 38h8v2h-8zM48 38h8v2h-8zM66 38h8v2h-8z" />
      <path fill="#9e916e" d="M82 34h4v18h-4z" />
    </g>
  );
}
export function CoastArt() {
  return (
    <svg
      className="coast-art"
      viewBox="0 0 180 900"
      preserveAspectRatio="none"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <defs>
        <pattern id="water-pixels" width="67" height="89" patternUnits="userSpaceOnUse">
          <path fill="#3d93b3" d="M5 18h3v2H5zM37 68h4v2h-4zM54 35h2v2h-2z" />
          <path fill="#68b2c9" d="M14 62h6v1h-6zM47 13h4v1h-4z" />
        </pattern>
      </defs>
      <path fill="#197da7" d="M0 0h180v900H0z" />
      <path fill="url(#water-pixels)" d="M0 0h180v900H0z" />
      <path fill="#78bdd0" d="M160 0h20v900h-37v-80h8V710h-9v-90h15V470h-7V350h13V210h-9V100h6z" />
      <path fill="#cce2d8" d="M170 0h10v900h-25v-70h8V710h-9v-90h15V470h-7V350h13V210h-9V100h4z" />
      <path fill="#d0bf91" d="M175 0h5v900h-18v-70h8V710h-9v-90h15V470h-7V350h11V210h-7V100h2z" />
      <g transform="translate(77 290)">
        <path fill="#295b78" opacity=".4" d="M-5 24h25v3H-5z" />
        <path fill="#ede6cb" d="M6 0h2v21H6zM3 4h3v14H-5v-3h3v-5h3V6h2zM9 7h3v5h3v6H9z" />
        <path fill="#c5a878" d="M-4 20h23v3H-4z" />
        <path fill="#365969" d="M0 23h15v2H0z" />
      </g>
      <g transform="translate(133 670)">
        <path fill="#ae9a6b" d="M0 0h38v9H0zM0 4h4v30H0z" />
        <path fill="#d4c39b" d="M2 0h36v3H2zM0 11h4v2H0zM0 22h4v2H0z" />
      </g>
    </svg>
  );
}
export function Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" shapeRendering="crispEdges">
      <path fill="currentColor" d="M10 3h4v3h3v3h3v4h-5v8H9v-8H4V9h3V6h3z" />
    </svg>
  );
}
const colors = ['#287fc0', '#d85c43', '#e0b83f', '#d6ded7', '#4d916a', '#52aeb1'];
export const ideaColor = (idea: Pick<Idea, 'id'>) => colors[seedOf(idea.id) % colors.length];
export function MiniLot({
  lot,
  ideas,
  hidden = new Set<string>(),
  geometry = true,
}: {
  lot: Lot;
  ideas: Idea[];
  hidden?: Set<string>;
  geometry?: boolean;
}) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!tooltip) return;
    const dismiss = () => setTooltip(null);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [tooltip]);
  const parked = ideas
    .filter((i) => i.status === 'parked' && i.lotId === lot.id)
    .sort(
      (a, b) =>
        (a.vehicleSize === b.vehicleSize ? 0 : a.vehicleSize === 'truck' ? -1 : 1) ||
        b.createdAt.localeCompare(a.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const count = occupancy(ideas, lot.id),
    desired = Math.max(lot.capacity ?? Math.max(8, count + 2), count),
    visible = Math.min(12, desired),
    columns = Math.ceil(visible / 2);
  const cells = new Set<number>();
  const slots: { idea?: Idea; span: number; index: number; column: number; row: number }[] = [];
  let used = 0;
  for (const idea of parked) {
    const span = units(idea);
    let index = -1;
    if (span === 2) {
      for (let c = 0; c < columns; c++)
        if (!cells.has(c) && !cells.has(c + columns) && used + 2 <= visible) {
          index = c;
          break;
        }
    } else {
      for (let n = 0; n < columns * 2; n++)
        if (!cells.has(n) && used < visible) {
          index = n;
          break;
        }
    }
    if (index < 0) break;
    cells.add(index);
    if (span === 2) cells.add(index + columns);
    slots.push({ idea, span, index, column: index % columns, row: Math.floor(index / columns) });
    used += span;
  }
  const represented = slots.length;
  for (let index = 0; used < visible && index < columns * 2; index++)
    if (!cells.has(index)) {
      cells.add(index);
      slots.push({ span: 1, index, column: index % columns, row: Math.floor(index / columns) });
      used++;
    }
  return (
    <div className="mini-world" data-lot-geometry={geometry ? lot.id : undefined}>
      <svg
        className="plot-art"
        viewBox="0 0 320 190"
        preserveAspectRatio="none"
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
        <path fill="#526f42" opacity=".35" d="M6 27h311v142H6z" />
        <path fill="#b3b699" d="M7 25h304v141H7z" />
        <path fill="#777c70" d="M12 30h294v131H12z" />
        <path fill="#646c61" d="M15 33h288v124H15z" />
        <path fill="#909485" d="M12 159h294v5H12z" />
        {Array.from({ length: 62 }, (_, n) => (
          <path
            key={n}
            fill={n % 2 ? '#929582' : '#515f55'}
            opacity=".3"
            d={`M${19 + ((n * 43) % 278)} ${37 + ((n * 31) % 116)}h${(n % 3) + 1}v1h-${(n % 3) + 1}z`}
          />
        ))}
        {Array.from({ length: 11 }, (_, n) => (
          <g key={`hedge-${n}`} transform={`translate(${12 + n * 28} 16)`}>
            <path fill="#3b6340" d="M0 2h20v9H0z" />
            <path fill="#749344" d="M2 0h14v6H2z" />
            <path fill="#a1af58" d="M4 1h4v2H4z" />
          </g>
        ))}
        <Tree x={251} y={-8} scale={0.78} />
        <Tree x={278} y={-5} scale={0.68} />
        <Tree x={0} y={-1} scale={1} />
        <Tree x={33} y={-4} scale={1.1} />
        <Tree x={282} y={153} scale={1.05} />
        <Tree x={4} y={153} scale={1.05} />
        {/* Layered planting along the curb echoes the wooded lots in the drawings.
            The centre remains clear for the real vehicles and capacity markings. */}
        {[39, 70, 102, 133].map((y, index) => (
          <g key={`verge-${y}`}>
            <Tree x={-8} y={y} scale={index % 2 ? 0.62 : 0.72} />
            <Tree x={298} y={y + 5} scale={index % 2 ? 0.72 : 0.62} />
          </g>
        ))}
        <path fill="#c6ba6c" d="M1 64h3v2H1zM7 95h2v3H7zM310 89h3v2h-3zM306 137h3v3h-3z" />
      </svg>
      <div
        className="parking-grid"
        style={{
          gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`,
          maxWidth: `${columns * 46}px`,
        }}
        aria-hidden="true"
      >
        {slots.map((s) => (
          <div
            key={s.idea?.id ?? `empty-${s.index}`}
            className={`parking-space ${s.span === 2 ? 'wide' : ''} ${lot.capacity !== null && s.index >= lot.capacity ? 'overflow-space' : ''}`}
            style={{ gridColumn: s.column + 1, gridRow: `${s.row + 1} / span ${s.span}` }}
          >
            {s.idea && (
              <span
                onMouseEnter={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setTooltip({
                    text: s.idea!.title,
                    x: Math.max(
                      12,
                      Math.min(window.innerWidth - 232, rect.left + rect.width / 2 - 110),
                    ),
                    y: rect.top - 10,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
                data-spot={geometry ? s.idea.id : undefined}
                style={{ visibility: hidden.has(s.idea.id) ? 'hidden' : 'visible' }}
              >
                <Vehicle truck={s.span === 2} color={ideaColor(s.idea)} />
              </span>
            )}
          </div>
        ))}
      </div>
      {tooltip &&
        createPortal(
          <span className="car-caption" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            {tooltip.text}
          </span>,
          document.body,
        )}
      <div className="access-lane" data-lane={geometry ? lot.id : undefined} aria-hidden="true">
        <span />
      </div>
      {(parked.length > represented || desired > visible) && (
        <span className="preview-count">
          {parked.length > represented
            ? `+${parked.length - represented} cars`
            : `+${desired - visible} spaces`}
        </span>
      )}
    </div>
  );
}
export function Scenery({ seed = 0 }: { seed?: number }) {
  return (
    <div className="scenery" aria-hidden="true">
      <svg viewBox="0 0 320 35" shapeRendering="crispEdges">
        <path fill="#b4b99c" d="M0 14h320v5H0z" />
        <Tree x={seed % 2 ? 42 : 25} y={-1} scale={0.85} />
        <Tree x={seed % 2 ? 258 : 274} y={-1} scale={0.85} />
        <path fill="#66874b" d="M93 11h14v6H93zM207 11h15v6h-15z" />
        <path fill="#91ae55" d="M95 9h10v4H95zM209 9h11v4h-11z" />
      </svg>
    </div>
  );
}

/** Low-rise neighborhood buildings, drawn on the same grid as the parking art. */
export function Office({ variant = 0 }: { variant?: number }) {
  if (variant === 1)
    return (
      <g shapeRendering="crispEdges">
        <path fill="#314936" opacity=".3" d="M13 16h125v77H13z" />
        <path fill="#b28d5b" d="M5 13h125v70H5z" />
        <path fill="#dbc49a" d="M3 9h129v56H3z" />
        <path fill="#8b8d7f" d="M7 13h121v48H7z" />
        <path fill="#b4b5a3" d="M8 13h119v3H8zM8 16h3v44H8z" />
        {[17, 43, 69, 95].map((x) => (
          <g key={x}>
            <path fill="#5e706f" d={`M${x} 23h18v25h-18z`} />
            <path fill="#adc1bd" d={`M${x + 2} 25h14v8h-14zM${x + 2} 36h14v9h-14z`} />
          </g>
        ))}
        <path fill="#8d6d49" d="M5 64h125v5H5zM123 69h7v14h-7z" />
        <path fill="#49616a" d="M16 71h25v11H16zM51 71h25v11H51zM86 71h25v11H86z" />
        <path fill="#bcc5ba" d="M16 71h25v2H16zM51 71h25v2H51zM86 71h25v2H86z" />
        <path fill="#ded0ac" d="M12 84h104v5H12z" />
      </g>
    );
  if (variant === 3)
    return (
      <g shapeRendering="crispEdges">
        <path fill="#314936" opacity=".3" d="M12 15h126v77H12z" />
        <path fill="#c8bc9b" d="M4 10h125v72H4z" />
        <path fill="#dcd5bd" d="M2 7h129v25H2zM2 30h36v42H2zM94 30h37v42H94z" />
        <path fill="#667d84" d="M6 11h121v17H6zM6 28h28v40H6zM98 28h29v40H98z" />
        <path fill="#adc0bd" d="M8 12h116v2H8zM8 30h2v35H8zM100 30h2v35h-2z" />
        <path fill="#88a16b" d="M40 35h51v46H40z" />
        <path fill="#d2c59a" d="M61 35h8v51h-8zM40 56h51v6H40z" />
        <path fill="#3c5e65" d="M9 74h9v6H9zM23 74h9v6h-9zM101 74h9v6h-9zM115 74h9v6h-9z" />
        <Tree x={39} y={33} scale={0.55} />
        <Tree x={73} y={58} scale={0.48} />
      </g>
    );
  const walls = ['#c6b68b', '#b89264', '#c5c0a2'][variant];
  return (
    <g shapeRendering="crispEdges">
      <path fill="#324836" opacity=".3" d="M16 17h121v76H16z" />
      <path fill={walls} d="M8 12h122v70H8z" />
      <path fill="#8b876d" d="M123 18h7v64h-7zM8 75h122v7H8z" />
      <path fill="#d8ceb0" d="M6 9h126v52H6z" />
      <path fill={variant === 1 ? '#7d817d' : '#73828a'} d="M10 13h118v44H10z" />
      <path fill="#a7ada4" d="M10 13h118v3H10zM10 16h3v41h-3z" />
      <path fill="#485d66" d="M19 22h75v24H19z" />
      <path
        fill={variant === 1 ? '#9ba7a7' : '#426d88'}
        d="M21 24h21v19H21zM45 24h21v19H45zM69 24h21v19H69z"
      />
      <path fill="#99b4be" d="M22 25h18v2H22zM46 25h18v2H46zM70 25h18v2H70z" />
      <path
        fill="#8ca3ac"
        opacity=".7"
        d="M31 26h1v16h-1zM55 26h1v16h-1zM79 26h1v16h-1zM22 33h18v1H22zM46 33h18v1H46zM70 33h18v1H70z"
      />
      <path fill="#4e6064" d="M103 21h14v10h-14zM103 39h14v10h-14z" />
      <path fill="#c0c5b9" d="M101 19h14v9h-14zM101 37h14v9h-14z" />
      <path fill="#82928d" d="M104 21h8v1h-8zM104 24h8v1h-8zM104 39h8v1h-8zM104 42h8v1h-8z" />
      {[17, 38, 80, 101].map((x) => (
        <g key={x}>
          <path fill="#365966" d={`M${x} 64h14v10h-14z`} />
          <path fill="#a3c3c8" d={`M${x + 1} 64h12v2h-12z`} />
        </g>
      ))}
      <path fill="#31515a" d="M59 63h13v19H59z" />
      <path fill="#839f9e" d="M61 65h9v14h-9z" />
      <path fill="#e1d5af" d="M54 82h24v4H54zM51 86h30v4H51z" />
      {variant === 2 && (
        <>
          <path fill="#b6ad8c" d="M0 29h42v53H0z" />
          <path fill="#d7ccb1" d="M0 24h45v34H0z" />
          <path fill="#7b8987" d="M3 27h39v27H3z" />
          <path fill="#455f6a" d="M9 33h25v14H9z" />
          <path fill="#a0b3b5" d="M10 34h23v2H10z" />
          <path fill="#3c606b" d="M6 65h10v10H6zM24 65h10v10H24z" />
        </>
      )}
      {variant === 1 && (
        <>
          <path fill="#a8754c" d="M6 59h126v4H6z" />
          <path fill="#d3c19b" d="M81 73h31v12H81z" />
          <path fill="#668082" d="M84 75h25v8H84z" />
        </>
      )}
    </g>
  );
}
