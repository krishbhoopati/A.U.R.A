// Quick Vultr connectivity test
// Run with: node scripts/test-vultr.mjs

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// ── Load .env.local manually ──────────────────────────────────────────────────
const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌  .env.local not found at project root');
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  let val = trimmed.slice(idx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const require = createRequire(import.meta.url);

// ── 1. PostgreSQL ─────────────────────────────────────────────────────────────
async function testPostgres() {
  console.log('\n🔵  Testing Vultr PostgreSQL...');
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });
  try {
    // 1a. Basic connectivity
    const { rows } = await pool.query('SELECT NOW() AS now');
    console.log('   ✅  Connected. Server time:', rows[0].now);

    // 1b. Check tables exist
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('jobs','scenes')
       ORDER BY table_name`
    );
    const found = tables.rows.map(r => r.table_name);
    for (const t of ['jobs', 'scenes']) {
      if (found.includes(t)) {
        console.log(`   ✅  Table "${t}" exists`);
      } else {
        console.log(`   ❌  Table "${t}" MISSING — run migrations/002_floorplan_ai_schema.sql`);
      }
    }

    // 1c. Row counts
    for (const t of found) {
      const { rows: cnt } = await pool.query(`SELECT COUNT(*) AS n FROM ${t}`);
      console.log(`   ℹ️   ${t}: ${cnt[0].n} rows`);
    }
  } catch (err) {
    console.error('   ❌  PostgreSQL error:', err.message);
  } finally {
    await pool.end();
  }
}

// ── 2. Vultr Object Storage ───────────────────────────────────────────────────
async function testStorage() {
  console.log('\n🟠  Testing Vultr Object Storage...');
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListBucketsCommand } = require('@aws-sdk/client-s3');

  const s3 = new S3Client({
    endpoint: process.env.VULTR_STORAGE_ENDPOINT,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.VULTR_STORAGE_ACCESS_KEY,
      secretAccessKey: process.env.VULTR_STORAGE_SECRET_KEY,
    },
    forcePathStyle: true,
  });

  const bucket = process.env.VULTR_STORAGE_BUCKET;
  const testKey = 'test/connectivity-check.txt';
  const testBody = `Vultr connectivity test — ${new Date().toISOString()}`;

  try {
    // 2a. List buckets (credentials check)
    await s3.send(new ListBucketsCommand({}));
    console.log('   ✅  Credentials valid');

    // 2b. Upload a small test file
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: testBody,
      ContentType: 'text/plain',
      ACL: 'public-read',
    }));
    console.log(`   ✅  Upload to bucket "${bucket}" succeeded`);

    // 2c. Read it back
    const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: testKey }));
    const chunks = [];
    for await (const chunk of get.Body) chunks.push(chunk);
    const content = Buffer.concat(chunks).toString('utf-8');
    if (content === testBody) {
      console.log('   ✅  Read-back matches — public-read ACL working');
    } else {
      console.log('   ⚠️   Content mismatch on read-back');
    }

    // 2d. Check public URL is reachable
    const publicUrl = `${process.env.VULTR_STORAGE_ENDPOINT}/${bucket}/${testKey}`;
    const res = await fetch(publicUrl);
    if (res.ok) {
      console.log('   ✅  Public URL accessible:', publicUrl);
    } else {
      console.log(`   ⚠️   Public URL returned ${res.status} — bucket may not be set to public read`);
    }

    // 2e. Clean up test file
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    console.log('   ✅  Test file cleaned up');

  } catch (err) {
    console.error('   ❌  Object Storage error:', err.message);
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('=== Vultr Connectivity Test ===');
await testPostgres();
await testStorage();
console.log('\n✅  Done.\n');
