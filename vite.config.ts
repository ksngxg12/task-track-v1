import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/task-track-v1/',
  plugins: [react()]
})
