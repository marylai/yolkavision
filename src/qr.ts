import qrcode from 'qrcode-generator'

/** Draws a QR code for `text` onto a square canvas. */
export function drawQr(canvas: HTMLCanvasElement, text: string): void {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const count = qr.getModuleCount()
  const quiet = 3 // light border the scanner needs
  const cell = Math.floor(canvas.width / (count + quiet * 2))
  const offset = Math.floor((canvas.width - cell * count) / 2)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) ctx.fillRect(offset + col * cell, offset + row * cell, cell, cell)
    }
  }
}
