import { App, applicationDefault, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

type ServiceAccountLike = {
  project_id?: string;
  projectId?: string;
  client_email?: string;
  clientEmail?: string;
  private_key?: string;
  privateKey?: string;
};

function readServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const rawBase64 = (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim();

  let parsed: ServiceAccountLike | null = null;
  if (rawJson) {
    try {
      parsed = JSON.parse(rawJson) as ServiceAccountLike;
    } catch {
      parsed = null;
    }
  } else if (rawBase64) {
    try {
      const decoded = Buffer.from(rawBase64, 'base64').toString('utf8');
      parsed = JSON.parse(decoded) as ServiceAccountLike;
    } catch {
      parsed = null;
    }
  }

  const projectId = (parsed?.projectId || parsed?.project_id || '').trim();
  const clientEmail = (parsed?.clientEmail || parsed?.client_email || '').trim();
  const privateKeyRaw = (parsed?.privateKey || parsed?.private_key || '').trim();
  const privateKey = privateKeyRaw ? privateKeyRaw.replace(/\\n/g, '\n') : '';

  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

let app: App | null = null;
let db: Firestore | null = null;

function ensureInitialized() {
  if (!app) {
    const serviceAccount = readServiceAccount();
    app = getApps().length
      ? getApp()
      : initializeApp({
          credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
        });
  }
  if (!db) {
    db = getFirestore(app);
  }
}

export function getServerFirebase() {
  ensureInitialized();
  return { app: app!, db: db! };
}
