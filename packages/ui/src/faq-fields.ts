import {
  findNode,
  findParent,
  type ComponentNode,
  type Engine,
  type I18n,
} from '@cluion/sigil-core'
import { uiText } from './i18n.js'

export interface FAQEditingOptions {
  createItem: (item: { question: string; answer: string }) => ComponentNode
  revealSelection?: () => void
}

function isGroup(node: ComponentNode | null): boolean {
  return (
    !!node &&
    !node.shortcode &&
    node.type === 'section' &&
    node.attributes?.['data-faq-accordion'] === 'true'
  )
}

function parts(node: ComponentNode | null) {
  if (node?.type !== 'section' || node.tagName !== 'details' || node.shortcode) return
  const [question, answer] = node.children ?? []
  if (
    question?.tagName === 'summary' &&
    question.type === 'text' &&
    !question.shortcode &&
    !question.children?.length &&
    answer?.tagName === 'p' &&
    answer.type === 'text' &&
    !answer.shortcode &&
    !answer.children?.length
  )
    return { question, answer }
}

export function createFAQFields(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  options?: FAQEditingOptions,
  i18n?: I18n,
) {
  const group = isGroup(node)
  const pair = parts(node)
  if (!group && !pair) return
  const owner = () =>
    engine.getSelection() === node.id ? findNode(engine.getTree(), node.id) : null
  const box = document.createElement('div')
  box.className = 'sigil-faq-fields'
  container.appendChild(box)
  const listeners = new AbortController()
  const { signal } = listeners
  function button(run: () => void): HTMLButtonElement {
    const result = document.createElement('button')
    result.type = 'button'
    result.className = 'sigil-btn sigil-btn--ghost'
    result.addEventListener('click', run, { signal })
    return result
  }
  function selectItem(id: string): void {
    engine.select(id)
    options?.revealSelection?.()
    container
      .querySelector<HTMLElement>('[data-faq-field="question"]')
      ?.focus({ preventScroll: true })
  }
  let sync: () => void
  const watched = new Set<string>()
  if (group) {
    const list = document.createElement('div')
    list.className = 'sigil-faq-questions'
    const add = button(() => {
      const current = owner()
      if (!options || !isGroup(current) || current?.locked) return
      const item = options.createItem({
        question: uiText(i18n, 'faq.new_question', '新的問題'),
        answer: uiText(i18n, 'faq.new_answer', '請填寫答案。'),
      })
      engine.insert(node.id, item)
      selectItem(item.id)
      container.querySelector<HTMLInputElement>('[data-faq-field="question"]')?.select()
    })
    box.append(list)
    if (options) box.append(add)
    list.addEventListener(
      'click',
      (event) => {
        if (!(event.target instanceof Element)) return
        const id = event.target.closest<HTMLButtonElement>('button[data-faq-item]')?.dataset.faqItem
        const item = id && owner()?.children?.find((child) => child.id === id)
        if (item && parts(item)) selectItem(item.id)
      },
      { signal },
    )
    sync = () => {
      const current = owner()
      add.textContent = uiText(i18n, 'faq.add', '新增問答')
      add.disabled = !isGroup(current) || !!current?.locked
      const active = document.activeElement
      const focusedId =
        active instanceof HTMLElement && list.contains(active) ? active.dataset.faqItem : undefined
      watched.clear()
      const rows: HTMLButtonElement[] = []
      for (const item of current?.children ?? []) {
        const fields = parts(item)
        if (!fields) continue
        watched.add(fields.question.id)
        const row = document.createElement('button')
        row.type = 'button'
        row.className = 'sigil-btn sigil-btn--ghost'
        row.dataset.faqItem = item.id
        row.textContent = fields.question.content?.trim() || uiText(i18n, 'faq.question', '問題')
        rows.push(row)
      }
      list.replaceChildren(...rows)
      if (focusedId)
        rows.find((row) => row.dataset.faqItem === focusedId)?.focus({ preventScroll: true })
    }
  } else {
    const back = button(() => {
      if (!owner()) return
      const parent = findParent(engine.getTree(), node.id)
      if (!parent || !isGroup(parent)) return
      engine.select(parent.id)
      options?.revealSelection?.()
      const rows = container.querySelectorAll<HTMLButtonElement>('[data-faq-item]')
      Array.from(rows)
        .find((row) => row.dataset.faqItem === node.id)
        ?.focus({ preventScroll: true })
    })
    const fields = (['question', 'answer'] as const).map((key) => {
      const label = document.createElement('label')
      label.className = 'sigil-field'
      const caption = document.createElement('span')
      caption.className = 'sigil-field-label'
      const input =
        key === 'question' ? document.createElement('input') : document.createElement('textarea')
      if (input instanceof HTMLTextAreaElement) input.rows = 3
      input.className = 'sigil-input'
      input.dataset.faqField = key
      input.addEventListener(
        'input',
        () => {
          const current = owner()
          const child = parts(current)?.[key]
          if (current && !current.locked && child && !child.locked && child.content !== input.value)
            engine.update(child.id, { content: input.value })
        },
        { signal },
      )
      label.append(caption, input)
      box.append(label)
      return { key, input, caption }
    })
    box.append(back)
    sync = () => {
      const current = owner()
      const latest = parts(current)
      watched.clear()
      for (const { key, input, caption } of fields) {
        caption.textContent =
          key === 'question'
            ? uiText(i18n, 'faq.question', '問題')
            : uiText(i18n, 'faq.answer', '答案')
        const child = latest?.[key]
        if (child) watched.add(child.id)
        input.disabled = !child || !!current?.locked || !!child.locked
        if (input.value !== (child?.content ?? '')) input.value = child?.content ?? ''
      }
      back.hidden = !isGroup(findParent(engine.getTree(), node.id))
      back.textContent = uiText(i18n, 'faq.back', '返回問答清單')
    }
  }
  sync()
  const unsubscribe = engine.subscribe((event) => {
    if (event.type !== 'patch' || signal.aborted) return
    const patch = event.patch
    if (patch.type === 'update') {
      if (patch.id !== node.id && !watched.has(patch.id)) return
      if (
        patch.content === undefined &&
        patch.locked === undefined &&
        !patch.attrs &&
        !patch.removeAttributes?.length &&
        !patch.shortcode
      )
        return
    }
    sync()
  })
  return {
    refreshLocale: sync,
    destroy() {
      listeners.abort()
      unsubscribe()
    },
  }
}
