import * as THREE from 'three';

export interface SportsCarHandle {
  group: THREE.Group;
  wheels: THREE.Group[];
  setHeadlightsEnabled: (enabled: boolean) => void;
  setNightIntensity: (nightFactor: number) => void;
  updateDrive: (
    elapsedTime: number,
    speed: number,
    steerAngle: number,
    isBraking: boolean,
    dt: number
  ) => void;
  dispose: () => void;
}

export function createBlueSportsCar(
  contactShadowTexture: THREE.Texture
): SportsCarHandle {
  const carGroup = new THREE.Group();
  carGroup.name = 'BlueSportsCar';

  // Body container so subtle engine idle breathing doesn't move the tires/shadow
  const sprungBody = new THREE.Group();
  carGroup.add(sprungBody);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // --- Materials (PBR with >= 0.25 roughness contrast across adjacent parts) ---
  const bluePaintMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x1664f6,
      metalness: 0.72,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.35,
    })
  );

  const carbonTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1a1f29,
      metalness: 0.25,
      roughness: 0.62,
    })
  );

  const cabinGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x10243d,
      metalness: 0.12,
      roughness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.6,
      transparent: true,
      opacity: 0.6,
    })
  );

  const interiorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161c26,
      roughness: 0.78,
      metalness: 0.08,
    })
  );

  const rotorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9aa6b8,
      metalness: 0.88,
      roughness: 0.28,
    })
  );

  const rubberTireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x181b20,
      metalness: 0.05,
      roughness: 0.88,
    })
  );

  const alloyRimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd9e2ee,
      metalness: 0.92,
      roughness: 0.2,
    })
  );

  const caliperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe62e3d,
      metalness: 0.4,
      roughness: 0.35,
    })
  );

  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xeaf0f8,
      metalness: 0.96,
      roughness: 0.12,
    })
  );

  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4f9ff,
      emissive: 0xfff7e2,
      emissiveIntensity: 2.2,
      roughness: 0.15,
      metalness: 0.1,
    })
  );

  const taillightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff2238,
      emissive: 0xff1e38,
      emissiveIntensity: 2.1,
      roughness: 0.2,
      metalness: 0.15,
    })
  );

  const plateMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4f7fb,
      roughness: 0.4,
      metalness: 0.05,
    })
  );

  // --- 1. Lower Sports Chassis Hull (beltline & below, with open wheel arches) ---
  // Side profile in X-Y (extruded along Z, then rotated so +X becomes -Z forward)
  const chassisShape = new THREE.Shape();
  chassisShape.moveTo(-2.14, 0.28); // rear lower edge
  chassisShape.lineTo(-1.76, 0.26); // rear wheel arch back bottom
  chassisShape.lineTo(-1.66, 0.56);
  chassisShape.lineTo(-1.48, 0.75); // rear wheel arch top back
  chassisShape.lineTo(-1.20, 0.75); // rear wheel arch top front
  chassisShape.lineTo(-1.00, 0.56);
  chassisShape.lineTo(-0.92, 0.23); // rear wheel arch front bottom
  chassisShape.lineTo(0.94, 0.21);  // center rocker sill
  chassisShape.lineTo(1.02, 0.54);  // front wheel arch back
  chassisShape.lineTo(1.20, 0.74);  // front wheel arch top back
  chassisShape.lineTo(1.52, 0.74);  // front wheel arch top front
  chassisShape.lineTo(1.70, 0.54);
  chassisShape.lineTo(1.78, 0.23);  // front wheel arch front bottom
  chassisShape.lineTo(2.14, 0.23);  // front chin edge
  chassisShape.lineTo(2.24, 0.42);  // sharp front nose tip
  chassisShape.lineTo(2.12, 0.59);  // nose crest
  chassisShape.lineTo(1.55, 0.71);  // sculpted hood slope
  chassisShape.lineTo(0.84, 0.79);  // cowl / windshield base
  chassisShape.lineTo(-0.85, 0.84); // beltline along doors
  chassisShape.lineTo(-1.46, 0.89); // rear haunch kick-up
  chassisShape.lineTo(-2.10, 0.85); // flat rear decklid
  chassisShape.lineTo(-2.18, 0.54); // crisp rear fascia drop
  chassisShape.closePath();

  const chassisGeo = trackGeo(
    new THREE.ExtrudeGeometry(chassisShape, {
      steps: 1,
      depth: 1.66,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.03,
      bevelSegments: 2,
    })
  );
  chassisGeo.translate(0, 0, -0.83);
  chassisGeo.rotateY(Math.PI / 2); // +X -> -Z forward, width spans X = -0.87 .. +0.87

  const chassisMesh = new THREE.Mesh(chassisGeo, bluePaintMat);
  chassisMesh.castShadow = true;
  chassisMesh.receiveShadow = true;
  sprungBody.add(chassisMesh);

  // Dark inner wheel-well liners / underbody floor so light doesn't bleed across the arches
  const underbody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.42, 0.46, 4.1)),
    carbonTrimMat
  );
  underbody.position.set(0, 0.48, 0);
  sprungBody.add(underbody);

  // --- 2. Sculpted Fender Flares & Door Shoulders (cleanly ABOVE wheel arches) ---
  const doorShoulderGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.42, 1.72));
  const archLipGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.14, 0.88));
  [-0.88, 0.88].forEach((xPos) => {
    const door = new THREE.Mesh(doorShoulderGeo, bluePaintMat);
    door.position.set(xPos, 0.54, 0.0);
    door.castShadow = true;
    door.receiveShadow = true;
    sprungBody.add(door);

    const frontLip = new THREE.Mesh(archLipGeo, bluePaintMat);
    frontLip.position.set(xPos, 0.77, -1.36);
    frontLip.castShadow = true;
    sprungBody.add(frontLip);

    const rearLip = new THREE.Mesh(archLipGeo, bluePaintMat);
    rearLip.position.set(xPos, 0.79, 1.34);
    rearLip.castShadow = true;
    sprungBody.add(rearLip);
  });

  // --- 3. Tapered Fastback Cabin Greenhouse + Roof Cap + C-Pillars ---
  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(-1.46, 0.77);
  canopyShape.lineTo(-0.46, 1.19);
  canopyShape.lineTo(0.36, 1.17);
  canopyShape.lineTo(0.88, 0.76);
  canopyShape.closePath();

  const canopyGeo = trackGeo(
    new THREE.ExtrudeGeometry(canopyShape, {
      steps: 1,
      depth: 1.30,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.02,
      bevelSegments: 2,
    })
  );
  canopyGeo.translate(0, 0, -0.65);
  canopyGeo.rotateY(Math.PI / 2); // spans X = -0.69 .. +0.69 (clearly narrower than lower shoulders)

  const canopyMesh = new THREE.Mesh(canopyGeo, cabinGlassMat);
  canopyMesh.castShadow = true;
  sprungBody.add(canopyMesh);

  // Blue painted roof panel & C-pillar buttresses framing the rear window
  const roofCap = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.26, 0.055, 0.84)),
    bluePaintMat
  );
  roofCap.position.set(0, 1.21, 0.05);
  roofCap.castShadow = true;
  sprungBody.add(roofCap);

  const cPillarGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.09, 1.06));
  [-0.65, 0.65].forEach((px) => {
    const cPillar = new THREE.Mesh(cPillarGeo, bluePaintMat);
    cPillar.position.set(px, 1.03, 0.94);
    cPillar.rotation.x = -0.36;
    cPillar.castShadow = true;
    sprungBody.add(cPillar);
  });

  // --- 3b. Sculpted Cockpit Interior (Bucket Seats, Dashboard & Sport Steering Wheel) ---
  const seatGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.44, 0.38));
  [-0.35, 0.35].forEach((sx) => {
    const seat = new THREE.Mesh(seatGeo, interiorMat);
    seat.position.set(sx, 0.78, 0.12);
    sprungBody.add(seat);
  });
  const dash = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.18, 0.18, 0.34)), interiorMat);
  dash.position.set(0, 0.82, -0.45);
  sprungBody.add(dash);
  const steerWheel = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.145, 0.022, 6, 14)),
    carbonTrimMat
  );
  steerWheel.position.set(-0.35, 0.9, -0.32);
  steerWheel.rotation.x = 0.45;
  sprungBody.add(steerWheel);

  // --- 4. Carbon-Fiber Aero Package (Front Splitter, Side Skirts, Rear Diffuser) ---
  const splitterGeo = trackGeo(new THREE.BoxGeometry(1.86, 0.06, 0.40));
  const splitter = new THREE.Mesh(splitterGeo, carbonTrimMat);
  splitter.position.set(0, 0.19, -2.14);
  splitter.castShadow = true;
  sprungBody.add(splitter);

  const skirtGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.09, 1.84));
  [-0.91, 0.91].forEach((xPos) => {
    const skirt = new THREE.Mesh(skirtGeo, carbonTrimMat);
    skirt.position.set(xPos, 0.21, 0.0);
    skirt.castShadow = true;
    sprungBody.add(skirt);
  });

  const diffuserGeo = trackGeo(new THREE.BoxGeometry(1.64, 0.22, 0.32));
  const diffuser = new THREE.Mesh(diffuserGeo, carbonTrimMat);
  diffuser.position.set(0, 0.29, 2.08);
  diffuser.castShadow = true;
  sprungBody.add(diffuser);

  // Diffuser vertical aero fins
  const finGeo = trackGeo(new THREE.BoxGeometry(0.04, 0.2, 0.26));
  [-0.46, -0.16, 0.16, 0.46].forEach((xPos) => {
    const fin = new THREE.Mesh(finGeo, carbonTrimMat);
    fin.position.set(xPos, 0.26, 2.16);
    sprungBody.add(fin);
  });

  // --- 5. Elevated GT Rear Wing Spoiler + Twin Pylons ---
  const wingBladeGeo = trackGeo(new THREE.BoxGeometry(1.80, 0.055, 0.32));
  const wingBlade = new THREE.Mesh(wingBladeGeo, carbonTrimMat);
  wingBlade.position.set(0, 1.10, 1.98);
  wingBlade.rotation.x = 0.1; // subtle downforce angle
  wingBlade.castShadow = true;
  sprungBody.add(wingBlade);

  const wingEndplateGeo = trackGeo(new THREE.BoxGeometry(0.045, 0.17, 0.36));
  [-0.90, 0.90].forEach((xPos) => {
    const endplate = new THREE.Mesh(wingEndplateGeo, bluePaintMat);
    endplate.position.set(xPos, 1.09, 1.98);
    endplate.castShadow = true;
    sprungBody.add(endplate);
  });

  const pylonGeo = trackGeo(new THREE.BoxGeometry(0.05, 0.26, 0.14));
  [-0.46, 0.46].forEach((xPos) => {
    const pylon = new THREE.Mesh(pylonGeo, carbonTrimMat);
    pylon.position.set(xPos, 0.96, 1.94);
    pylon.rotation.x = -0.18;
    sprungBody.add(pylon);
  });

  // --- 6. Front Grille & Side Intakes ---
  const grilleGeo = trackGeo(new THREE.BoxGeometry(1.36, 0.2, 0.08));
  const grille = new THREE.Mesh(grilleGeo, carbonTrimMat);
  grille.position.set(0, 0.35, -2.23);
  sprungBody.add(grille);

  // --- 7. Sleek Side Wing Mirrors ---
  const mirrorArmGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.04, 0.06));
  const mirrorCapGeo = trackGeo(new THREE.BoxGeometry(0.2, 0.1, 0.14));
  [-1, 1].forEach((side) => {
    const arm = new THREE.Mesh(mirrorArmGeo, carbonTrimMat);
    arm.position.set(side * 0.90, 0.84, -0.54);
    sprungBody.add(arm);

    const cap = new THREE.Mesh(mirrorCapGeo, bluePaintMat);
    cap.position.set(side * 1.01, 0.87, -0.52);
    cap.castShadow = true;
    sprungBody.add(cap);
  });

  // --- 8. LED Headlights & Iconic Rear Tail-Light Bar ---
  const headlightGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.08, 0.12));
  [-0.64, 0.64].forEach((xPos) => {
    const hl = new THREE.Mesh(headlightGeo, headlightMat);
    hl.position.set(xPos, 0.53, -2.18);
    hl.rotation.y = xPos < 0 ? 0.18 : -0.18;
    sprungBody.add(hl);
  });

  // Sleek full-width anime LED tail-light bar + side signatures
  const tailBarGeo = trackGeo(new THREE.BoxGeometry(1.56, 0.06, 0.07));
  const tailBar = new THREE.Mesh(tailBarGeo, taillightMat);
  tailBar.position.set(0, 0.74, 2.17);
  sprungBody.add(tailBar);

  const tailPodGeo = trackGeo(new THREE.BoxGeometry(0.34, 0.11, 0.08));
  [-0.64, 0.64].forEach((xPos) => {
    const pod = new THREE.Mesh(tailPodGeo, taillightMat);
    pod.position.set(xPos, 0.73, 2.18);
    sprungBody.add(pod);
  });

  // Rear license plate
  const plateGeo = trackGeo(new THREE.BoxGeometry(0.44, 0.14, 0.03));
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.set(0, 0.53, 2.18);
  sprungBody.add(plate);

  // --- 9. Twin Chrome Exhaust Pipes (Left & Right pairs) ---
  const exhaustGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 16));
  exhaustGeo.rotateX(Math.PI / 2);
  [-0.66, -0.50, 0.50, 0.66].forEach((xPos) => {
    const pipe = new THREE.Mesh(exhaustGeo, chromeMat);
    pipe.position.set(xPos, 0.27, 2.22);
    sprungBody.add(pipe);
  });

  // --- 10. Four Multi-Part Wheel Assemblies (clearly visible & grounded at y = 0) ---
  const wheelRadius = 0.36;
  const frontTireWidth = 0.28;
  const rearTireWidth = 0.32;

  const frontTireGeo = trackGeo(
    new THREE.CylinderGeometry(wheelRadius, wheelRadius, frontTireWidth, 28)
  );
  frontTireGeo.rotateZ(Math.PI / 2);

  const rearTireGeo = trackGeo(
    new THREE.CylinderGeometry(wheelRadius, wheelRadius, rearTireWidth, 28)
  );
  rearTireGeo.rotateZ(Math.PI / 2);

  const frontRimBarrelGeo = trackGeo(
    new THREE.CylinderGeometry(0.24, 0.24, frontTireWidth + 0.015, 20)
  );
  frontRimBarrelGeo.rotateZ(Math.PI / 2);

  const rearRimBarrelGeo = trackGeo(
    new THREE.CylinderGeometry(0.24, 0.24, rearTireWidth + 0.015, 20)
  );
  rearRimBarrelGeo.rotateZ(Math.PI / 2);

  const frontSpokeGeo = trackGeo(new THREE.BoxGeometry(frontTireWidth + 0.02, 0.44, 0.045));
  const rearSpokeGeo = trackGeo(new THREE.BoxGeometry(rearTireWidth + 0.02, 0.44, 0.045));
  const hubGeo = trackGeo(new THREE.CylinderGeometry(0.068, 0.068, rearTireWidth + 0.03, 14));
  hubGeo.rotateZ(Math.PI / 2);

  const caliperGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.15, 0.1));

  const wheelPositions: { x: number; y: number; z: number; isRear: boolean }[] = [
    { x: -0.88, y: wheelRadius, z: -1.36, isRear: false }, // Front Left
    { x: 0.88, y: wheelRadius, z: -1.36, isRear: false }, // Front Right
    { x: -0.90, y: wheelRadius, z: 1.34, isRear: true }, // Rear Left
    { x: 0.90, y: wheelRadius, z: 1.34, isRear: true }, // Rear Right
  ];

  const wheels: THREE.Group[] = [];
  const wheelSpinGroups: THREE.Group[] = [];

  wheelPositions.forEach(({ x: wx, y: wy, z: wz, isRear }) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(wx, wy, wz);

    // Spinning sub-assembly (tire + rim + spokes + hub)
    const spinGroup = new THREE.Group();

    const tire = new THREE.Mesh(isRear ? rearTireGeo : frontTireGeo, rubberTireMat);
    tire.castShadow = true;
    tire.receiveShadow = true;
    spinGroup.add(tire);

    const rim = new THREE.Mesh(isRear ? rearRimBarrelGeo : frontRimBarrelGeo, alloyRimMat);
    spinGroup.add(rim);

    // 5-spoke star alloy pattern
    const sGeo = isRear ? rearSpokeGeo : frontSpokeGeo;
    for (let s = 0; s < 5; s++) {
      const spoke = new THREE.Mesh(sGeo, alloyRimMat);
      spoke.rotation.x = (s * Math.PI) / 5;
      spinGroup.add(spoke);
    }

    const hub = new THREE.Mesh(hubGeo, carbonTrimMat);
    spinGroup.add(hub);

    const rotorGeo = trackGeo(new THREE.CylinderGeometry(0.19, 0.19, 0.035, 16));
    rotorGeo.rotateZ(Math.PI / 2);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.x = wx < 0 ? 0.04 : -0.04;
    spinGroup.add(rotor);

    wheelGroup.add(spinGroup);
    wheelSpinGroups.push(spinGroup);

    // Performance crimson brake caliper stays upright with steering knuckle
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(wx < 0 ? 0.04 : -0.04, 0.05, 0.11);
    wheelGroup.add(caliper);

    carGroup.add(wheelGroup);
    wheels.push(wheelGroup);
  });

  // --- 11. Soft Radial Contact Shadow Plane flush over road ---
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(3.2, 5.4));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowTexture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.set(0, 0.015, 0);
  carGroup.add(contactShadow);

  // --- 12. Real Road-Illuminating Front Headlight Beam (non-shadow for 60fps mobile) ---
  const beamLight = new THREE.SpotLight(0xfff4d8, 0, 56, Math.PI * 0.24, 0.55, 1.35);
  beamLight.position.set(0, 0.72, -2.05);
  beamLight.target.position.set(0, 0.0, -24);
  carGroup.add(beamLight);
  carGroup.add(beamLight.target);

  let lightsEnabled = true;
  let currentNightFactor = 0;

  const updateBeam = () => {
    const activeGlow = 0.25 + currentNightFactor * 1.05;
    beamLight.intensity = lightsEnabled ? 18.0 * activeGlow : 0;
  };

  return {
    group: carGroup,
    wheels,
    setHeadlightsEnabled: (enabled: boolean) => {
      lightsEnabled = enabled;
      headlightMat.emissiveIntensity = enabled ? 2.4 + currentNightFactor * 1.4 : 0.25;
      taillightMat.emissiveIntensity = enabled ? 2.1 : 0.75;
      updateBeam();
    },
    setNightIntensity: (nightFactor: number) => {
      currentNightFactor = nightFactor;
      if (lightsEnabled) {
        headlightMat.emissiveIntensity = 2.4 + nightFactor * 1.4;
      }
      updateBeam();
    },
    updateDrive: (
      elapsedTime: number,
      speed: number,
      steerAngle: number,
      isBraking: boolean,
      dt: number
    ) => {
      // Spin all 4 wheels proportionally to linear ground distance traveled
      const spinDelta = (speed * dt) / wheelRadius;
      for (let i = 0; i < wheelSpinGroups.length; i++) {
        wheelSpinGroups[i].rotation.x -= spinDelta;
      }

      // Steer front two wheels
      wheels[0].rotation.y = steerAngle;
      wheels[1].rotation.y = steerAngle;

      // Subtle living suspension idle & body roll/pitch while preserving ground contact
      const idleScale = Math.abs(speed) < 0.25 ? 1 : 0.35;
      sprungBody.position.y = Math.sin(elapsedTime * 3.2) * 0.0035 * idleScale;

      const targetRoll = -steerAngle * THREE.MathUtils.clamp(speed / 22, -1, 1) * 0.045;
      const targetPitch = isBraking ? -0.018 : THREE.MathUtils.clamp(speed / 28, -0.3, 1) * 0.012;
      sprungBody.rotation.z = THREE.MathUtils.damp(sprungBody.rotation.z, targetRoll, 9, dt);
      sprungBody.rotation.x = THREE.MathUtils.damp(sprungBody.rotation.x, targetPitch, 8, dt);

      // Boost rear tail-lights cleanly when braking/reversing
      const baseTail = lightsEnabled ? 2.1 : 0.75;
      taillightMat.emissiveIntensity = isBraking ? 3.2 : baseTail;
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
