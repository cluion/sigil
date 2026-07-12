import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { sigilSrcAliases } from '../vite.alias.js'
import { sigilVersionDefines } from '../../scripts/sigil-version-defines.mjs'

export default defineConfig({
  plugins: [vue()],
  define: sigilVersionDefines(),
  resolve: {
    alias: sigilSrcAliases(),
  },
})
