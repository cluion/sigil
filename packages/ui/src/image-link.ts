import {
  createId,
  createTypeRegistry,
  getEffectiveStyle,
  type ComponentNode,
  type ComponentUpdate,
  type Engine,
  type ResponsiveDevice,
  type RichTextResolver,
  type Style,
  type TypeRegistry,
} from '@cluion/sigil-core'
import { findComponentPath, hasDocumentChildren } from './component-path.js'
import { attribute, attributeKey, destination } from './link-destination.js'
import { isGrid } from './grid-columns.js'
import { isFlex } from './flex-wrap-field.js'

export interface ImageLinkOptions {
  richText?: Pick<RichTextResolver, 'supports'>
  registry?: TypeRegistry
}

export interface ImageLinkState {
  link: ComponentNode | null
  canEdit: boolean
  shared: boolean
  canRemove: boolean
}

const defaults = createTypeRegistry()
const devices = ['desktop', 'tablet', 'mobile'] as const
const marker = 'data-image-link'
const markerValue = 'layout-v1'
const blockedAncestors = new Set(
  'picture button label summary select option optgroup audio video object svg math'.split(' '),
)
const restrictedParents = new Set(
  'ul ol dl menu table thead tbody tfoot tr colgroup head html'.split(' '),
)
const dimensions = /^(?:(?:min|max)-)?(?:width|height)$/
const placement =
  /^(?:margin(?:-.+)?|align-self|justify-self|place-self|order|flex(?:-grow|-shrink|-basis)?|grid-(?:area|row|column)(?:-start|-end)?|float|clear|position|inset(?:-.+)?|top|right|bottom|left|z-index|vertical-align)$/
const basicLinkAttributes = new Set(['href', 'target', 'rel'])

function tag(node: ComponentNode, options?: ImageLinkOptions) {
  return (
    node.tagName ??
    (options?.registry ?? defaults).get(node.type)?.tagName ??
    'div'
  ).toLowerCase()
}

function source(node: Pick<ComponentNode, 'style' | 'responsiveStyles'>, device: ResponsiveDevice) {
  return device === 'desktop' ? node.style : node.responsiveStyles?.[device]
}

function display(node: ComponentNode, device: ResponsiveDevice) {
  const style = getEffectiveStyle(node, device)
  const key = Object.keys(style)
    .reverse()
    .find((key) => key.toLowerCase() === 'display')
  return key ? style[key]!.trim().toLowerCase() : ''
}

function sizedInside(value: string) {
  return /^(?:auto|none|initial|unset|inherit|revert(?:-layer)?|[+-]?(?:0+(?:\.0*)?|\.0+)(?:[a-z]+|%)?)$/i.test(
    value.trim(),
  )
    ? value
    : '100%'
}

function writeLayer(
  target: Pick<ComponentNode, 'style' | 'responsiveStyles'>,
  device: ResponsiveDevice,
  style: Style,
) {
  if (!Object.keys(style).length) return
  if (device === 'desktop') target.style = style
  else (target.responsiveStyles ??= {})[device] = style
}

function layout(parent: ComponentNode, image: ComponentNode) {
  const edit: ComponentUpdate = {}
  const box: Pick<ComponentNode, 'style' | 'responsiveStyles'> = {}
  const kinds = devices.map((device) => {
    const ownDisplay = display(image, device)
    const parentDisplay = display(parent, device)
    if (ownDisplay === 'none') return 'none'
    if (
      isGrid(parentDisplay) ||
      isFlex(parentDisplay) ||
      ownDisplay === 'block' ||
      ownDisplay === 'flow-root' ||
      ((isGrid(ownDisplay) || isFlex(ownDisplay)) && !ownDisplay.includes('inline'))
    )
      return 'grid'
    return 'inline-grid'
  })
  if (kinds.every((kind) => kind === 'inline-grid')) return { edit, box }
  let previous = ''
  devices.forEach((device, index) => {
    const kind = kinds[index]!
    const outer: Style = {}
    const inner: Style = {}
    if (kind !== previous) outer.display = kind
    previous = kind
    if (device === 'desktop') {
      outer['grid-template-columns'] = 'minmax(0, 1fr)'
      outer['grid-template-rows'] = 'minmax(0, 1fr)'
    }
    for (const [key, value] of Object.entries(source(image, device) ?? {})) {
      const name = key.toLowerCase()
      if (dimensions.test(name)) {
        outer[key] = value
        const normalized = sizedInside(value)
        if (value !== normalized) inner[key] = normalized
      } else if (placement.test(name)) {
        outer[key] = value
        inner[key] = ''
      }
    }
    writeLayer(box, device, outer)
    writeLayer(edit, device, inner)
  })
  return { edit, box }
}

/** The one-image layout box survives saving and can remain after clearing its href. */
export function isImageLinkLayout(link: ComponentNode, image: ComponentNode): boolean {
  const child = link.children?.[0]
  return (
    attribute(link, marker) === markerValue &&
    link.type === 'section' &&
    link.tagName?.toLowerCase() === 'a' &&
    !link.shortcode &&
    !link.content &&
    link.children?.length === 1 &&
    child?.id === image.id &&
    child.type === 'image' &&
    (child.tagName ?? 'img').toLowerCase() === 'img' &&
    !child.shortcode &&
    link.style?.['grid-template-columns'] === 'minmax(0, 1fr)' &&
    link.style?.['grid-template-rows'] === 'minmax(0, 1fr)' &&
    ['grid', 'inline-grid', 'none'].includes(link.style.display ?? '')
  )
}

function canUnwrap(link: ComponentNode, image: ComponentNode, parent: ComponentNode) {
  const own = isImageLinkLayout(link, image)
  if (
    !['section', 'text'].includes(link.type) ||
    link.name ||
    link.className ||
    link.hidden ||
    link.content ||
    link.children?.length !== 1 ||
    link.children[0] !== image
  )
    return false
  if (
    Object.keys(link.attributes ?? {}).some(
      (key) =>
        !basicLinkAttributes.has(key.toLowerCase()) && !(own && key.toLowerCase() === marker),
    )
  )
    return false
  if (own) {
    const expected = layout(parent, image).box
    if (
      !expected.style ||
      devices.some((device) => {
        const style = source(link, device),
          projected = source(expected, device)
        return (
          style?.display !== projected?.display ||
          style?.['grid-template-columns'] !== projected?.['grid-template-columns'] ||
          style?.['grid-template-rows'] !== projected?.['grid-template-rows']
        )
      })
    )
      return false
  }
  return devices.every((device) =>
    Object.entries(source(link, device) ?? {}).every(([key, value]) => {
      if (!own) return false
      const name = key.toLowerCase()
      if (name === 'display') return ['grid', 'inline-grid', 'none'].includes(value)
      if (name === 'grid-template-columns' || name === 'grid-template-rows')
        return value === 'minmax(0, 1fr)'
      const inner = source(image, device) ?? {}
      if (dimensions.test(name)) return inner[key] === sizedInside(value)
      return placement.test(name) && !Object.keys(inner).some((k) => k.toLowerCase() === name)
    }),
  )
}

function inspect(root: ComponentNode, imageId: string, options?: ImageLinkOptions) {
  const path = findComponentPath(root, imageId)
  const image = path.at(-1)
  const parent = path.at(-2)
  if (
    !image ||
    !parent ||
    image.type !== 'image' ||
    tag(image, options) !== 'img' ||
    image.children?.length ||
    attribute(image, 'usemap') !== undefined ||
    attribute(image, 'ismap') !== undefined ||
    attribute(image, 'tabindex') !== undefined
  )
    return null
  const ancestors = path.slice(0, -1)
  if (
    path.some(
      (node) =>
        node.shortcode ||
        node.type === 'shortcode' ||
        node.type === 'rich-text' ||
        options?.richText?.supports(node),
    )
  )
    return null
  if (
    ancestors.some((node) => {
      const name = tag(node, options)
      return (
        !hasDocumentChildren(name) ||
        blockedAncestors.has(name) ||
        (node.type === 'button' && name !== 'a')
      )
    }) ||
    restrictedParents.has(tag(parent, options))
  )
    return null
  const anchors = ancestors.filter((node) => tag(node, options) === 'a')
  if (anchors.length > 1) return null
  const link = anchors[0] ?? null
  const linkIndex = link ? ancestors.indexOf(link) : -1
  const canEdit = !path.some((node) => node.locked)
  const shared =
    !!link &&
    ancestors.slice(linkIndex).some((node) => !!node.content?.trim() || node.children?.length !== 1)
  const canRemove = canEdit && !!link && !shared && attribute(link, 'href') !== undefined
  return {
    image,
    parent,
    linkParent: ancestors[linkIndex - 1],
    state: { link, canEdit, shared, canRemove },
  }
}

export function readImageLink(
  root: ComponentNode,
  imageId: string,
  options?: ImageLinkOptions,
): ImageLinkState | null {
  return inspect(root, imageId, options)?.state ?? null
}

function linkChanges(link: ComponentNode, href: string, newTab?: boolean): ComponentUpdate {
  const attrs: Record<string, string> = {}
  const remove: string[] = []
  if (attribute(link, 'href') !== href) attrs[attributeKey(link, 'href')] = href
  const target = attribute(link, 'target')
  if (!href.startsWith('#') && !/^(?:mailto|tel):/i.test(href)) {
    if (newTab === true) {
      if (target?.toLowerCase() !== '_blank') attrs[attributeKey(link, 'target')] = '_blank'
      const rel = attribute(link, 'rel') ?? ''
      const tokens = rel
        .split(/[\t\n\f\r ]+/)
        .filter((token) => token && token.toLowerCase() !== 'opener')
      if (!tokens.some((token) => token.toLowerCase() === 'noopener')) tokens.push('noopener')
      if (tokens.join(' ') !== rel) attrs[attributeKey(link, 'rel')] = tokens.join(' ')
    } else if (newTab === false && target !== undefined) remove.push('target')
  } else if (target?.toLowerCase() === '_blank') remove.push('target')
  const patch: ComponentUpdate = {}
  if (Object.keys(attrs).length) patch.attributes = attrs
  if (remove.length) patch.removeAttributes = remove
  return patch
}

export function setImageLink(
  engine: Engine,
  imageId: string,
  href: string,
  newTab?: boolean,
  options?: ImageLinkOptions,
): boolean {
  const next = destination('url', href)
  if (!next) return false
  const current = inspect(engine.getTree(), imageId, options)
  if (!current?.state.canEdit) return false
  const {
    image,
    parent,
    state: { link },
  } = current
  if (link) {
    const changes = linkChanges(link, next, newTab)
    if (Object.keys(changes).length) engine.batch(() => engine.update(link.id, changes))
    return true
  }
  const anchor: ComponentNode = { id: createId(), type: 'section', tagName: 'a' }
  const { edit, box } = layout(parent, image)
  anchor.attributes = linkChanges(anchor, next, newTab).attributes!
  if (box.style) {
    anchor.attributes[marker] = markerValue
    Object.assign(anchor, box)
  }
  const index = parent.children!.indexOf(image)
  engine.batch(() => {
    engine.insert(parent.id, anchor, index)
    engine.move(imageId, anchor.id)
    if (Object.keys(edit).length) engine.update(imageId, edit)
  })
  return true
}

export function removeImageLink(
  engine: Engine,
  imageId: string,
  options?: ImageLinkOptions,
): boolean {
  const current = inspect(engine.getTree(), imageId, options)
  if (!current?.state.canRemove || !current.state.link) return false
  const {
    linkParent,
    state: { link },
  } = current
  if (!linkParent || !canUnwrap(link, current.image, linkParent)) {
    engine.batch(() => engine.update(link.id, { removeAttributes: ['href'] }))
    return true
  }
  const index = linkParent.children!.indexOf(link)
  const edit: ComponentUpdate = {}
  if (isImageLinkLayout(link, current.image)) {
    for (const device of devices) {
      const restored: Style = {}
      for (const [key, value] of Object.entries(source(link, device) ?? {})) {
        if (dimensions.test(key.toLowerCase()) || placement.test(key.toLowerCase()))
          restored[key] = value
      }
      writeLayer(edit, device, restored)
    }
  }
  const wasLinkSelected = engine.getSelection() === link.id
  engine.batch(() => {
    engine.move(imageId, linkParent.id, index)
    if (Object.keys(edit).length) engine.update(imageId, edit)
    engine.remove(link.id)
    if (wasLinkSelected) engine.select(imageId)
  })
  return true
}
