import { joinNet } from './net'
import {
  ACTION,
  FEATURES,
  type AckMsg,
  type FeatureId,
  type JoinMsg,
  type LevelMsg,
  type State,
  type StateMsg,
  type Status,
  type Statuses,
  type StatusMsg,
} from './protocol'
import { deviceLabel, el, isInAppBrowser, magnitude, makeId, pickMime, rms } from './util'

// The phone page. Each card tests one browser feature for real and
// reports the result to the TV.

const HELP: Record<FeatureId, string> = {
  sound: 'Plays a beep from this phone.',
  motion: 'Shake detection. After enabling, shake the phone and watch the bar on the TV.',
  tilt: 'Tilt detection. Enabled together with motion.',
  mic: 'Loudness of your voice. After enabling, make noise and watch the bar on the TV.',
  record: 'Records three seconds and plays them on the TV.',
  selfie: 'Takes a photo with the front camera and shows it on the TV.',
  wake: 'Keeps the screen from switching off during a game.',
  vibrate: 'Makes the phone buzz.',
  speech: 'Speech recognition in the browser. Checked for presence only.',
  fullscreen: 'Hides the address bar. Checked for presence only.',
  rejoin: 'Lock the phone for ten seconds, unlock it, and see whether the TV shows you as connected again.',
}

type MaybePermission = { requestPermission?: () => Promise<string> }

export function startPhone(code: string): void {
  const app = document.getElementById('app')!
  app.className = 'phone'

  const pid = loadPid()
  const net = joinNet(code)
  const statuses: Statuses = {}
  let hostId: string | null = null
  let fresh = true
  const level: LevelMsg = {}
  let micStream: MediaStream | null = null

  const banner = el('p', { class: 'banner off', textContent: 'Looking for the TV…' })
  const list = el('div', { class: 'cards' })
  app.append(el('h1', { textContent: `Phone Lab · room ${code}` }), banner, list)

  const ua = navigator.userAgent
  if (isInAppBrowser(ua)) {
    app.insertBefore(
      el('p', { class: 'warn', textContent: 'This looks like a browser inside an app. Open the link in Safari or Chrome.' }),
      list,
    )
  }
  if (!window.isSecureContext) {
    app.insertBefore(
      el('p', { class: 'warn', textContent: 'This page is not on HTTPS. Motion and microphone will not work.' }),
      list,
    )
  }

  // --- cards -------------------------------------------------------------

  const cards = new Map<FeatureId, { root: HTMLElement; badge: HTMLElement; detail: HTMLElement; actions: HTMLElement }>()
  for (const f of FEATURES) {
    const badge = el('span', { class: 'badge untested', textContent: 'untested' })
    const detail = el('small', {})
    const actions = el('div', { class: 'actions' })
    const root = el('section', { class: 'card' }, [
      el('header', {}, [el('strong', { textContent: f.label }), badge]),
      el('p', { textContent: HELP[f.id] }),
      detail,
      actions,
    ])
    cards.set(f.id, { root, badge, detail, actions })
    list.append(root)
  }

  function setStatus(feature: FeatureId, state: State, detail = '', report = true): void {
    const status: Status = detail ? { state, detail } : { state }
    statuses[feature] = status
    const card = cards.get(feature)!
    card.badge.className = `badge ${state}`
    card.badge.textContent = state === 'ok' ? 'works' : state === 'fail' ? 'failed' : state
    card.detail.textContent = detail
    if (report && hostId) {
      const msg: StatusMsg = { feature, state, detail: detail || undefined }
      net.send(ACTION.status, msg, hostId)
    }
  }

  function button(feature: FeatureId, label: string, onClick: (btn: HTMLButtonElement) => void): HTMLButtonElement {
    const btn = el('button', { textContent: label })
    btn.onclick = () => {
      requestWake()
      onClick(btn)
    }
    cards.get(feature)!.actions.append(btn)
    return btn
  }

  // --- connection --------------------------------------------------------

  net.declare(ACTION.status)
  net.declare(ACTION.level)
  net.declare(ACTION.clip)
  net.declare(ACTION.selfie)

  function announce(peerId: string): void {
    const msg: JoinMsg = { pid, device: deviceLabel(ua), inApp: isInAppBrowser(ua), secure: window.isSecureContext, fresh }
    net.send(ACTION.join, msg, peerId)
  }
  // Every peer gets the announcement; only the TV answers it.
  net.on<JoinMsg>(ACTION.join, () => {})
  net.onPeerJoin(announce)

  net.on<StateMsg>(ACTION.state, (msg, peerId) => {
    hostId = peerId
    fresh = false
    banner.className = 'banner on'
    banner.textContent = 'Connected to the TV'
    // After a reload the TV still knows this phone's results.
    for (const f of FEATURES) {
      const known = msg.statuses[f.id]
      if (known && !statuses[f.id]) setStatus(f.id, known.state, known.detail, false)
    }
    // Sensors need a fresh tap after a reload, whatever the TV remembers.
    for (const [feature, status] of Object.entries(statuses) as [FeatureId, Status][]) {
      const msgOut: StatusMsg = { feature, state: status.state, detail: status.detail }
      net.send(ACTION.status, msgOut, peerId)
    }
  })

  net.onPeerLeave((peerId) => {
    if (peerId !== hostId) return
    hostId = null
    banner.className = 'banner off'
    banner.textContent = 'Lost the TV. Reconnecting…'
    scheduleRescue()
  })

  // If the connection does not come back by itself, reload the page.
  // The phone keeps its identity, so the TV row survives.
  let rescue: number | undefined
  function scheduleRescue(): void {
    clearTimeout(rescue)
    rescue = window.setTimeout(() => {
      if (hostId || document.visibilityState !== 'visible') return
      const last = Number(sessionStorage.getItem('yv-reload') ?? 0)
      if (Date.now() - last < 20000) return
      sessionStorage.setItem('yv-reload', String(Date.now()))
      location.reload()
    }, 8000)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    requestWake()
    if (!hostId) scheduleRescue()
    else net.ping(hostId).catch(() => scheduleRescue())
  })
  scheduleRescue()

  net.on<AckMsg>(ACTION.ack, (msg) => setStatus(msg.feature, msg.ok ? 'ok' : 'fail', msg.detail, false))

  net.on(ACTION.buzz, () => {
    document.body.classList.add('flash')
    setTimeout(() => document.body.classList.remove('flash'), 600)
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
    beep()
  })

  // Ten sensor readings a second, only while a sensor is on.
  setInterval(() => {
    if (!hostId || Object.keys(level).length === 0) return
    net.send(ACTION.level, { ...level }, hostId)
    level.shake = level.shake === undefined ? undefined : 0
  }, 100)

  // --- sound -------------------------------------------------------------

  let audioCtx: AudioContext | null = null
  function beep(): boolean {
    try {
      audioCtx ??= new AudioContext()
      void audioCtx.resume()
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.4)
      return true
    } catch {
      return false
    }
  }

  button('sound', 'Play a beep', () => {
    if (!beep()) return setStatus('sound', 'fail', 'the browser refused to make sound')
    const actions = cards.get('sound')!.actions
    if (actions.querySelector('.answer')) return
    const yes = el('button', { class: 'answer', textContent: 'I heard it' })
    const no = el('button', { class: 'answer', textContent: 'Silence' })
    yes.onclick = () => setStatus('sound', 'ok')
    no.onclick = () => setStatus('sound', 'fail', 'no sound. Check the mute switch and the volume')
    actions.append(yes, no)
  })

  // --- motion and tilt ---------------------------------------------------

  let motionOn = false
  button('motion', 'Enable motion', async (btn) => {
    if (motionOn) return
    if (typeof DeviceMotionEvent === 'undefined') {
      setStatus('motion', 'unsupported', 'no motion sensor in this browser')
      setStatus('tilt', 'unsupported', 'no motion sensor in this browser')
      return
    }
    try {
      // iPhones ask for permission, and only from a tap.
      for (const api of [DeviceMotionEvent, DeviceOrientationEvent] as unknown as MaybePermission[]) {
        if (typeof api?.requestPermission === 'function') {
          const answer = await api.requestPermission()
          if (answer !== 'granted') {
            setStatus('motion', 'fail', 'permission refused')
            setStatus('tilt', 'fail', 'permission refused')
            return
          }
        }
      }
    } catch (err) {
      setStatus('motion', 'fail', `permission error: ${String(err)}`)
      setStatus('tilt', 'fail', `permission error: ${String(err)}`)
      return
    }
    motionOn = true
    btn.disabled = true
    let gotMotion = false
    let gotTilt = false
    window.addEventListener('devicemotion', (e) => {
      const a = e.acceleration
      const g = e.accelerationIncludingGravity
      let shake: number | null = null
      if (a && a.x !== null && a.y !== null && a.z !== null) shake = magnitude(a.x, a.y, a.z)
      else if (g && g.x !== null && g.y !== null && g.z !== null) shake = Math.abs(magnitude(g.x, g.y, g.z) - 9.81)
      if (shake === null) return
      if (!gotMotion) {
        gotMotion = true
        setStatus('motion', 'ok', a && a.x !== null ? 'sensor data arrives' : 'sensor data arrives (with gravity)')
      }
      level.shake = Math.max(level.shake ?? 0, shake)
    })
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta === null || e.gamma === null) return
      if (!gotTilt) {
        gotTilt = true
        setStatus('tilt', 'ok', 'sensor data arrives')
      }
      level.beta = e.beta
      level.gamma = e.gamma
    })
    setTimeout(() => {
      if (!gotMotion) setStatus('motion', 'fail', 'no sensor data after three seconds')
      if (!gotTilt) setStatus('tilt', 'fail', 'no sensor data after three seconds')
    }, 3000)
  })

  // --- microphone and recording -------------------------------------------

  button('mic', 'Enable microphone', async (btn) => {
    if (micStream) return
    if (!navigator.mediaDevices?.getUserMedia) {
      return setStatus('mic', window.isSecureContext ? 'unsupported' : 'fail', 'no microphone access in this browser')
    }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      return setStatus('mic', 'fail', `refused: ${err instanceof Error ? err.name : String(err)}`)
    }
    btn.disabled = true
    audioCtx ??= new AudioContext()
    void audioCtx.resume()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 1024
    audioCtx.createMediaStreamSource(micStream).connect(analyser)
    const frame = new Float32Array(analyser.fftSize)
    setInterval(() => {
      analyser.getFloatTimeDomainData(frame)
      level.mic = rms(frame)
    }, 80)
    setStatus('mic', 'ok', 'microphone is on')
    recordBtn.disabled = false
  })

  const recordBtn = button('record', 'Record three seconds', (btn) => {
    if (!micStream) return
    if (typeof MediaRecorder === 'undefined') return setStatus('record', 'unsupported', 'no recorder in this browser')
    if (!hostId) return setStatus('record', 'fail', 'not connected to the TV')
    const mime = pickMime((m) => MediaRecorder.isTypeSupported(m))
    let recorder: MediaRecorder
    try {
      recorder = mime ? new MediaRecorder(micStream, { mimeType: mime }) : new MediaRecorder(micStream)
    } catch (err) {
      return setStatus('record', 'fail', `recorder error: ${String(err)}`)
    }
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => chunks.push(e.data)
    recorder.onstop = async () => {
      btn.disabled = false
      const type = recorder.mimeType || mime || 'audio/webm'
      const blob = new Blob(chunks, { type })
      if (blob.size === 0) return setStatus('record', 'fail', 'the recording is empty')
      if (!hostId) return setStatus('record', 'fail', 'lost the TV while recording')
      setStatus('record', 'untested', `sent ${Math.round(blob.size / 1024)} KB, waiting for the TV`, false)
      net.send(ACTION.clip, await blob.arrayBuffer(), hostId, { mime: type })
      waitForAck('record')
    }
    btn.disabled = true
    setStatus('record', 'untested', 'recording… say something', false)
    recorder.start()
    setTimeout(() => recorder.stop(), 3000)
  })
  recordBtn.disabled = true

  function waitForAck(feature: 'record' | 'selfie'): void {
    setTimeout(() => {
      if (statuses[feature]?.state === 'untested') setStatus(feature, 'fail', 'the TV did not confirm within 15 seconds')
    }, 15000)
  }

  // --- selfie ------------------------------------------------------------

  const picker = el('input', { type: 'file', accept: 'image/*', hidden: true })
  picker.setAttribute('capture', 'user')
  picker.onchange = async () => {
    const file = picker.files?.[0]
    picker.value = ''
    if (!file) return
    if (!hostId) return setStatus('selfie', 'fail', 'not connected to the TV')
    try {
      const small = await shrink(file, 640)
      setStatus('selfie', 'untested', `sent ${Math.round(small.size / 1024)} KB, waiting for the TV`, false)
      net.send(ACTION.selfie, await small.arrayBuffer(), hostId)
      waitForAck('selfie')
    } catch (err) {
      setStatus('selfie', 'fail', `could not read the photo: ${String(err)}`)
    }
  }
  cards.get('selfie')!.root.append(picker)
  button('selfie', 'Take a selfie', () => picker.click())

  // --- wake lock, vibration, presence checks -------------------------------

  function requestWake(): void {
    // Asked on every tap and after every return to the page: the browser
    // releases the lock whenever the page is hidden.
    if (!('wakeLock' in navigator)) {
      if (statuses.wake?.state !== 'unsupported') setStatus('wake', 'unsupported', 'needs a fallback on this phone')
      return
    }
    if (document.visibilityState !== 'visible') return
    navigator.wakeLock.request('screen').then(
      () => {
        if (statuses.wake?.state !== 'ok') setStatus('wake', 'ok', 'screen stays on')
      },
      (err) => {
        // A refusal while the page is hidden says nothing about the phone.
        if (document.visibilityState !== 'visible') return
        setStatus('wake', 'fail', `refused: ${err instanceof Error ? err.name : String(err)}`)
      },
    )
  }
  button('wake', 'Keep the screen on', () => {})

  button('vibrate', 'Buzz', () => {
    if (!('vibrate' in navigator)) return setStatus('vibrate', 'unsupported', 'this browser cannot vibrate')
    navigator.vibrate(300)
    const actions = cards.get('vibrate')!.actions
    if (actions.querySelector('.answer')) return
    const yes = el('button', { class: 'answer', textContent: 'I felt it' })
    const no = el('button', { class: 'answer', textContent: 'Nothing' })
    yes.onclick = () => setStatus('vibrate', 'ok')
    no.onclick = () => setStatus('vibrate', 'fail', 'no buzz. Silent mode can block it')
    actions.append(yes, no)
  })
  if (!('vibrate' in navigator)) setStatus('vibrate', 'unsupported', 'this browser cannot vibrate')

  const speech = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  setStatus('speech', speech ? 'ok' : 'unsupported', speech ? 'present, accuracy not tested' : 'not in this browser')

  const fullscreen = typeof document.documentElement.requestFullscreen === 'function'
  setStatus('fullscreen', fullscreen ? 'ok' : 'unsupported', fullscreen ? 'present' : 'not in this browser')
}

function loadPid(): string {
  try {
    const saved = localStorage.getItem('yv-pid')
    if (saved) return saved
    const id = makeId()
    localStorage.setItem('yv-pid', id)
    return id
  } catch {
    return makeId() // private mode: a new identity on every load
  }
}

/** Scales a photo down so its longer side is `max` pixels and returns it as JPEG. */
async function shrink(file: File, max: number): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('not an image'))
      img.src = url
    })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode'))), 'image/jpeg', 0.8),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
