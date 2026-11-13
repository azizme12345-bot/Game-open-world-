import * as THREE from 'three';
import {
  BRIDGE_HEIGHT,
  CITY_BLOCKS,
  CREEK_BRIDGE_HEIGHT,
  CREEK_CENTER_X,
  CREEK_WIDTH,
  FARM_PLOTS,
  groundHeightAt,
  RIVER_CENTER_X,
  RIVER_WIDTH,
  ROAD_HALF_W,
  ROAD_NODES,
  ROAD_SEGMENTS,
  ROAD_WIDTH,
  ROUNDABOUT_2_CENTER,
  ROUNDABOUT_CENTER,
  ROUNDABOUT_INNER_R,
  ROUNDABOUT_OUTER_R,
  type CityBlockSpec,
  type LandmarkLocation,
} from './roadNetwork';
import type { RoutePoint } from './navigation';
import type { ProceduralTextureSet } from './textures';

export interface CityEnvironmentHandle {
  group: THREE.Group;
  update: (elapsedTime: number) => void;
  setEnvironmentState: (nightFactor: number, rainFactor: number) => void;
  setNavigationRoute: (route: RoutePoint[], destination: LandmarkLocation | null) => void;
  dispose: () => void;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 91.3458) * 47453.5453;
  return x - Math.floor(x);
}

function createCityBlockShape(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  roundaboutCorner?: { corner: 'SW' | 'SE' | 'NW' | 'NE'; center: { x: number; z: number } }
): THREE.Shape {
  const sx0 = minX;
  const sx1 = maxX;
  const sy0 = -maxZ;
  const sy1 = -minZ;
  const cr = 3.4;

  const rbCx = roundaboutCorner ? roundaboutCorner.center.x : 0;
  const rbCy = roundaboutCorner ? -roundaboutCorner.center.z : 0;
  const R = ROUNDABOUT_OUTER_R;
  const edgeOffset = Math.sqrt(R * R - ROAD_HALF_W * ROAD_HALF_W);
  const rc = roundaboutCorner?.corner;

  const shape = new THREE.Shape();

  if (rc === 'SW') {
    shape.moveTo(rbCx + edgeOffset, sy0);
  } else {
    shape.moveTo(sx0 + cr, sy0);
  }

  if (rc === 'SE') {
    const endX = rbCx - edgeOffset;
    shape.lineTo(endX, sy0);
    const a0 = Math.atan2(sy0 - rbCy, endX - rbCx);
    const a1 = Math.atan2(rbCy + edgeOffset - rbCy, sx1 - rbCx);
    shape.absarc(rbCx, rbCy, R, a0, a1, true);
  } else {
    shape.lineTo(sx1 - cr, sy0);
    shape.absarc(sx1 - cr, sy0 + cr, cr, -Math.PI / 2, 0, false);
  }

  if (rc === 'NE') {
    const endY = rbCy - edgeOffset;
    shape.lineTo(sx1, endY);
    const a0 = Math.atan2(endY - rbCy, sx1 - rbCx);
    const a1 = Math.atan2(sy1 - rbCy, rbCx - edgeOffset - rbCx);
    shape.absarc(rbCx, rbCy, R, a0, a1, true);
  } else {
    shape.lineTo(sx1, sy1 - cr);
    shape.absarc(sx1 - cr, sy1 - cr, cr, 0, Math.PI / 2, false);
  }

  if (rc === 'NW') {
    const endX = rbCx + edgeOffset;
    shape.lineTo(endX, sy1);
    const a0 = Math.atan2(sy1 - rbCy, endX - rbCx);
    const a1 = Math.atan2(rbCy - edgeOffset - rbCy, sx0 - rbCx);
    shape.absarc(rbCx, rbCy, R, a0, a1, true);
  } else {
    shape.lineTo(sx0 + cr, sy1);
    shape.absarc(sx0 + cr, sy1 - cr, cr, Math.PI / 2, Math.PI, false);
  }

  if (rc === 'SW') {
    const endY = rbCy + edgeOffset;
    shape.lineTo(sx0, endY);
    const a0 = Math.atan2(endY - rbCy, sx0 - rbCx);
    const a1 = Math.atan2(sy0 - rbCy, rbCx + edgeOffset - rbCx);
    shape.absarc(rbCx, rbCy, R, a0, a1, true);
  } else {
    shape.lineTo(sx0, sy0 + cr);
    shape.absarc(sx0 + cr, sy0 + cr, cr, Math.PI, (Math.PI * 3) / 2, false);
  }

  shape.closePath();
  return shape;
}

export function createAnimeCity(textures: ProceduralTextureSet): CityEnvironmentHandle {
  const cityGroup = new THREE.Group();
  cityGroup.name = 'AnimeOpenWorldCity';

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

  textures.roadAlbedo.repeat.set(1, 1);
  textures.roadNormal.repeat.set(1, 1);
  textures.roadRoughness.repeat.set(1, 1);
  textures.sidewalkPaverAlbedo.repeat.set(0.22, 0.22);

  textures.countryMeadowAlbedo.repeat.set(60, 60);
  textures.plowedSoilAlbedo.repeat.set(8, 8);
  textures.dirtRoadAlbedo.repeat.set(1, 1);
  textures.dirtRoadNormal.repeat.set(1, 1);
  textures.barnWoodAlbedo.repeat.set(2, 2);

  // --- 1. Extended Horizon Terrain (Lush Valley & Countryside Meadow) ---
  const horizonGeo = trackGeo(new THREE.PlaneGeometry(2600, 2600));
  horizonGeo.rotateX(-Math.PI / 2);
  const horizonMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.countryMeadowAlbedo,
      color: 0xdcfce7,
      roughness: 0.94,
      metalness: 0.0,
    })
  );
  const horizonGround = new THREE.Mesh(horizonGeo, horizonMat);
  horizonGround.position.set(-140, -0.06, -60);
  horizonGround.receiveShadow = true;
  cityGroup.add(horizonGround);

  // Inner urban concrete apron beneath the playable city grid so no gaps ever appear
  const citySlabGeo = trackGeo(new THREE.PlaneGeometry(500, 340));
  citySlabGeo.rotateX(-Math.PI / 2);
  const citySlabMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x8d99a8, roughness: 0.9, metalness: 0.02 })
  );
  const citySlab = new THREE.Mesh(citySlabGeo, citySlabMat);
  citySlab.position.set(45, -0.03, -96);
  citySlab.receiveShadow = true;
  cityGroup.add(citySlab);

  // --- 2. Connected Road Network (PBR Asphalt, Rural Highways, Dirt Farm Tracks, Bridges, Tunnel & Airport) ---
  const roadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.roadAlbedo,
      normalMap: textures.roadNormal,
      normalScale: new THREE.Vector2(0.65, 0.65),
      roughnessMap: textures.roadRoughness,
      roughness: 0.85,
      metalness: 0.06,
    })
  );
  const dirtRoadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.dirtRoadAlbedo,
      normalMap: textures.dirtRoadNormal,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.94,
      metalness: 0.02,
    })
  );
  const roadBaseMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.roadBaseAlbedo,
      roughness: 0.88,
      metalness: 0.05,
    })
  );
  const curbConcreteMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xaab4c2, roughness: 0.8, metalness: 0.06 })
  );
  const metalTrimMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.35, metalness: 0.72 })
  );
  const bridgeTimberMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x784824, roughness: 0.84, metalness: 0.04 })
  );

  ROAD_SEGMENTS.forEach((seg) => {
    if (seg.roadType === 'bridge') {
      const segGeo = trackGeo(new THREE.PlaneGeometry(ROAD_WIDTH, seg.length, 1, 28));
      const uv = segGeo.attributes.uv;
      const vScale = seg.length / 20;
      for (let i = 0; i < uv.count; i++) {
        uv.setY(i, uv.getY(i) * vScale);
      }
      uv.needsUpdate = true;

      segGeo.rotateX(-Math.PI / 2);
      segGeo.rotateY(Math.PI / 2);

      const pos = segGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const wx = seg.centerX + pos.getX(i);
        const wz = seg.centerZ + pos.getZ(i);
        pos.setY(i, groundHeightAt(wx, wz));
      }
      segGeo.computeVertexNormals();

      const segMesh = new THREE.Mesh(segGeo, roadMat);
      segMesh.position.set(seg.centerX, 0, seg.centerZ);
      segMesh.receiveShadow = true;
      cityGroup.add(segMesh);

      const archMat = trackMat(
        new THREE.MeshStandardMaterial({ color: 0xe6edf5, metalness: 0.5, roughness: 0.28 })
      );
      [-ROAD_HALF_W - 0.15, ROAD_HALF_W + 0.15].forEach((rzOff) => {
        const rGeo = trackGeo(new THREE.BoxGeometry(64, 0.88, 0.38, 24, 1, 1));
        const rPos = rGeo.attributes.position;
        for (let i = 0; i < rPos.count; i++) {
          const wx = RIVER_CENTER_X + rPos.getX(i);
          rPos.setY(i, rPos.getY(i) + groundHeightAt(wx, seg.centerZ) + 0.44);
        }
        rGeo.computeVertexNormals();
        const rail = new THREE.Mesh(rGeo, archMat);
        rail.position.set(RIVER_CENTER_X, 0, seg.centerZ + rzOff);
        rail.castShadow = true;
        cityGroup.add(rail);
      });

      const pierGeo = trackGeo(new THREE.CylinderGeometry(0.9, 1.15, 6.8, 10));
      [RIVER_CENTER_X - 18, RIVER_CENTER_X + 18].forEach((px) => {
        [-ROAD_HALF_W + 1, ROAD_HALF_W - 1].forEach((pz) => {
          const pier = new THREE.Mesh(pierGeo, curbConcreteMat);
          pier.position.set(px, 0.2, seg.centerZ + pz);
          cityGroup.add(pier);
        });
      });

      const archGeo = trackGeo(new THREE.TorusGeometry(20, 0.48, 8, 28, Math.PI));
      [-ROAD_HALF_W - 0.1, ROAD_HALF_W + 0.1].forEach((az) => {
        const arch = new THREE.Mesh(archGeo, archMat);
        arch.position.set(RIVER_CENTER_X, BRIDGE_HEIGHT - 0.4, seg.centerZ + az);
        arch.castShadow = true;
        cityGroup.add(arch);
      });
    } else if (seg.roadType === 'creek_bridge') {
      const segGeo = trackGeo(new THREE.PlaneGeometry(ROAD_WIDTH, seg.length, 1, 36));
      const uv = segGeo.attributes.uv;
      const vScale = seg.length / 20;
      for (let i = 0; i < uv.count; i++) {
        uv.setY(i, uv.getY(i) * vScale);
      }
      uv.needsUpdate = true;

      segGeo.rotateX(-Math.PI / 2);
      segGeo.rotateY(Math.PI / 2);

      const pos = segGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const wx = seg.centerX + pos.getX(i);
        const wz = seg.centerZ + pos.getZ(i);
        pos.setY(i, groundHeightAt(wx, wz));
      }
      segGeo.computeVertexNormals();

      const segMesh = new THREE.Mesh(segGeo, roadMat);
      segMesh.position.set(seg.centerX, 0, seg.centerZ);
      segMesh.receiveShadow = true;
      cityGroup.add(segMesh);

      // Timber & stone countryside creek bridge guardrails + arched trusses
      [-ROAD_HALF_W - 0.18, ROAD_HALF_W + 0.18].forEach((rzOff) => {
        const rGeo = trackGeo(new THREE.BoxGeometry(56, 0.85, 0.36, 22, 1, 1));
        const rPos = rGeo.attributes.position;
        for (let i = 0; i < rPos.count; i++) {
          const wx = CREEK_CENTER_X + rPos.getX(i);
          rPos.setY(i, rPos.getY(i) + groundHeightAt(wx, seg.centerZ) + 0.42);
        }
        rGeo.computeVertexNormals();
        const rail = new THREE.Mesh(rGeo, bridgeTimberMat);
        rail.position.set(CREEK_CENTER_X, 0, seg.centerZ + rzOff);
        rail.castShadow = true;
        cityGroup.add(rail);
      });

      const creekPierGeo = trackGeo(new THREE.CylinderGeometry(0.7, 0.9, 5.2, 8));
      [CREEK_CENTER_X - 14, CREEK_CENTER_X + 14].forEach((px) => {
        [-ROAD_HALF_W + 1, ROAD_HALF_W - 1].forEach((pz) => {
          const pier = new THREE.Mesh(creekPierGeo, curbConcreteMat);
          pier.position.set(px, -0.2, seg.centerZ + pz);
          cityGroup.add(pier);
        });
      });

      const creekArchGeo = trackGeo(new THREE.TorusGeometry(15, 0.36, 7, 20, Math.PI));
      [-ROAD_HALF_W - 0.1, ROAD_HALF_W + 0.1].forEach((az) => {
        const arch = new THREE.Mesh(creekArchGeo, bridgeTimberMat);
        arch.position.set(CREEK_CENTER_X, CREEK_BRIDGE_HEIGHT - 0.5, seg.centerZ + az);
        cityGroup.add(arch);
      });
    } else {
      const roadWidth = seg.roadType === 'dirt' ? ROAD_WIDTH - 2.4 : ROAD_WIDTH;
      const segGeo = trackGeo(new THREE.PlaneGeometry(roadWidth, seg.length));
      const uv = segGeo.attributes.uv;
      const vScale = seg.length / 20;
      for (let i = 0; i < uv.count; i++) {
        uv.setY(i, uv.getY(i) * vScale);
      }
      uv.needsUpdate = true;

      segGeo.rotateX(-Math.PI / 2);
      if (seg.axis === 'EW') {
        segGeo.rotateY(Math.PI / 2);
      }

      const segMesh = new THREE.Mesh(segGeo, seg.roadType === 'dirt' ? dirtRoadMat : roadMat);
      segMesh.position.set(seg.centerX, seg.roadType === 'dirt' ? -0.01 : 0, seg.centerZ);
      segMesh.receiveShadow = true;
      cityGroup.add(segMesh);
    }
  });

  // Northern River Bridge at Z = -240
  {
    const zNorthBridge = -240;
    const nbGeo = trackGeo(new THREE.PlaneGeometry(ROAD_WIDTH, 68, 1, 28));
    const uv = nbGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (68 / 20));
    nbGeo.rotateX(-Math.PI / 2);
    nbGeo.rotateY(Math.PI / 2);
    const pos = nbGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const wx = RIVER_CENTER_X + pos.getX(i);
      pos.setY(i, groundHeightAt(wx, zNorthBridge) + 0.01);
    }
    nbGeo.computeVertexNormals();
    const nbMesh = new THREE.Mesh(nbGeo, roadMat);
    nbMesh.position.set(RIVER_CENTER_X, 0, zNorthBridge);
    nbMesh.receiveShadow = true;
    cityGroup.add(nbMesh);

    const archMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe6edf5, metalness: 0.5, roughness: 0.28 })
    );
    const archGeo = trackGeo(new THREE.TorusGeometry(20, 0.45, 8, 24, Math.PI));
    [-ROAD_HALF_W, ROAD_HALF_W].forEach((az) => {
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.position.set(RIVER_CENTER_X, BRIDGE_HEIGHT - 0.4, zNorthBridge + az);
      cityGroup.add(arch);
    });
  }

  // Shimmering Anime River + Promenade Railings
  const riverGeo = trackGeo(new THREE.PlaneGeometry(RIVER_WIDTH, 340));
  riverGeo.rotateX(-Math.PI / 2);
  const riverMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x1680db,
      roughness: 0.1,
      metalness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.5,
    })
  );
  const riverMesh = new THREE.Mesh(riverGeo, riverMat);
  riverMesh.position.set(RIVER_CENTER_X, -1.6, -135);
  riverMesh.receiveShadow = true;
  cityGroup.add(riverMesh);

  const wallGeo = trackGeo(new THREE.BoxGeometry(1.5, 2.3, 340));
  [RIVER_CENTER_X - RIVER_WIDTH / 2, RIVER_CENTER_X + RIVER_WIDTH / 2].forEach((wx) => {
    const wall = new THREE.Mesh(wallGeo, curbConcreteMat);
    wall.position.set(wx, -0.75, -135);
    cityGroup.add(wall);
  });

  // Riverside promenade stone guardrails on segments between road bridges
  const riverRailRanges: [number, number][] = [
    [-228, -158],
    [-130, -62],
    [-34, 34],
  ];
  riverRailRanges.forEach(([z0, z1]) => {
    const len = z1 - z0;
    const railGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.85, len));
    [RIVER_CENTER_X - RIVER_WIDTH / 2 - 0.4, RIVER_CENTER_X + RIVER_WIDTH / 2 + 0.4].forEach(
      (rx) => {
        const rail = new THREE.Mesh(railGeo, metalTrimMat);
        rail.position.set(rx, 0.56, (z0 + z1) * 0.5);
        cityGroup.add(rail);
      }
    );
  });

  // 3D Illuminated Harbor Express Tunnel along Z = +48
  const tunnelGroup = new THREE.Group();
  const tunnelWallMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.72, metalness: 0.12 })
  );
  const tunnelCeilingMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78 })
  );
  const tunnelLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff7d6,
      emissive: 0xffdf8e,
      emissiveIntensity: 2.3,
    })
  );
  const parkGrassMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.parkGrassAlbedo,
      roughness: 0.88,
      metalness: 0.0,
    })
  );

  const tWallGeo = trackGeo(new THREE.BoxGeometry(58, 6.4, 1.2));
  [-ROAD_HALF_W - 0.6, ROAD_HALF_W + 0.6].forEach((tz) => {
    const tw = new THREE.Mesh(tWallGeo, tunnelWallMat);
    tw.position.set(RIVER_CENTER_X, 3.2, 48 + tz);
    tw.castShadow = true;
    tw.receiveShadow = true;
    tunnelGroup.add(tw);
  });
  const tRoofGeo = trackGeo(new THREE.BoxGeometry(58, 1.4, ROAD_WIDTH + 2.4));
  const tRoof = new THREE.Mesh(tRoofGeo, tunnelCeilingMat);
  tRoof.position.set(RIVER_CENTER_X, 6.8, 48);
  tunnelGroup.add(tRoof);

  // Decorative concrete tunnel portals
  const portalArchGeo = trackGeo(new THREE.BoxGeometry(1.6, 7.6, ROAD_WIDTH + 3.4));
  [RIVER_CENTER_X - 28.5, RIVER_CENTER_X + 28.5].forEach((px) => {
    const portal = new THREE.Mesh(portalArchGeo, curbConcreteMat);
    portal.position.set(px, 3.8, 48);
    tunnelGroup.add(portal);
  });

  const tHillGeo = trackGeo(new THREE.BoxGeometry(56, 3.2, 26));
  const tHill = new THREE.Mesh(tHillGeo, parkGrassMat);
  tHill.position.set(RIVER_CENTER_X, 8.2, 48);
  tHill.receiveShadow = true;
  tunnelGroup.add(tHill);

  const tStripGeo = trackGeo(new THREE.BoxGeometry(4.2, 0.16, 0.55));
  for (let tx = 120; tx <= 168; tx += 9.5) {
    const strip = new THREE.Mesh(tStripGeo, tunnelLightMat);
    strip.position.set(tx, 6.02, 48);
    tunnelGroup.add(strip);
  }
  cityGroup.add(tunnelGroup);

  // Intersections
  const junctionGeo = trackGeo(new THREE.PlaneGeometry(ROAD_WIDTH + 4, ROAD_WIDTH + 4));
  junctionGeo.rotateX(-Math.PI / 2);
  ROAD_NODES.forEach((node) => {
    if (node.kind === 'roundabout') return;
    const isDirtCorner = node.id === 'C_SOUTH_OAK' || node.id === 'C_NORTH_OAK';
    const jMesh = new THREE.Mesh(junctionGeo, isDirtCorner ? dirtRoadMat : roadBaseMat);
    jMesh.position.set(node.x, isDirtCorner ? -0.008 : -0.002, node.z);
    jMesh.receiveShadow = true;
    cityGroup.add(jMesh);
  });

  // Roundabouts
  const rbGeo = trackGeo(
    new THREE.RingGeometry(ROUNDABOUT_INNER_R - 0.5, ROUNDABOUT_OUTER_R + 0.5, 64, 1)
  );
  rbGeo.rotateX(-Math.PI / 2);
  const rbPos = rbGeo.attributes.position;
  const rbUv = rbGeo.attributes.uv;
  for (let i = 0; i < rbPos.count; i++) {
    rbUv.setXY(i, 0.5 + rbPos.getX(i) / 44, 0.5 - rbPos.getZ(i) / 44);
  }
  rbUv.needsUpdate = true;

  const rbMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.roundaboutAlbedo,
      roughness: 0.84,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const islandCurbGeo = trackGeo(
    new THREE.CylinderGeometry(ROUNDABOUT_INNER_R, ROUNDABOUT_INNER_R + 0.25, 0.24, 48)
  );
  const islandLawnGeo = trackGeo(new THREE.CircleGeometry(ROUNDABOUT_INNER_R - 0.5, 48));
  islandLawnGeo.rotateX(-Math.PI / 2);
  const plazaBaseGeo = trackGeo(new THREE.CylinderGeometry(3.2, 3.7, 0.45, 24));
  const monumentMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.25 })
  );
  const spireGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.78, 7.2, 8));
  const spireMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.14,
      metalness: 0.82,
      clearcoat: 1.0,
    })
  );

  [ROUNDABOUT_CENTER, ROUNDABOUT_2_CENTER].forEach((rb) => {
    const rbMesh = new THREE.Mesh(rbGeo, rbMat);
    rbMesh.position.set(rb.x, 0.002, rb.z);
    rbMesh.receiveShadow = true;
    cityGroup.add(rbMesh);

    const islandCurb = new THREE.Mesh(islandCurbGeo, curbConcreteMat);
    islandCurb.position.set(rb.x, 0.12, rb.z);
    islandCurb.receiveShadow = true;
    cityGroup.add(islandCurb);

    const islandLawn = new THREE.Mesh(islandLawnGeo, parkGrassMat);
    islandLawn.position.set(rb.x, 0.25, rb.z);
    islandLawn.receiveShadow = true;
    cityGroup.add(islandLawn);

    const plazaBase = new THREE.Mesh(plazaBaseGeo, monumentMat);
    plazaBase.position.set(rb.x, 0.45, rb.z);
    plazaBase.castShadow = true;
    cityGroup.add(plazaBase);

    const spire = new THREE.Mesh(spireGeo, spireMat);
    spire.position.set(rb.x, 4.1, rb.z);
    spire.castShadow = true;
    cityGroup.add(spire);
  });

  // --- 3. Crosswalks & Stop Lines (InstancedMesh) ---
  const crosswalkTransforms: { x: number; z: number; rotY: number }[] = [];
  const stopLineTransforms: { x: number; z: number; rotY: number }[] = [];

  ROAD_NODES.forEach((node) => {
    if (node.kind === 'corner' || node.isRural) return;
    const cwOffset = node.kind === 'roundabout' ? 22.0 : 9.8;
    const stopOffset = node.kind === 'roundabout' ? 24.6 : 12.2;

    node.connections.forEach((dir) => {
      if (dir === 'N') {
        crosswalkTransforms.push({ x: node.x, z: node.z - cwOffset, rotY: 0 });
        stopLineTransforms.push({ x: node.x - 3.9, z: node.z - stopOffset, rotY: 0 });
      } else if (dir === 'S') {
        crosswalkTransforms.push({ x: node.x, z: node.z + cwOffset, rotY: 0 });
        stopLineTransforms.push({ x: node.x + 3.9, z: node.z + stopOffset, rotY: 0 });
      } else if (dir === 'W') {
        crosswalkTransforms.push({ x: node.x - cwOffset, z: node.z, rotY: Math.PI / 2 });
        stopLineTransforms.push({ x: node.x - stopOffset, z: node.z + 3.9, rotY: Math.PI / 2 });
      } else if (dir === 'E') {
        crosswalkTransforms.push({ x: node.x + cwOffset, z: node.z, rotY: Math.PI / 2 });
        stopLineTransforms.push({ x: node.x + stopOffset, z: node.z - 3.9, rotY: Math.PI / 2 });
      }
    });
  });

  const dummy = new THREE.Object3D();

  const cwGeo = trackGeo(new THREE.PlaneGeometry(15.2, 3.4));
  cwGeo.rotateX(-Math.PI / 2);
  const cwMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.crosswalkAlbedo,
      transparent: true,
      roughness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const cwInst = new THREE.InstancedMesh(cwGeo, cwMat, crosswalkTransforms.length);
  cwInst.receiveShadow = true;
  crosswalkTransforms.forEach((c, i) => {
    dummy.position.set(c.x, 0.02, c.z);
    dummy.rotation.set(0, c.rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    cwInst.setMatrixAt(i, dummy.matrix);
  });
  cwInst.instanceMatrix.needsUpdate = true;
  cwInst.computeBoundingSphere();
  cityGroup.add(cwInst);

  const stopGeo = trackGeo(new THREE.PlaneGeometry(7.0, 0.48));
  stopGeo.rotateX(-Math.PI / 2);
  const stopMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const stopInst = new THREE.InstancedMesh(stopGeo, stopMat, stopLineTransforms.length);
  stopInst.receiveShadow = true;
  stopLineTransforms.forEach((s, i) => {
    dummy.position.set(s.x, 0.02, s.z);
    dummy.rotation.set(0, s.rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    stopInst.setMatrixAt(i, dummy.matrix);
  });
  stopInst.instanceMatrix.needsUpdate = true;
  stopInst.computeBoundingSphere();
  cityGroup.add(stopInst);

  // --- 4. City Block Sidewalks & Perimeter Aprons (Normal-Mapped Pavers) ---
  const sidewalkTopMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.sidewalkPaverAlbedo,
      normalMap: textures.sidewalkNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.84,
      metalness: 0.04,
    })
  );

  CITY_BLOCKS.forEach((blk: CityBlockSpec) => {
    const shape = createCityBlockShape(
      blk.minX,
      blk.maxX,
      blk.minZ,
      blk.maxZ,
      blk.roundaboutCorner
    );
    const blkGeo = trackGeo(
      new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false, curveSegments: 22 })
    );
    blkGeo.rotateX(-Math.PI / 2);
    const blkMesh = new THREE.Mesh(blkGeo, [sidewalkTopMat, curbConcreteMat]);
    blkMesh.receiveShadow = true;
    cityGroup.add(blkMesh);
  });

  const outerApronSpecs: [number, number, number, number][] = [
    [-213, -96, 26, 336],
    [0, 70, 424, 28],
    [32, -262, 480, 28],
    [115.5, 0, 23, 80],
    [115.5, -96, 23, 80],
    [115.5, -192, 23, 80],
    [172.5, 0, 23, 80],
    [172.5, -96, 23, 80],
    [172.5, -192, 23, 80],
    [232, 0, 64, 80],
    [228, -96, 56, 80],
  ];
  outerApronSpecs.forEach(([ax, az, aw, ad]) => {
    const geo = trackGeo(new THREE.BoxGeometry(aw, 0.14, ad));
    const mesh = new THREE.Mesh(geo, sidewalkTopMat);
    mesh.position.set(ax, 0.07, az);
    mesh.receiveShadow = true;
    cityGroup.add(mesh);
  });

  // --- 5. International Airport Tarmac, Terminal, Control Tower, Runway Lights & Jetliners ---
  const tarmacMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2e3644,
      normalMap: textures.roadNormal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.85,
      metalness: 0.05,
    })
  );
  const runwayPadGeo = trackGeo(new THREE.PlaneGeometry(48, 132));
  runwayPadGeo.rotateX(-Math.PI / 2);
  const runwayPad = new THREE.Mesh(runwayPadGeo, tarmacMat);
  runwayPad.position.set(272, 0.01, -192);
  runwayPad.receiveShadow = true;
  cityGroup.add(runwayPad);

  const rwStripeGeo = trackGeo(new THREE.PlaneGeometry(1.1, 6.8));
  rwStripeGeo.rotateX(-Math.PI / 2);
  const rwStripeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 }));
  for (let rz = -238; rz <= -146; rz += 12) {
    const s = new THREE.Mesh(rwStripeGeo, rwStripeMat);
    s.position.set(274, 0.025, rz);
    cityGroup.add(s);
  }

  // Glowing Runway Edge Beacons (InstancedMesh)
  const rwBeaconGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 0.36, 8));
  const rwBeaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.9,
      roughness: 0.2,
    })
  );
  const rwBeaconCoords: [number, number][] = [];
  for (let rz = -244; rz <= -140; rz += 13) {
    rwBeaconCoords.push([261, rz]);
    rwBeaconCoords.push([287, rz]);
  }
  const rwBeaconInst = new THREE.InstancedMesh(rwBeaconGeo, rwBeaconMat, rwBeaconCoords.length);
  rwBeaconCoords.forEach(([bx, bz], i) => {
    dummy.position.set(bx, 0.18, bz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    rwBeaconInst.setMatrixAt(i, dummy.matrix);
  });
  rwBeaconInst.instanceMatrix.needsUpdate = true;
  rwBeaconInst.computeBoundingSphere();
  cityGroup.add(rwBeaconInst);

  const termMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe6ecf4, roughness: 0.34, metalness: 0.25 })
  );
  const termGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x5ab8f5,
      roughness: 0.06,
      metalness: 0.22,
      clearcoat: 1.0,
      envMapIntensity: 1.5,
    })
  );

  // Airport Terminal Concourse with Entrance Portico & Jetways
  const terminalGroup = new THREE.Group();
  terminalGroup.position.set(222, 0.14, -192);
  const tHall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22, 10.5, 58)), termMat);
  tHall.position.y = 5.25;
  tHall.castShadow = true;
  tHall.receiveShadow = true;
  terminalGroup.add(tHall);
  const tGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22.6, 6.8, 50)), termGlassMat);
  tGlass.position.y = 4.8;
  terminalGroup.add(tGlass);
  const tCanopy = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(29, 1.1, 62)), termMat);
  tCanopy.position.y = 11.0;
  tCanopy.castShadow = true;
  terminalGroup.add(tCanopy);
  // Roof skylights & jetway bridges
  [-18, 0, 18].forEach((jz) => {
    const jetway = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11, 2.2, 2.4)), termMat);
    jetway.position.set(15.5, 3.6, jz);
    jetway.castShadow = true;
    terminalGroup.add(jetway);
  });
  cityGroup.add(terminalGroup);

  // Air Traffic Control Tower
  const atcGroup = new THREE.Group();
  atcGroup.position.set(222, 0.14, -154);
  const atcShaft = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.3, 3.3, 27, 12)), termMat);
  atcShaft.position.y = 13.5;
  atcShaft.castShadow = true;
  atcGroup.add(atcShaft);
  const atcGallery = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(4.4, 3.5, 1.4, 12)), metalTrimMat);
  atcGallery.position.y = 26.2;
  atcGroup.add(atcGallery);
  const atcCab = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(5.8, 4.1, 4.4, 12)), termGlassMat);
  atcCab.position.y = 28.8;
  atcGroup.add(atcCab);
  const atcCap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(6.2, 6.2, 0.8, 12)), termMat);
  atcCap.position.y = 31.3;
  atcGroup.add(atcCap);
  const radarDish = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 0.95, 0.42)), termMat);
  radarDish.position.y = 33.2;
  atcGroup.add(radarDish);
  cityGroup.add(atcGroup);

  // Detailed Passenger Jetliners
  const jetBodyGeo = trackGeo(new THREE.CylinderGeometry(1.68, 1.48, 22, 16));
  jetBodyGeo.rotateX(Math.PI / 2);
  const jetNoseGeo = trackGeo(new THREE.ConeGeometry(1.68, 4.2, 16));
  jetNoseGeo.rotateX(-Math.PI / 2);
  const jetWingGeo = trackGeo(new THREE.BoxGeometry(22, 0.35, 3.8));
  const jetTailGeo = trackGeo(new THREE.BoxGeometry(0.35, 4.4, 3.2));
  const jetEngGeo = trackGeo(new THREE.CylinderGeometry(0.68, 0.56, 2.8, 12));
  jetEngGeo.rotateX(Math.PI / 2);
  const jetBlueMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.28, metalness: 0.2 }));

  [
    { x: 248, z: -174, yaw: Math.PI / 2 },
    { x: 248, z: -210, yaw: Math.PI / 2 },
  ].forEach((jp) => {
    const jet = new THREE.Group();
    jet.position.set(jp.x, 2.2, jp.z);
    jet.rotation.y = jp.yaw;
    const fuse = new THREE.Mesh(jetBodyGeo, termMat);
    fuse.castShadow = true;
    jet.add(fuse);
    const nose = new THREE.Mesh(jetNoseGeo, termMat);
    nose.position.set(0, -0.1, -13.0);
    jet.add(nose);
    const cockpit = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 0.5, 1.4)), termGlassMat);
    cockpit.position.set(0, 0.68, -11.4);
    jet.add(cockpit);
    const wing = new THREE.Mesh(jetWingGeo, termMat);
    wing.position.set(0, -0.3, 1.0);
    wing.castShadow = true;
    jet.add(wing);
    const tail = new THREE.Mesh(jetTailGeo, jetBlueMat);
    tail.position.set(0, 2.2, 8.8);
    jet.add(tail);
    [-4.8, 4.8].forEach((ex) => {
      const eng = new THREE.Mesh(jetEngGeo, metalTrimMat);
      eng.position.set(ex, -0.9, 0.4);
      jet.add(eng);
    });
    cityGroup.add(jet);
  });

  // --- 6. High-Detail PBR Architectural Skyscrapers & Landmarks ---
  const podiumMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x26303f, roughness: 0.68, metalness: 0.18 })
  );
  const parapetMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe6edf5, roughness: 0.58, metalness: 0.12 })
  );
  const balconyGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x7dd3fc,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.72,
    })
  );
  const roofUnitMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x5c6b7e, roughness: 0.5, metalness: 0.42 })
  );
  const warmLobbyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff0c2,
      emissive: 0xffd275,
      emissiveIntensity: 0.85,
      roughness: 0.3,
    })
  );
  const shopGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x5fb8f0,
      emissive: 0x2a618f,
      emissiveIntensity: 0.32,
      roughness: 0.06,
      metalness: 0.25,
      clearcoat: 1.0,
      envMapIntensity: 1.5,
    })
  );
  const facadeMaterials = textures.buildingFacades.map((tex) =>
    trackMat(
      new THREE.MeshStandardMaterial({
        map: tex,
        roughnessMap: textures.buildingFacadeRoughness,
        normalMap: textures.buildingFacadeNormal,
        normalScale: new THREE.Vector2(0.75, 0.75),
        emissiveMap: tex,
        emissive: 0xffe4a8,
        emissiveIntensity: 0.0,
        roughness: 0.9,
        metalness: 0.22,
        envMapIntensity: 1.45,
      })
    )
  );

  const awningColors = [0x246bfd, 0xe85d4a, 0x16a388, 0xf29f24, 0x3b4860];
  const awningMats = awningColors.map((col) =>
    trackMat(new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.12 }))
  );
  const signColors = [0x38bdf8, 0xfbbf24, 0xfb7185, 0x34d399];
  const signMats = signColors.map((col) =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 1.15,
        roughness: 0.25,
      })
    )
  );

  // Reusable Full-HD Composite Architecture LOD Builder
  function buildCompositeBuildingLOD(
    width: number,
    depth: number,
    height: number,
    facadeIndex: number,
    frontFace: 'E' | 'W' | 'N' | 'S',
    seed: number
  ): THREE.LOD {
    const lod = new THREE.LOD();
    const highGroup = new THREE.Group();
    const podiumH = 4.6;
    const isStepped = height >= 44;
    const mainShaftH = isStepped ? (height - podiumH) * 0.72 : Math.max(8, height - podiumH);
    const upperTierH = isStepped ? height - podiumH - mainShaftH : 0;

    // 1. Stone/granite entrance plinth & ground floor retail podium
    const plinthGeo = trackGeo(new THREE.BoxGeometry(width + 1.0, 0.35, depth + 1.0));
    const plinth = new THREE.Mesh(plinthGeo, curbConcreteMat);
    plinth.position.y = 0.175;
    plinth.receiveShadow = true;
    highGroup.add(plinth);

    const podGeo = trackGeo(new THREE.BoxGeometry(width + 0.55, podiumH, depth + 0.55));
    const podium = new THREE.Mesh(podGeo, podiumMat);
    podium.position.y = podiumH / 2;
    podium.castShadow = true;
    podium.receiveShadow = true;
    highGroup.add(podium);

    const isEWFace = frontFace === 'E' || frontFace === 'W';
    const faceSign = frontFace === 'E' || frontFace === 'S' ? 1 : -1;
    const glassLen = (isEWFace ? depth : width) * 0.84;

    // 2. Reflective Ground Storefront + Glowing Lobby Doorway + Metallic Entrance Frame
    const glassGeo = trackGeo(
      new THREE.BoxGeometry(isEWFace ? 0.24 : glassLen, 3.1, isEWFace ? glassLen : 0.24)
    );
    const storefront = new THREE.Mesh(glassGeo, shopGlassMat);
    if (isEWFace) {
      storefront.position.set(faceSign * ((width + 0.55) / 2 + 0.04), 1.85, 0);
    } else {
      storefront.position.set(0, 1.85, faceSign * ((depth + 0.55) / 2 + 0.04));
    }
    highGroup.add(storefront);

    // Warm recessed doorway portal + metallic door frame
    const doorGeo = trackGeo(
      new THREE.BoxGeometry(isEWFace ? 0.34 : 2.8, 2.6, isEWFace ? 2.8 : 0.34)
    );
    const doorMesh = new THREE.Mesh(doorGeo, warmLobbyMat);
    const frameGeo = trackGeo(
      new THREE.BoxGeometry(isEWFace ? 0.42 : 3.2, 2.85, isEWFace ? 3.2 : 0.42)
    );
    const frameMesh = new THREE.Mesh(frameGeo, metalTrimMat);
    if (isEWFace) {
      doorMesh.position.set(faceSign * ((width + 0.55) / 2 + 0.12), 1.45, 0);
      frameMesh.position.set(faceSign * ((width + 0.55) / 2 + 0.05), 1.5, 0);
    } else {
      doorMesh.position.set(0, 1.45, faceSign * ((depth + 0.55) / 2 + 0.12));
      frameMesh.position.set(0, 1.5, faceSign * ((depth + 0.55) / 2 + 0.05));
    }
    highGroup.add(frameMesh);
    highGroup.add(doorMesh);

    // Angled entrance awning/canopy
    const awningGeo = trackGeo(
      new THREE.BoxGeometry(
        isEWFace ? 1.7 : width * 0.88,
        0.24,
        isEWFace ? depth * 0.88 : 1.7
      )
    );
    const awning = new THREE.Mesh(
      awningGeo,
      awningMats[Math.floor(seededRandom(seed + 2) * awningMats.length)]
    );
    if (isEWFace) {
      awning.position.set(faceSign * ((width + 0.55) / 2 + 0.82), 3.7, 0);
      awning.rotation.z = -faceSign * 0.12;
    } else {
      awning.position.set(0, 3.7, faceSign * ((depth + 0.55) / 2 + 0.82));
      awning.rotation.x = faceSign * 0.12;
    }
    awning.castShadow = true;
    highGroup.add(awning);

    // 3. Primary Facade Tower Shaft
    const shaftGeo = trackGeo(new THREE.BoxGeometry(width, mainShaftH, depth));
    const shaft = new THREE.Mesh(
      shaftGeo,
      facadeMaterials[facadeIndex % facadeMaterials.length]
    );
    shaft.position.y = podiumH + mainShaftH / 2;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    highGroup.add(shaft);

    // 4. Vertical 3D Corner Pilasters / Architectural Fins for Rich Shadow Relief
    const finGeo = trackGeo(new THREE.BoxGeometry(0.55, mainShaftH + 0.4, 0.55));
    [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [-width / 2, depth / 2],
      [width / 2, depth / 2],
    ].forEach(([fx, fz]) => {
      const fin = new THREE.Mesh(finGeo, parapetMat);
      fin.position.set(fx, podiumH + mainShaftH / 2, fz);
      highGroup.add(fin);
    });

    // 5. Protruding 3D Balconies with Frosted Glass Railings on Residential / Boutique Towers
    const hasBalconies = facadeIndex === 1 || facadeIndex === 3 || facadeIndex === 4;
    if (hasBalconies) {
      const balcCount = Math.min(5, Math.floor((mainShaftH - 3) / 4.2));
      const balcSlabGeo = trackGeo(
        new THREE.BoxGeometry(isEWFace ? 1.15 : width * 0.62, 0.2, isEWFace ? depth * 0.62 : 1.15)
      );
      const balcRailGeo = trackGeo(
        new THREE.BoxGeometry(isEWFace ? 1.12 : width * 0.6, 0.82, isEWFace ? depth * 0.6 : 1.12)
      );
      for (let b = 0; b < balcCount; b++) {
        const by = podiumH + 3.4 + b * 4.2;
        const slab = new THREE.Mesh(balcSlabGeo, parapetMat);
        const rail = new THREE.Mesh(balcRailGeo, balconyGlassMat);
        if (isEWFace) {
          slab.position.set(faceSign * (width / 2 + 0.52), by, 0);
          rail.position.set(faceSign * (width / 2 + 0.52), by + 0.48, 0);
        } else {
          slab.position.set(0, by, faceSign * (depth / 2 + 0.52));
          rail.position.set(0, by + 0.48, faceSign * (depth / 2 + 0.52));
        }
        highGroup.add(slab);
        highGroup.add(rail);
      }
    }

    // 6. Stepped Skyscraper Upper Tier & Sky Terrace
    let roofTopY = podiumH + mainShaftH;
    let topW = width;
    let topD = depth;
    if (isStepped) {
      const midCrown = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(width + 0.6, 0.7, depth + 0.6)),
        parapetMat
      );
      midCrown.position.y = roofTopY + 0.35;
      highGroup.add(midCrown);

      topW = width * 0.78;
      topD = depth * 0.78;
      const upperGeo = trackGeo(new THREE.BoxGeometry(topW, upperTierH, topD));
      const upper = new THREE.Mesh(
        upperGeo,
        facadeMaterials[(facadeIndex + 1) % facadeMaterials.length]
      );
      upper.position.y = roofTopY + upperTierH / 2;
      upper.castShadow = true;
      upper.receiveShadow = true;
      highGroup.add(upper);

      roofTopY += upperTierH;
    }

    // 7. Rooftop Parapet Crown, Mechanical Penthouse, Cooling HVAC & Skyscraper Spire
    const crownGeo = trackGeo(new THREE.BoxGeometry(topW + 0.5, 0.9, topD + 0.5));
    const crown = new THREE.Mesh(crownGeo, parapetMat);
    crown.position.y = roofTopY + 0.45;
    highGroup.add(crown);

    const pentW = topW * 0.46;
    const pentD = topD * 0.46;
    const pentH = 2.4 + seededRandom(seed + 5) * 2.2;
    const pentGeo = trackGeo(new THREE.BoxGeometry(pentW, pentH, pentD));
    const penthouse = new THREE.Mesh(pentGeo, roofUnitMat);
    penthouse.position.set(0, roofTopY + 0.9 + pentH / 2, 0);
    highGroup.add(penthouse);

    // Side HVAC chiller box
    const hvacGeo = trackGeo(new THREE.BoxGeometry(topW * 0.22, 1.3, topD * 0.24));
    const hvac = new THREE.Mesh(hvacGeo, metalTrimMat);
    hvac.position.set(-topW * 0.26, roofTopY + 1.55, topD * 0.22);
    highGroup.add(hvac);

    if (height > 32) {
      const spireGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.2, 6.8, 8));
      const spire = new THREE.Mesh(spireGeo, metalTrimMat);
      spire.position.set(0, roofTopY + 0.9 + pentH + 3.4, 0);
      highGroup.add(spire);
    }

    // Illuminated Vertical Neon Blade Sign on Commercial Buildings
    if (seededRandom(seed + 9) > 0.35) {
      const signGeo = trackGeo(
        new THREE.BoxGeometry(isEWFace ? 0.9 : 0.26, 5.4, isEWFace ? 0.26 : 0.9)
      );
      const sign = new THREE.Mesh(
        signGeo,
        signMats[Math.floor(seededRandom(seed + 11) * signMats.length)]
      );
      if (isEWFace) {
        sign.position.set(faceSign * (width / 2 + 0.55), 8.8, depth * 0.28);
      } else {
        sign.position.set(width * 0.28, 8.8, faceSign * (depth / 2 + 0.55));
      }
      highGroup.add(sign);
    }

    // Low-detail far LOD proxy (1 draw call beyond 195m)
    const lowGeo = trackGeo(new THREE.BoxGeometry(width, height, depth));
    const lowMesh = new THREE.Mesh(lowGeo, facadeMaterials[facadeIndex % facadeMaterials.length]);
    lowMesh.position.y = height / 2;

    lod.addLevel(highGroup, 0);
    lod.addLevel(lowMesh, 195);
    return lod;
  }

  // Downtown Skyscrapers & Commercial District Towers
  const buildingSpecs: {
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    facade: number;
    face: 'E' | 'W' | 'N' | 'S';
    seed: number;
  }[] = [
    { x: -23.5, z: 22, w: 14, d: 18, h: 38, facade: 0, face: 'E', seed: 10 },
    { x: -24.5, z: -2, w: 16, d: 18, h: 72, facade: 2, face: 'E', seed: 11 },
    { x: -23.0, z: -26, w: 13, d: 16, h: 30, facade: 3, face: 'E', seed: 12 },
    { x: -72, z: 20, w: 14, d: 18, h: 48, facade: 4, face: 'W', seed: 13 },
    { x: -72, z: -18, w: 15, d: 20, h: 34, facade: 1, face: 'W', seed: 14 },

    { x: 23.5, z: 22, w: 14, d: 18, h: 44, facade: 1, face: 'W', seed: 20 },
    { x: 24.5, z: -2, w: 16, d: 18, h: 80, facade: 0, face: 'W', seed: 21 },
    { x: 23.5, z: -26, w: 14, d: 16, h: 34, facade: 5, face: 'W', seed: 22 },
    { x: 72, z: 18, w: 15, d: 20, h: 50, facade: 2, face: 'E', seed: 23 },
    { x: 72, z: -20, w: 14, d: 18, h: 62, facade: 0, face: 'E', seed: 24 },

    // Residential Mid-Rise Condos
    { x: -168, z: -90, w: 16, d: 20, h: 22, facade: 4, face: 'W', seed: 31 },
    { x: -128, z: -120, w: 18, d: 14, h: 20, facade: 3, face: 'N', seed: 32 },

    // Commercial North District
    { x: 26, z: -184, w: 16, d: 18, h: 42, facade: 5, face: 'W', seed: 40 },
    { x: 72, z: -176, w: 16, d: 20, h: 56, facade: 2, face: 'E', seed: 41 },
    { x: 68, z: -214, w: 18, d: 16, h: 36, facade: 1, face: 'N', seed: 42 },
    { x: 32, z: -216, w: 16, d: 16, h: 30, facade: 3, face: 'N', seed: 43 },

    // East River Skyline Offices
    { x: 116, z: 22, w: 14, d: 18, h: 36, facade: 1, face: 'W', seed: 70 },
    { x: 116, z: -20, w: 14, d: 20, h: 28, facade: 0, face: 'W', seed: 71 },
    { x: 116, z: -96, w: 14, d: 24, h: 34, facade: 2, face: 'W', seed: 72 },
    { x: 116, z: -192, w: 14, d: 24, h: 46, facade: 5, face: 'W', seed: 73 },
  ];

  buildingSpecs.forEach((b) => {
    const lod = buildCompositeBuildingLOD(b.w, b.d, b.h, b.facade, b.face, b.seed);
    lod.position.set(b.x, 0.14, b.z);
    cityGroup.add(lod);
  });

  // --- Grand Shopping Mall, Outdoor Cafe Plaza & Parking Lot ---
  const mallGroup = new THREE.Group();
  mallGroup.position.set(48, 0.14, -78);
  const mallWallMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf6f8fc, roughness: 0.42, metalness: 0.12 })
  );
  const mallAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xec4899,
      roughness: 0.3,
      emissive: 0xbe185d,
      emissiveIntensity: 0.45,
    })
  );
  const mallBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(54, 13, 24)), mallWallMat);
  mallBody.position.y = 6.5;
  mallBody.castShadow = true;
  mallBody.receiveShadow = true;
  mallGroup.add(mallBody);

  const mallAtrium = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22, 15.2, 26.2)), shopGlassMat);
  mallAtrium.position.y = 7.6;
  mallGroup.add(mallAtrium);

  const mallRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(26, 0.9, 28)), parapetMat);
  mallRoof.position.y = 15.4;
  mallGroup.add(mallRoof);

  const mallBanner = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(28, 2.2, 0.6)), mallAccentMat);
  mallBanner.position.set(0, 12.6, 12.6);
  mallGroup.add(mallBanner);

  // Outdoor Plaza Cafe Umbrellas outside Mall
  const umbMat1 = trackMat(new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.6 }));
  const umbMat2 = trackMat(new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.6 }));
  [-18, -11, 11, 18].forEach((ux, idx) => {
    const pole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6)), metalTrimMat);
    pole.position.set(ux, 1.25, 16);
    mallGroup.add(pole);
    const canopy = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.75, 0.75, 8)), idx % 2 === 0 ? umbMat1 : umbMat2);
    canopy.position.set(ux, 2.6, 16);
    mallGroup.add(canopy);
  });
  cityGroup.add(mallGroup);

  const parkingAsphaltMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x343c4a, roughness: 0.86, metalness: 0.04 })
  );
  const mallParking = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(48, 0.06, 26)), parkingAsphaltMat);
  mallParking.position.set(52, 0.15, -112);
  mallParking.receiveShadow = true;
  cityGroup.add(mallParking);

  const stallLineGeo = trackGeo(new THREE.PlaneGeometry(0.18, 4.5));
  stallLineGeo.rotateX(-Math.PI / 2);
  for (let px = 34; px <= 70; px += 4.5) {
    const line = new THREE.Mesh(stallLineGeo, rwStripeMat);
    line.position.set(px, 0.19, -118);
    cityGroup.add(line);
    const line2 = new THREE.Mesh(stallLineGeo, rwStripeMat);
    line2.position.set(px, 0.19, -106);
    cityGroup.add(line2);
  }

  // --- Central City Park & Illuminated Fountain ---
  const parkLawn = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(64, 0.06, 64)), parkGrassMat);
  parkLawn.position.set(-48, 0.15, -96);
  parkLawn.receiveShadow = true;
  cityGroup.add(parkLawn);

  const pathMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xd8d0c3, roughness: 0.84 }));
  const path1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 0.08, 64)), pathMat);
  path1.position.set(-48, 0.16, -96);
  cityGroup.add(path1);
  const path2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(64, 0.08, 4.4)), pathMat);
  path2.position.set(-48, 0.16, -96);
  cityGroup.add(path2);

  const fountainBasin = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(5.6, 6.0, 0.7, 24)),
    monumentMat
  );
  fountainBasin.position.set(-48, 0.45, -96);
  cityGroup.add(fountainBasin);
  const fountainWater = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(4.9, 4.9, 0.56, 24)),
    riverMat
  );
  fountainWater.position.set(-48, 0.54, -96);
  cityGroup.add(fountainWater);
  const fountainJet = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.45, 0.92, 3.0, 12)),
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.84,
      })
    )
  );
  fountainJet.position.set(-48, 2.15, -96);
  cityGroup.add(fountainJet);

  const flowerColors = [0xf43f5e, 0xfbbf24, 0xc084fc, 0xfb7185];
  const flowerGeo = trackGeo(new THREE.BoxGeometry(6.8, 0.28, 2.8));
  [
    [-38, -86, 0],
    [-58, -86, 1],
    [-38, -106, 2],
    [-58, -106, 3],
  ].forEach(([fx, fz, ci]) => {
    const bed = new THREE.Mesh(
      flowerGeo,
      trackMat(new THREE.MeshStandardMaterial({ color: flowerColors[ci], roughness: 0.78 }))
    );
    bed.position.set(fx, 0.28, fz);
    cityGroup.add(bed);
  });

  // --- Civic District (Hospital + Helipad, Police HQ, Fire Station) ---
  const hospGroup = new THREE.Group();
  hospGroup.position.set(-26, 0.14, -180);
  const hospBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22, 18.5, 26)), mallWallMat);
  hospBody.position.y = 9.25;
  hospBody.castShadow = true;
  hospGroup.add(hospBody);
  const hospGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22.3, 12, 18)), shopGlassMat);
  hospGlass.position.y = 8;
  hospGroup.add(hospGlass);
  const hospPortico = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.5, 0.5, 10)), parapetMat);
  hospPortico.position.set(13.2, 4.2, 0);
  hospPortico.castShadow = true;
  hospGroup.add(hospPortico);
  const redCrossMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.95 })
  );
  const crossV = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 5.4, 1.5)), redCrossMat);
  crossV.position.set(11.2, 14, 0);
  hospGroup.add(crossV);
  const crossH = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 1.5, 5.4)), redCrossMat);
  crossH.position.set(11.2, 14, 0);
  hospGroup.add(crossH);
  // Rooftop Helipad circle
  const heliPad = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(5.2, 5.2, 0.16, 20)),
    tarmacMat
  );
  heliPad.position.set(0, 18.58, 0);
  hospGroup.add(heliPad);
  cityGroup.add(hospGroup);

  const polGroup = new THREE.Group();
  polGroup.position.set(-70, 0.14, -180);
  const polMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.42 }));
  const polBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(20, 14.5, 22)), mallWallMat);
  polBody.position.y = 7.25;
  polBody.castShadow = true;
  polGroup.add(polBody);
  const polGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(20.3, 8.2, 14)), shopGlassMat);
  polGlass.position.y = 6.2;
  polGroup.add(polGlass);
  const polBand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(20.6, 2.4, 22.6)), polMat);
  polBand.position.y = 12.6;
  polGroup.add(polBand);
  cityGroup.add(polGroup);

  const fireGroup = new THREE.Group();
  fireGroup.position.set(-50, 0.14, -216);
  const fireRedMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.38 }));
  const fireBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(30, 9.8, 16)), fireRedMat);
  fireBody.position.y = 4.9;
  fireBody.castShadow = true;
  fireGroup.add(fireBody);
  [-8, 0, 8].forEach((dx) => {
    const bay = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 5.5, 0.45)), parapetMat);
    bay.position.set(dx, 2.75, -8.1);
    fireGroup.add(bay);
  });
  const hoseTower = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5, 17.5, 5)), fireRedMat);
  hoseTower.position.set(11, 8.75, 3);
  fireGroup.add(hoseTower);
  cityGroup.add(fireGroup);

  // --- Gas Station (with Fuel Pumps & Price Sign) + Parking Garage ---
  const gasGroup = new THREE.Group();
  gasGroup.position.set(-124, 0.14, -176);
  const gasPad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(30, 0.06, 26)), parkingAsphaltMat);
  gasPad.position.y = 0.03;
  gasGroup.add(gasPad);
  const gasCanopyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.32,
      emissive: 0xca8a04,
      emissiveIntensity: 0.3,
    })
  );
  const canopy = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18, 0.9, 14)), gasCanopyMat);
  canopy.position.set(-2, 5.4, 0);
  canopy.castShadow = true;
  gasGroup.add(canopy);
  [-7, 3].forEach((px) => {
    [-4.5, 4.5].forEach((pz) => {
      const col = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 5.2, 8)), parapetMat);
      col.position.set(px, 2.6, pz);
      gasGroup.add(col);
    });
  });
  // Fuel Dispensers
  const pumpGeo = trackGeo(new THREE.BoxGeometry(1.1, 1.85, 0.65));
  [-4.5, 0.5].forEach((px) => {
    [-3.2, 3.2].forEach((pz) => {
      const pump = new THREE.Mesh(pumpGeo, fireRedMat);
      pump.position.set(px, 0.98, pz);
      gasGroup.add(pump);
    });
  });
  const gasMart = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8, 4.6, 14)), mallWallMat);
  gasMart.position.set(-12, 2.3, 0);
  gasGroup.add(gasMart);
  const gasMartGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.3, 3.0, 10)), shopGlassMat);
  gasMartGlass.position.set(-7.9, 1.8, 0);
  gasGroup.add(gasMartGlass);
  cityGroup.add(gasGroup);

  const garageGroup = new THREE.Group();
  garageGroup.position.set(-160, 0.14, -210);
  for (let deck = 0; deck < 3; deck++) {
    const slab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(32, 0.7, 24)), curbConcreteMat);
    slab.position.y = deck * 4.2 + 0.35;
    slab.castShadow = true;
    slab.receiveShadow = true;
    garageGroup.add(slab);
    const rail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(32.2, 1.1, 24.2)), parapetMat);
    rail.position.y = deck * 4.2 + 1.0;
    garageGroup.add(rail);
  }
  const pSign = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(3.6, 3.6, 0.65)),
    trackMat(
      new THREE.MeshStandardMaterial({ color: 0x2563eb, emissive: 0x1d4ed8, emissiveIntensity: 0.9 })
    )
  );
  pSign.position.set(-14, 12.6, 0);
  garageGroup.add(pSign);
  cityGroup.add(garageGroup);

  // --- Modern Detailed Residential Houses (Textured Walls, Shingle Roofs, Porches & Garden Fences) ---
  const houseWallMats = [
    trackMat(new THREE.MeshStandardMaterial({ map: textures.houseWallAlbedo, color: 0xfff8eb, roughness: 0.78 })),
    trackMat(new THREE.MeshStandardMaterial({ map: textures.houseWallAlbedo, color: 0xeaf6ff, roughness: 0.78 })),
    trackMat(new THREE.MeshStandardMaterial({ map: textures.houseWallAlbedo, color: 0xfff0f5, roughness: 0.78 })),
  ];
  const roofMats = [
    trackMat(new THREE.MeshStandardMaterial({ map: textures.roofTileAlbedo, color: 0xd9480f, roughness: 0.68 })),
    trackMat(new THREE.MeshStandardMaterial({ map: textures.roofTileAlbedo, color: 0x334155, roughness: 0.68 })),
    trackMat(new THREE.MeshStandardMaterial({ map: textures.roofTileAlbedo, color: 0x0f766e, roughness: 0.68 })),
  ];
  const houseBodyGeo = trackGeo(new THREE.BoxGeometry(10.2, 5.4, 10.2));
  const houseRoofGeo = trackGeo(new THREE.ConeGeometry(8.6, 3.9, 4));
  houseRoofGeo.rotateY(Math.PI / 4);
  const doorWoodMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x7c4a2d, roughness: 0.65 }));
  const fenceWhiteMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6 }));

  const houseCoords: [number, number][] = [
    [-122, 22],
    [-122, 0],
    [-122, -22],
    [-158, 22],
    [-158, 0],
    [-158, -22],
    [-124, -74],
    [-124, -104],
    [-158, -74],
    [-158, -108],
  ];
  houseCoords.forEach(([hx, hz], idx) => {
    const yard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(17, 0.06, 17)), parkGrassMat);
    yard.position.set(hx, 0.16, hz);
    yard.receiveShadow = true;
    cityGroup.add(yard);

    const hBody = new THREE.Mesh(houseBodyGeo, houseWallMats[idx % houseWallMats.length]);
    hBody.position.set(hx, 2.84, hz);
    hBody.castShadow = true;
    hBody.receiveShadow = true;
    cityGroup.add(hBody);

    const hRoof = new THREE.Mesh(houseRoofGeo, roofMats[idx % roofMats.length]);
    hRoof.position.set(hx, 7.4, hz);
    hRoof.castShadow = true;
    cityGroup.add(hRoof);

    // Front Porch & Wood Door
    const porch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.2, 0.3, 2.2)), curbConcreteMat);
    porch.position.set(hx, 0.3, hz + 6.0);
    cityGroup.add(porch);
    const frontDoor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.4, 2.4, 0.2)), doorWoodMat);
    frontDoor.position.set(hx, 1.4, hz + 5.15);
    cityGroup.add(frontDoor);

    // Low White Garden Perimeter Fence
    const fenceBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(16.8, 0.75, 0.18)), fenceWhiteMat);
    fenceBack.position.set(hx, 0.54, hz - 8.4);
    cityGroup.add(fenceBack);
    const fenceL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.75, 16.8)), fenceWhiteMat);
    fenceL.position.set(hx - 8.4, 0.54, hz);
    cityGroup.add(fenceL);
    const fenceR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.75, 16.8)), fenceWhiteMat);
    fenceR.position.set(hx + 8.4, 0.54, hz);
    cityGroup.add(fenceR);
  });

  // --- Distant Horizon Skyline & Scenic Mountain Foothill Ring ---
  const bgTowerGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const bgTowerMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.buildingFacades[0],
      emissiveMap: textures.buildingFacades[0],
      emissive: 0xffe4a8,
      emissiveIntensity: 0.0,
      color: 0x9eb7d4,
      roughness: 0.7,
      metalness: 0.15,
    })
  );
  const bgCoords: [number, number, number, number, number][] = [];
  for (let i = 0; i < 54; i++) {
    const angle = (i / 54) * Math.PI * 2;
    const dist = 310 + seededRandom(i + 400) * 95;
    const x = 45 + Math.cos(angle) * dist;
    const z = -105 + Math.sin(angle) * dist;
    // Keep western & southern countryside valley completely open and rural
    if (x < -175 || z > 62) continue;
    const w = 18 + seededRandom(i + 410) * 18;
    const d = 18 + seededRandom(i + 420) * 18;
    const h = 38 + seededRandom(i + 430) * 85;
    bgCoords.push([x, z, w, h, d]);
  }
  const bgInst = new THREE.InstancedMesh(bgTowerGeo, bgTowerMat, bgCoords.length);
  bgCoords.forEach(([x, z, w, h, d], i) => {
    dummy.position.set(x, h / 2, z);
    dummy.rotation.set(0, (i % 4) * 0.25, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    bgInst.setMatrixAt(i, dummy.matrix);
  });
  bgInst.instanceMatrix.needsUpdate = true;
  bgInst.computeBoundingSphere();
  cityGroup.add(bgInst);

  // Scenic Distant Mountain Ridge Ring outside both the City & Countryside Valley
  const hillGeo = trackGeo(new THREE.ConeGeometry(1, 1, 7));
  const hillMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x48765b, roughness: 0.92, metalness: 0.0 })
  );
  const hillCount = 48;
  const hillInst = new THREE.InstancedMesh(hillGeo, hillMat, hillCount);
  for (let i = 0; i < hillCount; i++) {
    const a = (i / hillCount) * Math.PI * 2;
    const dist = 760 + seededRandom(i + 800) * 140;
    const x = -120 + Math.cos(a) * dist;
    const z = -60 + Math.sin(a) * dist;
    const r = 105 + seededRandom(i + 820) * 70;
    const h = 58 + seededRandom(i + 840) * 78;
    dummy.position.set(x, h * 0.45, z);
    dummy.rotation.set(0, a, 0);
    dummy.scale.set(r, h, r * 0.85);
    dummy.updateMatrix();
    hillInst.setMatrixAt(i, dummy.matrix);
  }
  hillInst.instanceMatrix.needsUpdate = true;
  hillInst.computeBoundingSphere();
  cityGroup.add(hillInst);

  // --- 6B. Countryside Creek, Farm Plots, Red Barns, Silos, Windmill & Villages ---
  // Countryside Creek running North-South along X = CREEK_CENTER_X (-296)
  const creekGeo = trackGeo(new THREE.PlaneGeometry(CREEK_WIDTH, 760));
  creekGeo.rotateX(-Math.PI / 2);
  const creekMesh = new THREE.Mesh(creekGeo, riverMat);
  creekMesh.position.set(CREEK_CENTER_X, -1.25, -45);
  creekMesh.receiveShadow = true;
  cityGroup.add(creekMesh);

  const creekBankMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x7c6f59, roughness: 0.92 })
  );
  const creekBankGeo = trackGeo(new THREE.BoxGeometry(2.4, 1.8, 760));
  [CREEK_CENTER_X - CREEK_WIDTH / 2 - 0.6, CREEK_CENTER_X + CREEK_WIDTH / 2 + 0.6].forEach((bx) => {
    const bank = new THREE.Mesh(creekBankGeo, creekBankMat);
    bank.position.set(bx, -0.78, -45);
    bank.receiveShadow = true;
    cityGroup.add(bank);
  });

  // Agricultural Farm Plots (Plowed Soil, Golden Wheat Fields, Green Pastures & Orchards)
  const plowedSoilMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.plowedSoilAlbedo,
      roughness: 0.94,
      metalness: 0.0,
    })
  );
  const wheatStalkCoords: { x: number; z: number; s: number; rot: number }[] = [];
  const orchardTreeCoords: { x: number; z: number }[] = [];

  FARM_PLOTS.forEach((plot) => {
    const pw = plot.maxX - plot.minX;
    const pd = plot.maxZ - plot.minZ;
    const cx = (plot.minX + plot.maxX) * 0.5;
    const cz = (plot.minZ + plot.maxZ) * 0.5;

    const plotGeo = trackGeo(new THREE.PlaneGeometry(pw, pd));
    plotGeo.rotateX(-Math.PI / 2);
    const plotMat =
      plot.crop === 'pasture'
        ? parkGrassMat
        : plowedSoilMat;
    const plotMesh = new THREE.Mesh(plotGeo, plotMat);
    plotMesh.position.set(cx, -0.02, cz);
    plotMesh.receiveShadow = true;
    cityGroup.add(plotMesh);

    if (plot.crop === 'wheat') {
      for (let wx = plot.minX + 4; wx <= plot.maxX - 4; wx += 4.2) {
        for (let wz = plot.minZ + 4; wz <= plot.maxZ - 4; wz += 4.2) {
          const jitter = seededRandom(wx * 3.1 + wz * 1.7);
          wheatStalkCoords.push({
            x: wx + (jitter - 0.5) * 1.6,
            z: wz + (seededRandom(wx + wz) - 0.5) * 1.6,
            s: 0.85 + jitter * 0.4,
            rot: jitter * Math.PI,
          });
        }
      }
    } else if (plot.crop === 'orchard') {
      for (let ox = plot.minX + 9; ox <= plot.maxX - 9; ox += 14) {
        for (let oz = plot.minZ + 9; oz <= plot.maxZ - 9; oz += 14) {
          orchardTreeCoords.push({ x: ox, z: oz });
        }
      }
    }
  });

  // Golden Wheat Stalk Clusters (InstancedMesh)
  const wheatGeo = trackGeo(new THREE.ConeGeometry(0.95, 1.35, 5));
  wheatGeo.translate(0, 0.675, 0);
  const wheatMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdfb23d, roughness: 0.82, metalness: 0.02 })
  );
  const wheatInst = new THREE.InstancedMesh(wheatGeo, wheatMat, Math.max(1, wheatStalkCoords.length));
  wheatStalkCoords.forEach((wt, i) => {
    dummy.position.set(wt.x, -0.01, wt.z);
    dummy.rotation.set(0, wt.rot, 0);
    dummy.scale.set(1.25 * wt.s, wt.s, 1.25 * wt.s);
    dummy.updateMatrix();
    wheatInst.setMatrixAt(i, dummy.matrix);
  });
  wheatInst.instanceMatrix.needsUpdate = true;
  wheatInst.computeBoundingSphere();
  cityGroup.add(wheatInst);

  // Cylindrical Golden Hay Bales scattered across Wheat Farms & Pastures
  const hayGeo = trackGeo(new THREE.CylinderGeometry(0.95, 0.95, 1.75, 12));
  hayGeo.rotateZ(Math.PI / 2);
  const hayMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe3b84c, roughness: 0.92 }));
  const hayPositions: [number, number, number][] = [
    [-366, 94, 0.2], [-370, 99, 1.1], [-363, 102, 0.6],
    [-432, 134, 0.4], [-438, 138, 1.4], [-490, -76, 0.1],
    [-495, -80, 0.8], [-250, 98, 0.5], [-245, 104, 1.2],
  ];
  const hayInst = new THREE.InstancedMesh(hayGeo, hayMat, hayPositions.length);
  hayPositions.forEach(([hx, hz, rot], i) => {
    dummy.position.set(hx, 0.92, hz);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    hayInst.setMatrixAt(i, dummy.matrix);
  });
  hayInst.instanceMatrix.needsUpdate = true;
  hayInst.computeBoundingSphere();
  cityGroup.add(hayInst);

  // Split-Rail Wooden Farm Fences (InstancedMesh)
  const fenceSpecs: { x: number; z: number; yaw: number }[] = [];
  for (let fx = -486; fx <= -422; fx += 8) {
    fenceSpecs.push({ x: fx, z: -32, yaw: 0 });
    fenceSpecs.push({ x: fx, z: 148, yaw: 0 });
  }
  for (let fz = -24; fz <= 32; fz += 8) {
    fenceSpecs.push({ x: -372, z: fz, yaw: Math.PI / 2 });
    fenceSpecs.push({ x: -214, z: fz, yaw: Math.PI / 2 });
  }
  const woodFenceGeo = trackGeo(new THREE.BoxGeometry(7.6, 1.05, 0.22));
  const woodFenceMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x7c5332, roughness: 0.88 }));
  const woodFenceInst = new THREE.InstancedMesh(woodFenceGeo, woodFenceMat, fenceSpecs.length);
  fenceSpecs.forEach((f, i) => {
    dummy.position.set(f.x, 0.52, f.z);
    dummy.rotation.set(0, f.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    woodFenceInst.setMatrixAt(i, dummy.matrix);
  });
  woodFenceInst.instanceMatrix.needsUpdate = true;
  woodFenceInst.computeBoundingSphere();
  cityGroup.add(woodFenceInst);

  // Red Timber Barns & Shiny Grain Silos (Oakridge Barn & Sunfield Farm)
  const barnWoodMat = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.barnWoodAlbedo, roughness: 0.82 })
  );
  const barnRoofMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.25 })
  );
  const siloMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdbe4ef, roughness: 0.28, metalness: 0.78 })
  );

  const buildRedBarn = (bx: number, bz: number, yaw: number) => {
    const barn = new THREE.Group();
    barn.position.set(bx, 0, bz);
    barn.rotation.y = yaw;

    const mainBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(16, 7.6, 22)), barnWoodMat);
    mainBody.position.y = 3.8;
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    barn.add(mainBody);

    const roof = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(9.6, 9.6, 23, 4)), barnRoofMat);
    roof.rotation.x = Math.PI / 2;
    roof.rotation.z = Math.PI / 4;
    roof.scale.set(1, 0.65, 1);
    roof.position.y = 8.4;
    roof.castShadow = true;
    barn.add(roof);

    // Classic white X barn doors
    const doorBg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 4.8, 0.3)), fenceWhiteMat);
    doorBg.position.set(0, 2.4, 11.05);
    barn.add(doorBg);
    const doorInner = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.0, 4.2, 0.36)), barnWoodMat);
    doorInner.position.set(0, 2.4, 11.08);
    barn.add(doorInner);

    // Twin Steel Grain Silos
    [-11.2, -11.2].forEach((sx, si) => {
      const sz = si === 0 ? -5.5 : 3.5;
      const silo = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(3.1, 3.1, 14.5, 14)), siloMat);
      silo.position.set(sx, 7.25, sz);
      silo.castShadow = true;
      barn.add(silo);
      const dome = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(3.25, 2.4, 14)), siloMat);
      dome.position.set(sx, 15.7, sz);
      barn.add(dome);
    });

    cityGroup.add(barn);
  };

  buildRedBarn(-500, -76, Math.PI / 2); // Oakridge Barn
  buildRedBarn(-426, 134, 0);          // Sunfield Wheat Farm Barn

  // Tall Animated Farm Windmill at Oakridge Barn
  const windmillGroup = new THREE.Group();
  windmillGroup.position.set(-496, 0, -104);
  const wmTower = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.45, 1.55, 14.5, 4)), metalTrimMat);
  wmTower.position.y = 7.25;
  wmTower.castShadow = true;
  windmillGroup.add(wmTower);
  const wmNacelle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 1.1, 2.2)), barnWoodMat);
  wmNacelle.position.set(0, 14.8, 0);
  windmillGroup.add(wmNacelle);

  const windmillBlades = new THREE.Group();
  windmillBlades.position.set(0, 14.8, 1.25);
  const bladeGeo = trackGeo(new THREE.BoxGeometry(0.75, 4.4, 0.08));
  for (let b = 0; b < 6; b++) {
    const bladeHolder = new THREE.Group();
    bladeHolder.rotation.z = (b / 6) * Math.PI * 2;
    const blade = new THREE.Mesh(bladeGeo, fenceWhiteMat);
    blade.position.y = 2.4;
    bladeHolder.add(blade);
    windmillBlades.add(bladeHolder);
  }
  windmillGroup.add(windmillBlades);
  cityGroup.add(windmillGroup);

  // Greenvale Village & Millstone Village Cottages, Rural General Store & Grain Mill
  const villageCottageCoords: { x: number; z: number; idx: number; yaw: number }[] = [
    { x: -372, z: -72, idx: 0, yaw: 0 },
    { x: -414, z: -72, idx: 1, yaw: 0 },
    { x: -372, z: -24, idx: 2, yaw: Math.PI },
    { x: -416, z: -22, idx: 0, yaw: Math.PI },
    { x: -372, z: -214, idx: 1, yaw: Math.PI },
    { x: -416, z: -214, idx: 2, yaw: Math.PI },
  ];
  villageCottageCoords.forEach((vc) => {
    const cottage = new THREE.Group();
    cottage.position.set(vc.x, 0, vc.z);
    cottage.rotation.y = vc.yaw;

    const yard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(16, 0.05, 16)), parkGrassMat);
    yard.position.y = 0.025;
    yard.receiveShadow = true;
    cottage.add(yard);

    const body = new THREE.Mesh(houseBodyGeo, houseWallMats[vc.idx % houseWallMats.length]);
    body.position.y = 2.7;
    body.castShadow = true;
    body.receiveShadow = true;
    cottage.add(body);

    const roof = new THREE.Mesh(houseRoofGeo, roofMats[vc.idx % roofMats.length]);
    roof.position.y = 7.25;
    roof.castShadow = true;
    cottage.add(roof);

    const door = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.4, 2.4, 0.2)), doorWoodMat);
    door.position.set(0, 1.25, 5.15);
    cottage.add(door);

    cityGroup.add(cottage);
  });

  // Greenvale Village Store & Market Canopy
  const villageStore = new THREE.Group();
  villageStore.position.set(-364, 0, -34);
  const vsBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(14, 5.2, 11)), houseWallMats[0]);
  vsBody.position.y = 2.6;
  vsBody.castShadow = true;
  villageStore.add(vsBody);
  const vsAwning = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(14.6, 0.25, 2.6)), awningMats[1]);
  vsAwning.position.set(0, 3.2, -6.5);
  vsAwning.rotation.x = -0.18;
  villageStore.add(vsAwning);
  const vsSign = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 1.2, 0.3)), signMats[1]);
  vsSign.position.set(0, 4.8, -5.6);
  villageStore.add(vsSign);
  cityGroup.add(villageStore);

  // --- 7. Lush Multi-Tier Trees (with Sakura Accents), Shrubs, Benches & Street Props ---
  const treePlacements: {
    x: number;
    z: number;
    y: number;
    scale: number;
    tint: number;
    sakura: boolean;
    urbanPlanter: boolean;
  }[] = [];

  ROAD_SEGMENTS.forEach((seg, segIdx) => {
    if (
      seg.roadType === 'bridge' ||
      seg.roadType === 'tunnel' ||
      seg.roadType === 'airport' ||
      seg.roadType === 'creek_bridge'
    ) {
      return;
    }
    const isRuralSeg = seg.roadType === 'rural' || seg.roadType === 'dirt';
    const margin = 12;
    const usable = seg.length - margin * 2;
    if (usable < 12) return;
    const count = Math.max(2, Math.floor(usable / (isRuralSeg ? 32 : 22)));
    const step = usable / (count - 1);

    for (let k = 0; k < count; k++) {
      const posAlong = seg.startPos + margin + k * step;
      [-1, 1].forEach((side) => {
        const seed = segIdx * 41 + k * 7 + (side > 0 ? 3 : 11);
        const offset = side * (ROAD_HALF_W + (isRuralSeg ? 3.2 : 2.4));
        const tx = seg.axis === 'NS' ? seg.centerX + offset : posAlong;
        const tz = seg.axis === 'NS' ? posAlong : seg.centerZ + offset;
        treePlacements.push({
          x: tx,
          z: tz,
          y: isRuralSeg ? 0.0 : 0.14,
          scale: (isRuralSeg ? 1.05 : 0.88) + seededRandom(seed) * 0.28,
          tint: seededRandom(seed + 1),
          sakura: !isRuralSeg && seededRandom(seed + 19) > 0.84,
          urbanPlanter: !isRuralSeg,
        });
      });
    }
  });

  orchardTreeCoords.forEach((ot, i) => {
    treePlacements.push({
      x: ot.x,
      z: ot.z,
      y: 0.0,
      scale: 0.92 + seededRandom(i + 900) * 0.22,
      tint: seededRandom(i + 950),
      sakura: i % 5 === 0,
      urbanPlanter: false,
    });
  });

  [ROUNDABOUT_CENTER, ROUNDABOUT_2_CENTER].forEach((rb, rIdx) => {
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      treePlacements.push({
        x: rb.x + Math.cos(a) * 5.6,
        z: rb.z + Math.sin(a) * 5.6,
        y: 0.22,
        scale: 0.88,
        tint: 0.2 + i * 0.18 + rIdx * 0.1,
        sakura: i % 2 === 0,
        urbanPlanter: true,
      });
    }
  });

  for (let i = 0; i < 18; i++) {
    const px = -72 + (i % 4) * 16 + (seededRandom(i + 500) - 0.5) * 5;
    const pz = -122 + Math.floor(i / 4) * 16 + (seededRandom(i + 550) - 0.5) * 5;
    if (Math.hypot(px - -48, pz - -96) < 8.5) continue;
    treePlacements.push({
      x: px,
      z: pz,
      y: 0.18,
      scale: 0.95 + seededRandom(i + 580) * 0.28,
      tint: seededRandom(i + 590),
      sakura: i % 3 === 0,
      urbanPlanter: false,
    });
  }

  const treeCount = treePlacements.length;
  const planterGeo = trackGeo(new THREE.BoxGeometry(1.65, 0.24, 1.65));
  const planterMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x7b8594, roughness: 0.85, metalness: 0.05 })
  );
  const planterInst = new THREE.InstancedMesh(planterGeo, planterMat, treeCount);
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.26, 2.7, 8));
  const trunkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x5c4234, roughness: 0.9, metalness: 0.0 })
  );
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crownGeo = trackGeo(new THREE.IcosahedronGeometry(1.65, 1));
  const crownMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.0 })
  );
  const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  const puffGeo = trackGeo(new THREE.IcosahedronGeometry(1.15, 1));
  const puffMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0.0 })
  );
  const puffInst = new THREE.InstancedMesh(puffGeo, puffMat, treeCount);

  const baseColor = new THREE.Color();
  const puffColor = new THREE.Color();

  treePlacements.forEach((tp, i) => {
    if (tp.urbanPlanter) {
      dummy.position.set(tp.x, tp.y + 0.12, tp.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
    } else {
      dummy.position.set(tp.x, -50, tp.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.001, 0.001, 0.001);
    }
    dummy.updateMatrix();
    planterInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tp.x, tp.y + 1.35 * tp.scale, tp.z);
    dummy.rotation.set(0, tp.tint * Math.PI * 2, 0);
    dummy.scale.set(tp.scale, tp.scale, tp.scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tp.x, tp.y + 3.4 * tp.scale, tp.z);
    dummy.rotation.set(0.1, tp.tint * Math.PI * 2, 0.05);
    dummy.scale.set(tp.scale * 1.06, tp.scale * 0.92, tp.scale * 1.06);
    dummy.updateMatrix();
    crownInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(
      tp.x + 0.42 * tp.scale * (tp.x < 0 ? 1 : -1),
      tp.y + 4.3 * tp.scale,
      tp.z - 0.2 * tp.scale
    );
    dummy.rotation.set(0.2, tp.tint * 3.1, 0.1);
    dummy.scale.set(tp.scale, tp.scale * 0.88, tp.scale);
    dummy.updateMatrix();
    puffInst.setMatrixAt(i, dummy.matrix);

    if (tp.sakura) {
      baseColor.setHSL(0.93, 0.68, 0.72 + tp.tint * 0.06);
      puffColor.setHSL(0.94, 0.75, 0.82 + tp.tint * 0.06);
    } else {
      baseColor.setHSL(0.35 + (tp.tint - 0.5) * 0.04, 0.64, 0.37 + tp.tint * 0.06);
      puffColor.setHSL(0.32 + (tp.tint - 0.5) * 0.04, 0.68, 0.48 + tp.tint * 0.07);
    }
    crownInst.setColorAt(i, baseColor);
    puffInst.setColorAt(i, puffColor);
  });

  [planterInst, trunkInst, crownInst, puffInst].forEach((inst) => {
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    cityGroup.add(inst);
  });

  // Park Benches & Roadside Shrubs / Hydrants (InstancedMesh)
  const benchPositions: { x: number; z: number; yaw: number }[] = [
    { x: -42, z: -92, yaw: -Math.PI / 4 },
    { x: -54, z: -92, yaw: Math.PI / 4 },
    { x: -42, z: -100, yaw: (-Math.PI * 3) / 4 },
    { x: -54, z: -100, yaw: (Math.PI * 3) / 4 },
    { x: -12, z: -12, yaw: Math.PI / 2 },
    { x: 12, z: -12, yaw: -Math.PI / 2 },
    { x: -12, z: 12, yaw: Math.PI / 2 },
    { x: 12, z: 12, yaw: -Math.PI / 2 },
    { x: 38, z: -60, yaw: 0 },
    { x: 58, z: -60, yaw: 0 },
  ];
  const benchGeo = trackGeo(new THREE.BoxGeometry(2.0, 0.55, 0.72));
  const benchMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x9a5b32, roughness: 0.72 }));
  const benchInst = new THREE.InstancedMesh(benchGeo, benchMat, benchPositions.length);
  benchPositions.forEach((b, i) => {
    dummy.position.set(b.x, 0.42, b.z);
    dummy.rotation.set(0, b.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    benchInst.setMatrixAt(i, dummy.matrix);
  });
  benchInst.instanceMatrix.needsUpdate = true;
  benchInst.computeBoundingSphere();
  cityGroup.add(benchInst);

  // Red Fire Hydrants along key avenues (InstancedMesh)
  const hydrantCoords: [number, number][] = [
    [9.4, -22],
    [-9.4, 18],
    [9.4, -68],
    [-9.4, -110],
    [-105, -36],
    [105, -36],
    [-105, -156],
    [105, -156],
  ];
  const hydrantGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 0.82, 8));
  const hydrantMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.25 }));
  const hydrantInst = new THREE.InstancedMesh(hydrantGeo, hydrantMat, hydrantCoords.length);
  hydrantCoords.forEach(([hx, hz], i) => {
    dummy.position.set(hx, 0.55, hz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    hydrantInst.setMatrixAt(i, dummy.matrix);
  });
  hydrantInst.instanceMatrix.needsUpdate = true;
  hydrantInst.computeBoundingSphere();
  cityGroup.add(hydrantInst);

  // Ornamental Green Shrubs around Park & Mall (InstancedMesh)
  const shrubCoords: [number, number][] = [
    [-22, -78], [-22, -114], [-74, -78], [-74, -114],
    [24, -66], [72, -66], [24, -92], [72, -92],
    [-12, -32], [12, -32], [-12, 32], [12, 32],
  ];
  const shrubGeo = trackGeo(new THREE.DodecahedronGeometry(0.72, 1));
  const shrubMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x2f8545, roughness: 0.78 }));
  const shrubInst = new THREE.InstancedMesh(shrubGeo, shrubMat, shrubCoords.length);
  shrubCoords.forEach(([sx, sz], i) => {
    dummy.position.set(sx, 0.48, sz);
    dummy.rotation.set(0, i * 0.7, 0);
    dummy.scale.set(1.2, 0.85, 1.2);
    dummy.updateMatrix();
    shrubInst.setMatrixAt(i, dummy.matrix);
  });
  shrubInst.instanceMatrix.needsUpdate = true;
  shrubInst.computeBoundingSphere();
  cityGroup.add(shrubInst);

  // --- 8. Modern Street Lamps along All Roads & Roundabouts (InstancedMesh) ---
  const lampPlacements: { x: number; z: number; yaw: number }[] = [];

  ROAD_SEGMENTS.forEach((seg) => {
    if (
      seg.roadType === 'tunnel' ||
      seg.roadType === 'bridge' ||
      seg.roadType === 'creek_bridge' ||
      seg.roadType === 'dirt'
    ) {
      return;
    }
    const isRuralSeg = seg.roadType === 'rural';
    const margin = 9.0;
    const usable = seg.length - margin * 2;
    if (usable < 10) return;
    const count = Math.max(2, Math.floor(usable / (isRuralSeg ? 46 : 24)));
    const step = usable / (count - 1);

    for (let k = 0; k < count; k++) {
      const posAlong = seg.startPos + margin + k * step;
      if (seg.axis === 'NS') {
        lampPlacements.push({ x: seg.centerX - (ROAD_HALF_W + 0.8), z: posAlong, yaw: 0 });
        lampPlacements.push({ x: seg.centerX + (ROAD_HALF_W + 0.8), z: posAlong, yaw: Math.PI });
      } else {
        lampPlacements.push({ x: posAlong, z: seg.centerZ - (ROAD_HALF_W + 0.8), yaw: -Math.PI / 2 });
        lampPlacements.push({ x: posAlong, z: seg.centerZ + (ROAD_HALF_W + 0.8), yaw: Math.PI / 2 });
      }
    }
  });

  [ROUNDABOUT_CENTER, ROUNDABOUT_2_CENTER].forEach((rb) => {
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const r = ROUNDABOUT_OUTER_R + 0.9;
      lampPlacements.push({
        x: rb.x + Math.cos(a) * r,
        z: rb.z + Math.sin(a) * r,
        yaw: Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI,
      });
    }
  });

  const lampCount = lampPlacements.length;
  const lampBaseGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.25, 0.58, 8));
  const lampPoleGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.13, 6.0, 8));
  const lampArmGeo = trackGeo(new THREE.BoxGeometry(1.9, 0.1, 0.12));
  const lampHeadGeo = trackGeo(new THREE.BoxGeometry(0.78, 0.15, 0.36));
  const lampLensGeo = trackGeo(new THREE.BoxGeometry(0.6, 0.05, 0.24));

  const poleMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x2c3545, metalness: 0.76, roughness: 0.3 })
  );
  const lensMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff6dc,
      emissive: 0xffe4a3,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    })
  );

  const baseInst = new THREE.InstancedMesh(lampBaseGeo, poleMat, lampCount);
  const poleInst = new THREE.InstancedMesh(lampPoleGeo, poleMat, lampCount);
  const armInst = new THREE.InstancedMesh(lampArmGeo, poleMat, lampCount);
  const headInst = new THREE.InstancedMesh(lampHeadGeo, poleMat, lampCount);
  const lensInst = new THREE.InstancedMesh(lampLensGeo, lensMat, lampCount);

  const armOffset = new THREE.Vector3();
  const headOffset = new THREE.Vector3();

  lampPlacements.forEach((lp, i) => {
    const gy = lp.x < -208 || lp.z > 64 || lp.z < -252 ? 0.0 : 0.14;
    dummy.position.set(lp.x, gy + 0.29, lp.z);
    dummy.rotation.set(0, lp.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    baseInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(lp.x, gy + 3.0, lp.z);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);

    armOffset.set(0.9, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, lp.yaw);
    dummy.position.set(lp.x + armOffset.x, gy + 6.1, lp.z + armOffset.z);
    dummy.rotation.set(0, lp.yaw, 0.16);
    dummy.updateMatrix();
    armInst.setMatrixAt(i, dummy.matrix);

    headOffset.set(1.95, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, lp.yaw);
    dummy.position.set(lp.x + headOffset.x, gy + 6.24, lp.z + headOffset.z);
    dummy.rotation.set(0, lp.yaw, 0);
    dummy.updateMatrix();
    headInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(lp.x + headOffset.x, gy + 6.16, lp.z + headOffset.z);
    dummy.updateMatrix();
    lensInst.setMatrixAt(i, dummy.matrix);
  });

  [baseInst, poleInst, armInst, headInst, lensInst].forEach((inst) => {
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    cityGroup.add(inst);
  });

  // --- 9. Traffic Lights at Major Urban Intersections ---
  const signalSpecs: { x: number; z: number; yaw: number; axis: 'NS' | 'EW' }[] = [];
  ROAD_NODES.forEach((node) => {
    if (node.isRural || (node.kind !== 'intersection' && node.kind !== 'tjunction')) return;
    if (node.connections.includes('S')) {
      signalSpecs.push({ x: node.x + 9.1, z: node.z + 9.1, yaw: Math.PI, axis: 'NS' });
    }
    if (node.connections.includes('N')) {
      signalSpecs.push({ x: node.x - 9.1, z: node.z - 9.1, yaw: 0, axis: 'NS' });
    }
    if (node.connections.includes('E')) {
      signalSpecs.push({ x: node.x + 9.1, z: node.z - 9.1, yaw: -Math.PI / 2, axis: 'EW' });
    }
    if (node.connections.includes('W')) {
      signalSpecs.push({ x: node.x - 9.1, z: node.z + 9.1, yaw: Math.PI / 2, axis: 'EW' });
    }
  });

  const sigPoleGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.15, 5.8, 8));
  const sigArmGeo = trackGeo(new THREE.BoxGeometry(4.4, 0.14, 0.14));
  const sigBoxGeo = trackGeo(new THREE.BoxGeometry(1.5, 0.56, 0.32));
  const sigLensGeo = trackGeo(new THREE.CircleGeometry(0.16, 10));
  const sigDarkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1b222e, roughness: 0.45, metalness: 0.55 })
  );

  const createSignalLensMats = () => ({
    red: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x3f1014, emissive: 0xff2b3d, emissiveIntensity: 0.15 })
    ),
    amber: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x3b2c0a, emissive: 0xffb703, emissiveIntensity: 0.15 })
    ),
    green: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0a3822, emissive: 0x10e87a, emissiveIntensity: 2.2 })
    ),
  });
  const nsLensMats = createSignalLensMats();
  const ewLensMats = createSignalLensMats();

  const sigCount = signalSpecs.length;
  const sigPoleInst = new THREE.InstancedMesh(sigPoleGeo, poleMat, sigCount);
  const sigArmInst = new THREE.InstancedMesh(sigArmGeo, poleMat, sigCount);
  const sigBoxInst = new THREE.InstancedMesh(sigBoxGeo, sigDarkMat, sigCount);

  signalSpecs.forEach((sp, i) => {
    const gy = 0.14;
    dummy.position.set(sp.x, gy + 2.9, sp.z);
    dummy.rotation.set(0, sp.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    sigPoleInst.setMatrixAt(i, dummy.matrix);

    armOffset.set(2.1, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, sp.yaw);
    dummy.position.set(sp.x + armOffset.x, gy + 5.65, sp.z + armOffset.z);
    dummy.updateMatrix();
    sigArmInst.setMatrixAt(i, dummy.matrix);

    headOffset.set(3.2, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, sp.yaw);
    dummy.position.set(sp.x + headOffset.x, gy + 5.62, sp.z + headOffset.z);
    dummy.updateMatrix();
    sigBoxInst.setMatrixAt(i, dummy.matrix);

    const mats = sp.axis === 'NS' ? nsLensMats : ewLensMats;
    const lensOffsets = [-0.46, 0, 0.46];
    const lensMatArr = [mats.red, mats.amber, mats.green];
    lensOffsets.forEach((lx, li) => {
      const worldOffset = new THREE.Vector3(3.2 + lx, 0, 0.17).applyAxisAngle(
        THREE.Object3D.DEFAULT_UP,
        sp.yaw
      );
      const lens = new THREE.Mesh(sigLensGeo, lensMatArr[li]);
      lens.position.set(sp.x + worldOffset.x, gy + 5.62, sp.z + worldOffset.z);
      lens.rotation.y = sp.yaw;
      cityGroup.add(lens);
    });
  });

  [sigPoleInst, sigArmInst, sigBoxInst].forEach((inst) => {
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    cityGroup.add(inst);
  });

  // --- 10. Road Signs across City ---
  const signPlacements: { x: number; z: number; yaw: number; type: 0 | 1 | 2 | 3 }[] = [
    { x: 9.0, z: -14, yaw: 0, type: 0 },
    { x: 9.0, z: -34, yaw: 0, type: 2 },
    { x: 9.0, z: -112, yaw: 0, type: 1 },
    { x: -9.0, z: -178, yaw: Math.PI, type: 1 },
    { x: -32, z: -135, yaw: -Math.PI / 2, type: 1 },
    { x: 32, z: -153, yaw: Math.PI / 2, type: 1 },
    { x: -183, z: -80, yaw: Math.PI, type: 1 },
    { x: -162, z: -39, yaw: Math.PI / 2, type: 1 },
    { x: 106, z: -39, yaw: -Math.PI / 2, type: 0 },
    { x: 106, z: -135, yaw: -Math.PI / 2, type: 0 },
    { x: -201, z: 57, yaw: Math.PI / 4, type: 3 },
    { x: -201, z: -249, yaw: (Math.PI * 3) / 4, type: 3 },
    { x: 201, z: 57, yaw: -Math.PI / 4, type: 3 },
  ];

  const signPostGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.06, 2.8, 8));
  const signPostMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.78, roughness: 0.28 })
  );
  const signPostInst = new THREE.InstancedMesh(signPostGeo, signPostMat, signPlacements.length);
  const signPlateGeo = trackGeo(new THREE.BoxGeometry(0.98, 0.98, 0.06));
  const signPlateMats = textures.roadSigns.map((tex) => [
    signPostMat,
    signPostMat,
    signPostMat,
    signPostMat,
    trackMat(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1 })),
    signPostMat,
  ]);

  signPlacements.forEach((sp, i) => {
    const gy = 0.14;
    dummy.position.set(sp.x, gy + 1.4, sp.z);
    dummy.rotation.set(0, sp.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    signPostInst.setMatrixAt(i, dummy.matrix);

    const plate = new THREE.Mesh(signPlateGeo, signPlateMats[sp.type]);
    plate.position.set(sp.x, gy + 2.55, sp.z);
    plate.rotation.y = sp.yaw;
    cityGroup.add(plate);
  });
  signPostInst.instanceMatrix.needsUpdate = true;
  signPostInst.computeBoundingSphere();
  cityGroup.add(signPostInst);

  // --- 11. 3D GPS Navigation Route Line & Destination Beacon ---
  const navGroup = new THREE.Group();
  cityGroup.add(navGroup);

  const navLineMat = trackMat(
    new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 2 })
  );
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.8,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  const beaconRingGeo = trackGeo(new THREE.RingGeometry(2.8, 3.6, 32));
  beaconRingGeo.rotateX(-Math.PI / 2);
  const beaconPillarGeo = trackGeo(new THREE.CylinderGeometry(0.25, 0.8, 16, 12, 1, true));

  let navLineObj: THREE.Line | null = null;
  let beaconMesh: THREE.Group | null = null;

  const setNavigationRoute = (route: RoutePoint[], destination: LandmarkLocation | null) => {
    if (navLineObj) {
      navLineObj.geometry.dispose();
      navGroup.remove(navLineObj);
      navLineObj = null;
    }
    if (beaconMesh) {
      navGroup.remove(beaconMesh);
      beaconMesh = null;
    }

    if (route.length >= 2) {
      const vecs: THREE.Vector3[] = [];
      for (let i = 0; i < route.length - 1; i++) {
        const a = route[i];
        const b = route[i + 1];
        const segDist = Math.hypot(b.x - a.x, b.z - a.z);
        const steps = Math.max(1, Math.ceil(segDist / 4.0));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const px = a.x + (b.x - a.x) * t;
          const pz = a.z + (b.z - a.z) * t;
          vecs.push(new THREE.Vector3(px, groundHeightAt(px, pz) + 0.18, pz));
        }
      }
      const lastPt = route[route.length - 1];
      vecs.push(new THREE.Vector3(lastPt.x, groundHeightAt(lastPt.x, lastPt.z) + 0.18, lastPt.z));
      const lineGeo = new THREE.BufferGeometry().setFromPoints(vecs);
      navLineObj = new THREE.Line(lineGeo, navLineMat);
      navGroup.add(navLineObj);
    }

    if (destination) {
      const bg = new THREE.Group();
      const gy = groundHeightAt(destination.roadX, destination.roadZ);
      bg.position.set(destination.roadX, gy + 0.18, destination.roadZ);
      const ring = new THREE.Mesh(beaconRingGeo, beaconMat);
      bg.add(ring);
      const pillar = new THREE.Mesh(beaconPillarGeo, beaconMat);
      pillar.position.y = 8;
      bg.add(pillar);
      navGroup.add(bg);
      beaconMesh = bg;
    }
  };

  return {
    group: cityGroup,
    setNavigationRoute,
    setEnvironmentState: (nightFactor: number, rainFactor: number) => {
      lensMat.emissiveIntensity = 0.35 + nightFactor * 3.5;
      rwBeaconMat.emissiveIntensity = 1.4 + nightFactor * 2.2;

      const winGlow = nightFactor * 0.48;
      for (let i = 0; i < facadeMaterials.length; i++) {
        facadeMaterials[i].emissiveIntensity = winGlow;
      }
      bgTowerMat.emissiveIntensity = nightFactor * 0.35;

      const signGlow = 1.15 + nightFactor * 1.4;
      for (let i = 0; i < signMats.length; i++) {
        signMats[i].emissiveIntensity = signGlow;
      }

      const roadRough = 0.85 - rainFactor * 0.58;
      const roadMetal = 0.06 + rainFactor * 0.16;
      roadMat.roughness = roadRough;
      roadMat.metalness = roadMetal;
      roadBaseMat.roughness = roadRough;
      roadBaseMat.metalness = roadMetal;
      rbMat.roughness = roadRough;
      rbMat.metalness = roadMetal;
    },
    update: (elapsedTime: number) => {
      const cycle = elapsedTime % 12;
      const updateGroup = (mats: typeof nsLensMats, phaseOffset: number) => {
        const t = (cycle + phaseOffset) % 12;
        mats.green.emissiveIntensity = t < 4.5 ? 2.2 : 0.12;
        mats.amber.emissiveIntensity = t >= 4.5 && t < 6.0 ? 2.2 : 0.12;
        mats.red.emissiveIntensity = t >= 6.0 ? 2.2 : 0.12;
      };
      updateGroup(nsLensMats, 0);
      updateGroup(ewLensMats, 6);

      radarDish.rotation.y = elapsedTime * 1.4;
      windmillBlades.rotation.z = -elapsedTime * 1.35;
      fountainJet.scale.y = 0.88 + Math.sin(elapsedTime * 5.2) * 0.14;
      if (beaconMesh) {
        beaconMesh.rotation.y = elapsedTime * 1.2;
      }
    },
    dispose: () => {
      if (navLineObj) navLineObj.geometry.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
