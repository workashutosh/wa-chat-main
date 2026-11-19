import { useEffect, useCallback } from "react";

// Module-level AudioContext — reused across all calls, unlocked on first interaction
let audioCtx = null;
let audioUnlocked = false;

function ensureCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function unlockAudio() {
  if (audioUnlocked) return;
  try {
    const ctx = ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    // Play a 1-frame silent buffer — this satisfies the autoplay policy
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    audioUnlocked = true;
  } catch (_) {}
}

function playBeep() {
  try {
    const ctx = ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch (_) {}
}

function requestPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") Notification.requestPermission();
}

export function useNotifications() {
  useEffect(() => {
    requestPermission();
    // Unlock the AudioContext on the very first user gesture
    document.addEventListener("click", unlockAudio, { passive: true });
    document.addEventListener("keydown", unlockAudio, { passive: true });
    document.addEventListener("touchstart", unlockAudio, { passive: true });
    return () => {
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  const notify = useCallback(({ title, body, icon }) => {
    playBeep();

    // Browser notification only when tab is hidden
    if (document.visibilityState === "visible") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const n = new Notification(title, {
      body,
      icon: icon ?? "/favicon.ico",
      tag: "wa-message",
      renotify: true,
      silent: true,
    });
    n.onclick = () => { window.focus(); n.close(); };
  }, []);

  return notify;
}
