import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: Frontend auf :5173, API-Aufrufe werden an das FastAPI-Backend (:8000) weitergereicht
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8000' } },
  // feste Dateinamen, damit ein neuer Build die alten Dateien überschreibt
  build: { rollupOptions: { output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name][extname]' } } },
})
