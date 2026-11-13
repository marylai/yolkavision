import { describe, expect, it } from 'vitest'
import { clamp01, deviceLabel, isInAppBrowser, joinUrl, magnitude, makeCode, pickMime, rms } from './util'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const ANDROID_SAMSUNG =
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36'
const INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0'
const ANDROID_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36'
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

describe('makeCode', () => {
  it('makes four letters without I or O', () => {
    for (let i = 0; i < 200; i++) expect(makeCode()).toMatch(/^[A-HJ-NP-Z]{4}$/)
  })
  it('uses the random source it is given', () => {
    expect(makeCode(() => 0)).toBe('AAAA')
  })
})

describe('deviceLabel', () => {
  it('names iPhones with their browser', () => {
    expect(deviceLabel(IPHONE_SAFARI)).toBe('iPhone, iOS 17, Safari')
    expect(deviceLabel(IPHONE_CHROME)).toBe('iPhone, iOS 18, Chrome')
  })
  it('names Android phones with their browser', () => {
    expect(deviceLabel(ANDROID_CHROME)).toBe('Android 14, Chrome')
    expect(deviceLabel(ANDROID_SAMSUNG)).toBe('Android 13, Samsung Internet')
  })
  it('names computers', () => {
    expect(deviceLabel(DESKTOP_CHROME)).toBe('Computer, Chrome')
  })
})

describe('isInAppBrowser', () => {
  it('flags browsers inside apps', () => {
    expect(isInAppBrowser(INSTAGRAM)).toBe(true)
    expect(isInAppBrowser(ANDROID_WEBVIEW)).toBe(true)
  })
  it('passes real browsers', () => {
    expect(isInAppBrowser(IPHONE_SAFARI)).toBe(false)
    expect(isInAppBrowser(ANDROID_CHROME)).toBe(false)
    expect(isInAppBrowser(DESKTOP_CHROME)).toBe(false)
  })
})

describe('signal maths', () => {
  it('magnitude is the vector length', () => {
    expect(magnitude(3, 4, 0)).toBe(5)
  })
  it('rms of silence is 0 and of full scale is 1', () => {
    expect(rms([0, 0, 0])).toBe(0)
    expect(rms([1, -1, 1, -1])).toBe(1)
    expect(rms([])).toBe(0)
  })
  it('clamp01 keeps values inside 0 to 1', () => {
    expect(clamp01(-2)).toBe(0)
    expect(clamp01(0.4)).toBe(0.4)
    expect(clamp01(7)).toBe(1)
  })
})

describe('pickMime', () => {
  it('prefers opus in webm', () => {
    expect(pickMime(() => true)).toBe('audio/webm;codecs=opus')
  })
  it('falls back to mp4 on iPhones', () => {
    expect(pickMime((m) => m === 'audio/mp4')).toBe('audio/mp4')
  })
  it('returns an empty string when nothing matches', () => {
    expect(pickMime(() => false)).toBe('')
  })
})

describe('joinUrl', () => {
  it('adds the room and drops other parameters', () => {
    expect(joinUrl('https://example.github.io/yolkavision/?x=1#top', 'ABCD')).toBe(
      'https://example.github.io/yolkavision/?room=ABCD',
    )
  })
})
