/** Title screen with the code-drawn logo. Resolves when the player taps "Gioca". */
export function showSplash(parent: HTMLElement, version: string): Promise<void> {
  const el = document.createElement('div');
  el.className = 'splash';
  el.innerHTML = `
    <div class="logo">
      ${sunflowerSvg()}
      ${wordmarkSvg()}
      <div class="logo-ribbon">LA TUA FATTORIA</div>
    </div>
    <button class="btn orange">Gioca!</button>
    <div class="version">v${version}</div>
  `;
  parent.appendChild(el);
  return new Promise((resolve) => {
    el.querySelector('button')!.addEventListener('click', () => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 600);
      resolve();
    }, { once: true });
  });
}

function wordmarkSvg() {
  // SVG text so the thick outline sits *behind* the fill on every browser.
  const line = (text: string, y: number, size: number) => `
    <text x="250" y="${y + 12}" font-size="${size}" fill="#8a3d0b" stroke="#8a3d0b" stroke-width="16" stroke-linejoin="round">${text}</text>
    <text x="250" y="${y + 6}" font-size="${size}" fill="#d0640f" stroke="#d0640f" stroke-width="16" stroke-linejoin="round">${text}</text>
    <text x="250" y="${y}" font-size="${size}" fill="url(#lg)" stroke="#8a3d0b" stroke-width="9" stroke-linejoin="round" paint-order="stroke">${text}</text>
    <text x="250" y="${y}" font-size="${size}" fill="url(#lg)">${text}</text>`;
  return `
    <svg class="logo-word" viewBox="0 0 500 230" font-family="'Lilita One', sans-serif" text-anchor="middle">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff7b0"/><stop offset=".45" stop-color="#ffd02e"/><stop offset="1" stop-color="#ff951a"/>
        </linearGradient>
      </defs>
      ${line('Valle', 100, 104)}
      ${line('Girasole', 205, 92)}
    </svg>`;
}

function sunflowerSvg() {
  const petals = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * 360;
    return `<ellipse cx="60" cy="24" rx="11" ry="22" transform="rotate(${a} 60 60)" fill="${i % 2 ? '#ffc21c' : '#ffd84a'}" stroke="#a5560b" stroke-width="3"/>`;
  }).join('');
  return `
    <svg class="logo-sun" viewBox="0 0 120 120">
      <g class="petals">${petals}</g>
      <circle cx="60" cy="60" r="22" fill="#7a431c" stroke="#4d2a10" stroke-width="3"/>
      <circle cx="53" cy="53" r="6" fill="#9a5a2a"/>
      <circle cx="54" cy="66" r="2.6" fill="#fff" opacity=".9"/><circle cx="66" cy="66" r="2.6" fill="#fff" opacity=".9"/>
      <path d="M53 71q7 6 14 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
    </svg>`;
}
