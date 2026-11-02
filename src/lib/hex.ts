const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

export interface HexRow {
  offset: string
  hex: string
  ascii: string
}

export function hexRow(b: Uint8Array, row: number, width = 16): HexRow {
  const start = row * width
  const end = Math.min(start + width, b.length)
  let hex = ''
  let ascii = ''
  for (let i = start; i < start + width; i++) {
    if (i < end) {
      const c = b[i]!
      hex += HEX[c] + (i - start === 7 ? '  ' : ' ')
      ascii += c >= 32 && c < 127 ? String.fromCharCode(c) : '.'
    } else hex += i - start === 7 ? '    ' : '   '
  }
  return { offset: start.toString(16).padStart(8, '0'), hex, ascii }
}
