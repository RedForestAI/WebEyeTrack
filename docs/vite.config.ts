import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from "path"

const repo = process.env.GITHUB_REPOSITORY?.split("/")?.[1];
const isUserPage = repo?.endsWith(".github.io");
const base = isUserPage ? "/" : `/${repo ?? "WebEyeTrack"}/`;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    // webeyetrack resolves to a symlinked local package (file:../js). Without
    // this, Vite/Rollup follow the symlink to its real path (js/dist/...),
    // which falls outside any "node_modules" segment, so the CJS->ESM
    // interop that normally applies to node_modules packages gets skipped.
    preserveSymlinks: true,
  },
  optimizeDeps: {
    // Also needed for dev: pre-bundle webeyetrack's UMD build into real ESM
    // named exports instead of importing the raw bundle as-is.
    include: ['webeyetrack'],
  },
})
