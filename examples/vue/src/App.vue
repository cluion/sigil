<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { createApp, type SigilApp } from '@cluion/sigil-app'
import { basicBlocks, blockSection, blockText, blockShortcode } from '@cluion/sigil-blocks'
import { JsonProjectStore, MemoryAssetStore } from '@cluion/sigil-store-json'
import type { SigilDoc } from '@cluion/sigil-core'
import { defineShortcode } from '@cluion/sigil-shortcode'

const mountEl = ref<HTMLElement | null>(null)
const status = ref('')
const app = shallowRef<SigilApp | null>(null)
const store = new JsonProjectStore()
const assets = new MemoryAssetStore([
  { id: 'v1', url: 'https://placehold.co/160x100/png?text=Vue', name: 'Vue' },
])

const greet = defineShortcode({
  name: 'greet',
  label: '問候',
  props: { name: 'Vue' },
  schema: [{ name: 'name', type: 'text', label: '名字' }],
  template: '<span>Hello, <b data-ref="n"></b>!</span>',
  bind(el, ctx) {
    const n = el.querySelector('[data-ref="n"]') as HTMLElement
    ctx.effect(() => {
      n.textContent = String(ctx.props.name)
    })
  },
})

const blocks = {
  ...basicBlocks,
  問候: () => blockShortcode('greet', { name: 'Vue' }),
}

function initialDoc(): SigilDoc {
  const section = blockSection()
  section.children = [blockText('Vue embed'), blockShortcode('greet', { name: 'Vue' })]
  return { version: 1, root: section }
}

function mount(doc: SigilDoc): void {
  if (!mountEl.value) return
  app.value?.destroy()
  app.value = createApp({
    mount: mountEl.value,
    doc,
    store,
    assets,
    blocks,
    shortcodes: [greet],
  })
}

function save(): void {
  if (!app.value) return
  localStorage.setItem('sigil-ex-vue', store.exportJSON(app.value.toJSON()))
  status.value = '已存'
}

function load(): void {
  const raw = localStorage.getItem('sigil-ex-vue')
  if (!raw) {
    status.value = '無資料'
    return
  }
  mount(store.importJSON(raw))
  status.value = '已讀'
}

onMounted(() => mount(initialDoc()))
onBeforeUnmount(() => {
  app.value?.destroy()
  app.value = null
})
</script>

<template>
  <div style="font-family: system-ui, sans-serif; height: 100%; display: flex; flex-direction: column; margin: 0; padding: 12px; box-sizing: border-box">
    <h1 style="margin: 0 0 8px; font-size: 18px">Sigil · Vue 3 · createApp</h1>
    <div style="margin-bottom: 8px">
      <button type="button" @click="save">存 JSON</button>
      <button type="button" @click="load">讀 JSON</button>
      <span>{{ status }}</span>
    </div>
    <div ref="mountEl" style="flex: 1; min-height: 0" />
  </div>
</template>
