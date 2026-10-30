import { z } from 'zod';
import {
  assertGeneral,
  canParkInLot,
  occupancy,
  ideaSchema,
  lotSchema,
  nameKey,
  nextSlot,
  type Idea,
  type Lot,
} from '../shared/domain';
import { ParkDB } from './data';
const schema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  sourceOwnerId: z.string(),
  settings: z.record(z.string(), z.unknown()).default({}),
  lots: z.array(lotSchema).max(1000),
  ideas: z.array(ideaSchema).max(20000),
  pendingWork: z.unknown().optional(),
});
export type ImportPlan = {
  lots: Lot[];
  ideas: Idea[];
  updates: number;
  warnings: string[];
  pendingWork: unknown;
  settings: Record<string, unknown>;
};
export async function planImport(db: ParkDB, raw: unknown): Promise<ImportPlan> {
  const backup = schema.parse(raw);
  const same = backup.sourceOwnerId === db.owner;
  const existing = await db.lots.toArray();
  const existingIdeas = await db.ideas.toArray();
  const ids = new Map<string, string>([['general', 'general']]);
  const names = new Set(existing.map((l) => l.nameKey));
  const lots: Lot[] = [];
  const warnings: string[] = [];
  let slot = nextSlot(existing);
  let updates = 0;
  for (const l of backup.lots) {
    if (ids.has(l.id) && l.id !== 'general') throw new Error('Backup repeats a lot ID.');
    if (l.id === 'general') {
      assertGeneral(l);
      continue;
    }
    const id = same ? l.id : crypto.randomUUID();
    ids.set(l.id, id);
    const previous = existing.find((x) => x.id === id);
    const key = nameKey(l.name);
    if (names.has(key) && previous?.nameKey !== key)
      throw new Error(
        `Rename “${l.name}” in the backup or map it to an existing lot before importing.`,
      );
    names.add(key);
    if (previous) updates++;
    lots.push({
      ...l,
      id,
      ownerId: db.owner,
      nameKey: key,
      sortOrder: previous?.sortOrder ?? slot++,
      serverVersion: previous?.serverVersion ?? 0,
    });
  }
  const allLots = [...existing.filter((l) => !lots.some((x) => x.id === l.id)), ...lots];
  const seen = new Set<string>();
  const ideas = backup.ideas.map((i) => {
    if (seen.has(i.id)) throw new Error('Backup repeats an idea ID.');
    seen.add(i.id);
    const id = same ? i.id : crypto.randomUUID();
    const previous = existingIdeas.find((x) => x.id === id);
    if (previous) updates++;
    const lotId =
      ids.get(i.lotId) ?? (same && existing.some((l) => l.id === i.lotId) ? i.lotId : 'general');
    if (lotId === 'general' && i.lotId !== 'general')
      warnings.push(`“${i.title}” will use General because its lot is missing.`);
    return { ...i, id, ownerId: db.owner, lotId, serverVersion: previous?.serverVersion ?? 0 };
  });
  const allIdeas = [...existingIdeas.filter((i) => !ideas.some((x) => x.id === i.id)), ...ideas];
  for (const i of ideas) {
    const l = allLots.find((l) => l.id === i.lotId)!;
    const old = existingIdeas.find((x) => x.id === i.id);
    const error = canParkInLot(
      lots.some((imported) => imported.id === l.id && imported.isArchived)
        ? { ...l, isArchived: false }
        : l,
      existingIdeas.filter((x) => x.id !== i.id),
      i,
      old,
    );
    if (
      l.capacityPolicy === 'strict' &&
      l.capacity !== null &&
      i.status === 'parked' &&
      occupancy(allIdeas, l.id) > l.capacity &&
      (!old || old.status !== 'parked' || old.lotId !== i.lotId)
    )
      throw new Error(
        `“${l.name}” would exceed strict capacity. Change the limit in the backup preview first.`,
      );
    if (error) throw new Error(`“${i.title}”: ${error}`);
  }
  return {
    lots,
    ideas,
    updates,
    warnings,
    pendingWork: collectRecovered(backup.pendingWork),
    settings: backup.settings,
  };
}
export async function mergeImport(db: ParkDB, plan: ImportPlan, includeUpdates: boolean) {
  const existingLots = new Set((await db.lots.toArray()).map((l) => l.id));
  const existingIdeas = new Set((await db.ideas.toArray()).map((i) => i.id));
  await db.transaction('rw', [db.ideas, db.lots, db.queue, db.meta, db.undos], async () => {
    const selectedLots = plan.lots.filter((l) => includeUpdates || !existingLots.has(l.id));
    const selectedIdeas = plan.ideas.filter((i) => includeUpdates || !existingIdeas.has(i.id));
    for (const l of selectedLots)
      await db.save(
        'lot',
        l.isArchived && selectedIdeas.some((i) => i.lotId === l.id && i.status === 'parked')
          ? { ...l, isArchived: false }
          : l,
      );
    for (const i of selectedIdeas) await db.save('idea', i);
    for (const l of selectedLots.filter((l) => l.isArchived))
      if (selectedIdeas.some((i) => i.lotId === l.id && i.status === 'parked'))
        await db.save('lot', l);
    await db.setMeta('recoveredDrafts', [
      ...collectRecovered(await db.getMeta('recoveredDrafts', null)),
      ...collectRecovered(plan.pendingWork),
    ]);
    await db.setMeta('settings', {
      reduced: plan.settings.reduced === true,
      rememberLot: false,
      defaultLot: 'general',
    });
  });
}

export async function replaceImport(db: ParkDB, plan: ImportPlan) {
  if (!navigator.onLine || (await db.queue.count()))
    throw new Error('Sync and resolve pending work before replacing account data.');
  const targetIdeas = new Set(plan.ideas.map((i) => i.id)),
    targetLots = new Set(['general', ...plan.lots.map((l) => l.id)]);
  const removeIdeas = (await db.ideas.toArray()).filter((i) => !targetIdeas.has(i.id));
  const removeLots = (await db.lots.toArray()).filter((l) => !targetLots.has(l.id));
  await db.transaction('rw', [db.ideas, db.lots, db.queue, db.meta, db.undos], async () => {
    await db.setMeta('replaceJob', {
      startedAt: new Date().toISOString(),
      phase: 'queued',
      removals: removeIdeas.length + removeLots.length,
    });
    for (const i of removeIdeas) await db.remove('idea', i.id);
    for (const l of plan.lots) await db.save('lot', l);
    for (const i of plan.ideas) await db.save('idea', i);
    for (const l of removeLots) await db.remove('lot', l.id);
    await db.setMeta('recoveredDrafts', plan.pendingWork ?? null);
  });
}

export function collectRecovered(
  value: unknown,
): { entity: 'idea' | 'lot'; record: Record<string, unknown> }[] {
  const result: { entity: 'idea' | 'lot'; record: Record<string, unknown> }[] = [];
  const seen = new Set<string>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 8 || result.length >= 1000 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const item of v) visit(item, depth + 1);
      return;
    }
    const obj = v as Record<string, unknown>;
    const entity =
      typeof obj.title === 'string' ? 'idea' : typeof obj.name === 'string' ? 'lot' : null;
    if (entity) {
      const keys =
        entity === 'idea'
          ? [
              'originalText',
              'title',
              'notes',
              'status',
              'kind',
              'vehicleSize',
              'lotId',
              'revisitOn',
              'datePrecision',
              'dateLabel',
              'createdAt',
              'updatedAt',
              'activatedAt',
              'archivedAt',
              'archiveReason',
            ]
          : [
              'name',
              'startOn',
              'endExclusive',
              'capacity',
              'capacityPolicy',
              'accent',
              'sortOrder',
              'isArchived',
              'endedPromptDismissedFor',
              'createdAt',
              'updatedAt',
            ];
      const record = Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
      const key = JSON.stringify(record);
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ entity, record });
      }
    }
    for (const key of [
      'proposals',
      'patch',
      'before',
      'alternative',
      'undo',
      'after',
      'recovered',
      'record',
    ])
      if (key in obj) visit(obj[key], depth + 1);
  };
  visit(value, 0);
  return result;
}
