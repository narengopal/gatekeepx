import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyCPlbqeYhu0KwLpSygGVYZsfsHtEUgdrjA",
  authDomain: "spicesage-ai.firebaseapp.com",
  projectId: "spicesage-ai",
  storageBucket: "spicesage-ai.appspot.com",
  messagingSenderId: "1026386988178",
  appId: "1:1026386988178:web:c46ea66ca2b38b0c776a4b"
  // measurementId: "<optional>"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Request permission and get FCM token
export const requestNotificationPermission = async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // TODO: Replace with your actual VAPID key from Firebase Console > Cloud Messaging
      const token = await getToken(messaging, {
        vapidKey: "BFtpFDbDmM7YBNodaGvU6ZpUgDbbqc3JRbiVN9_pSVSBt4vv-l45T_hqc49gUvHTQorBrgC9vQU2qpNYnPcT95c"
      });
      console.log('[FCM Debug] Successfully obtained FCM token');
      return token;
    }
    console.warn('[FCM Debug] Notification permission denied');
    throw new Error('Notification permission denied');
  } catch (error) {
    console.error('[FCM Debug] Error getting FCM token:', error);
    throw error;
  }
};

// Handle foreground messages
export const onMessageListener = () =>
  new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      console.log('[FCM Debug] Received foreground message:', payload);
      resolve(payload);
    });
  });

export { messaging }; 