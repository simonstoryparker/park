import type { D1Database } from '@cloudflare/workers-types';
import { verifyGoogleCredential } from './auth';
import {
  general,
  mutationSchema,
  validateRecord,
  getLotStatus,
  units,
  type Mutation,
  type MutationResult,
  type RecordValue,
  type Idea,
  type Lot,
} from '../shared/domain';
export interface Env {
  DB: D1Database;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  APP_ORIGIN: string;
  GOOGLE_CLIENT_ID: string;
  CURSOR_SECRET: string;
  DEV_AUTH?: string;
  DEV_ORIGINS?: string;
}
const encoder = new TextEncoder();
const day = 86400000;
const json = (data: unknown, status = 200, headers: HeadersInit = {}) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json');
  responseHeaders.set('Cache-Control', 'no-store');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
};
const hash = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s))), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
const token = () => crypto.randomUUID() + crypto.randomUUID();
const cookie = (req: Request, name: string) =>
  req.headers
    .get('Cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1);
const local = (url: URL) => ['localhost', '127.0.0.1'].includes(url.hostname);
const sessionCookie = (value: string, url: URL, age = 2592000) =>
  `park_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${local(url) ? '' : '; Secure'}`;
function fail(code: string, status = 400): never {
  throw Object.assign(new Error(code), { status, code });
}
async function body(req: Request) {
  if (Number(req.headers.get('Content-Length') ?? 0) > 262144) fail('payload_too_large', 413);
  const text = await req.text();
  if (encoder.encode(text).length > 262144) fail('payload_too_large', 413);
  try {
    return JSON.parse(text);
  } catch {
    fail('invalid_json');
  }
}
async function rate(env: Env, key: string, limit: number, windowMs = 60000, amount = 1) {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const r = await env.DB.prepare(
    'INSERT INTO rate_limits(key,count,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=count+excluded.count RETURNING count',
  )
    .bind(`${key}:${window}`, amount, now + windowMs * 2)
    .first<{ count: number }>();
  if (r!.count > limit) fail('rate_limited', 429);
}
async function sign(env: Env, data: unknown) {
  if (!env.CURSOR_SECRET || env.CURSOR_SECRET.length < 32) fail('server_not_configured', 503);
  const encoded = btoa(JSON.stringify(data));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.CURSOR_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(encoded));
  return `${encoded}.${Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
async function unsign(env: Env, value: string, owner: string) {
  try {
    const [part] = value.split('.');
    const data = JSON.parse(atob(part));
    if ((await sign(env, data)) !== value || data.owner !== owner) fail('invalid_cursor');
    return data as {
      owner: string;
      seq: number;
      afterEntity?: string;
      afterId?: string;
      issued: number;
    };
  } catch {
    fail('invalid_cursor');
  }
}
async function current(env: Env, owner: string, entity: 'idea' | 'lot', id: string) {
  const row = await env.DB.prepare(
    `SELECT payload,version,deleted_at FROM ${entity === 'idea' ? 'ideas' : 'lots'} WHERE owner_id=? AND id=?`,
  )
    .bind(owner, id)
    .first<{ payload: string; version: number; deleted_at: string | null }>();
  return row
    ? {
        record: row.deleted_at
          ? null
          : ({ ...JSON.parse(row.payload), serverVersion: row.version } as RecordValue),
        version: row.version,
      }
    : null;
}
const lotColumns = [
  'owner_id',
  'id',
  'name',
  'name_key',
  'start_on',
  'end_exclusive',
  'capacity',
  'capacity_policy',
  'accent',
  'sort_order',
  'is_archived',
  'ended_prompt_dismissed_for',
  'created_at',
  'updated_at',
  'version',
  'deleted_at',
  'payload',
];
const ideaColumns = [
  'owner_id',
  'id',
  'lot_id',
  'original_text',
  'title',
  'notes',
  'status',
  'kind',
  'vehicle_size',
  'revisit_on',
  'date_precision',
  'date_label',
  'created_at',
  'updated_at',
  'activated_at',
  'archived_at',
  'archive_reason',
  'version',
  'deleted_at',
  'payload',
];
function values(entity: 'idea' | 'lot', r: RecordValue, version: number, deleted: string | null) {
  const payload = JSON.stringify({ ...r, serverVersion: version });
  if (entity === 'lot') {
    const l = r as Lot;
    return [
      l.ownerId,
      l.id,
      l.name,
      l.nameKey,
      l.startOn,
      l.endExclusive,
      l.capacity,
      l.capacityPolicy,
      l.accent,
      l.sortOrder,
      Number(l.isArchived),
      l.endedPromptDismissedFor,
      l.createdAt,
      l.updatedAt,
      version,
      deleted,
      payload,
    ];
  }
  const i = r as Idea;
  return [
    i.ownerId,
    i.id,
    i.lotId,
    i.originalText,
    i.title,
    i.notes,
    i.status,
    i.kind,
    i.vehicleSize,
    i.revisitOn,
    i.datePrecision,
    i.dateLabel,
    i.createdAt,
    i.updatedAt,
    i.activatedAt,
    i.archivedAt,
    i.archiveReason,
    version,
    deleted,
    payload,
  ];
}
async function seed(env: Env, owner: string) {
  const l = general(owner);
  const cols = lotColumns;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO lots(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
  )
    .bind(...values('lot', l, 1, null))
    .run();
}
async function mutate(env: Env, owner: string, m: Mutation): Promise<MutationResult> {
  const payloadHash = await hash(JSON.stringify(m));
  const prior = await env.DB.prepare(
    'SELECT payload_hash,result FROM processed_mutations WHERE owner_id=? AND mutation_id=?',
  )
    .bind(owner, m.mutationId)
    .first<{ payload_hash: string; result: string }>();
  if (prior)
    return prior.payload_hash === payloadHash
      ? JSON.parse(prior.result)
      : { mutationId: m.mutationId, outcome: 'invalid', code: 'mutation_id_reused' };
  const receipt = async (result: MutationResult) => {
    await env.DB.prepare('INSERT OR IGNORE INTO processed_mutations VALUES(?,?,?,?,?)')
      .bind(owner, m.mutationId, payloadHash, JSON.stringify(result), Date.now())
      .run();
    return result;
  };
  const device = await env.DB.prepare(
    'SELECT id FROM sync_devices WHERE owner_id=? AND id=? AND expires_at>?',
  )
    .bind(owner, m.deviceId, Date.now())
    .first();
  if (!device)
    return receipt({ mutationId: m.mutationId, outcome: 'blocked', code: 'device_expired' });
  const old = await current(env, owner, m.entity, m.entityId);
  const base = old?.record;
  if (
    m.baseVersion !== (old?.version ?? 0) ||
    (m.operation === 'create' && old) ||
    (m.operation !== 'create' && !base)
  )
    return receipt({
      mutationId: m.mutationId,
      outcome: 'conflict',
      code: 'stale_base',
      record: base ?? undefined,
      version: old?.version,
    });
  try {
    if (Object.keys(m.patch).some((k) => ['ownerId', 'serverVersion', 'id'].includes(k)))
      fail('forbidden_field');
    const schemaKeys =
      m.entity === 'lot'
        ? Object.keys(general(owner))
        : Object.keys({
            id: 0,
            ownerId: 0,
            originalText: 0,
            title: 0,
            notes: 0,
            status: 0,
            kind: 0,
            vehicleSize: 0,
            lotId: 0,
            revisitOn: 0,
            datePrecision: 0,
            dateLabel: 0,
            createdAt: 0,
            updatedAt: 0,
            activatedAt: 0,
            archivedAt: 0,
            archiveReason: 0,
            serverVersion: 0,
          });
    if (Object.keys(m.patch).some((k) => !schemaKeys.includes(k))) fail('unknown_field');
    const next = validateRecord(m.entity, {
      ...base,
      ...m.patch,
      id: m.entityId,
      ownerId: owner,
      serverVersion: m.baseVersion + 1,
    });
    if (m.entity === 'idea' && m.operation !== 'delete') {
      const i = next as Idea;
      const l = await current(env, owner, 'lot', i.lotId);
      if (!l?.record) fail('lot_not_found');
      const before = base as Idea | undefined;
      if (
        i.status === 'parked' &&
        (!before ||
          before.status !== 'parked' ||
          before.lotId !== i.lotId ||
          units(i) > units(before)) &&
        getLotStatus(l.record as Lot) === 'Ended'
      )
        fail('lot_ended');
    }
    if (m.entity === 'lot' && m.operation === 'delete') {
      if (next.id === 'general') fail('general_protected');
      const count = await env.DB.prepare(
        'SELECT count(*) AS n FROM ideas WHERE owner_id=? AND lot_id=? AND deleted_at IS NULL',
      )
        .bind(owner, next.id)
        .first<{ n: number }>();
      if (count!.n) fail('lot_has_ideas');
    }
    const table = m.entity === 'idea' ? 'ideas' : 'lots',
      cols = m.entity === 'idea' ? ideaColumns : lotColumns;
    const version = m.baseVersion + 1;
    const v = values(
      m.entity,
      next,
      version,
      m.operation === 'delete' ? new Date().toISOString() : null,
    );
    const stmt =
      m.operation === 'create'
        ? env.DB.prepare(
            `INSERT OR IGNORE INTO ${table}(${cols.join(',')}) SELECT ${cols.map(() => '?').join(',')} WHERE NOT EXISTS(SELECT 1 FROM processed_mutations WHERE owner_id=? AND mutation_id=?)`,
          ).bind(...v, owner, m.mutationId)
        : env.DB.prepare(
            `UPDATE ${table} SET ${cols
              .slice(2)
              .map((c) => `${c}=?`)
              .join(
                ',',
              )} WHERE owner_id=? AND id=? AND version=? AND NOT EXISTS(SELECT 1 FROM processed_mutations WHERE owner_id=? AND mutation_id=?)`,
          ).bind(...v.slice(2), owner, m.entityId, m.baseVersion, owner, m.mutationId);
    const accepted: MutationResult = {
      mutationId: m.mutationId,
      outcome: 'accepted',
      version,
      record: m.operation === 'delete' ? undefined : { ...next, serverVersion: version },
    };
    const conflict: MutationResult = {
      mutationId: m.mutationId,
      outcome: 'conflict',
      code: 'stale_base',
    };
    await env.DB.batch([
      stmt,
      env.DB.prepare(
        `INSERT OR IGNORE INTO processed_mutations VALUES(?,?,?,CASE WHEN changes()=1 THEN ? ELSE json_set(?, '$.record',json((SELECT payload FROM ${table} WHERE owner_id=? AND id=? AND deleted_at IS NULL)), '$.version',(SELECT version FROM ${table} WHERE owner_id=? AND id=?)) END,?)`,
      ).bind(
        owner,
        m.mutationId,
        payloadHash,
        JSON.stringify(accepted),
        JSON.stringify(conflict),
        owner,
        m.entityId,
        owner,
        m.entityId,
        Date.now(),
      ),
    ]);
    const stored = await env.DB.prepare(
      'SELECT payload_hash,result FROM processed_mutations WHERE owner_id=? AND mutation_id=?',
    )
      .bind(owner, m.mutationId)
      .first<{ payload_hash: string; result: string }>();
    if (stored!.payload_hash !== payloadHash)
      return { mutationId: m.mutationId, outcome: 'invalid', code: 'mutation_id_reused' };
    const result = JSON.parse(stored!.result) as MutationResult;
    return result;
  } catch (e) {
    const message = String(e);
    return receipt({
      mutationId: m.mutationId,
      outcome: message.includes('strict_capacity') ? 'capacity' : 'invalid',
      code: message.includes('strict_capacity')
        ? 'strict_capacity'
        : message.includes('UNIQUE')
          ? 'duplicate_name'
          : 'validation_failed',
      record: base ?? undefined,
    });
  }
}
async function cleanDeletion(env: Env, credentialHash: string, background = false) {
  const job = await env.DB.prepare(
    'SELECT owner_id,complete FROM deletion_jobs WHERE token_hash=? AND expires_at>?',
  )
    .bind(credentialHash, background ? 0 : Date.now())
    .first<{ owner_id: string; complete: number }>();
  if (!job) fail('unauthorized', 401);
  if (job.complete) return true;
  const owner = job.owner_id;
  await env.DB.batch(
    ['ideas', 'changes', 'processed_mutations', 'sync_devices'].map((table) =>
      env.DB.prepare(
        `DELETE FROM ${table} WHERE rowid IN(SELECT rowid FROM ${table} WHERE owner_id=? LIMIT 200)`,
      ).bind(owner),
    ),
  );
  const remaining = await env.DB.prepare(
    'SELECT (SELECT count(*) FROM ideas WHERE owner_id=?)+(SELECT count(*) FROM changes WHERE owner_id=?)+(SELECT count(*) FROM processed_mutations WHERE owner_id=?)+(SELECT count(*) FROM sync_devices WHERE owner_id=?) AS n',
  )
    .bind(owner, owner, owner, owner)
    .first<{ n: number }>();
  if (remaining!.n) return false;
  await env.DB.prepare(
    'DELETE FROM lots WHERE rowid IN(SELECT rowid FROM lots WHERE owner_id=? LIMIT 200)',
  )
    .bind(owner)
    .run();
  const lots = await env.DB.prepare('SELECT count(*) n FROM lots WHERE owner_id=?')
    .bind(owner)
    .first<{ n: number }>();
  if (lots!.n) return false;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM users WHERE id=?').bind(owner),
    env.DB.prepare(
      'UPDATE deletion_jobs SET complete=1,owner_id=NULL WHERE owner_id=? OR token_hash=?',
    ).bind(owner, credentialHash),
  ]);
  return true;
}
export async function runDeletionSweep(env: Env) {
  const jobs = await env.DB.prepare(
    'SELECT token_hash FROM deletion_jobs WHERE complete=0 ORDER BY expires_at LIMIT 2',
  ).all<{ token_hash: string }>();
  for (const job of jobs.results) await cleanDeletion(env, job.token_hash, true);
}
export default {
  async scheduled(_event: unknown, env: Env) {
    await runDeletionSweep(env);
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/'))
      return env.ASSETS?.fetch(req) ?? new Response('Not found', { status: 404 });
    try {
      if (url.origin !== env.APP_ORIGIN && !local(url)) fail('host_rejected', 403);
      if (url.protocol !== 'https:' && !local(url)) fail('https_required', 403);
      if (!['GET', 'HEAD'].includes(req.method)) {
        const origin = req.headers.get('Origin');
        const sameOriginDemo =
          env.DEV_AUTH === 'true' &&
          local(url) &&
          origin !== null &&
          (origin === url.origin ||
            (env.DEV_ORIGINS ?? '')
              .split(',')
              .map((value) => value.trim())
              .includes(origin));
        if (origin !== env.APP_ORIGIN && !sameOriginDemo) fail('origin_rejected', 403);
        if (req.headers.get('Content-Type')?.split(';')[0] !== 'application/json')
          fail('json_required', 415);
      }
      const path = url.pathname;
      const now = Date.now();
      if (path === '/api/auth/challenge' && req.method === 'GET') {
        await rate(env, `login:${req.headers.get('CF-Connecting-IP') ?? 'local'}`, 20);
        const t = token(),
          nonce = token();
        await env.DB.prepare('INSERT INTO challenges VALUES(?,?,?)')
          .bind(await hash(t), nonce, now + 300000)
          .run();
        return json({ nonce, clientId: env.GOOGLE_CLIENT_ID }, 200, {
          'Set-Cookie': `park_challenge=${t}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=300${local(url) ? '' : '; Secure'}`,
        });
      }
      if (path === '/api/auth/google' && req.method === 'POST') {
        await rate(env, `login:${req.headers.get('CF-Connecting-IP') ?? 'local'}`, 20);
        const b = await body(req);
        const ch = await env.DB.prepare(
          'DELETE FROM challenges WHERE token_hash=? AND expires_at>? RETURNING nonce',
        )
          .bind(await hash(cookie(req, 'park_challenge') ?? ''), now)
          .first<{ nonce: string }>();
        if (!ch) fail('invalid_challenge', 401);
        let sub: string,
          email: string,
          avatar: string | null = null;
        if (local(url) && env.DEV_AUTH === 'true' && b.devEmail) {
          email = String(b.devEmail);
          sub = `development:${email}`;
        } else {
          if (!env.GOOGLE_CLIENT_ID) fail('google_not_configured', 503);
          const identity = await verifyGoogleCredential(
            b.credential,
            env.GOOGLE_CLIENT_ID,
            ch.nonce,
          );
          sub = identity.sub;
          email = identity.email;
          avatar = identity.avatar;
        }
        await env.DB.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?,?,NULL)')
          .bind(crypto.randomUUID(), sub, email, avatar, new Date().toISOString())
          .run();
        const user = await env.DB.prepare(
          'SELECT id,email,avatar,deleted_at FROM users WHERE google_sub=?',
        )
          .bind(sub)
          .first<{ id: string; email: string; avatar: string | null; deleted_at: string | null }>();
        if (user!.deleted_at) {
          const t = token();
          await env.DB.prepare(
            'INSERT INTO deletion_jobs(token_hash,complete,expires_at,owner_id) VALUES(?,0,?,?)',
          )
            .bind(await hash(t), now + 3600000, user!.id)
            .run();
          return json({ deleting: true }, 202, {
            'Set-Cookie': `park_deletion=${t}; HttpOnly; SameSite=Lax; Path=/api/deletion; Max-Age=3600${local(url) ? '' : '; Secure'}`,
          });
        }
        await seed(env, user!.id);
        const t = token(),
          csrf = token();
        await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)')
          .bind(await hash(t), user!.id, csrf, now + 30 * day, now, now)
          .run();
        return json(
          { user: { id: user!.id, email: user!.email, avatar: user!.avatar }, csrf },
          200,
          { 'Set-Cookie': sessionCookie(t, url) },
        );
      }
      if (path === '/api/deletion') {
        const t = req.headers.get('X-Deletion-Token') ?? cookie(req, 'park_deletion') ?? '';
        return json({ complete: await cleanDeletion(env, await hash(t)) });
      }
      const session = await env.DB.prepare(
        'SELECT s.*,u.email,u.avatar FROM sessions s JOIN users u ON u.id=s.owner_id WHERE token_hash=? AND expires_at>? AND u.deleted_at IS NULL',
      )
        .bind(await hash(cookie(req, 'park_session') ?? ''), now)
        .first<{
          owner_id: string;
          csrf: string;
          authenticated_at: number;
          email: string;
          avatar: string | null;
        }>();
      if (!session) fail('unauthorized', 401);
      const owner = session.owner_id;
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.get('X-CSRF-Token') !== session.csrf)
        fail('csrf_rejected', 403);
      await rate(env, `account:${owner}`, 120);
      if (path === '/api/me' && req.method === 'GET')
        return json({
          user: { id: owner, email: session.email, avatar: session.avatar },
          csrf: session.csrf,
        });
      if (path === '/api/auth/logout' || path === '/api/auth/logout-all') {
        if (req.method !== 'POST') fail('method_not_allowed', 405);
        await env.DB.prepare(
          path.endsWith('-all')
            ? 'DELETE FROM sessions WHERE owner_id=?'
            : 'DELETE FROM sessions WHERE token_hash=?',
        )
          .bind(path.endsWith('-all') ? owner : await hash(cookie(req, 'park_session') ?? ''))
          .run();
        return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', url, 0) });
      }
      if (path === '/api/me' && req.method === 'DELETE') {
        if (now - session.authenticated_at > 300000) fail('fresh_auth_required', 403);
        const b = await body(req);
        if (b.confirm !== 'DELETE') fail('confirmation_required');
        const t = token();
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET deleted_at=? WHERE id=?').bind(
            new Date().toISOString(),
            owner,
          ),
          env.DB.prepare('DELETE FROM sessions WHERE owner_id=?').bind(owner),
          env.DB.prepare(
            'INSERT INTO deletion_jobs(token_hash,complete,expires_at,owner_id) VALUES(?,0,?,?)',
          ).bind(await hash(t), now + 3600000, owner),
        ]);
        return json({ deletionToken: t, complete: await cleanDeletion(env, await hash(t)) }, 200, [
          ['Set-Cookie', sessionCookie('', url, 0)],
          [
            'Set-Cookie',
            `park_deletion=${t}; HttpOnly; SameSite=Lax; Path=/api/deletion; Max-Age=3600${local(url) ? '' : '; Secure'}`,
          ],
        ]);
      }
      if (path === '/api/devices' && req.method === 'POST') {
        await env.DB.prepare('DELETE FROM sync_devices WHERE owner_id=? AND expires_at<?')
          .bind(owner, now)
          .run();
        const id = crypto.randomUUID(),
          expiresAt = now + 90 * day;
        const r = await env.DB.prepare(
          'INSERT INTO sync_devices SELECT ?,?,?,? WHERE (SELECT count(*) FROM sync_devices WHERE owner_id=?)<20',
        )
          .bind(owner, id, now, expiresAt, owner)
          .run();
        if (!r.meta.changes) fail('device_limit', 409);
        return json({ id, expiresAt });
      }
      if (path === '/api/sync' && req.method === 'POST') {
        const b = await body(req);
        if (!Array.isArray(b.mutations) || b.mutations.length > 5) fail('batch_limit');
        await rate(env, `mutations:${owner}`, 500, day, b.mutations.length);
        const results = [];
        const blockedLots = new Set<string>();
        for (const raw of b.mutations) {
          const parsed = mutationSchema.safeParse(raw);
          if (!parsed.success) fail('invalid_mutation');
          const m = parsed.data;
          if (m.entity === 'idea' && blockedLots.has(String(m.patch.lotId))) {
            results.push({ mutationId: m.mutationId, outcome: 'blocked', code: 'lot_conflict' });
            continue;
          }
          const result = await mutate(env, owner, m);
          results.push(result);
          if (m.entity === 'lot' && result.outcome !== 'accepted') blockedLots.add(m.entityId);
        }
        await env.DB.batch([
          env.DB.prepare(
            'DELETE FROM processed_mutations WHERE rowid IN(SELECT rowid FROM processed_mutations WHERE created_at<? LIMIT 100)',
          ).bind(now - 90 * day),
          env.DB.prepare(
            'DELETE FROM changes WHERE seq IN(SELECT seq FROM changes WHERE changed_at<? LIMIT 100)',
          ).bind(now - 90 * day),
          env.DB.prepare(
            'DELETE FROM rate_limits WHERE key IN(SELECT key FROM rate_limits WHERE expires_at<? LIMIT 100)',
          ).bind(now),
          env.DB.prepare(
            'DELETE FROM challenges WHERE token_hash IN(SELECT token_hash FROM challenges WHERE expires_at<? LIMIT 100)',
          ).bind(now),
          env.DB.prepare('DELETE FROM deletion_jobs WHERE complete=1 AND expires_at<?').bind(now),
          env.DB.prepare(
            'DELETE FROM sessions WHERE token_hash IN(SELECT token_hash FROM sessions WHERE owner_id=? AND expires_at<? LIMIT 100)',
          ).bind(owner, now),
        ]);
        return json({ results });
      }
      if (path === '/api/sync' && req.method === 'GET') {
        const cursor = await unsign(env, url.searchParams.get('cursor') ?? '', owner);
        if (cursor.issued < now - 90 * day) fail('cursor_expired', 410);
        const r = await env.DB.prepare(
          'SELECT * FROM changes WHERE owner_id=? AND seq>? ORDER BY seq LIMIT 201',
        )
          .bind(owner, cursor.seq)
          .all<{
            seq: number;
            entity_type: 'idea' | 'lot';
            entity_id: string;
            payload: string | null;
          }>();
        const rows = r.results.slice(0, 200);
        return json({
          changes: rows.map((c) => ({
            entity: c.entity_type,
            id: c.entity_id,
            record: c.payload ? JSON.parse(c.payload) : null,
          })),
          nextCursor: await sign(env, { owner, seq: rows.at(-1)?.seq ?? cursor.seq, issued: now }),
          hasMore: r.results.length > 200,
        });
      }
      if (path === '/api/snapshot' && req.method === 'GET') {
        const provided = url.searchParams.get('token');
        const c = provided ? await unsign(env, provided, owner) : null;
        const result = await env.DB.batch([
          env.DB.prepare('SELECT coalesce(max(seq),0) AS seq FROM changes WHERE owner_id=?').bind(
            owner,
          ),
          env.DB.prepare(
            "SELECT 'lot' AS entity,id,payload FROM lots WHERE owner_id=? AND deleted_at IS NULL AND ('lot'>? OR ('lot'=? AND id>?)) UNION ALL SELECT 'idea' AS entity,id,payload FROM ideas WHERE owner_id=? AND deleted_at IS NULL AND ('idea'>? OR ('idea'=? AND id>?)) ORDER BY entity,id LIMIT 201",
          ).bind(
            owner,
            c?.afterEntity ?? '',
            c?.afterEntity ?? '',
            c?.afterId ?? '',
            owner,
            c?.afterEntity ?? '',
            c?.afterEntity ?? '',
            c?.afterId ?? '',
          ),
        ]);
        const seq = (result[0].results[0] as { seq: number }).seq;
        if (c && c.seq !== seq) fail('snapshot_restart', 409);
        const rows = result[1].results as { entity: string; id: string; payload: string }[];
        return json({
          records: rows
            .slice(0, 200)
            .map((r) => ({ entity: r.entity, record: JSON.parse(r.payload) })),
          nextToken:
            rows.length > 200
              ? await sign(env, {
                  owner,
                  seq,
                  afterEntity: rows[199].entity,
                  afterId: rows[199].id,
                  issued: now,
                })
              : null,
          cursor: await sign(env, { owner, seq, issued: now }),
        });
      }
      fail('not_found', 404);
    } catch (e) {
      const error = e as { status?: number; code?: string };
      const status =
        error.status ??
        (String(e).includes('JWT') ||
        String(e).includes('JWS') ||
        String(e).includes('invalid_identity')
          ? 401
          : 503);
      return json(
        {
          error: error.code ?? (status === 401 ? 'invalid_identity' : 'service_unavailable'),
          code: error.code ?? 'service_unavailable',
        },
        status,
        status === 429 ? { 'Retry-After': '60' } : {},
      );
    }
  },
};
