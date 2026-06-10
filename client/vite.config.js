import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function originFromApiUrl(apiUrl) {
  if (!apiUrl || typeof apiUrl !== 'string') return 'http://localhost:5000'
  try {
    return new URL(apiUrl.replace(/\/+$/, '')).origin
  } catch {
    return 'http://localhost:5000'
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) return 'pdf';
            if (id.includes('html5-qrcode')) return 'qr-scanner';
            if (id.includes('/qrcode/') || id.includes('node_modules/qrcode')) return 'qrcode-gen';
            if (id.includes('xlsx')) return 'xlsx';
            if (id.includes('recharts')) return 'recharts';
            if (id.includes('socket.io')) return 'socket';
          },
        },
      },
    },
    server: {
      proxy: {
        // Includes /api/socket.io (Socket.IO path) — see server/index.js SOCKET_IO_PATH
        '/api': {
          target: originFromApiUrl(env.VITE_API_URL),
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
  }
})
