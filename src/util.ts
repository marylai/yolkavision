// Pure helpers, covered by util.test.ts.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I or O: they read as 1 and 0

export function makeCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  return code
}

export function makeId(random: () => number = Math.random): string {
  return Array.from({ length: 12 }, () => Math.floor(random() * 36).toString(36)).join('')
}

/** "iPhone, iOS 17, Safari" from a user agent string. */
export function deviceLabel(ua: string): string {
  const ios = /(iPhone|iPad|iPod).*? OS (\d+)_/.exec(ua)
  if (ios) {
    const browser = /CriOS/.test(ua) ? 'Chrome' : /FxiOS/.test(ua) ? 'Firefox' : /EdgiOS/.test(ua) ? 'Edge' : 'Safari'
    return `${ios[1]}, iOS ${ios[2]}, ${browser}`
  }
  const android = /Android (\d+)/.exec(ua)
  if (android) {
    const browser = /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /Firefox/.test(ua)
        ? 'Firefox'
        : /EdgA/.test(ua)
          ? 'Edge'
          : 'Chrome'
    return `Android ${android[1]}, ${browser}`
  }
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox/.test(ua)
        ? 'Firefox'
        : /Chrome/.test(ua)
          ? 'Chrome'
          : /Safari/.test(ua)
            ? 'Safari'
            : 'unknown browser'
  return `Computer, ${browser}`
}

/** Browsers embedded in chat and social apps often block the microphone and motion sensors. */
export function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|TikTok|Telegram|; wv\)/.test(ua)
}

export function magnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z)
}

/** Loudness of one audio frame, 0 (silence) to 1 (full scale). */
export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** First recording format the browser supports; '' lets the browser choose. */
export function pickMime(isSupported: (mime: string) => boolean): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg']
  return candidates.find((m) => isSupported(m)) ?? ''
}

/** The address a phone opens to join this room. */
export function joinUrl(href: string, code: string): string {
  const url = new URL(href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('room', code)
  return url.toString()
}

/** Tiny DOM builder. Text goes in as text nodes, never as HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  const { class: className, ...rest } = props
  if (className) node.className = className
  Object.assign(node, rest)
  for (const child of children) node.append(child)
  return node
}
