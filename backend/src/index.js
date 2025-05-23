require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { generateQRToken, verifyQRToken } = require('./utils/qr');
const {
  notifyNewVisitor,
  notifyVisitApproved,
  notifyVisitRejected,
  notifyNewUser,
  notifyUserApproved
} = require('./utils/notifications');
const http = require('http');
const { Server } = require('socket.io');
const fcmRoutes = require('./routes/fcm');
const notificationsRoutes = require('./routes/notifications');
const admin = require('./config/firebase');
const config = require('../knexfile')[process.env.NODE_ENV || 'development'];

// Create database connections
const pool = new Pool(config.connection);
const db = require('./database');

// Validate environment variables
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET environment variable is not set');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Store connected users
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('[Socket Debug] New client connected:', socket.id);

  // Handle user registration
  socket.on('register', async (data) => {
    try {
      const { userId, role, token } = data;
      console.log('[Socket Debug] User registering:', { userId, role });
      
      // Validate userId and role are provided
      if (!userId || !role) {
        console.error('[Socket Debug] Invalid registration attempt - missing userId or role:', data);
        socket.emit('registration_error', { message: 'UserId and role are required' });
        return;
      }
      
      // Validate token if provided
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          console.log('[Socket Debug] Token verification successful for user:', userId);
          
          // Verify userId matches token (enhanced security)
          if (decoded.id !== userId) {
            console.error('[Socket Debug] UserId mismatch with token:', { tokenUserId: decoded.id, providedUserId: userId });
            socket.emit('registration_error', { message: 'Authentication failed - user ID mismatch' });
            return;
          }
          
          // Verify role matches token (enhanced security)
          if (decoded.role && decoded.role !== role) {
            console.error('[Socket Debug] Role mismatch with token:', { tokenRole: decoded.role, providedRole: role });
            socket.emit('registration_error', { message: 'Authentication failed - role mismatch' });
            return;
          }
        } catch (tokenError) {
          console.error('[Socket Debug] Token verification failed:', tokenError.message);
          socket.emit('registration_error', { message: 'Invalid authentication token' });
          return;
        }
      } else {
        // In production, we should require tokens
        console.warn('[Socket Debug] No token provided for user:', userId);
      }
      
      // Remove any existing connection for this user
      if (connectedUsers.has(userId)) {
        const oldSocketId = connectedUsers.get(userId).socketId;
        console.log('[Socket Debug] Removing old connection:', oldSocketId);
        io.sockets.sockets.get(oldSocketId)?.disconnect();
      }
      
      // Store user connection
      connectedUsers.set(userId, { socketId: socket.id, role });
      console.log('[Socket Debug] User registered successfully:', { userId, role, socketId: socket.id });
      
      // Confirm successful registration to client
      socket.emit('registration_success', { userId, role });
      
      // Join role-specific room
      socket.join(role);
      
      // If security user, send initial visitor log
      if (role === 'security') {
        try {
          const visitorLog = await getVisitorLog();
          console.log('[Socket Debug] Sending initial visitor log:', visitorLog);
          socket.emit('visitor_log_update', visitorLog);
        } catch (error) {
          console.error('[Socket Debug] Error sending initial visitor log:', error);
        }
      }
    } catch (error) {
      console.error('[Socket Debug] Error in register:', error);
      socket.emit('registration_error', { message: 'Server error during registration' });
    }
  });

  // Handle new manual visitor
  socket.on('new_manual_visitor', async (data) => {
    try {
      console.log('[Socket Debug] New manual visitor:', data);
      
      // Get updated visitor log
      const visitorLog = await getVisitorLog();
      console.log('[Socket Debug] Sending updated visitor log:', visitorLog);
      
      // Broadcast to all security users
      io.to('security').emit('visitor_log_update', visitorLog);
    } catch (error) {
      console.error('[Socket Debug] Error handling new manual visitor:', error);
    }
  });

  // Handle visitor status updates
  socket.on('visitor_status_update', async (data) => {
    try {
      const { visitId, status } = data;
      console.log('[Socket Debug] Visitor status update:', { visitId, status });

      // Update database
      await pool.query(
        'UPDATE visits SET status = $1 WHERE id = $2 RETURNING *',
        [status, visitId]
      );

      // Get updated visitor log
      const visitorLog = await getVisitorLog();
      console.log('[Socket Debug] Sending updated visitor log after status change:', visitorLog);
      
      // Broadcast to all security users
      io.to('security').emit('visitor_log_update', visitorLog);

      // Get visit details for resident notification
      const visit = await pool.query(
        'SELECT v.*, g.name, g.phone, g.flat_id FROM visits v JOIN guests g ON v.guest_id = g.id WHERE v.id = $1',
        [visitId]
      );

      if (visit.rows[0]) {
        const { flat_id } = visit.rows[0];
        // Get resident for this flat
        const resident = await pool.query(
          'SELECT id FROM users WHERE flat_id = $1 AND role = $2',
          [flat_id, 'resident']
        );

        if (resident.rows[0]) {
          const residentId = resident.rows[0].id;
          // Notify resident
          io.to(residentId).emit('visitor_status_update', {
            visitId,
            status,
            guest: {
              name: visit.rows[0].name,
              phone: visit.rows[0].phone
            }
          });
        }
      }
    } catch (error) {
      console.error('[Socket Debug] Error in visitor_status_update:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log('[Socket Debug] Client disconnected:', socket.id, 'Reason:', reason);
    
    // Store socket ID for logging
    let disconnectedUserId = null;
    let disconnectedUserRole = null;
    
    // Remove user from connected users
    for (const [userId, userData] of connectedUsers.entries()) {
      if (userData.socketId === socket.id) {
        disconnectedUserId = userId;
        disconnectedUserRole = userData.role;
        console.log('[Socket Debug] Removing user from connected users:', { userId, role: userData.role });
        connectedUsers.delete(userId);
        break;
      }
    }
    
    if (!disconnectedUserId) {
      console.log('[Socket Debug] No registered user found for disconnected socket');
    } else {
      // Leave role-specific room
      if (disconnectedUserRole) {
        socket.leave(disconnectedUserRole);
      }
      
      // Emit disconnection event to relevant users if needed
      if (disconnectedUserRole === 'security') {
        // Notify others that a security guard went offline
        socket.to('admin').emit('security_status_change', { 
          userId: disconnectedUserId, 
          status: 'offline' 
        });
      }
      
      // Log currently connected users with their roles
      const connectedRoleCounts = {};
      for (const [, userData] of connectedUsers.entries()) {
        connectedRoleCounts[userData.role] = (connectedRoleCounts[userData.role] || 0) + 1;
      }
      
      console.log('[Socket Debug] Connected users after disconnect:', {
        total: connectedUsers.size,
        byRole: connectedRoleCounts
      });
    }
  });
});

// Helper function to get visitor log
async function getVisitorLog() {
  try {
    console.log('[Socket Debug] Getting visitor log from database');
    const result = await pool.query(`
      SELECT 
        v.id,
        v.status,
        v.created_at,
        v.expected_arrival,
        v.purpose,
        g.name,
        g.phone,
        f.number as flat_number
      FROM visits v
      JOIN guests g ON v.guest_id = g.id
      JOIN flats f ON v.flat_id = f.id
      ORDER BY v.created_at DESC
    `);

    console.log('[Socket Debug] Raw database result:', result.rows);
    const visits = result.rows;
    const formattedLog = {
      manualRequests: visits.filter(v => !v.purpose).map(v => ({
        id: v.id,
        name: v.name,
        phone: v.phone,
        status: v.status,
        created_at: v.created_at,
        flat_number: v.flat_number
      })),
      invitedRequests: visits.filter(v => v.purpose).map(v => ({
        id: v.id,
        name: v.name,
        phone: v.phone,
        purpose: v.purpose,
        status: v.status,
        created_at: v.created_at,
        expected_arrival: v.expected_arrival,
        flat_number: v.flat_number
      }))
    };
    
    console.log('[Socket Debug] Formatted visitor log:', formattedLog);
    return formattedLog;
  } catch (error) {
    console.error('[Socket Debug] Error getting visitor log:', error);
    return { manualRequests: [], invitedRequests: [] };
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Auth middleware
const authenticateToken = (req, res, next) => {
  try {
  const authHeader = req.headers['authorization'];
    if (!authHeader) {
      console.log('[Auth Debug] No authorization header');
      return res.status(401).json({ error: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
  if (!token) {
      console.log('[Auth Debug] No token in authorization header');
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
        console.log('[Auth Debug] Token verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
      console.log('[Auth Debug] Token verified for user:', user);
    req.user = user;
    next();
  });
  } catch (error) {
    console.error('[Auth Debug] Authentication error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('Registration request body:', req.body); // Debug log
    const { name, phone, password, role, apartment_id, flat_id, block_id } = req.body;

    // Validate required fields
    if (!name || !phone || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // For residents, apartment and flat are required
    if (role === 'resident') {
      if (!apartment_id) {
        return res.status(400).json({ error: 'Apartment selection is required' });
      }
      if (!flat_id) {
        return res.status(400).json({ error: 'Flat selection is required' });
      }
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Validate apartment exists
    if (apartment_id) {
      const apartment = await pool.query('SELECT * FROM apartments WHERE id = $1', [apartment_id]);
      if (apartment.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid apartment selected' });
      }
    }

    // Validate flat exists and belongs to the selected apartment
    if (flat_id) {
      console.log('Checking flat:', { flat_id, apartment_id }); // Debug log
      const flat = await pool.query('SELECT * FROM flats WHERE id = $1 AND apartment_id = $2', [flat_id, apartment_id]);

      console.log('Found flat:', flat.rows[0]); // Debug log

      if (flat.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid flat selected or flat does not belong to the selected apartment' });
      }

      // If block_id is provided, validate it matches the flat's block
      if (block_id && flat.rows[0].block_id !== parseInt(block_id)) {
        return res.status(400).json({ error: 'Selected block does not match the flat' });
      }
    }

    // Check flat occupancy (max 4 residents per flat)
    if (flat_id) {
    const flatOccupants = await pool.query('SELECT COUNT(*) FROM users WHERE flat_id = $1 AND is_approved = true', [flat_id]);
    if (flatOccupants.rows[0].count >= 4) {
      return res.status(400).json({ error: 'Flat already has maximum number of residents' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user with explicit type conversion
    const result = await pool.query('INSERT INTO users (name, phone, password, role, apartment_id, flat_id, is_approved) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', [
      name,
      phone,
      hashedPassword,
      role,
      apartment_id ? parseInt(apartment_id) : null,
      flat_id ? parseInt(flat_id) : null,
      role === 'resident' ? false : true
    ]);

    console.log('Created user:', result.rows[0]); // Debug log

    // Notify admin of new user registration
    if (role === 'resident') {
      try {
        const admins = await pool.query('SELECT id FROM users WHERE role = $1 AND is_approved = true', ['admin']);

        // Get apartment and flat details for notification
        const apartment = await pool.query('SELECT id, name FROM apartments WHERE id = $1', [apartment_id]);
        const flat = await pool.query('SELECT id, number FROM flats WHERE id = $1', [flat_id]);
        const block = flat.rows.length > 0 && flat.rows[0].block_id ? await pool.query('SELECT id, name FROM blocks WHERE id = $1', [flat.rows[0].block_id]) : null;

        // Notify all admins
        for (const admin of admins.rows) {
          await notifyNewUser(admin.id, {
            id: result.rows[0].id,
            name: result.rows[0].name,
            phone: result.rows[0].phone,
            role: result.rows[0].role,
            apartment: apartment.rows.length > 0 ? {
              id: apartment.rows[0].id,
              name: apartment.rows[0].name
            } : null,
            flat: flat.rows.length > 0 ? {
              id: flat.rows[0].id,
              number: flat.rows[0].number,
              block: block ? {
                id: block.rows[0].id,
                name: block.rows[0].name
              } : null
            } : null
          });
        }
      } catch (notificationError) {
        console.error('Error sending notifications:', notificationError);
        // Don't fail registration if notification fails
      }
    }

    res.status(201).json({
      message: 'Registration successful. ' + (role === 'resident' ? 'Awaiting admin approval.' : 'Account created.'),
      user: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        phone: result.rows[0].phone,
        role: result.rows[0].role,
        apartment_id: result.rows[0].apartment_id,
        flat_id: result.rows[0].flat_id,
        is_approved: result.rows[0].is_approved
      }
    });
  } catch (error) {
    console.error('Registration error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);

    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.rows[0].password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.rows[0].is_approved) {
      return res.status(403).json({ error: 'Account pending approval' });
    }

    const token = jwt.sign(
      { 
        id: user.rows[0].id, 
        role: user.rows[0].role,
        flat_id: user.rows[0].flat_id,
        apartment_id: user.rows[0].apartment_id 
      }, 
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user.rows[0].id,
        name: user.rows[0].name,
        phone: user.rows[0].phone,
        role: user.rows[0].role,
        flat_id: user.rows[0].flat_id,
        apartment_id: user.rows[0].apartment_id
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper to get flat and block info
async function getFlatAndBlock(flat_id) {
  if (!flat_id) return { flat: null, block: null };
  const flat = await pool.query('SELECT * FROM flats WHERE id = $1', [flat_id]);
  if (flat.rows.length === 0) return { flat: null, block: null };
  let block = null;
  if (flat.rows[0].block_id) {
    block = await pool.query('SELECT * FROM blocks WHERE id = $1', [flat.rows[0].block_id]);
  }
  return { flat: flat.rows[0], block: block ? block.rows[0] : null };
      }

// Guest Management Routes
app.post('/api/guests', authenticateToken, async (req, res) => {
  try {
    const { name, phone, purpose, expected_arrival } = req.body;
    
    // Create guest record
    const result = await pool.query('INSERT INTO guests (name, phone, invited_by, is_daily_pass) VALUES ($1, $2, $3, $4) RETURNING *', [
      name,
      phone,
      req.user.id,
      false
    ]);

    // Get flat ID
    const flat = await pool.query('SELECT * FROM flats WHERE id = $1', [req.user.flat_id]);
    if (flat.rows.length === 0) {
      throw new Error('Flat not found');
    }

    // Generate QR token
    const qr_token = generateQRToken(result.rows[0].id, result.rows[0].name, req.user.flat_id);

    // Create visit record
    const visitResult = await pool.query('INSERT INTO visits (guest_id, flat_id, status, purpose, expected_arrival, qr_token) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [
      result.rows[0].id,
      flat.rows[0].id,
      'pending',
      purpose,
      expected_arrival,
      qr_token
    ]);

    // Notify resident (pass guest name and flat number)
    await notifyNewVisitor(req.user.id, result.rows[0].name, flat.rows[0].number, io, connectedUsers);

    console.log('Generated QR token:', qr_token); // Debug log

    res.status(201).json({ 
      qr_token,
      guest: {
        name: result.rows[0].name,
        phone: result.rows[0].phone
      },
      visit: {
        purpose,
        expected_arrival,
        status: visitResult.rows[0].status
      }
    });
  } catch (error) {
    console.error('Create guest error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/guests', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'resident') {
      return res.status(403).json({ error: 'Resident access required' });
    }
    const { limit = 10, offset = 0, status, search } = req.query;
    let query = pool.query(`
      SELECT 
        g.id,
        g.name,
        g.phone,
        v.status,
        v.purpose,
        v.expected_arrival,
        v.checked_in_at,
        v.qr_token,
        v.created_at,
        f.number as flat_number,
        f.unique_id as flat_unique_id,
        b.name as block_name
      FROM guests g
      JOIN visits v ON g.id = v.guest_id
      JOIN flats f ON v.flat_id = f.id
      LEFT JOIN blocks b ON f.block_id = b.id
      WHERE g.invited_by = $1
    `, [req.user.id]);
    if (status) {
      query = query.then(result => pool.query('UPDATE visits SET status = $1 WHERE id = ANY($2)', [status, result.rows.map(row => row.id)]));
    }
    if (search) {
      query = query.then(result => pool.query(`
        UPDATE visits SET status = 'rejected' WHERE id = ANY($1) AND status = 'pending' AND (name ILIKE $2 OR phone ILIKE $2)`, [
          result.rows.map(row => row.id),
          `%${search}%`
        ]));
    }
    query = query.then(result => pool.query(`
      SELECT * FROM (
        SELECT * FROM visits WHERE guest_id = ANY($1) ORDER BY created_at DESC LIMIT $2 OFFSET $3
      ) AS filtered_visits
      JOIN flats f ON filtered_visits.flat_id = f.id
      JOIN blocks b ON f.block_id = b.id
    `, [result.rows.map(row => row.id), limit, offset]));
    const guests = await query;
    res.json(guests.rows);
  } catch (error) {
    console.error('Get guests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit a guest invite
app.put('/api/guests/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'resident') {
      return res.status(403).json({ error: 'Resident access required' });
    }
    const { id } = req.params;
    const { name, phone, purpose, expected_arrival } = req.body;

    // Find the guest and visit
    const guest = await pool.query('SELECT * FROM guests WHERE id = $1 AND invited_by = $2', [id, req.user.id]);
    if (guest.rows.length === 0) {
      return res.status(404).json({ error: 'Guest not found or not authorized' });
    }
    const visit = await pool.query('SELECT * FROM visits WHERE guest_id = $1 ORDER BY created_at DESC LIMIT 1', [id]);
    if (visit.rows.length === 0 || visit.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invites can be edited' });
    }

    // Update guest and visit
    const updateGuest = await pool.query('UPDATE guests SET name = $1, phone = $2 WHERE id = $3 RETURNING *', [name, phone, id]);
    const updateVisit = await pool.query('UPDATE visits SET purpose = $1, expected_arrival = $2 WHERE id = $3 RETURNING *', [purpose, expected_arrival, visit.rows[0].id]);

    res.json({ message: 'Guest invite updated successfully' });
  } catch (error) {
    console.error('Edit guest invite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel a guest invite
app.delete('/api/guests/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'resident') {
      return res.status(403).json({ error: 'Resident access required' });
    }
    const { id } = req.params;
    // Find the guest and visit
    const guest = await pool.query('SELECT * FROM guests WHERE id = $1 AND invited_by = $2', [id, req.user.id]);
    if (guest.rows.length === 0) {
      return res.status(404).json({ error: 'Guest not found or not authorized' });
    }
    const visit = await pool.query('SELECT * FROM visits WHERE guest_id = $1 ORDER BY created_at DESC LIMIT 1', [id]);
    if (visit.rows.length === 0 || visit.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invites can be cancelled' });
    }
    // Delete visit and guest
    await pool.query('DELETE FROM visits WHERE id = $1', [visit.rows[0].id]);
    await pool.query('DELETE FROM guests WHERE id = $1', [id]);
    res.json({ message: 'Guest invite cancelled successfully' });
  } catch (error) {
    console.error('Cancel guest invite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Visit Management Routes
app.post('/api/visits/check-in', authenticateToken, async (req, res) => {
  try {
    const { qr_token } = req.body;
    
    // Verify QR token
    const decoded = verifyQRToken(qr_token);
    const visit = await pool.query('SELECT * FROM visits WHERE qr_token = $1 AND is_qr_used = false', [qr_token]);

    if (visit.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or already used QR code' });
    }

    // Update visit status
    await pool.query('UPDATE visits SET status = $1, checked_by = $2, checked_in_at = $3, is_qr_used = $4 WHERE id = $5 RETURNING *', [
      'checked_in',
      req.user.id,
      new Date(),
      true,
      visit.rows[0].id
    ]);

    // Get guest and flat details
    const guest = await pool.query('SELECT * FROM guests WHERE id = $1', [visit.rows[0].guest_id]);
    const flat = await pool.query('SELECT * FROM flats WHERE id = $1', [visit.rows[0].flat_id]);

    // Get all security users
    const securityUsers = await pool.query('SELECT id FROM users WHERE role = $1 AND is_approved = true', ['security']);

    // Notify all security users (defensive check)
    for (const securityUser of securityUsers.rows) {
      if (!guest.rows[0].name || !flat.rows[0].number) {
        console.error('[Check-in Notification Error] guest.name or flat.number is missing:', { guest: guest.rows[0], flat: flat.rows[0] });
      }
      await notifyVisitApproved(securityUser.id, guest.rows[0].name, flat.rows[0].number, io, connectedUsers);
    }

    // NEW: Notify the resident of the flat via FCM
    const resident = await pool.query('SELECT * FROM users WHERE flat_id = $1 AND role = $2 AND is_approved = true', [flat.rows[0].id, 'resident']);
    if (resident.rows.length > 0) {
      // Get resident's FCM tokens
      const fcmTokens = await pool.query('SELECT token FROM fcm_tokens WHERE user_id = $1 AND is_active = true', [resident.rows[0].id]);
      for (const t of fcmTokens.rows) {
        const message = {
          notification: {
            title: 'Guest Checked In',
            body: `Your guest ${guest.rows[0].name} has checked in at Flat ${flat.rows[0].number}`
          },
          data: {
            type: 'guest_checked_in',
            guestName: guest.rows[0].name,
            flatNumber: flat.rows[0].number
          },
          token: t.token
        };
        try {
          const response = await admin.messaging().send(message);
          console.log(`[FCM Debug] FCM sent to resident token: ${t.token}, response:`, response);
        } catch (fcmError) {
          console.error(`[FCM Debug] Error sending FCM to resident token: ${t.token}`, fcmError);
        }
      }
    }

    res.json({ message: 'Check-in successful', guestName: guest.rows[0].name, flatNumber: flat.rows[0].number });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Notification Routes
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json(notifications.rows);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/notifications/mark-read', authenticateToken, async (req, res) => {
  try {
    const { notificationIds } = req.body;
    
    await pool.query('UPDATE notifications SET is_read = true WHERE id = ANY($1) AND user_id = $2', [notificationIds, req.user.id]);

    res.json({ message: 'Notifications marked as read' });
  } catch (error) {
    console.error('Mark notifications read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin Routes
app.get('/api/admin/pending-users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const pendingUsers = await pool.query('SELECT id, name, phone, flat_id, apartment_id, created_at FROM users WHERE is_approved = false AND role = $1', ['resident']);
    res.json(pendingUsers.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/approve-user/:userId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.params;

    // Get user details before approval
    const user = await pool.query('SELECT * FROM users WHERE id = $1 AND is_approved = false AND role = $2', [userId, 'resident']);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or already approved' });
    }

    // Check if flat is still available (not full)
    if (user.rows[0].flat_id) {
      const flat = await pool.query('SELECT * FROM flats WHERE id = $1', [user.rows[0].flat_id]);
      if (flat.rows.length === 0) {
        return res.status(400).json({ error: 'Flat not found for this user.' });
      }
      const flatOccupants = await pool.query('SELECT COUNT(*) FROM users WHERE flat_id = $1 AND is_approved = true', [user.rows[0].flat_id]);
      if (flatOccupants.rows[0].count >= 4) {
        return res.status(400).json({ error: 'Flat is now full. Cannot approve user.' });
      }
    }

    // Approve user
    const result = await pool.query('UPDATE users SET is_approved = true WHERE id = $1 RETURNING *', [userId]);

    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'Failed to approve user. Please try again.' });
    }

    // Get apartment and flat details for notification
    let apartment = null;
    let flat = null;
    let block = null;
    if (result.rows[0].apartment_id) {
      apartment = await pool.query('SELECT * FROM apartments WHERE id = $1', [result.rows[0].apartment_id]);
      if (apartment.rows.length === 0) {
        return res.status(400).json({ error: 'Apartment not found for this user.' });
      }
    }
    if (result.rows[0].flat_id) {
      flat = await pool.query('SELECT * FROM flats WHERE id = $1', [result.rows[0].flat_id]);
      if (flat.rows.length === 0) {
        return res.status(400).json({ error: 'Flat not found for this user.' });
      }
      if (flat.rows[0].block_id) {
        block = await pool.query('SELECT * FROM blocks WHERE id = $1', [flat.rows[0].block_id]);
        if (block.rows.length === 0) {
          return res.status(400).json({ error: 'Block not found for this flat.' });
        }
      }
    }

    // Notify user of approval
    try {
      await notifyUserApproved(result.rows[0].id, {
        apartment: apartment ? {
          id: apartment.rows[0].id,
          name: apartment.rows[0].name
        } : null,
        flat: flat
          ? {
              id: flat.rows[0].id,
              number: flat.rows[0].number,
              block: block ? {
                id: block.rows[0].id,
                name: block.rows[0].name
              } : null
            }
          : null
      });
    } catch (notifyError) {
      // Log but don't fail approval if notification fails
      console.error('Notification error:', notifyError);
    }

    // Real-time notification if user is connected
    try {
      if (connectedUsers && connectedUsers.has && connectedUsers.has(result.rows[0].id)) {
        io.to(connectedUsers.get(result.rows[0].id).socketId).emit('user_approved', {
          message: 'Your account has been approved',
          apartment,
          flat,
          block
        });
      }
    } catch (socketError) {
      // Log but don't fail approval if socket fails
      console.error('Socket notification error:', socketError);
    }

    res.json({
      message: 'User approved successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.delete('/api/admin/reject-user/:userId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { userId } = req.params;
    const deleted = await pool.query('DELETE FROM users WHERE id = $1 AND is_approved = false', [userId]);
    if (deleted.rowCount === 0) return res.status(404).json({ error: 'User not found or already approved' });
    res.json({ message: 'User rejected and deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Visit Log for Security/Admin
app.get('/api/visits', authenticateToken, async (req, res) => {
  try {
    console.log('[Visits Debug] User requesting visits:', req.user);
    
    if (!(req.user.role === 'security' || req.user.role === 'admin')) {
      console.log('[Visits Debug] Access denied for role:', req.user.role);
      return res.status(403).json({ error: 'Access denied' });
    }

    const { filter, status, search } = req.query;
    console.log('[Visits Debug] Query params:', { filter, status, search });

    let query = pool.query(`
      SELECT 
        v.id,
        g.name,
        g.phone,
        f.number as flat_number,
        v.status,
        v.purpose,
        v.expected_arrival,
        v.checked_in_at,
        v.created_at
      FROM visits v
      JOIN guests g ON v.guest_id = g.id
      JOIN flats f ON v.flat_id = f.id
    `);

    // Filter by status
    if (status) {
      query = query.then(result => pool.query('UPDATE visits SET status = $1 WHERE id = ANY($2)', [status, result.rows.map(row => row.id)]));
    }

    // Filter by date
    if (filter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.then(result => pool.query('UPDATE visits SET status = $1 WHERE created_at >= $2', ['checked_in', today]));
    } else if (filter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.then(result => pool.query('UPDATE visits SET status = $1 WHERE created_at >= $2', ['checked_in', weekAgo]));
    } else if (filter === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      query = query.then(result => pool.query('UPDATE visits SET status = $1 WHERE created_at >= $2', ['checked_in', monthAgo]));
    }

    // Search by guest name or phone
    if (search) {
      query = query.then(result => pool.query(`
        UPDATE visits SET status = 'rejected' WHERE id = ANY($1) AND status = 'pending' AND (name ILIKE $2 OR phone ILIKE $2)`, [
          result.rows.map(row => row.id),
          `%${search}%`
        ]));
    }

    query = query.then(result => pool.query(`
      SELECT * FROM (
        SELECT * FROM visits WHERE guest_id = ANY($1) ORDER BY created_at DESC LIMIT $2 OFFSET $3
      ) AS filtered_visits
      JOIN guests g ON filtered_visits.guest_id = g.id
      JOIN flats f ON filtered_visits.flat_id = f.id
    `, [result.rows.map(row => row.guest_id), limit, offset]));
    
    console.log('[Visits Debug] Executing query...');
    const visits = await query;
    console.log('[Visits Debug] Found visits:', visits.rows.length);

    res.json(visits.rows);
  } catch (error) {
    console.error('[Visits Debug] Error fetching visits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual sign-in endpoint for security
app.post('/api/guests/manual', async (req, res) => {
  try {
    console.log('[Manual Invite Debug] Request body:', req.body);
    const { name, phone, flat_id } = req.body;
    if (!flat_id) {
      return res.status(400).json({ error: 'flat_id is required and must be valid.' });
    }
    // Find resident by flat_id
    const resident = await pool.query('SELECT * FROM users WHERE flat_id = $1 AND role = $2 AND is_approved = true', [flat_id, 'resident']);
    console.log('[Manual Invite Debug] Resident:', resident.rows[0]);
    if (resident.rows.length === 0) return res.status(404).json({ error: 'Resident not found' });

    // Create guest
    const guestResult = await pool.query('INSERT INTO guests (name, phone, invited_by) VALUES ($1, $2, $3) RETURNING *', [name, phone, null]);
    console.log('[Manual Invite Debug] Guest:', guestResult.rows[0]);
    // Find flat
    const flat = await pool.query('SELECT * FROM flats WHERE id = $1', [flat_id]);
    console.log('[Manual Invite Debug] Flat:', flat.rows[0]);
    if (flat.rows.length === 0) return res.status(404).json({ error: 'Flat not found' });
    let block = null;
    if (flat.rows[0].block_id) {
      block = await pool.query('SELECT * FROM blocks WHERE id = $1', [flat.rows[0].block_id]);
    }
    // Create visit
    const visitResult = await pool.query('INSERT INTO visits (guest_id, flat_id, status, purpose, expected_arrival, qr_token) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [
      guestResult.rows[0].id,
      flat.rows[0].id,
      'pending',
      null,
      null,
      null
    ]);
    console.log('[Manual Invite Debug] Visit:', visitResult.rows[0]);

    // Get resident's FCM tokens
    const fcmTokens = await pool.query('SELECT token FROM fcm_tokens WHERE user_id = $1 AND is_active = true', [resident.rows[0].id]);
    console.log('[Manual Invite Debug] FCM tokens:', fcmTokens.rows);

    // Send FCM notification to resident
    if (fcmTokens.rows.length > 0) {
      const message = {
        notification: {
          title: 'New Visitor Request',
          body: `${name} has arrived at Flat ${flat.rows[0].number}${block ? ' (' + block.rows[0].name + ')' : ''}`
        },
        data: {
          type: 'new_visitor',
          visitId: visitResult.rows[0].id.toString(),
          guestName: name,
          flatNumber: flat.rows[0].number,
          blockName: block ? block.rows[0].name : ''
        },
        token: fcmTokens.rows[0].token
      };

      try {
        console.log('[FCM Debug] Attempting to send FCM message:', message);
        const response = await admin.messaging().send(message);
        console.log('[FCM Debug] FCM notification sent successfully:', response);
      } catch (error) {
        console.error('[FCM Debug] Error sending FCM notification:', {
          error: error.message,
          code: error.code,
          errorInfo: error.errorInfo,
          stack: error.stack
        });
      }
    } else {
      console.log('[FCM Debug] No FCM tokens found for resident:', resident.rows[0].id);
    }

    // Notify resident (DB)
    try {
      await notifyNewUser(resident.rows[0].id, {
        id: guestResult.rows[0].id,
        name: guestResult.rows[0].name,
        phone: guestResult.rows[0].phone,
        role: guestResult.rows[0].role,
        flat_id: flat.rows[0].id,
        flat_number: flat.rows[0].number,
        block_name: block ? block.rows[0].name : null,
        apartment_id: flat.rows[0].apartment_id
      });
      console.log('[Notification Debug] DB notification created successfully');
    } catch (error) {
      console.error('[Notification Debug] Error creating DB notification:', error);
    }

    // Real-time notify resident (Socket.io)
    if (connectedUsers.has(resident.rows[0].id)) {
      console.log('[Socket Debug] Sending real-time notification to resident:', resident.rows[0].id);
      io.to(connectedUsers.get(resident.rows[0].id).socketId).emit('new_manual_visitor', {
        guest: { id: guestResult.rows[0].id, name: guestResult.rows[0].name, phone: guestResult.rows[0].phone },
        visit: { ...visitResult.rows[0], flat_number: flat.rows[0].number, block_name: block ? block.rows[0].name : null }
      });
    } else {
      console.log('[Socket Debug] Resident not connected for real-time notification:', resident.rows[0].id);
    }

    res.status(201).json({ message: 'Manual sign-in request sent to resident for approval.' });
  } catch (error) {
    console.error('Manual sign-in error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Approve manual visitor request
app.post('/api/guests/:visitId/approve-manual', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'resident') {
      return res.status(403).json({ error: 'Resident access required' });
    }
    const { visitId } = req.params;
    console.log('[Debug] Approving manual visit:', visitId);

    // Find the visit and flat
    const visit = await pool.query('SELECT * FROM visits WHERE id = $1', [visitId]);
    if (visit.rows.length === 0) return res.status(404).json({ error: 'Visit not found' });
    console.log('[Debug] Found visit:', visit.rows[0]);

    const flat = await pool.query('SELECT * FROM flats WHERE id = $1', [visit.rows[0].flat_id]);
    if (flat.rows.length === 0 || flat.rows[0].id !== req.user.flat_id) {
      return res.status(403).json({ error: 'Not authorized for this flat' });
    }
    console.log('[Debug] Found flat:', flat.rows[0]);

    // Get guest details
    const guest = await pool.query('SELECT * FROM guests WHERE id = $1', [visit.rows[0].guest_id]);
    if (guest.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
    console.log('[Debug] Found guest:', guest.rows[0]);

    // Update visit status
    await pool.query('UPDATE visits SET status = $1, checked_in_at = $2 WHERE id = $3', ['checked_in', new Date(), visitId]);
    console.log('[Debug] Updated visit status to checked_in');

    // Get all security users
    let securityUsers = [];
    try {
      securityUsers = await pool.query('SELECT id FROM users WHERE role = $1 AND is_approved = true', ['security']);
      console.log('[Debug] Found security users:', securityUsers.rows);
    } catch (notifyErr) {
      console.error('[Debug] Error fetching security users:', notifyErr);
    }

    // Notify all security users (DB notification)
    try {
      for (const securityUser of securityUsers.rows) {
        console.log('[Debug] Sending notification to security user:', securityUser.id);
        await notifyVisitApproved(securityUser.id, guest.rows[0].name, flat.rows[0].number, io, connectedUsers);
      }
    } catch (notifyErr) {
      console.error('[Debug] Error sending notification to security users:', notifyErr);
    }

    // Send FCM notification to all security users
    try {
      for (const securityUser of securityUsers.rows) {
        const fcmTokens = await pool.query('SELECT token FROM fcm_tokens WHERE user_id = $1 AND is_active = true', [securityUser.id]);
        if (fcmTokens.rows.length === 0) {
          console.log(`[FCM Debug] No FCM tokens found for security user: ${securityUser.id}`);
        } else {
          console.log(`[FCM Debug] Sending FCM notification to security user: ${securityUser.id}, tokens:`, fcmTokens.rows.map(t => t.token));
        }
        for (const t of fcmTokens.rows) {
          const message = {
            notification: {
              title: 'Visitor Approved',
              body: `Visitor ${guest.rows[0].name} for Flat ${flat.rows[0].number} has been approved.`
            },
            data: {
              type: 'visit_approved',
              visitId: visitId.toString(),
              guestName: guest.rows[0].name,
              flatNumber: flat.rows[0].number
            },
            token: t.token
          };
          try {
            const response = await admin.messaging().send(message);
            console.log(`[FCM Debug] FCM sent to token: ${t.token}, response:`, response);
          } catch (fcmError) {
            console.error(`[FCM Debug] Error sending FCM to token: ${t.token}`, fcmError);
            // Remove invalid tokens from DB
            if (
              fcmError.errorInfo?.code === 'messaging/registration-token-not-registered' ||
              fcmError.errorInfo?.code === 'messaging/mismatched-credential'
            ) {
              try {
                await pool.query('DELETE FROM fcm_tokens WHERE token = $1', [t.token]);
                console.log(`[FCM Debug] Removed invalid FCM token from DB: ${t.token}`);
              } catch (removeErr) {
                console.error(`[FCM Debug] Failed to remove invalid FCM token: ${t.token}`, removeErr);
              }
            }
          }
        }
      }
    } catch (fcmOuterError) {
      console.error('[FCM Debug] Error in FCM notification loop:', fcmOuterError);
    }

    // Notify all connected security users via socket (real-time update)
    try {
      connectedUsers.forEach((userInfo, userId) => {
        if (userInfo.role === 'security') {
          console.log('[Debug] Sending socket notification to security user:', userId);
          io.to(userInfo.socketId).emit('manual_visitor_status', { visitId, status: 'checked_in' });
          // Also emit refresh_visitor_log event
          io.to(userInfo.socketId).emit('refresh_visitor_log');
        }
      });
    } catch (socketErr) {
      console.error('[Debug] Error sending socket notification:', socketErr);
    }

    // Notify the resident in real time
    try {
      if (connectedUsers.has(req.user.id)) {
        io.to(connectedUsers.get(req.user.id).socketId).emit('manual_visitor_status_update', {
          visitId,
          status: 'checked_in'
        });
      }
    } catch (err) {
      console.error('[Debug] Error sending resident real-time update:', err);
    }

    res.json({ message: 'Visitor approved and checked in.' });
  } catch (error) {
    console.error('Approve manual visitor error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Reject manual visitor request
app.post('/api/guests/:visitId/reject-manual', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'resident') {
      return res.status(403).json({ error: 'Resident access required' });
    }
    const { visitId } = req.params;
    // Find the visit and flat
    const visit = await pool.query('SELECT * FROM visits WHERE id = $1', [visitId]);
    if (visit.rows.length === 0) return res.status(404).json({ error: 'Visit not found' });
    const flat = await pool.query('SELECT * FROM flats WHERE id = $1', [visit.rows[0].flat_id]);
    if (flat.rows.length === 0 || flat.rows[0].id !== req.user.flat_id) {
      return res.status(403).json({ error: 'Not authorized for this flat' });
    }
    // Update visit status
    await pool.query('UPDATE visits SET status = $1 WHERE id = $2', ['rejected', visitId]);
    // Notify all connected security users
    connectedUsers.forEach((userInfo, userId) => {
      if (userInfo.role === 'security') {
        io.to(userInfo.socketId).emit('manual_visitor_status', { visitId, status: 'rejected' });
      }
    });
    // Notify the resident in real time
    try {
      if (connectedUsers.has(req.user.id)) {
        io.to(connectedUsers.get(req.user.id).socketId).emit('manual_visitor_status_update', {
          visitId,
          status: 'rejected'
        });
      }
    } catch (err) {
      console.error('[Debug] Error sending resident real-time update:', err);
    }
    res.json({ message: 'Visitor rejected.' });
  } catch (error) {
    console.error('Reject manual visitor error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all pending manual visitor requests for a resident's flat
app.get('/api/guests/manual-pending', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'resident') {
      return res.status(403).json({ error: 'Resident access required' });
    }
    // Find flat
    const flat = await pool.query('SELECT * FROM flats WHERE id = $1', [req.user.flat_id]);
    if (flat.rows.length === 0) return res.status(404).json({ error: 'Flat not found' });
    // Find all pending manual visits for this flat
    const visits = await pool.query(`
      SELECT 
        v.id as visit_id,
        g.id as guest_id,
        g.name,
        g.phone,
        v.status,
        v.created_at,
        f.number as flat_number,
        f.unique_id as flat_unique_id
      FROM visits v
      JOIN guests g ON v.guest_id = g.id
      JOIN flats f ON v.flat_id = f.id
      WHERE v.flat_id = $1 AND v.status = 'pending' AND v.purpose IS NULL
    `, [req.user.flat_id]);
    res.json(visits.rows);
  } catch (error) {
    console.error('Get manual pending requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Apartment Management Endpoints (with Apartments)
// List all apartments
app.get('/api/admin/apartments', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const apartments = await pool.query('SELECT id, name, created_at, updated_at FROM apartments');
    res.json(apartments.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Create a new apartment
app.post('/api/admin/apartments', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Apartment name required' });
    const result = await pool.query('INSERT INTO apartments (name) VALUES ($1) RETURNING *', [name]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Edit an apartment
app.put('/api/admin/apartments/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Apartment name required' });
    const result = await pool.query('UPDATE apartments SET name = $1, updated_at = $2 WHERE id = $3 RETURNING *', [name, new Date(), id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Delete an apartment (and its blocks)
app.delete('/api/admin/apartments/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    await pool.query('DELETE FROM apartments WHERE id = $1', [id]);
    res.json({ message: 'Apartment deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// List all blocks in an apartment
app.get('/api/admin/apartments/:apartmentId/blocks', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { apartmentId } = req.params;
    const blocks = await pool.query('SELECT id, name, apartment_id, created_at, updated_at FROM blocks WHERE apartment_id = $1', [apartmentId]);
    res.json(blocks.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Add a block to an apartment
app.post('/api/admin/apartments/:apartmentId/blocks', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { apartmentId } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Block name required' });
    const result = await pool.query('INSERT INTO blocks (name, apartment_id) VALUES ($1, $2) RETURNING *', [name, apartmentId]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Edit a block
app.put('/api/admin/blocks/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Block name required' });
    const result = await pool.query('UPDATE blocks SET name = $1, updated_at = $2 WHERE id = $3 RETURNING *', [name, new Date(), id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Delete a block (and its flats)
app.delete('/api/admin/blocks/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    await pool.query('DELETE FROM blocks WHERE id = $1', [id]);
    res.json({ message: 'Block deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// List all flats in a block
app.get('/api/admin/blocks/:blockId/flats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { blockId } = req.params;
    const flats = await pool.query('SELECT id, number, block_id, created_at, updated_at FROM flats WHERE block_id = $1', [blockId]);
    res.json(flats.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Add a flat to a block
app.post('/api/admin/blocks/:blockId/flats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { blockId } = req.params;
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Flat number required' });
    // Ensure unique flat number within block
    const exists = await pool.query('SELECT * FROM flats WHERE block_id = $1 AND number = $2', [blockId, number]);
    if (exists.rows.length > 0) return res.status(400).json({ error: 'Flat number already exists in this block' });
    // Fetch block name for unique_id
    const block = await pool.query('SELECT * FROM blocks WHERE id = $1', [blockId]);
    if (block.rows.length === 0) return res.status(400).json({ error: 'Block not found' });
    const unique_id = `${block.rows[0].name}${number}`;
    // Ensure unique_id is unique
    const uniqueExists = await pool.query('SELECT * FROM flats WHERE unique_id = $1', [unique_id]);
    if (uniqueExists.rows.length > 0) return res.status(400).json({ error: 'Flat unique ID already exists' });
    const result = await pool.query('INSERT INTO flats (number, block_id, apartment_id, unique_id) VALUES ($1, $2, $3, $4) RETURNING *', [number, blockId, block.rows[0].apartment_id, unique_id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Edit a flat
app.put('/api/admin/flats/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Flat number required' });
    // Ensure unique flat number within block
    const flat = await db('flats').where({ id }).first();
    if (!flat) return res.status(404).json({ error: 'Flat not found' });
    const exists = await db('flats').where({ block_id: flat.block_id, number }).andWhereNot({ id }).first();
    if (exists) return res.status(400).json({ error: 'Flat number already exists in this block' });
    const [updated] = await db('flats').where({ id }).update({ number, updated_at: new Date() }).returning('*');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Delete a flat
app.delete('/api/admin/flats/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    await db('flats').where({ id }).del();
    res.json({ message: 'Flat deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Security Guard Management Endpoints
// List all security guards
app.get('/api/admin/security-guards', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const securityGuards = await db('users')
      .where({ role: 'security' })
      .select('id', 'name', 'phone', 'created_at');
    res.json(securityGuards);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Add a new security guard
app.post('/api/admin/security-guards', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) return res.status(400).json({ error: 'Missing required fields' });
    const [newGuard] = await db('users')
      .insert({ name, phone, password, role: 'security', is_approved: true })
      .returning(['id', 'name', 'phone', 'created_at']);
    res.status(201).json(newGuard);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Update a security guard
app.put('/api/admin/security-guards/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Missing required fields' });
    const [updatedGuard] = await db('users')
      .where({ id, role: 'security' })
      .update({ name, phone })
      .returning(['id', 'name', 'phone', 'created_at']);
    if (!updatedGuard) return res.status(404).json({ error: 'Security guard not found' });
    res.json(updatedGuard);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Delete a security guard
app.delete('/api/admin/security-guards/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    const deleted = await db('users').where({ id, role: 'security' }).del();
    if (!deleted) return res.status(404).json({ error: 'Security guard not found' });
    res.json({ message: 'Security guard deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: User Management Endpoints
// List all users (with optional role and search filters)
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { role, search } = req.query;
    let query = db('users')
      .leftJoin('flats', 'users.flat_id', 'flats.id')
      .leftJoin('blocks', 'flats.block_id', 'blocks.id')
      .select(
        'users.id',
        'users.name',
        'users.phone',
        'users.role',
        'users.flat_id',
        'users.apartment_id',
        'users.is_approved',
        'users.created_at',
        'flats.number as flat_number',
        'flats.unique_id as flat_unique_id',
        'blocks.name as block_name'
      );
    if (role) query = query.where({ 'users.role': role });
    if (search) {
      query = query.where(function() {
        this.where('users.name', 'ilike', `%${search}%`).orWhere('users.phone', 'ilike', `%${search}%`);
      });
    }
    const users = await query.orderBy('users.created_at', 'desc');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Update user details
app.put('/api/admin/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    const { name, phone, flat_id, apartment_id } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
    const updateData = { name, phone };
    if (flat_id !== undefined) updateData.flat_id = flat_id;
    if (apartment_id !== undefined) updateData.apartment_id = apartment_id;
    const [user] = await db('users').where({ id }).update(updateData).returning(['id', 'name', 'phone', 'role', 'flat_id', 'apartment_id', 'is_approved']);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Delete a user
app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    // Fetch the user before deleting
    const user = await db('users').where({ id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });
    await db('users').where({ id }).del();
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Use routes
app.use('/api/fcm', fcmRoutes);
app.use('/api/notifications', notificationsRoutes);

// Add this with other route registrations
app.use('/api/fcm', fcmRoutes);

// Add a flat directly to an apartment (no block)
app.post('/api/admin/apartments/:apartmentId/flats', authenticateToken, async (req, res) => {
  try {
    if (!(req.user.role === 'admin' || req.user.role === 'super_admin')) return res.status(403).json({ error: 'Admin access required' });
    const { apartmentId } = req.params;
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Flat number required' });
    // Ensure unique flat number within apartment
    const exists = await db('flats').where({ apartment_id: apartmentId, number }).first();
    if (exists) return res.status(400).json({ error: 'Flat number already exists in this apartment' });
    const unique_id = number;
    // Ensure unique_id is unique
    const uniqueExists = await db('flats').where({ unique_id }).first();
    if (uniqueExists) return res.status(400).json({ error: 'Flat unique ID already exists' });
    const [flat] = await db('flats').insert({ number, apartment_id: apartmentId, unique_id }).returning('*');
    res.status(201).json(flat);
  } catch (error) {
    console.error('Create flat error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get all flats in an apartment (including those without blocks)
app.get('/api/admin/apartments/:apartmentId/flats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { apartmentId } = req.params;
    const flats = await db('flats')
      .where({ apartment_id: apartmentId })
      .select('id', 'number', 'block_id', 'apartment_id', 'unique_id')
      .orderBy('number');
    res.json(flats);
  } catch (error) {
    console.error('Error fetching apartment flats:', error);
    res.status(500).json({ error: 'Failed to fetch apartment flats' });
  }
});

// Get all flats for dropdowns (public, for security and registration)
app.get('/api/flats', async (req, res) => {
  try {
    const { apartment_id } = req.query;
    let query = db('flats');
    if (apartment_id) query = query.where({ apartment_id });
    const flats = await query.select('id', 'number', 'block_id', 'apartment_id', 'unique_id').orderBy('number');
    res.json(flats);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all blocks for a resident's apartment
app.get('/api/blocks', authenticateToken, async (req, res) => {
  try {
    if (!req.user.apartment_id) {
      return res.status(400).json({ error: 'No apartment assigned' });
    }
    const blocks = await db('blocks')
      .where({ apartment_id: req.user.apartment_id })
      .select('id', 'name');
    res.json(blocks);
  } catch (error) {
    console.error('Get blocks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all apartments (for registration)
app.get('/api/apartments', async (req, res) => {
  try {
    const apartments = await db('apartments')
      .select('id', 'name');
    res.json(apartments);
  } catch (error) {
    console.error('Get apartments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await db('users')
      .where({ id: req.user.id })
      .select('id', 'name', 'phone', 'role', 'flat_id', 'apartment_id', 'is_approved', 'created_at')
      .first();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get apartment and flat details if available
    let apartment = null;
    let flat = null;
    let block = null;

    if (user.apartment_id) {
      apartment = await db('apartments')
        .where({ id: user.apartment_id })
        .select('id', 'name')
        .first();
    }

    if (user.flat_id) {
      flat = await db('flats')
        .where({ id: user.flat_id })
        .select('id', 'number', 'block_id')
        .first();

      if (flat && flat.block_id) {
        block = await db('blocks')
          .where({ id: flat.block_id })
          .select('id', 'name')
          .first();
      }
    }

    res.json({
      ...user,
      apartment,
      flat,
      block
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const [user] = await db('users')
      .where({ id: req.user.id })
      .update({ name, phone })
      .returning(['id', 'name', 'phone', 'role', 'flat_id', 'apartment_id', 'is_approved']);

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password
app.put('/api/profile/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    const user = await db('users')
      .where({ id: req.user.id })
      .select('password')
      .first();

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db('users')
      .where({ id: req.user.id })
      .update({ password: hashedPassword });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public endpoint to get blocks by apartment_id
app.get('/api/blocks', async (req, res) => {
  try {
    const { apartment_id } = req.query;
    let query = db('blocks');
    if (apartment_id) query = query.where({ apartment_id });
    const blocks = await query.select('id', 'name', 'apartment_id');
    res.json(blocks);
  } catch (error) {
    console.error('Get blocks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all flats (admin)
app.get('/api/admin/flats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const flats = await db('flats').select('id', 'number', 'unique_id', 'block_id', 'apartment_id');
    res.json(flats);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment variables:', {
    JWT_SECRET: process.env.JWT_SECRET ? 'Set' : 'Not set',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
    NODE_ENV: process.env.NODE_ENV
  });
}); 

// Export connectedUsers for use in notification functions
module.exports = { io, connectedUsers }; 