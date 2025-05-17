const express = require('express');
const router = express.Router();
const fcmService = require('../services/fcmService');
const auth = require('../middleware/auth');

// Register FCM token
router.post('/register', auth, async (req, res) => {
  try {
    const { token, deviceType } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const success = await fcmService.saveToken(req.user.id, token, deviceType);
    if (success) {
      res.json({ message: 'Token registered successfully' });
    } else {
      res.status(500).json({ error: 'Failed to register token' });
    }
  } catch (error) {
    console.error('Error registering FCM token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unregister FCM token
router.post('/unregister', auth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const success = await fcmService.removeToken(token);
    if (success) {
      res.json({ message: 'Token unregistered successfully' });
    } else {
      res.status(500).json({ error: 'Failed to unregister token' });
    }
  } catch (error) {
    console.error('Error unregistering FCM token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test notification endpoint
router.post('/test', async (req, res) => {
  try {
    const { userId, title, body } = req.body;
    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'userId, title, and body are required' });
    }
    // Use the FCM service to send the notification
    const success = await fcmService.sendNotification(userId, {
      title,
      message: body,
      type: 'test',
      metadata: {}
    });
    if (success) {
      res.json({ message: 'Test notification sent' });
    } else {
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 