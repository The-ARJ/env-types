import { describe, it, expect } from 'vitest'
import { loadEnv, validateAgainstEntries } from '../src/validator.js'
import { parseEnvFile } from '../src/parser.js'

describe('loadEnv', () => {
  it('returns typed values from source', () => {
    const env = loadEnv(
      { PORT: { type: 'number' }, DEBUG: { type: 'boolean' } },
      { PORT: '3000', DEBUG: 'true' },
    )
    expect(env.PORT).toBe(3000)
    expect(env.DEBUG).toBe(true)
  })

  it('coerces false boolean', () => {
    const env = loadEnv({ FLAG: { type: 'boolean' } }, { FLAG: 'false' })
    expect(env.FLAG).toBe(false)
  })

  it('coerces JSON', () => {
    const env = loadEnv({ CONFIG: { type: 'json' } }, { CONFIG: '{"a":1}' })
    expect(env.CONFIG).toEqual({ a: 1 })
  })

  it('passes through URL as string', () => {
    const env = loadEnv(
      { DB: { type: 'url' } },
      { DB: 'postgres://localhost/db' },
    )
    expect(env.DB).toBe('postgres://localhost/db')
  })

  it('uses default when variable is missing', () => {
    const env = loadEnv(
      { DEBUG: { type: 'boolean', required: false, default: false } },
      {},
    )
    expect(env.DEBUG).toBe(false)
  })

  it('throws consolidated error for missing required vars', () => {
    expect(() =>
      loadEnv({ PORT: { type: 'number' }, SECRET: { type: 'string' } }, {}),
    ).toThrow(/PORT.*missing|SECRET.*missing/s)
  })

  it('throws for invalid number', () => {
    expect(() =>
      loadEnv({ PORT: { type: 'number' } }, { PORT: 'not-a-number' }),
    ).toThrow(/expected a number/)
  })

  it('throws for invalid boolean', () => {
    expect(() =>
      loadEnv({ FLAG: { type: 'boolean' } }, { FLAG: 'yes' }),
    ).toThrow(/expected "true" or "false"/)
  })

  it('throws for invalid JSON', () => {
    expect(() =>
      loadEnv({ CONFIG: { type: 'json' } }, { CONFIG: '{invalid}' }),
    ).toThrow(/expected valid JSON/)
  })

  it('marks optional vars without default as undefined', () => {
    const env = loadEnv(
      { OPTIONAL: { type: 'string', required: false } },
      {},
    )
    expect(env.OPTIONAL).toBeUndefined()
  })

  it('types optional-without-default as T | undefined', () => {
    const env = loadEnv(
      { OPTIONAL: { type: 'string', required: false } },
      {},
    )
    // Compile-time assertion: must be assignable to `string | undefined`,
    // NOT to `string` alone. `@ts-expect-error` proves the type rejects it.
    const _narrow: string | undefined = env.OPTIONAL
    // @ts-expect-error — `undefined` is not assignable to `string`
    const _wide: string = env.OPTIONAL
    void _narrow; void _wide
  })

  it('rejects whitespace-only strings for number coercion', () => {
    expect(() =>
      loadEnv({ X: { type: 'number' } }, { X: '   ' }),
    ).toThrow(/expected a number/)
  })

  it('rejects Infinity for number coercion', () => {
    expect(() =>
      loadEnv({ X: { type: 'number' } }, { X: 'Infinity' }),
    ).toThrow(/expected a number/)
  })

  it('validates URL type and rejects garbage', () => {
    expect(() =>
      loadEnv({ X: { type: 'url' } }, { X: 'not-a-url' }),
    ).toThrow(/expected a valid URL/)
  })

  it('accepts valid URLs', () => {
    const env = loadEnv(
      { DB: { type: 'url' } },
      { DB: 'postgres://localhost:5432/db' },
    )
    expect(env.DB).toBe('postgres://localhost:5432/db')
  })
})

describe('validateAgainstEntries', () => {
  it('returns empty array when all required vars are set', () => {
    const entries = parseEnvFile('PORT=3000\nDEBUG=true')
    const errors = validateAgainstEntries(entries, { PORT: '8080', DEBUG: 'false' })
    expect(errors).toHaveLength(0)
  })

  it('returns error for missing required var', () => {
    const entries = parseEnvFile('PORT=3000')
    const errors = validateAgainstEntries(entries, {})
    expect(errors).toHaveLength(1)
    expect(errors[0]!.key).toBe('PORT')
  })

  it('ignores optional vars that are missing', () => {
    const entries = parseEnvFile('OPTIONAL=')
    const errors = validateAgainstEntries(entries, {})
    expect(errors).toHaveLength(0)
  })

  it('reports multiple missing vars', () => {
    const entries = parseEnvFile('A=1\nB=2\nC=3')
    const errors = validateAgainstEntries(entries, {})
    expect(errors).toHaveLength(3)
  })

  it('treats empty string value as missing', () => {
    const entries = parseEnvFile('PORT=3000')
    const errors = validateAgainstEntries(entries, { PORT: '' })
    expect(errors).toHaveLength(1)
  })
})
