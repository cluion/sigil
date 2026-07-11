<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { createEditor, type SigilEditor } from '@cluion/sigil'
import { basicBlocks, blockSection, blockText, blockShortcode } from '@cluion/sigil-blocks'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import type { SigilDoc } from '@cluion/sigil-core'
import { defineShortcode } from '@cluion/sigil-shortcode'

const mountEl = ref<HTMLElement | null>(null)
const status = ref('')
const editor = shallowRef<SigilEditor | null>(null)
const store = new JsonProjectStore()

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

function mountEditor(doc: SigilDoc): void {
  if (!mountEl.value) return
  editor.value?.destroy()
  editor.value = createEditor({
    mount: mountEl.value,
    doc,
    store,
    blocks,
    shortcodes: [greet],
  })
}

function save(): void {
  if (!editor.value) return
  localStorage.setItem('sigil-ex-vue', store.exportJSON(editor.value.toJSON()))
  status.value = '已存'
}

function load(): void {
  const raw = localStorage.getItem('sigil-ex-vue')
  if (!raw) {
    status.value = '無資料'
    return
  }
  mountEditor(store.importJSON(raw))
  status.value = '已讀'
}

onMounted(() => mountEditor(initialDoc()))
onBeforeUnmount(() => {
  editor.value?.destroy()
  editor.value = null
})
</script>

<template>
  <div style="font-family: system-ui, sans-serif; margin: 16px">
    <h1>Sigil · Vue 3</h1>
    <p>
      在 <code>onMounted</code> 掛載；在 <code>onBeforeUnmount</code> 呼叫
      <code>destroy</code>
    </p>
    <div style="margin-bottom: 8px">
      <button type="button" @click="save">存 JSON</button>
      <button type="button" @click="load">讀 JSON</button>
      <span>{{ status }}</span>
    </div>
    <div ref="mountEl" />
  </div>
</template>
