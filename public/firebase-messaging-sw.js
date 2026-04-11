importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC89XBl9npbf6T_bz_OVWk4PvIkI1hBHao",
  authDomain: "recommend-nation-166c3.firebaseapp.com",
  databaseURL: "https://recommend-nation-166c3-default-rtdb.firebaseio.com",
  projectId: "recommend-nation-166c3",
  storageBucket: "recommend-nation-166c3.firebasestorage.app",
  messagingSenderId: "81687951628",
  appId: "1:81687951628:web:4325063f8cdf37fe293129"
});

// Initialise messaging but do NOT add onBackgroundMessage handler
// FCM handles notification display natively — we only intercept the click
firebase.messaging();

// Handle notification click — open or focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('recommendnation.app') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('https://recommendnation.app');
    })
  );
});
