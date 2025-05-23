import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { messaging } from '../config/firebase';
import { getToken, onMessage } from 'firebase/messaging';
import axios from 'axios';
import io from 'socket.io-client';

export const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);

  // Register FCM token
  const registerFCMToken = useCallback(async () => {
    if (!user) return;

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = await getToken(messaging, {
          vapidKey: process.env.REACT_APP_FIREBASE_VAPID_KEY
        });

        if (token) {
          await axios.post('/api/fcm/register', { token });
          console.log('FCM token registered successfully');
        }
      }
    } catch (error) {
      console.error('Error registering FCM token:', error);
    }
  }, [user]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const response = await axios.get('/api/notifications');
      setNotifications(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch notifications');
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Mark notifications as read
  const markAsRead = useCallback(async (notificationIds) => {
    if (!user || !notificationIds.length) return;

    try {
      await axios.post('/api/notifications/mark-read', { notificationIds });
      await fetchNotifications();
    } catch (err) {
      console.error('Error marking notifications as read:', err);
    }
  }, [user, fetchNotifications]);

  // Show browser notification
  const showNotification = useCallback((title, options = {}) => {
    if (!window.Notification || Notification.permission !== 'granted') {
      console.log('Notifications not permitted');
      return;
    }

    try {
      new Notification(title, {
        icon: '/logo192.png',
        ...options
      });
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }, []);

  // Setup Socket.IO connection
  useEffect(() => {
    if (!user) return;

    const newSocket = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001', {
      transports: ['websocket']
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      newSocket.emit('register', user.id);
    });

    newSocket.on('notification', (notification) => {
      console.log('Received notification:', notification);
      showNotification(notification.type, {
        body: notification.message
      });
      fetchNotifications();
    });

    setSocket(newSocket);

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [user, showNotification, fetchNotifications]);

  // Setup FCM message listener
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Received FCM message:', payload);
      showNotification(payload.notification.title, {
        body: payload.notification.body
      });
      fetchNotifications();
    });

    return () => unsubscribe();
  }, [user, showNotification, fetchNotifications]);

  // Initial setup
  useEffect(() => {
    if (user) {
      registerFCMToken();
      fetchNotifications();
    }
  }, [user, registerFCMToken, fetchNotifications]);

  return {
    notifications,
    loading,
    error,
    fetchNotifications,
    markAsRead,
    showNotification
  };
};

export default useNotifications; 