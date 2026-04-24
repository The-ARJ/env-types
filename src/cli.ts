import { readFileSync, writeFileSync, existsSync, watch as fsWatch } from 'node:fs'
import { resolve } from 'node:path'
import { parseEnvFile } from './parser.js'
import { generateDts, generateSchema } from './generator.js'
import { validateAgainstEntries } from './validator.js'

// ── Colours (no deps) ──────────────────────────────────────────────────────
const isTTY = process.stdout.isTTY
const c = {
  green: (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s: string) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s: string) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s: string) => (isTTY ? `\x1b[36m${s}\x1b[0m` : s),
  bold: (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
}

// ── Arg parsing ────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  command: string | undefined
  flags: Record<string, string | boolean>
} {
  const [command, ...rest] = argv
  const flags: Record<string, string | boolean> = {}

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = rest[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    }
  }

  return { command, flags }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function readEnvFile(inputPath: string): string {
  if (!existsSync(inputPath)) {
    console.error(c.red(`✗ File not found: ${inputPath}`))
    console.error(c.dim(`  Create a .env.example file or use --input <path>`))
    process.exit(1)
  }
  return readFileSync(inputPath, 'utf8')
}

function timestamp(): string {
  return c.dim(`[${new Date().toLocaleTimeString()}]`)
}

// ── Commands ───────────────────────────────────────────────────────────────

function cmdGenerate(flags: Record<string, string | boolean>): void {
  const cwd = process.cwd()
  const input = resolve(cwd, typeof flags['input'] === 'string' ? flags['input'] : '.env.example')
  const output = resolve(cwd, typeof flags['output'] === 'string' ? flags['output'] : 'env.d.ts')
  const scaffold = flags['scaffold'] === true

  function run(): void {
    const content = readEnvFile(input)
    const entries = parseEnvFile(content)

    if (entries.length === 0) {
      console.warn(c.yellow(`⚠  No variables found in ${input}`))
      return
    }

    const dts = scaffold ? generateSchema(entries) : generateDts(entries)
    const outFile = scaffold ? 'env.schema.ts' : output

    writeFileSync(resolve(cwd, outFile), dts, 'utf8')
    console.log(
      `${c.green('✓')} Generated ${c.cyan(outFile)} ` +
      c.dim(`(${entries.length} variable${entries.length === 1 ? '' : 's'})`),
    )
  }

  run()

  if (flags['watch'] === true) {
    console.log(c.dim(`  Watching ${input} for changes…`))
    fsWatch(input, () => {
      process.stdout.write(`${timestamp()} Change detected — regenerating… `)
      try {
        run()
      } catch (err) {
        console.error(c.red(`error: ${(err as Error).message}`))
      }
    })
  }
}

function cmdValidate(flags: Record<string, string | boolean>): void {
  const cwd = process.cwd()
  const input = resolve(cwd, typeof flags['input'] === 'string' ? flags['input'] : '.env.example')

  const content = readEnvFile(input)
  const entries = parseEnvFile(content)
  const errors = validateAgainstEntries(entries)

  if (errors.length === 0) {
    const required = entries.filter(e => !e.isOptional).length
    console.log(
      c.green('✓') +
      ` All ${required} required variable${required === 1 ? '' : 's'} are set.`,
    )
    return
  }

  console.error(c.red(`✗ ${errors.length} missing variable${errors.length === 1 ? '' : 's'}:`))
  for (const err of errors) {
    console.error(`  ${c.red('•')} ${c.bold(err.key)}: ${err.message}`)
  }
  process.exit(1)
}

function cmdHelp(): void {
  console.log(`
${c.bold('env-types')} — TypeScript type generation from .env files

${c.bold('Usage:')}
  env-types <command> [options]

${c.bold('Commands:')}
  ${c.cyan('generate')}   Generate env.d.ts from .env.example
  ${c.cyan('validate')}   Check process.env against .env.example
  ${c.cyan('help')}       Show this help message

${c.bold('Options for generate:')}
  --input   <file>   Source file (default: .env.example)
  --output  <file>   Output file (default: env.d.ts)
  --watch            Re-generate on file change
  --scaffold         Generate a loadEnv() schema instead of .d.ts

${c.bold('Options for validate:')}
  --input   <file>   Source file (default: .env.example)

${c.bold('Examples:')}
  npx @the-arj/env-types generate
  npx @the-arj/env-types generate --input .env --output src/env.d.ts
  npx @the-arj/env-types generate --watch
  npx @the-arj/env-types validate
`)
}

// ── Entry ──────────────────────────────────────────────────────────────────

const { command, flags } = parseArgs(process.argv.slice(2))

switch (command) {
  case 'generate':
    cmdGenerate(flags)
    break
  case 'validate':
    cmdValidate(flags)
    break
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    cmdHelp()
    break
  default:
    console.error(c.red(`✗ Unknown command: ${command}`))
    cmdHelp()
    process.exit(1)
}
