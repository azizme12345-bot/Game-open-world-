import * as THREE from 'three';

export type HumanPoseMode = 'locomotion' | 'sit_moto' | 'sit_tractor' | 'enter_exit' | 'arrested';

export interface HumanCharacterOptions {
  role: 'player' | 'police';
  contactShadowTex?: THREE.Texture;
  jacketColor?: number;
  shirtColor?: number;
  pantsColor?: number;
  skinColor?: number;
  hairColor?: number;
  eyeColor?: number;
  hairStyle?: number;
}

export interface SkeletalHumanHandle {
  group: THREE.Group;
  skeleton: THREE.Skeleton;
  mixer: THREE.AnimationMixer;
  update: (
    elapsedTime: number,
    dt: number,
    moveSpeed: number,
    isRunning: boolean,
    jumpOffset: number,
    poseMode: HumanPoseMode,
    steerHint?: number
  ) => void;
  dispose: () => void;
}

/**
 * Natural human skin tones ranging from fair/light to deep dark.
 */
export const HUMAN_SKIN_PALETTE: readonly number[] = [
  0xfce2cc, // very fair warm
  0xf3cbb0, // light peach
  0xe3ae86, // warm light-medium
  0xc88b5d, // olive / medium tan
  0xa86b42, // warm brown
  0x844e2e, // rich brown
  0x5a331d, // deep dark brown
];

/**
 * Computes a natural lip tone harmonized with any skin color (light to dark).
 */
export function deriveLipColor(skinHex: number): number {
  const skin = new THREE.Color(skinHex);
  const tint = new THREE.Color(0x9a4b47);
  skin.lerp(tint, 0.36);
  skin.multiplyScalar(0.86);
  return skin.getHex();
}

/**
 * Merges simple non-indexed or indexed BufferGeometries (matching position/uv) into one BufferGeometry.
 */
export function mergeSimpleGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const posList: number[] = [];
  const uvList: number[] = [];
  const idxList: number[] = [];
  let vertOffset = 0;

  for (const g of geos) {
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      posList.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (uv) {
        uvList.push(uv.getX(i), uv.getY(i));
      } else {
        uvList.push(0.5, 0.5);
      }
    }
    const idx = g.index;
    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        idxList.push(idx.getX(i) + vertOffset);
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        idxList.push(i + vertOffset);
      }
    }
    vertOffset += pos.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(posList, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvList, 2));
  out.setIndex(idxList);
  out.computeVertexNormals();
  return out;
}

/**
 * Generates a subtle procedural fabric weave texture for clothes & denim (128x128 <= 256x256).
 */
function createFabricTexture(baseHex: number, weaveDark = 0.08): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const col = new THREE.Color(baseHex);
  const r = Math.round(col.r * 255);
  const g = Math.round(col.g * 255);
  const b = Math.round(col.b * 255);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, 128, 128);

  const d = Math.round(255 * weaveDark);
  ctx.fillStyle = `rgba(${Math.max(0, r - d)},${Math.max(0, g - d)},${Math.max(0, b - d)},0.25)`;
  for (let y = 0; y < 128; y += 4) {
    ctx.fillRect(0, y, 128, 1);
  }
  ctx.fillStyle = `rgba(${Math.min(255, r + d)},${Math.min(255, g + d)},${Math.min(255, b + d)},0.16)`;
  for (let x = 0; x < 128; x += 4) {
    ctx.fillRect(x, 0, 1, 128);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

export interface LoftSection {
  y: number;
  rx: number;
  rz: number;
  cx?: number;
  cz?: number;
  /** Optional anatomical contour modulation around theta (0..2PI). */
  contour?: (cosT: number, sinT: number) => { mx: number; mz: number };
}

/**
 * Builds an unskinned smooth lofted BufferGeometry from cross-sections (used by pedestrians & accessories).
 */
export function createLoftedSectionGeo(
  sections: LoftSection[],
  radialSegs: number,
  capBottom = true,
  capTop = true
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringStride = radialSegs + 1;

  for (let r = 0; r < sections.length; r++) {
    const s = sections[r];
    const vCoord = r / Math.max(1, sections.length - 1);
    const cx = s.cx ?? 0;
    const cz = s.cz ?? 0;

    for (let c = 0; c <= radialSegs; c++) {
      const theta = (c / radialSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      let mx = 1;
      let mz = 1;
      if (s.contour) {
        const m = s.contour(cosT, sinT);
        mx = m.mx;
        mz = m.mz;
      }
      positions.push(cx + cosT * s.rx * mx, s.y, cz + sinT * s.rz * mz);
      uvs.push(c / radialSegs, vCoord);
    }
  }

  for (let r = 0; r < sections.length - 1; r++) {
    const rowA = r * ringStride;
    const rowB = (r + 1) * ringStride;
    for (let c = 0; c < radialSegs; c++) {
      const a = rowA + c;
      const b = rowA + c + 1;
      const d = rowB + c;
      const e = rowB + c + 1;
      indices.push(a, d, b);
      indices.push(b, d, e);
    }
  }

  if (capBottom && sections.length > 0) {
    const s = sections[0];
    const centerIdx = positions.length / 3;
    positions.push(s.cx ?? 0, s.y, s.cz ?? 0);
    uvs.push(0.5, 0);
    for (let c = 0; c < radialSegs; c++) {
      indices.push(centerIdx, c, c + 1);
    }
  }

  if (capTop && sections.length > 0) {
    const lastR = sections.length - 1;
    const s = sections[lastR];
    const centerIdx = positions.length / 3;
    positions.push(s.cx ?? 0, s.y, s.cz ?? 0);
    uvs.push(0.5, 1);
    const topRow = lastR * ringStride;
    for (let c = 0; c < radialSegs; c++) {
      indices.push(centerIdx, topRow + c + 1, topRow + c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Anatomical cross-section contour for human torso (chest pectorals, spinal groove, glute curve).
 * @param facingZ -1 for player/police (-Z forward), +1 for pedestrians (+Z forward)
 */
export function torsoContour(
  level: 'pelvis' | 'waist' | 'chest' | 'shoulder',
  facingZ: 1 | -1
) {
  return (cosT: number, sinT: number) => {
    const front = sinT * facingZ; // +1 at front, -1 at back
    const side = Math.abs(cosT);
    const centerLine = 1 - Math.min(1, side * 2.2);

    if (level === 'chest') {
      // Slight pectoral fullness in front-sides, subtle sternum dip in dead center, back lat/spine curve
      const pec = front > 0.25 ? 0.06 * front * (1 - centerLine * 0.85) : 0;
      const spineGroove = front < -0.5 ? -0.05 * centerLine * (-front) : 0;
      return { mx: 1 + 0.03 * side, mz: 1 + pec + spineGroove };
    }
    if (level === 'shoulder') {
      // Slightly squared trapezius/deltoid shoulder line
      return { mx: 1 + 0.04 * side, mz: 1 - 0.03 * Math.abs(front) };
    }
    if (level === 'pelvis') {
      // Subtle gluteal curve in back
      const glute = front < -0.25 ? 0.09 * (-front) * (1 - centerLine * 0.4) : 0;
      return { mx: 1 + 0.02 * side, mz: 1 + glute };
    }
    // Waist: slightly flatter front & back with natural oblique curve
    return { mx: 1, mz: 1 - 0.03 * Math.abs(front) * centerLine };
  };
}

/**
 * Builds a sculpted anatomical human head (~0.234m tall, ~0.166m wide, ~0.198m deep)
 * with brow ridge, eye sockets, cheekbones, tapered jaw, chin, sculpted nose & ears.
 * @param facingZ -1 for skeletal player/police, +1 for instanced pedestrians
 */
export function createAnatomicalHeadGeo(facingZ: 1 | -1): THREE.BufferGeometry {
  const skull = new THREE.SphereGeometry(0.10, 16, 12);
  const sp = skull.attributes.position;

  for (let i = 0; i < sp.count; i++) {
    let x = sp.getX(i);
    let y = sp.getY(i);
    let z = sp.getZ(i);

    // Base proportions: height 0.234m (y in [-0.117, +0.117]), narrower width, deeper skull
    x *= 0.84;
    y *= 1.17;
    z *= 0.99;

    const fz = z * facingZ; // + is front of face, - is back of skull
    const absX = Math.abs(x);

    // 1. Occiput (rounded back of skull) & forehead slope
    if (fz < 0 && y > -0.03) {
      const backLift = Math.max(0, 1 - Math.abs(y - 0.02) / 0.11);
      z -= facingZ * 0.008 * backLift;
    }
    if (fz > 0 && y > 0.03) {
      const foreheadSlope = Math.min(1, (y - 0.03) / 0.085);
      z -= facingZ * 0.015 * foreheadSlope * (fz / 0.1);
    }

    // 2. Flatten temples gently
    if (y > -0.015 && y < 0.07 && absX > 0.045) {
      const templeT = Math.min(1, (absX - 0.045) / 0.04);
      x *= 1 - 0.08 * templeT;
    }

    // 3. Subtle brow ridge above eyes
    if (fz > 0.055 && y > 0.016 && y < 0.042 && absX < 0.058) {
      const browW = Math.cos(((y - 0.028) / 0.014) * Math.PI * 0.5);
      const latW = 1 - absX / 0.058;
      z += facingZ * 0.006 * Math.max(0, browW) * latW;
    }

    // 4. Orbital eye-socket recesses so eyes sit inside the skull naturally
    if (fz > 0.055 && y > -0.012 && y < 0.022) {
      const dEye = Math.hypot((absX - 0.033) / 0.022, (y - 0.005) / 0.016);
      if (dEye < 1) {
        const recess = Math.cos(dEye * Math.PI * 0.5);
        z -= facingZ * 0.010 * recess;
      }
    }

    // 5. Zygomatic cheekbone prominence
    if (fz > 0.015 && y > -0.045 && y < 0.005 && absX > 0.025) {
      const dCheek = Math.hypot((absX - 0.052) / 0.028, (y + 0.02) / 0.025);
      if (dCheek < 1) {
        const ck = Math.cos(dCheek * Math.PI * 0.5);
        x += Math.sign(x) * 0.005 * ck;
        z += facingZ * 0.006 * ck;
      }
    }

    // 6. Jaw taper, under-jaw tuck & rounded chin
    if (y < -0.015) {
      const jawT = Math.min(1, (-y - 0.015) / 0.102);
      // Taper width toward chin, keeping jaw angle stronger further back
      const jawAngleKeep = fz > -0.01 && fz < 0.035 && y > -0.08 ? 0.14 : 0;
      x *= 1 - jawT * (0.44 - jawAngleKeep);

      // Tuck underside of back-jaw up toward the neck
      if (fz < 0.02) {
        const backT = Math.min(1, (0.02 - fz) / 0.11);
        y += backT * jawT * 0.024;
        z += facingZ * backT * jawT * 0.014;
      }

      // Distinct chin prominence in front center
      if (fz > 0.025 && y < -0.072 && absX < 0.034) {
        const chinW = (1 - absX / 0.034) * Math.min(1, (-y - 0.072) / 0.035);
        z += facingZ * 0.009 * chinW;
      }
    }

    sp.setXYZ(i, x, y, z);
  }
  skull.computeVertexNormals();

  // Sculpted Nose (bridge -> tip + nostril wings)
  const nosePts: LoftSection[] = [
    { y: -0.034, rx: 0.013, rz: 0.009, cz: facingZ * 0.095 },
    { y: -0.026, rx: 0.0135, rz: 0.012, cz: facingZ * 0.104 }, // tip/nostril width
    { y: -0.014, rx: 0.008, rz: 0.010, cz: facingZ * 0.100 },
    { y: 0.004, rx: 0.0065, rz: 0.008, cz: facingZ * 0.093 },
    { y: 0.018, rx: 0.006, rz: 0.006, cz: facingZ * 0.089 }, // glabella bridge
  ];
  const noseGeo = createLoftedSectionGeo(nosePts, 6, true, true);

  // Sculpted Ears (helix + lobe, angled slightly back)
  const earGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    const ear = new THREE.SphereGeometry(0.019, 6, 5);
    const ep = ear.attributes.position;
    for (let i = 0; i < ep.count; i++) {
      let ex = ep.getX(i) * 0.42;
      const ey = ep.getY(i) * 1.32;
      const ez = ep.getZ(i) * 0.72;
      // Slightly flare upper ear outward and tuck lobe inward
      if (ey > 0) ex += side * 0.002;
      ep.setXYZ(i, ex, ey, ez);
    }
    ear.rotateY(side * facingZ * -0.22);
    ear.translate(side * 0.084, -0.005, -facingZ * 0.006);
    earGeos.push(ear);
  }

  const merged = mergeSimpleGeometries([skull, noseGeo, ...earGeos]);
  skull.dispose();
  noseGeo.dispose();
  earGeos.forEach((e) => e.dispose());
  return merged;
}

/**
 * Builds a sculpted human hand (tapered palm + 4 curved separated fingers + opposable thumb)
 * pivoted at the wrist (0,0,0), extending downward along -Y.
 */
export function createSculptedHandGeo(side: -1 | 1, facingZ: 1 | -1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 1. Tapered anatomical palm (wrist -> mid-palm -> knuckle ridge)
  const palm = createLoftedSectionGeo(
    [
      { y: -0.068, rx: 0.032, rz: 0.012, cx: 0, cz: facingZ * 0.002 },
      { y: -0.042, rx: 0.034, rz: 0.014, cx: 0, cz: 0 },
      { y: -0.014, rx: 0.027, rz: 0.015, cx: 0, cz: 0 },
      { y: 0.006, rx: 0.022, rz: 0.015, cx: 0, cz: 0 },
    ],
    8,
    true,
    true
  );
  parts.push(palm);

  // 2. Four separated fingers along knuckle arch (middle longest, pinky lowest & shorter)
  const fingerSpecs = [
    { x: -side * 0.023, yBase: -0.064, len: 0.056, r: 0.0066, splay: -side * 0.06 }, // index
    { x: -side * 0.008, yBase: -0.066, len: 0.062, r: 0.0068, splay: -side * 0.01 }, // middle
    { x: side * 0.008, yBase: -0.065, len: 0.057, r: 0.0064, splay: side * 0.03 }, // ring
    { x: side * 0.022, yBase: -0.060, len: 0.045, r: 0.0056, splay: side * 0.09 }, // pinky
  ];

  for (const f of fingerSpecs) {
    const fg = createLoftedSectionGeo(
      [
        {
          y: f.yBase - f.len,
          rx: f.r * 0.72,
          rz: f.r * 0.72,
          cx: f.x + f.splay * 0.04,
          cz: facingZ * 0.016,
        },
        {
          y: f.yBase - f.len * 0.52,
          rx: f.r * 0.9,
          rz: f.r * 0.9,
          cx: f.x + f.splay * 0.02,
          cz: facingZ * 0.007,
        },
        { y: f.yBase + 0.005, rx: f.r, rz: f.r, cx: f.x, cz: facingZ * 0.002 },
      ],
      5,
      true,
      false
    );
    parts.push(fg);
  }

  // 3. Opposable thumb on inner edge (-side) angled naturally forward
  const innerDir = -side;
  const thumb = createLoftedSectionGeo(
    [
      { y: -0.064, rx: 0.0068, rz: 0.0068, cx: innerDir * 0.041, cz: facingZ * 0.026 },
      { y: -0.042, rx: 0.0085, rz: 0.0085, cx: innerDir * 0.036, cz: facingZ * 0.017 },
      { y: -0.016, rx: 0.0105, rz: 0.010, cx: innerDir * 0.022, cz: facingZ * 0.006 },
    ],
    5,
    true,
    true
  );
  parts.push(thumb);

  const merged = mergeSimpleGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Builds a real sculpted shoe (outsole with heel + arch + upper vamp + toe box + ankle collar).
 * Ankle pivot is at (0, 0, 0) and sole bottom touches y = -0.060 (or yShift).
 */
export function createSculptedShoeGeo(
  facingZ: 1 | -1,
  part: 'all' | 'sole' | 'upper',
  isBoot = false
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const collarTop = isBoot ? 0.032 : 0.006;

  if (part === 'all' || part === 'sole') {
    // Outsole + distinct heel block + subtle midfoot arch rise
    const solePts: { z: number; w: number; yBot: number; yTop: number }[] = [
      { z: -0.056, w: 0.033, yBot: -0.060, yTop: -0.040 }, // back of heel
      { z: -0.012, w: 0.034, yBot: -0.060, yTop: -0.041 }, // front of heel block
      { z: 0.026, w: 0.029, yBot: -0.054, yTop: -0.041 }, // midfoot arch
      { z: 0.075, w: 0.044, yBot: -0.060, yTop: -0.043 }, // ball of foot
      { z: 0.138, w: 0.036, yBot: -0.058, yTop: -0.044 }, // toe curve
      { z: 0.164, w: 0.016, yBot: -0.054, yTop: -0.045 }, // toe tip
    ];
    parts.push(buildShoeLoft(solePts, facingZ));
  }

  if (part === 'all' || part === 'upper') {
    const upperPts: { z: number; w: number; yBot: number; yTop: number }[] = [
      { z: -0.054, w: 0.032, yBot: -0.041, yTop: collarTop }, // heel counter
      { z: -0.008, w: 0.035, yBot: -0.042, yTop: collarTop + 0.004 }, // ankle opening
      { z: 0.035, w: 0.034, yBot: -0.042, yTop: 0.002 }, // instep / tongue slope
      { z: 0.082, w: 0.043, yBot: -0.044, yTop: -0.014 }, // vamp
      { z: 0.136, w: 0.034, yBot: -0.045, yTop: -0.026 }, // toe box
      { z: 0.161, w: 0.015, yBot: -0.046, yTop: -0.035 }, // rounded toe front
    ];
    parts.push(buildShoeLoft(upperPts, facingZ));
  }

  const merged = mergeSimpleGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

function buildShoeLoft(
  stations: { z: number; w: number; yBot: number; yTop: number }[],
  facingZ: 1 | -1
): THREE.BufferGeometry {
  const segs = 8;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = segs + 1;

  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const cy = (st.yBot + st.yTop) * 0.5;
    const ry = Math.max(0.004, (st.yTop - st.yBot) * 0.5);
    const cz = st.z * facingZ;
    const v = i / Math.max(1, stations.length - 1);

    for (let c = 0; c <= segs; c++) {
      const a = (c / segs) * Math.PI * 2;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      // Flatten bottom of shoe slightly for grounded sole contact
      const flatBot = sinA < 0 ? 0.78 : 1.08;
      const x = cosA * st.w;
      const y = cy + sinA * ry * flatBot;
      positions.push(x, y, cz);
      uvs.push(c / segs, v);
    }
  }

  // Note: along +Z or -Z affects winding; handle both cleanly
  for (let i = 0; i < stations.length - 1; i++) {
    const rA = i * stride;
    const rB = (i + 1) * stride;
    for (let c = 0; c < segs; c++) {
      const a = rA + c;
      const b = rA + c + 1;
      const d = rB + c;
      const e = rB + c + 1;
      if (facingZ > 0) {
        indices.push(a, b, d);
        indices.push(b, e, d);
      } else {
        indices.push(a, d, b);
        indices.push(b, d, e);
      }
    }
  }

  // Cap heel (0) and toe (last)
  const capStation = (stIdx: number, flip: boolean) => {
    const st = stations[stIdx];
    const centerIdx = positions.length / 3;
    positions.push(0, (st.yBot + st.yTop) * 0.5, st.z * facingZ);
    uvs.push(0.5, stIdx === 0 ? 0 : 1);
    const row = stIdx * stride;
    for (let c = 0; c < segs; c++) {
      if (flip) indices.push(centerIdx, row + c, row + c + 1);
      else indices.push(centerIdx, row + c + 1, row + c);
    }
  };
  capStation(0, facingZ > 0);
  capStation(stations.length - 1, facingZ < 0);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Helper to create a tapered hair strand lock between control points.
 */
function createHairLockGeo(
  pts: [number, number, number][],
  radiiX: number[],
  radiiZ: number[]
): THREE.BufferGeometry {
  const segs = 5;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = segs + 1;
  const upRef = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();

  for (let i = 0; i < pts.length; i++) {
    const curr = new THREE.Vector3(...pts[i]);
    const prev = i > 0 ? new THREE.Vector3(...pts[i - 1]) : curr;
    const next = i < pts.length - 1 ? new THREE.Vector3(...pts[i + 1]) : curr;
    tangent.subVectors(next, prev).normalize();
    if (tangent.lengthSq() < 0.0001) tangent.set(0, -1, 0);
    if (Math.abs(tangent.dot(upRef)) > 0.94) {
      normal.set(1, 0, 0).cross(tangent).normalize();
    } else {
      normal.copy(upRef).cross(tangent).normalize();
    }
    binormal.crossVectors(tangent, normal).normalize();

    const rx = radiiX[i];
    const rz = radiiZ[i];
    for (let c = 0; c <= segs; c++) {
      const a = (c / segs) * Math.PI * 2;
      const vx = curr.x + normal.x * Math.cos(a) * rx + binormal.x * Math.sin(a) * rz;
      const vy = curr.y + normal.y * Math.cos(a) * rx + binormal.y * Math.sin(a) * rz;
      const vz = curr.z + normal.z * Math.cos(a) * rx + binormal.z * Math.sin(a) * rz;
      positions.push(vx, vy, vz);
      uvs.push(c / segs, i / Math.max(1, pts.length - 1));
    }
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const rA = i * stride;
    const rB = (i + 1) * stride;
    for (let c = 0; c < segs; c++) {
      indices.push(rA + c, rB + c, rA + c + 1);
      indices.push(rA + c + 1, rB + c, rB + c + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a contoured scalp cap carved specifically along the human hairline (never covering the face/eyes).
 */
function createHairlineScalpGeo(
  facingZ: 1 | -1,
  topBulge = 0.016,
  napeLength = 0.035,
  templeCoverage = 0.025
): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.106, 13, 9, 0, Math.PI * 2, 0, Math.PI * 0.72);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * 0.87;
    let y = pos.getY(i) * 1.15;
    let z = pos.getZ(i) * 1.02;

    const fz = z * facingZ;
    // Lift front hairline above forehead/brows so face is completely clear
    if (fz > 0.015) {
      const frontT = Math.min(1, (fz - 0.015) / 0.085);
      y = Math.max(y, 0.038 + frontT * 0.025);
      z -= facingZ * frontT * 0.006;
    }
    // Taper down at nape in the back
    if (fz < -0.02) {
      const backT = Math.min(1, (-fz - 0.02) / 0.08);
      if (y < 0.01) y -= backT * napeLength;
    }
    // Sideburns / temple framing
    if (Math.abs(x) > 0.065 && fz > -0.02 && fz < 0.03 && y < 0.02) {
      y -= templeCoverage;
    }
    // Crown volume
    if (y > 0.04) {
      y += topBulge * ((y - 0.04) / 0.08);
    }

    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Generates 5 distinct realistic hairstyles (or neat police cap-under-hair when styleIndex === -1).
 * 0 = Short side-parted hair
 * 1 = Textured fringe / cropped bangs
 * 2 = Longer shoulder-skimming layered hair
 * 3 = Sleek pulled-back bun
 * 4 = Wavy / curly fuller crop
 */
export function createHairStyleGeo(styleIndex: number, facingZ: 1 | -1): THREE.BufferGeometry {
  const f = facingZ;
  const parts: THREE.BufferGeometry[] = [];

  if (styleIndex === -1) {
    // Neat short tapered haircut beneath police cap (kept below y = 0.06 so zero clipping with cap)
    const capBase = createHairlineScalpGeo(f, -0.005, 0.025, 0.022);
    const cp = capBase.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      if (cp.getY(i) > 0.058) cp.setY(i, 0.058);
    }
    capBase.computeVertexNormals();
    parts.push(capBase);
    const merged = mergeSimpleGeometries(parts);
    parts.forEach((p) => p.dispose());
    return merged;
  }

  const style = ((Math.floor(styleIndex) % 5) + 5) % 5;

  if (style === 0) {
    // Style 0: Short Hair with Side Parting
    parts.push(createHairlineScalpGeo(f, 0.02, 0.032, 0.028));
    // Swept parted locks going from left part (-0.048) across to right temple (+0.07)
    const sweeps = [
      { zOff: 0.062, yTop: 0.118, yEnd: 0.072, r: 0.017 },
      { zOff: 0.078, yTop: 0.106, yEnd: 0.060, r: 0.015 },
      { zOff: 0.042, yTop: 0.125, yEnd: 0.084, r: 0.018 },
      { zOff: 0.016, yTop: 0.128, yEnd: 0.088, r: 0.018 },
    ];
    for (const sw of sweeps) {
      parts.push(
        createHairLockGeo(
          [
            [-0.052, sw.yTop - 0.01, f * sw.zOff],
            [-0.008, sw.yTop + 0.008, f * (sw.zOff + 0.008)],
            [0.044, sw.yTop - 0.008, f * (sw.zOff - 0.004)],
            [0.078, sw.yEnd, f * (sw.zOff - 0.022)],
          ],
          [sw.r * 0.7, sw.r * 1.1, sw.r * 0.95, sw.r * 0.45],
          [sw.r * 0.65, sw.r * 0.9, sw.r * 0.85, sw.r * 0.4]
        )
      );
    }
    // Subtle left side tuck
    parts.push(
      createHairLockGeo(
        [
          [-0.056, 0.102, f * 0.048],
          [-0.082, 0.065, f * 0.032],
          [-0.086, 0.015, f * 0.012],
        ],
        [0.013, 0.014, 0.008],
        [0.016, 0.015, 0.009]
      )
    );
  } else if (style === 1) {
    // Style 1: Textured Fringe / Forward Bangs
    parts.push(createHairlineScalpGeo(f, 0.022, 0.035, 0.032));
    const fringeXs = [-0.056, -0.032, -0.008, 0.016, 0.040, 0.060];
    fringeXs.forEach((fx, idx) => {
      const lenDrop = idx % 2 === 0 ? 0.044 : 0.054;
      const sway = (idx - 2.5) * 0.005;
      parts.push(
        createHairLockGeo(
          [
            [fx * 0.75, 0.115, f * 0.03],
            [fx * 0.95, 0.095, f * 0.082],
            [fx + sway, lenDrop, f * 0.096],
          ],
          [0.016, 0.015, 0.007],
          [0.014, 0.012, 0.006]
        )
      );
    });
  } else if (style === 2) {
    // Style 2: Longer Layered Shoulder-Skimming Hair
    parts.push(createHairlineScalpGeo(f, 0.022, 0.065, 0.045));
    // Draped back curtain of hair extending behind neck
    const backCols = [-0.068, -0.042, -0.014, 0.014, 0.042, 0.068];
    backCols.forEach((bx, idx) => {
      const tipY = -0.135 - (idx === 2 || idx === 3 ? 0.028 : 0.008);
      const backZ = -0.082 - (1 - Math.abs(bx) / 0.08) * 0.025;
      parts.push(
        createHairLockGeo(
          [
            [bx * 0.8, 0.09, f * -0.02],
            [bx, 0.01, f * backZ],
            [bx * 1.05, -0.075, f * (backZ - 0.008)],
            [bx * 1.02, tipY, f * (backZ + 0.004)],
          ],
          [0.022, 0.024, 0.021, 0.009],
          [0.020, 0.021, 0.018, 0.008]
        )
      );
    });
    // Cheek-framing front side locks
    for (const side of [-1, 1] as const) {
      parts.push(
        createHairLockGeo(
          [
            [side * 0.045, 0.108, f * 0.055],
            [side * 0.085, 0.048, f * 0.052],
            [side * 0.088, -0.035, f * 0.036],
            [side * 0.074, -0.105, f * 0.022],
          ],
          [0.017, 0.019, 0.016, 0.007],
          [0.018, 0.019, 0.016, 0.007]
        )
      );
    }
  } else if (style === 3) {
    // Style 3: Sleek Pulled-Back Hair with Rear Bun
    parts.push(createHairlineScalpGeo(f, 0.008, 0.02, 0.016));
    // Sculpted coiled bun at upper occiput
    const bunCenterZ = f * -0.104;
    const bunGeo = new THREE.SphereGeometry(0.048, 9, 7);
    bunGeo.scale(1.06, 0.92, 0.88);
    bunGeo.translate(0, 0.032, bunCenterZ);
    parts.push(bunGeo);
    // Hair tie / wrap around bun base
    const wrapRing = createHairLockGeo(
      [
        [-0.036, 0.032, f * -0.088],
        [0, 0.068, f * -0.092],
        [0.036, 0.032, f * -0.088],
        [0, -0.002, f * -0.092],
        [-0.036, 0.032, f * -0.088],
      ],
      [0.011, 0.012, 0.011, 0.012, 0.011],
      [0.011, 0.012, 0.011, 0.012, 0.011]
    );
    parts.push(wrapRing);
    // Soft face-framing wisps at temples
    for (const side of [-1, 1] as const) {
      parts.push(
        createHairLockGeo(
          [
            [side * 0.076, 0.055, f * 0.042],
            [side * 0.084, 0.012, f * 0.034],
            [side * 0.078, -0.025, f * 0.024],
          ],
          [0.008, 0.007, 0.003],
          [0.009, 0.008, 0.003]
        )
      );
    }
  } else {
    // Style 4: Wavy / Curly Fuller Crop
    parts.push(createHairlineScalpGeo(f, 0.024, 0.04, 0.032));
    const curlCoords: [number, number, number, number][] = [
      [0, 0.125, 0.03, 0.036],
      [-0.044, 0.114, 0.045, 0.032],
      [0.044, 0.114, 0.045, 0.032],
      [-0.066, 0.082, 0.02, 0.030],
      [0.066, 0.082, 0.02, 0.030],
      [-0.035, 0.105, -0.042, 0.034],
      [0.035, 0.105, -0.042, 0.034],
      [0, 0.088, -0.078, 0.036],
      [-0.052, 0.048, -0.072, 0.031],
      [0.052, 0.048, -0.072, 0.031],
      [0, 0.095, 0.074, 0.028],
    ];
    for (const [cx, cy, cz, r] of curlCoords) {
      const cGeo = new THREE.SphereGeometry(r, 6, 5);
      cGeo.scale(1.05, 0.88, 1.02);
      cGeo.translate(cx, cy, f * cz);
      parts.push(cGeo);
    }
  }

  const merged = mergeSimpleGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

interface TubeSection {
  y: number;
  rx: number;
  rz: number;
  cx?: number;
  cz?: number;
  b0: number;
  w0: number;
  b1: number;
  w1: number;
  matIdx: number;
  contour?: (cosT: number, sinT: number) => { mx: number; mz: number };
  /** Half-width in X on front (-Z) torso where shirt shows through jacket */
  shirtVWidth?: number;
}

/**
 * Builds an organic multi-material SkinnedMesh from smooth anatomical cross-sections
 * so torso, waist, neck, arms, wrists, thighs, calves, and ankles deform seamlessly across joints.
 */
function appendSkinnedLimb(
  sections: TubeSection[],
  radialSegs: number,
  positions: number[],
  uvs: number[],
  skinIndices: number[],
  skinWeights: number[],
  indicesByMat: number[][],
  capBottom = true,
  capTop = true
) {
  const baseVertex = positions.length / 3;
  const ringStride = radialSegs + 1;
  const ringCoords: { x: number; z: number }[][] = [];

  for (let r = 0; r < sections.length; r++) {
    const s = sections[r];
    const vCoord = r / Math.max(1, sections.length - 1);
    const cx = s.cx ?? 0;
    const cz = s.cz ?? 0;
    const rowCoords: { x: number; z: number }[] = [];

    for (let c = 0; c <= radialSegs; c++) {
      const theta = (c / radialSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      let mx = 1;
      let mz = 1;
      if (s.contour) {
        const m = s.contour(cosT, sinT);
        mx = m.mx;
        mz = m.mz;
      }
      const x = cx + cosT * s.rx * mx;
      const z = cz + sinT * s.rz * mz;
      positions.push(x, s.y, z);
      uvs.push(c / radialSegs, vCoord);
      skinIndices.push(s.b0, s.b1, 0, 0);
      skinWeights.push(s.w0, s.w1, 0, 0);
      rowCoords.push({ x, z });
    }
    ringCoords.push(rowCoords);
  }

  for (let r = 0; r < sections.length - 1; r++) {
    const secA = sections[r];
    const secB = sections[r + 1];
    const vWidth = ((secA.shirtVWidth ?? 0) + (secB.shirtVWidth ?? 0)) * 0.5;
    const rowA = baseVertex + r * ringStride;
    const rowB = baseVertex + (r + 1) * ringStride;
    for (let c = 0; c < radialSegs; c++) {
      let matIdx = secA.matIdx;
      if (vWidth > 0.002) {
        const midX = (ringCoords[r][c].x + ringCoords[r][c + 1].x) * 0.5;
        const midZ = (ringCoords[r][c].z + ringCoords[r][c + 1].z) * 0.5;
        // Front is -Z
        if (midZ < -0.02 && Math.abs(midX) < vWidth) {
          matIdx = 3; // shirtMat
        }
      }
      const target = indicesByMat[matIdx];
      const a = rowA + c;
      const b = rowA + c + 1;
      const d = rowB + c;
      const e = rowB + c + 1;
      target.push(a, d, b);
      target.push(b, d, e);
    }
  }

  if (capBottom && sections.length > 0) {
    const s = sections[0];
    const centerIdx = positions.length / 3;
    positions.push(s.cx ?? 0, s.y, s.cz ?? 0);
    uvs.push(0.5, 0);
    skinIndices.push(s.b0, s.b1, 0, 0);
    skinWeights.push(s.w0, s.w1, 0, 0);
    const target = indicesByMat[s.matIdx];
    for (let c = 0; c < radialSegs; c++) {
      target.push(centerIdx, baseVertex + c, baseVertex + c + 1);
    }
  }

  if (capTop && sections.length > 0) {
    const lastR = sections.length - 1;
    const s = sections[lastR];
    const centerIdx = positions.length / 3;
    positions.push(s.cx ?? 0, s.y, s.cz ?? 0);
    uvs.push(0.5, 1);
    skinIndices.push(s.b0, s.b1, 0, 0);
    skinWeights.push(s.w0, s.w1, 0, 0);
    const topRow = baseVertex + lastR * ringStride;
    const target = indicesByMat[s.matIdx];
    for (let c = 0; c < radialSegs; c++) {
      target.push(centerIdx, topRow + c + 1, topRow + c);
    }
  }
}

export function createSkeletalHumanCharacter(
  options: HumanCharacterOptions
): SkeletalHumanHandle {
  const isPolice = options.role === 'police';
  const root = new THREE.Group();
  root.name = isPolice ? 'PoliceHumanCharacter' : 'PlayerHumanCharacter';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  // --- Textures & PBR Materials ---
  const jacketColor = options.jacketColor ?? (isPolice ? 0x1e3a8a : 0x0284c7);
  const pantsColor = options.pantsColor ?? (isPolice ? 0x111827 : 0x1e293b);
  const skinColor = options.skinColor ?? (isPolice ? 0xe3ae86 : 0xf3cbb0);
  const hairColor = options.hairColor ?? (isPolice ? 0x1e1b18 : 0x201815);
  const eyeColor = options.eyeColor ?? (isPolice ? 0x2c4a6e : 0x1d6fa5);

  const jacketTex = trackTex(createFabricTexture(jacketColor, 0.1));
  const pantsTex = trackTex(createFabricTexture(pantsColor, 0.12));

  // Mat 0: Skin, Mat 1: Jacket/Uniform, Mat 2: Pants, Mat 3: Inner Shirt
  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.58,
      metalness: 0.02,
    })
  );
  const jacketMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: jacketTex,
      roughness: 0.68,
      metalness: 0.04,
    })
  );
  const pantsMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: pantsTex,
      roughness: 0.78,
      metalness: 0.02,
    })
  );
  const shirtMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: options.shirtColor ?? (isPolice ? 0xe2e8f0 : 0xf8fafc),
      roughness: 0.72,
    })
  );
  const hairMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: hairColor,
      roughness: 0.56,
      metalness: 0.08,
    })
  );
  const scleraMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.24 })
  );
  const irisMat = trackMat(
    new THREE.MeshStandardMaterial({ color: eyeColor, roughness: 0.18, metalness: 0.1 })
  );
  const pupilMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.12 })
  );
  const lashMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x161210, roughness: 0.55 })
  );
  const lipMat = trackMat(
    new THREE.MeshStandardMaterial({ color: deriveLipColor(skinColor), roughness: 0.48 })
  );
  const beltMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.42, metalness: 0.18 })
  );
  const goldMetalMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.86, roughness: 0.22 })
  );
  const shoeUpperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isPolice ? 0x111827 : 0x0f172a,
      roughness: isPolice ? 0.34 : 0.48,
      metalness: 0.1,
    })
  );
  const shoeSoleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isPolice ? 0x020617 : 0xf8fafc,
      roughness: 0.72,
    })
  );

  // Optional Contact Shadow
  let shadowMesh: THREE.Mesh | null = null;
  if (options.contactShadowTex) {
    const shadowGeo = trackGeo(new THREE.PlaneGeometry(0.92, 0.92));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: options.contactShadowTex,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      })
    );
    shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.y = 0.02;
    root.add(shadowMesh);
  }

  // --- 1. Bone Hierarchy (17 Anatomical Bones — Exact Original Names) ---
  const B = {
    Hips: 0,
    Spine: 1,
    Chest: 2,
    Neck: 3,
    Head: 4,
    UpperArmL: 5,
    ForearmL: 6,
    HandL: 7,
    UpperArmR: 8,
    ForearmR: 9,
    HandR: 10,
    ThighL: 11,
    ShinL: 12,
    FootL: 13,
    ThighR: 14,
    ShinR: 15,
    FootR: 16,
  } as const;

  const bones: THREE.Bone[] = [];
  const mkBone = (name: string, x: number, y: number, z: number, parent?: THREE.Bone) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(x, y, z);
    if (parent) parent.add(bone);
    bones.push(bone);
    return bone;
  };

  // Bind-pose height ~1.75m total, head height ~0.234m (1/7.5 of body height)
  const hips = mkBone('Hips', 0, 0.9, 0);
  const spine = mkBone('Spine', 0, 0.14, 0, hips); // y = 1.04
  const chest = mkBone('Chest', 0, 0.22, 0, spine); // y = 1.26
  const neck = mkBone('Neck', 0, 0.21, 0, chest); // y = 1.47
  const headBone = mkBone('Head', 0, 0.09, 0, neck); // y = 1.56

  const upperArmL = mkBone('UpperArmL', -0.205, 0.15, 0, chest); // y = 1.41
  const forearmL = mkBone('ForearmL', 0, -0.27, 0, upperArmL); // y = 1.14
  const handL = mkBone('HandL', 0, -0.25, 0, forearmL); // y = 0.89

  const upperArmR = mkBone('UpperArmR', 0.205, 0.15, 0, chest); // y = 1.41
  const forearmR = mkBone('ForearmR', 0, -0.27, 0, upperArmR); // y = 1.14
  const handR = mkBone('HandR', 0, -0.25, 0, forearmR); // y = 0.89

  const thighL = mkBone('ThighL', -0.095, -0.04, 0, hips); // y = 0.86
  const shinL = mkBone('ShinL', 0, -0.4, 0, thighL); // y = 0.46
  const footL = mkBone('FootL', 0, -0.4, 0, shinL); // y = 0.06

  const thighR = mkBone('ThighR', 0.095, -0.04, 0, hips); // y = 0.86
  const shinR = mkBone('ShinR', 0, -0.4, 0, thighR); // y = 0.46
  const footR = mkBone('FootR', 0, -0.4, 0, shinR); // y = 0.06

  const skeleton = new THREE.Skeleton(bones);

  // --- 2. Continuous Organic Skinned Body Geometry ---
  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indicesByMat: number[][] = [[], [], [], []]; // [skin, jacket, pants, shirt]

  // Torso + Neck (pelvis -> hips -> tapered waist -> broad ribcage/chest -> shoulders -> trapezius -> neck)
  // Neck attaches slightly toward +Z (back half of skull) so chin overhangs naturally
  appendSkinnedLimb(
    [
      {
        y: 0.79,
        rx: 0.145,
        rz: 0.105,
        b0: B.Hips,
        w0: 1.0,
        b1: B.Hips,
        w1: 0,
        matIdx: 2,
        contour: torsoContour('pelvis', -1),
      },
      {
        y: 0.89,
        rx: 0.162,
        rz: 0.118,
        b0: B.Hips,
        w0: 0.9,
        b1: B.Spine,
        w1: 0.1,
        matIdx: 2,
        contour: torsoContour('pelvis', -1),
      },
      {
        // Jacket hem step overlapping trouser waist cleanly
        y: 0.905,
        rx: 0.168,
        rz: 0.122,
        b0: B.Hips,
        w0: 0.82,
        b1: B.Spine,
        w1: 0.18,
        matIdx: 1,
        contour: torsoContour('waist', -1),
      },
      {
        y: 1.04,
        rx: 0.136,
        rz: 0.104,
        b0: B.Spine,
        w0: 0.78,
        b1: B.Hips,
        w1: 0.22,
        matIdx: 1,
        contour: torsoContour('waist', -1),
        shirtVWidth: isPolice ? 0 : 0.012,
      },
      {
        y: 1.2,
        rx: 0.172,
        rz: 0.122,
        b0: B.Spine,
        w0: 0.3,
        b1: B.Chest,
        w1: 0.7,
        matIdx: 1,
        contour: torsoContour('chest', -1),
        shirtVWidth: isPolice ? 0.012 : 0.032,
      },
      {
        y: 1.34,
        rx: 0.194,
        rz: 0.128,
        b0: B.Chest,
        w0: 0.94,
        b1: B.Spine,
        w1: 0.06,
        matIdx: 1,
        contour: torsoContour('chest', -1),
        shirtVWidth: isPolice ? 0.032 : 0.052,
      },
      {
        y: 1.43,
        rx: 0.15,
        rz: 0.1,
        b0: B.Chest,
        w0: 0.75,
        b1: B.Neck,
        w1: 0.25,
        matIdx: 1,
        contour: torsoContour('shoulder', -1),
        shirtVWidth: 0.055,
      },
      {
        y: 1.465,
        rx: 0.072,
        rz: 0.066,
        cz: 0.008,
        b0: B.Neck,
        w0: 0.75,
        b1: B.Chest,
        w1: 0.25,
        matIdx: 0,
      },
      {
        y: 1.525,
        rx: 0.05,
        rz: 0.052,
        cz: 0.014,
        b0: B.Neck,
        w0: 0.7,
        b1: B.Head,
        w1: 0.3,
        matIdx: 0,
      },
      {
        y: 1.59,
        rx: 0.048,
        rz: 0.05,
        cz: 0.015,
        b0: B.Head,
        w0: 0.65,
        b1: B.Neck,
        w1: 0.35,
        matIdx: 0,
      },
    ],
    16,
    positions,
    uvs,
    skinIndices,
    skinWeights,
    indicesByMat
  );

  // Arms (deltoid shoulder -> bicep -> elbow -> tapered forearm -> cuff lip -> slim wrist)
  const buildArmGeo = (side: -1 | 1, bUp: number, bLow: number, bHand: number) => {
    const cx = side * 0.205;
    appendSkinnedLimb(
      [
        { y: 0.89, rx: 0.027, rz: 0.021, cx, cz: -0.008, b0: bHand, w0: 0.85, b1: bLow, w1: 0.15, matIdx: 0 },
        { y: 0.945, rx: 0.032, rz: 0.029, cx, cz: -0.006, b0: bLow, w0: 0.85, b1: bHand, w1: 0.15, matIdx: 0 },
        { y: 0.955, rx: 0.039, rz: 0.037, cx, cz: -0.006, b0: bLow, w0: 0.9, b1: bUp, w1: 0.1, matIdx: 1 }, // sleeve cuff
        { y: 1.07, rx: 0.045, rz: 0.043, cx, cz: -0.004, b0: bLow, w0: 0.75, b1: bUp, w1: 0.25, matIdx: 1 },
        { y: 1.15, rx: 0.041, rz: 0.04, cx, cz: 0.002, b0: bUp, w0: 0.55, b1: bLow, w1: 0.45, matIdx: 1 }, // elbow
        { y: 1.28, rx: 0.051, rz: 0.049, cx, cz: 0, b0: bUp, w0: 0.92, b1: bLow, w1: 0.08, matIdx: 1 }, // bicep
        { y: 1.4, rx: 0.058, rz: 0.056, cx: side * 0.198, cz: 0, b0: bUp, w0: 0.65, b1: B.Chest, w1: 0.35, matIdx: 1 }, // deltoid
        { y: 1.435, rx: 0.046, rz: 0.046, cx: side * 0.17, cz: 0, b0: B.Chest, w0: 0.8, b1: bUp, w1: 0.2, matIdx: 1 },
      ],
      10,
      positions,
      uvs,
      skinIndices,
      skinWeights,
      indicesByMat
    );
  };
  buildArmGeo(-1, B.UpperArmL, B.ForearmL, B.HandL);
  buildArmGeo(1, B.UpperArmR, B.ForearmR, B.HandR);

  // Legs (thick upper thigh -> tapered knee -> natural calf bulge shifted slightly +Z -> slim ankle)
  const buildLegGeo = (side: -1 | 1, bThigh: number, bShin: number, bFoot: number) => {
    const cx = side * 0.095;
    appendSkinnedLimb(
      [
        { y: 0.065, rx: 0.036, rz: 0.039, cx, cz: 0.002, b0: bFoot, w0: 0.72, b1: bShin, w1: 0.28, matIdx: 2 }, // ankle
        { y: 0.16, rx: 0.043, rz: 0.046, cx, cz: 0.006, b0: bShin, w0: 0.94, b1: bFoot, w1: 0.06, matIdx: 2 },
        { y: 0.32, rx: 0.058, rz: 0.066, cx, cz: 0.011, b0: bShin, w0: 1.0, b1: bShin, w1: 0, matIdx: 2 }, // calf bulge
        { y: 0.46, rx: 0.055, rz: 0.058, cx, cz: 0, b0: bShin, w0: 0.52, b1: bThigh, w1: 0.48, matIdx: 2 }, // knee
        { y: 0.66, rx: 0.075, rz: 0.078, cx, cz: 0, b0: bThigh, w0: 0.95, b1: bShin, w1: 0.05, matIdx: 2 }, // mid thigh
        { y: 0.85, rx: 0.088, rz: 0.091, cx, cz: 0.002, b0: bThigh, w0: 0.68, b1: B.Hips, w1: 0.32, matIdx: 2 }, // upper thigh
      ],
      10,
      positions,
      uvs,
      skinIndices,
      skinWeights,
      indicesByMat
    );
  };
  buildLegGeo(-1, B.ThighL, B.ShinL, B.FootL);
  buildLegGeo(1, B.ThighR, B.ShinR, B.FootR);

  const bodyGeo = trackGeo(new THREE.BufferGeometry());
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bodyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const mergedIndices: number[] = [];
  let indexOffset = 0;
  indicesByMat.forEach((arr, matIdx) => {
    mergedIndices.push(...arr);
    bodyGeo.addGroup(indexOffset, arr.length, matIdx);
    indexOffset += arr.length;
  });
  bodyGeo.setIndex(mergedIndices);
  bodyGeo.computeVertexNormals();

  const bodyMesh = new THREE.SkinnedMesh(bodyGeo, [skinMat, jacketMat, pantsMat, shirtMat]);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.frustumCulled = false;
  bodyMesh.add(hips);
  bodyMesh.bind(skeleton);

  const charBodyGroup = new THREE.Group();
  charBodyGroup.add(bodyMesh);
  root.add(charBodyGroup);

  // --- 3. Anatomical Head, Sculpted Face, Eyes, Eyebrows, Lips & Real Hair on Head Bone ---
  // Head bone is at y = 1.56 in bind pose; cranium center sits +0.075 above head bone (y = 1.635, crown ~1.752m)
  const headRig = new THREE.Group();
  headRig.position.set(0, 0.075, 0);
  headBone.add(headRig);

  const skullGeo = trackGeo(createAnatomicalHeadGeo(-1));
  const cranium = new THREE.Mesh(skullGeo, skinMat);
  cranium.castShadow = true;
  headRig.add(cranium);

  // Detailed Natural Eyes (almond sclera, upper lash arc, iris keeping options.eyeColor, pupil, catchlight, sculpted brow)
  const eyeSocketGeo = trackGeo(new THREE.SphereGeometry(0.0155, 8, 6));
  eyeSocketGeo.scale(1.18, 0.72, 0.46);
  const irisGeo = trackGeo(new THREE.SphereGeometry(0.0098, 8, 6));
  irisGeo.scale(0.95, 1.0, 0.36);
  const pupilGeo = trackGeo(new THREE.SphereGeometry(0.0054, 6, 5));
  pupilGeo.scale(1, 1, 0.36);
  const catchlightGeo = trackGeo(new THREE.SphereGeometry(0.0022, 5, 4));
  const lashGeo = trackGeo(new THREE.TorusGeometry(0.015, 0.0022, 3, 6, Math.PI * 0.85));
  const browGeo = trackGeo(
    createHairLockGeo(
      [
        [-0.018, -0.002, 0.003],
        [-0.004, 0.004, 0],
        [0.016, 0.001, 0.004],
      ],
      [0.0045, 0.004, 0.0022],
      [0.0035, 0.0035, 0.002]
    )
  );

  [-1, 1].forEach((side) => {
    const ex = side * 0.033;
    const sclera = new THREE.Mesh(eyeSocketGeo, scleraMat);
    sclera.position.set(ex, 0.006, -0.087);
    sclera.rotation.y = side * -0.15;
    headRig.add(sclera);

    const lash = new THREE.Mesh(lashGeo, lashMat);
    lash.position.set(ex, 0.007, -0.09);
    lash.rotation.z = Math.PI * 0.08;
    lash.rotation.y = side * -0.15;
    headRig.add(lash);

    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.set(ex, 0.006, -0.093);
    headRig.add(iris);

    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(ex, 0.006, -0.0955);
    headRig.add(pupil);

    const spec = new THREE.Mesh(catchlightGeo, scleraMat);
    spec.position.set(ex + 0.0035, 0.0095, -0.0968);
    headRig.add(spec);

    const brow = new THREE.Mesh(browGeo, hairMat);
    brow.position.set(ex, 0.03, -0.092);
    brow.scale.x = side;
    brow.rotation.y = side * -0.16;
    headRig.add(brow);
  });

  // Sculpted Upper & Lower Lips
  const upperLipGeo = trackGeo(
    createHairLockGeo(
      [
        [-0.019, -0.002, 0.007],
        [-0.007, 0.0025, 0.001],
        [0, 0.001, 0],
        [0.007, 0.0025, 0.001],
        [0.019, -0.002, 0.007],
      ],
      [0.002, 0.004, 0.0036, 0.004, 0.002],
      [0.002, 0.004, 0.0036, 0.004, 0.002]
    )
  );
  const lowerLipGeo = trackGeo(
    createHairLockGeo(
      [
        [-0.016, -0.002, 0.007],
        [0, -0.005, 0.001],
        [0.016, -0.002, 0.007],
      ],
      [0.0022, 0.0046, 0.0022],
      [0.0022, 0.0046, 0.0022]
    )
  );
  const mouthGroup = new THREE.Group();
  mouthGroup.position.set(0, -0.056, -0.089);
  mouthGroup.add(new THREE.Mesh(upperLipGeo, lipMat));
  mouthGroup.add(new THREE.Mesh(lowerLipGeo, lipMat));
  headRig.add(mouthGroup);

  // Real Hairstyle (Police: neat tapered under-cap cut; Player: styled short hair with side parting or options.hairStyle)
  const hairStyleIdx = isPolice ? -1 : options.hairStyle ?? 0;
  const hairGeo = trackGeo(createHairStyleGeo(hairStyleIdx, -1));
  const hairMesh = new THREE.Mesh(hairGeo, hairMat);
  hairMesh.castShadow = true;
  headRig.add(hairMesh);

  if (isPolice) {
    // Peaked Police Patrol Cap + Band + Visor + Gold Shield Emblem
    const capCrown = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.128, 0.104, 0.068, 16)),
      jacketMat
    );
    capCrown.scale.set(0.95, 1, 1.06);
    capCrown.position.set(0, 0.106, 0.006);
    capCrown.rotation.x = -0.08;
    capCrown.castShadow = true;
    headRig.add(capCrown);

    const capBand = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.106, 0.106, 0.022, 16)),
      beltMat
    );
    capBand.scale.set(0.95, 1, 1.06);
    capBand.position.set(0, 0.072, 0.004);
    headRig.add(capBand);

    const capVisorGeo = trackGeo(
      new THREE.CylinderGeometry(0.118, 0.122, 0.012, 14, 1, false, -Math.PI * 0.34, Math.PI * 0.68)
    );
    const capVisor = new THREE.Mesh(capVisorGeo, beltMat);
    capVisor.position.set(0, 0.062, -0.042);
    capVisor.rotation.y = Math.PI;
    capVisor.rotation.x = 0.22;
    headRig.add(capVisor);

    const capBadge = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.016, 0)),
      goldMetalMat
    );
    capBadge.scale.set(1, 1.25, 0.45);
    capBadge.position.set(0, 0.102, -0.106);
    headRig.add(capBadge);
  }

  // --- 4. Tailored Clothing Details Attached to Chest & Hips Bones ---
  // Folded Collar around neck base
  const collar = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.072, 0.016, 6, 14, Math.PI * 1.65)),
    jacketMat
  );
  collar.rotation.x = Math.PI / 2 + 0.18;
  collar.rotation.z = -Math.PI * 0.825;
  collar.position.set(0, 0.165, 0.008);
  chest.add(collar);

  // Sculpted Jacket Lapels framing the open shirt V-front
  const lapelGeo = trackGeo(new THREE.BoxGeometry(0.028, 0.15, 0.014));
  [-1, 1].forEach((side) => {
    const lapel = new THREE.Mesh(lapelGeo, jacketMat);
    lapel.position.set(side * 0.044, 0.08, -0.116);
    lapel.rotation.z = side * -0.18;
    lapel.rotation.y = side * -0.18;
    chest.add(lapel);
  });

  // Utility Belt + Buckle on Hips
  const belt = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.166, 0.166, 0.042, 16)),
    beltMat
  );
  belt.scale.set(1, 1, 0.74);
  belt.position.set(0, 0.008, 0);
  hips.add(belt);

  const buckle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.044, 0.032, 0.018)), goldMetalMat);
  buckle.position.set(0, 0.008, -0.123);
  hips.add(buckle);

  if (isPolice) {
    // Police Gold Chest Badge + Shoulder Epaulettes
    const chestBadge = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.022, 0)),
      goldMetalMat
    );
    chestBadge.scale.set(1, 1.25, 0.4);
    chestBadge.position.set(0.088, 0.05, -0.124);
    chest.add(chestBadge);

    const epGeo = trackGeo(new THREE.BoxGeometry(0.068, 0.012, 0.042));
    [-1, 1].forEach((side) => {
      const ep = new THREE.Mesh(epGeo, jacketMat);
      ep.position.set(side * 0.145, 0.172, 0);
      ep.rotation.z = side * -0.16;
      chest.add(ep);
    });
  }

  // --- 5. Sculpted 5-Fingered Hands on Hand Bones ---
  const buildHandDetail = (handBone: THREE.Bone, side: -1 | 1) => {
    const handGeo = trackGeo(createSculptedHandGeo(side, -1));
    const handMesh = new THREE.Mesh(handGeo, skinMat);
    handMesh.castShadow = true;
    handBone.add(handMesh);
  };
  buildHandDetail(handL, -1);
  buildHandDetail(handR, 1);

  // --- 6. Real Sculpted Shoes / Patrol Boots on Foot Bones ---
  const buildShoe = (footBone: THREE.Bone) => {
    const sg = new THREE.Group();
    const sole = new THREE.Mesh(
      trackGeo(createSculptedShoeGeo(-1, 'sole', isPolice)),
      shoeSoleMat
    );
    sg.add(sole);

    const upper = new THREE.Mesh(
      trackGeo(createSculptedShoeGeo(-1, 'upper', isPolice)),
      shoeUpperMat
    );
    upper.castShadow = true;
    sg.add(upper);

    footBone.add(sg);
  };
  buildShoe(footL);
  buildShoe(footR);

  // --- 7. Real THREE.AnimationMixer & Skeletal Animation Clips (Exact Bone Names & Pose Logic) ---
  const mixer = new THREE.AnimationMixer(root);

  const qFromEuler = (x: number, y = 0, z = 0) =>
    new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));

  const makeQuatTrack = (
    boneName: string,
    times: number[],
    eulers: [number, number, number][]
  ) => {
    const vals: number[] = [];
    for (const [ex, ey, ez] of eulers) {
      const q = qFromEuler(ex, ey, ez);
      vals.push(q.x, q.y, q.z, q.w);
    }
    return new THREE.QuaternionKeyframeTrack(
      `${boneName}.quaternion`,
      times,
      vals,
      THREE.InterpolateLinear
    );
  };

  // A. Idle Clip
  const idleClip = new THREE.AnimationClip('idle', 2.4, [
    makeQuatTrack('Chest', [0, 1.2, 2.4], [
      [0.02, 0, 0],
      [-0.025, 0.02, 0],
      [0.02, 0, 0],
    ]),
    makeQuatTrack('Head', [0, 1.2, 2.4], [
      [0, -0.03, 0],
      [-0.03, 0.03, 0],
      [0, -0.03, 0],
    ]),
    makeQuatTrack('UpperArmL', [0, 1.2, 2.4], [
      [0.04, 0, 0.09],
      [-0.03, 0, 0.11],
      [0.04, 0, 0.09],
    ]),
    makeQuatTrack('UpperArmR', [0, 1.2, 2.4], [
      [-0.03, 0, -0.09],
      [0.04, 0, -0.11],
      [-0.03, 0, -0.09],
    ]),
    makeQuatTrack('ForearmL', [0, 2.4], [
      [-0.22, 0, 0],
      [-0.22, 0, 0],
    ]),
    makeQuatTrack('ForearmR', [0, 2.4], [
      [-0.22, 0, 0],
      [-0.22, 0, 0],
    ]),
  ]);

  // B. Walk Clip
  const walkT = [0, 0.25, 0.5, 0.75, 1.0];
  const walkClip = new THREE.AnimationClip('walk', 1.0, [
    new THREE.VectorKeyframeTrack('Hips.position', walkT, [
      0, 0.89, 0,
      0, 0.92, 0,
      0, 0.89, 0,
      0, 0.92, 0,
      0, 0.89, 0,
    ]),
    makeQuatTrack('Hips', walkT, [
      [0.02, 0.06, 0.02],
      [0.02, 0, 0],
      [0.02, -0.06, -0.02],
      [0.02, 0, 0],
      [0.02, 0.06, 0.02],
    ]),
    makeQuatTrack('Chest', walkT, [
      [-0.05, -0.07, 0],
      [-0.04, 0, 0],
      [-0.05, 0.07, 0],
      [-0.04, 0, 0],
      [-0.05, -0.07, 0],
    ]),
    makeQuatTrack('ThighL', walkT, [
      [0.45, 0, 0],
      [-0.12, 0, 0],
      [-0.42, 0, 0],
      [0.15, 0, 0],
      [0.45, 0, 0],
    ]),
    makeQuatTrack('ShinL', walkT, [
      [-0.12, 0, 0],
      [-0.18, 0, 0],
      [-0.52, 0, 0],
      [-0.72, 0, 0],
      [-0.12, 0, 0],
    ]),
    makeQuatTrack('FootL', walkT, [
      [-0.18, 0, 0],
      [0.05, 0, 0],
      [0.24, 0, 0],
      [0.12, 0, 0],
      [-0.18, 0, 0],
    ]),
    makeQuatTrack('ThighR', walkT, [
      [-0.42, 0, 0],
      [0.15, 0, 0],
      [0.45, 0, 0],
      [-0.12, 0, 0],
      [-0.42, 0, 0],
    ]),
    makeQuatTrack('ShinR', walkT, [
      [-0.52, 0, 0],
      [-0.72, 0, 0],
      [-0.12, 0, 0],
      [-0.18, 0, 0],
      [-0.52, 0, 0],
    ]),
    makeQuatTrack('FootR', walkT, [
      [0.24, 0, 0],
      [0.12, 0, 0],
      [-0.18, 0, 0],
      [0.05, 0, 0],
      [0.24, 0, 0],
    ]),
    makeQuatTrack('UpperArmL', walkT, [
      [-0.36, 0, 0.08],
      [0.0, 0, 0.08],
      [0.36, 0, 0.08],
      [0.0, 0, 0.08],
      [-0.36, 0, 0.08],
    ]),
    makeQuatTrack('ForearmL', walkT, [
      [-0.25, 0, 0],
      [-0.32, 0, 0],
      [-0.52, 0, 0],
      [-0.35, 0, 0],
      [-0.25, 0, 0],
    ]),
    makeQuatTrack('UpperArmR', walkT, [
      [0.36, 0, -0.08],
      [0.0, 0, -0.08],
      [-0.36, 0, -0.08],
      [0.0, 0, -0.08],
      [0.36, 0, -0.08],
    ]),
    makeQuatTrack('ForearmR', walkT, [
      [-0.52, 0, 0],
      [-0.35, 0, 0],
      [-0.25, 0, 0],
      [-0.32, 0, 0],
      [-0.52, 0, 0],
    ]),
  ]);

  // C. Run Clip
  const runT = [0, 0.155, 0.31, 0.465, 0.62];
  const runClip = new THREE.AnimationClip('run', 0.62, [
    new THREE.VectorKeyframeTrack('Hips.position', runT, [
      0, 0.87, 0,
      0, 0.94, 0,
      0, 0.87, 0,
      0, 0.94, 0,
      0, 0.87, 0,
    ]),
    makeQuatTrack('Spine', runT, [
      [-0.14, 0.05, 0],
      [-0.12, 0, 0],
      [-0.14, -0.05, 0],
      [-0.12, 0, 0],
      [-0.14, 0.05, 0],
    ]),
    makeQuatTrack('Chest', runT, [
      [-0.12, -0.1, 0],
      [-0.1, 0, 0],
      [-0.12, 0.1, 0],
      [-0.1, 0, 0],
      [-0.12, -0.1, 0],
    ]),
    makeQuatTrack('ThighL', runT, [
      [0.82, 0, 0],
      [-0.18, 0, 0],
      [-0.72, 0, 0],
      [0.25, 0, 0],
      [0.82, 0, 0],
    ]),
    makeQuatTrack('ShinL', runT, [
      [-0.25, 0, 0],
      [-0.45, 0, 0],
      [-1.08, 0, 0],
      [-1.18, 0, 0],
      [-0.25, 0, 0],
    ]),
    makeQuatTrack('ThighR', runT, [
      [-0.72, 0, 0],
      [0.25, 0, 0],
      [0.82, 0, 0],
      [-0.18, 0, 0],
      [-0.72, 0, 0],
    ]),
    makeQuatTrack('ShinR', runT, [
      [-1.08, 0, 0],
      [-1.18, 0, 0],
      [-0.25, 0, 0],
      [-0.45, 0, 0],
      [-1.08, 0, 0],
    ]),
    makeQuatTrack('UpperArmL', runT, [
      [-0.68, 0, 0.1],
      [0.05, 0, 0.12],
      [0.72, 0, 0.1],
      [0.05, 0, 0.12],
      [-0.68, 0, 0.1],
    ]),
    makeQuatTrack('ForearmL', runT, [
      [-1.15, 0, 0],
      [-1.1, 0, 0],
      [-1.28, 0, 0],
      [-1.1, 0, 0],
      [-1.15, 0, 0],
    ]),
    makeQuatTrack('UpperArmR', runT, [
      [0.72, 0, -0.1],
      [0.05, 0, -0.12],
      [-0.68, 0, -0.1],
      [0.05, 0, -0.12],
      [0.72, 0, -0.1],
    ]),
    makeQuatTrack('ForearmR', runT, [
      [-1.28, 0, 0],
      [-1.1, 0, 0],
      [-1.15, 0, 0],
      [-1.1, 0, 0],
      [-1.28, 0, 0],
    ]),
  ]);

  // D. Jump Pose Clip
  const jumpClip = new THREE.AnimationClip('jump', 1.0, [
    makeQuatTrack('Spine', [0, 1], [[-0.08, 0, 0], [-0.08, 0, 0]]),
    makeQuatTrack('ThighL', [0, 1], [[0.55, 0, 0.05], [0.55, 0, 0.05]]),
    makeQuatTrack('ShinL', [0, 1], [[-0.85, 0, 0], [-0.85, 0, 0]]),
    makeQuatTrack('ThighR', [0, 1], [[0.22, 0, -0.05], [0.22, 0, -0.05]]),
    makeQuatTrack('ShinR', [0, 1], [[-0.42, 0, 0], [-0.42, 0, 0]]),
    makeQuatTrack('UpperArmL', [0, 1], [[0.55, 0, 0.42], [0.55, 0, 0.42]]),
    makeQuatTrack('ForearmL', [0, 1], [[-0.65, 0, 0], [-0.65, 0, 0]]),
    makeQuatTrack('UpperArmR', [0, 1], [[0.55, 0, -0.42], [0.55, 0, -0.42]]),
    makeQuatTrack('ForearmR', [0, 1], [[-0.65, 0, 0], [-0.65, 0, 0]]),
  ]);

  // E. Sit / Drive Clip
  const sitClip = new THREE.AnimationClip('sit', 1.0, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0.56, 0, 0, 0.56, 0]),
    makeQuatTrack('Spine', [0, 1], [[-0.12, 0, 0], [-0.12, 0, 0]]),
    makeQuatTrack('ThighL', [0, 1], [[1.28, 0, 0.14], [1.28, 0, 0.14]]),
    makeQuatTrack('ShinL', [0, 1], [[-1.36, 0, 0], [-1.36, 0, 0]]),
    makeQuatTrack('ThighR', [0, 1], [[1.28, 0, -0.14], [1.28, 0, -0.14]]),
    makeQuatTrack('ShinR', [0, 1], [[-1.36, 0, 0], [-1.36, 0, 0]]),
    makeQuatTrack('UpperArmL', [0, 1], [[0.78, -0.12, 0.16], [0.78, -0.12, 0.16]]),
    makeQuatTrack('ForearmL', [0, 1], [[-0.45, 0, 0], [-0.45, 0, 0]]),
    makeQuatTrack('UpperArmR', [0, 1], [[0.78, 0.12, -0.16], [0.78, 0.12, -0.16]]),
    makeQuatTrack('ForearmR', [0, 1], [[-0.45, 0, 0], [-0.45, 0, 0]]),
  ]);

  // F. Enter/Exit Vehicle Clip
  const enterExitClip = new THREE.AnimationClip('enterExit', 0.45, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, 0.22, 0.45], [
      0, 0.88, 0,
      0, 0.76, 0,
      0, 0.88, 0,
    ]),
    makeQuatTrack('Spine', [0, 0.22, 0.45], [
      [0, 0, 0],
      [-0.25, 0.18, 0],
      [0, 0, 0],
    ]),
    makeQuatTrack('ThighL', [0, 0.22, 0.45], [
      [0.2, 0, 0],
      [0.95, 0, 0.12],
      [0.2, 0, 0],
    ]),
    makeQuatTrack('ShinL', [0, 0.22, 0.45], [
      [-0.2, 0, 0],
      [-1.05, 0, 0],
      [-0.2, 0, 0],
    ]),
    makeQuatTrack('UpperArmR', [0, 0.22, 0.45], [
      [0.2, 0, -0.1],
      [0.85, 0, -0.25],
      [0.2, 0, -0.1],
    ]),
  ]);

  // G. Surrender / Arrested Clip
  const arrestedClip = new THREE.AnimationClip('arrested', 1.2, [
    makeQuatTrack('UpperArmL', [0, 1.2], [[2.4, 0, 0.35], [2.4, 0, 0.35]]),
    makeQuatTrack('ForearmL', [0, 1.2], [[-1.4, 0, -0.2], [-1.4, 0, -0.2]]),
    makeQuatTrack('UpperArmR', [0, 1.2], [[2.4, 0, -0.35], [2.4, 0, -0.35]]),
    makeQuatTrack('ForearmR', [0, 1.2], [[-1.4, 0, 0.2], [-1.4, 0, 0.2]]),
    makeQuatTrack('Head', [0, 0.6, 1.2], [[0.1, -0.05, 0], [0.1, 0.05, 0], [0.1, -0.05, 0]]),
  ]);

  const actions = {
    idle: mixer.clipAction(idleClip),
    walk: mixer.clipAction(walkClip),
    run: mixer.clipAction(runClip),
    jump: mixer.clipAction(jumpClip),
    sit: mixer.clipAction(sitClip),
    enterExit: mixer.clipAction(enterExitClip),
    arrested: mixer.clipAction(arrestedClip),
  };

  Object.values(actions).forEach((act) => {
    act.play();
    act.setEffectiveWeight(0);
  });
  actions.idle.setEffectiveWeight(1);

  const weights: Record<keyof typeof actions, number> = {
    idle: 1,
    walk: 0,
    run: 0,
    jump: 0,
    sit: 0,
    enterExit: 0,
    arrested: 0,
  };

  return {
    group: root,
    skeleton,
    mixer,
    update: (
      _elapsedTime: number,
      dt: number,
      moveSpeed: number,
      isRunning: boolean,
      jumpOffset: number,
      poseMode: HumanPoseMode,
      steerHint = 0
    ) => {
      charBodyGroup.position.y = jumpOffset;
      if (shadowMesh) {
        const shadowScale = Math.max(0.55, 1 - jumpOffset * 0.22);
        shadowMesh.scale.set(shadowScale, shadowScale, 1);
        shadowMesh.visible = poseMode !== 'sit_moto' && poseMode !== 'sit_tractor';
      }

      let targetState: keyof typeof actions = 'idle';
      if (poseMode === 'arrested') {
        targetState = 'arrested';
      } else if (poseMode === 'sit_moto' || poseMode === 'sit_tractor') {
        targetState = 'sit';
      } else if (poseMode === 'enter_exit') {
        targetState = 'enterExit';
      } else if (jumpOffset >= 0.08) {
        targetState = 'jump';
      } else if (moveSpeed > 0.25) {
        targetState = isRunning || moveSpeed > 5.4 ? 'run' : 'walk';
      }

      for (const key of Object.keys(actions) as (keyof typeof actions)[]) {
        const goal = key === targetState ? 1 : 0;
        weights[key] = THREE.MathUtils.damp(weights[key], goal, 12, dt);
        actions[key].setEffectiveWeight(weights[key]);
      }

      actions.walk.timeScale = THREE.MathUtils.clamp(moveSpeed / 3.8, 0.7, 1.5);
      actions.run.timeScale = THREE.MathUtils.clamp(moveSpeed / 7.5, 0.85, 1.45);
      mixer.update(dt);

      if (poseMode === 'sit_moto' || poseMode === 'sit_tractor') {
        charBodyGroup.rotation.z = THREE.MathUtils.damp(
          charBodyGroup.rotation.z,
          poseMode === 'sit_moto' ? steerHint * 0.28 : steerHint * 0.05,
          10,
          dt
        );
        headBone.rotation.y = THREE.MathUtils.damp(headBone.rotation.y, steerHint * 0.22, 8, dt);
      } else {
        charBodyGroup.rotation.z = THREE.MathUtils.damp(charBodyGroup.rotation.z, 0, 10, dt);
      }
    },
    dispose: () => {
      mixer.stopAllAction();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
