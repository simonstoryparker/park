import { ParkDB, type Pending } from './data';
import type { MutationResult, RecordValue } from '../shared/domain';
export type SyncState =
  | 'Saved in this browser'
  | 'Synced'
  | 'Changes waiting'
  | 'Offline'
  | 'Unable to sync'
  | 'Sign in again'
  | 'Needs attention';
export class SyncEngine {
  running = false;
  timer?: ReturnType<typeof setTimeout>;
  attempts = 0;
  paused = false;
  csrf = '';
  disposed = false;
  constructor(
    public db: ParkDB,
    public onState: (s: SyncState) => void,
  ) {}
  schedule() {
    if (this.disposed) return;
    if (this.db.localOnly) {
      this.onState('Saved in this browser');
      return;
    }
    this.onState(navigator.onLine ? 'Changes waiting' : 'Offline');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), 500);
  }
  async request(path: string, init: RequestInit = {}) {
    if (this.db.localOnly)
      throw new Error('Cloud accounts are unavailable in this browser-only version.');
    const r = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf, ...init.headers },
    });
    if (!r.ok) {
      const error = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw Object.assign(new Error(error.error ?? error.code ?? `HTTP ${r.status}`), {
        status: r.status,
        code: error.code,
        retryAfter: r.headers.get('Retry-After'),
      });
    }
    return r.json();
  }
  async snapshot() {
    let token: string | undefined;
    await this.db.staging.clear();
    for (let restarts = 0; restarts < 3; ) {
      try {
        const page = await this.request(
          `/api/snapshot${token ? `?token=${encodeURIComponent(token)}` : ''}`,
        );
        await this.db.staging.bulkPut(
          page.records.map((r: { entity: string; record: RecordValue }) => ({
            key: `${r.entity}:${r.record.id}`,
            record: r.record,
          })),
        );
        if (page.nextToken) {
          token = page.nextToken;
          continue;
        }
        const staged = await this.db.staging.toArray();
        await this.db.activateSnapshot(
          staged.map((s) => ({
            entity: s.key.startsWith('idea:') ? 'idea' : 'lot',
            id: s.record.id,
            record: s.record,
          })),
          page.cursor,
        );
        await this.db.staging.clear();
        return;
      } catch (e) {
        if ((e as { code?: string }).code !== 'snapshot_restart') throw e;
        token = undefined;
        await this.db.staging.clear();
        restarts++;
      }
    }
    throw new Error('Account changed during snapshot. Retry sync.');
  }
  async run(manual = false) {
    if (this.running || this.disposed || (!manual && this.paused)) return;
    if (this.db.localOnly) {
      this.onState('Saved in this browser');
      return;
    }
    if (!navigator.onLine) {
      this.onState('Offline');
      return;
    }
    this.running = true;
    clearTimeout(this.timer);
    try {
      const me = await this.request('/api/me');
      if (me.user.id !== this.db.owner)
        throw new Error('Sign in with the same Google account to keep pending work safe.');
      this.csrf = me.csrf;
      let device = await this.db.getMeta<{ id: string; expiresAt: number } | null>('device', null);
      if (device && device.expiresAt < Date.now()) {
        await this.snapshot();
        throw new Error(
          'Device registration expired. Export pending work and reconcile before registering again.',
        );
      }
      if (!device) {
        const d = await this.request('/api/devices', { method: 'POST', body: '{}' });
        device = d;
        await this.db.setMeta('device', device);
      }
      if (!(await this.db.getMeta('cursor', ''))) await this.snapshot();
      const queue = await this.db.queue.orderBy('order').toArray();
      const blocked = new Set<string>();
      const outgoing: Pending[] = [];
      let bytes = 0;
      for (const p of queue) {
        if (blocked.has(p.entityId)) continue;
        blocked.add(p.entityId);
        if (p.issue) continue;
        if (
          p.entity === 'idea' &&
          typeof p.patch.lotId === 'string' &&
          queue.some((q) => q.entity === 'lot' && q.entityId === p.patch.lotId && q.issue)
        )
          continue;
        const wire = p.wire ?? {
          mutationId: p.id,
          deviceId: device!.id,
          entity: p.entity,
          entityId: p.entityId,
          operation: p.operation,
          baseVersion: p.baseVersion,
          patch: p.patch,
        };
        const size = new TextEncoder().encode(JSON.stringify(wire)).length;
        if (bytes + size > 250000 || outgoing.length >= 5) break;
        bytes += size;
        if (!p.wire) await this.db.queue.update(p.id, { wire });
        outgoing.push({ ...p, wire });
      }
      if (outgoing.length) {
        const response = await this.request('/api/sync', {
          method: 'POST',
          body: JSON.stringify({ mutations: outgoing.map((p) => p.wire) }),
        });
        for (const r of response.results as MutationResult[]) {
          const p = outgoing.find((p) => p.id === r.mutationId);
          if (p) await this.db.accept(p, r);
        }
      }
      let more = true;
      while (more) {
        const cursor = await this.db.getMeta('cursor', '');
        let page;
        try {
          page = await this.request(`/api/sync?cursor=${encodeURIComponent(cursor)}`);
        } catch (e) {
          if (['cursor_expired', 'invalid_cursor'].includes((e as { code: string }).code)) {
            await this.snapshot();
            continue;
          }
          throw e;
        }
        await this.db.applyChanges(page.changes, page.nextCursor);
        more = page.hasMore;
      }
      this.attempts = 0;
      this.paused = false;
      const remaining = await this.db.queue.toArray();
      this.onState(
        remaining.some((p) => p.issue)
          ? 'Needs attention'
          : remaining.length
            ? 'Changes waiting'
            : 'Synced',
      );
      if (remaining.some((p) => !p.issue) && outgoing.length)
        this.timer = setTimeout(() => void this.run(), 500);
    } catch (e) {
      const error = e as { status?: number; retryAfter?: string };
      if (error.status === 401) {
        this.paused = true;
        this.onState('Sign in again');
      } else {
        this.onState(navigator.onLine ? 'Unable to sync' : 'Offline');
        this.attempts++;
        if (this.attempts >= 5) this.paused = true;
        else
          this.timer = setTimeout(
            () => void this.run(),
            Math.max(
              Number(error.retryAfter ?? 0) * 1000,
              Math.min(300000, 2000 * 2 ** (this.attempts - 1)) * (0.75 + Math.random() * 0.5),
            ),
          );
      }
    } finally {
      this.running = false;
    }
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
  }
}
