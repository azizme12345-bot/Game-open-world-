import * as THREE from 'three';

export interface ProceduralTextureSet {
  roadAlbedo: THREE.CanvasTexture;
  roadNormal: THREE.CanvasTexture;
  roadRoughness: THREE.CanvasTexture;
  roadBaseAlbedo: THREE.CanvasTexture;
  roundaboutAlbedo: THREE.CanvasTexture;
  crosswalkAlbedo: THREE.CanvasTexture;
  sidewalkAlbedo: THREE.CanvasTexture;
  sidewalkNormal: THREE.CanvasTexture;
  sidewalkRoughness: THREE.CanvasTexture;
  sidewalkPaverAlbedo: THREE.CanvasTexture;
  parkGrassAlbedo: THREE.CanvasTexture;
  roofTileAlbedo: THREE.CanvasTexture;
  houseWallAlbedo: THREE.CanvasTexture;
  roadSigns: THREE.CanvasTexture[];
  buildingFacades: THREE.CanvasTexture[];
  buildingFacadeRoughness: THREE.CanvasTexture;
  buildingFacadeNormal: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  plowedSoilAlbedo: THREE.CanvasTexture;
  dirtRoadAlbedo: THREE.CanvasTexture;
  dirtRoadNormal: THREE.CanvasTexture;
  barnWoodAlbedo: THREE.CanvasTexture;
  countryMeadowAlbedo: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(maxAnisotropy, 8);
  tex.needsUpdate = true;
  return tex;
}

function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

// Convert a grayscale height canvas into a tangent-space normal map DataTexture/CanvasTexture
function heightCanvasToNormalTexture(
  heightCanvas: HTMLCanvasElement,
  strength: number,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d')!;
  const src = srcCtx.getImageData(0, 0, w, h).data;

  const [nCanvas, nCtx] = makeCanvas(w, h);
  const out = nCtx.createImageData(w, h);
  const dst = out.data;

  const sample = (x: number, y: number) => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return src[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dX = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dY = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const nx = -dX;
      const ny = -dY;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);

      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }

  nCtx.putImageData(out, 0, 0);
  return configureTexture(nCanvas, false, maxAnisotropy, repeatX, repeatY);
}

function createRoadTextures(maxAnisotropy: number): {
  albedo: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  crosswalk: THREE.CanvasTexture;
} {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);
  const [rCanvas, rCtx] = makeCanvas(size, size);
  const [hCanvas, hCtx] = makeCanvas(size, size);

  // Rich anime-urban dark slate asphalt
  ctx.fillStyle = '#272d38';
  ctx.fillRect(0, 0, size, size);

  rCtx.fillStyle = '#c2c2c2';
  rCtx.fillRect(0, 0, size, size);

  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);

  // Subtle tire wear polish bands in each of the 4 lanes
  const laneCenters = [size * 0.14, size * 0.37, size * 0.63, size * 0.86];
  for (const cx of laneCenters) {
    const grad = ctx.createLinearGradient(cx - 34, 0, cx + 34, 0);
    grad.addColorStop(0, 'rgba(18, 22, 28, 0)');
    grad.addColorStop(0.5, 'rgba(18, 22, 30, 0.32)');
    grad.addColorStop(1, 'rgba(18, 22, 28, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 34, 0, 68, size);

    const rGrad = rCtx.createLinearGradient(cx - 30, 0, cx + 30, 0);
    rGrad.addColorStop(0, 'rgba(135, 135, 135, 0)');
    rGrad.addColorStop(0.5, 'rgba(135, 135, 135, 0.4)');
    rGrad.addColorStop(1, 'rgba(135, 135, 135, 0)');
    rCtx.fillStyle = rGrad;
    rCtx.fillRect(cx - 30, 0, 60, size);
  }

  // Fine asphalt mineral aggregate + bump height
  for (let i = 0; i < 9500; i++) {
    const px = Math.floor(hash2d(i, 1) * size);
    const py = Math.floor(hash2d(i, 2) * size);
    const v = 30 + Math.floor(hash2d(i, 3) * 32);
    ctx.fillStyle = `rgb(${v},${v + 5},${v + 11})`;
    ctx.fillRect(px, py, 2, 2);

    const rv = 168 + Math.floor(hash2d(i, 4) * 68);
    rCtx.fillStyle = `rgb(${rv},${rv},${rv})`;
    rCtx.fillRect(px, py, 2, 2);

    const hv = 105 + Math.floor(hash2d(i, 5) * 48);
    hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hCtx.fillRect(px, py, 2, 2);
  }

  // Storm-drain grates near road shoulders for hyper-realistic urban detail
  [18, size - 34].forEach((gx) => {
    [110, 366].forEach((gy) => {
      ctx.fillStyle = '#181d25';
      ctx.fillRect(gx, gy, 16, 26);
      ctx.fillStyle = '#475569';
      for (let bar = 3; bar < 24; bar += 4) {
        ctx.fillRect(gx + 2, gy + bar, 12, 2);
      }
      hCtx.fillStyle = '#383838';
      hCtx.fillRect(gx, gy, 16, 26);
    });
  });

  // Crisp white edge lines
  ctx.fillStyle = '#eef4fb';
  ctx.fillRect(14, 0, 6, size);
  ctx.fillRect(size - 20, 0, 6, size);

  // Double amber/gold center divider lines
  ctx.fillStyle = '#f6b932';
  ctx.fillRect(size * 0.5 - 9, 0, 5, size);
  ctx.fillRect(size * 0.5 + 4, 0, 5, size);

  // Dashed white lane dividers
  ctx.fillStyle = '#f0f5fc';
  const dashCount = 2;
  const step = size / dashCount;
  for (let d = 0; d < dashCount; d++) {
    const y0 = d * step + 28;
    const h = step * 0.48;
    ctx.fillRect(size * 0.255 - 3, y0, 6, h);
    ctx.fillRect(size * 0.745 - 3, y0, 6, h);
  }

  // Painted markings smoother in roughness
  rCtx.fillStyle = '#8a8a8a';
  rCtx.fillRect(14, 0, 6, size);
  rCtx.fillRect(size - 20, 0, 6, size);
  rCtx.fillRect(size * 0.5 - 9, 0, 5, size);
  rCtx.fillRect(size * 0.5 + 4, 0, 5, size);

  const albedo = configureTexture(canvas, true, maxAnisotropy, 1, 14);
  const normal = heightCanvasToNormalTexture(hCanvas, 0.9, maxAnisotropy, 1, 14);
  const roughness = configureTexture(rCanvas, false, maxAnisotropy, 1, 14);

  // Crosswalk decal texture
  const [cCanvas, cCtx] = makeCanvas(512, 128);
  cCtx.clearRect(0, 0, 512, 128);
  cCtx.fillStyle = 'rgba(244, 249, 255, 0.95)';
  const stripes = 11;
  const stripeW = 28;
  const margin = 24;
  const avail = 512 - margin * 2;
  const gap = (avail - stripes * stripeW) / (stripes - 1);
  for (let s = 0; s < stripes; s++) {
    const x = margin + s * (stripeW + gap);
    cCtx.fillRect(x, 18, stripeW, 92);
  }
  const crosswalk = configureTexture(cCanvas, true, maxAnisotropy, 1, 1);
  crosswalk.wrapS = THREE.ClampToEdgeWrapping;
  crosswalk.wrapT = THREE.ClampToEdgeWrapping;

  return { albedo, normal, roughness, crosswalk };
}

function createSidewalkTextures(maxAnisotropy: number): {
  albedo: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  paverAlbedo: THREE.CanvasTexture;
} {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);
  const [rCanvas, rCtx] = makeCanvas(size, size);
  const [hCanvas, hCtx] = makeCanvas(size, size);

  // Grout base
  ctx.fillStyle = '#9aa5b5';
  ctx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#dcdcdc';
  rCtx.fillRect(0, 0, size, size);
  hCtx.fillStyle = '#606060';
  hCtx.fillRect(0, 0, size, size);

  const cols = 8;
  const rows = 8;
  const cw = size / cols;
  const ch = size / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tint = Math.floor((hash2d(c, r) - 0.5) * 16);
      const baseR = 192 + tint;
      const baseG = 199 + tint;
      const baseB = 209 + tint;
      ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
      ctx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4);

      hCtx.fillStyle = '#b4b4b4';
      hCtx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4);

      const rv = 190 + Math.floor(hash2d(c + 10, r) * 35);
      rCtx.fillStyle = `rgb(${rv},${rv},${rv})`;
      rCtx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4);
    }
  }

  // Tactile yellow Japanese tenji-block strip near curb edge
  ctx.fillStyle = '#e7bf3e';
  ctx.fillRect(18, 0, 26, size);
  ctx.fillStyle = '#cfa327';
  hCtx.fillStyle = '#e0e0e0';
  for (let y = 6; y < size; y += 16) {
    for (let x = 22; x < 42; x += 8) {
      ctx.fillRect(x, y, 4, 8);
      hCtx.fillRect(x, y, 4, 8);
    }
  }

  const albedo = configureTexture(canvas, true, maxAnisotropy, 1, 26);
  const normal = heightCanvasToNormalTexture(hCanvas, 1.4, maxAnisotropy, 1, 26);
  const roughness = configureTexture(rCanvas, false, maxAnisotropy, 1, 26);

  // Clean plaza/block paver variant
  const [pCanvas, pCtx] = makeCanvas(256, 256);
  pCtx.fillStyle = '#9aa4b2';
  pCtx.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const tint = Math.floor((hash2d(c + 5, r + 9) - 0.5) * 14);
      pCtx.fillStyle = `rgb(${194 + tint},${200 + tint},${210 + tint})`;
      pCtx.fillRect(c * 64 + 2, r * 64 + 2, 60, 60);
    }
  }
  const paverAlbedo = configureTexture(pCanvas, true, maxAnisotropy, 0.22, 0.22);

  return { albedo, normal, roughness, paverAlbedo };
}

function createBuildingFacadeAssets(maxAnisotropy: number): {
  albedos: THREE.CanvasTexture[];
  roughness: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
} {
  const w = 512;
  const h = 512;

  const palettes = [
    // 0: Crisp anime sky-glass curtain wall tower
    { wall: '#d8e6f5', frame: '#445c78', glassTop: '#316cb3', glassBot: '#94d5ff', lit: '#fff1bd', spandrel: '#65809e' },
    // 1: Warm sunlit cream limestone & sapphire glass office tower
    { wall: '#ece4d7', frame: '#837b71', glassTop: '#2a4f75', glassBot: '#6cb2e0', lit: '#ffe7ad', spandrel: '#c9bfb0' },
    // 2: Sleek obsidian-slate financial skyscraper with cyan reflection glass
    { wall: '#283242', frame: '#161e2b', glassTop: '#1f4e7a', glassBot: '#54b4eb', lit: '#ffe69a', spandrel: '#39465c' },
    // 3: Warm coral-terracotta boutique commercial & condo tower
    { wall: '#e2c5b8', frame: '#6e584f', glassTop: '#305a7d', glassBot: '#7dc2e8', lit: '#fff0bd', spandrel: '#c7a495' },
    // 4: Modern pastel mint-ivory apartment tower
    { wall: '#d7e6e0', frame: '#556d69', glassTop: '#35668a', glassBot: '#86cae8', lit: '#fff2c4', spandrel: '#adc4bc' },
    // 5: High-contrast white & cobalt modern retail / tech tower
    { wall: '#f1f5f9', frame: '#3b4f6b', glassTop: '#275ea3', glassBot: '#7bc6f7', lit: '#ffedae', spandrel: '#cbd5e1' },
  ];

  // Shared architectural grid roughness & normal height maps so glass panes reflect sky while piers stay matte
  const [rCanvas, rCtx] = makeCanvas(w, h);
  const [hCanvas, hCtx] = makeCanvas(w, h);
  rCtx.fillStyle = '#cfcfcf'; // ~0.81 matte stone/frame
  rCtx.fillRect(0, 0, w, h);
  hCtx.fillStyle = '#d4d4d4'; // raised mullions/spandrels
  hCtx.fillRect(0, 0, w, h);

  const cols = 8;
  const rows = 10;
  const padX = 8;
  const padY = 9;
  const cellW = w / cols;
  const cellH = h / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = c * cellW + padX;
      const wy = r * cellH + padY;
      const ww = cellW - padX * 2;
      const wh = cellH - padY * 1.65;
      rCtx.fillStyle = '#181818'; // glossy smooth glass (~0.09 roughness)
      rCtx.fillRect(wx, wy, ww, wh);
      hCtx.fillStyle = '#525252'; // recessed glass bay
      hCtx.fillRect(wx, wy, ww, wh);
    }
  }

  const roughness = configureTexture(rCanvas, false, maxAnisotropy, 1, 1);
  const normal = heightCanvasToNormalTexture(hCanvas, 1.6, maxAnisotropy, 1, 1);

  const albedos = palettes.map((pal, variant) => {
    const [canvas, ctx] = makeCanvas(w, h);
    ctx.fillStyle = pal.wall;
    ctx.fillRect(0, 0, w, h);

    for (let r = 0; r < rows; r++) {
      // Architectural floor slab spandrel + shadow line
      ctx.fillStyle = pal.spandrel;
      ctx.fillRect(0, r * cellH, w, 7);
      ctx.fillStyle = pal.frame;
      ctx.fillRect(0, r * cellH + 6, w, 2);

      for (let c = 0; c < cols; c++) {
        const wx = c * cellW + padX;
        const wy = r * cellH + padY;
        const ww = cellW - padX * 2;
        const wh = cellH - padY * 1.65;

        // Window frame recess
        ctx.fillStyle = pal.frame;
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

        const rng = hash2d(c + variant * 17, r * 11 + variant);
        const isLit = rng > 0.78;
        const grad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        if (isLit) {
          grad.addColorStop(0, '#72a8db');
          grad.addColorStop(0.45, pal.lit);
          grad.addColorStop(1, '#ffd480');
        } else {
          grad.addColorStop(0, pal.glassTop);
          grad.addColorStop(1, pal.glassBot);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(wx, wy, ww, wh);

        // Subtle interior horizontal blind bars on some windows
        if (rng > 0.35 && rng < 0.62) {
          ctx.fillStyle = 'rgba(20, 35, 55, 0.24)';
          ctx.fillRect(wx, wy, ww, wh * 0.35);
        }

        // Crisp diagonal anime sky reflection streak
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.moveTo(wx + ww * 0.1, wy);
        ctx.lineTo(wx + ww * 0.36, wy);
        ctx.lineTo(wx + ww * 0.08, wy + wh);
        ctx.lineTo(wx, wy + wh);
        ctx.closePath();
        ctx.fill();

        // Center window mullion
        ctx.fillStyle = pal.frame;
        ctx.fillRect(wx + ww * 0.5 - 1, wy, 2, wh);
      }
    }

    return configureTexture(canvas, true, maxAnisotropy, 1, 1);
  });

  return { albedos, roughness, normal };
}

function createHouseTextures(maxAnisotropy: number): {
  wall: THREE.CanvasTexture;
  roof: THREE.CanvasTexture;
} {
  // Residential siding + framed windows
  const [wCanvas, wCtx] = makeCanvas(256, 256);
  wCtx.fillStyle = '#f8f5ef';
  wCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    wCtx.fillStyle = 'rgba(120, 115, 105, 0.14)';
    wCtx.fillRect(0, y, 256, 2);
  }
  // Two crisp residential windows with wooden frames & warm glass
  [44, 152].forEach((wx) => {
    wCtx.fillStyle = '#475569';
    wCtx.fillRect(wx - 4, 58, 68, 72);
    const g = wCtx.createLinearGradient(wx, 62, wx, 126);
    g.addColorStop(0, '#5a9bd6');
    g.addColorStop(1, '#bce3ff');
    wCtx.fillStyle = g;
    wCtx.fillRect(wx, 62, 60, 64);
    wCtx.fillStyle = '#ffffff';
    wCtx.fillRect(wx + 28, 62, 4, 64);
    wCtx.fillRect(wx, 92, 60, 4);
  });
  const wall = configureTexture(wCanvas, true, maxAnisotropy, 1, 1);

  // Ceramic shingle roof tile texture
  const [rCanvas, rCtx] = makeCanvas(256, 256);
  rCtx.fillStyle = '#ffffff';
  rCtx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 16; row++) {
    const y = row * 16;
    rCtx.fillStyle = row % 2 === 0 ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.03)';
    rCtx.fillRect(0, y, 256, 15);
    rCtx.fillStyle = 'rgba(0,0,0,0.22)';
    rCtx.fillRect(0, y + 14, 256, 2);
    for (let col = 0; col < 16; col++) {
      const x = col * 16 + (row % 2) * 8;
      rCtx.fillRect(x, y, 1.5, 15);
    }
  }
  const roof = configureTexture(rCanvas, true, maxAnisotropy, 3, 3);
  return { wall, roof };
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.48
  );
  grad.addColorStop(0, 'rgba(10, 14, 24, 0.82)');
  grad.addColorStop(0.5, 'rgba(10, 14, 24, 0.36)');
  grad.addColorStop(1, 'rgba(10, 14, 24, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createRoadBaseTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#272d38';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2400; i++) {
    const px = Math.floor(hash2d(i, 11) * size);
    const py = Math.floor(hash2d(i, 12) * size);
    const v = 30 + Math.floor(hash2d(i, 13) * 32);
    ctx.fillStyle = `rgb(${v},${v + 5},${v + 11})`;
    ctx.fillRect(px, py, 2, 2);
  }
  return configureTexture(canvas, true, maxAnisotropy, 1, 1);
}

function createRoundaboutTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const pxPerMeter = size / 44;

  ctx.fillStyle = '#272d38';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 16000; i++) {
    const px = Math.floor(hash2d(i, 21) * size);
    const py = Math.floor(hash2d(i, 22) * size);
    const v = 30 + Math.floor(hash2d(i, 23) * 32);
    ctx.fillStyle = `rgb(${v},${v + 5},${v + 11})`;
    ctx.fillRect(px, py, 2, 2);
  }

  [12.4, 18.4].forEach((rMeters) => {
    ctx.beginPath();
    ctx.arc(cx, cy, rMeters * pxPerMeter, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(18, 22, 30, 0.28)';
    ctx.lineWidth = 2.6 * pxPerMeter;
    ctx.stroke();
  });

  ctx.beginPath();
  ctx.arc(cx, cy, 9.45 * pxPerMeter, 0, Math.PI * 2);
  ctx.strokeStyle = '#f6b932';
  ctx.lineWidth = 0.22 * pxPerMeter;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([2.8 * pxPerMeter, 2.4 * pxPerMeter]);
  ctx.arc(cx, cy, 15.5 * pxPerMeter, 0, Math.PI * 2);
  ctx.strokeStyle = '#edf3fa';
  ctx.lineWidth = 0.22 * pxPerMeter;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([1.1 * pxPerMeter, 0.9 * pxPerMeter]);
  ctx.arc(cx, cy, 20.6 * pxPerMeter, 0, Math.PI * 2);
  ctx.strokeStyle = '#e8eef5';
  ctx.lineWidth = 0.24 * pxPerMeter;
  ctx.stroke();
  ctx.restore();

  const tex = configureTexture(canvas, true, maxAnisotropy, 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function createParkGrassTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#48a450';
  ctx.fillRect(0, 0, size, size);

  // Subtle mowed lawn bands
  for (let x = 0; x < size; x += 64) {
    ctx.fillStyle = (x / 64) % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(x, 0, 64, size);
  }

  for (let i = 0; i < 6500; i++) {
    const px = Math.floor(hash2d(i, 31) * size);
    const py = Math.floor(hash2d(i, 32) * size);
    const g = 140 + Math.floor(hash2d(i, 33) * 44);
    ctx.fillStyle = `rgb(${Math.floor(g * 0.43)},${g},${Math.floor(g * 0.45)})`;
    ctx.fillRect(px, py, 3, 3);
  }
  return configureTexture(canvas, true, maxAnisotropy, 5, 5);
}

function createRoadSignTextures(maxAnisotropy: number): THREE.CanvasTexture[] {
  const mkSign = (draw: (ctx: CanvasRenderingContext2D, s: number) => void) => {
    const s = 128;
    const [canvas, ctx] = makeCanvas(s, s);
    draw(ctx, s);
    const t = configureTexture(canvas, true, maxAnisotropy, 1, 1);
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };

  const speed50 = mkSign((ctx, s) => {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, s, s);
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 54, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 11;
    ctx.strokeStyle = '#dc2626';
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('50', s / 2, s / 2 + 2);
  });

  const roundabout = mkSign((ctx, s) => {
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(0, 0, s, s);
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 56, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a0 = (i * Math.PI * 2) / 3 + 0.2;
      const a1 = a0 + 1.35;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, 30, a0, a1);
      ctx.stroke();
    }
  });

  const crosswalk = mkSign((ctx, s) => {
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, s - 16, s - 16);
    ctx.beginPath();
    ctx.moveTo(s / 2, 20);
    ctx.lineTo(s - 20, s - 22);
    ctx.lineTo(20, s - 22);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(42, 86, 10, 12);
    ctx.fillRect(59, 86, 10, 12);
    ctx.fillRect(76, 86, 10, 12);
    ctx.beginPath();
    ctx.arc(s / 2, 54, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(s / 2 - 4, 62, 8, 20);
  });

  const turnSign = mkSign((ctx, s) => {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, s - 12, s - 12);
    ctx.beginPath();
    ctx.moveTo(42, 92);
    ctx.lineTo(42, 46);
    ctx.lineTo(82, 46);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 14;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(96, 46);
    ctx.lineTo(74, 28);
    ctx.lineTo(74, 64);
    ctx.closePath();
    ctx.fillStyle = '#111827';
    ctx.fill();
  });

  return [speed50, roundabout, crosswalk, turnSign];
}

function createCountrysideTextures(maxAnisotropy: number) {
  // 1. Plowed agricultural soil with warm dark furrows
  const [soilCan, soilCtx] = makeCanvas(256, 256);
  soilCtx.fillStyle = '#5a402b';
  soilCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    soilCtx.fillStyle = '#47301e';
    soilCtx.fillRect(0, y, 256, 6);
    soilCtx.fillStyle = '#6f5138';
    soilCtx.fillRect(0, y + 7, 256, 5);
  }
  for (let i = 0; i < 2400; i++) {
    const px = (i * 73) % 256;
    const py = (i * 151) % 256;
    soilCtx.fillStyle = i % 2 === 0 ? 'rgba(30,18,10,0.22)' : 'rgba(135,102,70,0.18)';
    soilCtx.fillRect(px, py, 2, 2);
  }
  const plowedSoilAlbedo = configureTexture(soilCan, true, maxAnisotropy, 6, 6);

  // 2. Dirt / gravel farm road with dual wheel-rut tracks + matching normal map
  const [dirtCan, dirtCtx] = makeCanvas(256, 256);
  const [dirtHCan, dirtHCtx] = makeCanvas(256, 256);
  dirtCtx.fillStyle = '#9c7e5b';
  dirtCtx.fillRect(0, 0, 256, 256);
  dirtHCtx.fillStyle = '#909090';
  dirtHCtx.fillRect(0, 0, 256, 256);

  // Center grass/earth strip & two tire ruts
  dirtCtx.fillStyle = 'rgba(104, 122, 66, 0.35)';
  dirtCtx.fillRect(108, 0, 40, 256);
  dirtCtx.fillStyle = 'rgba(110, 84, 56, 0.45)';
  dirtCtx.fillRect(46, 0, 38, 256);
  dirtCtx.fillRect(172, 0, 38, 256);
  dirtHCtx.fillStyle = '#686868';
  dirtHCtx.fillRect(46, 0, 38, 256);
  dirtHCtx.fillRect(172, 0, 38, 256);

  // Gravel pebbles
  for (let i = 0; i < 2200; i++) {
    const px = (i * 89) % 256;
    const py = (i * 197) % 256;
    const sz = 1 + (i % 3);
    dirtCtx.fillStyle = i % 3 === 0 ? 'rgba(218,200,175,0.28)' : 'rgba(84,65,45,0.24)';
    dirtCtx.fillRect(px, py, sz, sz);
    dirtHCtx.fillStyle = i % 2 === 0 ? '#b8b8b8' : '#707070';
    dirtHCtx.fillRect(px, py, sz, sz);
  }
  const dirtRoadAlbedo = configureTexture(dirtCan, true, maxAnisotropy, 1, 2);
  const dirtRoadNormal = heightCanvasToNormalTexture(dirtHCan, 1.8, maxAnisotropy, 1, 2);

  // 3. Classic painted barn plank wood siding
  const [barnCan, barnCtx] = makeCanvas(256, 256);
  barnCtx.fillStyle = '#a82a23';
  barnCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    barnCtx.fillStyle = 'rgba(40, 8, 6, 0.28)';
    barnCtx.fillRect(x, 0, 2, 256);
    barnCtx.fillStyle = 'rgba(240, 120, 100, 0.14)';
    barnCtx.fillRect(x + 2, 0, 2, 256);
  }
  for (let y = 0; y < 256; y += 64) {
    barnCtx.fillStyle = 'rgba(55, 12, 10, 0.16)';
    barnCtx.fillRect(0, y, 256, 2);
  }
  const barnWoodAlbedo = configureTexture(barnCan, true, maxAnisotropy, 2, 2);

  // 4. Sunlit countryside meadow grass with clover & wildflower specks
  const [medCan, medCtx] = makeCanvas(256, 256);
  medCtx.fillStyle = '#539e48';
  medCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) {
    const px = (i * 67) % 256;
    const py = (i * 139) % 256;
    medCtx.fillStyle =
      i % 9 === 0
        ? 'rgba(248, 224, 96, 0.45)'
        : i % 2 === 0
          ? 'rgba(110, 185, 76, 0.25)'
          : 'rgba(42, 108, 42, 0.22)';
    medCtx.fillRect(px, py, 2, 3);
  }
  const countryMeadowAlbedo = configureTexture(medCan, true, maxAnisotropy, 18, 18);

  return {
    plowedSoilAlbedo,
    dirtRoadAlbedo,
    dirtRoadNormal,
    barnWoodAlbedo,
    countryMeadowAlbedo,
  };
}

export function createCityTextures(maxAnisotropy: number): ProceduralTextureSet {
  const road = createRoadTextures(maxAnisotropy);
  const roadBaseAlbedo = createRoadBaseTexture(maxAnisotropy);
  const roundaboutAlbedo = createRoundaboutTexture(maxAnisotropy);
  const sidewalk = createSidewalkTextures(maxAnisotropy);
  const parkGrassAlbedo = createParkGrassTexture(maxAnisotropy);
  const house = createHouseTextures(maxAnisotropy);
  const roadSigns = createRoadSignTextures(maxAnisotropy);
  const facades = createBuildingFacadeAssets(maxAnisotropy);
  const contactShadow = createContactShadowTexture();
  const country = createCountrysideTextures(maxAnisotropy);

  return {
    roadAlbedo: road.albedo,
    roadNormal: road.normal,
    roadRoughness: road.roughness,
    roadBaseAlbedo,
    roundaboutAlbedo,
    crosswalkAlbedo: road.crosswalk,
    sidewalkAlbedo: sidewalk.albedo,
    sidewalkNormal: sidewalk.normal,
    sidewalkRoughness: sidewalk.roughness,
    sidewalkPaverAlbedo: sidewalk.paverAlbedo,
    parkGrassAlbedo,
    roofTileAlbedo: house.roof,
    houseWallAlbedo: house.wall,
    roadSigns,
    buildingFacades: facades.albedos,
    buildingFacadeRoughness: facades.roughness,
    buildingFacadeNormal: facades.normal,
    contactShadow,
    plowedSoilAlbedo: country.plowedSoilAlbedo,
    dirtRoadAlbedo: country.dirtRoadAlbedo,
    dirtRoadNormal: country.dirtRoadNormal,
    barnWoodAlbedo: country.barnWoodAlbedo,
    countryMeadowAlbedo: country.countryMeadowAlbedo,
    dispose: () => {
      road.albedo.dispose();
      road.normal.dispose();
      road.roughness.dispose();
      roadBaseAlbedo.dispose();
      roundaboutAlbedo.dispose();
      road.crosswalk.dispose();
      sidewalk.albedo.dispose();
      sidewalk.normal.dispose();
      sidewalk.roughness.dispose();
      sidewalk.paverAlbedo.dispose();
      parkGrassAlbedo.dispose();
      house.roof.dispose();
      house.wall.dispose();
      roadSigns.forEach((t) => t.dispose());
      facades.albedos.forEach((t) => t.dispose());
      facades.roughness.dispose();
      facades.normal.dispose();
      contactShadow.dispose();
      country.plowedSoilAlbedo.dispose();
      country.dirtRoadAlbedo.dispose();
      country.dirtRoadNormal.dispose();
      country.barnWoodAlbedo.dispose();
      country.countryMeadowAlbedo.dispose();
    },
  };
}
