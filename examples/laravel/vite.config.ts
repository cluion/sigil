import { defineConfig } from 'vite'
import { sigilSrcAliases } from '../vite.alias.js'
import { sigilVersionDefines } from '../../scripts/sigil-version-defines.mjs'

export default defineConfig({
  define: sigilVersionDefines(),
  resolve: { alias: sigilSrcAliases() },
  base: '/build/',
  publicDir: false,
  build: {
    outDir: 'public/build',
    manifest: 'manifest.json',
    rollupOptions: { input: 'resources/js/sigil-editor.ts' },
  },
})
