/**
 * Item / currency icons. Placeholder vector art drawn in code; any entry can be
 * swapped for a PNG (e.g. from the generated icon sheet) without touching callers.
 */

const svg = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`,
  )}`;

const COIN = svg(`
  <defs>
    <radialGradient id="g" cx="35%" cy="30%" r="75%">
      <stop offset="0" stop-color="#fff3a6"/><stop offset=".45" stop-color="#ffd23a"/><stop offset="1" stop-color="#e79a12"/>
    </radialGradient>
  </defs>
  <ellipse cx="32" cy="35" rx="27" ry="26" fill="#7a4a12"/>
  <circle cx="32" cy="32" r="26" fill="#c47a0e" stroke="#6b3f10" stroke-width="3"/>
  <circle cx="32" cy="31" r="22" fill="url(#g)"/>
  <circle cx="32" cy="31" r="15.5" fill="none" stroke="#e8a01a" stroke-width="2.5"/>
  <path d="M32 20c-6 6-6 14 0 21 6-7 6-15 0-21z" fill="#f0a91c" stroke="#b7700c" stroke-width="2"/>
  <path d="M32 24v15" stroke="#b7700c" stroke-width="1.8" stroke-linecap="round"/>
  <ellipse cx="22" cy="19" rx="6" ry="3.5" fill="#fff" opacity=".75" transform="rotate(-35 22 19)"/>
`);

const WHEAT = svg(`
  <g stroke="#6b3f10" stroke-width="2.4" stroke-linejoin="round">
    ${[-16, 0, 16].map((rot) => `
      <g transform="rotate(${rot} 32 58)">
        <path d="M32 58V24" stroke="#8a5a1a" stroke-width="3" fill="none"/>
        ${[0, 1, 2, 3].map((i) => `
          <ellipse cx="27.5" cy="${16 + i * 7}" rx="4" ry="6" transform="rotate(-25 27.5 ${16 + i * 7})" fill="#ffc531"/>
          <ellipse cx="36.5" cy="${16 + i * 7}" rx="4" ry="6" transform="rotate(25 36.5 ${16 + i * 7})" fill="#ffd54f"/>`).join('')}
        <ellipse cx="32" cy="10" rx="3.6" ry="6" fill="#ffd54f"/>
      </g>`).join('')}
  </g>
  <rect x="22" y="40" width="20" height="7" rx="3" fill="#d9483b" stroke="#6b3f10" stroke-width="2.4"/>
`);

const SEED_BAG = svg(`
  <path d="M18 22c-4 10-6 22-2 32 4 6 28 6 32 0 4-10 2-22-2-32z" fill="#e8c48a" stroke="#6b3f10" stroke-width="3" stroke-linejoin="round"/>
  <path d="M20 22c4-4 20-4 24 0l-3-8H23z" fill="#d5ab6c" stroke="#6b3f10" stroke-width="3" stroke-linejoin="round"/>
  <path d="M21 22h22" stroke="#d9483b" stroke-width="4" stroke-linecap="round"/>
  <g transform="translate(32 40) scale(.55) translate(-32 -36)">
    <path d="M32 58V24" stroke="#8a5a1a" stroke-width="4"/>
    ${[0, 1, 2, 3].map((i) => `
      <ellipse cx="26.5" cy="${16 + i * 8}" rx="5" ry="7" transform="rotate(-25 26.5 ${16 + i * 8})" fill="#ffc531" stroke="#6b3f10" stroke-width="2.5"/>
      <ellipse cx="37.5" cy="${16 + i * 8}" rx="5" ry="7" transform="rotate(25 37.5 ${16 + i * 8})" fill="#ffd54f" stroke="#6b3f10" stroke-width="2.5"/>`).join('')}
  </g>
`);

const FLOUR = svg(`
  <path d="M14 26c-3 10-3 22 2 30 6 5 26 5 32 0 5-8 5-20 2-30z" fill="#fbf6ea" stroke="#6b3f10" stroke-width="3" stroke-linejoin="round"/>
  <path d="M18 26c4-6 24-6 28 0l-4-10H22z" fill="#efe6d2" stroke="#6b3f10" stroke-width="3" stroke-linejoin="round"/>
  <path d="M19 26h26" stroke="#d9483b" stroke-width="4" stroke-linecap="round"/>
  <path d="M32 34v16M32 38l-5-3M32 38l5-3M32 44l-5-3M32 44l5-3" stroke="#e0a321" stroke-width="3" stroke-linecap="round"/>
`);

export const ICONS = {
  flour: FLOUR,
  coin: COIN,
  wheat: WHEAT,
  wheatSeed: SEED_BAG,
} as const;

export type IconId = keyof typeof ICONS;

export function iconImg(id: IconId, cls = 'icon') {
  const img = document.createElement('img');
  img.src = ICONS[id];
  img.className = cls;
  img.alt = '';
  img.draggable = false;
  return img;
}
