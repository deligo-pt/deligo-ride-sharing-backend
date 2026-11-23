import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config';

function initFirebase(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const absolutePath = path.resolve(config.firebase.serviceAccountPath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Firebase service account file not found at: ${absolutePath}`);
    console.error('   Set FIREBASE_SERVICE_ACCOUNT_PATH in your .env to the correct path.');
    return admin.initializeApp();
  }

  const serviceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf-8')) as admin.ServiceAccount;

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.info('✅ Firebase Admin SDK initialized');
  return app;
}

initFirebase();

export default admin;
