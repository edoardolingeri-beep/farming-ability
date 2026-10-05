import * as THREE from 'three';

export type PadKind = 'upgrade' | 'drop' | 'cashier' | 'money' | 'soon';

const FONT = "'Lilita One', 'Nunito', sans-serif";

/**
 * A flat marker lying on the ground, drawn into a canvas texture so it can show
 * a label, an icon and (for upgrade pads) the remaining cost with a fill bar.
 */
export class Pad {
  readonly mesh: THREE.Mesh;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private lastKey = '';
  private pulse = 0;
  private shown: [number, number] = [0, 0];

  /** Shown on 'soon' pads instead of a price, e.g. "LIVELLO 3". */
  lockText = 'PRESTO!';

  constructor(
    public kind: PadKind,
    readonly x: number,
    readonly z: number,
    readonly w: number,
    readonly d: number,
    private label = '',
  ) {
    const res = 256;
    this.canvas.width = Math.round(res * Math.max(1, w / d));
    this.canvas.height = Math.round(res * Math.max(1, d / w));
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
    this.mesh.position.set(x, 0.04, z);
    this.mesh.renderOrder = 1;
    this.draw(0, 0);
    // Redraw (with whatever was last shown) once the display font has loaded.
    document.fonts?.ready.then(() => { this.lastKey = ''; this.draw(this.shown[0], this.shown[1]); });
  }

  contains(px: number, pz: number, margin = 0) {
    return Math.abs(px - this.x) < this.w / 2 + margin && Math.abs(pz - this.z) < this.d / 2 + margin;
  }

  /** Gentle breathing scale so pads read as interactive. `active` = player standing on it. */
  update(dt: number, active: boolean) {
    this.pulse += dt;
    const s = active ? 1.06 : 1 + Math.sin(this.pulse * 3) * 0.02;
    this.mesh.scale.set(s, 1, s);
  }

  /** Switches between locked ('soon') and payable ('upgrade') looks. */
  setKind(kind: PadKind) {
    this.kind = kind;
    this.lastKey = '';
  }

  /** remaining: coins still to pay (upgrade) or a count to show; progress 0..1. */
  draw(remaining: number, progress: number) {
    const key = `${this.kind}|${remaining}|${progress.toFixed(3)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.shown = [remaining, progress];
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    const r = Math.min(W, H) * 0.16, inset = 10;

    const rounded = (x: number, y: number, w: number, h: number, rr: number) => {
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    };

    const palette: Record<PadKind, { fill: string; edge: string; ink: string }> = {
      upgrade: { fill: 'rgba(40,120,70,0.30)', edge: '#ffffff', ink: '#ffffff' },
      drop: { fill: 'rgba(255,255,255,0.35)', edge: '#ffffff', ink: '#ffffff' },
      cashier: { fill: 'rgba(60,150,230,0.35)', edge: '#ffffff', ink: '#ffffff' },
      money: { fill: 'rgba(255,210,58,0.30)', edge: '#ffe58a', ink: '#ffffff' },
      soon: { fill: 'rgba(60,60,60,0.25)', edge: 'rgba(255,255,255,0.6)', ink: 'rgba(255,255,255,0.85)' },
    };
    const pal = palette[this.kind];

    rounded(inset, inset, W - inset * 2, H - inset * 2, r);
    c.fillStyle = pal.fill;
    c.fill();

    if (this.kind === 'upgrade' && progress > 0) {
      c.save();
      rounded(inset, inset, W - inset * 2, H - inset * 2, r);
      c.clip();
      // Fill rises toward the top of the screen (the view is rotated 45°).
      const diag = Math.hypot(W, H);
      c.translate(W / 2, H / 2);
      c.rotate(-Math.PI / 4);
      c.fillStyle = 'rgba(120,230,90,0.65)';
      c.fillRect(-diag / 2, diag / 2 - diag * progress, diag, diag * progress);
      c.restore();
    }

    c.lineWidth = 12;
    c.strokeStyle = pal.edge;
    c.setLineDash(this.kind === 'upgrade' || this.kind === 'soon' ? [28, 18] : []);
    rounded(inset, inset, W - inset * 2, H - inset * 2, r);
    c.stroke();
    c.setLineDash([]);

    // Lay the content out level with the screen: the camera looks down at 45°.
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(-Math.PI / 4);
    c.scale(0.86, 0.86);
    c.translate(-W / 2, -H / 2);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = pal.ink;
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowOffsetY = 4;
    const cx = W / 2;

    if (this.kind === 'upgrade' || this.kind === 'soon') {
      c.font = `${Math.round(H * 0.15)}px ${FONT}`;
      c.fillText(this.label.toUpperCase(), cx, H * 0.3, W - 40);
      if (this.kind === 'soon') {
        c.font = `${Math.round(H * 0.13)}px ${FONT}`;
        c.fillText(this.lockText, cx, H * 0.66);
        drawLock(c, cx, H * 0.47, H * 0.07);
      } else {
        drawCoin(c, cx - H * 0.17, H * 0.64, H * 0.11);
        c.font = `${Math.round(H * 0.24)}px ${FONT}`;
        c.textAlign = 'left';
        c.fillText(String(remaining), cx - H * 0.03, H * 0.66);
      }
    } else if (this.kind === 'drop') {
      drawArrow(c, cx, H * 0.42, H * 0.22);
      c.font = `${Math.round(H * 0.15)}px ${FONT}`;
      c.fillText(this.label.toUpperCase(), cx, H * 0.78);
    } else if (this.kind === 'cashier') {
      c.font = `${Math.round(H * 0.17)}px ${FONT}`;
      c.fillText(this.label.toUpperCase(), cx, H * 0.5);
    } else if (this.kind === 'money') {
      drawCoin(c, cx, H * 0.5, H * 0.2);
    }
    c.restore();
    this.texture.needsUpdate = true;
  }
}

function drawCoin(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.3)';
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = '#e09a12'; c.fill();
  c.shadowColor = 'transparent';
  c.beginPath(); c.arc(x, y - r * 0.06, r * 0.82, 0, Math.PI * 2); c.fillStyle = '#ffd23a'; c.fill();
  c.beginPath(); c.ellipse(x, y - r * 0.06, r * 0.22, r * 0.45, 0, 0, Math.PI * 2); c.fillStyle = '#f0a91c'; c.fill();
  c.restore();
}

function drawArrow(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x - s * 0.35, y - s);
  c.lineTo(x + s * 0.35, y - s);
  c.lineTo(x + s * 0.35, y);
  c.lineTo(x + s * 0.8, y);
  c.lineTo(x, y + s * 0.85);
  c.lineTo(x - s * 0.8, y);
  c.lineTo(x - s * 0.35, y);
  c.closePath();
  c.fill();
}

function drawLock(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.save();
  c.lineWidth = s * 0.35;
  c.strokeStyle = c.fillStyle as string;
  c.beginPath(); c.arc(x, y - s * 0.4, s * 0.6, Math.PI, 0); c.stroke();
  c.fillRect(x - s, y - s * 0.4, s * 2, s * 1.4);
  c.restore();
}
