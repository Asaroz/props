# Props

Props is a mobile social media app prototype built with React Native and Expo.

Current scope:
- Basic app shell and folder structure
- Home feed screen with mock friend data
- Placeholder cards for upcoming features (profiles, interactions)

## Tech Stack

- Expo
- React Native
- React

## Project Structure

- App.js: App entry point
- src/navigation: Navigation placeholder
- src/screens: Screen components
- src/components: Reusable UI components
- src/data: Mock data
- src/theme: Color/theme tokens

## Prerequisites

- Node.js (LTS recommended)
- npm
- Expo Go app on your phone (optional for device testing)

## Install

Run once after cloning or first setup:

```bash
npm install
```

## Start the App

Default start:

```bash
npm run start
```

Start for Android emulator/device:

```bash
npm run android
```

Start for iOS simulator/device:

```bash
npm run ios
```

Start for web:

```bash
npm run web
```

## Recommended Mobile Start Mode

If device connection is unstable, use tunnel mode:

```bash
npx expo start --tunnel -c
```

## Expo Account Commands

Login with your Expo account:

```bash
npx expo login
```

Check current login user:

```bash
npx expo whoami
```

Logout:

```bash
npx expo logout
```

## Troubleshooting

### npm is not recognized

- Reinstall Node.js with Add to PATH enabled
- Restart VS Code/terminal
- Verify with:

```bash
node -v
npm -v
```

### Expo Go shows network/offline error

- Try tunnel mode: npx expo start --tunnel -c
- Ensure phone and computer are on the same network (or use tunnel)
- Disable VPN/ad blockers temporarily
- Check firewall permissions for Node.js and Expo

## Next Planned Features

- User profiles
- Give/receive props interactions
- Real navigation tabs
- Backend/API integration
