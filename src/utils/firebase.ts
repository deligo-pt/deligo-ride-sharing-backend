import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';
import { env } from '../config/env';

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Admin SDK Singleton
//
// Initialised once at module load-time. Subsequent imports receive the same
// cached instance via admin.app() so we never double-initialise.
//
// Reads the service account JSON from the path in FIREBASE_SERVICE_ACCOUNT_PATH
// (defaults to ./firebase-service-account.json in the project root).
// ─────────────────────────────────────────────────────────────────────────────

function initFirebase(): admin.app.App {
  // Return existing app if already initialised (e.g. during hot-reload in dev)
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const absolutePath = path.resolve(env.FIREBASE_SERVICE_ACCOUNT_PATH);

  if (!fs.existsSync(absolutePath)) {
    console.error(
      `❌ Firebase service account file not found at: ${absolutePath}`,
    );
    console.error(
      '   Set FIREBASE_SERVICE_ACCOUNT_PATH in your .env to the correct path.',
    );
    // Do not crash the server — push notifications will simply be unavailable.
    // Other features (rides, chat, etc.) keep working normally.
    return admin.initializeApp(); // no-credential app — messaging will throw gracefully
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(absolutePath, 'utf-8'),
  ) as admin.ServiceAccount;

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.info('✅ Firebase Admin SDK initialized');
  return app;
}

// Initialise on first import
initFirebase();

export default admin;
