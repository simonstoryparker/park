import { describe, it, expect } from 'vitest';
import {
  general,
  demoLot,
  addDays,
  effectiveRevisitOn,
  isReady,
  canParkInLot,
  occupancy,
  displaySlots,
  nextSlot,
  lotSchema,
  type Idea,
} from '../shared/domain';
import { inferLot, parseLotInput, parseIdeaInput, parseDate } from '../shared/parser';
const item = (patch: Partial<Idea> = {}): Idea => ({
  id: crypto.randomUUID(),
  ownerId: 'a',
  originalText: 'thought',
  title: 'thought',
  notes: '',
  status: 'parked',
  kind: 'idea',
  vehicleSize: 'compact',
  lotId: 'general',
  revisitOn: null,
  datePrecision: null,
  dateLabel: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  activatedAt: null,
  archivedAt: null,
  archiveReason: null,
  serverVersion: 0,
  ...patch,
});
describe('local calendar and deterministic parsing', () => {
  it('parses the binding surgery example and DST calendar days', () => {
    expect(parseLotInput('post surgery for 2 weeks starting tuesday max 5', '2026-10-26')).toEqual({
      name: 'post surgery',
      startOn: '2026-10-27',
      endExclusive: '2026-11-10',
      capacity: 5,
      capacityPolicy: 'soft',
      warnings: [],
    });
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });
  it.each([
    ['robotics max 3', 'robotics', null, null, 3],
    [
      'winter break starting december 20 for 2 weeks max 4',
      'winter break',
      '2026-12-20',
      '2027-01-03',
      4,
    ],
    ['school', 'school', null, null, null],
    ['summer ideas starting june 1', 'summer ideas', '2027-06-01', null, null],
    ['finals week until november 20', 'finals week', null, '2026-11-21', null],
    ['photography with 5 spots', 'photography', null, null, 5],
  ])('parses %s', (s, name, start, end, capacity) => {
    const p = parseLotInput(s as string, '2026-10-26');
    expect([p.name, p.startOn, p.endExclusive, p.capacity, p.warnings]).toEqual([
      name,
      start,
      end,
      capacity,
      [],
    ]);
  });
  it('preserves quoted names, December names and rejects ambiguity', () => {
    expect(parseLotInput('"December lot" max 3', '2026-10-26').name).toBe('December lot');
    expect(parseLotInput('December experiments', '2026-10-26').name).toBe('December experiments');
    for (const s of [
      'ideas starting 11/12',
      'ideas max 0',
      'ideas max -3',
      'ideas starting february 30',
      'ideas for 2 weeks until november 1',
      'ideas max 2 limit 3',
    ])
      expect(parseLotInput(s, '2026-10-26').warnings.length).toBeGreaterThan(0);
  });
  it('distinguishes next weekday, inclusive boundaries and implicit start', () => {
    expect(parseDate('tuesday', '2026-10-27')).toBe('2026-10-27');
    expect(parseDate('next tuesday', '2026-10-27')).toBe('2026-11-03');
    expect(parseLotInput('a for 2 days', '2026-10-26').startOn).toBe('2026-10-26');
  });
  it.each([
    ['Read in december', '2026-12-01'],
    ['Read after december', '2027-01-01'],
    ['Read next week', '2026-11-02'],
    ['Read tomorrow', '2026-10-27'],
    ['Read in 2 weeks', '2026-11-09'],
    ['Read on november 20', '2026-11-20'],
    ['Read someday', null],
  ])('parses trailing revisit %s', (s, date) =>
    expect(parseIdeaInput(s, '2026-10-26').revisitOn).toBe(date),
  );
  it('keeps quoted text, personal events and deadline text literal', () => {
    for (const s of ['"Read tomorrow"', 'finish by Friday', 'Read after finals'])
      expect(parseIdeaInput(s, '2026-10-26').revisitOn).toBeNull();
  });
});
describe('domain invariants', () => {
  it('readiness inherits the later date without activation', () => {
    const l = { ...general('a'), startOn: '2026-10-27', id: 'lot' };
    const i = item({ lotId: l.id, revisitOn: '2026-12-01' });
    expect(effectiveRevisitOn(i, l)).toBe('2026-12-01');
    expect(isReady(i, l, '2026-11-10')).toBe(false);
    expect(isReady(i, l, '2026-12-01')).toBe(true);
    expect(isReady(i, { ...l, isArchived: true }, '2026-12-01')).toBe(false);
    expect(i.status).toBe('parked');
  });
  it('weights trucks and permits departures/edits over capacity', () => {
    const l = { ...general('a'), id: 'x', capacity: 3, capacityPolicy: 'strict' as const };
    const a = item({ lotId: 'x', vehicleSize: 'truck' }),
      b = item({ lotId: 'x' });
    expect(occupancy([a, b], 'x')).toBe(3);
    expect(canParkInLot(l, [a, b], item({ lotId: 'x' }))).toContain('strict');
    expect(canParkInLot({ ...l, capacity: 1 }, [a, b], a, a)).toBeNull();
    expect(canParkInLot(l, [a, b], { ...a, status: 'active' }, a)).toBeNull();
    expect(occupancy([{ ...a, status: 'active' }, b], 'x')).toBe(1);
  });
  it('has strict field validation and protects General', () => {
    expect(lotSchema.safeParse({ ...general('a'), capacity: 100 }).success).toBe(false);
  });
  it('reserves requested/archived slots before resolving collisions', () => {
    const lots = [
      { ...general('a'), id: 'a', sortOrder: 0 },
      { ...general('a'), id: 'b', sortOrder: 0 },
      { ...general('a'), id: 'c', sortOrder: 1, isArchived: true },
    ];
    expect([...displaySlots(lots)]).toEqual([
      ['a', 0],
      ['b', 2],
      ['c', 1],
    ]);
    expect(nextSlot(lots)).toBe(3);
    expect([...displaySlots([...lots].reverse())]).toEqual([...displaySlots(lots)]);
  });
});

describe('lot inference', () => {
  const base = demoLot('a');
  const garden = {
    ...base,
    id: 'garden',
    name: 'Garden',
    startOn: '2026-11-20',
    endExclusive: '2026-12-01',
    sortOrder: 1,
  };
  const lots = [base, garden];
  it('uses names ahead of dates or the current lot', () => {
    expect(inferLot('Call school AFTER BREAK!', lots, 'garden', '2026-11-22')?.id).toBe(
      'after-break',
    );
    expect(inferLot('Visit the garden', lots)?.id).toBe('garden');
    expect(inferLot('Visit a kindergarten', lots)?.id).toBe('after-break');
  });
  it('matches dates to the most recent applicable lot window', () => {
    expect(inferLot('Plant bulbs', lots, 'after-break', '2026-11-21')?.id).toBe('garden');
    expect(inferLot('Plant bulbs', lots, 'after-break', '2026-12-01')?.id).toBe('after-break');
  });
  it('uses context as fallback and excludes archived and ended lots', () => {
    expect(inferLot('Buy bulbs', lots, 'garden')?.id).toBe('garden');
    expect(inferLot('Garden', [base, { ...garden, isArchived: true }], 'garden')?.id).toBe(
      'after-break',
    );
    expect(inferLot('Garden', lots, 'garden', null, '2026-12-02')?.id).toBe('after-break');
  });
  it('seeds the dated default lot', () => {
    expect(base.name).toBe('After break');
    expect(base.startOn).toBe('2026-11-10');
  });
});

describe('natural capture routing', () => {
  it.each([
    ['english outline tomorrow', 'english outline', '2026-10-27'],
    ['tomorrow english outline', 'english outline', '2026-10-27'],
    ['tomorrow: english outline', 'english outline', '2026-10-27'],
    ['English outline Friday', 'English outline', '2026-10-30'],
    ['English outline on Friday', 'English outline', '2026-10-30'],
    ['Journal today', 'Journal', '2026-10-26'],
    ['Journal 2026-11-02', 'Journal', '2026-11-02'],
    ['Journal November 2', 'Journal', '2026-11-02'],
    ['Journal next month', 'Journal', '2026-11-01'],
    ['Journal in 3 days', 'Journal', '2026-10-29'],
  ])('extracts %s without losing the thought', (input, title, date) => {
    expect(parseIdeaInput(input, '2026-10-26')).toMatchObject({ title, revisitOn: date });
  });
  it.each([
    'Friday night lights',
    'finish by Friday',
    'ideas on February 30',
    'plans in 999999 weeks',
    'Read after finals',
  ])('leaves ambiguous text intact: %s', (input) => {
    expect(parseIdeaInput(input, '2026-10-26')).toMatchObject({ title: input, revisitOn: null });
  });
});
