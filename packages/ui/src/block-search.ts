import type { BlockDef } from './blocks-panel.js'

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function matchRank(block: BlockDef, query: string, terms: string[], defaultCategory: string) {
  const label = normalize(block.label)
  if (label === query) return 0
  const id = normalize(block.id)
  if (id === query) return 1
  if (label.startsWith(query)) return 2
  if (label.includes(query)) return 3

  const remaining = terms.filter((term) => !label.includes(term))
  if (!remaining.length) return 4
  const metadata = normalize(
    [id, block.category ?? defaultCategory, ...(block.keywords ?? [])].join(' '),
  )
  return remaining.every((term) => metadata.includes(term)) ? 4 + remaining.length : Infinity
}

/** 同順位保留區塊定義的原始順序。 */
export function searchBlocks(
  blocks: readonly BlockDef[],
  input: string,
  defaultCategory: string,
): BlockDef[] {
  const query = normalize(input)
  if (!query) return [...blocks]
  const terms = [...new Set(query.split(' '))]
  const matches: { block: BlockDef; rank: number }[] = []
  for (const block of blocks) {
    const rank = matchRank(block, query, terms, defaultCategory)
    if (rank !== Infinity) matches.push({ block, rank })
  }
  return matches.sort((a, b) => a.rank - b.rank).map(({ block }) => block)
}
