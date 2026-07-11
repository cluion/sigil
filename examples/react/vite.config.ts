import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sigilSrcAliases } from '../vite.alias.js'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: sigilSrcAliases(),
  },
})
