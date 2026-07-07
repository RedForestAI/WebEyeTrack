import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-worker',
      buildStart() {
        const workerSrc = resolve(__dirname, '../../dist/webeyetrack.worker.js')
        const workerDest = resolve(__dirname, 'public/webeyetrack.worker.js')
        try {
          copyFileSync(workerSrc, workerDest)
          console.log('✅ Copied webeyetrack.worker.js to public/')
        } catch (err) {
          console.warn('⚠️  Could not copy worker file:', err)
        }
      }
    }
  ],
  optimizeDeps: {
    exclude: ['webeyetrack']
  }
})
