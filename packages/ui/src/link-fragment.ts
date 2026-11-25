/** Resolve the literal HTML anchor before trying its percent-decoded spelling. */
export function resolveLinkFragment(href: string, hasTarget: (id: string) => boolean): string {
  if (!href.startsWith('#')) return ''
  const literal = new URL(href, 'about:blank').hash.slice(1).split(':~:')[0]!
  if (!literal.includes('%') || hasTarget(literal)) return literal
  const escaped = literal.replaceAll('+', '%2B').replaceAll('&', '%26')
  return new URLSearchParams('id=' + escaped).get('id')!
}
