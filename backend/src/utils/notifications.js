const db = require('../database');

const createNotification = async (userId, type, message, metadata = {}, io, connectedUsers) => {
  console.log('[Debug] createNotification called with:', { userId, type, message, metadata });
  try {
    // Defensive checks
    if (!userId) {
      console.error('[Notification Error] userId is missing or invalid:', userId);
      return null;
    }
    if (!type || !message) {
      console.error('[Notification Error] type or message is missing:', { type, message });
      return null;
    }
    // Create notification in database
    const [notification] = await db('notifications').insert({
      user_id: userId,
      type,
      message,
      metadata,
      is_read: false
    }).returning('*');
    console.log('[Debug] Created notification in database:', notification);

    // Send real-time notification if user is connected
    if (connectedUsers && connectedUsers[userId]) {
      console.log('[Debug] User is connected, sending real-time notification');
      connectedUsers[userId].emit('notification', notification);
    } else {
      console.log('[Debug] User is not connected, skipping real-time notification');
    }

    return notification;
  } catch (error) {
    console.error('[Debug] Error creating notification:', error);
    return null;
  }
};

const notifyNewVisitor = async (residentId, guestName, flatNumber, io, connectedUsers) => {
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
  return createNotification(
    userId,
    'user_approved',
    `Your account has been approved. Welcome ${userName}!`,
    { userName },
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
  notifyUserApproved
}; 