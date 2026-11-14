import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = join(root, 'tests/public-api')
const baseline = JSON.parse(readFileSync(join(fixtures, 'exports.json'), 'utf8'))
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'sigil-public-api-')))
const packages = []
const formatHost = {
  getCanonicalFileName: (path) => path,
  getCurrentDirectory: () => temporary,
  getNewLine: () => '\n',
}

try {
  writeFileSync(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  for (const file of ['consumer.ts', 'tsconfig.bundler.json', 'tsconfig.nodenext.json']) {
    cpSync(join(fixtures, file), join(temporary, file))
  }
  for (const entry of readdirSync(join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const source = join(root, 'packages', entry.name)
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
    if (manifest.private) continue
    const expected = baseline.packages[manifest.name]
    assert.ok(expected, `Review the new public package: ${manifest.name}`)
    assert.deepEqual(
      Object.keys(manifest.exports).sort(),
      expected.subpaths,
      `${manifest.name}: exports changed`,
    )
    const destination = join(temporary, 'node_modules', manifest.name)
    mkdirSync(destination, { recursive: true })
    cpSync(join(source, 'package.json'), join(destination, 'package.json'))
    // Stage only files explicitly included in publishing. Never expose workspace source aliases.
    for (const file of manifest.files) {
      assert.ok(
        !isAbsolute(file) && !file.split(/[\\/]/).includes('..') && !/[?*]/.test(file),
        `Unsupported files pattern: ${file}`,
      )
      assert.ok(
        existsSync(join(source, file)),
        `Missing ${manifest.name}/${file}; run pnpm build first`,
      )
      cpSync(join(source, file), join(destination, file), { recursive: true })
    }
    assert.ok(
      !existsSync(join(destination, 'src/index.ts')),
      `${manifest.name}: source leaked into the consumer`,
    )
    packages.push({ manifest, destination, expected })
  }
  assert.equal(
    packages.length,
    Object.keys(baseline.packages).length,
    'A public package disappeared',
  )

  for (const name of ['bundler', 'nodenext']) {
    const config = ts.readConfigFile(join(temporary, `tsconfig.${name}.json`), ts.sys.readFile)
    assert.equal(config.error, undefined)
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, temporary)
    assert.equal(parsed.options.paths, undefined, 'Consumer must not use TypeScript paths')
    assert.equal(parsed.options.baseUrl, undefined, 'Consumer must not use a workspace baseUrl')
    assert.equal(parsed.options.skipLibCheck, false)
    const program = ts.createProgram(parsed.fileNames, parsed.options)
    const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
    if (diagnostics.length)
      throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost))
    const checker = program.getTypeChecker()
    for (const { manifest, destination, expected } of packages) {
      const resolved = ts.resolveModuleName(
        manifest.name,
        join(temporary, 'consumer.ts'),
        parsed.options,
        ts.sys,
      ).resolvedModule
      assert.ok(resolved, `${manifest.name}: no type entry`)
      assert.equal(
        resolve(resolved.resolvedFileName),
        resolve(destination, manifest.exports['.'].types),
      )
      const source = program.getSourceFile(resolved.resolvedFileName)
      const symbol = checker.getSymbolAtLocation(source)
      const exported = checker
        .getExportsOfModule(symbol)
        .map((item) => {
          const target = item.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(item) : item
          return {
            name: item.name,
            type: Boolean(target.flags & ts.SymbolFlags.Type),
            value: Boolean(target.flags & ts.SymbolFlags.Value),
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
      assert.deepEqual(
        exported.filter((item) => item.type).map((item) => item.name),
        expected.types,
        `${manifest.name}: review changed public types (${name})`,
      )
      assert.deepEqual(
        exported.filter((item) => item.value).map((item) => item.name),
        expected.values,
        `${manifest.name}: review changed public values (${name})`,
      )
    }
    for (const source of program.getSourceFiles()) {
      assert.ok(
        !relative(root, source.fileName).match(/^packages[/\\].*[/\\]src[/\\]/),
        'Consumer resolved a workspace source file',
      )
    }
    console.log(`Public API types: ${name}, ${packages.length} package roots, no source aliases`)
  }

  // A Node consumer also verifies actual ESM imports, CSS resolution, and export-map fences.
  const runtime = `
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const packages = ${JSON.stringify(packages)}
for (const { manifest, destination, expected } of packages) {
  assert.equal(fileURLToPath(import.meta.resolve(manifest.name)), resolve(destination, manifest.exports['.'].import))
  const actual = await import(manifest.name)
  assert.deepEqual(Object.keys(actual).sort(), [...expected.values].sort())
  for (const name of Object.keys(actual).filter(name => /^SIGIL_.*_VERSION$/.test(name))) assert.equal(actual[name], manifest.version)
  for (const path of ['src/index.js', 'dist/index.js']) {
    await assert.rejects(import(manifest.name + '/' + path), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
  }
}
const css = readFileSync(fileURLToPath(import.meta.resolve('@cluion/sigil-app/tokens.css')), 'utf8')
const tokens = [...new Set([...css.matchAll(/(--sigil-[a-z0-9-]+)\\s*:/g)].map(match => match[1]))].sort()
assert.deepEqual(tokens, ${JSON.stringify(baseline.cssTokens)})
console.log('Public API runtime: 7 ESM roots, tokens.css, CSS tokens and 14 forbidden deep imports')
`
  const runtimePath = join(temporary, 'runtime.mjs')
  writeFileSync(runtimePath, runtime)
  const result = spawnSync(process.execPath, [runtimePath], { cwd: temporary, encoding: 'utf8' })
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || 'Public API runtime failed')
  process.stdout.write(result.stdout)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
