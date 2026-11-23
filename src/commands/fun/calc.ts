import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !calc <expression> — safe calculator. No eval(): a small recursive-descent
 * parser handles + - * / % ^, parentheses, unary minus, and a few functions
 * (sqrt, abs, sin, cos, tan, log, floor, ceil, round). Anything else is
 * rejected instead of executed.
 */

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round
}

class CalcError extends Error {}

function tokenize(expr: string): string[] {
  const tokens: string[] = []
  const re = /\s*([0-9]*\.?[0-9]+|[A-Za-z]+|[+\-*/%^()])\s*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(expr)) !== null) {
    if (match.index !== lastIndex) throw new CalcError('Could not read that expression.')
    tokens.push(match[1])
    lastIndex = re.lastIndex
  }
  if (lastIndex !== expr.length || tokens.length === 0) {
    throw new CalcError('Could not read that expression.')
  }
  return tokens
}

function parse(tokens: string[]): number {
  let pos = 0
  const peek = (): string | undefined => tokens[pos]
  const next = (): string | undefined => tokens[pos++]

  function parseExpr(): number {
    let v = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = next()
      const rhs = parseTerm()
      v = op === '+' ? v + rhs : v - rhs
    }
    return v
  }

  function parseTerm(): number {
    let v = parseFactor()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next()
      const rhs = parseFactor()
      if (op === '*') v *= rhs
      else if (op === '/') {
        if (rhs === 0) throw new CalcError('Cannot divide by zero.')
        v /= rhs
      } else {
        if (rhs === 0) throw new CalcError('Cannot divide by zero.')
        v %= rhs
      }
    }
    return v
  }

  function parseFactor(): number {
    const base = parseUnary()
    if (peek() === '^') {
      next()
      return Math.pow(base, parseFactor()) // right-associative
    }
    return base
  }

  function parseUnary(): number {
    if (peek() === '-') {
      next()
      return -parseUnary()
    }
    if (peek() === '+') {
      next()
      return parseUnary()
    }
    return parsePrimary()
  }

  function parsePrimary(): number {
    const tok = next()
    if (tok === undefined) throw new CalcError('Unexpected end of expression.')
    if (tok === '(') {
      const v = parseExpr()
      if (next() !== ')') throw new CalcError('Missing closing bracket.')
      return v
    }
    if (/^[0-9]*\.?[0-9]+$/.test(tok)) return parseFloat(tok)
    if (/^[A-Za-z]+$/.test(tok)) {
      const fn = FUNCTIONS[tok.toLowerCase()]
      if (!fn) throw new CalcError(`I do not know the function "${tok}".`)
      if (next() !== '(') throw new CalcError(`"${tok}" needs brackets, e.g. ${tok}(16).`)
      const v = parseExpr()
      if (next() !== ')') throw new CalcError('Missing closing bracket.')
      return fn(v)
    }
    throw new CalcError(`Unexpected "${tok}".`)
  }

  const result = parseExpr()
  if (pos !== tokens.length) throw new CalcError('Extra characters after the expression.')
  return result
}

function formatResult(v: number): string {
  if (!Number.isFinite(v)) throw new CalcError('That gives no usable number.')
  const rounded = Math.round(v * 1e10) / 1e10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  const expr = args.join(' ').trim()
  if (!expr) {
    return m.reply(
      'Give me something to calculate.\n\nExample: *!calc (12 + 8) * 3*\nExample: *!calc sqrt(144) + 2^3*'
    )
  }
  if (expr.length > 200) return m.reply('That expression is too long (max 200 characters).')
  try {
    const value = parse(tokenize(expr))
    return m.reply(`*🧮 CALC*\n\n${expr} = *${formatResult(value)}*`)
  } catch (e) {
    if (e instanceof CalcError) return m.reply(`${e.message}\n\nTry something like *!calc (12 + 8) * 3*`)
    console.error('Error in calc command:', e)
    return m.reply('Something went wrong while calculating that.')
  }
}

export default {
  pattern: /^(calc|calculate|math)$/i,
  handler,
  help: 'Safe calculator, no eval (!calc (12 + 8) * 3)',
  usage: '!calc <expression>',
  example: '!calc (12 + 8) * 3',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
