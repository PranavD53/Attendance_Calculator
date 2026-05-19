# AttendWise Survival Calculator

A polished web app for students who need to understand whether their attendance is safe, how many classes or days they must attend, and how many they can miss without dropping below their required percentage.

## Features

- School and college modes
- Class-wise or complete-day attendance systems
- Editable target percentage with quick presets
- Recovery calculation for students below target
- Safe miss calculation for students above target
- Remaining schedule projection
- College subject planner
- Local-first personal storage
- Optional Firebase login and sync
- Installable PWA shell with offline caching

## Run

Open `index.html` in a browser, or serve the folder with any static web server.

For PWA install and Firebase sign-in testing, use a local HTTP server:

```bash
node local-server.js 5173
```

Then open `http://localhost:5173`.

## Firebase Sync

The app works free and offline first. For optional cross-device sync, follow `FIREBASE_SETUP.md`, paste your Firebase web config into `firebase-config.js`, enable Google Authentication, and publish the Firestore rules.

## Deploy (Firebase Hosting)

Project id is set to `project-1-4bd0d`.

1. Install Firebase CLI once:
`npm install -g firebase-tools`
2. Login:
`firebase login`
3. Deploy preview URL:
`npm run deploy:preview`
4. Deploy live:
`npm run deploy:live`

If Google sign-in popup closes instantly after deploy, add your live hosting domain to Firebase Authentication authorized domains.
