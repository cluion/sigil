import { defineConfig } from 'vite'
import { sigilSrcAliases } from '../vite.alias.js'
import { sigilVersionDefines } from '../../scripts/sigil-version-defines.mjs'

export default defineConfig({
  define: sigilVersionDefines(),
  resolve: {
    alias: sigilSrcAliases(),
  },
})
