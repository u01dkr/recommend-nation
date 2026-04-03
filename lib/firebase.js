import { initializeApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyC89XBl9npbf6T_bz_OVWk4PvIkI1hBHao",
  authDomain: "recommend-nation-166c3.firebaseapp.com",
  databaseURL: "https://recommend-nation-166c3-default-rtdb.firebaseio.com",
  projectId: "recommend-nation-166c3",
  storageBucket: "recommend-nation-166c3.firebasestorage.app",
  messagingSenderId: "81687951628",
  appId: "1:81687951628:web:4325063f8cdf37fe293129"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getDatabase(app);
