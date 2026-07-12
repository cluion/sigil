import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sigilSrcAliases } from '../vite.alias.js'
import { sigilVersionDefines } from '../../scripts/sigil-version-defines.mjs'

export default defineConfig({
  plugins: [react()],
  define: sigilVersionDefines(),
  resolve: {
    alias: sigilSrcAliases(),
  },
})
