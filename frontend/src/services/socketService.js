import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(userId, userRole) {
    if (this.socket?.connected) {
      console.log('[Socket Debug] Socket already connected');
      return;
    }

    console.log('[Socket Debug] Connecting socket for user:', userId, 'with role:', userRole);
    this.socket = io('http://localhost:3001', { 
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('[Socket Debug] Socket connected');
      this.socket.emit('register', userId, userRole);
    });

    this.socket.on('disconnect', () => {
      console.log('[Socket Debug] Socket disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('[Socket Debug] Socket error:', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      console.log('[Socket Debug] Disconnecting socket');
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
    }
  }

  on(event, callback) {
    if (!this.socket) {
      console.warn('[Socket Debug] Socket not connected, cannot add listener');
      return;
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    this.socket.on(event, callback);
  }

  off(event, callback) {
    if (!this.socket) return;

    if (callback) {
      this.socket.off(event, callback);
      this.listeners.get(event)?.delete(callback);
    } else {
      this.socket.off(event);
      this.listeners.delete(event);
    }
  }

  emit(event, data) {
    if (!this.socket?.connected) {
      console.warn('[Socket Debug] Socket not connected, cannot emit event');
      return;
    }
    this.socket.emit(event, data);
  }
}

// Create a singleton instance
const socketService = new SocketService();
export default socketService; 