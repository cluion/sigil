import type {
  ComponentNode,
  ComponentUpdate,
  SigilDoc,
  Attrs,
  Style,
  ShortcodeRef,
  ResponsiveStyles,
} from '../model/types.js'
import type { IdFactory } from '../model/id.js'

/**
 * Patch — engine command 降階成的 DOM 操作，供 renderer 快速路徑
 */
export type Patch =
  | { type: 'insert'; parentId: string; beforeId: string | null; node: ComponentNode }
  | { type: 'remove'; id: string }
  | {
      type: 'update'
      id: string
      /** 更換原生元件的標籤。shortcode host 換標籤時使用 replace 重新掛載。 */
      tagName?: string
      attrs?: Attrs
      removeAttributes?: readonly string[]
      style?: Style
      responsiveStyles?: ResponsiveStyles
      content?: string
      className?: string
      shortcode?: ShortcodeRef
      name?: string
      locked?: boolean
      hidden?: boolean
    }
  | { type: 'move'; id: string; newParentId: string; beforeId: string | null }
  | { type: 'replace'; id: string; node: ComponentNode }

/**
 * EngineEvent — subscribe 收到的事件
 *
 * patch 增量更新 tree 全量更新
 */
export type EngineEvent =
  | {
      type: 'tree'
      tree: ComponentNode
      /** Incremental text edits for a renderer that still displays the exact source tree. */
      textChanges?: {
        from: ComponentNode
        patches: readonly { type: 'update'; id: string; content: string }[]
      }
    }
  | { type: 'patch'; patch: Patch }
  | { type: 'selection'; id: string | null }
  | { type: 'history'; canUndo: boolean; canRedo: boolean }

export interface EngineOptions {
  doc?: SigilDoc
  idFactory?: IdFactory
}

export type HistoryKind =
  | 'initial'
  | 'insert'
  | 'remove'
  | 'move'
  | 'text'
  | 'replace-text'
  | 'style'
  | 'rename'
  | 'hide'
  | 'show'
  | 'lock'
  | 'unlock'
  | 'update'
  | 'group'

export interface HistoryEntry {
  readonly id: number
  readonly kind: HistoryKind
  readonly target: string
  readonly detail?: string
}

export interface HistoryState {
  readonly entries: readonly HistoryEntry[]
  readonly currentId: number
}

export interface HistoryEngine extends Engine {
  updateTextContents(updates: ReadonlyMap<string, string>): void
  getHistory(): HistoryState
  goToHistory(id: number): boolean
  /** End a typing group at the captured document. An unfinished batch has no committed entry. */
  checkpointHistory(): number | undefined
}

export interface Engine {
  getTree(): ComponentNode
  toJSON(): SigilDoc
  getSelection(): string | null
  insert(parentId: string, node: ComponentNode, index?: number): string
  remove(id: string): void
  update(id: string, patch: ComponentUpdate): void
  /** Apply native text changes to unlocked subtrees in a single history step. */
  updateTextContents?(updates: ReadonlyMap<string, string>): void
  /** 以來源移除後的目的子項索引搬移，省略 index 時排在最後。 */
  move(id: string, newParentId: string, index?: number): void
  batch(fn: () => void): void
  select(id: string | null): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  subscribe(listener: (e: EngineEvent) => void): () => void
  /** 解除目前訂閱；持有引擎的呼叫端仍可編輯、讀取歷程及重新訂閱。 */
  destroy(): void
}
