import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'fs'

function getFrontendVersion() {
  try {
    const content = readFileSync('../VERSION', 'utf8');
    const match = content.match(/^frontend=(.+)$/m);
    return match ? match[1].trim() : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(getFrontendVersion()),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
