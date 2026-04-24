import { describe, it, expect } from 'vitest'
import { parseEnvFile } from '../src/parser.js'

describe('parseEnvFile', () => {
  it('parses a simple KEY=value pair', () => {
    const [e] = parseEnvFile('PORT=3000')
    expect(e).toMatchObject({ key: 'PORT', rawValue: '3000', isOptional: false })
  })

  it('strips double quotes', () => {
    const [e] = parseEnvFile('DB_URL="postgres://localhost/db"')
    expect(e!.rawValue).toBe('postgres://localhost/db')
  })

  it('strips single quotes', () => {
    const [e] = parseEnvFile("SECRET='abc123'")
    expect(e!.rawValue).toBe('abc123')
  })

  it('marks empty value as optional', () => {
    const [e] = parseEnvFile('OPTIONAL_VAR=')
    expect(e!.isOptional).toBe(true)
  })

  it('marks empty quoted value as optional', () => {
    const [e] = parseEnvFile('OPTIONAL_VAR=""')
    expect(e!.isOptional).toBe(true)
  })

  it('parses description from comment line above', () => {
    const [e] = parseEnvFile('# Server port\nPORT=3000')
    expect(e!.description).toBe('Server port')
  })

  it('clears description on blank line between comment and key', () => {
    const [e] = parseEnvFile('# Server port\n\nPORT=3000')
    expect(e!.description).toBeNull()
  })

  it('strips inline comments', () => {
    const [e] = parseEnvFile('PORT=3000 # this is the port')
    expect(e!.rawValue).toBe('3000')
  })

  it('ignores comment-only lines', () => {
    const entries = parseEnvFile('# just a comment')
    expect(entries).toHaveLength(0)
  })

  it('ignores blank lines', () => {
    const entries = parseEnvFile('\n\n\n')
    expect(entries).toHaveLength(0)
  })

  it('ignores lines without =', () => {
    const entries = parseEnvFile('INVALID_LINE')
    expect(entries).toHaveLength(0)
  })

  it('ignores invalid key names', () => {
    const entries = parseEnvFile('123INVALID=value')
    expect(entries).toHaveLength(0)
  })

  it('parses multiple entries', () => {
    const entries = parseEnvFile('A=1\nB=2\nC=3')
    expect(entries).toHaveLength(3)
    expect(entries.map(e => e.key)).toEqual(['A', 'B', 'C'])
  })

  it('handles Windows-style CRLF line endings', () => {
    const entries = parseEnvFile('A=1\r\nB=2\r\n')
    expect(entries).toHaveLength(2)
  })

  it('supports the `export FOO=bar` shell-source prefix', () => {
    const [e] = parseEnvFile('export PORT=3000')
    expect(e).toMatchObject({ key: 'PORT', rawValue: '3000' })
  })

  it('does not treat `export` as part of the key', () => {
    const [e] = parseEnvFile('   export   API_KEY=abc')
    expect(e!.key).toBe('API_KEY')
    expect(e!.rawValue).toBe('abc')
  })

  describe('inline comments', () => {
    it('preserves `#` that lives inside double-quoted values', () => {
      const [e] = parseEnvFile('PWD="abc # def"')
      expect(e!.rawValue).toBe('abc # def')
    })

    it('preserves `#` that lives inside single-quoted values', () => {
      const [e] = parseEnvFile("PWD='abc # def'")
      expect(e!.rawValue).toBe('abc # def')
    })

    it('preserves `#` with no preceding whitespace (e.g. hash in password)', () => {
      const [e] = parseEnvFile('PWD=abc#def')
      expect(e!.rawValue).toBe('abc#def')
    })

    it('still strips a genuine space-prefixed inline comment', () => {
      const [e] = parseEnvFile('PORT=3000 # the port')
      expect(e!.rawValue).toBe('3000')
    })

    it('preserves URL fragments inside quoted values', () => {
      const [e] = parseEnvFile('URL="https://example.com/#section"')
      expect(e!.rawValue).toBe('https://example.com/#section')
    })
  })

  describe('type inference', () => {
    it('infers boolean for true/false', () => {
      expect(parseEnvFile('DEBUG=true')[0]!.inferredType).toBe('boolean')
      expect(parseEnvFile('DEBUG=false')[0]!.inferredType).toBe('boolean')
    })

    it('infers number for numeric values', () => {
      expect(parseEnvFile('PORT=3000')[0]!.inferredType).toBe('number')
      expect(parseEnvFile('RATE=1.5')[0]!.inferredType).toBe('number')
    })

    it('infers url for connection strings', () => {
      expect(parseEnvFile('DB=postgres://localhost/db')[0]!.inferredType).toBe('url')
      expect(parseEnvFile('REDIS=redis://localhost')[0]!.inferredType).toBe('url')
      expect(parseEnvFile('API=https://example.com')[0]!.inferredType).toBe('url')
    })

    it('infers json for JSON values', () => {
      expect(parseEnvFile('CONFIG={"a":1}')[0]!.inferredType).toBe('json')
      expect(parseEnvFile('ITEMS=["a","b"]')[0]!.inferredType).toBe('json')
    })

    it('infers string for plain text', () => {
      expect(parseEnvFile('NODE_ENV=development')[0]!.inferredType).toBe('string')
    })
  })
})
