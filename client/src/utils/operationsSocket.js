import { io } from 'socket.io-client';
import { API_BASE } from '../config/api';

let socket;

function getSocketBaseUrl() {
  const base = String(API_BASE || '').trim();
  if (/^https?:\/\//i.test(base)) {
    return base.replace(/\/api\/?$/i, '');
  }
  // Vite dev: API_BASE is "/api" — connect via dev server (socket.io proxied in vite.config.js)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

export function getOperationsSocket() {
  if (!socket) {
    socket = io(getSocketBaseUrl(), {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
      autoConnect: true,
    });
  }
  return socket;
}

export function closeOperationsSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
