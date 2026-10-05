import { CROPS, newGame, type GameState } from './State';

const KEY = 'valle-girasole/save/v1';

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
    const state: GameState = {
      ...base,
      ...parsed,
      inventory: { ...parsed.inventory },
      fields: base.fields.map((f, i) => {
        const saved = parsed.fields?.[i];
        return saved && (saved.crop === null || saved.crop in CROPS) ? { ...saved } : f;
      }),
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
