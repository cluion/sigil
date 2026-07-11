import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { sigilSrcAliases } from '../vite.alias.js'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: sigilSrcAliases(),
  },
})
