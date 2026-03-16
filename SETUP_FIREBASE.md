# 🔥 Setup Firebase untuk Login Google

## Langkah 1 — Buat Firebase Project
1. Buka https://console.firebase.google.com
2. Klik **"Add project"** → isi nama → klik Continue
3. Matikan Google Analytics (opsional) → klik **Create Project**

## Langkah 2 — Aktifkan Google Login
1. Di sidebar kiri → **Authentication** → **Get started**
2. Tab **Sign-in method** → klik **Google** → **Enable** → Save

## Langkah 3 — Aktifkan Firestore (Database)
1. Sidebar kiri → **Firestore Database** → **Create database**
2. Pilih **Start in test mode** → pilih region terdekat → Enable

## Langkah 4 — Ambil Config
1. Klik ikon ⚙️ (Project Settings) di sidebar kiri atas
2. Scroll ke bawah → **"Your apps"** → klik ikon **</>** (Web)
3. Isi nama app → Register app
4. Copy nilai dari `firebaseConfig`

## Langkah 5 — Buat file .env
Buat file `.env` di root project (sejajar `package.json`):

```
REACT_APP_FIREBASE_API_KEY=AIzaSy...
REACT_APP_FIREBASE_AUTH_DOMAIN=nama-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=nama-project
REACT_APP_FIREBASE_STORAGE_BUCKET=nama-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=1:123:web:abc123
```

## Langkah 6 — Setup di Vercel
Di dashboard Vercel → **Settings** → **Environment Variables**,
tambahkan semua variabel di atas satu per satu.

## Langkah 7 — Tambahkan domain Vercel ke Firebase
1. Firebase Console → Authentication → **Settings** → **Authorized domains**
2. Klik **Add domain** → masukkan domain Vercel kamu (contoh: `crypto-savings.vercel.app`)

---
Setelah semua selesai, deploy ulang di Vercel → Login Google akan berfungsi! ✅
