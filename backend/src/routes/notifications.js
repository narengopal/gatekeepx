const express = require('express');
const router = express.Router();
const admin = require('../firebase-admin');
const db = require('../db');

// Register FCM token
router.post('/register-token', async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;
    
    // Store token in database
    await db.query(
      'INSERT INTO fcm_tokens (user_id, token) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET token = $2',
      [userId, fcmToken]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error registering FCM token:', error);
    res.status(500).json({ error: 'Failed to register token' });
  }
});

// Send notification to user
router.post('/send', async (req, res) => {
  try {
    const { userId, title, body } = req.body;
    
    // Get user's FCM token
    const result = await db.query('SELECT token FROM fcm_tokens WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User token not found' });
    }
    
    const token = result.rows[0].token;
    
    // Send notification
    const message = {
      notification: {
        title,
        body
      },
      token
    };
    
    const response = await admin.messaging().send(message);
    res.json({ success: true, response });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Test notification endpoint
router.post('/test', async (req, res) => {
  try {
    const { userId, title = 'Test Notification', body = 'This is a test notification' } = req.body;
    
    // Get user's FCM token
    const result = await db.query('SELECT token FROM fcm_tokens WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User token not found' });
    }
    
    const token = result.rows[0].token;
    
    // Send notification
    const message = {
      notification: {
        title,
        body
      },
      token
    };
    
    const response = await admin.messaging().send(message);
    res.json({ success: true, response });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

module.exports = router; 