// Transport actions — decouples the play/restart UI from the iframe
// it controls. Player.svelte registers a sender (postMessage to its
// preview iframe) on mount; any UI surface (Timeline header, keyboard
// shortcut, etc.) calls togglePlay() / restart() and the registered
// sender forwards the message to the iframe.
//
// We need this indirection because the transport buttons now live in
// the timeline header — outside the Player component — but the iframe
// they drive is owned by Player.

import { composition } from "./composition.svelte.js";

let send = (_msg) => {};

export function registerSender(fn) {
  send = fn;
  return () => {
    if (send === fn) send = (_msg) => {};
  };
}

export function togglePlay() {
  if (composition.playing) {
    composition.playing = false;
    send({ type: "pause" });
  } else {
    composition.playing = true;
    send({ type: "play" });
  }
}

export function restart() {
  composition.curTime = 0;
  composition.playing = false;
  send({ type: "restart" });
}

export function fmtTime(s) {
  if (!Number.isFinite(s) || s < 0) return "0:00.0";
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}
