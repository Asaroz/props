/**
 * Creates 10 test users in the real Supabase project.
 *
 * Requirements:
 *   SUPABASE_SERVICE_ROLE_KEY must be set in .env
 *   (find it at: supabase.com/dashboard/project/meqotkhgdifeeldyhzwo/settings/api)
 *
 * Run:
 *   node scripts/create-test-users.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Read .env without requiring dotenv
// ---------------------------------------------------------------------------
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

const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '\nMissing required env variables.\n' +
    'Add SUPABASE_SERVICE_ROLE_KEY to your .env file.\n' +
    'Get it at: https://supabase.com/dashboard/project/meqotkhgdifeeldyhzwo/settings/api\n'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Admin client (bypasses RLS and email confirmation)
// ---------------------------------------------------------------------------
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Test users definition
// ---------------------------------------------------------------------------
const TEST_PASSWORD = '123456';

const TEST_USERS = [
  {
    email: 'tuser1@props.test',
    username: 'tuser1_nova',
    display_name: 'tuser1_Nova',
    city: 'Berlin',
    bio: 'UI tinkerer, late-night runner, and espresso maximalist.',
    avatar_url: 'https://api.dicebear.com/9.x/personas/svg?seed=nova',
  },
  {
    email: 'tuser2@props.test',
    username: 'tuser2_eli',
    display_name: 'tuser2_Eli',
    city: 'Hamburg',
    bio: 'Harbor walks, TypeScript, and playlists for every weather.',
    avatar_url: 'https://api.dicebear.com/9.x/personas/svg?seed=eli',
  },
  {
    email: 'tuser3@props.test',
    username: 'tuser3_rhea',
    display_name: 'tuser3_Rhea',
    city: 'München',
    bio: 'Pilates coach with a weakness for mystery novels.',
    avatar_url: 'https://api.dicebear.com/9.x/personas/svg?seed=rhea',
  },
  {
    email: 'tuser4@props.test',
    username: 'tuser4_kian',
    display_name: 'tuser4_Kian',
    city: 'Köln',
    bio: 'Street-food scout, hobby DJ, and serial idea starter.',
    avatar_url: 'https://api.dicebear.com/9.x/personas/svg?seed=kian',
  },
  {
    email: 'tuser5@props.test',
    username: 'tuser5_ivy',
    display_name: 'tuser5_Ivy',
    city: 'Frankfurt',
    bio: 'Urban gardener and balcony botanist with too many pots.',
    avatar_url: 'https://api.dicebear.com/9.x/personas/svg?seed=ivy',
  },
  {
    email: 'tuser6@props.test',
    username: 'tuser6_otto',
    display_name: 'tuser6_Otto',
    city: 'Dresden',
    bio: 'Museum hopper, sunrise cyclist, and notebook collector.',
    avatar_url: 'https://api.dicebear.com/9.x/personas/svg?seed=otto',
  },
  {
    email: 'tuser7@props.test',
    username: 'tuser7_zuri',
    display_name: 'tuser7_Zuri',
    city: 'Bremen',
    bio: 'Marine biology student who labels everything in color.',
    avatar_url: 'https://api.dicebear.com/9.x/personas/svg?seed=zuri',
  },
  {
    email: 'tuser8@props.test',
    username: 'tuser8_ryan',
    display_name: 'tuser8_Ryan',
    city: 'Stuttgart',
    bio: 'Garage by day, kitchen experiments by night.',
    avatar_url: 'https://api.dicebear.com/9.x/personas/svg?seed=ryan',
  },
  {
    email: 'tuser9@props.test',
    username: 'tuser9_mina',
    display_name: 'tuser9_Mina',
    city: 'Nürnberg',
    bio: 'Illustrator with a soft spot for zines and doodle margins.',
    avatar_url: 'https://api.dicebear.com/9.x/personas/svg?seed=mina',
  },
  {
    email: 'tuser10@props.test',
    username: 'tuser10_noah',
    display_name: 'tuser10_Noah',
    city: 'Leipzig',
    bio: 'Vinyl hunter, open-mic regular, and chronic late riser.',
    avatar_url: 'https://api.dicebear.com/9.x/personas/svg?seed=noah',
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Creating / updating ${TEST_USERS.length} test users in ${SUPABASE_URL}\n`);

  // Fetch existing users once
  const { data: existingData } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existingByEmail = Object.fromEntries(
    (existingData?.users ?? []).map((u) => [u.email, u])
  );

  for (const user of TEST_USERS) {
    let userId;

    if (existingByEmail[user.email]) {
      userId = existingByEmail[user.email].id;
      console.log(`  SKIP  ${user.email} (auth user already exists)`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: user.email,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { username: user.username, display_name: user.display_name },
      });

      if (error) {
        console.error(`  FAIL  ${user.email}: ${error.message}`);
        continue;
      }
      userId = data.user.id;
      console.log(`  OK    ${user.email}  (id: ${userId})`);
    }

    // Upsert rich profile — overwrites whatever the DB trigger auto-generated
    const { error: profileError } = await admin
      .from('profiles')
      .upsert(
        {
          id: userId,
          email: user.email,
          username: user.username,
          display_name: user.display_name,
          city: user.city,
          bio: user.bio,
          avatar_url: user.avatar_url,
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      console.error(`  PROFILE FAIL  ${user.email}: ${profileError.message}`);
    } else {
      console.log(`  PROFILE OK  ${user.username} — ${user.city}`);
    }
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
