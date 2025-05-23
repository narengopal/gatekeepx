importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCPlbqeYhu0KwLpSygGVYZsfsHtEUgdrjA",
  authDomain: "spicesage-ai.firebaseapp.com",
  projectId: "spicesage-ai",
  storageBucket: "spicesage-ai.appspot.com",
  messagingSenderId: "1026386988178",
  appId: "1:1026386988178:web:c46ea66ca2b38b0c776a4b"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM Debug] Received background message:', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
}); 