import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import useResidentSocket from '../hooks/useResidentSocket';
import { 
  HomeIcon, 
  UserGroupIcon, 
  QrCodeIcon, 
  ClipboardDocumentListIcon,
  BellIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';
import { useNotifications } from '../hooks/useNotifications';
import { requestNotificationPermission, onMessageListener } from '../config/firebase';
import socketService from '../services/socketService';

// Helper to get flat display string
function getFlatDisplay(flat_id, flats) {
  const flat = flats.find(f => f.id === flat_id);
  if (!flat) return '-';
  return flat.unique_id || flat.number;
}

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showNotification } = useNotifications();
  const [notifications, setNotifications] = useState([]);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', purpose: '', expected_arrival: '' });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [modalEditMode, setModalEditMode] = useState(false);
  const [modalEditForm, setModalEditForm] = useState({ name: '', phone: '', purpose: '', expected_arrival: '' });
  const [pendingManualRequests, setPendingManualRequests] = useState([]);
  const [processingRequestId, setProcessingRequestId] = useState(null);
  const [showManualSignIn, setShowManualSignIn] = useState(false);
  const [manualForm, setManualForm] = useState({ name: '', phone: '', flat_id: '' });
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualSuccess, setManualSuccess] = useState('');
  const [manualRequestsSecurity, setManualRequestsSecurity] = useState([]);
  const [invitedRequestsSecurity, setInvitedRequestsSecurity] = useState([]);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [users, setUsers] = useState([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState('');
  const [editUserId, setEditUserId] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ name: '', phone: '', flat_number: '' });
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const ITEMS_PER_PAGE = 10;
  const socketRef = useRef(null);
  const [showBellPopover, setShowBellPopover] = useState(false);
  const [showProfilePopover, setShowProfilePopover] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const bellRef = useRef(null);
  const profileRef = useRef(null);
  const [fcmToken, setFcmToken] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingUsersLoading, setPendingUsersLoading] = useState(false);
  const [pendingUsersError, setPendingUsersError] = useState('');
  const [flats, setFlats] = useState([]);
  // Test notification state for security
  const [testNotifLoading, setTestNotifLoading] = useState(false);
  const [testNotifResult, setTestNotifResult] = useState('');

  // Move fetchManualPending out of useEffect so it can be called from the websocket event handler
  const fetchManualPending = async () => {
    if (user?.role === 'resident') {
      try {
        const res = await axios.get('/api/guests/manual-pending');
        setPendingManualRequests(
          res.data.map((v) => ({
            guest: { id: v.guest_id, name: v.name, phone: v.phone },
            visit: { id: v.visit_id, status: v.status, created_at: v.created_at }
          }))
        );
        console.log('[Notification Debug] Pending manual requests:', res.data);
      } catch (err) {
        // ignore
      }
    }
  };

  const fetchPendingUsers = async () => {
    if (user?.role !== 'admin') return;
    
    setPendingUsersLoading(true);
    setPendingUsersError('');
    try {
      const response = await axios.get('/api/admin/pending-users');
      setPendingUsers(response.data);
      console.log('[Admin Debug] Pending users:', response.data);
    } catch (error) {
      console.error('[Admin Debug] Error fetching pending users:', error);
      setPendingUsersError('Failed to fetch pending users');
    } finally {
      setPendingUsersLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    if (user?.role === 'resident') {
      fetchGuests();
      fetchManualPending();
    } else if (user?.role === 'admin') {
      fetchPendingUsers();
    }
  }, [user]);

  useResidentSocket(user?.role === 'resident' ? user.id : null, user?.role === 'resident' ? user.role : null, (data) => {
    console.log('Resident received new_manual_visitor event:', data);
    setPendingManualRequests((prev) => [data, ...prev]);
    showNotification('New Visitor Request', {
      body: `${data.guest.name} is requesting to visit you.`,
      icon: '/path/to/icon.png'
    });
  });

  // Security: fetch all manual and invited requests separately
  useEffect(() => {
    const fetchManualAndInvitedForSecurity = async () => {
      if (user?.role === 'security') {
        try {
          const token = localStorage.getItem('token');
          if (!token) {
            console.error('[Debug] No token found');
            setError('Authentication required');
            return;
          }

          console.log('[Debug] Fetching visitor logs for security');
          const res = await axios.get('/api/visits', {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          
          if (!res.data) {
            console.error('[Debug] No data received from API');
            setError('No data received');
            return;
          }

          console.log('[Debug] Received visitor logs:', res.data);
          
          // Separate manual and invited requests
          const manualRequests = res.data.filter((v) => !v.purpose);
          const invitedRequests = res.data.filter((v) => v.purpose);
          
          setManualRequestsSecurity(manualRequests);
          setInvitedRequestsSecurity(invitedRequests);
          setError(''); // Clear any previous errors
        } catch (err) {
          console.error('[Debug] Error fetching visitor logs:', err);
          if (err.response?.status === 401 || err.response?.status === 403) {
            setError('Authentication failed. Please log in again.');
            logout();
            navigate('/login');
          } else {
            setError('Failed to fetch visitor logs. Please try again.');
          }
        }
      }
    };
    
    if (user?.role === 'security') {
      fetchManualAndInvitedForSecurity();
    }
  }, [user, logout, navigate]);

  // Security: listen for real-time status updates
  useEffect(() => {
    if (user?.role !== 'security') return;

    // Clean up any existing socket connection
    if (socketRef.current) {
      console.log('[Socket Debug] Cleaning up existing socket connection');
      socketRef.current.disconnect();
    }

    const { io } = require('socket.io-client');
    const socket = io('http://localhost:3001', { 
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000
    });
    socketRef.current = socket;

    console.log('[Socket Debug] Security user connecting with ID:', user.id);
    socket.emit('register', { userId: user.id, role: user.role });

    // Listen for visitor log updates
    socket.on('visitor_log_update', (data) => {
      console.log('[Socket Debug] Received visitor log update:', data);
      if (data && data.manualRequests && data.invitedRequests) {
        setManualRequestsSecurity(data.manualRequests);
        setInvitedRequestsSecurity(data.invitedRequests);
      } else {
        console.error('[Socket Debug] Invalid visitor log data received:', data);
      }
    });

    // Listen for individual visitor status updates
    socket.on('visitor_status_update', (data) => {
      console.log('[Socket Debug] Visitor status update:', data);
      if (data && data.visitId && data.status) {
        setManualRequestsSecurity(prev =>
          prev.map(req =>
            req.id === data.visitId ? { ...req, status: data.status } : req
          )
        );
        setInvitedRequestsSecurity(prev =>
          prev.map(req =>
            req.id === data.visitId ? { ...req, status: data.status } : req
          )
        );
      } else {
        console.error('[Socket Debug] Invalid visitor status update data:', data);
      }
    });

    // Listen for new manual visitor
    socket.on('new_manual_visitor', (data) => {
      console.log('[Socket Debug] New manual visitor:', data);
      if (data && data.guest && data.visit) {
        setManualRequestsSecurity(prev => [{
          id: data.visit.id,
          name: data.guest.name,
          phone: data.guest.phone,
          status: data.visit.status,
          created_at: data.visit.created_at
        }, ...prev]);
      } else {
        console.error('[Socket Debug] Invalid new manual visitor data:', data);
      }
    });

    return () => {
      console.log('[Socket Debug] Security user disconnecting');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  // Notification permission and real-time notification logic
  useEffect(() => {
    // Always run for all user roles
    const setupNotifications = async () => {
      try {
        console.log('[FCM Debug] Requesting notification permission...');
        const permission = await Notification.requestPermission();
        console.log('[FCM Debug] Notification permission:', permission);
        
        if (permission === 'granted') {
          const token = await requestNotificationPermission();
          console.log('[FCM Debug] Got FCM token:', token);
          setFcmToken(token);
          
          // Register FCM token with backend
          console.log('[FCM Debug] Registering FCM token with backend...');
          await axios.post('/api/fcm/register', { token }, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          console.log('[FCM Debug] FCM token registered successfully');
        } else {
          console.log('[FCM Debug] Notification permission denied');
        }
      } catch (error) {
        console.error('[FCM Debug] Error setting up notifications:', {
          error: error.message,
          response: error.response?.data,
          stack: error.stack
        });
      }
    };

    setupNotifications();

    // Handle foreground messages for all roles
    const messageListener = onMessageListener().then(payload => {
      console.log('[FCM Debug] Received foreground message:', payload);
      // Show browser notification for all roles
      if (window.Notification && Notification.permission === 'granted') {
        new Notification(payload.notification.title, {
          body: payload.notification.body,
          icon: '/logo192.png',
          data: payload.data
        });
      }
      // Optionally: refresh data for security or resident
      if (user?.role === 'resident') {
        fetchManualPending();
      } else if (user?.role === 'security') {
        // Optionally refresh visitor log or other data for security
        // You can add a function here if needed
      }
    }).catch(error => {
      console.error('[FCM Debug] Error setting up message listener:', {
        error: error.message,
        stack: error.stack
      });
    });

    return () => {
      // No need to unregister FCM token here
    };
  }, [fcmToken, showNotification, user?.role, fetchManualPending]);

  // Connect to Socket.IO and listen for notifications
  useEffect(() => {
    if (!user || !user.id) return; // Wait until user is loaded

    // Clean up any existing socket connection
    if (socketRef.current) {
      console.log('[Notification Debug] Cleaning up existing socket connection');
      socketRef.current.disconnect();
    }

    const { io } = require('socket.io-client');
    const socket = io('http://localhost:3001', { transports: ['websocket'] });
    socketRef.current = socket;

    console.log('[Notification Debug] Registering socket with user id:', user.id);
    socket.emit('register', user.id);

    socket.on('notification', (notification) => {
      console.log('[Notification Debug] Received notification event:', notification);
      if (window.Notification) {
        console.log('[Notification Debug] Notification.permission:', Notification.permission);
      } else {
        console.log('[Notification Debug] window.Notification is not available');
      }
      // Show browser push notification if permitted
      if (window.Notification && Notification.permission === 'granted') {
        try {
          new Notification('GatedEntry', {
            body: notification.message,
            icon: '/favicon.ico',
          });
          console.log('[Notification Debug] Browser notification shown');
        } catch (e) {
          console.error('[Notification Debug] Error showing browser notification:', e);
        }
      } else {
        console.log('[Notification Debug] Notification not shown: permission not granted');
      }
      // Optionally: update in-app notifications (fetchNotifications)
      fetchNotifications();
    });

    return () => {
      console.log('[Notification Debug] User disconnecting');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  const fetchNotifications = async () => {
    try {
      const response = await axios.get('/api/notifications');
      setNotifications(response.data);
      console.log('[Notification Debug] Notifications:', response.data);
    } catch (err) {
      console.error('[Notification Debug] Error fetching notifications:', err);
      setError('Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  };

  const fetchGuests = async (loadMore = false) => {
    try {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      
      const offset = loadMore ? (page - 1) * ITEMS_PER_PAGE : 0;
      const response = await axios.get('/api/guests', {
        params: {
          limit: ITEMS_PER_PAGE,
          offset: offset
        }
      });
      
      console.log('[Debug] fetchGuests response:', response.data);
      const newGuests = response.data;
      setHasMore(newGuests.length === ITEMS_PER_PAGE);
      
      if (loadMore) {
        setGuests(prev => [...prev, ...newGuests]);
      } else {
        setGuests(newGuests);
      }
    } catch (err) {
      console.error('Failed to fetch guests:', err);
      setError('Failed to fetch guests');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    setPage(prev => prev + 1);
    fetchGuests(true);
  };

  const handleLogout = async () => {
    if (fcmToken) {
      try {
        console.log('[FCM Debug] Unregistering FCM token on logout...');
        await axios.post('/api/fcm/unregister', { token: fcmToken }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        console.log('[FCM Debug] FCM token unregistered successfully');
      } catch (error) {
        console.error('[FCM Debug] Error unregistering FCM token on logout:', error);
      }
    }
    logout();
    navigate('/login');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'checked_in':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const handleEditClick = (guest) => {
    setEditId(guest.id);
    setEditForm({
      name: guest.name,
      phone: guest.phone,
      purpose: guest.purpose || '',
      expected_arrival: guest.expected_arrival ? guest.expected_arrival.slice(0, 16) : ''
    });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditSave = async (guestId) => {
    try {
      await axios.put(`/api/guests/${guestId}`, editForm);
      setEditId(null);
      fetchGuests();
    } catch (err) {
      alert('Failed to update guest invite');
    }
  };

  const handleCancelInvite = async (guestId) => {
    if (!window.confirm('Are you sure you want to cancel this invite?')) return;
    try {
      await axios.delete(`/api/guests/${guestId}`);
      fetchGuests();
    } catch (err) {
      alert('Failed to cancel guest invite');
    }
  };

  const handleViewQR = (guest) => {
    setSelectedGuest(guest);
    setShowQRModal(true);
  };

  const closeQRModal = () => {
    setShowQRModal(false);
    setSelectedGuest(null);
  };

  const handleModalEditClick = () => {
    setModalEditMode(true);
    setModalEditForm({
      name: selectedGuest.name,
      phone: selectedGuest.phone,
      purpose: selectedGuest.purpose || '',
      expected_arrival: selectedGuest.expected_arrival ? selectedGuest.expected_arrival.slice(0, 16) : ''
    });
  };

  const handleModalEditChange = (e) => {
    const { name, value } = e.target;
    setModalEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleModalEditSave = async () => {
    try {
      await axios.put(`/api/guests/${selectedGuest.id}`, modalEditForm);
      setModalEditMode(false);
      fetchGuests();
      setSelectedGuest({ ...selectedGuest, ...modalEditForm });
    } catch (err) {
      alert('Failed to update guest invite');
    }
  };

  const handleModalCancelInvite = async () => {
    if (!window.confirm('Are you sure you want to cancel this invite?')) return;
    try {
      await axios.delete(`/api/guests/${selectedGuest.id}`);
      setShowQRModal(false);
      fetchGuests();
    } catch (err) {
      alert('Failed to cancel guest invite');
    }
  };

  const getShareLink = (guest) => `https://your-app-domain.com/guest-invite/${guest.qr_token}`;

  const handleShareInvite = async () => {
    if (!selectedGuest) return;
    const shareUrl = getShareLink(selectedGuest);
    const shareData = {
      title: 'Guest Invite',
      text: `Here is your invite for ${selectedGuest.name}`,
      url: shareUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled or error
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert('Invite link copied to clipboard!');
      } catch (err) {
        alert('Failed to copy invite link.');
      }
    }
  };

  const handleApproveManual = async (visitId) => {
    setProcessingRequestId(visitId);
    try {
      const response = await axios.post(`/api/guests/${visitId}/approve-manual`);
      if (response.data && response.data.message) {
      setPendingManualRequests((prev) => prev.filter((req) => req.visit.id !== visitId));
      } else {
        alert('Unexpected response from server.');
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        if (err.response.data.error === 'Internal server error') {
          alert('The server encountered an error, but the visitor may have been approved. Please check the visitor log to confirm.');
        } else {
          alert('Failed to approve visitor: ' + err.response.data.error);
        }
      } else {
        alert('Failed to approve visitor. Please try again or check the visitor log.');
      }
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectManual = async (visitId) => {
    setProcessingRequestId(visitId);
    try {
      await axios.post(`/api/guests/${visitId}/reject-manual`);
      setPendingManualRequests((prev) => prev.filter((req) => req.visit.id !== visitId));
    } catch (err) {
      alert('Failed to reject visitor');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleManualFormChange = (e) => {
    const { name, value } = e.target;
    setManualForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleManualFormSubmit = async (e) => {
    e.preventDefault();
    setManualLoading(true);
    setManualError('');
    setManualSuccess('');
    try {
      const response = await axios.post('/api/guests/manual', manualForm);
      console.log('[Debug] Manual visitor response:', response.data);
      
      // Emit socket event for real-time update
      if (socketRef.current) {
        socketRef.current.emit('new_manual_visitor', response.data);
      }
      
      setManualSuccess('Visitor sign-in request sent to resident for approval.');
      setManualForm({ name: '', phone: '', flat_id: '' });
    } catch (err) {
      console.error('[Debug] Error creating manual visitor:', err);
      setManualError(err.response?.data?.error || 'Failed to submit visitor sign-in');
    } finally {
      setManualLoading(false);
    }
  };

  const fetchUsers = async () => {
    setUserLoading(true);
    setUserError('');
    try {
      const params = {};
      if (userRoleFilter) params.role = userRoleFilter;
      if (userSearch) params.search = userSearch;
      const res = await axios.get('/api/admin/users', { params });
      setUsers(res.data);
    } catch (err) {
      setUserError('Failed to fetch users');
    } finally {
      setUserLoading(false);
    }
  };

  const handleEditUser = (user) => {
    setEditUserId(user.id);
    setEditUserForm({ name: user.name, phone: user.phone, flat_number: user.flat_number || '' });
  };
  const handleEditUserChange = (e) => {
    setEditUserForm({ ...editUserForm, [e.target.name]: e.target.value });
  };
  const handleEditUserSave = async (id) => {
    try {
      await axios.put(`/api/admin/users/${id}`, editUserForm);
      setEditUserId(null);
      fetchUsers();
    } catch (err) {
      setUserError('Failed to update user');
    }
  };
  const handleDeleteUser = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      await axios.delete(`/api/admin/users/${id}`);
      fetchUsers();
    } catch (err) {
      setUserError('Failed to delete user');
    }
  };

  useEffect(() => {
    // Fetch flats for manual invite dropdown
    const fetchFlats = async () => {
      try {
        const res = await axios.get('/api/flats'); // Use public endpoint
        setFlats(res.data);
      } catch (err) {
        // ignore
      }
    };
    fetchFlats();
  }, []);

  const renderResidentContent = () => (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900">Quick Actions</h3>
        <div className="mt-4 grid grid-cols-1 gap-4">
          <button
            onClick={() => navigate('/invite-guest')}
            className="bg-white rounded-xl shadow-sm p-6 flex flex-col items-center justify-center space-y-2 hover:bg-gray-50 transition-colors"
          >
            <UserGroupIcon className="h-8 w-8 text-indigo-600" />
            <span className="text-sm font-medium text-gray-900">Invite Guest</span>
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Pending Visitor Requests</h3>
        {pendingManualRequests.length === 0 ? (
          <p className="text-sm text-gray-500">No pending manual visitor requests</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {pendingManualRequests.map((req, idx) => (
              <li key={idx} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-semibold">{req.guest.name}</span> ({req.guest.phone})
                </div>
                {req.visit.status === 'pending' && (
                  <div className="mt-2 sm:mt-0 flex gap-2">
                    <button
                      onClick={() => handleApproveManual(req.visit.id)}
                      disabled={processingRequestId === req.visit.id}
                      className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {processingRequestId === req.visit.id ? 'Approving...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleRejectManual(req.visit.id)}
                      disabled={processingRequestId === req.visit.id}
                      className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {processingRequestId === req.visit.id ? 'Rejecting...' : 'Reject'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Invited Guests</h3>
        {loading && !loadingMore ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
            <p className="mt-2 text-sm text-gray-500">Loading guests...</p>
          </div>
        ) : guests.length === 0 ? (
          <p className="text-sm text-gray-500">No guests invited yet</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Guest</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purpose</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Arrival</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {guests.map((guest) => (
                    <tr key={guest.id}>
                      {editId === guest.id ? (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              name="name"
                              value={editForm.name}
                              onChange={handleEditChange}
                              className="border px-2 py-1 rounded w-full"
                            />
                            <input
                              type="text"
                              name="phone"
                              value={editForm.phone}
                              onChange={handleEditChange}
                              className="border px-2 py-1 rounded w-full mt-1"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="text"
                              name="purpose"
                              value={editForm.purpose}
                              onChange={handleEditChange}
                              className="border px-2 py-1 rounded w-full"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="datetime-local"
                              name="expected_arrival"
                              value={editForm.expected_arrival}
                              onChange={handleEditChange}
                              className="border px-2 py-1 rounded w-full"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(guest.status)}`}>
                              {guest.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <button
                              onClick={() => handleEditSave(guest.id)}
                              className="text-green-600 hover:text-green-900 mr-2"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditId(null)}
                              className="text-gray-600 hover:text-gray-900"
                            >
                              Cancel
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{guest.name}</div>
                            <div className="text-sm text-gray-500">{guest.phone}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">{guest.purpose}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{formatDate(guest.expected_arrival)}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(guest.status)}`}>
                              {guest.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {guest.status === 'pending' && false && (
                              <>
                                <button
                                  onClick={() => handleEditClick(guest)}
                                  className="text-blue-600 hover:text-blue-900 mr-2"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleCancelInvite(guest.id)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {guest.qr_token && (
                              <button
                                onClick={() => handleViewQR(guest)}
                                className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200 ease-in-out shadow-sm"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                View Invite
                              </button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  {loadingMore ? (
                    <>
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent mr-2"></div>
                      Loading...
                    </>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  const renderSecurityContent = () => (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900">Security Actions</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            onClick={() => setShowManualSignIn(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Manual Visitor Sign-In
          </button>
          <button
            onClick={() => navigate('/scan-qr')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Scan QR Code
          </button>
          <button
            onClick={() => navigate('/visitor-log')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            View Visitor Log
          </button>
        </div>
      </div>

      {/* Manual Visitor Requests Table */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Manual Visitor Log</h3>
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}
        {manualRequestsSecurity.length === 0 ? (
          <p className="text-sm text-gray-500">No manual visitor requests</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flat</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested At</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {manualRequestsSecurity.map((req) => (
                <tr key={req.id}>
                  <td className="px-6 py-4 whitespace-nowrap">{req.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{req.phone}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{req.flat_number}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      req.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : req.status === 'checked_in'
                        ? 'bg-green-100 text-green-800'
                        : req.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {req.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{new Date(req.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Invited Visitor Log Table */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Invited Visitor Log</h3>
        {invitedRequestsSecurity.length === 0 ? (
          <p className="text-sm text-gray-500">No invited visitor records</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flat</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purpose</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Arrival</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested At</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invitedRequestsSecurity.map((req) => (
                <tr key={req.id}>
                  <td className="px-6 py-4 whitespace-nowrap">{req.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{req.phone}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{req.flat_number}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{req.purpose || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {req.expected_arrival ? new Date(req.expected_arrival).toLocaleString() : '-'}
                    </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      req.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : req.status === 'checked_in'
                        ? 'bg-green-100 text-green-800'
                        : req.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {req.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{new Date(req.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderAdminContent = () => (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900">Admin Actions</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            onClick={() => navigate('/admin/pending-users')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Pending Users
          </button>
          <button
            onClick={() => navigate('/admin/apartment-management')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Manage Blocks
          </button>
          <button
            onClick={() => navigate('/admin/security-guards')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
          >
            Security Guards
          </button>
          <button
            onClick={() => navigate('/visitor-log')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            View Visitor Log
          </button>
          <button
            onClick={() => setShowUserManagement((v) => { if (!v) fetchUsers(); return !v; })}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            User Management
          </button>
        </div>
        {showUserManagement && (
          <div className="mt-8">
            <h4 className="text-lg font-semibold mb-2">All Users</h4>
            <div className="flex gap-2 mb-2">
              <select value={userRoleFilter} onChange={e => { setUserRoleFilter(e.target.value); fetchUsers(); }} className="border p-1 rounded">
                <option value="">All Roles</option>
                <option value="admin">Admin</option>
                <option value="resident">Resident</option>
                <option value="security">Security</option>
              </select>
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search name or phone"
                className="border p-1 rounded"
              />
              <button onClick={fetchUsers} className="px-2 py-1 bg-indigo-600 text-white rounded">Search</button>
            </div>
            {userError && <div className="text-red-600 mb-2">{userError}</div>}
            {userLoading ? (
              <div>Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flat</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approved</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id}>
                        {editUserId === user.id ? (
                          <>
                            <td className="px-4 py-2"><input type="text" name="name" value={editUserForm.name} onChange={handleEditUserChange} className="border p-1 rounded w-full" /></td>
                            <td className="px-4 py-2"><input type="text" name="phone" value={editUserForm.phone} onChange={handleEditUserChange} className="border p-1 rounded w-full" /></td>
                            <td className="px-4 py-2">{user.role}</td>
                            <td className="px-4 py-2">{getFlatDisplay(user.flat_number, flats)}</td>
                            <td className="px-4 py-2">{user.is_approved ? 'Yes' : 'No'}</td>
                            <td className="px-4 py-2">
                              <button onClick={() => handleEditUserSave(user.id)} className="text-green-600 mr-2">Save</button>
                              <button onClick={() => setEditUserId(null)} className="text-gray-600">Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2">{user.name}</td>
                            <td className="px-4 py-2">{user.phone}</td>
                            <td className="px-4 py-2">{user.role}</td>
                            <td className="px-4 py-2">{getFlatDisplay(user.flat_number, flats)}</td>
                            <td className="px-4 py-2">{user.is_approved ? 'Yes' : 'No'}</td>
                            <td className="px-4 py-2">
                              <button onClick={() => handleEditUser(user)} className="text-blue-600 mr-2">Edit</button>
                              <button onClick={() => handleDeleteUser(user.id)} className="text-red-600">Delete</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderQRModal = () => {
    if (!selectedGuest) return null;
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg w-full max-w-md mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="text-lg font-medium text-gray-900">Guest Invitation</h3>
            <button
              onClick={closeQRModal}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            {/* QR Code */}
            <div className="bg-white p-4 rounded-lg shadow-sm flex justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${selectedGuest.qr_token}`}
                alt="QR Code"
                className="w-32 h-32 sm:w-40 sm:h-40"
              />
            </div>

            {/* Guest Details */}
            <div className="space-y-3">
              {modalEditMode ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name</label>
                    <input
                      type="text"
                      name="name"
                      value={modalEditForm.name}
                      onChange={handleModalEditChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                    <input
                      type="text"
                      name="phone"
                      value={modalEditForm.phone}
                      onChange={handleModalEditChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                    <input
                      type="text"
                      name="purpose"
                      value={modalEditForm.purpose}
                      onChange={handleModalEditChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expected Arrival</label>
                    <input
                      type="datetime-local"
                      name="expected_arrival"
                      value={modalEditForm.expected_arrival}
                      onChange={handleModalEditChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Guest Name</span>
                    <p className="text-sm text-gray-900 mt-1">{selectedGuest.name}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Phone Number</span>
                    <p className="text-sm text-gray-900 mt-1">{selectedGuest.phone}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Purpose</span>
                    <p className="text-sm text-gray-900 mt-1">{selectedGuest.purpose || 'Not specified'}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Expected Arrival</span>
                    <p className="text-sm text-gray-900 mt-1">{formatDate(selectedGuest.expected_arrival)}</p>
                  </div>
              <div>
                    <span className="text-sm font-medium text-gray-500">Status</span>
                    <p className="mt-1">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(selectedGuest.status)}`}>
                    {selectedGuest.status.replace('_', ' ')}
                  </span>
                </p>
              </div>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t bg-gray-50">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Primary Actions */}
              <div className="flex-1 flex flex-wrap gap-2">
            {selectedGuest.status === 'pending' && !modalEditMode && (
              <>
                <button
                  onClick={handleModalEditClick}
                      className="flex-1 min-w-[120px] px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors flex items-center justify-center"
                >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                  Edit
                </button>
                <button
                  onClick={handleModalCancelInvite}
                      className="flex-1 min-w-[120px] px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors flex items-center justify-center"
                >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                  Cancel Invite
                </button>
              </>
            )}
            {modalEditMode && (
              <>
                <button
                  onClick={handleModalEditSave}
                      className="flex-1 min-w-[120px] px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors flex items-center justify-center"
                >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save Changes
                </button>
                <button
                  onClick={() => setModalEditMode(false)}
                      className="flex-1 min-w-[120px] px-4 py-2.5 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors flex items-center justify-center"
                >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                  Cancel
                </button>
              </>
            )}
              </div>

              {/* Secondary Actions */}
              <div className="flex gap-2">
            <button
                  onClick={handleShareInvite}
                  className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors flex items-center justify-center"
            >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
            </button>
            <button
                  onClick={closeQRModal}
                  className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
                  Close
            </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Close popovers on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (bellRef.current && !bellRef.current.contains(event.target)) {
        setShowBellPopover(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfilePopover(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Notification Bell for Resident
  const NotificationBell = () => {
    return (
      <div className="relative ml-4" ref={bellRef}>
        <button
          className="relative focus:outline-none"
          onClick={() => {
            setShowBellPopover((v) => !v);
            setShowProfilePopover(false);
          }}
          aria-label="Show notifications"
        >
          <BellIcon className="h-7 w-7 text-indigo-600" />
          {notifications.some(n => !n.read) && (
            <span className="absolute top-0 right-0 block h-2 w-2 rounded-full ring-2 ring-white bg-red-500"></span>
          )}
        </button>
        {showBellPopover && (
          <div className="absolute right-0 mt-2 w-[420px] min-w-[320px] max-w-full bg-white rounded-xl shadow-lg z-50 p-6 space-y-4">
            <h4 className="font-semibold text-lg mb-2">Notifications</h4>
            {loading ? (
              <p className="text-gray-500 text-sm">Loading...</p>
            ) : notifications.length === 0 ? (
              <>
                <p className="text-gray-500 text-sm">No notifications</p>
                <pre className="text-xs text-gray-400 bg-gray-50 rounded p-2 mt-2">{JSON.stringify(notifications, null, 2)}</pre>
              </>
            ) : (
              <ul className="divide-y divide-gray-200 max-h-48 overflow-y-auto mb-4">
                {notifications.slice(0, 10).map((notification) => (
                  <li key={notification.id} className="py-2">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 h-2 w-2 rounded-full ${notification.read ? 'bg-gray-300' : 'bg-indigo-500'}`}></span>
                      <div>
                        <p className="text-gray-900 text-sm">{notification.message}</p>
                        <p className="text-xs text-gray-500">{new Date(notification.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <h4 className="font-semibold text-lg mb-2">Pending Requests</h4>
            {pendingManualRequests.length === 0 ? (
              <>
                <p className="text-gray-500 text-sm">No pending manual visitor requests</p>
                <pre className="text-xs text-gray-400 bg-gray-50 rounded p-2 mt-2">{JSON.stringify(pendingManualRequests, null, 2)}</pre>
              </>
            ) : (
              <ul className="divide-y divide-gray-200 max-h-32 overflow-y-auto">
                {pendingManualRequests.map((req, idx) => (
                  <li key={idx} className="py-2 flex flex-col gap-1">
                    <span className="font-semibold">{req.guest.name}</span> <span className="text-xs text-gray-500">({req.guest.phone})</span>
                    {req.visit.status === 'pending' && (
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => handleApproveManual(req.visit.id)}
                          disabled={processingRequestId === req.visit.id}
                          className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 text-xs"
                        >
                          {processingRequestId === req.visit.id ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleRejectManual(req.visit.id)}
                          disabled={processingRequestId === req.visit.id}
                          className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 text-xs"
                        >
                          {processingRequestId === req.visit.id ? 'Rejecting...' : 'Reject'}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  // User Profile Popover
  const UserProfile = () => (
    <div className="relative ml-4" ref={profileRef}>
      <button
        className="relative focus:outline-none"
        onClick={() => {
          setShowProfilePopover((v) => !v);
          setShowBellPopover(false);
        }}
        aria-label="Show user profile"
      >
        <UserCircleIcon className="h-8 w-8 text-indigo-600" />
      </button>
      {showProfilePopover && (
        <div className="absolute right-0 mt-2 w-[320px] min-w-[220px] max-w-full bg-white rounded-xl shadow-lg z-50 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <UserCircleIcon className="h-12 w-12 text-indigo-600" />
            <div>
              <div className="font-semibold text-lg break-words">{user?.name}</div>
              <div className="text-gray-500 text-sm">{user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)}</div>
              <div className="text-gray-400 text-xs">{user?.phone}</div>
            </div>
          </div>
          <button
            className="w-full py-2 bg-indigo-600 text-white rounded-lg font-semibold shadow hover:bg-indigo-700 transition"
            onClick={() => { setShowChangePasswordModal(true); setShowProfilePopover(false); }}
          >
            Change Password
          </button>
        </div>
      )}
    </div>
  );

  // Change Password Modal (UI only)
  const ChangePasswordModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
        <button
          onClick={() => setShowChangePasswordModal(false)}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
        >
          &times;
        </button>
        <h3 className="text-lg font-semibold mb-4">Change Password</h3>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); /* handle password change */ }}>
          <div>
            <label className="block text-sm font-medium text-gray-700">Current Password</label>
            <input
              type="password"
              name="current"
              value={passwordForm.current}
              onChange={e => setPasswordForm(f => ({ ...f, current: e.target.value }))}
              className="border p-2 rounded w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">New Password</label>
            <input
              type="password"
              name="new"
              value={passwordForm.new}
              onChange={e => setPasswordForm(f => ({ ...f, new: e.target.value }))}
              className="border p-2 rounded w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
            <input
              type="password"
              name="confirm"
              value={passwordForm.confirm}
              onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
              className="border p-2 rounded w-full"
              required
            />
          </div>
          {passwordError && <div className="text-red-600 text-sm">{passwordError}</div>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowChangePasswordModal(false)}
              className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Change Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Change the Manual Visitor Sign-In Modal to show confirmation and OK button after submit
  const ManualSignInModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
        <button
          onClick={() => { setShowManualSignIn(false); setManualSuccess(''); setManualError(''); }}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
        >
          &times;
        </button>
        <h3 className="text-lg font-semibold mb-4">Manual Visitor Sign-In</h3>
        {manualSuccess ? (
          <div className="flex flex-col items-center space-y-6">
            <div className="text-green-600 text-center text-base font-medium">Visitor sign-in request sent to resident for approval.<br/>Please wait for approval.</div>
            <button
              onClick={() => { setShowManualSignIn(false); setManualSuccess(''); setManualError(''); }}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold shadow hover:bg-indigo-700 transition"
            >
              OK
            </button>
          </div>
        ) : (
          <form onSubmit={handleManualFormSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Visitor Name</label>
              <input
                type="text"
                name="name"
                value={manualForm.name}
                onChange={handleManualFormChange}
                className="border p-2 rounded w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Visitor Phone</label>
              <input
                type="text"
                name="phone"
                value={manualForm.phone}
                onChange={handleManualFormChange}
                className="border p-2 rounded w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Flat</label>
              <select name="flat_id" value={manualForm.flat_id} onChange={handleManualFormChange} className="border p-2 rounded w-full" required>
                <option value="">Select Flat</option>
                {flats.map(flat => (
                  <option key={flat.id} value={flat.id}>{flat.unique_id || flat.number}</option>
                ))}
              </select>
            </div>
            {manualError && <div className="text-red-600">{manualError}</div>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowManualSignIn(false); setManualSuccess(''); setManualError(''); }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={manualLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {manualLoading ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  // Mobile Navigation Component
  const MobileNav = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden">
      <div className="flex justify-around items-center h-16">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center justify-center w-full h-full ${
            activeTab === 'home' ? 'text-indigo-600' : 'text-gray-500'
          }`}
        >
          <HomeIcon className="h-6 w-6" />
          <span className="text-xs mt-1">Home</span>
        </button>
        {user?.role === 'resident' && (
          <button
            onClick={() => navigate('/invite-guest')}
            className="flex flex-col items-center justify-center w-full h-full text-gray-500"
          >
            <UserGroupIcon className="h-6 w-6" />
            <span className="text-xs mt-1">Invite</span>
          </button>
        )}
        {user?.role === 'security' && (
          <button
            onClick={() => navigate('/scan-qr')}
            className="flex flex-col items-center justify-center w-full h-full text-gray-500"
          >
            <QrCodeIcon className="h-6 w-6" />
            <span className="text-xs mt-1">Scan</span>
          </button>
        )}
        <button
          onClick={() => navigate('/visitor-log')}
          className="flex flex-col items-center justify-center w-full h-full text-gray-500"
        >
          <ClipboardDocumentListIcon className="h-6 w-6" />
          <span className="text-xs mt-1">Logs</span>
        </button>
      </div>
    </div>
  );

  // Update the click outside handler
  useEffect(() => {
    function handleClickOutside(event) {
      const profileButton = document.getElementById('profile-button');
      const profilePopover = document.getElementById('profile-popover');
      
      if (profileButton && profilePopover) {
        const isClickInsideButton = profileButton.contains(event.target);
        const isClickInsidePopover = profilePopover.contains(event.target);
        
        if (!isClickInsideButton && !isClickInsidePopover) {
          setShowProfilePopover(false);
        }
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Helper to register socket
  const registerSocket = (socket, user) => {
    if (!user || !user.id || !user.role) {
      console.warn('[Socket Debug] Cannot register socket: missing user or role', user);
      return;
    }
    console.log('[Socket Debug] Registering socket with user id:', user.id, 'and role:', user.role);
    socket.emit('register', user.id, user.role);
  };

  // Single socket connection for all roles
  useEffect(() => {
    if (!user || !user.id || !user.role) return;

    console.log('[Socket Debug] Initializing socket connection for user:', user);

    // Clean up any existing socket connection
    if (socketRef.current) {
      console.log('[Socket Debug] Cleaning up existing socket connection');
      socketRef.current.disconnect();
    }

    const { io } = require('socket.io-client');
    const socket = io('http://localhost:3001', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on('connect', () => {
      console.log('[Socket Debug] Connected to server');
      socket.emit('register', { userId: user.id, role: user.role });
    });

    socket.on('disconnect', () => {
      console.log('[Socket Debug] Disconnected from server');
    });

    socket.on('error', (error) => {
      console.error('[Socket Debug] Socket error:', error);
    });

    // Common event handlers for all roles
    socket.on('visitor_log_update', (data) => {
      console.log('[Socket Debug] Received visitor log update:', data);
      if (user.role === 'security') {
        if (data && data.manualRequests && data.invitedRequests) {
          setManualRequestsSecurity(data.manualRequests);
          setInvitedRequestsSecurity(data.invitedRequests);
        } else {
          console.error('[Socket Debug] Invalid visitor log data received:', data);
        }
      }
    });

    // Role-specific event handlers
    if (user.role === 'resident') {
      socket.on('new_manual_visitor', (data) => {
        console.log('[Socket Debug] New manual visitor:', data);
        if (data && data.guest && data.visit) {
          setPendingManualRequests(prev => [data, ...prev]);
          showNotification('New Visitor Request', {
            body: `${data.guest.name} is requesting to visit you.`,
            icon: '/path/to/icon.png'
          });
        } else {
          console.error('[Socket Debug] Invalid new manual visitor data:', data);
        }
      });

      socket.on('visitor_status_update', (data) => {
        console.log('[Socket Debug] Visitor status update:', data);
        if (data && data.visitId && data.status) {
          // Update pending requests
          setPendingManualRequests(prev => 
            prev.map(req => 
              req.visit.id === data.visitId 
                ? { ...req, visit: { ...req.visit, status: data.status } }
                : req
            )
          );
          // Update guests list
          setGuests(prev =>
            prev.map(guest =>
              guest.id === data.visitId
                ? { ...guest, status: data.status }
                : guest
            )
          );
        } else {
          console.error('[Socket Debug] Invalid visitor status update data:', data);
        }
      });
    }

    if (user.role === 'security') {
      socket.on('visitor_status_update', (data) => {
        console.log('[Socket Debug] Visitor status update:', data);
        if (data && data.visitId && data.status) {
          // Update manual requests
          setManualRequestsSecurity(prev =>
            prev.map(req =>
              req.id === data.visitId ? { ...req, status: data.status } : req
            )
          );
          // Update invited requests
          setInvitedRequestsSecurity(prev =>
            prev.map(req =>
              req.id === data.visitId ? { ...req, status: data.status } : req
            )
          );
        } else {
          console.error('[Socket Debug] Invalid visitor status update data:', data);
        }
      });

      socket.on('new_manual_visitor', (data) => {
        console.log('[Socket Debug] New manual visitor:', data);
        if (data && data.guest && data.visit) {
          setManualRequestsSecurity(prev => [{
            id: data.visit.id,
            name: data.guest.name,
            phone: data.guest.phone,
            status: data.visit.status,
            created_at: data.visit.created_at,
            flat_number: data.visit.flat_number
          }, ...prev]);
        } else {
          console.error('[Socket Debug] Invalid new manual visitor data:', data);
        }
      });
    }

    if (user.role === 'admin') {
      socket.on('refresh_pending_users', () => {
        console.log('[Socket Debug] Received refresh_pending_users event');
        fetchPendingUsers();
      });
    }

    // Clean up on unmount
    return () => {
      console.log('[Socket Debug] Cleaning up socket connection');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  // Admin features grid
  const renderAdminFeaturesGrid = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8">
      <div className="bg-white rounded-lg shadow p-6 flex flex-col items-start">
        <h3 className="text-lg font-semibold mb-2">Apartment Management</h3>
        <p className="text-gray-500 mb-4">Create, edit, or remove blocks and flats</p>
        <button
          onClick={() => navigate('/admin/apartment-management')}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Apartment Management
        </button>
      </div>
      <div className="bg-white rounded-lg shadow p-6 flex flex-col items-start">
        <h3 className="text-lg font-semibold mb-2">Security Guards</h3>
        <p className="text-gray-500 mb-4">Manage security guard accounts</p>
        <button
          onClick={() => navigate('/admin/security-guards')}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
        >
          Security Guards
        </button>
      </div>
      <div className="bg-white rounded-lg shadow p-6 flex flex-col items-start">
        <h3 className="text-lg font-semibold mb-2">Pending Users</h3>
        <p className="text-gray-500 mb-4">Approve or reject new user registrations</p>
        <button
          onClick={() => navigate('/admin/pending-users')}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          Pending Users
        </button>
      </div>
      <div className="bg-white rounded-lg shadow p-6 flex flex-col items-start">
        <h3 className="text-lg font-semibold mb-2">Visitor Log</h3>
        <p className="text-gray-500 mb-4">View all visitor entries</p>
        <button
          onClick={() => navigate('/visitor-log')}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Visitor Log
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Admin Features Grid */}
        {(user?.role === 'admin' || user?.role === 'super_admin') && renderAdminFeaturesGrid()}
        {/* Welcome Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome, {user?.name}!</h2>
          <p className="text-gray-600">Here's what's happening today</p>
        </div>

        {/* Role-specific Content */}
        <div className="space-y-6">
          {user?.role === 'resident' && (
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => navigate('/invite-guest')}
                  className="bg-white rounded-xl shadow-sm p-6 flex flex-col items-center justify-center space-y-2 hover:bg-gray-50 transition-colors"
                >
                  <UserGroupIcon className="h-8 w-8 text-indigo-600" />
                  <span className="text-sm font-medium text-gray-900">Invite Guest</span>
                </button>
              </div>

              {/* Pending Requests - Always show for residents */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Pending Requests</h3>
                <div className="space-y-4">
                  {pendingManualRequests.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-gray-500">No pending visitor requests</p>
                      <p className="text-sm text-gray-400 mt-1">You'll see visitor requests here when security signs them in</p>
                    </div>
                  ) : (
                    pendingManualRequests.map((req, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex justify-between items-start">
          <div>
                            <p className="font-medium text-gray-900">{req.guest.name}</p>
                            <p className="text-sm text-gray-500">{req.guest.phone}</p>
          </div>
                          {req.visit.status === 'pending' && (
                            <div className="flex space-x-2">
            <button
                                onClick={() => handleApproveManual(req.visit.id)}
                                disabled={processingRequestId === req.visit.id}
                                className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 text-xs"
                              >
                                {processingRequestId === req.visit.id ? 'Approving...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleRejectManual(req.visit.id)}
                                disabled={processingRequestId === req.visit.id}
                                className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 text-xs"
                              >
                                {processingRequestId === req.visit.id ? 'Rejecting...' : 'Reject'}
            </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
          </div>
        </div>

              {/* Recent Guests */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Guests</h3>
            {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
                  </div>
                ) : guests.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No recent guests</p>
                ) : (
                  <div className="space-y-4">
                    {guests.slice(0, 5).map((guest) => (
                      <div key={guest.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">{guest.name}</p>
                            <p className="text-sm text-gray-500">{guest.phone}</p>
                            <p className="text-sm text-gray-500 mt-1">{guest.purpose}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              guest.status === 'checked_in' ? 'bg-green-100 text-green-800' :
                              guest.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {guest.status.replace('_', ' ')}
                            </span>
                            {guest.qr_token && (
                              <button
                                onClick={() => handleViewQR(guest)}
                                className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200 ease-in-out shadow-sm"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                View Invite
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {guests.length > 5 && (
                      <button
                        onClick={() => navigate('/guests')}
                        className="w-full py-2 text-sm text-indigo-600 hover:text-indigo-700"
                      >
                        View all guests
                      </button>
            )}
          </div>
        )}
              </div>
          </div>
        )}

        {user?.role === 'security' && (
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => navigate('/scan-qr')}
                  className="bg-white rounded-xl shadow-sm p-6 flex flex-col items-center justify-center space-y-2 hover:bg-gray-50 transition-colors"
                >
                  <QrCodeIcon className="h-8 w-8 text-indigo-600" />
                  <span className="text-sm font-medium text-gray-900">Scan QR</span>
                </button>
                <button
                  onClick={() => setShowManualSignIn(true)}
                  className="bg-white rounded-xl shadow-sm p-6 flex flex-col items-center justify-center space-y-2 hover:bg-gray-50 transition-colors"
                >
                  <ClipboardDocumentListIcon className="h-8 w-8 text-indigo-600" />
                  <span className="text-sm font-medium text-gray-900">Manual Sign-in</span>
                </button>
          </div>

              {/* Recent Visitors */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Visitors</h3>
                <div className="space-y-4">
                  {manualRequestsSecurity.slice(0, 5).map((req) => (
                    <div key={req.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">{req.name}</p>
                          <p className="text-sm text-gray-500">{req.phone}</p>
                          <p className="text-sm text-gray-500 mt-1">Flat {getFlatDisplay(req.flat_number, flats)}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          req.status === 'checked_in' ? 'bg-green-100 text-green-800' :
                          req.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {req.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                  {manualRequestsSecurity.length > 5 && (
                    <button
                      onClick={() => navigate('/visitor-log')}
                      className="w-full py-2 text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      View all visitors
                    </button>
                  )}
                </div>
              </div>
          </div>
        )}
      </div>
      </main>

      {/* Modals */}
      {showQRModal && renderQRModal()}
      {showManualSignIn && <ManualSignInModal />}
      {showChangePasswordModal && <ChangePasswordModal />}
    </div>
  );
}

export default Dashboard; 