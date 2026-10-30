import { planCapture } from '../shared/parser';
import { planCommand } from '../shared/commands';
import Dexie, { type Table } from 'dexie';
import {
  assertGeneral,
  canParkInLot,
  general,
  demoLot,
  nextSlot,
  nameKey,
  validateRecord,
  type Idea,
  type Lot,
  type Mutation,
  type MutationResult,
  type RecordValue,
} from '../shared/domain';
export type Pending = {
  id: string;
  entity: 'idea' | 'lot';
  entityId: string;
  operation: Mutation['operation'];
  patch: Record<string, unknown>;
  before: RecordValue | null;
  order: number;
  baseVersion: number;
  predecessor?: string;
  wire?: Mutation;
  issue?: MutationResult;
};
export type Undo = {
  id: string;
  ideaId: string;
  before: Idea | null;
  after: Idea;
  expires: number;
  issue?: string;
};
export class ParkerDB extends Dexie {
  ideas!: Table<Idea, string>;
  lots!: Table<Lot, string>;
  queue!: Table<Pending, string>;
  ack!: Table<{ key: string; record: RecordValue | null }, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  undos!: Table<Undo, string>;
  staging!: Table<{ key: string; record: RecordValue }, string>;
  constructor(
    public owner: string,
    public localOnly = false,
  ) {
    super(`park-v1-${owner}`);
    this.version(1).stores({
      ideas: 'id,status,lotId,revisitOn,createdAt',
      lots: 'id,sortOrder,name,&nameKey',
      queue: 'id,entityId,order',
      ack: 'key',
      meta: 'key',
      undos: 'id,expires',
      staging: 'key',
    });
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        const queue = await tx.table('queue').orderBy('order').toArray();
        const previous = new Map<string, string>();
        for (const p of queue) {
          await tx.table('queue').update(p.id, {
            baseVersion: p.wire?.baseVersion ?? p.before?.serverVersion ?? 0,
            predecessor: previous.get(p.entityId),
          });
          previous.set(p.entityId, p.id);
        }
      });
  }
  async init(demo = false) {
    if (!(await this.lots.get('general'))) await this.lots.put(general(this.owner));
    if (demo && !(await this.getMeta('demo-after-break', false))) {
      const existing = await this.lots.where('nameKey').equals('after break').first();
      const lot = existing ?? {
        ...demoLot(this.owner),
        sortOrder: nextSlot(await this.lots.toArray()),
      };
      if (!existing) await this.save('lot', lot);
      await this.setMeta('demo-after-break', true);
      await this.setMeta('demo-lot-id', lot.id);
    }
  }
  async getMeta<T>(key: string, fallback: T): Promise<T> {
    return ((await this.meta.get(key))?.value as T) ?? fallback;
  }
  async setMeta(key: string, value: unknown) {
    await this.meta.put({ key, value });
  }
  async save(entity: 'idea' | 'lot', value: RecordValue, undo?: 'capture' | 'complete') {
    return this.transaction('rw', [this.ideas, this.lots, this.queue, this.undos], async () => {
      const table = entity === 'idea' ? this.ideas : this.lots;
      const old = (await table.get(value.id)) as RecordValue | undefined;
      const record = validateRecord(entity, {
        ...value,
        ownerId: this.owner,
        updatedAt: new Date().toISOString(),
      });
      if (entity === 'idea') {
        const idea = record as Idea;
        const lot = await this.lots.get(idea.lotId);
        if (!lot) throw new Error('Choose an existing lot.');
        const error = canParkInLot(lot, await this.ideas.toArray(), idea, old as Idea | undefined);
        if (error) throw new Error(error);
      } else {
        const lot = record as Lot;
        assertGeneral(lot);
        lot.nameKey = nameKey(lot.name);
        if (
          (await this.lots.where('nameKey').equals(lot.nameKey).first())?.id !== lot.id &&
          (await this.lots.where('nameKey').equals(lot.nameKey).count())
        )
          throw new Error('A lot with this name already exists. Open or unarchive it.');
      }
      await (table as Table<RecordValue, string>).put(record);
      const { ownerId: _, serverVersion: __, id: ___, ...patch } = record;
      const queued = await this.queue.orderBy('order').toArray();
      if (!this.localOnly)
        await this.queue.add({
          id: crypto.randomUUID(),
          entity,
          entityId: record.id,
          operation: old ? 'patch' : 'create',
          patch,
          before: old ?? null,
          baseVersion: old?.serverVersion ?? 0,
          predecessor: queued.filter((p) => p.entityId === record.id).at(-1)?.id,
          order: (queued.at(-1)?.order ?? 0) + 1,
        });
      if (undo && entity === 'idea')
        await this.undos.put({
          id: crypto.randomUUID(),
          ideaId: record.id,
          before: undo === 'capture' ? null : (old as Idea),
          after: record as Idea,
          expires: Date.now() + 10000,
        });
      return record;
    });
  }
  async capture(
    input: string,
    options: { day?: string; explicitId?: string; ignoreDate?: boolean; truck?: boolean } = {},
  ) {
    return this.transaction('rw', [this.ideas, this.lots, this.queue, this.undos], async () => {
      const plan = planCapture(
        input,
        await this.lots.toArray(),
        this.owner,
        options.day,
        options.explicitId,
        options.ignoreDate,
      );
      if (!plan.title.trim()) throw new Error('Write a thought to park.');
      if (plan.create) await this.save('lot', plan.lot);
      const now = new Date().toISOString();
      const idea: Idea = {
        id: crypto.randomUUID(),
        ownerId: this.owner,
        originalText: input,
        title: plan.title,
        notes: '',
        status: 'parked',
        kind: 'task',
        vehicleSize: options.truck ? 'truck' : 'compact',
        lotId: plan.lot.id,
        revisitOn: plan.revisitOn,
        datePrecision: plan.datePrecision,
        dateLabel: null,
        createdAt: now,
        updatedAt: now,
        activatedAt: null,
        archivedAt: null,
        archiveReason: null,
        serverVersion: 0,
      };
      await this.save('idea', idea, 'capture');
      return { idea, lot: plan.lot };
    });
  }
  async command(input: string, day: string) {
    return this.transaction('rw', [this.ideas, this.lots, this.queue, this.undos], async () => {
      const plan = planCommand(
        input,
        await this.ideas.toArray(),
        await this.lots.toArray(),
        this.owner,
        day,
      );
      for (const write of plan.writes) {
        if (write.entity === 'idea') await this.save('idea', write.record, write.undo);
        else await this.save('lot', write.record);
      }
      return plan;
    });
  }
  async remove(entity: 'idea' | 'lot', id: string) {
    await this.transaction('rw', [this.ideas, this.lots, this.queue], async () => {
      if (id === 'general') throw new Error('General cannot be removed.');
      const table = entity === 'idea' ? this.ideas : this.lots;
      const before = await table.get(id);
      if (!before) return;
      if (entity === 'lot' && (await this.ideas.where('lotId').equals(id).count()))
        throw new Error('Move or replace this lot’s ideas first.');
      if (!this.localOnly)
        await this.queue.add({
          id: crypto.randomUUID(),
          entity,
          entityId: id,
          operation: 'delete',
          patch: {},
          before,
          baseVersion: before.serverVersion,
          predecessor: (await this.queue.where('entityId').equals(id).sortBy('order')).at(-1)?.id,
          order: ((await this.queue.orderBy('order').last())?.order ?? 0) + 1,
        });
      await table.delete(id);
    });
  }
  async activateSnapshot(
    records: { entity: 'idea' | 'lot'; id: string; record: RecordValue | null }[],
    cursor: string,
  ) {
    await this.transaction(
      'rw',
      [this.ack, this.queue, this.ideas, this.lots, this.meta],
      async () => {
        const keys = new Set(records.map((r) => `${r.entity}:${r.id}`));
        for (const base of await this.ack.toArray())
          if (!keys.has(base.key)) {
            const [entity, id] = base.key.split(':');
            await this.ack.delete(base.key);
            if (!(await this.queue.where('entityId').equals(id).count()))
              await (entity === 'idea' ? this.ideas : this.lots).delete(id);
          }
        await this.applyChanges(records, cursor);
      },
    );
  }
  async undo(id: string) {
    const u = await this.undos.get(id);
    if (!u || u.expires < Date.now()) throw new Error('Undo expired. Restore the idea in Archive.');
    const current = await this.ideas.get(u.ideaId);
    if (!current) return;
    const lifecycle = ['status', 'activatedAt', 'archivedAt', 'archiveReason'] as const;
    if (lifecycle.some((k) => current[k] !== u.after[k])) {
      await this.undos.update(id, {
        issue: 'This idea changed after the action. Open details to reconcile.',
      });
      throw new Error('This idea changed. Review it before restoring.');
    }
    const restored = u.before
      ? { ...current, ...Object.fromEntries(lifecycle.map((k) => [k, u.before![k]])) }
      : {
          ...current,
          status: 'archived' as const,
          archivedAt: new Date().toISOString(),
          archiveReason: 'dismissed' as const,
        };
    try {
      await this.save('idea', restored);
      await this.undos.delete(id);
    } catch (e) {
      await this.undos.update(id, { issue: String(e) });
      throw e;
    }
  }
  async applyChanges(
    changes: { entity: 'idea' | 'lot'; id: string; record: RecordValue | null }[],
    cursor: string,
  ) {
    await this.transaction(
      'rw',
      [this.ack, this.ideas, this.lots, this.meta, this.queue],
      async () => {
        for (const c of changes) {
          await this.ack.put({ key: `${c.entity}:${c.id}`, record: c.record });
          const pending = await this.queue.where('entityId').equals(c.id).count();
          if (!pending) {
            const table = c.entity === 'idea' ? this.ideas : this.lots;
            if (c.record) await (table as Table<RecordValue, string>).put(c.record);
            else await table.delete(c.id);
          }
        }
        await this.setMeta('cursor', cursor);
      },
    );
  }
  async accept(p: Pending, r: MutationResult) {
    await this.transaction('rw', [this.ack, this.queue, this.ideas, this.lots], async () => {
      // Offline devices use the same calendar ID. Adopt the existing server lot
      // when both created that day, preserving any later local edits in the queue.
      if (
        p.entity === 'lot' &&
        p.operation === 'create' &&
        /^date-(day|week|month)-\d{4}-\d{2}-\d{2}$/.test(p.entityId) &&
        r.outcome === 'conflict' &&
        r.code === 'stale_base' &&
        r.record &&
        'startOn' in r.record &&
        r.record.startOn === p.patch.startOn &&
        !r.record.isArchived &&
        !r.record.endExclusive
      ) {
        r = { ...r, outcome: 'accepted' };
      }
      if (r.outcome !== 'accepted') {
        await this.queue.update(p.id, { issue: r });
        return;
      }
      await this.queue.delete(p.id);
      for (const child of await this.queue.where('entityId').equals(p.entityId).toArray())
        if (child.predecessor === p.id)
          await this.queue.update(child.id, {
            baseVersion: r.version ?? r.record?.serverVersion ?? p.baseVersion + 1,
            predecessor: undefined,
          });
      await this.ack.put({ key: `${p.entity}:${p.entityId}`, record: r.record ?? null });
      const rest = await this.queue.where('entityId').equals(p.entityId).count();
      if (!rest && r.record)
        await (p.entity === 'idea' ? this.ideas : (this.lots as Table<RecordValue, string>)).put(
          r.record as Idea & Lot,
        );
    });
  }
  async resolve(id: string, choice: 'mine' | 'server', combined?: RecordValue) {
    const p = await this.queue.get(id);
    if (!p) return;
    const server = p.issue?.record ?? null;
    const proposed =
      combined ?? (await (p.entity === 'idea' ? this.ideas : this.lots).get(p.entityId));
    await this.transaction(
      'rw',
      [this.queue, this.ack, this.ideas, this.lots, this.undos],
      async () => {
        await this.queue.where('entityId').equals(p.entityId).delete();
        await this.ack.put({ key: `${p.entity}:${p.entityId}`, record: server });
        const table = p.entity === 'idea' ? this.ideas : this.lots;
        if (server) await (table as Table<RecordValue, string>).put(server);
        else await table.delete(p.entityId);
        if (choice === 'mine' && proposed)
          await this.save(p.entity, { ...proposed, serverVersion: server?.serverVersion ?? 0 });
      },
    );
  }
  async backup() {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      sourceOwnerId: this.owner,
      settings: await this.getMeta('settings', {}),
      lots: await this.lots.toArray(),
      ideas: await this.ideas.toArray(),
      pendingWork: {
        proposals: (await this.queue.toArray()).map((p) => ({
          entity: p.entity,
          entityId: p.entityId,
          patch: p.patch,
          before: p.before,
          alternative: p.issue?.record ?? null,
          code: p.issue?.code,
        })),
        undo: await this.undos.toArray(),
        recovered: await this.getMeta('recoveredDrafts', null),
      },
    };
  }
}
export function downloadBackup(data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `parker-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
