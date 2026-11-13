import { joinRoom, selfId } from 'trystero'
import type { DataPayload, MessageAction, Room } from 'trystero'

// The only file that talks to trystero. Same approach as Spellcallers:
// peer-to-peer over WebRTC, Nostr relays for the handshake, no server.

const APP_ID = 'yolkavision-2027'

export interface Net {
  readonly selfId: string
  send(name: string, payload: unknown, peerId?: string, metadata?: Record<string, string>): void
  on<T>(name: string, cb: (payload: T, peerId: string, metadata: Record<string, string>) => void): void
  /** Declares an action this side only sends, so incoming copies are ignored quietly. */
  declare(name: string): void
  peers(): string[]
  ping(peerId: string): Promise<number>
  connection(peerId: string): RTCPeerConnection | undefined
  onPeerJoin(cb: (peerId: string) => void): void
  onPeerLeave(cb: (peerId: string) => void): void
}

export function joinNet(code: string): Net {
  const room: Room = joinRoom({ appId: APP_ID }, code)
  const actions = new Map<string, MessageAction<DataPayload>>()
  const joinListeners: ((peerId: string) => void)[] = []
  const leaveListeners: ((peerId: string) => void)[] = []

  room.onPeerJoin = (peerId) => joinListeners.forEach((cb) => cb(peerId))
  room.onPeerLeave = (peerId) => leaveListeners.forEach((cb) => cb(peerId))

  function actionFor(name: string): MessageAction<DataPayload> {
    let action = actions.get(name)
    if (!action) {
      action = room.makeAction<DataPayload>(name)
      actions.set(name, action)
    }
    return action
  }

  return {
    selfId,
    send(name, payload, peerId, metadata) {
      const options: { target?: string; metadata?: Record<string, string> } = {}
      if (peerId) options.target = peerId
      if (metadata) options.metadata = metadata
      actionFor(name)
        .send(payload as DataPayload, options)
        .catch(() => {
          // The peer left between the check and the send. The next
          // join or leave event puts the screen right.
        })
    },
    on<T>(name: string, cb: (payload: T, peerId: string, metadata: Record<string, string>) => void) {
      actionFor(name).onMessage = (data, ctx) =>
        cb(data as T, ctx.peerId, (ctx.metadata ?? {}) as Record<string, string>)
    },
    declare(name) {
      actionFor(name)
    },
    peers() {
      return Object.keys(room.getPeers())
    },
    ping(peerId) {
      return room.ping(peerId)
    },
    connection(peerId) {
      return room.getPeers()[peerId]
    },
    onPeerJoin(cb) {
      joinListeners.push(cb)
    },
    onPeerLeave(cb) {
      leaveListeners.push(cb)
    },
  }
}
