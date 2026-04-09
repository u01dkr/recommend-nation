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

const messaging = firebase.messaging();

// Only show notification if app is not in the foreground
messaging.onBackgroundMessage((payload) => {
  // Check if any app windows are currently focused
  return clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).then((clientList) => {
    // If any window is visible and focused, skip the notification
    // FCM will have already delivered it to the foreground handler
    const isFocused = clientList.some(
      client => client.visibilityState === 'visible'
    );
    if (isFocused) return;

    const { title, body } = payload.notification || {};
    if (!title) return;

    return self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: 'https://recommendnation.app' },
    });
  });
});

// Handle notification click — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes('recommendnation.app') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return clients.openWindow('https://recommendnation.app');
    })
  );
});
