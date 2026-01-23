// /src/lib/firebase-client.ts
'use client';
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { enableIndexedDbPersistence, getFirestore, initializeFirestore, Firestore } from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAb8vn7iQ43VwqIHBOHDVA0jnZE-LpFbXU",
  authDomain: "adc-eletro.firebaseapp.com",
  projectId: "adc-eletro",
  storageBucket: "adc-eletro.firebasestorage.app",
  messagingSenderId: "387148226922",
  appId: "1:387148226922:web:6426088ebda884f8820513"
};

// Singleton pattern to ensure Firebase is initialized only once
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let persistenceEnabled = false;

function initializeClientFirebase() {
  if (typeof window !== "undefined") {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    auth = getAuth(app);
    if (!db) {
      try {
        db = initializeFirestore(app, {
          experimentalAutoDetectLongPolling: true,
        });
      } catch {
        db = getFirestore(app);
      }
    }

    if (!persistenceEnabled) {
      persistenceEnabled = true;
      enableIndexedDbPersistence(db).catch(() => {});
    }
  }
}

// Call initialization
initializeClientFirebase();

export function getClientFirebase() {
    // Re-initialize if db is not available (e.g., in some server-side rendering contexts)
    if (!db) {
        initializeClientFirebase();
    }
    return { app, auth, db };
}
