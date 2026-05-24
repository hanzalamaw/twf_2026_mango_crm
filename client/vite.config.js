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
    server: {
      proxy: {
        '/api': {
          target: originFromApiUrl(env.VITE_API_URL),
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: originFromApiUrl(env.VITE_API_URL),
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
  }
})
