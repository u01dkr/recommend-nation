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

// Helper to wait for service worker with a timeout
function waitForServiceWorker(timeoutMs = 5000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Service worker timeout")), timeoutMs)
    ),
  ]);
}

export async function requestNotificationPermission(uid) {
  try {
    // Check browser support
    const supported = await isSupported();
    if (!supported) {
      console.log("Firebase messaging not supported");
      return false;
    }

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Permission denied");
      return false;
    }

    const messaging = getMessaging(app);
    let token = null;

    // Try with service worker registration first, fall back without it
    try {
      const registration = await waitForServiceWorker(5000);
      token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
    } catch (swError) {
      console.log("Service worker not ready, trying without:", swError.message);
      // Fallback — try getting token without explicit service worker
      token = await getToken(messaging, { vapidKey: VAPID_KEY });
    }

    if (!token) {
      console.log("No token received");
      return false;
    }

    // Save token to Firebase
    const tokenKey = token.slice(-20);
    await set(ref(db, `users/${uid}/fcmTokens/${tokenKey}`), token);
    console.log("Token saved");
    return true;

  } catch (error) {
    console.error("Error enabling notifications:", error);
    return false;
  }
}
