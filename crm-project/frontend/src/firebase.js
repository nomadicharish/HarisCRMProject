import { initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";

const QA_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDsnOrKwFerOMSABdiHsdZfmzxI0Tw5c5Q",
  authDomain: "haris-business-crm.firebaseapp.com",
  projectId: "haris-business-crm",
  storageBucket: "haris-business-crm.firebasestorage.app",
  messagingSenderId: "1061019770079",
  appId: "1:1061019770079:web:084539fe71fd3b70701d6a"
};

const PRODUCTION_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAVIBpJr1iGHZAJgRJ42p7bqWqO9QQ4TnQ",
  authDomain: "talent-acquisition-2f826.firebaseapp.com",
  projectId: "talent-acquisition-2f826",
  storageBucket: "talent-acquisition-2f826.firebasestorage.app",
  messagingSenderId: "768507248410",
  appId: "1:768507248410:web:2b68910691fa34d42336a3"
};

const productionHosts = new Set([
  "talent-acquisition-2f826.web.app",
  "talent-acquisition-2f826.firebaseapp.com",
  "talentacquisitioneu.com",
  "www.talentacquisitioneu.com"
]);
const hostname = typeof window === "undefined" ? "" : window.location.hostname;
const defaultFirebaseConfig = productionHosts.has(hostname)
  ? PRODUCTION_FIREBASE_CONFIG
  : QA_FIREBASE_CONFIG;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || defaultFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || defaultFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || defaultFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || defaultFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || defaultFirebaseConfig.appId
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const authReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Failed to set auth persistence", error);
});
