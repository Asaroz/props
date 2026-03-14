/**
 * Frontend scaffold smoke for issue #28 return-route wiring.
 *
 * Static low-load check (no backend calls):
 * - GroupDetail must pass return route params when navigating to GiveProps.
 * - AppNavigator must respect returnTo / returnParams for GiveProps back action.
 *
 * Run:
 *   node scripts/smoke/test-groups-return-route.js
 */

const fs = require('fs');
const path = require('path');

function readUtf8(relativePath) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  return fs.readFileSync(absolutePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(content, needle, contextLabel) {
  assert(content.includes(needle), `${contextLabel}: missing "${needle}"`);
}

function run() {
  console.log('[smoke-groups-return-route] low-load mode: static return-route checks');

  const detailSource = readUtf8('src/screens/GroupDetailScreen.js');
  const navigatorSource = readUtf8('src/navigation/AppNavigator.js');

  assertIncludes(detailSource, "onNavigate('giveProps'", 'GroupDetailScreen');
  assertIncludes(detailSource, "returnTo: 'groupDetail'", 'GroupDetailScreen');
  assertIncludes(detailSource, "returnParams: { groupId }", 'GroupDetailScreen');

  assertIncludes(navigatorSource, "const requestedReturnScreen = String(screenParams?.returnTo || '').trim();", 'AppNavigator');
  assertIncludes(navigatorSource, "ALLOWED_RETURN_SCREENS.has(requestedReturnScreen)", 'AppNavigator');
  assertIncludes(navigatorSource, "const returnToParams = screenParams?.returnParams || null;", 'AppNavigator');
  assertIncludes(navigatorSource, "? () => handleBackTo(returnToScreen, returnToParams)", 'AppNavigator');

  console.log('[smoke-groups-return-route] PASS: GiveProps return route scaffold is wired.');
}

try {
  run();
} catch (error) {
  console.error('[smoke-groups-return-route] FAIL:', error.message || error);
  process.exitCode = 1;
}
