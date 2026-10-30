import { expect, it } from 'vitest';
import { general, demoLot } from '../shared/domain';
import { coastX, coastalPath, worldLayout, shoreLimit, roadOffset } from '../shared/landscape';

it.each([320, 390, 699, 700, 768, 999, 1000, 1280, 1440])(
  'keeps complete content and buildings on land at %ipx',
  (width) => {
    const lots = [
      general('geometry'),
      ...Array.from({ length: 50 }, (_, n) => ({
        ...demoLot('geometry'),
        id: `lot-${n}`,
        sortOrder: n,
        name: `Lot ${n}`,
      })),
    ];
    const tall = new Map([
      ['general', 2200],
      ['lot-1', 1100],
    ]);
    const layout = worldLayout(lots, width, tall);
    expect(layout.positions.size).toBe(51);
    for (const p of layout.positions.values()) {
      expect(p.x).toBeGreaterThanOrEqual(shoreLimit(p.y, p.height, width) + roadOffset(width) + 23);
      expect(p.x + p.width).toBeLessThanOrEqual(width - 24);
      expect(p.width).toBeGreaterThan(190);
    }
    for (const b of layout.buildings) {
      expect(b.x).toBeGreaterThan(shoreLimit(b.y, b.height, width) + roadOffset(width));
      expect(b.x + b.width).toBeLessThan(width - 15);
      for (const p of layout.positions.values()) {
        const intersects =
          b.x < p.x + p.width &&
          b.x + b.width > p.x &&
          b.y < p.y + p.height &&
          b.y + b.height > p.y;
        expect(intersects).toBe(false);
      }
    }
    expect(new Set(layout.buildings.map((b) => b.variant)).size).toBeGreaterThan(2);
    expect(worldLayout(lots, width, tall)).toEqual(layout);
  },
);
it('does not shift terrain with scrolling and does not repeat a regular wave', () => {
  expect(coastalPath(3000, 390, 0, 700)).toBe(coastalPath(3000, 390));
  expect(coastX(150, 390, 700)).toBe(coastX(150, 390));
  const deltas = [0, 500, 1000, 1500, 2000].map((y) => coastX(y + 100, 1440) - coastX(y, 1440));
  expect(new Set(deltas.map((n) => Math.round(n))).size).toBeGreaterThan(3);
});
