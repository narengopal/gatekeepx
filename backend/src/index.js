require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database');
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
const admin = require('./config/firebase');

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
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(cors());
app.use(express.json());

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
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
    const existingUser = await db('users').where({ phone }).first();
    if (existingUser) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Validate apartment exists
    if (apartment_id) {
      const apartment = await db('apartments').where({ id: apartment_id }).first();
      if (!apartment) {
        return res.status(400).json({ error: 'Invalid apartment selected' });
      }
    }

    // Validate flat exists and belongs to the selected apartment
    if (flat_id) {
      console.log('Checking flat:', { flat_id, apartment_id }); // Debug log
      const flat = await db('flats')
        .where({ 
          id: flat_id,
          apartment_id: apartment_id
        })
        .first();

      console.log('Found flat:', flat); // Debug log

      if (!flat) {
        return res.status(400).json({ error: 'Invalid flat selected or flat does not belong to the selected apartment' });
      }

      // If block_id is provided, validate it matches the flat's block
      if (block_id && flat.block_id !== parseInt(block_id)) {
        return res.status(400).json({ error: 'Selected block does not match the flat' });
      }
    }

    // Check flat occupancy (max 4 residents per flat)
    if (flat_id) {
      const flatOccupants = await db('users')
        .where({ flat_id, is_approved: true })
        .count('* as count')
        .first();
      if (flatOccupants.count >= 4) {
        return res.status(400).json({ error: 'Flat already has maximum number of residents' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user with explicit type conversion
    const [user] = await db('users').insert({
      name,
      phone,
      password: hashedPassword,
      role,
      apartment_id: apartment_id ? parseInt(apartment_id) : null,
      flat_id: flat_id ? parseInt(flat_id) : null,
      is_approved: role === 'resident' ? false : true
    }).returning('*');

    console.log('Created user:', user); // Debug log

    // Notify admin of new user registration
    if (role === 'resident') {
      try {
        const admins = await db('users')
          .where({ role: 'admin', is_approved: true })
          .select('id');

        // Get apartment and flat details for notification
        const apartment = await db('apartments').where({ id: apartment_id }).first();
        const flat = await db('flats').where({ id: flat_id }).first();
        const block = flat.block_id ? await db('blocks').where({ id: flat.block_id }).first() : null;

        // Notify all admins
        for (const admin of admins) {
          await notifyNewUser(admin.id, {
            id: user.id,
            name: user.name,
            phone: user.phone,
            role: user.role,
            apartment: {
              id: apartment.id,
              name: apartment.name
            },
            flat: {
              id: flat.id,
              number: flat.number,
              block: block ? {
                id: block.id,
                name: block.name
              } : null
            }
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
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        apartment_id: user.apartment_id,
        flat_id: user.flat_id,
        is_approved: user.is_approved
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
    const user = await db('users').where({ phone }).first();

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_approved) {
      return res.status(403).json({ error: 'Account pending approval' });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        role: user.role,
        flat_id: user.flat_id,
        apartment_id: user.apartment_id 
      }, 
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        flat_id: user.flat_id,
        apartment_id: user.apartment_id
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Store connected users
// Map of userId -> { socketId, role }
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('[Socket Debug] New client connected:', socket.id);

  // Accept userId and role in register event
  socket.on('register', (userId, role) => {
    if (!role) {
      console.warn(`[Socket Debug] User registered with undefined role: userId=${userId}, socketId=${socket.id}`);
      return;
    }
    console.log('[Socket Debug] User registered:', userId, 'with role:', role);
    connectedUsers.set(userId, { socketId: socket.id, role });
    socket.userId = userId;
    socket.role = role;
  });

  socket.on('disconnect', () => {
    console.log('[Socket Debug] Client disconnected:', socket.id);
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
    }
  });

  socket.on('error', (error) => {
    console.error('[Socket Debug] Socket error:', error);
  });
});

// Helper to get flat and block info
async function getFlatAndBlock(flat_id) {
  if (!flat_id) return { flat: null, block: null };
  const flat = await db('flats').where({ id: flat_id }).first();
  if (!flat) return { flat: null, block: null };
  let block = null;
  if (flat.block_id) {
    block = await db('blocks').where({ id: flat.block_id }).first();
  }
  return { flat, block };
}

// Guest Management Routes
app.post('/api/guests', authenticateToken, async (req, res) => {
  try {
    const { name, phone, purpose, expected_arrival } = req.body;
    
    // Create guest record
    const [guest] = await db('guests').insert({
      name,
      phone,
      invited_by: req.user.id,
      is_daily_pass: false
    }).returning('*');

    // Get flat ID
    const flat = await db('flats')
      .where({ id: req.user.flat_id })
      .first();
    if (!flat) {
      throw new Error('Flat not found');
    }

    // Generate QR token
    const qr_token = generateQRToken(guest.id, guest.name, req.user.flat_id);

    // Create visit record
    const [visit] = await db('visits').insert({
      guest_id: guest.id,
      flat_id: flat.id,
      status: 'pending',
      purpose,
      expected_arrival,
      qr_token
    }).returning('*');

    // Notify resident (pass guest name and flat number)
    await notifyNewVisitor(req.user.id, guest.name, flat.number, io, connectedUsers);

    console.log('Generated QR token:', qr_token); // Debug log

    res.status(201).json({ 
      qr_token,
      guest: {
        name: guest.name,
        phone: guest.phone
      },
      visit: {
        purpose,
        expected_arrival,
        status: visit.status
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
    let query = db('guests')
      .join('visits', 'guests.id', '=', 'visits.guest_id')
      .join('flats', 'visits.flat_id', '=', 'flats.id')
      .leftJoin('blocks', 'flats.block_id', 'blocks.id')
      .where('guests.invited_by', req.user.id)
      .select(
        'guests.id',
        'guests.name',
        'guests.phone',
        'visits.status',
        'visits.purpose',
        'visits.expected_arrival',
        'visits.checked_in_at',
        'visits.qr_token',
        'visits.created_at',
        'flats.number as flat_number',
        'flats.unique_id as flat_unique_id',
        'blocks.name as block_name'
      );
    if (status) {
      query = query.where('visits.status', status);
    }
    if (search) {
      query = query.where(function() {
        this.where('guests.name', 'ilike', `%${search}%`).orWhere('guests.phone', 'ilike', `%${search}%`);
      });
    }
    query = query.orderBy('visits.created_at', 'desc').limit(Number(limit)).offset(Number(offset));
    const guests = await query;
    res.json(guests);
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
    const guest = await db('guests').where({ id }).first();
    if (!guest || guest.invited_by !== req.user.id) {
      return res.status(404).json({ error: 'Guest not found or not authorized' });
    }
    const visit = await db('visits').where({ guest_id: id }).orderBy('created_at', 'desc').first();
    if (!visit || visit.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invites can be edited' });
    }

    // Update guest and visit
    await db('guests').where({ id }).update({ name, phone });
    await db('visits').where({ id: visit.id }).update({ purpose, expected_arrival });

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
    const guest = await db('guests').where({ id }).first();
    if (!guest || guest.invited_by !== req.user.id) {
      return res.status(404).json({ error: 'Guest not found or not authorized' });
    }
    const visit = await db('visits').where({ guest_id: id }).orderBy('created_at', 'desc').first();
    if (!visit || visit.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invites can be cancelled' });
    }
    // Delete visit and guest
    await db('visits').where({ id: visit.id }).del();
    await db('guests').where({ id }).del();
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
    const visit = await db('visits')
      .where({ qr_token, is_qr_used: false })
      .first();

    if (!visit) {
      return res.status(400).json({ error: 'Invalid or already used QR code' });
    }

    // Update visit status
    await db('visits')
      .where({ id: visit.id })
      .update({
        status: 'checked_in',
        checked_by: req.user.id,
        checked_in_at: new Date(),
        is_qr_used: true
      });

    // Get guest and flat details
    const guest = await db('guests').where({ id: visit.guest_id }).first();
    const flat = await db('flats').where({ id: visit.flat_id }).first();

    // Get all security users
    const securityUsers = await db('users')
      .where({ role: 'security', is_approved: true })
      .select('id');

    // Notify all security users (defensive check)
    for (const securityUser of securityUsers) {
      if (!guest.name || !flat.number) {
        console.error('[Check-in Notification Error] guest.name or flat.number is missing:', { guest, flat });
      }
      await notifyVisitApproved(securityUser.id, guest.name, flat.number, io, connectedUsers);
    }

    // NEW: Notify the resident of the flat via FCM
    const resident = await db('users')
      .where({ flat_id: flat.id, role: 'resident', is_approved: true })
      .first();
    if (resident) {
      // Get resident's FCM tokens
      const fcmTokens = await db('fcm_tokens')
        .where({ user_id: resident.id, is_active: true })
        .select('token');
      for (const t of fcmTokens) {
        const message = {
          notification: {
            title: 'Guest Checked In',
            body: `Your guest ${guest.name} has checked in at Flat ${flat.number}`
          },
          data: {
            type: 'guest_checked_in',
            guestName: guest.name,
            flatNumber: flat.number
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

    res.json({ message: 'Check-in successful', guestName: guest.name, flatNumber: flat.number });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Notification Routes
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await db('notifications')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc')
      .limit(50);

    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/notifications/mark-read', authenticateToken, async (req, res) => {
  try {
    const { notificationIds } = req.body;
    
    await db('notifications')
      .whereIn('id', notificationIds)
      .where({ user_id: req.user.id })
      .update({ is_read: true });

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
    const pendingUsers = await db('users')
      .where({ is_approved: false, role: 'resident' })
      .select('id', 'name', 'phone', 'flat_id', 'apartment_id', 'created_at');
    res.json(pendingUsers);
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
    const user = await db('users')
      .where({ id: userId, is_approved: false, role: 'resident' })
      .first();

    if (!user) {
      return res.status(404).json({ error: 'User not found or already approved' });
    }

    // Check if flat is still available (not full)
    if (user.flat_id) {
      const flat = await db('flats').where({ id: user.flat_id }).first();
      if (!flat) {
        return res.status(400).json({ error: 'Flat not found for this user.' });
      }
      const flatOccupants = await db('users')
        .where({ flat_id: user.flat_id, is_approved: true })
        .count('* as count')
        .first();
      if (flatOccupants.count >= 4) {
        return res.status(400).json({ error: 'Flat is now full. Cannot approve user.' });
      }
    }

    // Approve user
    const [approvedUser] = await db('users')
      .where({ id: userId })
      .update({ is_approved: true })
      .returning(['id', 'name', 'phone', 'role', 'flat_id', 'apartment_id', 'is_approved']);

    if (!approvedUser) {
      return res.status(500).json({ error: 'Failed to approve user. Please try again.' });
    }

    // Get apartment and flat details for notification
    let apartment = null;
    let flat = null;
    let block = null;
    if (approvedUser.apartment_id) {
      apartment = await db('apartments').where({ id: approvedUser.apartment_id }).first();
      if (!apartment) {
        return res.status(400).json({ error: 'Apartment not found for this user.' });
      }
    }
    if (approvedUser.flat_id) {
      flat = await db('flats').where({ id: approvedUser.flat_id }).first();
      if (!flat) {
        return res.status(400).json({ error: 'Flat not found for this user.' });
      }
      if (flat.block_id) {
        block = await db('blocks').where({ id: flat.block_id }).first();
        if (!block) {
          return res.status(400).json({ error: 'Block not found for this flat.' });
        }
      }
    }

    // Notify user of approval
    try {
      await notifyUserApproved(approvedUser.id, {
        apartment: apartment
          ? { id: apartment.id, name: apartment.name }
          : null,
        flat: flat
          ? {
              id: flat.id,
              number: flat.number,
              block: block
                ? { id: block.id, name: block.name }
                : null
            }
          : null
      });
    } catch (notifyError) {
      // Log but don't fail approval if notification fails
      console.error('Notification error:', notifyError);
    }

    // Real-time notification if user is connected
    try {
      if (connectedUsers && connectedUsers.has && connectedUsers.has(approvedUser.id)) {
        io.to(connectedUsers.get(approvedUser.id).socketId).emit('user_approved', {
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
      user: approvedUser
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
    const deleted = await db('users').where({ id: userId, is_approved: false }).del();
    if (!deleted) return res.status(404).json({ error: 'User not found or already approved' });
    res.json({ message: 'User rejected and deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Visit Log for Security/Admin
app.get('/api/visits', authenticateToken, async (req, res) => {
  try {
    if (!(req.user.role === 'security' || req.user.role === 'admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { filter, status, search } = req.query;
    let query = db('visits')
      .join('guests', 'visits.guest_id', '=', 'guests.id')
      .join('flats', 'visits.flat_id', '=', 'flats.id')
      .select(
        'visits.id',
        'guests.name',
        'guests.phone',
        'flats.number as flat_number',
        'visits.status',
        'visits.purpose',
        'visits.expected_arrival',
        'visits.checked_in_at',
        'visits.created_at'
      );

    // Filter by status
    if (status) {
      query = query.where('visits.status', status);
    }

    // Filter by date
    if (filter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.where('visits.created_at', '>=', today);
    } else if (filter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.where('visits.created_at', '>=', weekAgo);
    } else if (filter === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      query = query.where('visits.created_at', '>=', monthAgo);
    }

    // Search by guest name or phone
    if (search) {
      query = query.where(function() {
        this.where('guests.name', 'ilike', `%${search}%`).orWhere('guests.phone', 'ilike', `%${search}%`);
      });
    }

    query = query.orderBy('visits.created_at', 'desc');
    const visits = await query;
    res.json(visits);
  } catch (error) {
    console.error('Get visits log error:', error);
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
    const resident = await db('users').where({ flat_id: flat_id, role: 'resident', is_approved: true }).first();
    console.log('[Manual Invite Debug] Resident:', resident);
    if (!resident) return res.status(404).json({ error: 'Resident not found' });

    // Create guest
    const [guest] = await db('guests').insert({ name, phone, invited_by: null }).returning('*');
    console.log('[Manual Invite Debug] Guest:', guest);
    // Find flat
    const flat = await db('flats').where({ id: flat_id }).first();
    console.log('[Manual Invite Debug] Flat:', flat);
    if (!flat) return res.status(404).json({ error: 'Flat not found' });
    let block = null;
    if (flat.block_id) {
      block = await db('blocks').where({ id: flat.block_id }).first();
    }
    // Create visit
    const [visit] = await db('visits').insert({
      guest_id: guest.id,
      flat_id: flat.id,
      status: 'pending',
      purpose: null,
      expected_arrival: null,
      qr_token: null
    }).returning('*');
    console.log('[Manual Invite Debug] Visit:', visit);

    // Get resident's FCM tokens
    const fcmTokens = await db('fcm_tokens')
      .where({ user_id: resident.id, is_active: true })
      .select('token');
    console.log('[Manual Invite Debug] FCM tokens:', fcmTokens);

    // Send FCM notification to resident
    if (fcmTokens.length > 0) {
      const message = {
        notification: {
          title: 'New Visitor Request',
          body: `${name} has arrived at Flat ${flat.number}${block ? ' (' + block.name + ')' : ''}`
        },
        data: {
          type: 'new_visitor',
          visitId: visit.id.toString(),
          guestName: name,
          flatNumber: flat.number,
          blockName: block ? block.name : ''
        },
        token: fcmTokens[0].token
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
      console.log('[FCM Debug] No FCM tokens found for resident:', resident.id);
    }

    // Notify resident (DB)
    try {
      await notifyNewUser(resident.id, {
        id: guest.id,
        name: guest.name,
        phone: guest.phone,
        role: guest.role,
        flat_id: flat.id,
        flat_number: flat.number,
        block_name: block ? block.name : null,
        apartment_id: flat.apartment_id
      });
      console.log('[Notification Debug] DB notification created successfully');
    } catch (error) {
      console.error('[Notification Debug] Error creating DB notification:', error);
    }

    // Real-time notify resident (Socket.io)
    if (connectedUsers.has(resident.id)) {
      console.log('[Socket Debug] Sending real-time notification to resident:', resident.id);
      io.to(connectedUsers.get(resident.id).socketId).emit('new_manual_visitor', {
        guest: { id: guest.id, name: guest.name, phone: guest.phone },
        visit: { ...visit, flat_number: flat.number, block_name: block ? block.name : null }
      });
    } else {
      console.log('[Socket Debug] Resident not connected for real-time notification:', resident.id);
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
    const visit = await db('visits').where({ id: visitId }).first();
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    console.log('[Debug] Found visit:', visit);

    const flat = await db('flats').where({ id: visit.flat_id }).first();
    if (!flat || flat.id !== req.user.flat_id) {
      return res.status(403).json({ error: 'Not authorized for this flat' });
    }
    console.log('[Debug] Found flat:', flat);

    // Get guest details
    const guest = await db('guests').where({ id: visit.guest_id }).first();
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    console.log('[Debug] Found guest:', guest);

    // Update visit status
    await db('visits').where({ id: visitId }).update({ status: 'checked_in', checked_in_at: new Date() });
    console.log('[Debug] Updated visit status to checked_in');

    // Get all security users
    let securityUsers = [];
    try {
      securityUsers = await db('users')
        .where({ role: 'security', is_approved: true })
        .select('id');
      console.log('[Debug] Found security users:', securityUsers);
    } catch (notifyErr) {
      console.error('[Debug] Error fetching security users:', notifyErr);
    }

    // Notify all security users (DB notification)
    try {
      for (const securityUser of securityUsers) {
        console.log('[Debug] Sending notification to security user:', securityUser.id);
        await notifyVisitApproved(securityUser.id, guest.name, flat.number, io, connectedUsers);
      }
    } catch (notifyErr) {
      console.error('[Debug] Error sending notification to security users:', notifyErr);
    }

    // Send FCM notification to all security users
    try {
      for (const securityUser of securityUsers) {
        const fcmTokens = await db('fcm_tokens').where({ user_id: securityUser.id, is_active: true }).select('token');
        if (fcmTokens.length === 0) {
          console.log(`[FCM Debug] No FCM tokens found for security user: ${securityUser.id}`);
        } else {
          console.log(`[FCM Debug] Sending FCM notification to security user: ${securityUser.id}, tokens:`, fcmTokens.map(t => t.token));
        }
        for (const t of fcmTokens) {
          const message = {
            notification: {
              title: 'Visitor Approved',
              body: `Visitor ${guest.name} for Flat ${flat.number} has been approved.`
            },
            data: {
              type: 'visit_approved',
              visitId: visitId.toString(),
              guestName: guest.name,
              flatNumber: flat.number
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
                await db('fcm_tokens').where({ token: t.token }).del();
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
    const visit = await db('visits').where({ id: visitId }).first();
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    const flat = await db('flats').where({ id: visit.flat_id }).first();
    if (!flat || flat.id !== req.user.flat_id) {
      return res.status(403).json({ error: 'Not authorized for this flat' });
    }
    // Update visit status
    await db('visits').where({ id: visitId }).update({ status: 'rejected' });
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
    const flat = await db('flats').where({ id: req.user.flat_id }).first();
    if (!flat) return res.status(404).json({ error: 'Flat not found' });
    // Find all pending manual visits for this flat
    const visits = await db('visits')
      .where({ flat_id: flat.id, status: 'pending' })
      .whereNull('purpose') // manual sign-in has no purpose
      .join('guests', 'visits.guest_id', '=', 'guests.id')
      .select(
        'visits.id as visit_id',
        'guests.id as guest_id',
        'guests.name',
        'guests.phone',
        'visits.status',
        'visits.created_at',
        'flats.number as flat_number',
        'flats.unique_id as flat_unique_id'
      )
      .join('flats', 'visits.flat_id', '=', 'flats.id');
    res.json(visits);
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
    const apartments = await db('apartments').select('id', 'name', 'created_at', 'updated_at');
    res.json(apartments);
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
    const [apartment] = await db('apartments').insert({ name }).returning('*');
    res.status(201).json(apartment);
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
    const [apartment] = await db('apartments').where({ id }).update({ name, updated_at: new Date() }).returning('*');
    res.json(apartment);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Delete an apartment (and its blocks)
app.delete('/api/admin/apartments/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    await db('apartments').where({ id }).del();
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
    const blocks = await db('blocks').where({ apartment_id: apartmentId }).select('id', 'name', 'apartment_id', 'created_at', 'updated_at');
    res.json(blocks);
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
    const [block] = await db('blocks').insert({ name, apartment_id: apartmentId }).returning('*');
    res.status(201).json(block);
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
    const [block] = await db('blocks').where({ id }).update({ name, updated_at: new Date() }).returning('*');
    res.json(block);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Delete a block (and its flats)
app.delete('/api/admin/blocks/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    await db('blocks').where({ id }).del();
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
    const flats = await db('flats').where({ block_id: blockId }).select('id', 'number', 'block_id', 'created_at', 'updated_at');
    res.json(flats);
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
    const exists = await db('flats').where({ block_id: blockId, number }).first();
    if (exists) return res.status(400).json({ error: 'Flat number already exists in this block' });
    // Fetch block name for unique_id
    const block = await db('blocks').where({ id: blockId }).first();
    if (!block) return res.status(400).json({ error: 'Block not found' });
    const unique_id = `${block.name}${number}`;
    // Ensure unique_id is unique
    const uniqueExists = await db('flats').where({ unique_id }).first();
    if (uniqueExists) return res.status(400).json({ error: 'Flat unique ID already exists' });
    const [flat] = await db('flats').insert({ number, block_id: blockId, apartment_id: block.apartment_id, unique_id }).returning('*');
    res.status(201).json(flat);
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