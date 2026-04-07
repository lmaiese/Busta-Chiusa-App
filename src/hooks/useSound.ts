import { useState, useCallback } from 'react';

const STORAGE_KEY = 'bustachiusa_sounds_enabled';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playBellSound(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(660, now + 0.4);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now);
    osc2.frequency.exponentialRampToValueAtTime(990, now + 0.4);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    osc1.start(now);
    osc1.stop(now + 1.4);
    osc2.start(now);
    osc2.stop(now + 1.4);
  } catch {
    // Audio not supported
  }
}

export function useSound() {
  const [soundsEnabled, setSoundsEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const toggleSounds = useCallback(() => {
    setSoundsEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const playBell = useCallback(() => {
    if (!soundsEnabled) return;
    playBellSound();
    try { navigator.vibrate?.([150, 50, 150]); } catch {}
  }, [soundsEnabled]);

  return { soundsEnabled, toggleSounds, playBell };
}
