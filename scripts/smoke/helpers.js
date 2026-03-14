/**
 * Shared utilities for the smoke test suite.
 * Consumed by all test modules and the runner.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('Missing .env file.');
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      continue;
    }

    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }

  return env;
}

function requireEnv() {
  const env = loadEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Missing required env keys: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  return { url, anonKey, serviceRoleKey };
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function createAnonClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function createAdminClient(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected: ${expected}, got: ${actual}`);
  }
}

// ---------------------------------------------------------------------------
// Test runner helper
// ---------------------------------------------------------------------------

async function runTest(name, fn) {
  const start = Date.now();
  await fn();
  console.log(`[smoke] PASS ${name} (${Date.now() - start}ms)`);
}

// ---------------------------------------------------------------------------
// User provisioning / cleanup
// ---------------------------------------------------------------------------

async function findAuthUserByEmail(admin, email) {
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const users = data?.users || [];
    const match = users.find((u) => u.email === email) || null;
    if (match) {
      return match;
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function ensureAuthUsersDeleted(admin, userIds) {
  for (const userId of userIds) {
    if (!userId) {
      continue;
    }

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error(`[cleanup] Failed to delete auth user ${userId}: ${error.message}`);
    } else {
      console.log(`[cleanup] Deleted auth user ${userId}`);
    }
  }
}

function isRateLimitError(error) {
  return String(error?.message || '').toLowerCase().includes('rate limit');
}

async function provisionUser(admin, url, anonKey, payload) {
  try {
    const { error } = await createAnonClient(url, anonKey).auth.signUp(payload);
    if (error) {
      throw error;
    }

    return { mode: 'signup' };
  } catch (err) {
    if (!isRateLimitError(err)) {
      throw err;
    }

    const { data, error: adminErr } = await admin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        username: payload.options?.data?.username || '',
        displayName: payload.options?.data?.displayName || '',
        city: payload.options?.data?.city || '',
      },
    });

    if (adminErr) {
      throw adminErr;
    }

    return { mode: 'admin-fallback', userId: data.user.id };
  }
}

/**
 * Provision two fresh smoke users for a test run.
 * Returns { clientA, clientB, loginA, loginB, userIds: [idA, idB] }
 *
 * Callers are responsible for calling ensureAuthUsersDeleted(admin, userIds) in a finally block.
 */
async function provisionSmokeUsers(admin, url, anonKey) {
  const runId = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const password = 'SmokeTest_123456';

  const userAPayload = {
    email: `smokea${runId}@examplemail.com`,
    password,
    options: { data: { username: `smoke_a_${runId}`, displayName: 'Smoke A', city: 'Berlin' } },
  };
  const userBPayload = {
    email: `smokeb${runId}@examplemail.com`,
    password,
    options: { data: { username: `smoke_b_${runId}`, displayName: 'Smoke B', city: 'Hamburg' } },
  };

  const resultA = await provisionUser(admin, url, anonKey, userAPayload);
  const resultB = await provisionUser(admin, url, anonKey, userBPayload);

  if (resultA.mode === 'admin-fallback' || resultB.mode === 'admin-fallback') {
    console.log('[smoke] signup rate limit hit, used admin fallback for provisioning');
  }

  const authUserA = await findAuthUserByEmail(admin, userAPayload.email);
  const authUserB = await findAuthUserByEmail(admin, userBPayload.email);

  assert(authUserA?.id, 'User A was not found in auth.users after provisioning.');
  assert(authUserB?.id, 'User B was not found in auth.users after provisioning.');

  await admin.auth.admin.updateUserById(authUserA.id, { email_confirm: true });
  await admin.auth.admin.updateUserById(authUserB.id, { email_confirm: true });

  const clientA = createAnonClient(url, anonKey);
  const clientB = createAnonClient(url, anonKey);

  const { data: loginA, error: errA } = await clientA.auth.signInWithPassword({
    email: userAPayload.email,
    password,
  });
  if (errA) {
    throw errA;
  }

  const { data: loginB, error: errB } = await clientB.auth.signInWithPassword({
    email: userBPayload.email,
    password,
  });
  if (errB) {
    throw errB;
  }

  return {
    clientA,
    clientB,
    loginA,
    loginB,
    userIds: [authUserA.id, authUserB.id],
    runId,
  };
}

module.exports = {
  requireEnv,
  createAnonClient,
  createAdminClient,
  assert,
  assertEqual,
  runTest,
  findAuthUserByEmail,
  ensureAuthUsersDeleted,
  provisionSmokeUsers,
};
