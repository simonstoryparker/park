import { z } from 'zod';
export const today = () => localISO(new Date());
export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(s: string, n: number) {
  const [y, m, d] = s.split('-').map(Number);
  return localISO(new Date(y, m - 1, d + n, 12));
}
export function validDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;
}
const date = z.string().refine(validDate, 'Use a valid calendar date').nullable();
const instant = z.string().datetime();
export const nameKey = (s: string) =>
  s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export const lotSchema = z
  .object({
    id: z.string().min(1).max(80),
    ownerId: z.string(),
    name: z.string().trim().min(1).max(120),
    nameKey: z.string(),
    startOn: date,
    endExclusive: date,
    capacity: z.number().int().min(1).max(99).nullable(),
    capacityPolicy: z.enum(['soft', 'strict']),
    accent: z.enum(['blue', 'green', 'gold', 'coral']).nullable(),
    sortOrder: z.number().int().nonnegative(),
    isArchived: z.boolean(),
    endedPromptDismissedFor: date,
    createdAt: instant,
    updatedAt: instant,
    serverVersion: z.number().int().nonnegative().default(0),
  })
  .refine(
    (l) => !l.startOn || !l.endExclusive || l.endExclusive > l.startOn,
    'End must follow start',
  );
export const ideaSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string(),
  originalText: z.string().min(1).max(10000),
  title: z.string().trim().min(1).max(10000),
  notes: z.string().max(20000),
  status: z.enum(['parked', 'active', 'archived']),
  kind: z.enum(['idea', 'task']),
  vehicleSize: z.enum(['compact', 'truck']),
  lotId: z.string().min(1).max(80),
  revisitOn: date,
  datePrecision: z.enum(['day', 'week', 'month']).nullable(),
  dateLabel: z.string().nullable(),
  createdAt: instant,
  updatedAt: instant,
  activatedAt: instant.nullable(),
  archivedAt: instant.nullable(),
  archiveReason: z.enum(['completed', 'dismissed']).nullable(),
  serverVersion: z.number().int().nonnegative().default(0),
});
export type Lot = z.infer<typeof lotSchema>;
export type Idea = z.infer<typeof ideaSchema>;
export const units = (i: Pick<Idea, 'vehicleSize'>) => (i.vehicleSize === 'truck' ? 2 : 1);
export const occupancy = (ideas: Idea[], lotId: string) =>
  ideas.filter((i) => i.lotId === lotId && i.status === 'parked').reduce((s, i) => s + units(i), 0);
export const effectiveRevisitOn = (i: Idea, l: Lot) =>
  [i.revisitOn, l.startOn].filter(Boolean).sort().at(-1) ?? null;
export const isReady = (i: Idea, l: Lot, day = today()) =>
  i.status === 'parked' &&
  !l.isArchived &&
  !!effectiveRevisitOn(i, l) &&
  effectiveRevisitOn(i, l)! <= day;
export const getLotStatus = (l: Lot, day = today()) =>
  l.endExclusive && l.endExclusive <= day
    ? 'Ended'
    : l.startOn && l.startOn > day
      ? 'Upcoming'
      : 'Open';
export function canParkInLot(l: Lot, items: Idea[], next: Idea, previous?: Idea, day = today()) {
  const before = previous?.status === 'parked' && previous.lotId === l.id ? units(previous) : 0;
  const after = next.status === 'parked' ? units(next) : 0;
  if (after <= before) return null;
  if (l.isArchived) return 'Unarchive this lot or choose another lot.';
  if (getLotStatus(l, day) === 'Ended') return 'Extend this lot or choose another lot.';
  if (
    l.capacityPolicy === 'strict' &&
    l.capacity !== null &&
    occupancy(items, l.id) - before + after > l.capacity
  )
    return 'This strict lot has no room. Choose another lot, keep compact, or change the limit.';
  return null;
}
export function general(ownerId: string): Lot {
  const now = new Date().toISOString();
  return {
    id: 'general',
    ownerId,
    name: 'General',
    nameKey: 'general',
    startOn: null,
    endExclusive: null,
    capacity: null,
    capacityPolicy: 'soft',
    accent: 'blue',
    sortOrder: 0,
    isArchived: false,
    endedPromptDismissedFor: null,
    createdAt: now,
    updatedAt: now,
    serverVersion: 0,
  };
}
export function demoLot(ownerId: string): Lot {
  return {
    ...general(ownerId),
    id: 'after-break',
    name: 'After break',
    nameKey: 'after break',
    startOn: '2026-11-10',
    sortOrder: 1,
  };
}
export function assertGeneral(l: Lot) {
  if (
    l.id === 'general' &&
    (l.name !== 'General' ||
      l.capacity !== null ||
      l.startOn ||
      l.endExclusive ||
      l.isArchived ||
      l.capacityPolicy !== 'soft' ||
      l.sortOrder !== 0)
  )
    throw new Error('General stays unlimited, open, and available.');
}
export function displaySlots(lots: Lot[]) {
  const sorted = [...lots].sort((a, b) => a.id.localeCompare(b.id));
  const reserved = new Set(lots.map((l) => l.sortOrder));
  const used = new Set<number>();
  const result = new Map<string, number>();
  for (const l of sorted) {
    let s = l.sortOrder;
    if (used.has(s)) {
      s = 0;
      while (reserved.has(s) || used.has(s)) s++;
    }
    used.add(s);
    result.set(l.id, s);
  }
  return result;
}
export function nextSlot(lots: Lot[]) {
  return Math.max(-1, ...lots.map((l) => l.sortOrder), ...displaySlots(lots).values()) + 1;
}
export const mutationSchema = z.object({
  mutationId: z.string().uuid(),
  deviceId: z.string().uuid(),
  entity: z.enum(['idea', 'lot']),
  entityId: z.string().min(1).max(80),
  operation: z.enum(['create', 'patch', 'delete']),
  baseVersion: z.number().int().nonnegative(),
  patch: z.record(z.string(), z.unknown()),
});
export type Mutation = z.infer<typeof mutationSchema>;
export type RecordValue = Idea | Lot;
export type MutationResult = {
  mutationId: string;
  outcome: 'accepted' | 'conflict' | 'invalid' | 'capacity' | 'blocked';
  version?: number;
  record?: RecordValue;
  code?: string;
};
export function validateRecord(entity: 'idea' | 'lot', record: unknown) {
  const r = entity === 'idea' ? ideaSchema.parse(record) : lotSchema.parse(record);
  if (entity === 'lot') {
    (r as Lot).nameKey = nameKey((r as Lot).name);
    assertGeneral(r as Lot);
  }
  return r;
}
export const labelDate = (s: string | null, precision: string | null = 'day') =>
  s
    ? new Date(`${s}T12:00:00`).toLocaleDateString(
        'en-US',
        precision === 'month'
          ? { month: 'long', year: 'numeric' }
          : { month: 'short', day: 'numeric', year: 'numeric' },
      )
    : 'Someday';
export function laterDate(option: string, day = today()): string | null {
  if (option === 'someday') return null;
  if (option === 'tomorrow') return addDays(day, 1);
  if (option === 'month') {
    const d = new Date(day + 'T12:00:00');
    return localISO(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
  }
  const n = new Date(day + 'T12:00:00').getDay();
  return addDays(day, (8 - n) % 7 || 7);
}
