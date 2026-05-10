// lib/zpl.ts
// ZPL (Zebra Programming Language) generator for the GX430T thermal printer.
//
// Label spec:
//   - 2" wide × 1" tall (203 dpi → 406 × 203 dots, but we use 400 × 200 for safe margins)
//   - Left half: QR code (~180 dots square, scannable from 18+ inches)
//   - Right half top: human-readable label (e.g., "Pink HBD Letter A")
//   - Right half bottom: plain text SKU (e.g., "HBD-PINK-LG-001")
//
// The GX430T is a 203 dpi printer. Coordinates are in dots:
//   1 inch = 203 dots
//   2 inches = 406 dots
//
// ZPL command reference:
//   ^XA            start label
//   ^XZ            end label
//   ^FOx,y         field origin (top-left coordinate of the next element)
//   ^BQ            QR code: ^BQN,2,M  (model 2, magnification M)
//   ^FDLA,DATA^FS  QR field data (LA = error correction L, A = mode auto)
//   ^A0N,h,w       font: scalable font 0, normal rotation, height h, width w
//   ^FDtext^FS     plain text field data
//   ^PQ1           print 1 copy
//   ^MMT           media type: thermal transfer (matches your resin ribbon)
//   ^PW406         print width 406 dots (2 inches)
//   ^LL203         label length 203 dots (1 inch)

interface ZplLabelInput {
  /** The full URL the QR encodes (built via buildQrUrl()) */
  qrPayload: string
  /** Human-readable label (e.g., "Pink HBD Letter A") — max ~18 chars before wrap */
  labelName: string
  /** SKU/barcode text (e.g., "HBD-PINK-LG-001") — printed below label */
  sku: string
  /** How many copies to print (default 1) */
  copies?: number
}

/**
 * Truncates a string to maxLen, adding ellipsis if cut.
 */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + '…'
}

/**
 * Wraps long text onto two lines for the right-side label area.
 * Returns [line1, line2 or empty].
 */
function wrapLabel(text: string, maxPerLine: number = 14): [string, string] {
  if (text.length <= maxPerLine) return [text, '']
  // Try to break at a space near the middle
  const breakPoint = text.lastIndexOf(' ', maxPerLine)
  if (breakPoint > 0) {
    return [text.slice(0, breakPoint), truncate(text.slice(breakPoint + 1), maxPerLine)]
  }
  // No good space — hard truncate
  return [text.slice(0, maxPerLine), truncate(text.slice(maxPerLine), maxPerLine)]
}

/**
 * Generates a complete ZPL label for a single piece.
 * The output is plain text that gets POSTed to a Zebra Browser Print endpoint.
 */
export function generateZpl(input: ZplLabelInput): string {
  const copies = Math.max(1, Math.min(input.copies || 1, 50)) // cap at 50

  // Wrap the human-readable label across up to 2 lines
  const [labelLine1, labelLine2] = wrapLabel(input.labelName, 14)

  // Truncate SKU if absurdly long (shouldn't happen, but defensive)
  const sku = truncate(input.sku, 20)

  // Layout coordinates (203 dpi, 2"×1" = 406×203 dots)
  // QR code: left side, vertically centered
  const qrX = 12
  const qrY = 18
  const qrMagnification = 5 // produces ~165 dot square QR with mode 'A'

  // Right-side text area starts at x = 200 (just past the QR)
  const textX = 205
  const labelLine1Y = 20
  const labelLine2Y = 60
  const skuY = 130

  const lines: string[] = [
    '^XA',                          // start
    '^MMT',                         // thermal transfer mode
    '^PW406',                       // print width 2"
    '^LL203',                       // label length 1"
    '^LH0,0',                       // label home origin
    '^CI28',                        // UTF-8 encoding (so ° accents etc. work)

    // QR code
    `^FO${qrX},${qrY}`,
    `^BQN,2,${qrMagnification}`,
    `^FDLA,${input.qrPayload}^FS`,

    // Label name line 1 (right side, top)
    `^FO${textX},${labelLine1Y}`,
    `^A0N,32,32`,                   // font 0, 32x32 px
    `^FD${labelLine1}^FS`,
  ]

  // Label name line 2 (only if wrap occurred)
  if (labelLine2) {
    lines.push(`^FO${textX},${labelLine2Y}`)
    lines.push(`^A0N,32,32`)
    lines.push(`^FD${labelLine2}^FS`)
  }

  // Divider line between label name and SKU
  lines.push(`^FO${textX},${skuY - 12}`)
  lines.push(`^GB180,1,1^FS`)       // graphic box: 180 wide, 1 tall, 1 thick

  // SKU text (right side, bottom, monospace style font)
  lines.push(`^FO${textX},${skuY}`)
  lines.push(`^A0N,24,24`)
  lines.push(`^FD${sku}^FS`)

  // Print copies and end
  lines.push(`^PQ${copies}`)
  lines.push('^XZ')

  return lines.join('\n')
}

/**
 * Generates ZPL for printing multiple pieces in one batch.
 * Each piece gets its own ^XA...^XZ block; the printer cuts between them.
 */
export function generateZplBatch(inputs: ZplLabelInput[]): string {
  return inputs.map(i => generateZpl(i)).join('\n')
}
