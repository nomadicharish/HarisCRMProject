import { initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDsnOrKwFerOMSABdiHsdZfmzxI0Tw5c5Q",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "haris-business-crm.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "haris-business-crm",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "haris-business-crm.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1061019770079",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1061019770079:web:084539fe71fd3b70701d6a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const authReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Failed to set auth persistence", error);
});
