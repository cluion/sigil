import type { ComponentNode, SigilDoc, Attrs, Style } from '../model/types.js'
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
      attrs?: Attrs
      style?: Style
      content?: string
      className?: string
    }
  | { type: 'move'; id: string; newParentId: string; beforeId: string | null }
  | { type: 'replace'; id: string; node: ComponentNode }

/**
 * EngineEvent — subscribe 收到的事件
 *
 * patch 為增量（command），tree 為全量（undo／redo／load）
 */
export type EngineEvent =
  | { type: 'tree'; tree: ComponentNode }
  | { type: 'patch'; patch: Patch }
  | { type: 'selection'; id: string | null }
  | { type: 'history'; canUndo: boolean; canRedo: boolean }

export interface EngineOptions {
  doc?: SigilDoc
  idFactory?: IdFactory
}

export interface Engine {
  getTree(): ComponentNode
  toJSON(): SigilDoc
  getSelection(): string | null
  insert(parentId: string, node: ComponentNode, index?: number): string
  remove(id: string): void
  update(id: string, patch: Partial<ComponentNode>): void
  move(id: string, newParentId: string, index?: number): void
  batch(fn: () => void): void
  select(id: string | null): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  subscribe(listener: (e: EngineEvent) => void): () => void
  destroy(): void
}
