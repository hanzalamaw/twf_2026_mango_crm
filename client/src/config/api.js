/**
 * API root from `VITE_API_URL`.
 * If a host-only URL is provided (e.g. `http://localhost:5000`), append `/api`.
 * Paths in code are appended without an extra `/api` segment (e.g. `${API_BASE}/login`).
 *
 * Production Socket.IO: set `VITE_API_URL` to the full API origin (e.g. `https://api.example.com/api`)
 * or set `VITE_SOCKET_URL` to the API host (e.g. `https://api.example.com`).
 * If both are relative (`/api`), Socket.IO uses path `/api/socket.io` (same proxy as REST).
 */
const raw = import.meta.env.VITE_API_URL;
const normalized = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';

let apiBase = normalized;
if (!apiBase) {
  apiBase = '/api';
} else if (!/\/api$/i.test(apiBase)) {
  apiBase = `${apiBase}/api`;
}

export const API_BASE = apiBase;

/** Must match server SOCKET_IO_PATH (default /api/socket.io for same-host /api reverse proxy). */
export const SOCKET_IO_PATH =
  (typeof import.meta.env.VITE_SOCKET_PATH === 'string' && import.meta.env.VITE_SOCKET_PATH.trim()) ||
  '/api/socket.io';

/** Socket.IO server origin (no path). Used by operationsSocket.js. */
export function getSocketBaseUrl() {
  const socketOverride = import.meta.env.VITE_SOCKET_URL;
  if (typeof socketOverride === 'string' && socketOverride.trim()) {
    return socketOverride.trim().replace(/\/+$/, '');
  }

  const apiUrl = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
  if (/^https?:\/\//i.test(apiUrl)) {
    try {
      const parsed = new URL(apiUrl);
      parsed.pathname = parsed.pathname.replace(/\/api\/?$/i, '') || '/';
      parsed.search = '';
      parsed.hash = '';
      const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
      return `${parsed.origin}${path}`;
    } catch {
      return apiUrl.replace(/\/api\/?$/i, '');
    }
  }

  // Same-origin: requires reverse proxy for /socket.io (see vite.config.js dev proxy).
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}
