import type { SigilDoc } from '@cluion/sigil-core'

// Match this example's server admission policy; this is intentionally a native-block subset.
const nodeTypes = new Set(['section', 'column', 'text', 'image', 'button'])
const tags = new Set([
  'section',
  'div',
  'article',
  'header',
  'footer',
  'main',
  'nav',
  'aside',
  'p',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'b',
  'i',
  'small',
  'blockquote',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'a',
  'button',
  'img',
  'figure',
  'figcaption',
  'hr',
  'br',
])
const nodeFields = [
  'id',
  'type',
  'tagName',
  'attributes',
  'style',
  'responsiveStyles',
  'className',
  'content',
  'children',
  'name',
  'locked',
  'hidden',
]
const styleProperties = new Set([
  'box-sizing',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'display',
  'flex',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'align-items',
  'align-self',
  'align-content',
  'justify-content',
  'justify-items',
  'justify-self',
  'gap',
  'row-gap',
  'column-gap',
  'grid-template-columns',
  'grid-template-rows',
  'grid-column',
  'grid-row',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'overflow',
  'overflow-x',
  'overflow-y',
  'overflow-wrap',
  'color',
  'background',
  'background-color',
  'border',
  'border-width',
  'border-style',
  'border-color',
  'border-radius',
  'box-shadow',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'text-decoration',
  'white-space',
  'word-break',
  'list-style',
  'list-style-type',
  'appearance',
  'cursor',
  'opacity',
  'transform',
  'object-fit',
  'object-position',
  'aspect-ratio',
])
const styleFunctions = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'linear-gradient',
  'radial-gradient',
  'repeating-linear-gradient',
  'repeating-radial-gradient',
  'minmax',
  'repeat',
  'calc',
  'min',
  'max',
  'clamp',
  'fit-content',
  'translate',
  'translatex',
  'translatey',
  'scale',
  'scalex',
  'scaley',
  'rotate',
])
const attributeNames = new Set([
  'id',
  'class',
  'title',
  'role',
  'alt',
  'src',
  'href',
  'target',
  'rel',
  'type',
  'width',
  'height',
  'loading',
])
const encoder = new TextEncoder()

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function invalid(path: string): never {
  throw new Error(`Invalid document: ${path}`)
}

function matchesEntire(value: string, pattern: RegExp): boolean {
  return pattern.exec(value)?.[0] === value
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) invalid(path)
}

function assertFields(value: Record<string, unknown>, allowed: string[], path: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid(path)
}

function assertText(value: unknown, maxBytes: number, path: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    encoder.encode(value).length > maxBytes ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0)
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code))
    })
  )
    invalid(path)
}

function assertIdentifier(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !matchesEntire(value, /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/))
    invalid(path)
}

function isSafeUrl(value: string, link = false): boolean {
  if (value === '') return true
  if (
    Array.from(value).some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    ) ||
    /[\\<>"']/.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)
  )
    return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  if (link && value.startsWith('#')) return true
  if (link && matchesEntire(value, /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/)) return true
  if (link && matchesEntire(value, /^tel:\+?[0-9][0-9().-]{0,31}$/)) return true
  try {
    const url = new URL(value)
    return (
      /^https?:\/\//i.test(value) &&
      ['http:', 'https:'].includes(url.protocol) &&
      url.hostname.length > 0 &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

export function isPersistentAssetUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    encoder.encode(value).length <= 2048 &&
    isSafeUrl(value)
  )
}

function assertAttributes(value: unknown, path: string): void {
  assertRecord(value, path)
  for (const [name, attribute] of Object.entries(value)) {
    if (
      (!attributeNames.has(name) && !matchesEntire(name, /^(?:aria|data)-[a-z][a-z0-9-]*$/)) ||
      name.startsWith('data-sigil')
    )
      invalid(path)
    assertText(attribute, 2048, path)
    if ((name === 'src' || name === 'href') && !isSafeUrl(attribute, name === 'href')) invalid(path)
    if (name === 'target' && !['_self', '_blank'].includes(attribute)) invalid(path)
    if (name === 'type' && attribute !== 'button') invalid(path)
    if (name === 'loading' && !['lazy', 'eager'].includes(attribute)) invalid(path)
    if (['width', 'height'].includes(name) && !matchesEntire(attribute, /^[1-9][0-9]{0,4}$/))
      invalid(path)
  }
}

function assertCssValue(value: unknown, property: string, path: string): void {
  assertText(value, 2048, path)
  if (!value.trim()) invalid(path)
  if (property === 'font-family') {
    const family = '(?:[A-Za-z][A-Za-z0-9 -]*|"[A-Za-z0-9 -]+"|\'[A-Za-z0-9 -]+\')'
    if (!matchesEntire(value, new RegExp(`^${family}(?:\\s*,\\s*${family})*$`))) invalid(path)
    return
  }
  if (
    !matchesEntire(value, /^[A-Za-z0-9#.,%+*/() -]+$/) ||
    value.includes('/*') ||
    value.includes('*/')
  )
    invalid(path)
  for (const match of value.matchAll(/([A-Za-z][A-Za-z0-9-]*)\s*\(/g)) {
    if (!styleFunctions.has(match[1]!.toLowerCase())) invalid(path)
  }
  let depth = 0
  for (const character of value) {
    if (character === '(' && ++depth > 16) invalid(path)
    if (character === ')' && --depth < 0) invalid(path)
  }
  if (depth !== 0) invalid(path)
}

function assertStyle(value: unknown, path: string): void {
  assertRecord(value, path)
  for (const [property, declaration] of Object.entries(value)) {
    if (!styleProperties.has(property)) invalid(path)
    assertCssValue(declaration, property, `${path}.${property}`)
  }
}

function assertMeta(value: unknown): void {
  assertRecord(value, 'meta')
  assertFields(value, ['title', 'device', 'updatedAt'], 'meta')
  if ('title' in value) assertText(value.title, 1000, 'meta.title')
  if (
    'device' in value &&
    (typeof value.device !== 'string' || !['desktop', 'tablet', 'mobile'].includes(value.device))
  )
    invalid('meta.device')
  if ('updatedAt' in value) {
    assertText(value.updatedAt, 40, 'meta.updatedAt')
    const match = value.updatedAt.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/,
    )
    if (!match || match[0] !== value.updatedAt) invalid('meta.updatedAt')
    const year = Number(match[1]),
      month = Number(match[2]),
      day = Number(match[3])
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > days[month - 1]! ||
      Number(match[4]) > 23 ||
      Number(match[5]) > 59 ||
      Number(match[6]) > 59 ||
      Number(match[8] ?? 0) > 23 ||
      Number(match[9] ?? 0) > 59
    )
      invalid('meta.updatedAt')
  }
}

function assertStylesheets(value: unknown): void {
  if (!Array.isArray(value)) invalid('stylesheets')
  const ids = new Set<string>()
  const token = '(?:[a-z][a-z0-9-]*|\\*|[.#][A-Za-z_][A-Za-z0-9_-]*)'
  const compound =
    token +
    '(?:[.#][A-Za-z_][A-Za-z0-9_-]*|:(?:hover|focus|focus-visible|active|first-child|last-child))*'
  const selector = new RegExp(
    `^${compound}(?:\\s+(?:[>+~]\\s*)?${compound}|\\s*[>+~]\\s*${compound})*$`,
  )
  for (const sheet of value) {
    assertRecord(sheet, 'stylesheets')
    assertFields(sheet, ['id', 'rules'], 'stylesheets')
    assertIdentifier(sheet.id, 'stylesheets.id')
    if (ids.has(sheet.id)) invalid('stylesheets.id')
    ids.add(sheet.id)
    assertText(sheet.rules, 65536, 'stylesheets.rules')
    let remaining = sheet.rules.trim()
    while (remaining) {
      const rule = remaining.match(/^([^{}]+)\{([^{}]*)\}\s*/)
      if (!rule) invalid('stylesheets.rules')
      if (
        rule[1]!
          .trim()
          .split(',')
          .some((part) => !matchesEntire(part.trim(), selector))
      )
        invalid('stylesheets.rules')
      for (const declaration of rule[2]!.split(';')) {
        if (!declaration.trim()) continue
        const parts = declaration.match(/^\s*([a-z-]+)\s*:\s*(.*?)\s*$/s)
        if (!parts) invalid('stylesheets.rules')
        assertStyle({ [parts[1]!]: parts[2] }, 'stylesheets.rules')
      }
      remaining = remaining.slice(rule[0].length)
    }
  }
}

/** Reject unsupported data before mounting; accepted data is returned without normalization. */
export function assertDocument(value: unknown): asserts value is SigilDoc {
  assertRecord(value, 'doc')
  assertFields(value, ['version', 'root', 'meta', 'stylesheets'], 'doc')
  if (value.version !== 1 || encoder.encode(JSON.stringify(value)).length > 1048576) invalid('doc')
  const ids = new Set<string>()
  function visit(node: unknown, depth: number): void {
    if (depth > 32 || ids.size >= 5000) invalid('root limits')
    assertRecord(node, 'node')
    assertFields(node, nodeFields, 'node')
    assertIdentifier(node.id, 'node.id')
    if (ids.has(node.id)) invalid('duplicate node.id')
    ids.add(node.id)
    if (typeof node.type !== 'string' || !nodeTypes.has(node.type)) invalid('node.type')
    if ('tagName' in node && (typeof node.tagName !== 'string' || !tags.has(node.tagName)))
      invalid('node.tagName')
    for (const [field, limit] of [
      ['name', 500],
      ['content', 100000],
      ['className', 2048],
    ] as const) {
      if (field in node) assertText(node[field], limit, `node.${field}`)
    }
    if (
      'className' in node &&
      !matchesEntire(String(node.className), /^(?:[A-Za-z0-9_-]+(?: +[A-Za-z0-9_-]+)*)?$/)
    )
      invalid('node.className')
    for (const field of ['locked', 'hidden']) {
      if (field in node && typeof node[field] !== 'boolean') invalid(`node.${field}`)
    }
    if ('attributes' in node) assertAttributes(node.attributes, 'node.attributes')
    if ('style' in node) assertStyle(node.style, 'node.style')
    if ('responsiveStyles' in node) {
      assertRecord(node.responsiveStyles, 'node.responsiveStyles')
      assertFields(node.responsiveStyles, ['tablet', 'mobile'], 'node.responsiveStyles')
      for (const [device, style] of Object.entries(node.responsiveStyles))
        assertStyle(style, `node.responsiveStyles.${device}`)
    }
    if ('children' in node) {
      if (!Array.isArray(node.children)) invalid('node.children')
      for (const child of node.children) visit(child, depth + 1)
    }
  }
  visit(value.root, 1)
  if ('meta' in value) assertMeta(value.meta)
  if ('stylesheets' in value) assertStylesheets(value.stylesheets)
}
