import { ICONS, type IconId } from './icons';

interface Point { x: number; y: number }

/**
 * Items that pop out of a spot on screen and arc into a HUD counter.
 * `onLand` fires once per item so the counter can tick up as they arrive.
 */
export function flyItems(
  parent: HTMLElement,
  icon: IconId,
  from: Point,
  to: () => Point,
  count: number,
  onLand: (i: number) => void,
) {
  for (let i = 0; i < count; i++) {
    const img = document.createElement('img');
    img.src = ICONS[icon];
    img.className = 'fly';
    img.draggable = false;
    parent.appendChild(img);

    // Burst outward first, then curve to the counter.
    const angle = -Math.PI / 2 + (i - (count - 1) / 2) * 0.55 + (Math.random() - 0.5) * 0.3;
    const burst = 50 + Math.random() * 30;
    const p0 = from;
    const p1 = { x: from.x + Math.cos(angle) * burst, y: from.y + Math.sin(angle) * burst };
    const end = to();
    const ctrl = { x: (p1.x + end.x) / 2 + (Math.random() - 0.5) * 80, y: Math.min(p1.y, end.y) - 60 };

    const frames: Keyframe[] = [];
    frames.push({ transform: `translate(${p0.x}px, ${p0.y}px) scale(0.2)`, opacity: 0, offset: 0 });
    frames.push({ transform: `translate(${p1.x}px, ${p1.y}px) scale(1.15)`, opacity: 1, offset: 0.25 });
    frames.push({ transform: `translate(${p1.x}px, ${p1.y - 6}px) scale(1)`, opacity: 1, offset: 0.38 });
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      const x = u * u * p1.x + 2 * u * t * ctrl.x + t * t * end.x;
      const y = u * u * (p1.y - 6) + 2 * u * t * ctrl.y + t * t * end.y;
      frames.push({
        transform: `translate(${x}px, ${y}px) scale(${1 - t * 0.35})`,
        opacity: 1,
        offset: 0.38 + 0.62 * t,
      });
    }
    const anim = img.animate(frames, {
      duration: 900 + i * 60,
      delay: i * 70,
      easing: 'cubic-bezier(.45,.05,.55,.95)',
      fill: 'both',
    });
    anim.onfinish = () => {
      img.remove();
      onLand(i);
    };
  }
}

/** "+2" style text that rises and fades. */
export function floatText(parent: HTMLElement, at: Point, text: string) {
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  parent.appendChild(el);
  const w = el.offsetWidth;
  const x = at.x - w / 2;
  el.animate(
    [
      { transform: `translate(${x}px, ${at.y}px) scale(0.4)`, opacity: 0 },
      { transform: `translate(${x}px, ${at.y - 30}px) scale(1.15)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${x}px, ${at.y - 70}px) scale(1)`, opacity: 0 },
    ],
    { duration: 1100, easing: 'ease-out', fill: 'both' },
  ).onfinish = () => el.remove();
}
