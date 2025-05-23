import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001'; // Change if your backend runs elsewhere

function useResidentSocket(userId, userRole, onNewManualVisitor) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!userId || !userRole) return;

    const socket = io(SOCKET_URL, { transports: ['websocket'] });

    socket.emit('register', userId, userRole);

    socket.on('new_manual_visitor', (data) => {
      if (onNewManualVisitor) onNewManualVisitor(data);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [userId, userRole, onNewManualVisitor]);

  return socketRef.current;
}

export default useResidentSocket; 