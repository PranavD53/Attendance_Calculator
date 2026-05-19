# Firebase Setup

AttendWise is local-first by default. Firebase is only needed for optional cross-device sync.

## 1. Create the Firebase project

1. Go to the Firebase console.
2. Create a project.
3. Disable Google Analytics if you do not need it for the first launch.
4. Open Project settings.
5. Add a Web app.
6. Copy the Firebase web app config.

## 2. Add the config

Open `firebase-config.js` and replace `window.FIREBASE_CONFIG = null;` with your copied config:

```js
window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

This config is safe to ship in a frontend app. Your Firestore Security Rules protect the data.

## 3. Enable Authentication

1. In Firebase, open Authentication.
2. Click Get started.
3. Open Sign-in method.
4. Enable Google.
5. Add your app domain in Authentication settings after deployment.

## 4. Create Firestore

1. Open Firestore Database.
2. Click Create database.
3. Start in production mode.
4. Choose the nearest region for your main users.

## 5. Add Firestore Security Rules

Use these rules so users can only access their own attendance profile:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 6. Data shape

The app stores one document per synced user:

```txt
users/{uid}
  uid
  email
  displayName
  attendanceState
    studentType
    year
    unitMode
    target
    totalHeld
    attended
    remaining
    subjects[]
    updatedAt
```

## 7. Launch notes

- Local-first mode works without Firebase and costs nothing per user.
- Firebase sync only activates when a student signs in.
- Host the app over HTTPS for Google sign-in and PWA installation.
- Firebase Spark plan avoids autopay, but it has daily free limits.
