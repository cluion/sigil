import type { ComponentNode, Engine, ResponsiveDevice, Style } from '@cluion/sigil-core'

/** Preserve CSS declaration order when a later shorthand would override this edit. */
export function writeLayoutDeclaration(
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  property: string,
  value: string,
  shadows: (name: string) => boolean,
  canonicalize: (name: string) => string = (name) => name.toLowerCase(),
): void {
  const layer = device === 'desktop' ? node.style : node.responsiveStyles?.[device]
  const keys = Object.keys(layer ?? {})
  const matches = keys.filter((key) => canonicalize(key) === property)
  function update(style: Style): void {
    engine.update(
      node.id,
      device === 'desktop' ? { style } : { responsiveStyles: { [device]: style } },
    )
  }
  if (!value) {
    if (matches.length) update(Object.fromEntries(matches.map((key) => [key, ''])))
    return
  }
  const last = matches.at(-1)
  if (last && keys.slice(keys.indexOf(last) + 1).some((key) => shadows(canonicalize(key)))) {
    engine.batch(() => {
      update({ [last]: '' })
      update({ [last]: value })
    })
  } else if (!last || layer?.[last] !== value) {
    update({ [last ?? property]: value })
  }
}
