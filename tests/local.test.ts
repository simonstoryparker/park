import 'fake-indexeddb/auto';
import { afterEach, describe, it, expect } from 'vitest';
import { ParkDB } from '../src/data';
import { SyncEngine } from '../src/sync';
import { general, type Idea } from '../shared/domain';
const databases: ParkDB[] = [];
async function db() {
  const d = new ParkDB(crypto.randomUUID());
  databases.push(d);
  await d.init();
  return d;
}
const idea = (ownerId: string, patch: Partial<Idea> = {}): Idea => ({
  id: crypto.randomUUID(),
  ownerId,
  originalText: 'test',
  title: 'test',
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
afterEach(async () => {
  for (const d of databases.splice(0)) await d.delete();
});
describe('durable local transactions', () => {
  it('keeps a browser-only park durable without a cloud queue or API calls', async () => {
    const owner = crypto.randomUUID();
    const d = new ParkDB(owner, true);
    databases.push(d);
    await d.init();
    const { idea: captured } = await d.capture('Read a book tomorrow', { day: '2026-10-29' });
    await d.command('/complete "Read a book"', '2026-10-29');
    const undo = (await d.undos.toArray()).find((u) => u.before);
    await d.undo(undo!.id);
    expect((await d.ideas.get(captured.id))?.status).toBe('parked');
    expect(await d.queue.count()).toBe(0);
    const states: string[] = [];
    const engine = new SyncEngine(d, (state) => states.push(state));
    engine.schedule();
    await engine.run(true);
    expect(states).toEqual(['Saved in this browser', 'Saved in this browser']);
    await expect(engine.request('/api/me')).rejects.toThrow('browser-only');
    d.close();
    const reopened = new ParkDB(owner, true);
    databases.push(reopened);
    expect((await reopened.ideas.get(captured.id))?.title).toBe('Read a book');
    expect((await reopened.backup()).ideas).toHaveLength(1);
    engine.dispose();
  });
  it('runs one-line lifecycle, edits, scheduling and lot commands through the durable queue', async () => {
    const d = await db();
    await d.command('/lot Reading max 5', '2026-10-27');
    const { idea: captured } = await d.capture('Read a book');
    await d.command('/set "Read a book" lot = Reading', '2026-10-27');
    await d.command('/set "Read a book" date = next week', '2026-10-27');
    await d.command('/set "Read a book" size = big', '2026-10-27');
    await d.command('/start "Read a book"', '2026-10-27');
    expect(await d.ideas.get(captured.id)).toMatchObject({
      status: 'active',
      revisitOn: '2026-11-02',
      vehicleSize: 'truck',
    });
    await d.command('/complete "Read a book"', '2026-10-27');
    expect(await d.ideas.get(captured.id)).toMatchObject({
      status: 'archived',
      archiveReason: 'completed',
    });
    expect(await d.undos.count()).toBe(2);
    await d.command('/restore "Read a book"', '2026-10-27');
    await d.command('/set-lot "Reading" end = tomorrow', '2026-10-27');
    const reading = await d.lots.where('nameKey').equals('reading').first();
    expect(reading?.endExclusive).toBe('2026-10-29');
    await d.command('/archive-lot "Reading"', '2026-10-27');
    await d.command('/restore-lot "Reading"', '2026-10-27');
    expect((await d.lots.get(reading!.id))?.isArchived).toBe(false);
    expect(await d.queue.count()).toBeGreaterThan(8);
  });
  it('rolls back every move and queued mutation when a command exceeds strict capacity', async () => {
    const d = await db();
    await d.command('/lot Tiny max 1', '2026-10-27');
    await d.command('/set-lot "Tiny" policy = strict', '2026-10-27');
    await d.capture('One');
    await d.capture('Two');
    const queued = await d.queue.count();
    await expect(d.command('/move-all "Drop-off zone" to "Tiny"', '2026-10-27')).rejects.toThrow();
    expect((await d.ideas.toArray()).every((i) => i.lotId === 'general')).toBe(true);
    expect(await d.queue.count()).toBe(queued);
  });
  it('rejects ambiguous, unknown and invalid commands without changing records', async () => {
    const d = await db();
    const first = await d.capture('Same');
    await d.capture('Same');
    await expect(d.command('/archive "Same"', '2026-10-27')).rejects.toThrow('More than one');
    await expect(d.command('/unknown', '2026-10-27')).rejects.toThrow('Unknown action');
    await d.command(`/set "${first.idea.id}" kind = idea`, '2026-10-27');
    await expect(d.command(`/complete "${first.idea.id}"`, '2026-10-27')).rejects.toThrow(
      'Only tasks',
    );
    await expect(d.command('/set-lot "Drop-off zone" capacity = 1', '2026-10-27')).rejects.toThrow(
      'permanent',
    );
    await d.command('/lot Books', '2026-10-27');
    await expect(d.command('/set-lot "Books" capacity = 0', '2026-10-27')).rejects.toThrow();
    expect((await d.lots.where('nameKey').equals('books').first())?.capacity).toBe(null);
  });
  it('persists capture, queue, original text and pending export together', async () => {
    const d = await db(),
      i = idea(d.owner);
    await d.save('idea', i, 'capture');
    d.close();
    await d.open();
    expect(await d.ideas.get(i.id)).toMatchObject({ ...i, updatedAt: expect.any(String) });
    expect(await d.queue.where('entityId').equals(i.id).count()).toBe(1);
    const b = await d.backup();
    expect(b.ideas[0].originalText).toBe('test');
    expect(JSON.stringify(b)).not.toContain('deviceId');
    expect(await d.undos.count()).toBe(1);
  });
  it('serializes concurrent strict-capacity local captures without losing drafts', async () => {
    const d = await db();
    await d.save('lot', {
      ...general(d.owner),
      id: 'strict',
      name: 'Strict',
      nameKey: 'strict',
      capacity: 1,
      capacityPolicy: 'strict',
    });
    const results = await Promise.allSettled([
      d.save('idea', idea(d.owner, { lotId: 'strict' })),
      d.save('idea', idea(d.owner, { lotId: 'strict' })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await d.ideas.count()).toBe(1);
  });
  it('completion undo preserves later title edits', async () => {
    const d = await db(),
      i = idea(d.owner, { status: 'active', kind: 'task' });
    await d.save('idea', i);
    await d.save(
      'idea',
      {
        ...i,
        status: 'archived',
        archiveReason: 'completed',
        archivedAt: new Date().toISOString(),
      },
      'complete',
    );
    const current = (await d.ideas.get(i.id))!;
    await d.save('idea', { ...current, title: 'edited after completion' });
    const u = (await d.undos.toArray())[0];
    await d.undo(u.id);
    expect(await d.ideas.get(i.id)).toMatchObject({
      status: 'active',
      title: 'edited after completion',
    });
  });
  it('pulls ack without replacing pending text; conflicts retain alternatives', async () => {
    const d = await db(),
      i = idea(d.owner);
    await d.save('idea', i);
    const p = (await d.queue.where('entityId').equals(i.id).first())!;
    await d.accept(p, {
      mutationId: p.id,
      outcome: 'conflict',
      record: { ...i, title: 'other device', serverVersion: 2 },
    });
    await d.applyChanges(
      [{ entity: 'idea', id: i.id, record: { ...i, title: 'synced', serverVersion: 2 } }],
      'cursor',
    );
    expect((await d.ideas.get(i.id))!.title).toBe('test');
    expect(((await d.queue.get(p.id))!.issue!.record as Idea).title).toBe('other device');
    expect(await d.getMeta('cursor', '')).toBe('cursor');
  });
});
it('keeps the edit base when a pull discovers another device’s change', async () => {
  const d = await db(),
    i = idea(d.owner, { serverVersion: 1 });
  await d.ideas.put(i);
  await d.ack.put({ key: `idea:${i.id}`, record: i });
  await d.save('idea', { ...i, title: 'my edit' });
  const p = (await d.queue.toArray())[0];
  await d.applyChanges(
    [{ entity: 'idea', id: i.id, record: { ...i, title: 'other edit', serverVersion: 2 } }],
    'page',
  );
  expect((await d.queue.get(p.id))!.baseVersion).toBe(1);
  expect((await d.ideas.get(i.id))!.title).toBe('my edit');
});
it('advances only a dependent operation after its predecessor is acknowledged', async () => {
  const d = await db(),
    i = idea(d.owner);
  await d.save('idea', i);
  await d.save('idea', { ...i, title: 'second edit' });
  const [first, second] = await d.queue.orderBy('order').toArray();
  expect(second.predecessor).toBe(first.id);
  await d.accept(first, {
    mutationId: first.id,
    outcome: 'accepted',
    version: 1,
    record: { ...i, serverVersion: 1 },
  });
  expect((await d.queue.get(second.id))!.baseVersion).toBe(1);
  expect((await d.queue.get(second.id))!.predecessor).toBeUndefined();
});

it('prepares the demo lot once without moving existing drop-off thoughts', async () => {
  const d = await db();
  const existing = idea(d.owner);
  await d.save('idea', existing);
  await d.init(true);
  expect(await d.lots.get('after-break')).toMatchObject({
    name: 'After break',
    startOn: '2026-11-10',
  });
  expect(await d.ideas.get(existing.id)).toMatchObject({
    title: existing.title,
    lotId: 'general',
  });
  expect(await d.lots.get('general')).toMatchObject({ name: 'General', startOn: null });
  const count = await d.queue.count();
  await d.init(true);
  expect(await d.queue.count()).toBe(count);
});

describe('capture destinations', () => {
  it('creates a calendar lot and its car together, reuses it, and sends undated thoughts to drop-off', async () => {
    const d = await db();
    const first = await d.capture('english outline tomorrow', { day: '2026-10-26' });
    expect(first.idea).toMatchObject({
      title: 'english outline',
      revisitOn: '2026-10-27',
      lotId: first.lot.id,
    });
    expect(first.lot).toMatchObject({ startOn: '2026-10-27', isArchived: false });
    expect(first.lot.name).toContain('Oct 27');
    const second = await d.capture('journal tomorrow', { day: '2026-10-26' });
    expect(second.lot.id).toBe(first.lot.id);
    expect(await d.lots.count()).toBe(2);
    const third = await d.capture('Substack post', { day: '2026-10-26' });
    expect(third.idea.lotId).toBe('general');
    expect((await d.queue.orderBy('order').toArray()).map((p) => p.entity)).toEqual([
      'lot',
      'idea',
      'idea',
      'idea',
    ]);
    d.close();
    await d.open();
    expect(await d.ideas.count()).toBe(3);
  });
  it('serializes simultaneous captures of the same day and rolls back failed captures', async () => {
    const d = await db();
    await Promise.all(
      ['one tomorrow', 'two tomorrow'].map((input) => d.capture(input, { day: '2026-10-26' })),
    );
    expect(await d.lots.count()).toBe(2);
    expect(await d.ideas.count()).toBe(2);
    const queueCount = await d.queue.count();
    await expect(
      d.capture('x'.repeat(10001) + ' next week', { day: '2026-10-26' }),
    ).rejects.toThrow();
    expect(await d.lots.count()).toBe(2);
    expect(await d.queue.count()).toBe(queueCount);
  });
  it('allows deliberate destinations, literal date text, and reopening an archived calendar lot', async () => {
    const d = await db();
    const first = await d.capture('english tomorrow', { day: '2026-10-26' });
    await d.save('lot', { ...first.lot, isArchived: true });
    const again = await d.capture('journal tomorrow', { day: '2026-10-26' });
    expect(again.lot.id).toBe(first.lot.id);
    expect(again.lot.isArchived).toBe(false);
    const explicit = await d.capture('read', { explicitId: first.lot.id });
    expect(explicit.idea.lotId).toBe(first.lot.id);
    await d.command('/lot Books', '2026-10-26');
    const deliberate = await d.capture('Books tomorrow', { explicitId: first.lot.id });
    expect(deliberate.idea.lotId).toBe(first.lot.id);
    const literal = await d.capture('read tomorrow', { ignoreDate: true });
    expect(literal.idea).toMatchObject({
      title: 'read tomorrow',
      lotId: 'general',
      revisitOn: null,
    });
  });
});

describe('calendar lot convergence', () => {
  it('adopts the same day created on another device without blocking its car or overwriting later edits', async () => {
    const d = await db();
    const { lot, idea: captured } = await d.capture('English tomorrow', { day: '2026-10-26' });
    const creation = (await d.queue.orderBy('order').toArray())[0];
    await d.save('lot', { ...lot, name: 'School day' });
    const server = { ...lot, sortOrder: 3, serverVersion: 1 };
    await d.accept(creation, {
      mutationId: creation.id,
      outcome: 'conflict',
      code: 'stale_base',
      record: server,
      version: 1,
    });
    expect(await d.queue.get(creation.id)).toBeUndefined();
    expect(await d.lots.get(lot.id)).toMatchObject({ name: 'School day' });
    const edit = (await d.queue.toArray()).find((p) => p.entity === 'lot')!;
    expect(edit.baseVersion).toBe(1);
    expect(edit.predecessor).toBeUndefined();
    expect(await d.ideas.get(captured.id)).toMatchObject({ lotId: lot.id });
  });
});
