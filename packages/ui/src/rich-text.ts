import type { ComponentNode, RichTextResolver } from '@cluion/sigil-core'

export interface RichTextAdapter {
  resolver: RichTextResolver
  start(context: RichTextEditContext): RichTextSession
}

export interface RichTextEditContext {
  node: ComponentNode
  element: HTMLElement
  document: Document
  value: string
  requestCommit(): void
  requestCancel(): void
}

export interface RichTextSession {
  focus(): void
  getValue(): string
  destroy(): void
}

/**
 * 產生不含 markup 的短摘要
 */
export function richTextSummary(markup: string, maxLength = 160): string {
  const summary = markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (summary.length <= maxLength) return summary
  return `${summary.slice(0, maxLength - 1)}…`
}
