const db = require('../database');
const fcmService = require('../services/fcmService');

const createNotification = async (userId, type, message, metadata = {}, io, connectedUsers) => {
  console.log('[Debug] createNotification called with:', { userId, type, message, metadata });
  try {
    // Defensive checks
    if (!userId || typeof userId !== 'number') {
      console.error('[Notification Error] userId is missing or invalid:', userId);
      return null;
    }
    if (!type || typeof type !== 'string') {
      console.error('[Notification Error] type is missing or invalid:', type);
      return null;
    }
    if (!message || typeof message !== 'string') {
      console.error('[Notification Error] message is missing or invalid:', message);
      return null;
    }
    if (metadata && typeof metadata !== 'object') {
      console.error('[Notification Error] metadata is invalid:', metadata);
      metadata = {};
    }

    // Use transaction to ensure data consistency
    return await db.transaction(async (trx) => {
      try {
        // Create notification in database
        const [notification] = await trx('notifications').insert({
          user_id: userId,
          type,
          message,
          metadata,
          is_read: false,
          created_at: new Date(),
          updated_at: new Date()
        }).returning('*');
        
        console.log('[Debug] Created notification in database:', notification);

        // Send real-time notification if user is connected
        if (io && connectedUsers && connectedUsers.has(userId)) {
          console.log('[Debug] User is connected, sending real-time notification');
          io.to(connectedUsers.get(userId)).emit('notification', notification);
        } else {
          console.log('[Debug] User is not connected, will send FCM notification');
        }

        // Send FCM notification
        const fcmSuccess = await fcmService.sendNotification(userId, {
          title: type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' '),
          body: message,
          data: {
            type,
            notificationId: notification.id,
            ...metadata
          }
        });

        if (!fcmSuccess) {
          console.warn('[Debug] FCM notification failed to send - this might be due to invalid or expired tokens');
          // Don't fail the whole operation if FCM fails
        }

        return notification;
      } catch (error) {
        console.error('[Debug] Error in notification transaction:', error);
        throw error;
      }
    });
  } catch (error) {
    console.error('[Debug] Error creating notification:', error);
    return null;
  }
};

// Helper function to validate user before notification
const validateUser = async (userId) => {
  try {
    const user = await db('users').where('id', userId).first();
    if (!user) {
      console.error(`[Notification Error] User ${userId} not found`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Notification Error] Error validating user:', error);
    return false;
  }
};

const notifyNewVisitor = async (residentId, guestName, flatNumber, io, connectedUsers) => {
  if (!await validateUser(residentId)) {
    return null;
  }
  return createNotification(
    residentId,
    'new_visitor',
    `New visitor ${guestName} has arrived at Flat ${flatNumber}`,
    { guestName, flatNumber },
    io,
    connectedUsers
  );
};

const notifyVisitApproved = async (securityId, guestName, flatNumber, io, connectedUsers) => {
  if (!await validateUser(securityId)) {
    return null;
  }
  console.log('[Debug] notifyVisitApproved called with:', { securityId, guestName, flatNumber });
  const notification = await createNotification(
    securityId,
    'visit_approved',
    `Visit approved for ${guestName} at Flat ${flatNumber}`,
    { guestName, flatNumber },
    io,
    connectedUsers
  );
  console.log('[Debug] Created notification:', notification);
  return notification;
};

const notifyVisitRejected = async (securityId, guestName, flatNumber, reason, io, connectedUsers) => {
  if (!await validateUser(securityId)) {
    return null;
  }
  return createNotification(
    securityId,
    'visit_rejected',
    `Visit rejected for ${guestName} at Flat ${flatNumber}: ${reason}`,
    { guestName, flatNumber, reason },
    io,
    connectedUsers
  );
};

const notifyNewUser = async (adminId, userName, phone, io, connectedUsers) => {
  if (!await validateUser(adminId)) {
    return null;
  }
  return createNotification(
    adminId,
    'new_user',
    `New user registration: ${userName} (${phone})`,
    { userName, phone },
    io,
    connectedUsers
  );
};

const notifyUserApproved = async (userId, userName, io, connectedUsers) => {
  if (!await validateUser(userId)) {
    return null;
  }
  return createNotification(
    userId,
    'user_approved',
    `Your account has been approved. Welcome ${userName}!`,
    { userName },
    io,
    connectedUsers
  );
};

const notifyUserPendingApproval = async (adminId, userName, userId, io, connectedUsers) => {
  if (!await validateUser(adminId)) {
    return null;
  }
  
  // 1. Create notification for admin
  const notification = await createNotification(
    adminId,              // ID of the admin user
    'pending_approval',   // Notification type
    'A new user requires approval.', // Message
    { userName, userId }, // Metadata
    io,
    connectedUsers
  );
  
  // 2. (Optional) Update pending list for all admins in real time
  if (io && connectedUsers) {
    for (const [connectedUserId, userInfo] of connectedUsers.entries()) {
      if (userInfo.role === 'admin') {
        io.to(userInfo.socketId).emit('refresh_pending_users');
      }
    }
  }
  
  return notification;
};

const sendUserNotification = async (userId, type, message, metadata = {}, io, connectedUsers) => {
  if (!await validateUser(userId)) {
    return null;
  }
  return createNotification(
    userId,
    type,
    message,
    metadata,
    io,
    connectedUsers
  );
};

module.exports = {
  createNotification,
  notifyNewVisitor,
  notifyVisitApproved,
  notifyVisitRejected,
  notifyNewUser,
  notifyUserApproved,
  notifyUserPendingApproval,
  sendUserNotification
}; 