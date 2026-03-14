/**
 * Frontend scaffold smoke for issue #28 group navigation wiring.
 *
 * This is a static low-load smoke check (no backend calls).
 * It ensures key route names and entry points exist so basic screenflow does not regress.
 *
 * Run:
 *   node scripts/smoke/test-groups-navigation.js
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

function assertFileExists(relativePath) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  assert(fs.existsSync(absolutePath), `Missing required file: ${relativePath}`);
}

function run() {
  console.log('[smoke-groups-navigation] low-load mode: static route wiring checks');

  const requiredScreens = [
    'src/screens/GroupsHubScreen.js',
    'src/screens/GroupListScreen.js',
    'src/screens/GroupDetailScreen.js',
    'src/screens/CreateGroupScreen.js',
  ];

  for (const screenPath of requiredScreens) {
    assertFileExists(screenPath);
  }

  const navigatorSource = readUtf8('src/navigation/AppNavigator.js');
  const homeSource = readUtf8('src/screens/HomeFeedScreen.js');
  const groupsHubSource = readUtf8('src/screens/GroupsHubScreen.js');

  assertIncludes(navigatorSource, "currentScreen === 'groupsHub'", 'AppNavigator');
  assertIncludes(navigatorSource, "currentScreen === 'groupList'", 'AppNavigator');
  assertIncludes(navigatorSource, "currentScreen === 'groupDetail'", 'AppNavigator');
  assertIncludes(navigatorSource, "currentScreen === 'createGroup'", 'AppNavigator');

  assertIncludes(homeSource, "onNavigate('groupsHub')", 'HomeFeedScreen');

  assertIncludes(groupsHubSource, "onNavigate('groupDetail'", 'GroupsHubScreen');
  assertIncludes(groupsHubSource, "onNavigate('createGroup')", 'GroupsHubScreen');

  console.log('[smoke-groups-navigation] PASS: groups navigation scaffold is wired.');
}

try {
  run();
} catch (error) {
  console.error('[smoke-groups-navigation] FAIL:', error.message || error);
  process.exitCode = 1;
}
