import * as THREE from 'three';

export type DetailedVehicleModelType =
  | 'car'
  | 'bus'
  | 'truck'
  | 'motorcycle'
  | 'tractor'
  | 'pickup'
  | 'emergency'
  | 'vip'
  | 'tank'
  | 'airplane'
  | 'helicopter';

export interface BuiltVehicleModel {
  mesh: THREE.Group;
  sprungBody: THREE.Group;
  wheelSteerPivots: THREE.Group[]; // Front steering knuckles
  wheelSpinGroups: THREE.Group[]; // Spinning wheel + rim assemblies
  wheelRadii: number[];
  riderGroup?: THREE.Group;
  taillightMats?: THREE.MeshStandardMaterial[];
}

export interface VehicleFactoryPalette {
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  trackMat: <T extends THREE.Material>(m: T) => T;
  beaconRedMat: THREE.MeshStandardMaterial;
  beaconBlueMat: THREE.MeshStandardMaterial;
}

export function createVehicleBuilder(palette: VehicleFactoryPalette) {
  const { trackGeo, trackMat, beaconRedMat, beaconBlueMat } = palette;

  // --- Shared PBR Vehicle Materials ---
  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x16191e, roughness: 0.9, metalness: 0.04 })
  );
  const alloyMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdbe4ef, metalness: 0.9, roughness: 0.22 })
  );
  const darkMetalMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x262d38, metalness: 0.65, roughness: 0.42 })
  );
  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.96, roughness: 0.12 })
  );
  const interiorMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.85, metalness: 0.05 })
  );
  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x102840,
      metalness: 0.1,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.62,
    })
  );
  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fbff,
      emissive: 0xfff5d6,
      emissiveIntensity: 1.8,
      roughness: 0.15,
    })
  );
  const taillightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff2238,
      emissive: 0xff1a30,
      emissiveIntensity: 1.6,
      roughness: 0.2,
    })
  );
  const amberLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.1,
      roughness: 0.2,
    })
  );

  const sedanColors = [0xe11d48, 0xf8fafc, 0x059669, 0x6366f1, 0x94a3b8, 0xd97706];
  const sedanMats = sedanColors.map((c) =>
    trackMat(
      new THREE.MeshPhysicalMaterial({
        color: c,
        metalness: 0.6,
        roughness: 0.24,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
      })
    )
  );
  const pickupColors = [0x15803d, 0xb91c1c, 0x1d4ed8, 0x475569, 0xca8a04];
  const pickupMats = pickupColors.map((c) =>
    trackMat(
      new THREE.MeshPhysicalMaterial({
        color: c,
        metalness: 0.45,
        roughness: 0.3,
        clearcoat: 0.65,
      })
    )
  );
  const busBodyMat = trackMat(
    new THREE.MeshPhysicalMaterial({ color: 0x0284c7, metalness: 0.35, roughness: 0.28, clearcoat: 0.7 })
  );
  const busAccentMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45, metalness: 0.1 })
  );
  const truckCabMat = trackMat(
    new THREE.MeshPhysicalMaterial({ color: 0xd97706, metalness: 0.5, roughness: 0.28, clearcoat: 0.8 })
  );
  const truckCargoMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.58, metalness: 0.18 })
  );
  const motoPaintMat = trackMat(
    new THREE.MeshPhysicalMaterial({ color: 0xef4444, metalness: 0.68, roughness: 0.22, clearcoat: 1.0 })
  );
  const tractorGreenMat = trackMat(
    new THREE.MeshPhysicalMaterial({ color: 0x16a34a, metalness: 0.4, roughness: 0.32, clearcoat: 0.65 })
  );
  const tractorYellowMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.35, roughness: 0.38 })
  );
  const hayMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd9a84e, roughness: 0.92, metalness: 0.0 })
  );
  const policeWhiteMat = trackMat(
    new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, metalness: 0.42, roughness: 0.24, clearcoat: 0.9 })
  );
  const policeNavyMat = trackMat(
    new THREE.MeshPhysicalMaterial({ color: 0x172554, metalness: 0.52, roughness: 0.24, clearcoat: 0.9 })
  );

  // Rider materials
  const riderJacketMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.62 }));
  const riderPantsMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78 }));
  const helmetMat = trackMat(
    new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.18, clearcoat: 1.0 })
  );

  // Helper: multi-part wheel with tire, alloy rim, 5 spokes, hub & brake disc
  const buildWheelAssembly = (
    radius: number,
    width: number,
    rimMat: THREE.Material,
    lugged = false
  ): { steerPivot: THREE.Group; spinGroup: THREE.Group } => {
    const steerPivot = new THREE.Group();
    const spinGroup = new THREE.Group();

    const tireGeo = trackGeo(new THREE.CylinderGeometry(radius, radius, width, 20));
    tireGeo.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spinGroup.add(tire);

    if (lugged) {
      // Agricultural tractor tread lugs around tire
      const lugGeo = trackGeo(new THREE.BoxGeometry(width * 0.92, 0.075, 0.095));
      for (let l = 0; l < 12; l++) {
        const a = (l / 12) * Math.PI * 2;
        const lug = new THREE.Mesh(lugGeo, tireMat);
        lug.position.set(0, Math.cos(a) * radius, Math.sin(a) * radius);
        lug.rotation.x = -a;
        spinGroup.add(lug);
      }
    }

    const rimR = radius * 0.64;
    const rimGeo = trackGeo(new THREE.CylinderGeometry(rimR, rimR, width + 0.015, 16));
    rimGeo.rotateZ(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    spinGroup.add(rim);

    const spokeGeo = trackGeo(new THREE.BoxGeometry(width + 0.025, rimR * 1.75, radius * 0.12));
    for (let s = 0; s < 3; s++) {
      const sp = new THREE.Mesh(spokeGeo, rimMat);
      sp.rotation.x = (s * Math.PI) / 3;
      spinGroup.add(sp);
    }

    const hubGeo = trackGeo(new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, width + 0.04, 10));
    hubGeo.rotateZ(Math.PI / 2);
    spinGroup.add(new THREE.Mesh(hubGeo, darkMetalMat));

    steerPivot.add(spinGroup);
    return { steerPivot, spinGroup };
  };

  // Pre-build Sedan & Pickup ExtrudeGeometries for sharing
  const sedanShape = new THREE.Shape();
  sedanShape.moveTo(-2.05, 0.24);
  sedanShape.lineTo(2.05, 0.22);
  sedanShape.lineTo(2.14, 0.45);
  sedanShape.lineTo(2.02, 0.64);
  sedanShape.lineTo(1.12, 0.78);
  sedanShape.lineTo(0.45, 1.24);
  sedanShape.lineTo(-0.55, 1.26);
  sedanShape.lineTo(-1.35, 0.84);
  sedanShape.lineTo(-2.04, 0.8);
  sedanShape.lineTo(-2.12, 0.48);
  sedanShape.closePath();
  const sedanBodyGeo = trackGeo(
    new THREE.ExtrudeGeometry(sedanShape, {
      steps: 1,
      depth: 1.56,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.06,
      bevelSegments: 2,
    })
  );
  sedanBodyGeo.translate(0, 0, -0.78);
  sedanBodyGeo.rotateY(Math.PI / 2);

  const sedanGlassShape = new THREE.Shape();
  sedanGlassShape.moveTo(-1.26, 0.82);
  sedanGlassShape.lineTo(-0.52, 1.25);
  sedanGlassShape.lineTo(0.42, 1.22);
  sedanGlassShape.lineTo(1.06, 0.8);
  sedanGlassShape.closePath();
  const sedanGlassGeo = trackGeo(
    new THREE.ExtrudeGeometry(sedanGlassShape, {
      steps: 1,
      depth: 1.38,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.03,
      bevelSegments: 2,
    })
  );
  sedanGlassGeo.translate(0, 0, -0.69);
  sedanGlassGeo.rotateY(Math.PI / 2);

  // Pickup profile (crew cab + open rear bed walls)
  const pickupCabShape = new THREE.Shape();
  pickupCabShape.moveTo(-0.35, 0.34);
  pickupCabShape.lineTo(2.15, 0.32);
  pickupCabShape.lineTo(2.28, 0.64);
  pickupCabShape.lineTo(2.16, 0.94);
  pickupCabShape.lineTo(1.25, 1.04);
  pickupCabShape.lineTo(0.68, 1.62);
  pickupCabShape.lineTo(-0.35, 1.64);
  pickupCabShape.closePath();
  const pickupCabGeo = trackGeo(
    new THREE.ExtrudeGeometry(pickupCabShape, {
      steps: 1,
      depth: 1.72,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.05,
      bevelSegments: 2,
    })
  );
  pickupCabGeo.translate(0, 0, -0.86);
  pickupCabGeo.rotateY(Math.PI / 2);

  const buildVehicle = (
    type: DetailedVehicleModelType,
    colorIdx: number
  ): BuiltVehicleModel => {
    const root = new THREE.Group();
    const sprungBody = new THREE.Group();
    root.add(sprungBody);

    const wheelSteerPivots: THREE.Group[] = [];
    const wheelSpinGroups: THREE.Group[] = [];
    const wheelRadii: number[] = [];
    let riderGroup: THREE.Group | undefined;

    const addWheel = (
      x: number,
      y: number,
      z: number,
      r: number,
      w: number,
      rimMat: THREE.Material = alloyMat,
      lugged = false
    ) => {
      const { steerPivot, spinGroup } = buildWheelAssembly(r, w, rimMat, lugged);
      steerPivot.position.set(x, y, z);
      root.add(steerPivot);
      wheelSteerPivots.push(steerPivot);
      wheelSpinGroups.push(spinGroup);
      wheelRadii.push(r);
    };

    const addHeadAndTailLights = (
      halfW: number,
      yF: number,
      zF: number,
      yR: number,
      zR: number,
      w = 0.34,
      h = 0.11
    ) => {
      const lGeo = trackGeo(new THREE.BoxGeometry(w, h, 0.08));
      [-halfW, halfW].forEach((lx) => {
        const hl = new THREE.Mesh(lGeo, headlightMat);
        hl.position.set(lx, yF, zF);
        sprungBody.add(hl);
        const tl = new THREE.Mesh(lGeo, taillightMat);
        tl.position.set(lx, yR, zR);
        sprungBody.add(tl);
      });
    };

    const addSideMirrors = (xOff: number, y: number, z: number, mat: THREE.Material) => {
      const capGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.1, 0.13));
      [-1, 1].forEach((s) => {
        const m = new THREE.Mesh(capGeo, mat);
        m.position.set(s * xOff, y, z);
        sprungBody.add(m);
      });
    };

    const addInteriorSeats = (yBase: number, zFront: number, zRear?: number) => {
      const seatGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.44, 0.38));
      [-0.36, 0.36].forEach((sx) => {
        const seat = new THREE.Mesh(seatGeo, interiorMat);
        seat.position.set(sx, yBase, zFront);
        sprungBody.add(seat);
      });
      if (zRear !== undefined) {
        const bench = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 0.4, 0.4)), interiorMat);
        bench.position.set(0, yBase, zRear);
        sprungBody.add(bench);
      }
      const wheel = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.16, 0.025, 6, 12)), darkMetalMat);
      wheel.position.set(-0.36, yBase + 0.15, zFront - 0.36);
      wheel.rotation.x = 0.55;
      sprungBody.add(wheel);
    };

    if (type === 'car' || type === 'emergency') {
      const isPolice = type === 'emergency';
      const bodyMat = isPolice ? policeNavyMat : sedanMats[colorIdx % sedanMats.length];

      const chassis = new THREE.Mesh(sedanBodyGeo, bodyMat);
      chassis.castShadow = true;
      chassis.receiveShadow = true;
      sprungBody.add(chassis);

      if (isPolice) {
        // White police doors & roof
        const doors = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.82, 0.56, 1.78)), policeWhiteMat);
        doors.position.set(0, 0.56, 0.05);
        sprungBody.add(doors);
        const roof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.42, 0.08, 1.05)), policeWhiteMat);
        roof.position.set(0, 1.32, 0.08);
        sprungBody.add(roof);

        // Front pushbar bumper
        const pushbar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.05, 0.32, 0.14)), darkMetalMat);
        pushbar.position.set(0, 0.42, -2.2);
        sprungBody.add(pushbar);

        // Red/Blue LED Lightbar
        const barBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.12, 0.06, 0.28)), darkMetalMat);
        barBase.position.set(0, 1.37, 0.06);
        sprungBody.add(barBase);
        const barL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.5, 0.12, 0.24)), beaconRedMat);
        barL.position.set(-0.27, 1.44, 0.06);
        sprungBody.add(barL);
        const barR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.5, 0.12, 0.24)), beaconBlueMat);
        barR.position.set(0.27, 1.44, 0.06);
        sprungBody.add(barR);
      }

      addInteriorSeats(0.78, -0.1, 0.55);

      const glass = new THREE.Mesh(sedanGlassGeo, glassMat);
      sprungBody.add(glass);

      // Front chrome grille + bumpers + exhaust
      const grille = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 0.18, 0.06)), darkMetalMat);
      grille.position.set(0, 0.44, -2.18);
      sprungBody.add(grille);
      const grilleTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.02, 0.22, 0.04)), chromeMat);
      grilleTrim.position.set(0, 0.44, -2.17);
      sprungBody.add(grilleTrim);

      addSideMirrors(0.92, 0.88, -0.45, bodyMat);
      addHeadAndTailLights(0.62, 0.54, -2.14, 0.66, 2.13);

      const pipe = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 10)), chromeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(0.52, 0.24, 2.14);
      sprungBody.add(pipe);

      addWheel(-0.88, 0.34, -1.28, 0.34, 0.23);
      addWheel(0.88, 0.34, -1.28, 0.34, 0.23);
      addWheel(-0.88, 0.34, 1.28, 0.34, 0.23);
      addWheel(0.88, 0.34, 1.28, 0.34, 0.23);
    } else if (type === 'pickup') {
      const paintMat = pickupMats[colorIdx % pickupMats.length];

      // Crew cab + sculpted hood
      const cab = new THREE.Mesh(pickupCabGeo, paintMat);
      cab.castShadow = true;
      cab.receiveShadow = true;
      sprungBody.add(cab);

      // Open Rear Cargo Bed (floor + side walls + tailgate)
      const bedFloor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.82, 0.2, 2.05)), darkMetalMat);
      bedFloor.position.set(0, 0.62, 1.35);
      sprungBody.add(bedFloor);

      [-0.84, 0.84].forEach((bx) => {
        const wall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 0.58, 2.08)), paintMat);
        wall.position.set(bx, 0.96, 1.35);
        wall.castShadow = true;
        sprungBody.add(wall);
      });
      const tailgate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.84, 0.58, 0.15)), paintMat);
      tailgate.position.set(0, 0.96, 2.34);
      sprungBody.add(tailgate);

      // Rural Hay Bales / Cargo inside truck bed
      const hay = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.36, 0.36, 0.9, 10)), hayMat);
      hay.rotation.z = Math.PI / 2;
      hay.position.set(0, 0.98, 1.25);
      sprungBody.add(hay);

      // Cabin Windows + Interior + Rollbar
      addInteriorSeats(1.06, -0.35);
      const win = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.66, 0.52, 1.55)), glassMat);
      win.position.set(0, 1.34, -0.15);
      sprungBody.add(win);

      const grille = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.28, 0.34, 0.1)), chromeMat);
      grille.position.set(0, 0.72, -2.32);
      sprungBody.add(grille);

      const stepGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.06, 1.65));
      [-0.96, 0.96].forEach((sx) => {
        const step = new THREE.Mesh(stepGeo, darkMetalMat);
        step.position.set(sx, 0.36, -0.1);
        sprungBody.add(step);
      });

      addSideMirrors(1.02, 1.2, -0.68, darkMetalMat);
      addHeadAndTailLights(0.72, 0.78, -2.32, 0.96, 2.42);

      // Heavy off-road tires (radius 0.42)
      addWheel(-0.96, 0.42, -1.48, 0.42, 0.28, alloyMat, true);
      addWheel(0.96, 0.42, -1.48, 0.42, 0.28, alloyMat, true);
      addWheel(-0.96, 0.42, 1.48, 0.42, 0.28, alloyMat, true);
      addWheel(0.96, 0.42, 1.48, 0.42, 0.28, alloyMat, true);
    } else if (type === 'tractor') {
      // --- Authentic Agricultural Tractor ---
      // Engine chassis & heavy frame
      const frame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 0.38, 3.2)), darkMetalMat);
      frame.position.set(0, 0.72, -0.15);
      sprungBody.add(frame);

      // Sculpted green diesel engine hood
      const hoodShape = new THREE.Shape();
      hoodShape.moveTo(-0.35, 0.88);
      hoodShape.lineTo(1.75, 0.88);
      hoodShape.lineTo(1.82, 1.45);
      hoodShape.lineTo(1.65, 1.64);
      hoodShape.lineTo(-0.25, 1.68);
      hoodShape.closePath();
      const hoodGeo = trackGeo(
        new THREE.ExtrudeGeometry(hoodShape, {
          steps: 1,
          depth: 0.92,
          bevelEnabled: true,
          bevelThickness: 0.08,
          bevelSize: 0.05,
          bevelSegments: 2,
        })
      );
      hoodGeo.translate(0, 0, -0.46);
      hoodGeo.rotateY(Math.PI / 2);
      const hood = new THREE.Mesh(hoodGeo, tractorGreenMat);
      hood.castShadow = true;
      sprungBody.add(hood);

      // Yellow nose stripe + radiator grille
      const grille = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.84, 0.46, 0.08)), darkMetalMat);
      grille.position.set(0, 1.24, -1.86);
      sprungBody.add(grille);
      const stripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.06, 0.12, 1.75)), tractorYellowMat);
      stripe.position.set(0, 1.32, -0.82);
      sprungBody.add(stripe);

      // Vertical exhaust stack with rain flap
      const stack = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.07, 1.15, 10)), darkMetalMat);
      stack.position.set(0.36, 2.08, -1.15);
      sprungBody.add(stack);

      // Rear flared mudguards
      const fenderGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.16, 1.35));
      [-0.86, 0.86].forEach((fx) => {
        const fender = new THREE.Mesh(fenderGeo, tractorGreenMat);
        fender.position.set(fx, 1.44, 0.85);
        sprungBody.add(fender);
      });

      // Open ROPS Cab Posts + Roof Canopy + Seat & Steering Wheel
      const seat = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.52, 0.48, 0.48)), interiorMat);
      seat.position.set(0, 1.25, 0.72);
      sprungBody.add(seat);

      const steerCol = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.035, 0.045, 0.55, 8)), darkMetalMat);
      steerCol.position.set(0, 1.36, 0.18);
      steerCol.rotation.x = -0.5;
      sprungBody.add(steerCol);
      const steerWheel = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.2, 0.028, 6, 14)), darkMetalMat);
      steerWheel.position.set(0, 1.58, 0.3);
      steerWheel.rotation.x = 0.95;
      sprungBody.add(steerWheel);

      const postGeo = trackGeo(new THREE.CylinderGeometry(0.045, 0.045, 1.25, 8));
      [
        [-0.58, 0.25],
        [0.58, 0.25],
        [-0.58, 1.22],
        [0.58, 1.22],
      ].forEach(([px, pz]) => {
        const post = new THREE.Mesh(postGeo, darkMetalMat);
        post.position.set(px, 1.98, pz);
        sprungBody.add(post);
      });

      const canopy = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.38, 0.14, 1.38)), tractorGreenMat);
      canopy.position.set(0, 2.62, 0.74);
      canopy.castShadow = true;
      sprungBody.add(canopy);

      // Amber rooftop beacon + front headlights
      const beacon = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 10)), amberLightMat);
      beacon.position.set(0, 2.75, 0.45);
      sprungBody.add(beacon);

      // Rear 3-Point Agricultural Hitch Bar
      const hitch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.35, 0.22, 0.45)), darkMetalMat);
      hitch.position.set(0, 0.55, 1.72);
      sprungBody.add(hitch);

      addHeadAndTailLights(0.56, 1.15, -1.84, 1.45, 1.45, 0.18, 0.14);

      // Smaller front steering wheels (0.42m) + GIANT lugged rear tractor wheels (0.76m)!
      addWheel(-0.76, 0.42, -1.38, 0.42, 0.24, tractorYellowMat, true);
      addWheel(0.76, 0.42, -1.38, 0.42, 0.24, tractorYellowMat, true);
      addWheel(-0.92, 0.76, 0.85, 0.76, 0.42, tractorYellowMat, true);
      addWheel(0.92, 0.76, 0.85, 0.76, 0.42, tractorYellowMat, true);
    } else if (type === 'bus') {
      // Aerodynamic City Coach
      const coachShape = new THREE.Shape();
      coachShape.moveTo(-4.1, 0.36);
      coachShape.lineTo(4.05, 0.34);
      coachShape.lineTo(4.2, 0.85);
      coachShape.lineTo(4.12, 2.48);
      coachShape.lineTo(3.85, 2.74);
      coachShape.lineTo(-3.95, 2.74);
      coachShape.lineTo(-4.15, 2.42);
      coachShape.closePath();
      const coachGeo = trackGeo(
        new THREE.ExtrudeGeometry(coachShape, {
          steps: 1,
          depth: 2.26,
          bevelEnabled: true,
          bevelThickness: 0.1,
          bevelSize: 0.06,
          bevelSegments: 2,
        })
      );
      coachGeo.translate(0, 0, -1.13);
      coachGeo.rotateY(Math.PI / 2);
      const body = new THREE.Mesh(coachGeo, busBodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      sprungBody.add(body);

      const stripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.42, 0.22, 8.2)), busAccentMat);
      stripe.position.set(0, 1.12, 0);
      sprungBody.add(stripe);

      // Panoramic glass band + interior seat rows
      const glassBand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 0.94, 7.6)), glassMat);
      glassBand.position.set(0, 1.9, -0.1);
      sprungBody.add(glassBand);

      const frontWind = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.18, 1.2, 0.14)), glassMat);
      frontWind.position.set(0, 1.95, -4.18);
      sprungBody.add(frontWind);

      // Rooftop AC Pods
      [-1.8, 1.4].forEach((az) => {
        const ac = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 0.26, 1.85)), busAccentMat);
        ac.position.set(0, 2.9, az);
        sprungBody.add(ac);
      });

      addSideMirrors(1.3, 1.85, -3.9, darkMetalMat);
      addHeadAndTailLights(0.84, 0.72, -4.22, 0.85, 4.18);

      addWheel(-1.12, 0.44, -2.55, 0.44, 0.3);
      addWheel(1.12, 0.44, -2.55, 0.44, 0.3);
      addWheel(-1.12, 0.44, 2.45, 0.44, 0.34);
      addWheel(1.12, 0.44, 2.45, 0.44, 0.34);
    } else if (type === 'truck') {
      // Semi-Truck Cab + Cargo Trailer
      const cab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.22, 1.95, 2.25)), truckCabMat);
      cab.position.set(0, 1.38, -2.42);
      cab.castShadow = true;
      sprungBody.add(cab);

      const hood = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.14, 0.92, 0.9)), truckCabMat);
      hood.position.set(0, 0.88, -3.85);
      sprungBody.add(hood);

      const wind = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.98, 0.72, 0.1)), glassMat);
      wind.position.set(0, 1.82, -3.55);
      sprungBody.add(wind);

      const grille = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 0.65, 0.1)), chromeMat);
      grille.position.set(0, 0.85, -4.32);
      sprungBody.add(grille);

      // Twin Chrome Exhaust Stacks
      [-1.02, 1.02].forEach((ex) => {
        const stack = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.065, 0.065, 2.15, 8)), chromeMat);
        stack.position.set(ex, 1.92, -1.45);
        sprungBody.add(stack);
      });

      // Cargo Container with Corrugated Rib Bands
      const cargo = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.38, 2.48, 5.4)), truckCargoMat);
      cargo.position.set(0, 1.72, 1.48);
      cargo.castShadow = true;
      cargo.receiveShadow = true;
      sprungBody.add(cargo);

      const ribGeo = trackGeo(new THREE.BoxGeometry(2.43, 0.14, 5.42));
      [0.68, 2.85].forEach((ry) => {
        const rib = new THREE.Mesh(ribGeo, darkMetalMat);
        rib.position.set(0, ry, 1.48);
        sprungBody.add(rib);
      });

      addSideMirrors(1.24, 1.75, -3.2, chromeMat);
      addHeadAndTailLights(0.76, 0.65, -4.32, 0.68, 4.2);

      // Front steering axle + dual rear cargo axles
      addWheel(-1.08, 0.42, -3.3, 0.42, 0.28);
      addWheel(1.08, 0.42, -3.3, 0.42, 0.28);
      addWheel(-1.08, 0.42, 1.15, 0.42, 0.3);
      addWheel(1.08, 0.42, 1.15, 0.42, 0.3);
      addWheel(-1.08, 0.42, 2.55, 0.42, 0.3);
      addWheel(1.08, 0.42, 2.55, 0.42, 0.3);
    } else if (type === 'vip') {
      const vipMat = trackMat(new THREE.MeshPhysicalMaterial({ color: 0x0f172a, metalness: 0.85, roughness: 0.15, clearcoat: 1.0 }));
      const goldTrimMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 }));

      const chassis = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.02, 0.72, 5.2)), vipMat);
      chassis.position.set(0, 0.45, 0);
      chassis.castShadow = true;
      sprungBody.add(chassis);

      const cabin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.82, 0.75, 3.1)), glassMat);
      cabin.position.set(0, 1.02, -0.15);
      sprungBody.add(cabin);

      const stripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.05, 0.08, 5.22)), goldTrimMat);
      stripe.position.set(0, 0.65, 0);
      sprungBody.add(stripe);

      addInteriorSeats(0.65, -1.1, 0.8);
      addHeadAndTailLights(0.72, 0.48, -2.62, 0.74, 2.62);

      addWheel(-0.92, 0.38, -1.65, 0.38, 0.26, goldTrimMat);
      addWheel(0.92, 0.38, -1.65, 0.38, 0.26, goldTrimMat);
      addWheel(-0.92, 0.38, 1.65, 0.38, 0.26, goldTrimMat);
      addWheel(0.92, 0.38, 1.65, 0.38, 0.26, goldTrimMat);
    } else if (type === 'tank') {
      const tankMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b4d32, roughness: 0.7, metalness: 0.3 }));
      const treadMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1a1c18, roughness: 0.9 }));

      const hull = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 0.85, 3.8)), tankMat);
      hull.position.set(0, 0.65, 0);
      hull.castShadow = true;
      sprungBody.add(hull);

      [-1.25, 1.25].forEach((tx) => {
        const tread = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.38, 0.72, 4.0)), treadMat);
        tread.position.set(tx, 0.42, 0);
        sprungBody.add(tread);
      });

      const turret = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.6, 0.65, 1.8)), tankMat);
      turret.position.set(0, 1.35, 0.1);
      turret.castShadow = true;
      sprungBody.add(turret);

      const cannon = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.12, 0.14, 2.8, 12)), darkMetalMat);
      cannon.rotation.x = Math.PI / 2;
      cannon.position.set(0, 1.5, -1.5);
      sprungBody.add(cannon);

      addWheel(-1.25, 0.38, -1.4, 0.38, 0.38);
      addWheel(1.25, 0.38, -1.4, 0.38, 0.38);
      addWheel(-1.25, 0.38, 1.4, 0.38, 0.38);
      addWheel(1.25, 0.38, 1.4, 0.38, 0.38);
    } else if (type === 'airplane') {
      const airMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.5 }));
      const wingMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4, metalness: 0.3 }));

      const fuselage = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.65, 0.55, 5.2, 12)), airMat);
      fuselage.rotation.x = Math.PI / 2;
      fuselage.position.set(0, 1.2, 0);
      fuselage.castShadow = true;
      sprungBody.add(fuselage);

      const wings = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 0.12, 1.4)), wingMat);
      wings.position.set(0, 1.35, 0.2);
      sprungBody.add(wings);

      const tailWing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.2, 0.1, 0.8)), wingMat);
      tailWing.position.set(0, 1.5, 2.1);
      sprungBody.add(tailWing);

      const tailFin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.9, 0.8)), wingMat);
      tailFin.position.set(0, 1.95, 2.1);
      sprungBody.add(tailFin);

      const prop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.6, 0.14, 0.08)), darkMetalMat);
      prop.position.set(0, 1.2, -2.68);
      sprungBody.add(prop);

      addWheel(-1.4, 0.35, 0.4, 0.35, 0.22);
      addWheel(1.4, 0.35, 0.4, 0.35, 0.22);
      addWheel(0, 0.35, -1.8, 0.35, 0.22);
    } else if (type === 'helicopter') {
      const heliMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35, metalness: 0.4 }));

      const pod = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.75, 2.8, 8, 12)), heliMat);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(0, 1.3, 0);
      pod.castShadow = true;
      sprungBody.add(pod);

      const tailBoom = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.24, 3.2, 8)), heliMat);
      tailBoom.rotation.x = Math.PI / 2;
      tailBoom.position.set(0, 1.4, 2.2);
      sprungBody.add(tailBoom);

      const mainRotor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.5, 0.06, 0.35)), darkMetalMat);
      mainRotor.position.set(0, 2.35, 0);
      sprungBody.add(mainRotor);

      const tailRotor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.05, 1.1, 0.2)), darkMetalMat);
      tailRotor.position.set(0.32, 1.6, 3.7);
      sprungBody.add(tailRotor);

      [-0.9, 0.9].forEach((skx) => {
        const skid = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.14, 3.2)), darkMetalMat);
        skid.position.set(skx, 0.32, 0);
        sprungBody.add(skid);
      });

      addWheel(0, 0.35, 0, 0.35, 0.2);
    } else {
      // Sport Motorcycle + Detailed Human Rider
      const fairing = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.22, 0.95, 6, 10)), motoPaintMat);
      fairing.rotation.x = Math.PI / 2 - 0.15;
      fairing.position.set(0, 0.72, -0.05);
      fairing.castShadow = true;
      sprungBody.add(fairing);

      const engine = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.34, 0.52)), darkMetalMat);
      engine.position.set(0, 0.48, 0.05);
      sprungBody.add(engine);

      const forkGeo = trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.78, 8));
      [-0.1, 0.1].forEach((fx) => {
        const fork = new THREE.Mesh(forkGeo, chromeMat);
        fork.position.set(fx, 0.64, -0.58);
        fork.rotation.x = 0.38;
        sprungBody.add(fork);
      });

      const handleBar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.66, 8)), darkMetalMat);
      handleBar.rotation.z = Math.PI / 2;
      handleBar.position.set(0, 0.98, -0.42);
      sprungBody.add(handleBar);

      const screen = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.34, 0.28, 0.04)), glassMat);
      screen.position.set(0, 1.05, -0.64);
      screen.rotation.x = 0.55;
      sprungBody.add(screen);

      const muffler = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.05, 0.04, 0.62, 8)), chromeMat);
      muffler.rotation.x = Math.PI / 2 - 0.16;
      muffler.position.set(0.18, 0.38, 0.55);
      sprungBody.add(muffler);

      const hl = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.095, 8, 8)), headlightMat);
      hl.position.set(0, 0.8, -0.76);
      sprungBody.add(hl);

      const tl = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.06, 0.06)), taillightMat);
      tl.position.set(0, 0.76, 0.82);
      sprungBody.add(tl);

      addWheel(0, 0.31, -0.72, 0.31, 0.14);
      addWheel(0, 0.31, 0.72, 0.31, 0.17);

      // Articulated Human Motorcycle Rider
      const rider = new THREE.Group();
      const torso = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.15, 0.36, 4, 8)), riderJacketMat);
      torso.position.set(0, 1.15, 0.12);
      torso.rotation.x = 0.35;
      rider.add(torso);

      const helmet = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.15, 12, 10)), helmetMat);
      helmet.position.set(0, 1.5, -0.02);
      rider.add(helmet);

      const visor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.08, 0.12)), glassMat);
      visor.position.set(0, 1.5, -0.13);
      rider.add(visor);

      [-0.18, 0.18].forEach((sx) => {
        const arm = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.048, 0.36, 4, 6)), riderJacketMat);
        arm.position.set(sx, 1.16, -0.15);
        arm.rotation.x = 1.05;
        rider.add(arm);

        const leg = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.065, 0.38, 4, 6)), riderPantsMat);
        leg.position.set(sx * 0.9, 0.7, 0.1);
        leg.rotation.x = -0.35;
        rider.add(leg);
      });
      sprungBody.add(rider);
      riderGroup = rider;
    }

    return {
      mesh: root,
      sprungBody,
      wheelSteerPivots,
      wheelSpinGroups,
      wheelRadii,
      riderGroup,
    };
  };

  return { buildVehicle };
}
