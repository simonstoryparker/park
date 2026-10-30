import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { general } from '../shared/domain';
const code = await build({
  entryPoints: ['worker/index.ts'],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'browser',
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: code.outputFiles[0].text,
    compatibilityDate: '2026-07-30',
    d1Databases: ['DB'],
    bindings: {
      APP_ORIGIN: 'http://localhost:8787',
      DEV_AUTH: 'true',
      CURSOR_SECRET: 'benchmark-secret-at-least-32-characters',
      GOOGLE_CLIENT_ID: '',
    },
  }),
);
const db = await mf.getD1Database('DB');
const sql = await readFile('migrations/0001_initial.sql', 'utf8');
for (const s of sql.match(
  /CREATE TRIGGER[\s\S]*?END;(?=\s*(?:CREATE|$))|(?:PRAGMA|CREATE TABLE|CREATE (?:UNIQUE )?INDEX)[\s\S]*?;/g,
)!)
  await db.prepare(s).run();
await db.prepare(await readFile('migrations/0002_deletion_jobs.sql', 'utf8')).run();
for (const s of (await readFile('migrations/0003_metadata_indexes.sql', 'utf8'))
  .split(';')
  .filter((s) => s.trim()))
  await db.prepare(s).run();
const start = performance.now();
const samples = [];
let reads = 0,
  writes = 0,
  bytes = 0;
for (let n = 0; n < 100; n++) {
  const owner = crypto.randomUUID();
  const now = new Date().toISOString();
  const r = await db
    .prepare('INSERT INTO users VALUES(?,?,?,?,?,NULL)')
    .bind(owner, `benchmark-${n}`, `benchmark-${n}@example.test`, null, now)
    .run();
  reads += r.meta.rows_read;
  writes += r.meta.rows_written;
  const l = general(owner);
  const payload = JSON.stringify(l);
  bytes += Buffer.byteLength(payload);
  const t = performance.now();
  const seeded = await db
    .prepare(
      "INSERT INTO lots VALUES(?,?,'General','general',NULL,NULL,NULL,'soft','blue',0,0,NULL,?,?,1,NULL,?)",
    )
    .bind(owner, 'general', now, now, payload)
    .run();
  reads += seeded.meta.rows_read;
  writes += seeded.meta.rows_written;
  for (let k = 0; k < 5; k++) {
    const id = crypto.randomUUID();
    const item = {
      id,
      ownerId: owner,
      lotId: 'general',
      title: `Explore idea ${k}`,
      originalText: `Explore idea ${k}`,
      notes: '',
      status: 'parked',
      kind: 'idea',
      vehicleSize: k === 4 ? 'truck' : 'compact',
      createdAt: now,
      updatedAt: now,
      serverVersion: 1,
    };
    const p = JSON.stringify(item);
    bytes += Buffer.byteLength(p);
    const a = await db
      .prepare(
        "INSERT INTO ideas(id,owner_id,lot_id,original_text,title,notes,status,kind,vehicle_size,created_at,updated_at,version,payload) VALUES(?,?,'general',?,?,'','parked','idea',?,?,?,1,?)",
      )
      .bind(id, owner, item.originalText, item.title, item.vehicleSize, now, now, p)
      .run();
    reads += a.meta.rows_read;
    writes += a.meta.rows_written;
  }
  const pull = await db
    .prepare('SELECT payload FROM changes WHERE owner_id=? AND seq>? ORDER BY seq LIMIT 200')
    .bind(owner, 0)
    .all();
  reads += pull.meta.rows_read;
  writes += pull.meta.rows_written;
  samples.push(performance.now() - t);
}
const measured = {
  accounts: 100,
  ideas: 500,
  elapsedMs: performance.now() - start,
  p95AccountMs: samples.sort((a, b) => a - b)[Math.floor(samples.length * 0.95)],
  rowsRead: reads,
  rowsWritten: writes,
  payloadBytes: bytes,
};
const profile = {
  captures: 5,
  otherMutations: 3,
  syncSessions: 3,
  requests: 12,
  rowsRead: Math.ceil(reads / 100) + 160,
  rowsWritten: Math.ceil(writes / 100) + 65,
  storageBytesPerDay: Math.ceil(bytes / 100) + 12000,
};
const limits = {
  requests: 100000,
  reads: 5000000,
  writes: 100000,
  databaseBytes: 500 * 1000 * 1000,
};
const scenarios = [100, 1000, 10000].map((dau) => ({
  simulatedDailyActiveAccounts: dau,
  predictedRequests: dau * profile.requests,
  predictedReads: dau * profile.rowsRead,
  predictedWrites: dau * profile.rowsWritten,
  predictedStorageGrowthBytes: dau * profile.storageBytesPerDay,
  daysTo500MB: limits.databaseBytes / (dau * profile.storageBytesPerDay),
  bindingConstraint:
    'D1 writes (includes index/receipt/change overhead allowance); storage accumulates until 90-day metadata expiry',
}));
const report = {
  generatedAt: new Date().toISOString(),
  kind: 'Local D1 baseline plus workload forecast; not provider capacity measurement',
  measured,
  profile,
  limits,
  scenarios,
  providerMeasurements: 'NOT RUN: credentials, deployed CPU and production D1 metrics required',
  notes: [
    '100 accounts/500 inserts executed on local Miniflare D1. 1,000 and 10,000 DAU are arithmetic workload simulations, not concurrent-user load tests.',
    'Forecast allowances cover session authentication, rate-limit rows, receipts, indexes and 8 mutations/day. Validate against deployed endpoint metrics before inviting users.',
    'Local wall time is not Worker CPU time. Initial snapshots and existing storage are additional costs.',
  ],
};
await mkdir('docs/verification', { recursive: true });
await writeFile('docs/verification/load-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
await mf.dispose();
