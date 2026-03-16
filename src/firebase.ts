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

// Saat logout — bersihkan localStorage user yang sedang aktif
export const signOutUser = async () => {
  const user = auth.currentUser;
  if (user) {
    // Hapus cache localStorage user ini saja
    localStorage.removeItem(`crypto_assets_${user.uid}`);
  }
  await signOut(auth);
};

export const onAuthChange = (cb: (user: User | null) => void) => onAuthStateChanged(auth, cb);

// Key localStorage unik per user — tidak bisa bocor ke user lain
const localKey = (userId: string) => `crypto_assets_${userId}`;

export const saveSavingsToCloud = async (userId: string, savings: any[]) => {
  // Simpan di localStorage dengan key unik per user
  localStorage.setItem(localKey(userId), JSON.stringify(savings));
  try {
    await setDoc(doc(db, 'users', userId), { savings, updatedAt: Date.now() });
  } catch (e) {
    console.warn('Firestore save failed, using localStorage:', e);
  }
};

export const loadSavingsFromCloud = async (userId: string): Promise<any[]> => {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      const data = snap.data().savings || [];
      // Cache di localStorage dengan key user ini
      localStorage.setItem(localKey(userId), JSON.stringify(data));
      return data;
    }
  } catch (e) {
    console.warn('Firestore load failed, using localStorage:', e);
    // Fallback ke localStorage user ini saja
    const local = localStorage.getItem(localKey(userId));
    if (local) return JSON.parse(local);
  }
  // Cek localStorage user ini
  const local = localStorage.getItem(localKey(userId));
  return local ? JSON.parse(local) : [];
};

export type { User };
