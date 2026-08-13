import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..')
const SOURCE_ROOTS = ['packages', 'demo', 'examples', 'scripts']
const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.svelte', '.ts', '.tsx', '.vue'])
const IGNORED_DIRECTORIES = new Set(['__tests__', 'dist', 'node_modules', 'test', 'tests'])
const IGNORED_FILES = new Set([
  'scripts/check-security-sinks.mjs',
  'scripts/check-security-sinks.test.mjs',
])

const RULES = [
  { kind: 'innerHTML access', pattern: /\.innerHTML\b/ },
  { kind: 'outerHTML access', pattern: /\.outerHTML\b/ },
  { kind: 'insertAdjacentHTML call', pattern: /\.insertAdjacentHTML\s*\(/ },
  { kind: 'dangerouslySetInnerHTML use', pattern: /\bdangerouslySetInnerHTML\b/ },
  { kind: 'setHTMLUnsafe call', pattern: /\.setHTMLUnsafe\s*\(/ },
  { kind: 'setHTML call', pattern: /\.setHTML\s*\(/ },
  {
    kind: 'srcdoc write',
    pattern: /\.srcdoc\s*=|\.setAttribute\(\s*['"]srcdoc['"]\s*,/,
  },
  { kind: 'document.write call', pattern: /\bdocument\.write\s*\(/ },
  { kind: 'eval call', pattern: /\beval\s*\(/ },
  { kind: 'Function constructor', pattern: /\bnew\s+Function\s*\(/ },
  {
    kind: 'createContextualFragment call',
    pattern: /\.createContextualFragment\s*\(/,
  },
]
const DYNAMIC_CALL_RULES = [
  { kind: 'dynamic createElement call', method: 'createElement' },
  { kind: 'dynamic setAttribute call', method: 'setAttribute' },
]

export const APPROVED_FINDINGS = [
  {
    file: 'packages/core/src/policy/html-policy.ts',
    kind: 'innerHTML access',
    source: 'el.innerHTML = trusted as string',
    count: 2,
    reason: 'Trusted Types policy output is written only inside HtmlPolicy.',
  },
  {
    file: 'packages/core/src/policy/html-policy.ts',
    kind: 'setHTML call',
    source: 'e.setHTML(untrusted)',
    count: 1,
    reason: 'The browser Sanitizer API handles untrusted rich-text HTML.',
  },
  {
    file: 'packages/shortcode/src/resolver.ts',
    kind: 'innerHTML access',
    source: 'return def.template.innerHTML',
    count: 1,
    reason: 'Reads a host-registered, trusted shortcode template.',
  },
  {
    file: 'packages/app/src/index.ts',
    kind: 'dynamic createElement call',
    source: 'const n = document.createElement(tag)',
    count: 1,
    reason: 'Internal helper callers provide source-controlled tag literals.',
  },
  {
    file: 'packages/core/src/renderer/renderer.ts',
    kind: 'dynamic createElement call',
    source: 'const el = document.createElement(tag)',
    count: 1,
    reason: 'Known SigilDoc structural trust boundary; hosts must validate imported documents.',
  },
  {
    file: 'packages/core/src/renderer/renderer.ts',
    kind: 'dynamic setAttribute call',
    source: 'for (const [k, v] of Object.entries(node.attributes)) el.setAttribute(k, v)',
    count: 1,
    reason: 'Known SigilDoc attribute trust boundary; hosts must validate imported documents.',
  },
  {
    file: 'packages/core/src/renderer/renderer.ts',
    kind: 'dynamic setAttribute call',
    source: 'for (const [k, v] of Object.entries(patch.attrs)) el.setAttribute(k, v)',
    count: 1,
    reason: 'Known SigilDoc attribute trust boundary; hosts must validate imported patches.',
  },
  {
    file: 'packages/ui/src/canvas.ts',
    kind: 'srcdoc write',
    source: "iframe.srcdoc = '<!doctype html><html><head></head><body></body></html>'",
    count: 1,
    reason: 'The iframe document is a source-controlled constant.',
  },
  {
    file: 'demo/rich-text.ts',
    kind: 'innerHTML access',
    source: 'return output.innerHTML',
    count: 1,
    reason: 'Serializes the demo allowlist sanitizer output.',
  },
  {
    file: 'demo/rich-text.ts',
    kind: 'dynamic createElement call',
    source: 'const output: Node = ALLOWED_ELEMENTS.has(tag) ? target.createElement(tag) : fragment',
    count: 1,
    reason: 'The demo sanitizer checks tag against ALLOWED_ELEMENTS first.',
  },
  {
    file: 'demo/rich-text.ts',
    kind: 'innerHTML access',
    source: 'return element.innerHTML',
    count: 1,
    reason: 'Reads the demo editor value before the configured sanitizer runs.',
  },
  {
    file: 'demo/rich-text.ts',
    kind: 'dynamic createElement call',
    source: 'const wrapper = doc.createElement(tag)',
    count: 1,
    reason: 'The demo uses this helper only with source-controlled tag literals.',
  },
  {
    file: 'demo/rich-text.ts',
    kind: 'dynamic setAttribute call',
    source:
      'for (const [name, value] of Object.entries(attributes ?? {})) wrapper.setAttribute(name, value)',
    count: 1,
    reason: 'The demo passes only source-controlled attribute names and values.',
  },
  {
    file: 'demo/rich-text.ts',
    kind: 'dynamic setAttribute call',
    source: 'else element.setAttribute(name, value)',
    count: 1,
    reason: 'The demo restores only its source-controlled accessibility attributes.',
  },
]

function normalizeSource(source) {
  return source.trim().replace(/\s+/g, ' ')
}

function countPatternMatches(line, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  return [...line.matchAll(new RegExp(pattern.source, flags))].length
}

function toRepoPath(absolutePath) {
  return relative(REPO_ROOT, absolutePath).split(sep).join('/')
}

function sourceLineAt(source, offset) {
  const start = source.lastIndexOf('\n', offset) + 1
  const nextNewline = source.indexOf('\n', offset)
  const end = nextNewline === -1 ? source.length : nextNewline
  return source.slice(start, end)
}

function lineNumberAt(source, offset) {
  return source.slice(0, offset).split('\n').length
}

export function findSecurityFindings(file, source) {
  const findings = []

  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    for (const rule of RULES) {
      const occurrenceCount = countPatternMatches(line, rule.pattern)

      for (let occurrence = 0; occurrence < occurrenceCount; occurrence += 1) {
        findings.push({
          file,
          kind: rule.kind,
          line: index + 1,
          source: normalizeSource(line),
        })
      }
    }
  }

  for (const rule of DYNAMIC_CALL_RULES) {
    const pattern = new RegExp(`\\.${rule.method}\\s*\\(\\s*`, 'gu')

    for (const match of source.matchAll(pattern)) {
      const offset = match.index ?? 0
      const firstArgument = source[offset + match[0].length]
      if (firstArgument === "'" || firstArgument === '"') continue

      findings.push({
        file,
        kind: rule.kind,
        line: lineNumberAt(source, offset),
        source: normalizeSource(sourceLineAt(source, offset)),
      })
    }
  }

  return findings.sort((left, right) => left.line - right.line)
}

export function validateSecurityFindings(findings, allowances = APPROVED_FINDINGS) {
  const usage = allowances.map(() => 0)
  const errors = []

  for (const finding of findings) {
    const allowanceIndex = allowances.findIndex(
      (allowance) =>
        allowance.file === finding.file &&
        allowance.kind === finding.kind &&
        normalizeSource(allowance.source) === finding.source,
    )

    if (allowanceIndex === -1) {
      errors.push(`unapproved ${finding.kind}: ${finding.file}:${finding.line} ${finding.source}`)
      continue
    }

    usage[allowanceIndex] += 1
  }

  for (const [index, allowance] of allowances.entries()) {
    if (usage[index] !== allowance.count) {
      errors.push(
        `reviewed occurrence mismatch: ${allowance.file} (${allowance.kind}, expected ${allowance.count}, found ${usage[index]})`,
      )
    }
  }

  return errors
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue

    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(absolutePath)))
      continue
    }

    if (
      !entry.isFile() ||
      !SOURCE_EXTENSIONS.has(extname(entry.name)) ||
      /\.(?:spec|test)\.[^.]+$/u.test(entry.name)
    )
      continue

    const repoPath = toRepoPath(absolutePath)
    if (!IGNORED_FILES.has(repoPath)) files.push(absolutePath)
  }

  return files
}

export async function scanRepository() {
  const files = (
    await Promise.all(SOURCE_ROOTS.map((root) => collectSourceFiles(join(REPO_ROOT, root))))
  )
    .flat()
    .sort()
  const findings = []

  for (const absolutePath of files) {
    const file = toRepoPath(absolutePath)
    findings.push(...findSecurityFindings(file, await readFile(absolutePath, 'utf8')))
  }

  return findings
}

async function main() {
  const findings = await scanRepository()
  const errors = validateSecurityFindings(findings)

  if (errors.length > 0) {
    console.error('security:check failed')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  console.log(`security:check passed — ${findings.length} reviewed security-sensitive operations`)
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  await main()
}
