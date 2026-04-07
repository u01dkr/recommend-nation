import { initializeApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL:       process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db   = getDatabase(app);
export const auth = getAuth(app);

// Messaging is only supported in browsers, not during SSR
export async function getMessagingInstance() {
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(app);
}

export const VAPID_KEY = "BOeKvHr55_BUzesTUqAleDMoZaPcs4LtOt3E4fi30ryyxZOzj879j79fYYAz0Y-hW1rcOwvzzDnLzvXzN83-xpI";

export async function requestNotificationPermission(uid, userName) {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return false;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) return false;

    // Save token to Firebase under the user's profile
    const { ref, set } = await import("firebase/database");
    const tokenKey = token.slice(-20); // use last 20 chars as key
    await set(ref(db, `users/${uid}/fcmTokens/${tokenKey}`), token);

    return true;
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return false;
  }
}
