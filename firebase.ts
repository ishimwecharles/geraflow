import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDocFromServer,
  collection,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

import firebaseConfig from '../../firebase-applet-config.json';

// Construct the operational configuration dynamically to support environment variable overrides when exported
const meta = import.meta as any;
const config = {
  apiKey: (meta.env?.VITE_FIREBASE_API_KEY) || firebaseConfig.apiKey || "",
  authDomain: (meta.env?.VITE_FIREBASE_AUTH_DOMAIN) || firebaseConfig.authDomain || "",
  projectId: (meta.env?.VITE_FIREBASE_PROJECT_ID) || firebaseConfig.projectId || "",
  storageBucket: (meta.env?.VITE_FIREBASE_STORAGE_BUCKET) || firebaseConfig.storageBucket || "",
  messagingSenderId: (meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID) || firebaseConfig.messagingSenderId || "",
  appId: (meta.env?.VITE_FIREBASE_APP_ID) || firebaseConfig.appId || "",
  measurementId: (meta.env?.VITE_FIREBASE_MEASUREMENT_ID) || firebaseConfig.measurementId || "",
  firestoreDatabaseId: (meta.env?.VITE_FIREBASE_FIRESTORE_DATABASE_ID) || firebaseConfig.firestoreDatabaseId || "",
  databaseId: (meta.env?.VITE_FIREBASE_FIRESTORE_DATABASE_ID) || (firebaseConfig as any).databaseId || ""
};

// Export the config
export { firebaseConfig };

// Initialize Firebase App only once using getApps()
export const app = getApps().length > 0 ? getApp() : initializeApp(config);

// Initialize Firestore, Auth and Storage with the custom database ID if available
export const db = config.firestoreDatabaseId
  ? getFirestore(app, config.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();

// Error Categories for hard compliance
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  };
}

// Global Custom Firestore Error Handler wrapper
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
    },
    operationType,
    path
  };
  
  console.error('[GeraPay Firestore Error]: ', JSON.stringify(errInfo));
  
  // Custom global notification event so App.tsx can render the safe offline/connection error screen
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('gerapay_firebase_error', { detail: errInfo });
    window.dispatchEvent(event);
  }
}

// Test Connection lazily in background after main layout mounts
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("[GeraPayQR] Background Firestore server gateway handshaked successfully");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("[GeraPayQR] Running in server offline fallback mode.");
    } else {
      console.log("[GeraPayQR] Connection handshake concluded.");
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(testConnection, 1200);
  });
}
