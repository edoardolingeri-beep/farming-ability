/** Minimal tween runner driven by the game loop. */
interface Tween {
  t: number;
  dur: number;
  update: (k: number) => void;
  done?: () => void;
}

const active: Tween[] = [];

export function tween(dur: number, update: (k: number) => void, done?: () => void) {
  active.push({ t: 0, dur, update, done });
}

export function updateTweens(dt: number) {
  for (let i = active.length - 1; i >= 0; i--) {
    const tw = active[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.update(k);
    if (k >= 1) {
      active.splice(i, 1);
      tw.done?.();
    }
  }
}

export const ease = {
  outCubic: (k: number) => 1 - Math.pow(1 - k, 3),
  inCubic: (k: number) => k * k * k,
  outBack: (k: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  },
  outElastic: (k: number) =>
    k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};
