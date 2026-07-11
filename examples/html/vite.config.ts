import { defineConfig } from 'vite'
import { sigilSrcAliases } from '../vite.alias.js'

export default defineConfig({
  resolve: {
    alias: sigilSrcAliases(),
  },
})
