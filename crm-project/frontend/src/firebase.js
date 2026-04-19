import { initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDsnOrKwFerOMSABdiHsdZfmzxI0Tw5c5Q",
  authDomain: "haris-business-crm.firebaseapp.com",
  projectId: "haris-business-crm",
  storageBucket: "haris-business-crm.firebasestorage.app",
  messagingSenderId: "1061019770079",
  appId: "1:1061019770079:web:084539fe71fd3b70701d6a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Failed to set auth persistence", error);
});
