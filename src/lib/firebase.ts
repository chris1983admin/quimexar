
import { initializeApp, getApps, getApp, FirebaseOptions } from "firebase/app";
import { getFirestore, increment } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyAwCcF6UESBQtBltYMs_laDynzD0S8GXxk",
  authDomain: "quimexar-control.firebaseapp.com",
  projectId: "quimexar-control",
  storageBucket: "quimexar-control.appspot.com",
  messagingSenderId: "108848488241",
  appId: "1:108848488241:web:50e137c6998fc57918a562"
};

// Re-initialize the app to ensure config is fresh. This can help with stubborn auth errors in some environments.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, db, auth, googleProvider, increment, firebaseConfig };
