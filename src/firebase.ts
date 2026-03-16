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

// Key localStorage SELALU unik per userId — tidak bisa bocor antar user
const localKey = (userId: string) => `crypto_v3_${userId}`;

export const saveSavingsToCloud = async (userId: string, savings: any[]) => {
  // Simpan ke localStorage dengan key unik user ini
  localStorage.setItem(localKey(userId), JSON.stringify(savings));
  try {
    await setDoc(doc(db, 'users', userId), { savings, updatedAt: Date.now() });
  } catch (e) {
    console.warn('Firestore save failed, using localStorage:', e);
  }
};

export const loadSavingsFromCloud = async (userId: string): Promise<any[]> => {
  // Coba Firestore dulu
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists() && snap.data().savings?.length) {
      const data = snap.data().savings;
      localStorage.setItem(localKey(userId), JSON.stringify(data));
      return data;
    }
  } catch (e) {
    console.warn('Firestore load failed:', e);
  }
  // Fallback: hanya baca localStorage milik user ini
  const local = localStorage.getItem(localKey(userId));
  if (local) {
    try { return JSON.parse(local); } catch { return []; }
  }
  // Benar-benar baru — kembalikan array kosong
  return [];
};

export type { User };
