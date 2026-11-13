import { joinNet, type Net } from './net'
import {
  ACTION,
  FEATURES,
  type AckMsg,
  type FeatureId,
  type JoinMsg,
  type LevelMsg,
  type StateMsg,
  type Status,
  type Statuses,
  type StatusMsg,
} from './protocol'
import { drawQr } from './qr'
import { clamp01, el, joinUrl, makeCode } from './util'

// The TV screen. Shows a QR code and one row per phone with a cell per
// feature: green works, red failed, grey unsupported, amber untested.

interface Row {
  pid: string
  peerId: string
  device: string
  inApp: boolean
  secure: boolean
  connected: boolean
  joins: number
  latency: number | null
  route: string
  statuses: Statuses
  clipUrl?: string
  selfieUrl?: string
}

const SYMBOL = { ok: '✓', fail: '✕', unsupported: '–', untested: '?' } as const

export function startHost(): void {
  const app = document.getElementById('app')!
  app.className = 'host'

  // Browsers block sound until the first click, and the Lab plays the
  // phones' recordings through the TV.
  const start = el('button', { class: 'big', textContent: 'Start the Phone Lab' })
  app.append(
    el('div', { class: 'gate' }, [
      el('h1', { textContent: 'Yolkavision Phone Lab' }),
      el('p', { textContent: 'This screen goes on the TV. Phones join with the QR code.' }),
      start,
    ]),
  )
  start.onclick = () => {
    app.replaceChildren()
    runHost(app)
  }
}

function runHost(app: HTMLElement): void {
  let code = sessionStorage.getItem('yv-room')
  if (!code) {
    code = makeCode()
    sessionStorage.setItem('yv-room', code)
  }
  const url = joinUrl(location.href, code)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  const net = joinNet(code)
  const rows = new Map<string, Row>()

  const qr = el('canvas', { width: 420, height: 420, class: 'qr' })
  drawQr(qr, url)
  const side = el('aside', {}, [
    el('h1', { textContent: 'Phone Lab' }),
    qr,
    el('p', { class: 'code', textContent: `Room ${code}` }),
    el('p', { class: 'hint', textContent: 'Scan with the phone camera. Do not open the link inside a chat app.' }),
  ])
  if (local) {
    side.append(
      el('p', {
        class: 'warn',
        textContent:
          'This page runs on localhost, so the QR code only works on this computer. Phones need the hosted HTTPS address.',
      }),
      el('a', { href: url, target: '_blank', textContent: 'Open a test phone in a new tab' }),
    )
  } else if (!window.isSecureContext) {
    side.append(
      el('p', { class: 'warn', textContent: 'This page is not on HTTPS. Phones will refuse motion and microphone.' }),
    )
  }

  const tbody = el('tbody')
  const table = el('table', {}, [
    el('thead', {}, [
      el('tr', {}, [el('th', { textContent: 'Phone' }), ...FEATURES.map((f) => el('th', { textContent: f.label }))]),
    ]),
    tbody,
  ])
  const empty = el('p', { class: 'empty', textContent: 'No phones yet.' })
  app.append(side, el('main', {}, [table, empty]))

  function rowByPeer(peerId: string): Row | undefined {
    for (const row of rows.values()) if (row.peerId === peerId) return row
    return undefined
  }

  function setStatus(row: Row, feature: FeatureId, status: Status): void {
    row.statuses[feature] = status
    render()
  }

  function cell(row: Row, feature: FeatureId): HTMLTableCellElement {
    const status = row.statuses[feature] ?? { state: 'untested' as const }
    const td = el('td', { class: `cell ${status.state}` }, [el('span', { class: 'sym', textContent: SYMBOL[status.state] })])
    if (status.detail) td.append(el('small', { textContent: status.detail }))
    if (feature === 'motion' || feature === 'mic') {
      td.append(el('div', { class: 'bar' }, [el('div', { id: `bar-${feature}-${row.pid}` })]))
    }
    if (feature === 'tilt') td.append(el('small', { id: `tilt-${row.pid}` }))
    if (feature === 'record' && row.clipUrl) {
      const replay = el('button', { textContent: 'Play' })
      replay.onclick = () => void new Audio(row.clipUrl).play()
      td.append(replay)
    }
    if (feature === 'selfie' && row.selfieUrl) td.append(el('img', { src: row.selfieUrl, alt: 'Selfie' }))
    return td
  }

  function render(): void {
    empty.hidden = rows.size > 0
    tbody.replaceChildren(
      ...[...rows.values()].map((row) => {
        const buzz = el('button', { textContent: 'Buzz', disabled: !row.connected })
        buzz.onclick = () => net.send(ACTION.buzz, {}, row.peerId)
        const facts = [
          row.connected ? 'connected' : 'disconnected',
          row.latency === null ? '' : `${row.latency} ms`,
          row.route,
          row.secure ? '' : 'no HTTPS',
          row.inApp ? 'in-app browser' : '',
        ].filter(Boolean)
        const who = el('td', { class: `who ${row.connected ? 'on' : 'off'}` }, [
          el('strong', { textContent: row.device }),
          el('small', { textContent: facts.join(' · ') }),
          buzz,
        ])
        return el('tr', {}, [who, ...FEATURES.map((f) => cell(row, f.id))])
      }),
    )
  }

  net.on<JoinMsg>(ACTION.join, (msg, peerId) => {
    let row = rows.get(msg.pid)
    if (row) {
      row.joins++
      row.statuses.rejoin = { state: 'ok', detail: msg.fresh ? 'after a reload' : 'same page' }
    } else {
      row = {
        pid: msg.pid,
        peerId,
        device: msg.device,
        inApp: msg.inApp,
        secure: msg.secure,
        connected: true,
        joins: 1,
        latency: null,
        route: '',
        statuses: {},
      }
      rows.set(msg.pid, row)
    }
    row.peerId = peerId
    row.connected = true
    row.device = msg.device
    row.inApp = msg.inApp
    row.secure = msg.secure
    const reply: StateMsg = { statuses: row.statuses }
    net.send(ACTION.state, reply, peerId)
    render()
  })

  net.on<StatusMsg>(ACTION.status, (msg, peerId) => {
    const row = rowByPeer(peerId)
    if (row) setStatus(row, msg.feature, { state: msg.state, detail: msg.detail })
  })

  net.on<LevelMsg>(ACTION.level, (msg, peerId) => {
    const row = rowByPeer(peerId)
    if (!row) return
    const shake = document.getElementById(`bar-motion-${row.pid}`)
    if (shake && msg.shake !== undefined) shake.style.width = `${clamp01(msg.shake / 30) * 100}%`
    const mic = document.getElementById(`bar-mic-${row.pid}`)
    if (mic && msg.mic !== undefined) mic.style.width = `${clamp01(msg.mic * 4) * 100}%`
    const tilt = document.getElementById(`tilt-${row.pid}`)
    if (tilt && msg.beta !== undefined && msg.gamma !== undefined) {
      tilt.textContent = `front-back ${Math.round(msg.beta)}°, left-right ${Math.round(msg.gamma)}°`
    }
  })

  net.on<ArrayBuffer | Uint8Array>(ACTION.clip, (data, peerId, meta) => {
    const row = rowByPeer(peerId)
    if (!row) return
    const mime = meta.mime || 'audio/webm'
    if (row.clipUrl) URL.revokeObjectURL(row.clipUrl)
    row.clipUrl = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
    const audio = new Audio(row.clipUrl)
    let settled = false
    const finish = (ok: boolean, detail: string) => {
      if (settled) return
      settled = true
      const ack: AckMsg = { feature: 'record', ok, detail }
      net.send(ACTION.ack, ack, peerId)
      setStatus(row, 'record', { state: ok ? 'ok' : 'fail', detail })
    }
    audio.oncanplaythrough = () => {
      audio.play().then(
        () => finish(true, `played on TV (${mime.split(';')[0]})`),
        () => finish(false, 'TV refused to play sound'),
      )
    }
    audio.onerror = () => finish(false, `TV cannot play ${mime.split(';')[0]}`)
    setTimeout(() => finish(false, 'TV could not load the clip'), 8000)
  })

  net.on<ArrayBuffer | Uint8Array>(ACTION.selfie, (data, peerId) => {
    const row = rowByPeer(peerId)
    if (!row) return
    if (row.selfieUrl) URL.revokeObjectURL(row.selfieUrl)
    const selfieUrl = URL.createObjectURL(new Blob([data as BlobPart], { type: 'image/jpeg' }))
    row.selfieUrl = selfieUrl
    const img = new Image()
    const finish = (ok: boolean, detail: string) => {
      const ack: AckMsg = { feature: 'selfie', ok, detail }
      net.send(ACTION.ack, ack, peerId)
      setStatus(row, 'selfie', { state: ok ? 'ok' : 'fail', detail })
    }
    img.onload = () => finish(true, `shown on TV (${img.naturalWidth}×${img.naturalHeight})`)
    img.onerror = () => finish(false, 'TV cannot show the photo')
    img.src = selfieUrl
  })

  net.onPeerLeave((peerId) => {
    const row = rowByPeer(peerId)
    if (!row) return
    row.connected = false
    row.latency = null
    render()
  })

  // Latency and route for every connected phone, every three seconds.
  setInterval(() => {
    for (const row of rows.values()) {
      if (!row.connected) continue
      net.ping(row.peerId).then(
        (ms) => {
          row.latency = Math.round(ms)
          render()
        },
        () => {},
      )
      void routeOf(net, row.peerId).then((route) => {
        row.route = route
      })
    }
  }, 3000)

  render()
}

/** How the phone reaches this computer: over the home network, straight across the internet, or through a relay. */
async function routeOf(net: Net, peerId: string): Promise<string> {
  const pc = net.connection(peerId)
  if (!pc) return ''
  try {
    const stats = await pc.getStats()
    const all: Record<string, string>[] = []
    stats.forEach((s) => all.push(s as Record<string, string>))
    const transport = all.find((s) => s.type === 'transport' && s.selectedCandidatePairId)
    const pair = all.find((s) => s.type === 'candidate-pair' && s.id === transport?.selectedCandidatePairId)
    if (!pair) return ''
    const kinds = [pair.localCandidateId, pair.remoteCandidateId].map(
      (id) => all.find((s) => s.id === id)?.candidateType ?? '',
    )
    if (kinds.includes('relay')) return 'via relay'
    if (kinds.every((k) => k === 'host')) return 'same network'
    return 'across the internet'
  } catch {
    return ''
  }
}
