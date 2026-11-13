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
 * Generates a subtle procedural fabric weave texture for clothes & denim.
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
  ctx.fillStyle = `rgba(${Math.max(0, r - d)},${Math.max(0, g - d)},${Math.max(0, b - d)},0.28)`;
  for (let y = 0; y < 128; y += 4) {
    ctx.fillRect(0, y, 128, 1);
  }
  ctx.fillStyle = `rgba(${Math.min(255, r + d)},${Math.min(255, g + d)},${Math.min(255, b + d)},0.18)`;
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
}

/**
 * Builds an organic multi-material SkinnedMesh from smooth elliptical cross-sections
 * so torso, waist, neck, arms, hands, thighs, calves, and ankles deform seamlessly across joints.
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

  for (let r = 0; r < sections.length; r++) {
    const s = sections[r];
    const vCoord = r / Math.max(1, sections.length - 1);
    const cx = s.cx ?? 0;
    const cz = s.cz ?? 0;

    for (let c = 0; c <= radialSegs; c++) {
      const theta = (c / radialSegs) * Math.PI * 2;
      const x = cx + Math.cos(theta) * s.rx;
      const z = cz + Math.sin(theta) * s.rz;
      positions.push(x, s.y, z);
      uvs.push(c / radialSegs, vCoord);
      skinIndices.push(s.b0, s.b1, 0, 0);
      skinWeights.push(s.w0, s.w1, 0, 0);
    }
  }

  for (let r = 0; r < sections.length - 1; r++) {
    const matIdx = sections[r].matIdx;
    const target = indicesByMat[matIdx];
    const rowA = baseVertex + r * ringStride;
    const rowB = baseVertex + (r + 1) * ringStride;
    for (let c = 0; c < radialSegs; c++) {
      const a = rowA + c;
      const b = rowA + c + 1;
      const d = rowB + c;
      const e = rowB + c + 1;
      // Counter-clockwise outward normals
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
  const skinColor = options.skinColor ?? (isPolice ? 0xf3cba8 : 0xf7d4b6);
  const hairColor = options.hairColor ?? (isPolice ? 0x1e1b18 : 0x201815);
  const eyeColor = options.eyeColor ?? (isPolice ? 0x2c4a6e : 0x1d6fa5);

  const jacketTex = trackTex(createFabricTexture(jacketColor, 0.1));
  const pantsTex = trackTex(createFabricTexture(pantsColor, 0.12));

  // Mat 0: Skin, Mat 1: Jacket/Uniform, Mat 2: Pants
  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.62,
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
    new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.25 })
  );
  const irisMat = trackMat(
    new THREE.MeshStandardMaterial({ color: eyeColor, roughness: 0.18, metalness: 0.1 })
  );
  const pupilMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.12 })
  );
  const lipMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd9877a, roughness: 0.52 })
  );
  const beltMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45, metalness: 0.15 })
  );
  const goldMetalMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.85, roughness: 0.22 })
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
  const shoeAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isPolice ? 0x1e3a8a : 0x38bdf8,
      roughness: 0.4,
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

  // --- 1. Bone Hierarchy (17 Anatomical Bones) ---
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

  // Bind-pose height ~1.73m total
  const hips = mkBone('Hips', 0, 0.9, 0);
  const spine = mkBone('Spine', 0, 0.14, 0, hips);
  const chest = mkBone('Chest', 0, 0.21, 0, spine);
  const neck = mkBone('Neck', 0, 0.19, 0, chest);
  const headBone = mkBone('Head', 0, 0.1, 0, neck);

  const upperArmL = mkBone('UpperArmL', -0.2, 0.14, 0, chest);
  const forearmL = mkBone('ForearmL', 0, -0.26, 0, upperArmL);
  const handL = mkBone('HandL', 0, -0.24, 0, forearmL);

  const upperArmR = mkBone('UpperArmR', 0.2, 0.14, 0, chest);
  const forearmR = mkBone('ForearmR', 0, -0.26, 0, upperArmR);
  const handR = mkBone('HandR', 0, -0.24, 0, forearmR);

  const thighL = mkBone('ThighL', -0.095, -0.04, 0, hips);
  const shinL = mkBone('ShinL', 0, -0.4, 0, thighL);
  const footL = mkBone('FootL', 0, -0.4, 0, shinL);

  const thighR = mkBone('ThighR', 0.095, -0.04, 0, hips);
  const shinR = mkBone('ShinR', 0, -0.4, 0, thighR);
  const footR = mkBone('FootR', 0, -0.4, 0, shinR);

  const skeleton = new THREE.Skeleton(bones);

  // --- 2. Continuous Organic Skinned Body Geometry ---
  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indicesByMat: number[][] = [[], [], []]; // [skin, jacket, pants]

  // Torso + Neck (seamless pelvis -> waist -> chest -> shoulders -> neck)
  appendSkinnedLimb(
    [
      { y: 0.82, rx: 0.155, rz: 0.115, b0: B.Hips, w0: 1.0, b1: B.Hips, w1: 0, matIdx: 2 },
      { y: 0.91, rx: 0.165, rz: 0.125, b0: B.Hips, w0: 0.85, b1: B.Spine, w1: 0.15, matIdx: 1 },
      { y: 1.03, rx: 0.148, rz: 0.11, b0: B.Spine, w0: 0.75, b1: B.Hips, w1: 0.25, matIdx: 1 },
      { y: 1.17, rx: 0.172, rz: 0.125, b0: B.Spine, w0: 0.4, b1: B.Chest, w1: 0.6, matIdx: 1 },
      { y: 1.32, rx: 0.195, rz: 0.132, b0: B.Chest, w0: 0.95, b1: B.Spine, w1: 0.05, matIdx: 1 },
      { y: 1.41, rx: 0.14, rz: 0.1, b0: B.Chest, w0: 0.75, b1: B.Neck, w1: 0.25, matIdx: 1 },
      { y: 1.45, rx: 0.058, rz: 0.058, b0: B.Neck, w0: 0.8, b1: B.Chest, w1: 0.2, matIdx: 0 },
      { y: 1.54, rx: 0.052, rz: 0.054, b0: B.Neck, w0: 0.55, b1: B.Head, w1: 0.45, matIdx: 0 },
    ],
    16,
    positions,
    uvs,
    skinIndices,
    skinWeights,
    indicesByMat
  );

  // Arms (left & right with smooth shoulder -> bicep -> elbow -> forearm -> wrist)
  const buildArmGeo = (side: -1 | 1, bUp: number, bLow: number, bHand: number) => {
    const cx = side * 0.2;
    appendSkinnedLimb(
      [
        { y: 0.86, rx: 0.033, rz: 0.028, cx, b0: bHand, w0: 0.75, b1: bLow, w1: 0.25, matIdx: 0 },
        { y: 0.9, rx: 0.036, rz: 0.034, cx, b0: bLow, w0: 0.8, b1: bHand, w1: 0.2, matIdx: 0 },
        { y: 0.96, rx: 0.044, rz: 0.042, cx, b0: bLow, w0: 0.92, b1: bUp, w1: 0.08, matIdx: 1 },
        { y: 1.11, rx: 0.052, rz: 0.05, cx, b0: bLow, w0: 0.6, b1: bUp, w1: 0.4, matIdx: 1 },
        { y: 1.18, rx: 0.05, rz: 0.048, cx, b0: bUp, w0: 0.65, b1: bLow, w1: 0.35, matIdx: 1 },
        { y: 1.32, rx: 0.058, rz: 0.056, cx, b0: bUp, w0: 0.9, b1: B.Chest, w1: 0.1, matIdx: 1 },
        { y: 1.4, rx: 0.054, rz: 0.054, cx, b0: B.Chest, w0: 0.6, b1: bUp, w1: 0.4, matIdx: 1 },
      ],
      12,
      positions,
      uvs,
      skinIndices,
      skinWeights,
      indicesByMat
    );
  };
  buildArmGeo(-1, B.UpperArmL, B.ForearmL, B.HandL);
  buildArmGeo(1, B.UpperArmR, B.ForearmR, B.HandR);

  // Legs (left & right with smooth hip -> thigh -> knee -> calf -> ankle)
  const buildLegGeo = (side: -1 | 1, bThigh: number, bShin: number, bFoot: number) => {
    const cx = side * 0.095;
    appendSkinnedLimb(
      [
        { y: 0.07, rx: 0.045, rz: 0.048, cx, b0: bFoot, w0: 0.7, b1: bShin, w1: 0.3, matIdx: 2 },
        { y: 0.16, rx: 0.048, rz: 0.05, cx, b0: bShin, w0: 0.92, b1: bFoot, w1: 0.08, matIdx: 2 },
        { y: 0.31, rx: 0.062, rz: 0.066, cx, b0: bShin, w0: 1.0, b1: bShin, w1: 0, matIdx: 2 },
        { y: 0.46, rx: 0.06, rz: 0.062, cx, b0: bShin, w0: 0.55, b1: bThigh, w1: 0.45, matIdx: 2 },
        { y: 0.64, rx: 0.075, rz: 0.078, cx, b0: bThigh, w0: 0.95, b1: bShin, w1: 0.05, matIdx: 2 },
        { y: 0.84, rx: 0.086, rz: 0.088, cx, b0: bThigh, w0: 0.7, b1: B.Hips, w1: 0.3, matIdx: 2 },
      ],
      12,
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

  const bodyMesh = new THREE.SkinnedMesh(bodyGeo, [skinMat, jacketMat, pantsMat]);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.frustumCulled = false;
  bodyMesh.add(hips);
  bodyMesh.bind(skeleton);

  const charBodyGroup = new THREE.Group();
  charBodyGroup.add(bodyMesh);
  root.add(charBodyGroup);

  // --- 3. Sculpted Facial Features, Eyes, Nose, Mouth, Ears & Hair on Head Bone ---
  // Head bone is at y = 1.54 in bind pose; cranium center sits ~+0.09 above head bone
  const headRig = new THREE.Group();
  headRig.position.set(0, 0.09, 0);
  headBone.add(headRig);

  // Sculpted cranium + softly tapered jaw/chin
  const skullGeo = trackGeo(new THREE.SphereGeometry(0.118, 18, 16));
  const sp = skullGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    let x = sp.getX(i);
    let y = sp.getY(i);
    let z = sp.getZ(i);
    // Elongate head vertically, narrow lower jaw toward chin (-Z forward)
    y *= 1.18;
    if (y < -0.02) {
      const jawT = Math.min(1, (-y - 0.02) / 0.11);
      x *= 1 - jawT * 0.34;
      if (z < 0) z *= 1 - jawT * 0.14;
    }
    sp.setXYZ(i, x, y, z);
  }
  skullGeo.computeVertexNormals();
  const cranium = new THREE.Mesh(skullGeo, skinMat);
  cranium.castShadow = true;
  headRig.add(cranium);

  // Ears (left & right)
  const earGeo = trackGeo(new THREE.SphereGeometry(0.024, 8, 8));
  earGeo.scale(0.45, 1.15, 0.72);
  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(side * 0.114, -0.005, 0.01);
    ear.rotation.y = side * 0.2;
    headRig.add(ear);
  });

  // Detailed Anime-Realistic Eyes (facing -Z)
  const eyeSocketGeo = trackGeo(new THREE.SphereGeometry(0.021, 10, 8));
  eyeSocketGeo.scale(1.15, 0.9, 0.55);
  const irisGeo = trackGeo(new THREE.SphereGeometry(0.014, 10, 8));
  irisGeo.scale(0.95, 1.0, 0.45);
  const pupilGeo = trackGeo(new THREE.SphereGeometry(0.008, 8, 6));
  pupilGeo.scale(1, 1, 0.45);
  const catchlightGeo = trackGeo(new THREE.SphereGeometry(0.0032, 6, 6));
  const browGeo = trackGeo(new THREE.CapsuleGeometry(0.0045, 0.032, 4, 6));
  browGeo.rotateZ(Math.PI / 2);

  [-0.042, 0.042].forEach((ex) => {
    const sclera = new THREE.Mesh(eyeSocketGeo, scleraMat);
    sclera.position.set(ex, 0.01, -0.104);
    headRig.add(sclera);

    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.set(ex, 0.01, -0.112);
    headRig.add(iris);

    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(ex, 0.01, -0.116);
    headRig.add(pupil);

    const spec = new THREE.Mesh(catchlightGeo, scleraMat);
    spec.position.set(ex + 0.005, 0.016, -0.118);
    headRig.add(spec);

    const brow = new THREE.Mesh(browGeo, hairMat);
    brow.position.set(ex, 0.04, -0.108);
    brow.rotation.z = ex < 0 ? -0.1 : 0.1;
    headRig.add(brow);
  });

  // Sculpted Nose Bridge & Soft Tip
  const noseBridgeGeo = trackGeo(new THREE.CapsuleGeometry(0.009, 0.028, 4, 6));
  const nose = new THREE.Mesh(noseBridgeGeo, skinMat);
  nose.position.set(0, -0.014, -0.117);
  nose.rotation.x = 0.28;
  headRig.add(nose);

  const noseTipGeo = trackGeo(new THREE.SphereGeometry(0.011, 8, 6));
  const noseTip = new THREE.Mesh(noseTipGeo, skinMat);
  noseTip.position.set(0, -0.027, -0.123);
  headRig.add(noseTip);

  // Natural Lips / Mouth
  const lipGeo = trackGeo(new THREE.CapsuleGeometry(0.0055, 0.026, 4, 6));
  lipGeo.rotateZ(Math.PI / 2);
  const mouth = new THREE.Mesh(lipGeo, lipMat);
  mouth.position.set(0, -0.056, -0.11);
  headRig.add(mouth);

  // Layered Modern Hair (Crown + Back Hair + Swept Bangs)
  const hairCrownGeo = trackGeo(
    new THREE.SphereGeometry(0.129, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62)
  );
  hairCrownGeo.scale(1.02, 1.15, 1.06);
  const hairCrown = new THREE.Mesh(hairCrownGeo, hairMat);
  hairCrown.position.set(0, 0.016, 0.01);
  hairCrown.rotation.x = 0.25;
  hairCrown.castShadow = true;
  headRig.add(hairCrown);

  const backHairGeo = trackGeo(new THREE.SphereGeometry(0.12, 12, 10));
  backHairGeo.scale(1.0, 1.12, 0.85);
  const backHair = new THREE.Mesh(backHairGeo, hairMat);
  backHair.position.set(0, -0.015, 0.036);
  headRig.add(backHair);

  // Side hair locks framing temples
  const sideLockGeo = trackGeo(new THREE.CapsuleGeometry(0.022, 0.075, 4, 6));
  [-0.098, 0.098].forEach((sx) => {
    const lock = new THREE.Mesh(sideLockGeo, hairMat);
    lock.position.set(sx, 0.02, -0.042);
    lock.rotation.x = -0.18;
    lock.rotation.z = sx < 0 ? 0.14 : -0.14;
    headRig.add(lock);
  });

  if (isPolice) {
    // Peaked Police Patrol Cap + Gold Shield Emblem + Glossy Visor
    const capCrown = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.142, 0.124, 0.078, 16)),
      jacketMat
    );
    capCrown.position.set(0, 0.12, 0.01);
    capCrown.rotation.x = -0.08;
    capCrown.castShadow = true;
    headRig.add(capCrown);

    const capBand = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.126, 0.126, 0.026, 16)),
      beltMat
    );
    capBand.position.set(0, 0.084, 0.008);
    headRig.add(capBand);

    const capVisorGeo = trackGeo(
      new THREE.CylinderGeometry(0.135, 0.135, 0.014, 14, 1, false, -Math.PI * 0.35, Math.PI * 0.7)
    );
    const capVisor = new THREE.Mesh(capVisorGeo, beltMat);
    capVisor.position.set(0, 0.072, -0.045);
    capVisor.rotation.y = Math.PI;
    capVisor.rotation.x = 0.2;
    headRig.add(capVisor);

    const capBadge = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.018, 0)),
      goldMetalMat
    );
    capBadge.scale.set(1, 1.25, 0.45);
    capBadge.position.set(0, 0.115, -0.122);
    headRig.add(capBadge);
  } else {
    // Swept front bangs for player
    const bangGeo = trackGeo(new THREE.CapsuleGeometry(0.024, 0.068, 4, 6));
    [-0.045, 0.0, 0.045].forEach((bx, idx) => {
      const bang = new THREE.Mesh(bangGeo, hairMat);
      bang.position.set(bx, 0.088, -0.096);
      bang.rotation.x = 0.65;
      bang.rotation.z = (idx - 1) * 0.25;
      headRig.add(bang);
    });
  }

  // --- 4. Clothing Details Attached to Chest & Hips Bones ---
  const shirtPanel = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.105, 0.088, 0.36, 10, 1, false, -0.5, 1.0)),
    shirtMat
  );
  shirtPanel.position.set(0, -0.05, -0.04);
  shirtPanel.rotation.y = Math.PI;
  chest.add(shirtPanel);

  // Jacket Collar
  const collar = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.082, 0.022, 6, 14)),
    jacketMat
  );
  collar.rotation.x = Math.PI / 2 + 0.15;
  collar.position.set(0, 0.15, 0.005);
  chest.add(collar);

  // Belt + Buckle on Hips
  const belt = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.168, 0.168, 0.048, 16)),
    beltMat
  );
  belt.scale.set(1, 1, 0.77);
  belt.position.set(0, 0.01, 0);
  hips.add(belt);

  const buckle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.048, 0.036, 0.02)), goldMetalMat);
  buckle.position.set(0, 0.01, -0.13);
  hips.add(buckle);

  if (isPolice) {
    // Police Gold Chest Badge + Shoulder Epaulettes
    const chestBadge = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.024, 0)),
      goldMetalMat
    );
    chestBadge.scale.set(1, 1.25, 0.4);
    chestBadge.position.set(0.085, 0.04, -0.128);
    chest.add(chestBadge);
  }

  // --- 5. Detailed Hands with Palm, Thumb & Articulated Fingers ---
  const palmGeo = trackGeo(new THREE.SphereGeometry(0.034, 8, 8));
  palmGeo.scale(0.9, 1.15, 0.55);
  const fingerGeo = trackGeo(new THREE.CapsuleGeometry(0.0075, 0.038, 3, 5));
  const thumbGeo = trackGeo(new THREE.CapsuleGeometry(0.0085, 0.026, 3, 5));

  const buildHandDetail = (handBone: THREE.Bone, side: -1 | 1) => {
    const g = new THREE.Group();
    g.position.set(0, -0.025, 0);
    const palm = new THREE.Mesh(palmGeo, skinMat);
    g.add(palm);

    // 4 sculpted fingers
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * 0.015;
      const lenScale = f === 1 || f === 2 ? 1.05 : f === 0 ? 0.92 : 0.8;
      const finger = new THREE.Mesh(fingerGeo, skinMat);
      finger.scale.set(1, lenScale, 1);
      finger.position.set(fx, -0.046, -0.004);
      finger.rotation.x = -0.16; // gentle natural curl
      g.add(finger);
    }

    // Opposable thumb on inner (-side -> +X on left hand) edge
    const thumb = new THREE.Mesh(thumbGeo, skinMat);
    thumb.position.set(-side * 0.028, -0.015, -0.016);
    thumb.rotation.z = side * 0.55;
    thumb.rotation.x = -0.25;
    g.add(thumb);

    handBone.add(g);
  };
  buildHandDetail(handL, -1);
  buildHandDetail(handR, 1);

  // --- 6. Detailed Footwear (Sculpted Sneakers / Patrol Boots on Foot Bones) ---
  const buildShoe = (footBone: THREE.Bone) => {
    const sg = new THREE.Group();
    // Foot bone is at ankle (y = 0.06 above ground)
    const sole = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.046, 0.12, 4, 8)),
      shoeSoleMat
    );
    sole.rotation.x = Math.PI / 2;
    sole.scale.set(1.05, 1.0, 0.42);
    sole.position.set(0, -0.044, -0.042);
    sg.add(sole);

    const upper = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.044, 0.095, 4, 8)),
      shoeUpperMat
    );
    upper.rotation.x = Math.PI / 2;
    upper.scale.set(1.0, 1.0, 0.72);
    upper.position.set(0, -0.02, -0.032);
    upper.castShadow = true;
    sg.add(upper);

    const accent = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.092, 0.016, 0.08)),
      shoeAccentMat
    );
    accent.position.set(0, -0.018, -0.01);
    sg.add(accent);

    footBone.add(sg);
  };
  buildShoe(footL);
  buildShoe(footR);

  // --- 7. Real THREE.AnimationMixer & Skeletal Animation Clips ---
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
    const track = new THREE.QuaternionKeyframeTrack(
      `${boneName}.quaternion`,
      times,
      vals,
      THREE.InterpolateLinear
    );
    return track;
  };

  // A. Idle Clip (subtle breathing, shoulder sway)
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

  // B. Walk Clip (1.0s cycle, natural knee bend + elbow bend + hip counter-rotation)
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

  // C. Run Clip (0.62s dynamic athletic sprint)
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

  // E. Sit / Drive Clip (natural seated riding/driving posture)
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

  // F. Enter/Exit Vehicle Clip (step + duck into cabin)
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

      // Smoothly blend clip weights
      for (const key of Object.keys(actions) as (keyof typeof actions)[]) {
        const goal = key === targetState ? 1 : 0;
        weights[key] = THREE.MathUtils.damp(weights[key], goal, 12, dt);
        actions[key].setEffectiveWeight(weights[key]);
      }

      actions.walk.timeScale = THREE.MathUtils.clamp(moveSpeed / 3.8, 0.7, 1.5);
      actions.run.timeScale = THREE.MathUtils.clamp(moveSpeed / 7.5, 0.85, 1.45);
      mixer.update(dt);

      // Subtle steering lean & head turn when driving motorcycle or tractor
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
