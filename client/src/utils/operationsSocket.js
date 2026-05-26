import { io } from 'socket.io-client';
import { getSocketBaseUrl } from '../config/api';

let socket;

function logSocketIssue(label, detail) {
  if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_SOCKETS === 'true') {
    console.warn(`[operations-socket] ${label}`, detail ?? '');
  }
}

// Singleton Socket.IO client — server config: server/index.js; dev proxy: vite.config.js (/socket.io).
export function getOperationsSocket() {
  if (!socket) {
    const url = getSocketBaseUrl();
    if (!url) {
      logSocketIssue('No socket URL — set VITE_API_URL or VITE_SOCKET_URL for production');
      return { on: () => {}, off: () => {}, disconnect: () => {} };
    }

    socket = io(url, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      autoConnect: true,
    });

    socket.on('connect', () => {
      logSocketIssue('connected', { id: socket.id, url });
    });
    let lastConnectErrorLog = 0;
    socket.on('connect_error', (err) => {
      const now = Date.now();
      if (now - lastConnectErrorLog > 8000) {
        lastConnectErrorLog = now;
        console.warn(
          '[operations-socket] connect_error:',
          err?.message || err,
          `(target: ${url})`
        );
      }
      logSocketIssue('connect_error', { message: err?.message, url });
    });
    socket.on('disconnect', (reason) => {
      logSocketIssue('disconnect', reason);
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
