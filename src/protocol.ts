// Messages between the TV (host) and the phones. Action names stay
// under 12 bytes, a trystero limit.

export const FEATURES = [
  { id: 'sound', label: 'Sound' },
  { id: 'motion', label: 'Motion' },
  { id: 'tilt', label: 'Tilt' },
  { id: 'mic', label: 'Mic' },
  { id: 'record', label: 'Recording' },
  { id: 'selfie', label: 'Selfie' },
  { id: 'wake', label: 'Stay awake' },
  { id: 'vibrate', label: 'Vibration' },
  { id: 'speech', label: 'Speech' },
  { id: 'fullscreen', label: 'Fullscreen' },
  { id: 'rejoin', label: 'Rejoin' },
] as const

export type FeatureId = (typeof FEATURES)[number]['id']
export type State = 'untested' | 'ok' | 'fail' | 'unsupported'

export interface Status {
  state: State
  detail?: string
}

export type Statuses = Partial<Record<FeatureId, Status>>

/** phone -> everyone on peer join; only the host answers. */
export interface JoinMsg {
  pid: string
  device: string
  inApp: boolean
  secure: boolean
  /** true on the first join after a page load, false on a rejoin from the same page. */
  fresh: boolean
}

/** host -> phone, answer to JoinMsg. Tells the phone who the host is. */
export interface StateMsg {
  statuses: Statuses
}

/** phone -> host */
export interface StatusMsg {
  feature: FeatureId
  state: State
  detail?: string
}

/** phone -> host, about ten times a second while a sensor is on. */
export interface LevelMsg {
  shake?: number
  beta?: number
  gamma?: number
  mic?: number
}

/** host -> phone, result of playing a clip or showing a selfie. */
export interface AckMsg {
  feature: 'record' | 'selfie'
  ok: boolean
  detail: string
}

export const ACTION = {
  join: 'join',
  state: 'state',
  status: 'status',
  level: 'level',
  clip: 'clip',
  selfie: 'selfie',
  ack: 'ack',
  buzz: 'buzz',
} as const
