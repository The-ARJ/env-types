import type { EnvEntry, InferredType } from './parser.js'

// ── Schema-based loadEnv ───────────────────────────────────────────────────

type TypeMap = {
  string: string
  number: number
  boolean: boolean
  url: string
  json: unknown
}

interface FieldSpec<T extends InferredType = InferredType> {
  type: T
  required?: boolean
  default?: TypeMap[T]
}

type Schema = Record<string, FieldSpec>

type Resolved<S extends Schema> = {
  [K in keyof S]: S[K]['required'] extends false
    ? undefined extends S[K]['default']
      ? TypeMap[S[K]['type']] | undefined
      : TypeMap[S[K]['type']]
    : TypeMap[S[K]['type']]
}

function coerce(raw: string, type: InferredType): unknown {
  switch (type) {
    case 'number': {
      // `Number('')` and `Number('   ')` both yield 0 — reject them explicitly
      // along with any non-finite result (NaN / Infinity).
      if (raw.trim() === '') throw new Error(`expected a number, got "${raw}"`)
      const n = Number(raw)
      if (!Number.isFinite(n)) throw new Error(`expected a number, got "${raw}"`)
      return n
    }
    case 'boolean': {
      if (raw === 'true' || raw === '1') return true
      if (raw === 'false' || raw === '0') return false
      throw new Error(`expected "true" or "false", got "${raw}"`)
    }
    case 'url': {
      try {
        new URL(raw)
      } catch {
        throw new Error(`expected a valid URL, got "${raw}"`)
      }
      return raw
    }
    case 'json': {
      try {
        return JSON.parse(raw)
      } catch {
        throw new Error(`expected valid JSON, got "${raw}"`)
      }
    }
    default:
      return raw
  }
}

/**
 * Read, coerce, and validate environment variables against a typed schema.
 * Throws a single consolidated `Error` listing all missing/invalid vars.
 *
 * @example
 * const env = loadEnv({
 *   PORT:         { type: 'number' },
 *   NODE_ENV:     { type: 'string' },
 *   DEBUG:        { type: 'boolean', required: false, default: false },
 *   DATABASE_URL: { type: 'url' },
 * })
 * // env.PORT is number, env.DEBUG is boolean, etc.
 */
export function loadEnv<S extends Schema>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): Resolved<S> {
  const errors: string[] = []
  const result: Record<string, unknown> = {}

  for (const [key, spec] of Object.entries(schema)) {
    const raw = source[key]
    const required = spec.required !== false

    if (raw === undefined || raw === '') {
      if (spec.default !== undefined) {
        result[key] = spec.default
      } else if (required) {
        errors.push(`  • ${key}: missing required variable`)
      } else {
        result[key] = undefined
      }
      continue
    }

    try {
      result[key] = coerce(raw, spec.type)
    } catch (err) {
      errors.push(`  • ${key}: ${(err as Error).message}`)
    }
  }

  if (errors.length > 0) {
    throw new Error(`env-types: environment validation failed:\n${errors.join('\n')}`)
  }

  return result as Resolved<S>
}

// ── Entry-list based validation (used by the CLI) ─────────────────────────

export interface ValidationError {
  key: string
  message: string
}

/**
 * Validate `process.env` against a list of parsed `.env.example` entries.
 * Returns an array of errors (empty = valid).
 */
export function validateAgainstEntries(
  entries: EnvEntry[],
  source: Record<string, string | undefined> = process.env,
): ValidationError[] {
  const errors: ValidationError[] = []

  for (const entry of entries) {
    if (entry.isOptional) continue
    const val = source[entry.key]
    if (val === undefined || val === '') {
      errors.push({
        key: entry.key,
        message: `Required variable "${entry.key}" is missing or empty`,
      })
    }
  }

  return errors
}
