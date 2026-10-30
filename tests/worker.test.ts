import type { D1Database, Fetcher } from '@cloudflare/workers-types';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { build } from 'esbuild';
import { runDeletionSweep } from '../worker/index';
import { general, type Idea, type Mutation } from '../shared/domain';
let mf: Miniflare, db: D1Database;
type Client = { cookie: string; csrf: string; id: string; device: string };
const origin = 'http://localhost:8787';
async function request(path: string, client?: Client, method = 'GET', data?: unknown) {
  return mf.dispatchFetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(client ? { Cookie: client.cookie, 'X-CSRF-Token': client.csrf } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
async function login(email: string): Promise<Client> {
  const challenge = await request('/api/auth/challenge');
  const r = await mf.dispatchFetch(origin + '/api/auth/google', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Cookie: challenge.headers.get('Set-Cookie')!.split(';')[0],
    },
    body: JSON.stringify({ devEmail: email }),
  });
  expect(r.status).toBe(200);
  const b = (await r.json()) as { user: { id: string }; csrf: string };
  const c = {
    cookie: r.headers.get('Set-Cookie')!.split(';')[0],
    csrf: b.csrf,
    id: b.user.id,
    device: '',
  };
  const dev = (await (await request('/api/devices', c, 'POST', {})).json()) as { id: string };
  c.device = dev.id;
  return c;
}
const idea = (owner: string, lotId = 'general', patch: Partial<Idea> = {}): Idea => ({
  id: crypto.randomUUID(),
  ownerId: owner,
  originalText: 'private',
  title: 'private',
  notes: '',
  status: 'parked',
  kind: 'idea',
  vehicleSize: 'compact',
  lotId,
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
function mutation(
  c: Client,
  entity: 'idea' | 'lot',
  record: Record<string, unknown>,
  baseVersion = 0,
): Mutation {
  const { id, ownerId: _, serverVersion: __, ...patch } = record;
  return {
    mutationId: crypto.randomUUID(),
    deviceId: c.device,
    entity,
    entityId: String(id),
    operation: baseVersion ? 'patch' : 'create',
    baseVersion,
    patch,
  };
}
async function push(c: Client, mutations: Mutation[]) {
  const all: { outcome: string; record?: Idea; code?: string }[] = [];
  for (let n = 0; n < mutations.length; n += 5) {
    const r = await request('/api/sync', c, 'POST', { mutations: mutations.slice(n, n + 5) });
    expect(r.status).toBe(200);
    all.push(...((await r.json()) as { results: typeof all }).results);
  }
  return all;
}

beforeAll(async () => {
  const built = await build({
    entryPoints: ['worker/index.ts'],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'browser',
    target: 'es2022',
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: built.outputFiles[0].text,
      compatibilityDate: '2026-07-30',
      d1Databases: ['DB'],
      bindings: {
        APP_ORIGIN: origin,
        DEV_AUTH: 'true',
        DEV_ORIGINS: 'http://localhost:5174',
        CURSOR_SECRET: 'test-secret-with-at-least-32-characters',
        GOOGLE_CLIENT_ID: '',
      },
    }),
  );
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  const sql = await readFile('migrations/0001_initial.sql', 'utf8');
  const statements = sql.match(
    /CREATE TRIGGER[\s\S]*?END;(?=\s*(?:CREATE|$))|(?:PRAGMA|CREATE TABLE|CREATE (?:UNIQUE )?INDEX)[\s\S]*?;/g,
  )!;
  for (const s of statements) await db.prepare(s).run();
  await db.prepare(await readFile('migrations/0002_deletion_jobs.sql', 'utf8')).run();
  for (const s of (await readFile('migrations/0003_metadata_indexes.sql', 'utf8'))
    .split(';')
    .filter((s) => s.trim()))
    await db.prepare(s).run();
});
afterAll(async () => {
  await mf.dispose();
});
describe('Worker and actual local D1', () => {
  it('accepts the configured local demo port but rejects other local ports', async () => {
    for (const [demoOrigin, status] of [
      ['http://localhost:5174', 401],
      ['http://localhost:5999', 403],
    ]) {
      const response = await mf.dispatchFetch(origin + '/api/auth/google', {
        method: 'POST',
        headers: { Origin: String(demoOrigin), 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({
        code: status === 401 ? 'invalid_challenge' : 'origin_rejected',
      });
    }
  });
  it('rejects unauthenticated calls, foreign origins, forged Google and missing CSRF', async () => {
    expect((await request('/api/me')).status).toBe(401);
    expect(
      (
        await mf.dispatchFetch(origin + '/api/auth/google', {
          method: 'POST',
          headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    const c = await login('csrf@test');
    expect(
      (
        await mf.dispatchFetch(origin + '/api/devices', {
          method: 'POST',
          headers: { Origin: origin, Cookie: c.cookie, 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    const ch = await request('/api/auth/challenge');
    expect(
      (
        await mf.dispatchFetch(origin + '/api/auth/google', {
          method: 'POST',
          headers: {
            Origin: origin,
            Cookie: ch.headers.get('Set-Cookie')!.split(';')[0],
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ credential: 'forged' }),
        })
      ).status,
    ).not.toBe(200);
  });
  it('enforces owner isolation, idempotency and stale versions', async () => {
    const a = await login('a@test'),
      b = await login('b@test');
    const i = idea(a.id),
      m = mutation(a, 'idea', i);
    expect((await push(a, [m]))[0].outcome).toBe('accepted');
    expect((await push(a, [m]))[0].outcome).toBe('accepted');
    expect((await push(a, [{ ...m, patch: { ...m.patch, title: 'different' } }]))[0].code).toBe(
      'mutation_id_reused',
    );
    expect(
      (await push(b, [mutation(b, 'idea', { ...i, title: 'stolen' }, 1)]))[0].outcome,
    ).not.toBe('accepted');
    const snapshot = (await (await request('/api/snapshot', b)).json()) as {
      records: { record: { id: string } }[];
    };
    expect(snapshot.records.some((r) => r.record.id === i.id)).toBe(false);
    expect((await push(a, [mutation(a, 'idea', { ...i, title: 'next' }, 1)]))[0].outcome).toBe(
      'accepted',
    );
    expect((await push(a, [mutation(a, 'idea', { ...i, title: 'stale' }, 1)]))[0].outcome).toBe(
      'conflict',
    );
    expect(
      (await db
        .prepare('SELECT count(*) n FROM ideas WHERE owner_id=? AND id=?')
        .bind(a.id, i.id)
        .first<{ n: number }>())!.n,
    ).toBe(1);
  });
  it('atomically handles concurrent last-space captures and truck enlargement', async () => {
    const a = await login('race@test');
    const l = {
      ...general(a.id),
      id: crypto.randomUUID(),
      name: 'Strict',
      nameKey: 'strict',
      capacity: 3,
      capacityPolicy: 'strict',
    };
    expect((await push(a, [mutation(a, 'lot', l)]))[0].outcome).toBe('accepted');
    const first = idea(a.id, l.id, { vehicleSize: 'truck' });
    expect((await push(a, [mutation(a, 'idea', first)]))[0].outcome).toBe('accepted');
    const [x, y] = await Promise.all([
      push(a, [mutation(a, 'idea', idea(a.id, l.id))]),
      push(a, [mutation(a, 'idea', idea(a.id, l.id))]),
    ]);
    expect([x[0].outcome, y[0].outcome].sort()).toEqual(['accepted', 'capacity']);
    const last = (x[0].outcome === 'accepted' ? x : y)[0].record!;
    expect(
      (await push(a, [mutation(a, 'idea', { ...last, vehicleSize: 'truck' }, 1)]))[0].outcome,
    ).toBe('capacity');
    expect(
      (await push(a, [mutation(a, 'idea', { ...first, status: 'active' }, 1)]))[0].outcome,
    ).toBe('accepted');
    expect(
      (await push(a, [mutation(a, 'idea', { ...last, vehicleSize: 'truck' }, 1)]))[0].outcome,
    ).toBe('accepted');
  });
  it('restarts a snapshot at a changed watermark and binds cursors to owner', async () => {
    const a = await login('snapshot@test'),
      b = await login('cursor@test');
    const batch = [];
    for (let n = 0; n < 205; n++) {
      const m = mutation(a, 'idea', idea(a.id));
      batch.push(m);
      if (batch.length === 50) {
        await push(a, batch.splice(0));
      }
    }
    if (batch.length) await push(a, batch);
    const snap = (await (await request('/api/snapshot', a)).json()) as {
      nextToken: string;
      cursor: string;
    };
    expect(snap.nextToken).toBeTruthy();
    const tail = await request(`/api/snapshot?token=${encodeURIComponent(snap.nextToken)}`, a);
    expect(tail.status).toBe(200);
    const tailBody = (await tail.json()) as { records: unknown[]; nextToken: string | null };
    expect(tailBody.records).toHaveLength(6);
    expect(tailBody.nextToken).toBeNull();
    expect((await push(a, [mutation(a, 'idea', idea(a.id))]))[0].outcome).toBe('accepted');
    const restart = await request(`/api/snapshot?token=${encodeURIComponent(snap.nextToken)}`, a);
    expect(restart.status).toBe(409);
    expect((await request(`/api/sync?cursor=${encodeURIComponent(snap.cursor)}`, b)).status).toBe(
      400,
    );
  });
  it('uses owner indexes for hot queries', async () => {
    for (const [sql, args] of [
      [
        'SELECT * FROM ideas WHERE owner_id=? AND lot_id=? AND status=?',
        ['owner', 'general', 'parked'],
      ],
      ['SELECT * FROM changes WHERE owner_id=? AND seq>? ORDER BY seq LIMIT 200', ['owner', 0]],
      ['SELECT * FROM lots WHERE owner_id=? ORDER BY sort_order,id', ['owner']],
    ] as [string, (string | number)[]][]) {
      const plan = await db
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .bind(...args)
        .all<{ detail: string }>();
      expect(
        plan.results.some((r) => r.detail.includes('SEARCH') && r.detail.includes('INDEX')),
      ).toBe(true);
    }
  });
  it('finishes abandoned deletion jobs after progress credentials expire', async () => {
    const a = await login('abandoned-deletion@test');
    await push(a, [mutation(a, 'idea', idea(a.id))]);
    await db
      .prepare('UPDATE users SET deleted_at=? WHERE id=?')
      .bind(new Date().toISOString(), a.id)
      .run();
    await db.prepare('DELETE FROM sessions WHERE owner_id=?').bind(a.id).run();
    await db
      .prepare('INSERT INTO deletion_jobs(token_hash,complete,expires_at,owner_id) VALUES(?,0,?,?)')
      .bind('expired-progress-token', Date.now() - 1000, a.id)
      .run();
    await runDeletionSweep({
      DB: db,
      APP_ORIGIN: origin,
      GOOGLE_CLIENT_ID: '',
      CURSOR_SECRET: 'unused-by-deletion-sweep',
    });
    expect(await db.prepare('SELECT id FROM users WHERE id=?').bind(a.id).first()).toBeNull();
    expect(
      await db
        .prepare('SELECT complete,owner_id FROM deletion_jobs WHERE token_hash=?')
        .bind('expired-progress-token')
        .first(),
    ).toEqual({ complete: 1, owner_id: null });
  });
  it('revokes sessions and deletes every owned table', async () => {
    const a = await login('delete@test');
    await push(a, [mutation(a, 'idea', idea(a.id))]);
    const r = await request('/api/me', a, 'DELETE', { confirm: 'DELETE' });
    expect(r.status).toBe(200);
    const cookies = r.headers.getSetCookie();
    expect(
      cookies.some((cookie) => cookie.startsWith('park_session=') && cookie.includes('Max-Age=0')),
    ).toBe(true);
    const progressCookie = cookies.find((cookie) => cookie.startsWith('park_deletion='))!;
    expect(progressCookie).toContain('HttpOnly');
    const progress = await mf.dispatchFetch(origin + '/api/deletion', {
      headers: { Cookie: progressCookie.split(';')[0] },
    });
    expect(progress.status).toBe(200);
    expect(await progress.json()).toEqual({ complete: true });
    expect((await request('/api/me', a)).status).toBe(401);
    for (const table of [
      'ideas',
      'lots',
      'changes',
      'sessions',
      'sync_devices',
      'processed_mutations',
    ])
      expect(
        (await db
          .prepare(`SELECT count(*) n FROM ${table} WHERE owner_id=?`)
          .bind(a.id)
          .first<{ n: number }>())!.n,
      ).toBe(0);
  });
});
