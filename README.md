# Yolkavision

A party game show for New Year 2027. It runs in a browser on the PC, shows on the TV over HDMI, and guests play from their phone browsers. No server: phones connect to the TV page peer-to-peer (trystero, same as Spellcallers).

Current state: the **Phone Lab** only. It tests which browser features work on each phone, so the games can be chosen on evidence.

## Run

- `npm run dev` : local address for development
- `npm run build` : deployable `dist/` folder
- `npm test` : unit tests

If `npm install` fails with "Cannot read properties of null (reading 'edgesOut')", keep the committed `package-lock.json`. A fresh install without it hit that npm bug on this machine.

## How it works

- Open the page without parameters: it is the TV. It picks a four-letter room and shows a QR code.
- Open the page with `?room=CODE`: it is a phone. Each card tests one feature and reports to the TV.
- The TV shows one row per phone: green works, red failed, grey unsupported, amber untested.
- A phone keeps its identity in local storage, so a reload or a dropped connection lands on the same row.

## Hosting

Phones need HTTPS for motion sensors and the microphone. `localhost` only works on the PC itself, so real phone tests need the built `dist/` on an HTTPS host such as GitHub Pages. Not deployed yet.

Nothing personal belongs in this repository. Names, photos and recordings exist only on the night, between the phones and the PC.

## Files

- `src/main.ts` : picks TV or phone from the address
- `src/host.ts` : TV screen
- `src/phone.ts` : phone page and the feature tests
- `src/net.ts` : the only file that talks to trystero
- `src/protocol.ts` : messages and the feature list
- `src/util.ts` : pure helpers, tested in `util.test.ts`
