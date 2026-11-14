import * as THREE from 'three';
import {
  createAnatomicalHeadGeo,
  createHairStyleGeo,
  createLoftedSectionGeo,
  createSculptedHandGeo,
  createSculptedShoeGeo,
  deriveLipColor,
  HUMAN_SKIN_PALETTE,
  mergeSimpleGeometries,
  torsoContour,
} from './humanCharacter';

export interface PedestrianSystemHandle {
  group: THREE.Group;
  update: (elapsedTime: number, dt: number) => void;
  checkVehicleCollision: (carX: number, carZ: number, radius?: number) => boolean;
  dispose: () => void;
}

type BodyType = 'slim' | 'average' | 'broad';

interface PedestrianAgent {
  mode: 'loop' | 'crosswalk' | 'stand';
  waypoints: { x: number; z: number }[];
  wpIndex: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  phase: number;
  scale: number;
  pauseTimer: number;
  bodyType: BodyType;
  widthScale: number;
  depthScale: number;
  hairStyle: number;
  hairSlot: number;
  hasJacket: boolean;
  outfitSlot: number;
}

function seeded(i: number): number {
  const n = Math.sin(i * 127.1 + 31.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Generates a neutral grayscale 128x128 fabric weave texture (multiplied by instanceColor).
 */
function createNeutralWeaveTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let y = 0; y < 128; y += 4) ctx.fillRect(0, y, 128, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let x = 0; x < 128; x += 4) ctx.fillRect(x, 0, 1, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/**
 * Builds contoured torso geometry (pelvis -> waist -> chest -> shoulders -> collar) facing +Z.
 * Pivoted at y = 1.15 above ground (so pelvis bottom = -0.30 -> 0.85, shoulder top = +0.28 -> 1.43).
 */
function createOutfitTorsoGeo(hasJacket: boolean): THREE.BufferGeometry {
  const hemBoost = hasJacket ? 0.011 : 0.004;
  const torso = createLoftedSectionGeo(
    [
      { y: -0.30, rx: 0.148, rz: 0.108, contour: torsoContour('pelvis', 1) },
      { y: -0.25, rx: 0.158 + hemBoost, rz: 0.116 + hemBoost * 0.7, contour: torsoContour('pelvis', 1) },
      { y: -0.10, rx: 0.132 + hemBoost * 0.5, rz: 0.102, contour: torsoContour('waist', 1) },
      { y: 0.06, rx: 0.168 + hemBoost * 0.6, rz: 0.118, contour: torsoContour('chest', 1) },
      { y: 0.19, rx: 0.192 + hemBoost * 0.6, rz: 0.125, contour: torsoContour('chest', 1) },
      { y: 0.27, rx: 0.146, rz: 0.098, contour: torsoContour('shoulder', 1) },
      { y: 0.295, rx: 0.072, rz: 0.066 },
    ],
    14,
    true,
    true
  );

  // Add subtle tailored collar rim around neckline
  const collar = new THREE.TorusGeometry(
    hasJacket ? 0.072 : 0.066,
    hasJacket ? 0.015 : 0.010,
    4,
    10,
    hasJacket ? Math.PI * 1.65 : Math.PI * 2
  );
  collar.rotateX(Math.PI / 2 + (hasJacket ? 0.16 : 0.08));
  if (hasJacket) {
    collar.rotateZ(Math.PI * 0.175);
  }
  collar.translate(0, 0.285, -0.006);

  const merged = mergeSimpleGeometries([torso, collar]);
  torso.dispose();
  collar.dispose();
  return merged;
}

/**
 * Builds the inner V-neck shirt chest insert + collar visible inside an open jacket (facing +Z).
 */
function createShirtFrontGeo(): THREE.BufferGeometry {
  const chestPanel = createLoftedSectionGeo(
    [
      { y: -0.06, rx: 0.022, rz: 0.014, cz: 0.106 },
      { y: 0.08, rx: 0.044, rz: 0.016, cz: 0.117 },
      { y: 0.21, rx: 0.056, rz: 0.016, cz: 0.116 },
      { y: 0.285, rx: 0.058, rz: 0.052, cz: 0.006 },
    ],
    10,
    true,
    true
  );
  return chestPanel;
}

/**
 * Builds sculpted neck geometry connecting shoulder base smoothly into back-under-jaw of head (+Z forward).
 */
function createSculptedNeckGeo(): THREE.BufferGeometry {
  return createLoftedSectionGeo(
    [
      { y: -0.03, rx: 0.074, rz: 0.068, cz: -0.006 },
      { y: 0.03, rx: 0.052, rz: 0.054, cz: -0.012 },
      { y: 0.10, rx: 0.048, rz: 0.050, cz: -0.014 },
    ],
    9,
    true,
    true
  );
}

/**
 * Builds sculpted arm sleeve or bare forearm pivoted at shoulder (0,0,0), extending down to y = -0.51 wrist.
 * Includes deltoid cap, bicep taper, natural elbow curve (+Z forward), tapered forearm & cuff lip.
 */
function createJacketArmGeo(side: -1 | 1): THREE.BufferGeometry {
  return createLoftedSectionGeo(
    [
      { y: -0.505, rx: 0.029, rz: 0.024, cx: 0, cz: 0.016 }, // wrist opening
      { y: -0.455, rx: 0.039, rz: 0.037, cx: 0, cz: 0.014 }, // jacket cuff
      { y: -0.34, rx: 0.044, rz: 0.042, cx: 0, cz: 0.010 }, // upper forearm
      { y: -0.26, rx: 0.041, rz: 0.040, cx: 0, cz: 0.004 }, // elbow
      { y: -0.13, rx: 0.050, rz: 0.048, cx: 0, cz: 0.002 }, // bicep
      { y: -0.01, rx: 0.057, rz: 0.055, cx: side * -0.006, cz: 0 }, // deltoid shoulder
      { y: 0.025, rx: 0.042, rz: 0.042, cx: side * -0.025, cz: 0 },
    ],
    8,
    true,
    true
  );
}

function createTshirtSleeveGeo(side: -1 | 1): THREE.BufferGeometry {
  return createLoftedSectionGeo(
    [
      { y: -0.175, rx: 0.052, rz: 0.050, cx: 0, cz: 0.002 }, // open short-sleeve hem
      { y: -0.11, rx: 0.053, rz: 0.051, cx: 0, cz: 0.002 },
      { y: -0.01, rx: 0.058, rz: 0.055, cx: side * -0.006, cz: 0 },
      { y: 0.025, rx: 0.042, rz: 0.042, cx: side * -0.025, cz: 0 },
    ],
    8,
    true,
    true
  );
}

function createBareArmGeo(isShortSleeve: boolean): THREE.BufferGeometry {
  // For t-shirt wearers: visible bare upper arm below short sleeve + elbow + tapered forearm to slim wrist.
  // For jacket wearers: tiny bare skin wrist stub connecting jacket cuff cleanly into hand.
  if (!isShortSleeve) {
    return createLoftedSectionGeo(
      [
        { y: -0.515, rx: 0.027, rz: 0.021, cz: 0.018 },
        { y: -0.455, rx: 0.032, rz: 0.028, cz: 0.014 },
      ],
      6,
      true,
      true
    );
  }
  return createLoftedSectionGeo(
    [
      { y: -0.515, rx: 0.027, rz: 0.021, cz: 0.018 }, // slim wrist
      { y: -0.42, rx: 0.033, rz: 0.030, cz: 0.014 },
      { y: -0.33, rx: 0.042, rz: 0.040, cz: 0.010 }, // forearm muscle
      { y: -0.26, rx: 0.038, rz: 0.038, cz: 0.004 }, // elbow
      { y: -0.16, rx: 0.045, rz: 0.044, cx: 0, cz: 0.002 }, // tucked inside short sleeve
    ],
    8,
    true,
    true
  );
}

/**
 * Builds sculpted trouser leg pivoted at hip (0,0,0), extending down to ankle (y = -0.835).
 * Thick upper thigh -> knee taper -> calf bulge (-Z back) -> slim ankle & trouser hem.
 */
function createSculptedLegGeo(): THREE.BufferGeometry {
  return createLoftedSectionGeo(
    [
      { y: -0.84, rx: 0.040, rz: 0.042, cz: -0.002 }, // trouser ankle cuff
      { y: -0.74, rx: 0.044, rz: 0.047, cz: -0.006 }, // lower shin
      { y: -0.57, rx: 0.058, rz: 0.066, cz: -0.011 }, // calf bulge at back (-Z)
      { y: -0.43, rx: 0.055, rz: 0.058, cz: 0 }, // knee
      { y: -0.22, rx: 0.075, rz: 0.078, cz: 0 }, // mid-thigh
      { y: 0.02, rx: 0.088, rz: 0.091, cz: -0.002 }, // upper thigh inside hip
    ],
    9,
    true,
    true
  );
}

/**
 * Builds merged left+right almond eye scleras, colored irises, dark pupils, eyebrows, and sculpted lips (+Z forward).
 */
function createFacePartGeos() {
  // Almond sclera pair
  const sL = new THREE.SphereGeometry(0.015, 6, 5);
  sL.scale(1.16, 0.72, 0.44);
  sL.rotateY(0.15);
  sL.translate(-0.033, 0.006, 0.087);
  const sR = new THREE.SphereGeometry(0.015, 6, 5);
  sR.scale(1.16, 0.72, 0.44);
  sR.rotateY(-0.15);
  sR.translate(0.033, 0.006, 0.087);
  const scleraPairGeo = mergeSimpleGeometries([sL, sR]);
  sL.dispose();
  sR.dispose();

  // Colored iris pair
  const iL = new THREE.SphereGeometry(0.0095, 6, 5);
  iL.scale(0.95, 1.0, 0.36);
  iL.translate(-0.033, 0.006, 0.093);
  const iR = new THREE.SphereGeometry(0.0095, 6, 5);
  iR.scale(0.95, 1.0, 0.36);
  iR.translate(0.033, 0.006, 0.093);
  const irisPairGeo = mergeSimpleGeometries([iL, iR]);
  iL.dispose();
  iR.dispose();

  // Pupil pair
  const pL = new THREE.SphereGeometry(0.0052, 5, 4);
  pL.scale(1, 1, 0.35);
  pL.translate(-0.033, 0.006, 0.0955);
  const pR = new THREE.SphereGeometry(0.0052, 6, 6);
  pR.scale(1, 1, 0.35);
  pR.translate(0.033, 0.006, 0.0955);
  const pupilPairGeo = mergeSimpleGeometries([pL, pR]);
  pL.dispose();
  pR.dispose();

  // Eyebrow pair
  const bL = createLoftedSectionGeo(
    [
      { y: -0.001, rx: 0.0022, rz: 0.0022, cx: -0.017, cz: -0.002 },
      { y: 0.003, rx: 0.0036, rz: 0.0032, cx: -0.002, cz: 0.001 },
      { y: -0.001, rx: 0.0040, rz: 0.0032, cx: 0.016, cz: -0.001 },
    ],
    6
  );
  bL.rotateY(0.16);
  bL.translate(-0.033, 0.029, 0.092);

  const bR = createLoftedSectionGeo(
    [
      { y: -0.001, rx: 0.0040, rz: 0.0032, cx: -0.016, cz: -0.001 },
      { y: 0.003, rx: 0.0036, rz: 0.0032, cx: 0.002, cz: 0.001 },
      { y: -0.001, rx: 0.0022, rz: 0.0022, cx: 0.017, cz: -0.002 },
    ],
    6
  );
  bR.rotateY(-0.16);
  bR.translate(0.033, 0.029, 0.092);
  const browPairGeo = mergeSimpleGeometries([bL, bR]);
  bL.dispose();
  bR.dispose();

  // Sculpted lips
  const upperLip = createLoftedSectionGeo(
    [
      { y: -0.001, rx: 0.018, rz: 0.004, cz: -0.002 },
      { y: 0.003, rx: 0.011, rz: 0.005, cz: 0.001 },
      { y: 0.001, rx: 0.004, rz: 0.004, cz: 0.001 },
    ],
    8
  );
  upperLip.rotateZ(Math.PI / 2);
  upperLip.scale(1.15, 0.75, 0.9);
  const lowerLip = new THREE.SphereGeometry(0.013, 8, 6);
  lowerLip.scale(1.35, 0.38, 0.55);
  lowerLip.translate(0, -0.004, -0.001);
  const mouthGeo = mergeSimpleGeometries([upperLip, lowerLip]);
  mouthGeo.translate(0, -0.056, 0.089);
  upperLip.dispose();
  lowerLip.dispose();

  return { scleraPairGeo, irisPairGeo, pupilPairGeo, browPairGeo, mouthGeo };
}

export function createPedestrianSystem(): PedestrianSystemHandle {
  const group = new THREE.Group();
  group.name = 'CityPedestrians';

  const agents: PedestrianAgent[] = [];

  // 1. City Sidewalk & Village Patrol Loops
  const sidewalkLoops: { x: number; z: number }[][] = [
    [
      { x: -10.5, z: 36 },
      { x: -10.5, z: -36 },
      { x: -85.5, z: -36 },
      { x: -85.5, z: 36 },
    ],
    [
      { x: 10.5, z: -36 },
      { x: 10.5, z: 36 },
      { x: 85.5, z: 36 },
      { x: 85.5, z: -36 },
    ],
    [
      { x: -10.5, z: -60 },
      { x: -24, z: -128 },
      { x: -85.5, z: -130 },
      { x: -85.5, z: -60 },
    ],
    [
      { x: 10.5, z: -120 },
      { x: 24, z: -133 },
      { x: 85.5, z: -133 },
      { x: 85.5, z: -60 },
      { x: 10.5, z: -60 },
    ],
    [
      { x: -24, z: -156 },
      { x: -10.5, z: -172 },
      { x: -10.5, z: -229 },
      { x: -85.5, z: -229 },
      { x: -85.5, z: -156 },
    ],
    [
      { x: -106.5, z: 36 },
      { x: -106.5, z: -36 },
      { x: -172, z: -36 },
      { x: -181.5, z: 36 },
    ],
    [
      { x: 204, z: -158 },
      { x: 204, z: -226 },
      { x: 235, z: -226 },
      { x: 235, z: -158 },
    ],
    [
      { x: -374, z: -58 },
      { x: -374, z: -96 },
      { x: -414, z: -96 },
      { x: -414, z: -58 },
    ],
    [
      { x: -374, z: -230 },
      { x: -374, z: -195 },
      { x: -416, z: -195 },
      { x: -416, z: -230 },
    ],
  ];

  const makeTrait = (seedIdx: number) => {
    const rBody = seeded(seedIdx * 41 + 3);
    const bodyType: BodyType = rBody < 0.33 ? 'slim' : rBody < 0.68 ? 'average' : 'broad';
    const widthScale = bodyType === 'slim' ? 0.87 : bodyType === 'average' ? 1.0 : 1.15;
    const depthScale = bodyType === 'slim' ? 0.88 : bodyType === 'average' ? 1.0 : 1.13;
    const hairStyle = Math.floor(seeded(seedIdx * 59 + 11) * 5) % 5;
    const hasJacket = seeded(seedIdx * 73 + 19) < 0.56;
    return { bodyType, widthScale, depthScale, hairStyle, hasJacket };
  };

  let seedCounter = 0;
  sidewalkLoops.forEach((loop, loopIdx) => {
    const countOnLoop = loopIdx >= 7 ? 4 : 5;
    for (let k = 0; k < countOnLoop; k++) {
      const startWp = k % loop.length;
      const nextWp = (startWp + 1) % loop.length;
      const frac = seeded(loopIdx * 17 + k) * 0.85;
      const p0 = loop[startWp];
      const p1 = loop[nextWp];
      const tr = makeTrait(seedCounter++);
      agents.push({
        mode: 'loop',
        waypoints: loop,
        wpIndex: nextWp,
        x: p0.x + (p1.x - p0.x) * frac,
        z: p0.z + (p1.z - p0.z) * frac,
        yaw: Math.atan2(p1.x - p0.x, p1.z - p0.z),
        speed: 1.32 + seeded(loopIdx * 31 + k) * 0.5,
        phase: seeded(loopIdx * 13 + k) * Math.PI * 2,
        scale: 0.95 + seeded(loopIdx * 23 + k) * 0.12,
        pauseTimer: 0,
        ...tr,
        hairSlot: 0,
        outfitSlot: 0,
      });
    }
  });

  // 2. Crosswalk pedestrians crossing at intersections
  const crosswalkPairs: [{ x: number; z: number }, { x: number; z: number }][] = [
    [{ x: -9.8, z: -38.2 }, { x: 9.8, z: -38.2 }],
    [{ x: -9.8, z: -57.8 }, { x: 9.8, z: -57.8 }],
    [{ x: -9.8, z: -122 }, { x: 9.8, z: -122 }],
    [{ x: -9.8, z: 38.2 }, { x: 9.8, z: 38.2 }],
    [{ x: -105.8, z: -38.2 }, { x: -86.2, z: -38.2 }],
    [{ x: 86.2, z: -38.2 }, { x: 105.8, z: -38.2 }],
    [{ x: 182.2, z: -134.2 }, { x: 201.8, z: -134.2 }],
    [{ x: -9.8, z: -166 }, { x: 9.8, z: -166 }],
  ];

  crosswalkPairs.forEach(([a, b], idx) => {
    const startAtA = idx % 2 === 0;
    const p = startAtA ? a : b;
    const target = startAtA ? b : a;
    const tr = makeTrait(seedCounter++);
    agents.push({
      mode: 'crosswalk',
      waypoints: [a, b],
      wpIndex: startAtA ? 1 : 0,
      x: p.x + (target.x - p.x) * seeded(idx + 90) * 0.4,
      z: p.z + (target.z - p.z) * seeded(idx + 90) * 0.4,
      yaw: Math.atan2(target.x - p.x, target.z - p.z),
      speed: 1.5,
      phase: seeded(idx + 77) * Math.PI * 2,
      scale: 0.96 + seeded(idx + 55) * 0.08,
      pauseTimer: 0,
      ...tr,
      hairSlot: 0,
      outfitSlot: 0,
    });
  });

  // 3. Standing pedestrians near city landmarks, village shops & farms
  const standSpots: { x: number; z: number; yaw: number }[] = [
    { x: -14.2, z: 14, yaw: Math.PI / 2 },
    { x: -14.2, z: -10, yaw: Math.PI / 2 },
    { x: 14.2, z: 8, yaw: -Math.PI / 2 },
    { x: 14.2, z: -18, yaw: -Math.PI / 2 },
    { x: 42, z: -60, yaw: 0 },
    { x: 46, z: -60, yaw: -0.4 },
    { x: -14, z: -178, yaw: Math.PI / 2 },
    { x: -116, z: -174, yaw: Math.PI / 2 },
    { x: -46, z: -92, yaw: 0.8 },
    { x: -51, z: -98, yaw: -0.6 },
    { x: 208, z: -186, yaw: -Math.PI / 2 },
    { x: 208, z: -196, yaw: -Math.PI / 2 },
    { x: -396, z: -66, yaw: 0.2 },
    { x: -404, z: -72, yaw: -0.3 },
    { x: -402, z: 148, yaw: 0.5 },
    { x: -504, z: -68, yaw: -0.4 },
  ];

  standSpots.forEach((s, idx) => {
    const tr = makeTrait(seedCounter++);
    agents.push({
      mode: 'stand',
      waypoints: [{ x: s.x, z: s.z }],
      wpIndex: 0,
      x: s.x,
      z: s.z,
      yaw: s.yaw,
      speed: 0,
      phase: idx * 1.1,
      scale: 0.96 + (idx % 3) * 0.04,
      pauseTimer: 0,
      ...tr,
      hairSlot: 0,
      outfitSlot: 0,
    });
  });

  const count = agents.length;

  // Partition agents into hairstyle slots (5 styles) and outfit slots (jacket vs t-shirt)
  const hairBuckets: number[][] = [[], [], [], [], []];
  const jacketAgents: number[] = [];
  const tshirtAgents: number[] = [];

  for (let i = 0; i < count; i++) {
    const a = agents[i];
    a.hairSlot = hairBuckets[a.hairStyle].length;
    hairBuckets[a.hairStyle].push(i);
    if (a.hasJacket) {
      a.outfitSlot = jacketAgents.length;
      jacketAgents.push(i);
    } else {
      a.outfitSlot = tshirtAgents.length;
      tshirtAgents.push(i);
    }
  }

  // --- Shared Sculpted Anatomical Geometries (All Facing +Z) ---
  const headGeo = createAnatomicalHeadGeo(1);
  const neckGeo = createSculptedNeckGeo();
  const { scleraPairGeo, irisPairGeo, pupilPairGeo, browPairGeo, mouthGeo } = createFacePartGeos();
  const hairStyleGeos = [0, 1, 2, 3, 4].map((s) => createHairStyleGeo(s, 1));

  const jacketTorsoGeo = createOutfitTorsoGeo(true);
  const tshirtTorsoGeo = createOutfitTorsoGeo(false);
  const shirtFrontGeo = createShirtFrontGeo();

  const jacketArmLGeo = createJacketArmGeo(-1);
  const jacketArmRGeo = createJacketArmGeo(1);
  const jacketWristStubGeo = createBareArmGeo(false);

  const tshirtSleeveLGeo = createTshirtSleeveGeo(-1);
  const tshirtSleeveRGeo = createTshirtSleeveGeo(1);
  const bareForearmGeo = createBareArmGeo(true);

  const handLGeo = createSculptedHandGeo(-1, 1);
  handLGeo.translate(0, -0.51, 0.018);
  const handRGeo = createSculptedHandGeo(1, 1);
  handRGeo.translate(0, -0.51, 0.018);

  const legGeo = createSculptedLegGeo();
  const shoeGeo = createSculptedShoeGeo(1, 'all', false);
  shoeGeo.translate(0, -0.84, 0);

  // --- Materials & Subtle 128x128 Fabric Weave Texture ---
  const weaveTex = createNeutralWeaveTexture();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.02 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.56, metalness: 0.06 });
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.24 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0.1 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.12 });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: weaveTex, roughness: 0.7 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: weaveTex, roughness: 0.72 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: weaveTex, roughness: 0.78 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.08 });

  // --- InstancedMeshes ---
  const headInst = new THREE.InstancedMesh(headGeo, skinMat, count);
  const neckInst = new THREE.InstancedMesh(neckGeo, skinMat, count);
  const scleraInst = new THREE.InstancedMesh(scleraPairGeo, scleraMat, count);
  const irisInst = new THREE.InstancedMesh(irisPairGeo, irisMat, count);
  const pupilInst = new THREE.InstancedMesh(pupilPairGeo, pupilMat, count);
  const browInst = new THREE.InstancedMesh(browPairGeo, hairMat, count);
  const mouthInst = new THREE.InstancedMesh(mouthGeo, lipMat, count);

  const hairInsts = hairBuckets.map(
    (bucket, s) => new THREE.InstancedMesh(hairStyleGeos[s], hairMat, Math.max(1, bucket.length))
  );

  const jacketCount = Math.max(1, jacketAgents.length);
  const tshirtCount = Math.max(1, tshirtAgents.length);

  const jacketTorsoInst = new THREE.InstancedMesh(jacketTorsoGeo, clothMat, jacketCount);
  const shirtFrontInst = new THREE.InstancedMesh(shirtFrontGeo, shirtMat, jacketCount);
  const jacketArmLInst = new THREE.InstancedMesh(jacketArmLGeo, clothMat, jacketCount);
  const jacketArmRInst = new THREE.InstancedMesh(jacketArmRGeo, clothMat, jacketCount);
  const jacketWristLInst = new THREE.InstancedMesh(jacketWristStubGeo, skinMat, jacketCount);
  const jacketWristRInst = new THREE.InstancedMesh(jacketWristStubGeo, skinMat, jacketCount);

  const tshirtTorsoInst = new THREE.InstancedMesh(tshirtTorsoGeo, shirtMat, tshirtCount);
  const tshirtSleeveLInst = new THREE.InstancedMesh(tshirtSleeveLGeo, shirtMat, tshirtCount);
  const tshirtSleeveRInst = new THREE.InstancedMesh(tshirtSleeveRGeo, shirtMat, tshirtCount);
  const bareForearmLInst = new THREE.InstancedMesh(bareForearmGeo, skinMat, tshirtCount);
  const bareForearmRInst = new THREE.InstancedMesh(bareForearmGeo, skinMat, tshirtCount);

  const handLInst = new THREE.InstancedMesh(handLGeo, skinMat, count);
  const handRInst = new THREE.InstancedMesh(handRGeo, skinMat, count);
  const legLInst = new THREE.InstancedMesh(legGeo, pantsMat, count);
  const legRInst = new THREE.InstancedMesh(legGeo, pantsMat, count);
  const shoeLInst = new THREE.InstancedMesh(shoeGeo, shoeMat, count);
  const shoeRInst = new THREE.InstancedMesh(shoeGeo, shoeMat, count);

  // --- Palettes (Skin light->dark, natural eyes, varied jackets/t-shirts/trousers/shoes) ---
  const hairPalette = [0x1c1614, 0x362317, 0x5c3a21, 0x87542b, 0x1e293b, 0xb88948, 0x6b7280];
  const eyePalette = [0x3b281c, 0x1e1815, 0x4b6b42, 0x2c5c88, 0x6e4f28];
  const jacketPalette = [
    0x1d4ed8, 0xb91c1c, 0x047857, 0xb45309, 0x334155, 0x4338ca, 0x0f766e, 0x57534e, 0x7c2d12,
  ];
  const shirtPalette = [
    0xf8fafc, 0xe2e8f0, 0x0284c7, 0xe11d48, 0x059669, 0xd97706, 0x6366f1, 0xfef3c7, 0x1e293b,
  ];
  const pantsPalette = [0x1e293b, 0x334155, 0x1d4ed8, 0x3f3f46, 0x78716c, 0x27272a, 0x365314];
  const shoePalette = [0xf8fafc, 0x111827, 0x475569, 0x7c2d12, 0x334155];
  const col = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const a = agents[i];
    const skinHex = HUMAN_SKIN_PALETTE[Math.floor(seeded(i * 19 + 5) * HUMAN_SKIN_PALETTE.length)];
    col.setHex(skinHex);
    headInst.setColorAt(i, col);
    neckInst.setColorAt(i, col);
    handLInst.setColorAt(i, col);
    handRInst.setColorAt(i, col);

    col.setHex(deriveLipColor(skinHex));
    mouthInst.setColorAt(i, col);

    const hairHex = hairPalette[Math.floor(seeded(i * 29 + 7) * hairPalette.length)];
    col.setHex(hairHex);
    browInst.setColorAt(i, col);
    hairInsts[a.hairStyle].setColorAt(a.hairSlot, col);

    const eyeHex = eyePalette[Math.floor(seeded(i * 37 + 13) * eyePalette.length)];
    col.setHex(eyeHex);
    irisInst.setColorAt(i, col);

    const shirtHex = shirtPalette[Math.floor(seeded(i * 43 + 17) * shirtPalette.length)];
    if (a.hasJacket) {
      const jacketHex = jacketPalette[Math.floor(seeded(i * 53 + 23) * jacketPalette.length)];
      col.setHex(jacketHex);
      jacketTorsoInst.setColorAt(a.outfitSlot, col);
      jacketArmLInst.setColorAt(a.outfitSlot, col);
      jacketArmRInst.setColorAt(a.outfitSlot, col);

      col.setHex(shirtHex);
      shirtFrontInst.setColorAt(a.outfitSlot, col);

      col.setHex(skinHex);
      jacketWristLInst.setColorAt(a.outfitSlot, col);
      jacketWristRInst.setColorAt(a.outfitSlot, col);
    } else {
      col.setHex(shirtHex);
      tshirtTorsoInst.setColorAt(a.outfitSlot, col);
      tshirtSleeveLInst.setColorAt(a.outfitSlot, col);
      tshirtSleeveRInst.setColorAt(a.outfitSlot, col);

      col.setHex(skinHex);
      bareForearmLInst.setColorAt(a.outfitSlot, col);
      bareForearmRInst.setColorAt(a.outfitSlot, col);
    }

    col.setHex(pantsPalette[Math.floor(seeded(i * 61 + 29) * pantsPalette.length)]);
    legLInst.setColorAt(i, col);
    legRInst.setColorAt(i, col);

    col.setHex(shoePalette[Math.floor(seeded(i * 67 + 31) * shoePalette.length)]);
    shoeLInst.setColorAt(i, col);
    shoeRInst.setColorAt(i, col);
  }

  const allInsts: THREE.InstancedMesh[] = [
    headInst,
    neckInst,
    scleraInst,
    irisInst,
    pupilInst,
    browInst,
    mouthInst,
    ...hairInsts,
    jacketTorsoInst,
    shirtFrontInst,
    jacketArmLInst,
    jacketArmRInst,
    jacketWristLInst,
    jacketWristRInst,
    tshirtTorsoInst,
    tshirtSleeveLInst,
    tshirtSleeveRInst,
    bareForearmLInst,
    bareForearmRInst,
    handLInst,
    handRInst,
    legLInst,
    legRInst,
    shoeLInst,
    shoeRInst,
  ];

  allInsts.forEach((inst) => {
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false;
    inst.castShadow =
      inst === jacketTorsoInst ||
      inst === tshirtTorsoInst ||
      inst === headInst ||
      inst === legLInst ||
      inst === legRInst;
    group.add(inst);
  });

  // Hide unused dummy slot if any bucket happened to be empty
  hairBuckets.forEach((b, s) => {
    if (b.length === 0) hairInsts[s].visible = false;
  });
  if (jacketAgents.length === 0) {
    jacketTorsoInst.visible = false;
    shirtFrontInst.visible = false;
    jacketArmLInst.visible = false;
    jacketArmRInst.visible = false;
    jacketWristLInst.visible = false;
    jacketWristRInst.visible = false;
  }
  if (tshirtAgents.length === 0) {
    tshirtTorsoInst.visible = false;
    tshirtSleeveLInst.visible = false;
    tshirtSleeveRInst.visible = false;
    bareForearmLInst.visible = false;
    bareForearmRInst.visible = false;
  }

  const _dummy = new THREE.Object3D();
  const _offset = new THREE.Vector3();

  const updateTransforms = (elapsedTime: number) => {
    for (let i = 0; i < count; i++) {
      const a = agents[i];
      const baseY = a.mode === 'crosswalk' ? 0.02 : a.x < -215 ? 0.03 : 0.14;
      const hs = a.scale;
      const ws = a.widthScale * hs;
      const ds = a.depthScale * hs;

      const isWalking = a.mode !== 'stand' && a.pauseTimer <= 0;
      const swing = isWalking ? Math.sin(a.phase) * 0.56 : 0;
      const bob = isWalking
        ? Math.abs(Math.sin(a.phase)) * 0.032
        : Math.sin(elapsedTime * 2 + a.phase) * 0.006;

      // Head & Face (center y = 1.635 -> crown = 1.752, head height ~ 1/7.5 of total height)
      // Head scales uniformly with heightScale so broad bodies keep realistic human head size
      const headY = baseY + (1.635 + bob) * hs;
      _dummy.position.set(a.x, headY, a.z);
      _dummy.rotation.set(0, a.yaw, 0, 'YXZ');
      _dummy.scale.set(hs, hs, hs);
      _dummy.updateMatrix();
      headInst.setMatrixAt(i, _dummy.matrix);
      scleraInst.setMatrixAt(i, _dummy.matrix);
      irisInst.setMatrixAt(i, _dummy.matrix);
      pupilInst.setMatrixAt(i, _dummy.matrix);
      browInst.setMatrixAt(i, _dummy.matrix);
      mouthInst.setMatrixAt(i, _dummy.matrix);
      hairInsts[a.hairStyle].setMatrixAt(a.hairSlot, _dummy.matrix);

      // Neck (smooth connection from collar at 1.43 up into back-base of skull)
      _dummy.position.set(a.x, baseY + (1.45 + bob) * hs, a.z);
      _dummy.scale.set(hs * (0.94 + a.widthScale * 0.06), hs, hs * (0.94 + a.depthScale * 0.06));
      _dummy.updateMatrix();
      neckInst.setMatrixAt(i, _dummy.matrix);

      // Sculpted Torso (y = 1.15)
      _dummy.position.set(a.x, baseY + (1.15 + bob) * hs, a.z);
      _dummy.rotation.set(isWalking ? 0.04 : 0, a.yaw, 0, 'YXZ');
      _dummy.scale.set(ws, hs, ds);
      _dummy.updateMatrix();
      if (a.hasJacket) {
        jacketTorsoInst.setMatrixAt(a.outfitSlot, _dummy.matrix);
        shirtFrontInst.setMatrixAt(a.outfitSlot, _dummy.matrix);
      } else {
        tshirtTorsoInst.setMatrixAt(a.outfitSlot, _dummy.matrix);
      }

      // Left & Right Arms + Hands (shoulder y = 1.40, x = ±0.205 * ws)
      const shoulderY = baseY + (1.40 + bob) * hs;
      const shoulderX = 0.205 * ws;

      // Left Arm
      _offset.set(-shoulderX, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a.yaw);
      _dummy.position.set(a.x + _offset.x, shoulderY, a.z + _offset.z);
      _dummy.rotation.set(swing, a.yaw, -0.07, 'YXZ');
      _dummy.scale.set(ws, hs, ds);
      _dummy.updateMatrix();
      if (a.hasJacket) {
        jacketArmLInst.setMatrixAt(a.outfitSlot, _dummy.matrix);
        jacketWristLInst.setMatrixAt(a.outfitSlot, _dummy.matrix);
      } else {
        tshirtSleeveLInst.setMatrixAt(a.outfitSlot, _dummy.matrix);
        bareForearmLInst.setMatrixAt(a.outfitSlot, _dummy.matrix);
      }
      _dummy.scale.set(hs, hs, hs);
      _dummy.updateMatrix();
      handLInst.setMatrixAt(i, _dummy.matrix);

      // Right Arm
      _offset.set(shoulderX, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a.yaw);
      _dummy.position.set(a.x + _offset.x, shoulderY, a.z + _offset.z);
      _dummy.rotation.set(-swing, a.yaw, 0.07, 'YXZ');
      _dummy.scale.set(ws, hs, ds);
      _dummy.updateMatrix();
      if (a.hasJacket) {
        jacketArmRInst.setMatrixAt(a.outfitSlot, _dummy.matrix);
        jacketWristRInst.setMatrixAt(a.outfitSlot, _dummy.matrix);
      } else {
        tshirtSleeveRInst.setMatrixAt(a.outfitSlot, _dummy.matrix);
        bareForearmRInst.setMatrixAt(a.outfitSlot, _dummy.matrix);
      }
      _dummy.scale.set(hs, hs, hs);
      _dummy.updateMatrix();
      handRInst.setMatrixAt(i, _dummy.matrix);

      // Left & Right Legs + Shoes (hip y = 0.90 -> sole bottom = baseY + 0.00)
      const hipY = baseY + (0.90 + bob * 0.4) * hs;
      const hipX = 0.095 * ws;

      _offset.set(-hipX, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a.yaw);
      _dummy.position.set(a.x + _offset.x, hipY, a.z + _offset.z);
      _dummy.rotation.set(-swing * 0.85, a.yaw, 0, 'YXZ');
      _dummy.scale.set(ws, hs, ds);
      _dummy.updateMatrix();
      legLInst.setMatrixAt(i, _dummy.matrix);
      _dummy.scale.set(hs * (0.95 + a.widthScale * 0.05), hs, hs);
      _dummy.updateMatrix();
      shoeLInst.setMatrixAt(i, _dummy.matrix);

      _offset.set(hipX, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a.yaw);
      _dummy.position.set(a.x + _offset.x, hipY, a.z + _offset.z);
      _dummy.rotation.set(swing * 0.85, a.yaw, 0, 'YXZ');
      _dummy.scale.set(ws, hs, ds);
      _dummy.updateMatrix();
      legRInst.setMatrixAt(i, _dummy.matrix);
      _dummy.scale.set(hs * (0.95 + a.widthScale * 0.05), hs, hs);
      _dummy.updateMatrix();
      shoeRInst.setMatrixAt(i, _dummy.matrix);
    }

    allInsts.forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
    });
  };

  updateTransforms(0);

  return {
    group,
    update: (elapsedTime: number, dt: number) => {
      for (let i = 0; i < count; i++) {
        const a = agents[i];
        if (a.mode === 'stand') continue;
        if (a.pauseTimer > 0) {
          a.pauseTimer -= dt;
          continue;
        }

        const target = a.waypoints[a.wpIndex];
        const dx = target.x - a.x;
        const dz = target.z - a.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 0.35) {
          a.wpIndex = (a.wpIndex + 1) % a.waypoints.length;
          if (a.mode === 'crosswalk') {
            a.pauseTimer = 1.8;
          }
          continue;
        }

        const step = Math.min(dist, a.speed * dt);
        a.x += (dx / dist) * step;
        a.z += (dz / dist) * step;
        a.yaw = Math.atan2(dx, dz);
        a.phase += a.speed * dt * 4.6;
      }

      updateTransforms(elapsedTime);
    },
    checkVehicleCollision: (carX: number, carZ: number, radius = 1.8) => {
      const rSq = radius * radius;
      for (let i = 0; i < count; i++) {
        const a = agents[i];
        const dx = a.x - carX;
        const dz = a.z - carZ;
        if (dx * dx + dz * dz < rSq) {
          return true;
        }
      }
      return false;
    },
    dispose: () => {
      headGeo.dispose();
      neckGeo.dispose();
      scleraPairGeo.dispose();
      irisPairGeo.dispose();
      pupilPairGeo.dispose();
      browPairGeo.dispose();
      mouthGeo.dispose();
      hairStyleGeos.forEach((g) => g.dispose());
      jacketTorsoGeo.dispose();
      tshirtTorsoGeo.dispose();
      shirtFrontGeo.dispose();
      jacketArmLGeo.dispose();
      jacketArmRGeo.dispose();
      jacketWristStubGeo.dispose();
      tshirtSleeveLGeo.dispose();
      tshirtSleeveRGeo.dispose();
      bareForearmGeo.dispose();
      handLGeo.dispose();
      handRGeo.dispose();
      legGeo.dispose();
      shoeGeo.dispose();

      weaveTex.dispose();
      skinMat.dispose();
      hairMat.dispose();
      scleraMat.dispose();
      irisMat.dispose();
      pupilMat.dispose();
      lipMat.dispose();
      clothMat.dispose();
      shirtMat.dispose();
      pantsMat.dispose();
      shoeMat.dispose();
    },
  };
}
