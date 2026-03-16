import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signOutUser = () => signOut(auth);
export const onAuthChange = (cb: (user: User | null) => void) => onAuthStateChanged(auth, cb);

// Save with fallback to localStorage if Firestore blocked
export const saveSavingsToCloud = async (userId: string, savings: any[]) => {
  localStorage.setItem('crypto_assets_v2', JSON.stringify(savings));
  try {
    await setDoc(doc(db, 'users', userId), { savings, updatedAt: Date.now() });
  } catch (e) {
    // Firestore might be blocked by ad blocker — localStorage already saved above
    console.warn('Firestore save failed, using localStorage:', e);
  }
};

// Load with fallback to localStorage if Firestore blocked
export const loadSavingsFromCloud = async (userId: string): Promise<any[]> => {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      const data = snap.data().savings || [];
      localStorage.setItem('crypto_assets_v2', JSON.stringify(data));
      return data;
    }
  } catch (e) {
    console.warn('Firestore load failed, using localStorage:', e);
    const local = localStorage.getItem('crypto_assets_v2');
    if (local) return JSON.parse(local);
  }
  const local = localStorage.getItem('crypto_assets_v2');
  return local ? JSON.parse(local) : [];
};

export type { User };
