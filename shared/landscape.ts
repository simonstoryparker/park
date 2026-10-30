import type { Lot } from './domain';
export function seedOf(value: string) {
  let n = 2166136261;
  for (const c of value) {
    n ^= c.charCodeAt(0);
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}
export function noise(seed: number, index: number) {
  let x = (seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x21f0aaad);
  x ^= x >>> 15;
  x = Math.imul(x, 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}
function terrainNoise(seed: number, y: number, span: number) {
  const cell = Math.floor(y / span),
    fraction = y / span - cell;
  const mix = fraction * fraction * (3 - 2 * fraction);
  return noise(seed, cell) * (1 - mix) + noise(seed, cell + 1) * mix;
}
// World geometry never depends on scroll. Three seeded scales form headlands,
// sheltered coves and small irregular edges without a repeating sine wave.
export function coastX(y: number, width: number, _scrollTop = 0) {
  const narrow = width < 700;
  const base = narrow ? (width < 360 ? 27 : 46) : width < 1000 ? 54 : 142;
  const spread = narrow ? (width < 360 ? 24 : 38) : width < 1000 ? 44 : 116;
  return (
    base +
    spread *
      ((terrainNoise(181, y, 510) - 0.5) * 0.72 +
        (terrainNoise(97, y, 173) - 0.5) * 0.5 +
        (terrainNoise(712, y, 41) - 0.5) * 0.12)
  );
}
export function shoreLimit(y: number, height: number, width: number) {
  let max = 0;
  for (let at = y - 16; at <= y + height + 16; at += 8) max = Math.max(max, coastX(at, width));
  return max;
}
export const roadOffset = (width: number) => (width < 1000 ? 18 : 38);
export type WorldPlot = { x: number; y: number; width: number; height: number; seed: number };
export type WorldBuilding = {
  x: number;
  y: number;
  width: number;
  height: number;
  variant: number;
  seed: number;
};
export function chronologicalLots(lots: Lot[]) {
  return [...lots].sort((a, b) =>
    a.id === 'drop-off'
      ? -1
      : b.id === 'drop-off'
        ? 1
        : a.id === 'general'
          ? -1
          : b.id === 'general'
            ? 1
            : (a.startOn ?? '').localeCompare(b.startOn ?? '') ||
              a.sortOrder - b.sortOrder ||
              a.id.localeCompare(b.id),
  );
}
export function worldLayout(lots: Lot[], width: number, heights: Map<string, number> = new Map()) {
  const mobile = width < 1000;
  const positions = new Map<string, WorldPlot>();
  const buildings: WorldBuilding[] = [];
  const streets: { x1: number; x2: number; y: number }[] = [];
  const columns =
    width < 700 ? 1 : width < 1000 ? 2 : Math.max(1, Math.min(3, Math.floor((width - 240) / 360)));
  const offset = roadOffset(width);
  // A parcel is a real gap in the content, with its own road frontage.
  const parcel = (top: number, seed: number) => {
    const frontageY = top + 92;
    const left = shoreLimit(top, 115, width) + offset + 22;
    const available = width - left - 24;
    const count = Math.max(1, Math.floor(available / (mobile ? 150 : 225)));
    const pitch = available / count;
    for (let i = 0; i < count; i++) {
      const w = Math.min(pitch - 20, (mobile ? 94 : 122) + noise(seed, i) * 42);
      const h = (mobile ? 54 : 65) + noise(seed, i + 30) * 14;
      buildings.push({
        x: left + i * pitch + 8 + noise(seed, i + 10) * Math.max(0, pitch - w - 28),
        y: top + 3 + noise(seed, i + 20) * 16,
        width: w,
        height: h,
        variant: (seed + i) % 4,
        seed: seed + i,
      });
    }
    streets.push({ x1: coastX(frontageY, width) + offset, x2: width - 16, y: frontageY });
  };
  // The upper neighborhood is visible behind the compact floating navigation.
  parcel(-14, 84);
  let cursor = 132;
  if (lots.some((l) => l.id === 'general' && !l.isArchived)) {
    const height = Math.max(110, heights.get('general') ?? 110);
    const x = shoreLimit(cursor, height, width) + offset + 24;
    const listWidth = Math.min(width < 700 ? 560 : 570, width - x - 24);
    positions.set('general', { x, y: cursor, width: listWidth, height, seed: seedOf('general') });
    if (width >= 1000 && width - x - listWidth > 230) {
      const bx = x + listWidth + 64;
      for (let n = 0; n < Math.max(1, Math.floor(height / 145)); n++) {
        buildings.push({
          x: bx + (n % 2) * 38,
          y: cursor + 8 + n * 145,
          width: 146,
          height: 84,
          variant: n % 4,
          seed: 62 + n,
        });
        streets.push({ x1: bx - 20, x2: width - 16, y: cursor + 112 + n * 145 });
      }
    }
    cursor += height + 24;
  }
  parcel(cursor, 113);
  cursor += 142;
  const sorted = chronologicalLots(lots.filter((l) => !l.isArchived && l.id !== 'general'));
  for (let index = 0; index < sorted.length; index += columns) {
    const group = sorted.slice(index, index + columns);
    const bandHeight = Math.max(...group.map((l) => Math.max(275, heights.get(l.id) ?? 275)));
    const left = shoreLimit(cursor, bandHeight, width) + offset + 24;
    const available = width - left - 26;
    const pitch = Math.min(360, (available + 28) / columns);
    const plotWidth = Math.min(320, pitch - 28);
    group.forEach((lot, column) =>
      positions.set(lot.id, {
        x: left + column * pitch,
        y: cursor,
        width: plotWidth,
        height: heights.get(lot.id) ?? 275,
        seed: seedOf(lot.id),
      }),
    );
    streets.push({ x1: coastX(cursor + 234, width) + offset, x2: width - 16, y: cursor + 234 });
    cursor += bandHeight + 42;
    parcel(cursor, seedOf(group[0].id));
    cursor += 142;
  }
  return { positions, buildings, streets, height: Math.max(1100, cursor + 220), width };
}
export function coastalPath(height: number, width: number, offset = 0, scrollTop = 0) {
  const steps = Math.ceil(height / 18),
    delta = height / steps;
  const at = (y: number) =>
    coastX(y, width) + (offset < 0 ? offset * (0.65 + terrainNoise(402, y, 131) * 0.7) : offset);
  let d = `M ${at(0)} 0`;
  for (let n = 0; n < steps; n++) {
    const y = n * delta,
      end = (n + 1) * delta,
      x = at(y),
      x2 = at(end),
      dx = (at(y + 1) - at(y - 1)) / 2,
      dx2 = (at(end + 1) - at(end - 1)) / 2;
    d += ` C ${x + (dx * delta) / 3} ${y + delta / 3},${x2 - (dx2 * delta) / 3} ${end - delta / 3},${x2} ${end}`;
  }
  return d;
}
