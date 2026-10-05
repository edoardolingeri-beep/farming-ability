import { iconImg, type IconId } from './icons';

const fmt = new Intl.NumberFormat('it-IT');

interface Counter {
  el: HTMLElement;
  value: HTMLElement;
  /** Number currently shown (lags behind the real value while items fly in). */
  shown: number;
}

/** Top bar with currency/resource counters that bump when items land on them. */
export class Hud {
  readonly root: HTMLElement;
  private counters = new Map<string, Counter>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-top';
    parent.appendChild(this.root);
  }

  addCounter(key: string, icon: IconId, initial: number) {
    const el = document.createElement('div');
    el.className = 'pill interactive';
    el.appendChild(iconImg(icon));
    const value = document.createElement('span');
    value.textContent = fmt.format(initial);
    el.appendChild(value);
    this.root.appendChild(el);
    this.counters.set(key, { el, value, shown: initial });
  }

  private levelEl: HTMLElement | null = null;
  private levelNum: HTMLElement | null = null;
  private levelBar: HTMLElement | null = null;

  /** Star badge with the level number and a progress bar toward the next level. */
  addLevel() {
    const el = document.createElement('div');
    el.className = 'level interactive';
    el.innerHTML = `<div class="level-star"><span></span></div><div class="level-bar"><i></i></div>`;
    this.root.prepend(el);
    this.levelEl = el;
    this.levelNum = el.querySelector('span');
    this.levelBar = el.querySelector('i');
  }

  setLevel(level: number, progress: number, bump = false) {
    if (!this.levelEl) return;
    this.levelNum!.textContent = String(level);
    this.levelBar!.style.width = `${Math.round(Math.min(1, progress) * 100)}%`;
    if (bump) this.restartAnim(this.levelEl, 'bump');
  }

  /** Round button pinned to the top-right corner. */
  addCornerButton(label: string, title: string, onClick: () => void) {
    const b = document.createElement('button');
    b.className = 'corner-btn';
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.parentElement!.append(b);
    return b;
  }

  /** Screen-space centre of the counter's icon, where flying items should land. */
  target(key: string) {
    const c = this.counters.get(key)!;
    const r = (c.el.querySelector('.icon') as HTMLElement).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  shown(key: string) {
    return this.counters.get(key)!.shown;
  }

  set(key: string, value: number) {
    const c = this.counters.get(key)!;
    c.shown = value;
    c.value.textContent = fmt.format(value);
  }

  bump(key: string) {
    this.restartAnim(this.counters.get(key)!.el, 'bump');
  }

  shake(key: string) {
    this.restartAnim(this.counters.get(key)!.el, 'shake');
  }

  private restartAnim(el: HTMLElement, cls: string) {
    el.classList.remove('bump', 'shake');
    void el.offsetWidth; // reflow so the animation restarts
    el.classList.add(cls);
  }
}

export function toast(parent: HTMLElement, text: string) {
  parent.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  parent.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}
