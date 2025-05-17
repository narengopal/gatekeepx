const admin = require('../config/firebase');
const knex = require('../database');

class FCMService {
  async saveToken(userId, token, deviceType = 'web') {
    try {
      // Deactivate this token for all other users
      await knex('fcm_tokens')
        .where({ token })
        .andWhere('user_id', '!=', userId)
        .update({ is_active: false });

      // Upsert: activate for this user
      await knex('fcm_tokens').insert({
        user_id: userId,
        token,
        device_type: deviceType,
        is_active: true
      }).onConflict('token').merge({
        user_id: userId,
        device_type: deviceType,
        is_active: true
      });

      // Remove all other inactive tokens for this user except this token
      await knex('fcm_tokens')
        .where({ user_id: userId, is_active: false })
        .andWhere('token', '!=', token)
        .del();

      return true;
    } catch (error) {
      console.error('Error saving FCM token:', error);
      return false;
    }
  }

  async removeToken(token) {
    try {
      await knex('fcm_tokens')
        .where({ token })
        .update({ is_active: false });
      return true;
    } catch (error) {
      console.error('Error removing FCM token:', error);
      return false;
    }
  }

  async sendNotification(userId, notification) {
    try {
      const tokens = await knex('fcm_tokens')
        .where({ user_id: userId, is_active: true })
        .select('token');

      if (tokens.length === 0) return false;

      const message = {
        notification: {
          title: notification.title || 'New Notification',
          body: notification.message
        },
        data: {
          type: notification.type,
          ...notification.metadata
        },
        tokens: tokens.map(t => t.token)
      };

      const response = await admin.messaging().sendMulticast(message);
      console.log('FCM Response:', response);
      return true;
    } catch (error) {
      console.error('Error sending FCM notification:', error);
      return false;
    }
  }
}

module.exports = new FCMService(); 