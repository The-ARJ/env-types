export type InferredType = 'string' | 'number' | 'boolean' | 'url' | 'json'

export interface EnvEntry {
  /** The environment variable name, e.g. DATABASE_URL */
  key: string
  /** Raw value from the file (quotes stripped) */
  rawValue: string
  /** JSDoc description from the comment line directly above */
  description: string | null
  /** True when value is empty — marks the var as optional in the .d.ts */
  isOptional: boolean
  /** Best-guess type inferred from the raw value */
  inferredType: InferredType
}

const VALID_KEY_RE = /^[A-Z_][A-Z0-9_]*$/i
const NUMERIC_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/
const URL_SCHEMES = /^(https?|postgres(ql)?|mysql|mongodb(\+srv)?|redis(s)?):\/\//i

/** Strip surrounding single or double quotes. */
function stripQuotes(val: string): string {
  if (val.length >= 2) {
    const first = val[0]
    const last = val[val.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return val.slice(1, -1)
    }
  }
  return val
}

function inferType(raw: string): InferredType {
  const val = stripQuotes(raw).trim()
  if (val === '') return 'string'
  if (val === 'true' || val === 'false') return 'boolean'
  if (NUMERIC_RE.test(val)) return 'number'
  if (URL_SCHEMES.test(val)) return 'url'
  try {
    JSON.parse(val)
    // Only label as JSON if it's actually a structured value, not just a plain string
    if (val.startsWith('{') || val.startsWith('[')) return 'json'
  } catch {
    // not JSON
  }
  return 'string'
}

/**
 * Parse the content of a `.env` or `.env.example` file into structured entries.
 *
 * Supports:
 * - `KEY=value` and `KEY="value"` and `KEY='value'`
 * - Comment lines (`# ...`) — the line immediately before a key becomes its JSDoc description
 * - Inline comments (`KEY=value # comment`) are stripped
 * - Empty values mark variables as optional
 * - Blank lines reset the pending description
 */
/**
 * Strip an inline `# comment` from the tail of a value, but only when the `#`
 * lives outside of any surrounding quotes. Returns the cleaned, trimmed value.
 */
function stripInlineComment(raw: string): string {
  let quote: '"' | "'" | null = null
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    // A `#` that begins an inline comment must be preceded by whitespace
    // (or start the value) so we don't truncate values like `pass#word`.
    if (ch === '#' && (i === 0 || /\s/.test(raw[i - 1]!))) {
      return raw.slice(0, i).trim()
    }
  }
  return raw.trim()
}

export function parseEnvFile(content: string): EnvEntry[] {
  const lines = content.split(/\r?\n/)
  const entries: EnvEntry[] = []
  let pendingDescription: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '') {
      pendingDescription = null
      continue
    }

    if (trimmed.startsWith('#')) {
      const text = trimmed.slice(1).trim()
      pendingDescription = text.length > 0 ? text : null
      continue
    }

    // Allow an optional `export ` prefix (`export FOO=bar`) for compatibility
    // with `.env` files meant to be sourced from a shell.
    const declaration = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trimStart()
      : trimmed

    const eqIdx = declaration.indexOf('=')
    if (eqIdx === -1) {
      pendingDescription = null
      continue
    }

    const key = declaration.slice(0, eqIdx).trim()
    if (!VALID_KEY_RE.test(key)) {
      pendingDescription = null
      continue
    }

    const valueRaw = stripInlineComment(declaration.slice(eqIdx + 1))
    const stripped = stripQuotes(valueRaw)
    const isOptional = stripped === ''

    entries.push({
      key,
      rawValue: stripped,
      description: pendingDescription,
      isOptional,
      inferredType: inferType(valueRaw),
    })

    pendingDescription = null
  }

  return entries
}
