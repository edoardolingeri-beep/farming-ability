import { newGame, type GameState } from './State';

const KEY = 'valle-girasole/save/v2';

/** Loads the saved game, repairing anything that no longer matches the data files. */
export function loadGame(): { state: GameState; fresh: boolean } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Storage unavailable (private mode, blocked): play without persistence.
  }
  if (!raw) return { state: newGame(), fresh: true };
  try {
    const parsed = JSON.parse(raw) as GameState;
    const base = newGame();
    const plots = { ...base.plots };
    for (const id of Object.keys(plots)) {
      const saved = parsed.plots?.[id];
      if (Array.isArray(saved) && saved.length === plots[id].length) plots[id] = saved;
    }
    const state: GameState = {
      ...base,
      ...parsed,
      version: 2,
      padPaid: { ...parsed.padPaid },
      unlocked: [...(parsed.unlocked ?? [])],
      plots,
    };
    return { state, fresh: false };
  } catch {
    return { state: newGame(), fresh: true };
  }
}

export function saveGame(state: GameState) {
  state.savedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Ignore quota / unavailable storage.
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
