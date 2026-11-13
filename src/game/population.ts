import * as THREE from 'three';

export interface PedestrianSystemHandle {
  group: THREE.Group;
  update: (elapsedTime: number, dt: number) => void;
  dispose: () => void;
}

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
}

function seeded(i: number): number {
  const n = Math.sin(i * 127.1 + 31.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Builds an anatomical oval head geometry facing +Z (to match atan2(dx, dz) pedestrian heading).
 */
function createSculptedHeadGeo(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.115, 14, 12);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i);
    y *= 1.18;
    if (y < -0.02) {
      const jawT = Math.min(1, (-y - 0.02) / 0.11);
      x *= 1 - jawT * 0.34;
    }
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Builds a natural contoured human torso (pelvis -> slim waist -> broad chest/shoulders).
 */
function createSculptedTorsoGeo(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.01, -0.25),
    new THREE.Vector2(0.145, -0.23),
    new THREE.Vector2(0.132, -0.08),
    new THREE.Vector2(0.155, 0.1),
    new THREE.Vector2(0.175, 0.21),
    new THREE.Vector2(0.11, 0.26),
    new THREE.Vector2(0.045, 0.28),
    new THREE.Vector2(0.01, 0.29),
  ];
  const g = new THREE.LatheGeometry(pts, 14);
  g.scale(1.08, 1.0, 0.72);
  g.computeVertexNormals();
  return g;
}

export function createPedestrianSystem(): PedestrianSystemHandle {
  const group = new THREE.Group();
  group.name = 'CityPedestrians';

  const agents: PedestrianAgent[] = [];

  // 1. City Sidewalk & Village Patrol Loops
  const sidewalkLoops: { x: number; z: number }[][] = [
    // Downtown West block sidewalk loop
    [
      { x: -10.5, z: 36 },
      { x: -10.5, z: -36 },
      { x: -85.5, z: -36 },
      { x: -85.5, z: 36 },
    ],
    // Downtown East block sidewalk loop
    [
      { x: 10.5, z: -36 },
      { x: 10.5, z: 36 },
      { x: 85.5, z: 36 },
      { x: 85.5, z: -36 },
    ],
    // Central Park perimeter loop
    [
      { x: -10.5, z: -60 },
      { x: -24, z: -128 },
      { x: -85.5, z: -130 },
      { x: -85.5, z: -60 },
    ],
    // Shopping Mall sidewalk loop
    [
      { x: 10.5, z: -120 },
      { x: 24, z: -133 },
      { x: 85.5, z: -133 },
      { x: 85.5, z: -60 },
      { x: 10.5, z: -60 },
    ],
    // Civic District loop
    [
      { x: -24, z: -156 },
      { x: -10.5, z: -172 },
      { x: -10.5, z: -229 },
      { x: -85.5, z: -229 },
      { x: -85.5, z: -156 },
    ],
    // Residential District loop
    [
      { x: -106.5, z: 36 },
      { x: -106.5, z: -36 },
      { x: -172, z: -36 },
      { x: -181.5, z: 36 },
    ],
    // Airport Terminal Promenade loop
    [
      { x: 204, z: -158 },
      { x: 204, z: -226 },
      { x: 235, z: -226 },
      { x: 235, z: -158 },
    ],
    // Countryside Greenvale Village square loop
    [
      { x: -374, z: -58 },
      { x: -374, z: -96 },
      { x: -414, z: -96 },
      { x: -414, z: -58 },
    ],
    // Countryside Millstone Village stroll
    [
      { x: -374, z: -230 },
      { x: -374, z: -195 },
      { x: -416, z: -195 },
      { x: -416, z: -230 },
    ],
  ];

  sidewalkLoops.forEach((loop, loopIdx) => {
    const countOnLoop = loopIdx >= 7 ? 4 : 5;
    for (let k = 0; k < countOnLoop; k++) {
      const startWp = k % loop.length;
      const nextWp = (startWp + 1) % loop.length;
      const frac = seeded(loopIdx * 17 + k) * 0.85;
      const p0 = loop[startWp];
      const p1 = loop[nextWp];
      agents.push({
        mode: 'loop',
        waypoints: loop,
        wpIndex: nextWp,
        x: p0.x + (p1.x - p0.x) * frac,
        z: p0.z + (p1.z - p0.z) * frac,
        yaw: Math.atan2(p1.x - p0.x, p1.z - p0.z),
        speed: 1.32 + seeded(loopIdx * 31 + k) * 0.5,
        phase: seeded(loopIdx * 13 + k) * Math.PI * 2,
        scale: 0.94 + seeded(loopIdx * 23 + k) * 0.14,
        pauseTimer: 0,
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
    agents.push({
      mode: 'crosswalk',
      waypoints: [a, b],
      wpIndex: startAtA ? 1 : 0,
      x: p.x + (target.x - p.x) * seeded(idx + 90) * 0.4,
      z: p.z + (target.z - p.z) * seeded(idx + 90) * 0.4,
      yaw: Math.atan2(target.x - p.x, target.z - p.z),
      speed: 1.5,
      phase: seeded(idx + 77) * Math.PI * 2,
      scale: 0.98,
      pauseTimer: 0,
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
    // Countryside village shop & farm workers
    { x: -396, z: -66, yaw: 0.2 },
    { x: -404, z: -72, yaw: -0.3 },
    { x: -402, z: 148, yaw: 0.5 },
    { x: -504, z: -68, yaw: -0.4 },
  ];

  standSpots.forEach((s, idx) => {
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
    });
  });

  const count = agents.length;

  // --- Sculpted Organic Human Geometries (No Boxes!) ---
  const headGeo = createSculptedHeadGeo();
  const neckGeo = new THREE.CylinderGeometry(0.048, 0.056, 0.1, 8);
  const hairGeo = new THREE.SphereGeometry(0.124, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.64);
  hairGeo.scale(1.03, 1.14, 1.06);
  const eyeGeo = new THREE.SphereGeometry(0.015, 6, 6);

  const torsoGeo = createSculptedTorsoGeo();
  const armGeo = new THREE.CapsuleGeometry(0.044, 0.36, 4, 8);
  armGeo.translate(0, -0.2, 0); // Pivot at shoulder
  const handGeo = new THREE.SphereGeometry(0.038, 7, 7);
  handGeo.scale(0.85, 1.15, 0.65);
  handGeo.translate(0, -0.44, 0);

  const legGeo = new THREE.CapsuleGeometry(0.062, 0.48, 4, 8);
  legGeo.translate(0, -0.27, 0); // Pivot at hip
  const shoeGeo = new THREE.CapsuleGeometry(0.045, 0.11, 4, 8);
  shoeGeo.rotateX(Math.PI / 2);
  shoeGeo.scale(1.0, 0.65, 1.0);
  shoeGeo.translate(0, -0.58, 0.04);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.66 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.58 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });

  const headInst = new THREE.InstancedMesh(headGeo, skinMat, count);
  const neckInst = new THREE.InstancedMesh(neckGeo, skinMat, count);
  const hairInst = new THREE.InstancedMesh(hairGeo, hairMat, count);
  const eyeLInst = new THREE.InstancedMesh(eyeGeo, eyeMat, count);
  const eyeRInst = new THREE.InstancedMesh(eyeGeo, eyeMat, count);
  const torsoInst = new THREE.InstancedMesh(torsoGeo, clothMat, count);
  const armLInst = new THREE.InstancedMesh(armGeo, clothMat, count);
  const armRInst = new THREE.InstancedMesh(armGeo, clothMat, count);
  const handLInst = new THREE.InstancedMesh(handGeo, skinMat, count);
  const handRInst = new THREE.InstancedMesh(handGeo, skinMat, count);
  const legLInst = new THREE.InstancedMesh(legGeo, pantsMat, count);
  const legRInst = new THREE.InstancedMesh(legGeo, pantsMat, count);
  const shoeLInst = new THREE.InstancedMesh(shoeGeo, shoeMat, count);
  const shoeRInst = new THREE.InstancedMesh(shoeGeo, shoeMat, count);

  const skinPalette = [0xf8d5b8, 0xf1c29b, 0xdfb088, 0xc88e64, 0xfce1cc];
  const hairPalette = [0x1c1715, 0x3b261a, 0x5c3c24, 0x8b5a2b, 0x1e293b, 0xc89b54];
  const jacketPalette = [
    0x2563eb, 0xe11d48, 0x059669, 0xd97706, 0xdb2777, 0x4f46e5, 0xf1f5f9, 0x334155, 0x0d9488,
  ];
  const pantsPalette = [0x1e293b, 0x334155, 0x475569, 0x1d4ed8, 0x3f3f46, 0x57534e];
  const shoePalette = [0xf8fafc, 0x0f172a, 0x475569, 0x7c2d12];
  const col = new THREE.Color();

  for (let i = 0; i < count; i++) {
    col.setHex(skinPalette[i % skinPalette.length]);
    headInst.setColorAt(i, col);
    neckInst.setColorAt(i, col);
    handLInst.setColorAt(i, col);
    handRInst.setColorAt(i, col);

    col.setHex(hairPalette[(i * 5) % hairPalette.length]);
    hairInst.setColorAt(i, col);

    col.setHex(jacketPalette[(i * 7) % jacketPalette.length]);
    torsoInst.setColorAt(i, col);
    armLInst.setColorAt(i, col);
    armRInst.setColorAt(i, col);

    col.setHex(pantsPalette[(i * 3) % pantsPalette.length]);
    legLInst.setColorAt(i, col);
    legRInst.setColorAt(i, col);

    col.setHex(shoePalette[(i * 2) % shoePalette.length]);
    shoeLInst.setColorAt(i, col);
    shoeRInst.setColorAt(i, col);
  }

  [
    headInst,
    neckInst,
    hairInst,
    eyeLInst,
    eyeRInst,
    torsoInst,
    armLInst,
    armRInst,
    handLInst,
    handRInst,
    legLInst,
    legRInst,
    shoeLInst,
    shoeRInst,
  ].forEach((inst) => {
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false;
    inst.castShadow = inst === torsoInst || inst === headInst;
    group.add(inst);
  });

  const _dummy = new THREE.Object3D();
  const _offset = new THREE.Vector3();

  const updateTransforms = (elapsedTime: number) => {
    for (let i = 0; i < count; i++) {
      const a = agents[i];
      const baseY = a.mode === 'crosswalk' ? 0.02 : a.x < -215 ? 0.03 : 0.14;
      const s = a.scale;
      const isWalking = a.mode !== 'stand' && a.pauseTimer <= 0;
      const swing = isWalking ? Math.sin(a.phase) * 0.56 : 0;
      const bob = isWalking
        ? Math.abs(Math.sin(a.phase)) * 0.032
        : Math.sin(elapsedTime * 2 + a.phase) * 0.007;

      // Head & Neck
      _dummy.position.set(a.x, baseY + (1.52 + bob) * s, a.z);
      _dummy.rotation.set(0, a.yaw, 0);
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      headInst.setMatrixAt(i, _dummy.matrix);

      _dummy.position.set(a.x, baseY + (1.37 + bob) * s, a.z);
      _dummy.updateMatrix();
      neckInst.setMatrixAt(i, _dummy.matrix);

      // Hair crown tilted backward along -Z
      _offset.set(0, 0.02 * s, -0.015 * s).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a.yaw);
      _dummy.position.set(a.x + _offset.x, baseY + (1.54 + bob) * s, a.z + _offset.z);
      _dummy.rotation.set(-0.22, a.yaw, 0, 'YXZ');
      _dummy.updateMatrix();
      hairInst.setMatrixAt(i, _dummy.matrix);

      // Eyes facing +Z
      _offset.set(-0.042 * s, 0, 0.106 * s).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a.yaw);
      _dummy.position.set(a.x + _offset.x, baseY + (1.53 + bob) * s, a.z + _offset.z);
      _dummy.rotation.set(0, a.yaw, 0);
      _dummy.updateMatrix();
      eyeLInst.setMatrixAt(i, _dummy.matrix);

      _offset.set(0.042 * s, 0, 0.106 * s).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a.yaw);
      _dummy.position.set(a.x + _offset.x, baseY + (1.53 + bob) * s, a.z + _offset.z);
      _dummy.updateMatrix();
      eyeRInst.setMatrixAt(i, _dummy.matrix);

      // Sculpted Torso
      _dummy.position.set(a.x, baseY + (1.07 + bob) * s, a.z);
      _dummy.rotation.set(isWalking ? 0.04 : 0, a.yaw, 0, 'YXZ');
      _dummy.updateMatrix();
      torsoInst.setMatrixAt(i, _dummy.matrix);

      // Arms + Hands (shoulder y = 1.29)
      _offset.set(-0.205 * s, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a.yaw);
      _dummy.position.set(a.x + _offset.x, baseY + (1.29 + bob) * s, a.z + _offset.z);
      _dummy.rotation.set(swing, a.yaw, -0.06, 'YXZ');
      _dummy.updateMatrix();
      armLInst.setMatrixAt(i, _dummy.matrix);
      handLInst.setMatrixAt(i, _dummy.matrix);

      _offset.set(0.205 * s, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a.yaw);
      _dummy.position.set(a.x + _offset.x, baseY + (1.29 + bob) * s, a.z + _offset.z);
      _dummy.rotation.set(-swing, a.yaw, 0.06, 'YXZ');
      _dummy.updateMatrix();
      armRInst.setMatrixAt(i, _dummy.matrix);
      handRInst.setMatrixAt(i, _dummy.matrix);

      // Legs + Shoes (hip y = 0.78 -> shoe touches y ~ 0.16 above baseY)
      _offset.set(-0.095 * s, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a.yaw);
      _dummy.position.set(a.x + _offset.x, baseY + 0.64 * s, a.z + _offset.z);
      _dummy.rotation.set(-swing * 0.92, a.yaw, 0, 'YXZ');
      _dummy.updateMatrix();
      legLInst.setMatrixAt(i, _dummy.matrix);
      shoeLInst.setMatrixAt(i, _dummy.matrix);

      _offset.set(0.095 * s, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a.yaw);
      _dummy.position.set(a.x + _offset.x, baseY + 0.64 * s, a.z + _offset.z);
      _dummy.rotation.set(swing * 0.92, a.yaw, 0, 'YXZ');
      _dummy.updateMatrix();
      legRInst.setMatrixAt(i, _dummy.matrix);
      shoeRInst.setMatrixAt(i, _dummy.matrix);
    }

    headInst.instanceMatrix.needsUpdate = true;
    neckInst.instanceMatrix.needsUpdate = true;
    hairInst.instanceMatrix.needsUpdate = true;
    eyeLInst.instanceMatrix.needsUpdate = true;
    eyeRInst.instanceMatrix.needsUpdate = true;
    torsoInst.instanceMatrix.needsUpdate = true;
    armLInst.instanceMatrix.needsUpdate = true;
    armRInst.instanceMatrix.needsUpdate = true;
    handLInst.instanceMatrix.needsUpdate = true;
    handRInst.instanceMatrix.needsUpdate = true;
    legLInst.instanceMatrix.needsUpdate = true;
    legRInst.instanceMatrix.needsUpdate = true;
    shoeLInst.instanceMatrix.needsUpdate = true;
    shoeRInst.instanceMatrix.needsUpdate = true;
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
    dispose: () => {
      headGeo.dispose();
      neckGeo.dispose();
      hairGeo.dispose();
      eyeGeo.dispose();
      torsoGeo.dispose();
      armGeo.dispose();
      handGeo.dispose();
      legGeo.dispose();
      shoeGeo.dispose();
      skinMat.dispose();
      hairMat.dispose();
      eyeMat.dispose();
      clothMat.dispose();
      pantsMat.dispose();
      shoeMat.dispose();
    },
  };
}
