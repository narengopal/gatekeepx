const admin = require('../config/firebase');
const knex = require('../database');

class FCMService {
  async saveToken(userId, token, deviceType = 'web') {
    try {
      if (!userId || !token) {
        console.error('[FCM Debug] Invalid input: userId or token is missing');
        return false;
      }

      // First check if user exists
      const user = await knex('users').where('id', userId).first();
      if (!user) {
        console.error(`[FCM Debug] User ${userId} not found`);
        return false;
      }

      // More lenient token validation - FCM tokens can contain various characters
      if (token.length < 20) {
        console.error('[FCM Debug] Token too short');
        return false;
      }

      // Use transaction to prevent race conditions
      return await knex.transaction(async (trx) => {
        try {
          // Check if token already exists
          const existingToken = await trx('fcm_tokens')
            .where('token', token)
            .first();

          if (existingToken) {
            // Update existing token
            await trx('fcm_tokens')
              .where('token', token)
              .update({
                user_id: userId,
                device_type: deviceType,
                is_active: true,
                updated_at: new Date()
              });
            console.log(`[FCM Debug] Updated existing token for user ${userId}`);
          } else {
            // Insert new token
            await trx('fcm_tokens').insert({
              user_id: userId,
              token,
              device_type: deviceType,
              is_active: true
            });
            console.log(`[FCM Debug] Saved new token for user ${userId}`);
          }

          return true;
        } catch (error) {
          console.error('[FCM Debug] Database error in transaction:', error);
          throw error;
        }
      });
    } catch (error) {
      console.error('[FCM Debug] Error saving FCM token:', error);
      return false;
    }
  }

  async removeToken(token) {
    try {
      if (!token) {
        console.error('[FCM Debug] Token is missing');
        return false;
      }

      const result = await knex('fcm_tokens')
        .where({ token })
        .update({ 
          is_active: false,
          updated_at: new Date()
        });

      console.log(`[FCM Debug] Token ${token} removed: ${result > 0}`);
      return result > 0;
    } catch (error) {
      console.error('[FCM Debug] Error removing FCM token:', error);
      return false;
    }
  }

  async sendNotification(userId, notification) {
    try {
      if (!userId || !notification || !notification.title || !notification.body) {
        console.error('[FCM Debug] Invalid notification parameters');
        return false;
      }

      // Get all active tokens for the user
      const tokens = await knex('fcm_tokens')
        .where('user_id', userId)
        .where('is_active', true)
        .select('token');

      if (!tokens.length) {
        console.warn(`[FCM Debug] No active tokens found for user ${userId}`);
        return false;
      }

      // Validate tokens before sending
      const validTokens = tokens.filter(t => t.token && t.token.length >= 20);
      if (!validTokens.length) {
        console.error('[FCM Debug] No valid tokens found after validation');
        return false;
      }

      const message = {
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: {
          ...notification.data,
          timestamp: new Date().toISOString()
        },
        tokens: validTokens.map(t => t.token),
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'default'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default'
            }
          }
        }
      };

      try {
        const response = await admin.messaging().sendMulticast(message);
        console.log(`[FCM Debug] Successfully sent notification to user ${userId}:`, response);

        // Handle failed tokens
        if (response.failureCount > 0) {
          const failedTokens = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              failedTokens.push(validTokens[idx].token);
              console.error(`[FCM Debug] Failed to send to token ${validTokens[idx].token}:`, resp.error);
            }
          });

          // Deactivate failed tokens
          if (failedTokens.length > 0) {
            await knex('fcm_tokens')
              .whereIn('token', failedTokens)
              .update({ 
                is_active: false,
                updated_at: new Date()
              });
            console.log(`[FCM Debug] Deactivated ${failedTokens.length} failed tokens`);
          }
        }

        return true;
      } catch (error) {
        console.error('[FCM Debug] Firebase messaging error:', error);
        return false;
      }
    } catch (error) {
      console.error('[FCM Debug] Error sending notification:', error);
      return false;
    }
  }

  async registerTokenAndTest(userId, token, deviceType = 'web') {
    try {
      console.log(`[FCM Debug] Attempting to register and test token for user ${userId}`);
      
      // First save the token
      const tokenSaved = await this.saveToken(userId, token, deviceType);
      if (!tokenSaved) {
        console.error(`[FCM Debug] Failed to save token for user ${userId}`);
        return { success: false, error: 'Failed to save token' };
      }
      
      // Send a test notification
      const testNotification = {
        title: 'Registration Successful',
        body: 'Your device has been registered for notifications',
        data: {
          type: 'test',
          timestamp: new Date().toISOString()
        }
      };
      
      try {
        // Send direct notification through Firebase instead of using sendNotification method
        // to verify the token works independently of our database
        const message = {
          notification: {
            title: testNotification.title,
            body: testNotification.body
          },
          data: testNotification.data,
          token: token
        };
        
        const response = await admin.messaging().send(message);
        console.log(`[FCM Debug] Test notification sent successfully:`, response);
        
        return { 
          success: true, 
          message: 'Token registered and test notification sent successfully',
          firebaseMessageId: response
        };
      } catch (firebaseError) {
        console.error('[FCM Debug] Error sending test notification:', firebaseError);
        
        // If the token is invalid, deactivate it
        if (firebaseError.code === 'messaging/invalid-registration-token' || 
            firebaseError.code === 'messaging/registration-token-not-registered') {
          await this.removeToken(token);
          return { success: false, error: 'Invalid FCM token', code: firebaseError.code };
        }
        
        return { success: false, error: 'Failed to send test notification', code: firebaseError.code };
      }
    } catch (error) {
      console.error('[FCM Debug] Error in registerTokenAndTest:', error);
      return { success: false, error: 'Server error', details: error.message };
    }
  }
}

module.exports = new FCMService(); 