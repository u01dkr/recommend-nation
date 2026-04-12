import { initializeApp, getApps } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

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

export const VAPID_KEY = "BOeKvHr55_BUzesTUqAleDMoZaPcs4LtOt3E4fi30ryyxZOzj879j79fYYAz0Y-hW1rcOwvzzDnLzvXzN83-xpI";

export async function requestNotificationPermission(uid) {
  try {
    // Check browser support
    const supported = await isSupported();
    if (!supported) {
      console.log("Firebase messaging not supported on this browser");
      return false;
    }

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return false;
    }

    // Wait for service worker to be ready
    const registration = await navigator.serviceWorker.ready;

    // Get FCM token
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      console.log("No FCM token received");
      return false;
    }

    // Save token to Firebase
    const tokenKey = token.slice(-20);
    await set(ref(db, `users/${uid}/fcmTokens/${tokenKey}`), token);
    console.log("FCM token saved successfully");

    return true;
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return false;
  }
}
