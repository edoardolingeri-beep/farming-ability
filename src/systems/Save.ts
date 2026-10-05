import { newGame, type GameState } from './State';

const KEY = 'valle-girasole/save/v3';
const OLD_KEY = 'valle-girasole/save/v2';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage unavailable (private mode, blocked): play without persistence.
    return null;
  }
}

/** Loads the saved game, repairing anything that no longer matches the data files. */
export function loadGame(): { state: GameState; fresh: boolean } {
  const raw = read(KEY);
  const old = raw ? null : read(OLD_KEY);
  if (!raw && !old) return { state: newGame(), fresh: true };
  try {
    const base = newGame();
    // Older saves kept plain counts of wheat.
    const parsed = raw
      ? (JSON.parse(raw) as GameState)
      : (() => {
          const v2 = JSON.parse(old!);
          return { ...v2, carry: new Array(v2.carry ?? 0).fill('wheat'), shelf: { wheat: v2.shelf ?? 0, flour: 0 }, earned: v2.coins ?? 0 } as GameState;
        })();
    const plots = { ...base.plots };
    for (const id of Object.keys(plots)) {
      const saved = parsed.plots?.[id];
      if (Array.isArray(saved) && saved.length === plots[id].length) plots[id] = saved;
    }
    const state: GameState = {
      ...base,
      ...parsed,
      version: 3,
      carry: Array.isArray(parsed.carry) ? parsed.carry.filter((t) => t === 'wheat' || t === 'flour') : [],
      shelf: { ...base.shelf, ...parsed.shelf },
      mill: { ...base.mill, ...parsed.mill },
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
    localStorage.removeItem(OLD_KEY);
  } catch {
    // ignore
  }
}
