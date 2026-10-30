import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { ParkDB } from '../src/data';
import { planImport, mergeImport, collectRecovered } from '../src/backup';
import { general, type Idea } from '../shared/domain';
const idea = (ownerId: string, lotId = 'general'): Idea => ({
  id: crypto.randomUUID(),
  ownerId,
  lotId,
  title: 'Read in December',
  originalText: 'Read in December',
  notes: 'notes',
  status: 'parked',
  kind: 'idea',
  vehicleSize: 'compact',
  revisitOn: '2026-12-01',
  datePrecision: 'month',
  dateLabel: 'legacy',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  activatedAt: null,
  archivedAt: null,
  archiveReason: null,
  serverVersion: 17,
});
it('imports across accounts with fresh IDs, General mapping and no trusted server versions', async () => {
  const source = new ParkDB(crypto.randomUUID()),
    target = new ParkDB(crypto.randomUUID());
  try {
    await source.init();
    await target.init();
    const l = {
      ...general(source.owner),
      id: crypto.randomUUID(),
      name: 'Reading',
      nameKey: 'reading',
      sortOrder: 1,
    };
    await source.save('lot', l);
    const original = idea(source.owner, l.id);
    await source.save('idea', original);
    const plan = await planImport(target, await source.backup());
    expect(plan.ideas[0].id).not.toBe(original.id);
    expect(plan.ideas[0].ownerId).toBe(target.owner);
    expect(plan.ideas[0].serverVersion).toBe(0);
    expect(plan.ideas[0].lotId).toBe(plan.lots[0].id);
    await mergeImport(target, plan, false);
    const restored = (await target.ideas.toArray())[0];
    expect(restored).toMatchObject({
      datePrecision: 'month',
      dateLabel: 'legacy',
      originalText: original.originalText,
      createdAt: original.createdAt,
    });
  } finally {
    await source.delete();
    await target.delete();
  }
});
it('round-trips an archived lot with parked contents without revealing it locally', async () => {
  const source = new ParkDB(crypto.randomUUID()),
    target = new ParkDB(crypto.randomUUID());
  try {
    await source.init();
    await target.init();
    const lot = {
      ...general(source.owner),
      id: crypto.randomUUID(),
      name: 'History',
      nameKey: 'history',
      sortOrder: 1,
    };
    await source.save('lot', lot);
    await source.save('idea', idea(source.owner, lot.id));
    await source.save('lot', { ...lot, isArchived: true });
    const plan = await planImport(target, await source.backup());
    await mergeImport(target, plan, false);
    expect((await target.lots.get(plan.lots[0].id))!.isArchived).toBe(true);
    expect(await target.ideas.count()).toBe(1);
  } finally {
    await source.delete();
    await target.delete();
  }
});
it('rejects future schemas and extracts recoverable domain text without credentials', async () => {
  const d = new ParkDB(crypto.randomUUID());
  try {
    await d.init();
    await expect(planImport(d, { ...(await d.backup()), schemaVersion: 999 })).rejects.toThrow();
    const recovered = collectRecovered({
      proposals: [
        {
          patch: {
            title: 'offline words',
            notes: 'keep me',
            token: 'never export this',
            deviceId: 'secret-device',
          },
          alternative: { title: 'other words' },
        },
      ],
    });
    expect(recovered).toHaveLength(2);
    expect(JSON.stringify(recovered)).not.toContain('secret-device');
    expect(JSON.stringify(recovered)).not.toContain('never export');
    await d.setMeta('recoveredDrafts', recovered);
    expect((await d.backup()).pendingWork.recovered).toEqual(recovered);
  } finally {
    await d.delete();
  }
});
