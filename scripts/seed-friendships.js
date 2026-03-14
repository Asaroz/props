/**
 * Seed random friendships between the 10 test users.
 *
 * Uses the service-role key to bypass RLS and insert directly into `friendships`.
 * Skips pairs that already exist. Safe to run multiple times.
 *
 * Run:
 *   node scripts/seed-friendships.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

const env = loadEnv();
const { EXPO_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = env;
if (!url || !serviceKey) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── test user emails ──────────────────────────────────────────────────────────
const TEST_EMAILS = Array.from({ length: 10 }, (_, i) => `tuser${i + 1}@props.test`);

// ── random pair selection ─────────────────────────────────────────────────────
// Build all 45 possible pairs and shuffle; keep ~22 (~half).
function buildPairs(ids) {
  const pairs = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push([ids[i], ids[j]]);
    }
  }
  // Fisher-Yates shuffle
  for (let k = pairs.length - 1; k > 0; k--) {
    const r = Math.floor(Math.random() * (k + 1));
    [pairs[k], pairs[r]] = [pairs[r], pairs[k]];
  }
  return pairs.slice(0, 22); // keeps ~half for a realistic network
}

async function main() {
  // 1. Resolve UUIDs via profiles table
  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, username, email')
    .in('email', TEST_EMAILS);

  if (pErr) throw pErr;
  if (!profiles || profiles.length === 0) throw new Error('No test-user profiles found.');

  console.log(`Found ${profiles.length} profiles.`);

  const ids = profiles.map((p) => p.id);
  const pairs = buildPairs(ids);

  // 2. Insert friendships – use least/greatest so the unique idx is happy
  let created = 0;
  let skipped = 0;

  for (const [a, b] of pairs) {
    const userOneId = a < b ? a : b;
    const userTwoId = a < b ? b : a;

    const { error } = await admin
      .from('friendships')
      .insert({ user_one_id: userOneId, user_two_id: userTwoId });

    if (error) {
      if (error.code === '23505') {
        // unique violation – already friends
        skipped++;
      } else {
        console.error(`  ERR [${userOneId} ↔ ${userTwoId}]:`, error.message);
      }
    } else {
      const nameA = profiles.find((p) => p.id === a)?.username ?? a;
      const nameB = profiles.find((p) => p.id === b)?.username ?? b;
      console.log(`  ✓ ${nameA} ↔ ${nameB}`);
      created++;
    }
  }

  console.log(`\nDone. Created: ${created}, skipped (already existed): ${skipped}`);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});