import { initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const DEV_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDQ-F_CiygxjubGnc3Q8qJ2oroZ3Bvzc4I",
  authDomain: "talent-aquisition-dev.firebaseapp.com",
  projectId: "talent-aquisition-dev",
  storageBucket: "talent-aquisition-dev.firebasestorage.app",
  messagingSenderId: "535938604207",
  appId: "1:535938604207:web:cb99f718fc04c197da885a"
};

const QA_FIREBASE_CONFIG = {
  apiKey: "AIzaSyA7oWI8XGDzx3bHtvMOY_DkxNcH7CyBJ3k",
  authDomain: "talent-aquisition-qa.firebaseapp.com",
  projectId: "talent-aquisition-qa",
  storageBucket: "talent-aquisition-qa.firebasestorage.app",
  messagingSenderId: "811937341319",
  appId: "1:811937341319:web:fd30f3720e6cf5c09d3d22"
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
const qaHosts = new Set([
  "talent-aquisition-qa.web.app",
  "talent-aquisition-qa.firebaseapp.com"
]);
const hostname = typeof window === "undefined" ? "" : window.location.hostname;
const defaultFirebaseConfig = productionHosts.has(hostname)
  ? PRODUCTION_FIREBASE_CONFIG
  : qaHosts.has(hostname)
    ? QA_FIREBASE_CONFIG
    : DEV_FIREBASE_CONFIG;

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
export const firestore = getFirestore(app);

export const authReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Failed to set auth persistence", error);
});
