import './style.css'

// One page, two roles. With ?room=CODE the page is a phone controller;
// without it the page is the TV screen that hosts a room.
const room = new URLSearchParams(location.search).get('room')
if (room) {
  void import('./phone').then((m) => m.startPhone(room.toUpperCase()))
} else {
  void import('./host').then((m) => m.startHost())
}
