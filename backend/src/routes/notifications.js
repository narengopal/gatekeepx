const express = require('express');
const router = express.Router();
const fcmService = require('../services/fcmService');
const { sendUserNotification } = require('../utils/notifications');

// Register FCM token
router.post('/register-token', async (req, res) => {
  try {
    const { userId, fcmToken, deviceType } = req.body;
    
    if (!userId || !fcmToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const success = await fcmService.saveToken(userId, fcmToken, deviceType);
    
    if (success) {
      res.json({ success: true, message: 'Token registered successfully' });
    } else {
      res.status(400).json({ error: 'Failed to register token' });
    }
  } catch (error) {
    console.error('[FCM Debug] Error registering FCM token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send test notification
router.post('/send-test', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const notification = {
      title: 'Test Notification',
      body: 'This is a test notification from the server',
      data: {
        type: 'test',
        timestamp: new Date().toISOString()
      }
    };

    const success = await fcmService.sendNotification(userId, notification);
    
    if (success) {
      res.json({ success: true, message: 'Test notification sent successfully' });
    } else {
      res.status(400).json({ error: 'Failed to send test notification' });
    }
  } catch (error) {
    console.error('[FCM Debug] Error sending test notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send notification for user pending approval
router.post('/pending-approval', async (req, res) => {
  try {
    const { adminId, userName, userId, io, connectedUsers } = req.body;
    
    if (!adminId || !userName || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 1. Create notification for admin
    const notification = await sendUserNotification(
      adminId,              // ID of the admin user
      'pending_approval',   // Notification type
      'A new user requires approval.', // Message
      { userName, userId }, // Metadata
      io,
      connectedUsers
    );
    
    if (!notification) {
      return res.status(400).json({ error: 'Failed to send notification' });
    }

    // 2. (Optional) Update pending list for all admins in real time
    if (io && connectedUsers) {
      for (const [userId, userInfo] of connectedUsers.entries()) {
        if (userInfo.role === 'admin') {
          io.to(userInfo.socketId).emit('refresh_pending_users');
        }
      }
    }

    res.json({ success: true, message: 'Approval notification sent successfully' });
  } catch (error) {
    console.error('[Notification Debug] Error sending approval notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 