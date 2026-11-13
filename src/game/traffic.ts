import * as THREE from 'three';
import {
  groundHeightAt,
  groundPitchAt,
  NODE_MAP,
  ROAD_NODES,
  ROAD_SEGMENTS,
  type RoadNode,
} from './roadNetwork';
import type { VehicleKind } from './types';
import { createVehicleBuilder } from './vehicleFactory';

export type TrafficVehicleType =
  | 'car'
  | 'bus'
  | 'motorcycle'
  | 'truck'
  | 'tractor'
  | 'pickup'
  | 'emergency';

export interface EnterableVehicleCandidate {
  id: string;
  kind: VehicleKind;
  label: string;
  x: number;
  z: number;
  yaw: number;
  halfLen: number;
  distance: number;
}

export interface ClaimedVehicleInfo {
  id: string;
  kind: VehicleKind;
  label: string;
  mesh: THREE.Group;
  x: number;
  z: number;
  yaw: number;
}

export interface TrafficSystemHandle {
  group: THREE.Group;
  update: (
    elapsedTime: number,
    dt: number,
    playerX: number,
    playerZ: number
  ) => void;
  resolvePlayerCollision: (
    px: number,
    pz: number,
    speed: number,
    activeVehicleId?: string
  ) => { x: number; z: number; speed: number };
  findClosestEnterableVehicle: (
    px: number,
    pz: number,
    maxDistance: number
  ) => EnterableVehicleCandidate | null;
  claimVehicle: (id: string) => ClaimedVehicleInfo | null;
  releaseVehicle: (id: string, x: number, z: number, yaw: number) => void;
  updateClaimedVehicle: (
    id: string,
    x: number,
    y: number,
    z: number,
    pitch: number,
    yaw: number,
    speed: number,
    dt: number,
    steerAngle?: number
  ) => void;
  getVehicleTypesSummary: () => VehicleKind[];
  dispose: () => void;
}

interface TrafficAgent {
  id: string;
  type: TrafficVehicleType;
  label: string;
  mesh: THREE.Group;
  sprungBody: THREE.Group;
  wheelSteerPivots: THREE.Group[];
  wheelSpinGroups: THREE.Group[];
  wheelRadii: number[];
  riderGroup?: THREE.Group;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  maxSpeed: number;
  halfLen: number;
  fromNode: RoadNode;
  toNode: RoadNode;
  laneOffset: number;
  targetX: number;
  targetZ: number;
  phase: 'segment' | 'turning';
  isPlayerControlled: boolean;
  isParked: boolean;
  fieldLoop?: {
    waypoints: { x: number; z: number }[];
    wpIdx: number;
  };
}

// Build undirected neighbor lookup for road graph
const GRAPH_NEIGHBORS = new Map<string, RoadNode[]>();
ROAD_NODES.forEach((n) => GRAPH_NEIGHBORS.set(n.id, []));
ROAD_SEGMENTS.forEach((seg) => {
  const a = NODE_MAP.get(seg.a);
  const b = NODE_MAP.get(seg.b);
  if (a && b) {
    GRAPH_NEIGHBORS.get(a.id)?.push(b);
    GRAPH_NEIGHBORS.get(b.id)?.push(a);
  }
});

function laneTargetForEdge(from: RoadNode, to: RoadNode, offset = 3.8): { x: number; z: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.max(Math.hypot(dx, dz), 0.001);
  const ux = dx / len;
  const uz = dz / len;
  // Right-hand side perpendicular vector
  const rx = -uz;
  const rz = ux;
  const stopBack = to.kind === 'roundabout' ? 20.5 : 8.5;
  return {
    x: to.x - ux * stopBack + rx * offset,
    z: to.z - uz * stopBack + rz * offset,
  };
}

function isSignalGreen(axis: 'NS' | 'EW', elapsedTime: number): boolean {
  const cycle = elapsedTime % 12;
  if (axis === 'NS') {
    return cycle < 4.5;
  }
  return cycle >= 6.0 && cycle < 10.5;
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

function labelForTrafficType(type: TrafficVehicleType): string {
  switch (type) {
    case 'bus':
      return 'City Bus';
    case 'truck':
      return 'Cargo Truck';
    case 'motorcycle':
      return 'Sport Motorcycle';
    case 'tractor':
      return 'Farm Tractor';
    case 'pickup':
      return 'Countryside Pickup';
    case 'emergency':
      return 'Patrol Unit';
    default:
      return 'City Sedan';
  }
}

export function createTrafficSystem(): TrafficSystemHandle {
  const group = new THREE.Group();
  group.name = 'CityTraffic';

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

  // Emergency flashing beacon materials
  const beaconRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff2233,
      emissive: 0xff1122,
      emissiveIntensity: 2.2,
    })
  );
  const beaconBlueMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2288ff,
      emissive: 0x1177ff,
      emissiveIntensity: 2.2,
    })
  );

  const vehicleBuilder = createVehicleBuilder({
    trackGeo,
    trackMat,
    beaconRedMat,
    beaconBlueMat,
  });

  // Spawn 25 moving traffic vehicles distributed across the City & Countryside road graph
  const spawnSpecs: {
    type: TrafficVehicleType;
    from: string;
    to: string;
    t: number;
    speed: number;
  }[] = [
    { type: 'car', from: 'CENTER_4WAY', to: 'ROUNDABOUT', t: 0.35, speed: 12.5 },
    { type: 'bus', from: 'MW_4WAY', to: 'CENTER_4WAY', t: 0.45, speed: 9.5 },
    { type: 'motorcycle', from: 'SE_TJUNC', to: 'S_TJUNC', t: 0.3, speed: 15.0 },
    { type: 'emergency', from: 'NW_4WAY', to: 'ROUNDABOUT', t: 0.5, speed: 14.5 },
    { type: 'truck', from: 'E_HWY_M', to: 'ME_4WAY', t: 0.4, speed: 10.0 },
    { type: 'car', from: 'NE_4WAY', to: 'E_HWY_N', t: 0.45, speed: 13.0 },
    { type: 'car', from: 'SW_TJUNC', to: 'W2_S_CORNER', t: 0.5, speed: 12.0 },
    { type: 'bus', from: 'W2_ROUNDABOUT', to: 'W2_N_TJUNC', t: 0.55, speed: 9.2 },
    { type: 'motorcycle', from: 'N_CENTER_TJUNC', to: 'N_WEST_TJUNC', t: 0.4, speed: 15.5 },
    { type: 'truck', from: 'E_HWY_S', to: 'SE_TJUNC', t: 0.5, speed: 10.5 },
    { type: 'car', from: 'ME_4WAY', to: 'NE_4WAY', t: 0.35, speed: 12.8 },
    { type: 'car', from: 'N_EAST_TJUNC', to: 'E_HWY_TOP', t: 0.45, speed: 13.2 },
    { type: 'emergency', from: 'S_TJUNC', to: 'SE_TJUNC', t: 0.55, speed: 14.0 },
    { type: 'car', from: 'W2_NW_CORNER', to: 'N_WEST_TJUNC', t: 0.4, speed: 12.0 },
    { type: 'motorcycle', from: 'ROUNDABOUT', to: 'NE_4WAY', t: 0.55, speed: 14.8 },
    { type: 'truck', from: 'E_HWY_N', to: 'E_HWY_TOP', t: 0.5, speed: 10.2 },
    { type: 'car', from: 'MW_4WAY', to: 'NW_4WAY', t: 0.6, speed: 12.2 },
    { type: 'bus', from: 'CENTER_4WAY', to: 'ME_4WAY', t: 0.5, speed: 9.6 },
    { type: 'car', from: 'E_HWY_N', to: 'AIRPORT_TERM', t: 0.4, speed: 12.5 },
    { type: 'pickup', from: 'W2_ROUNDABOUT', to: 'C_GREENVALE', t: 0.48, speed: 13.0 },
    { type: 'pickup', from: 'C_GREENVALE', to: 'C_MILLSTONE', t: 0.4, speed: 12.2 },
    { type: 'tractor', from: 'C_WEST_OAK', to: 'C_GREENVALE', t: 0.55, speed: 7.4 },
    { type: 'pickup', from: 'C_SOUTH_W2', to: 'C_SOUTH_SUN', t: 0.5, speed: 12.5 },
    { type: 'car', from: 'C_MILLSTONE', to: 'W2_NW_CORNER', t: 0.45, speed: 12.4 },
    { type: 'tractor', from: 'C_GREENVALE', to: 'C_SOUTH_SUN', t: 0.35, speed: 6.8 },
  ];

  const getHalfLen = (t: TrafficVehicleType) =>
    t === 'bus'
      ? 4.3
      : t === 'truck'
        ? 3.8
        : t === 'pickup'
          ? 2.65
          : t === 'tractor'
            ? 2.1
            : t === 'motorcycle'
              ? 1.1
              : 2.2;

  const agents: TrafficAgent[] = spawnSpecs.map((sp, idx) => {
    const fromNode = NODE_MAP.get(sp.from)!;
    const toNode = NODE_MAP.get(sp.to)!;
    const laneOffset = sp.type === 'motorcycle' ? 2.6 : 3.8;
    const startPt = laneTargetForEdge(toNode, fromNode, -laneOffset);
    const endPt = laneTargetForEdge(fromNode, toNode, laneOffset);
    const x = startPt.x + (endPt.x - startPt.x) * sp.t;
    const z = startPt.z + (endPt.z - startPt.z) * sp.t;
    const yaw = Math.atan2(-(endPt.x - startPt.x), -(endPt.z - startPt.z));

    const built = vehicleBuilder.buildVehicle(sp.type, idx);
    built.mesh.position.set(x, groundHeightAt(x, z), z);
    built.mesh.rotation.y = yaw;
    group.add(built.mesh);

    return {
      id: `traffic_${sp.type}_${idx}`,
      type: sp.type,
      label: labelForTrafficType(sp.type),
      mesh: built.mesh,
      sprungBody: built.sprungBody,
      wheelSteerPivots: built.wheelSteerPivots,
      wheelSpinGroups: built.wheelSpinGroups,
      wheelRadii: built.wheelRadii,
      riderGroup: built.riderGroup,
      x,
      z,
      yaw,
      speed: sp.speed * 0.7,
      maxSpeed: sp.speed,
      halfLen: getHalfLen(sp.type),
      fromNode,
      toNode,
      laneOffset,
      targetX: endPt.x,
      targetZ: endPt.z,
      phase: 'segment',
      isPlayerControlled: false,
      isParked: false,
    };
  });

  // Spawn 2 animated working tractors plowing back-and-forth in the countryside farm plots
  const dummyNode = NODE_MAP.get('C_GREENVALE')!;
  const fieldTractorSpecs = [
    {
      id: 'field_tractor_sunfield',
      waypoints: [
        { x: -376, z: 72 },
        { x: -376, z: 136 },
        { x: -350, z: 136 },
        { x: -350, z: 72 },
      ],
    },
    {
      id: 'field_tractor_oakridge',
      waypoints: [
        { x: -492, z: -20 },
        { x: -492, z: 42 },
        { x: -454, z: 42 },
        { x: -454, z: -20 },
      ],
    },
  ];
  fieldTractorSpecs.forEach((ft, idx) => {
    const p0 = ft.waypoints[0];
    const p1 = ft.waypoints[1];
    const yaw = Math.atan2(-(p1.x - p0.x), -(p1.z - p0.z));
    const built = vehicleBuilder.buildVehicle('tractor', idx);
    built.mesh.position.set(p0.x, 0, p0.z);
    built.mesh.rotation.y = yaw;
    group.add(built.mesh);
    agents.push({
      id: ft.id,
      type: 'tractor',
      label: 'Working Farm Tractor',
      mesh: built.mesh,
      sprungBody: built.sprungBody,
      wheelSteerPivots: built.wheelSteerPivots,
      wheelSpinGroups: built.wheelSpinGroups,
      wheelRadii: built.wheelRadii,
      x: p0.x,
      z: p0.z,
      yaw,
      speed: 4.8,
      maxSpeed: 5.2,
      halfLen: 2.1,
      fromNode: dummyNode,
      toNode: dummyNode,
      laneOffset: 0,
      targetX: p1.x,
      targetZ: p1.z,
      phase: 'segment',
      isPlayerControlled: false,
      isParked: false,
      fieldLoop: {
        waypoints: ft.waypoints,
        wpIdx: 1,
      },
    });
  });

  // Add parked showcase vehicles in Downtown & Countryside Farms/Villages
  const parkedSpecs: {
    id: string;
    type: Exclude<TrafficVehicleType, 'emergency'>;
    x: number;
    z: number;
    yaw: number;
    colorIdx: number;
  }[] = [
    { id: 'parked_car_downtown', type: 'car', x: -5.4, z: -15.5, yaw: 0, colorIdx: 0 },
    { id: 'parked_moto_downtown', type: 'motorcycle', x: 5.2, z: -10.5, yaw: 0, colorIdx: 1 },
    { id: 'parked_bus_downtown', type: 'bus', x: 5.4, z: -27.0, yaw: 0, colorIdx: 2 },
    { id: 'parked_truck_downtown', type: 'truck', x: -5.4, z: 22.0, yaw: Math.PI, colorIdx: 3 },
    { id: 'parked_pickup_westgate', type: 'pickup', x: -206, z: -38, yaw: Math.PI / 2, colorIdx: 0 },
    { id: 'parked_pickup_greenvale', type: 'pickup', x: -378, z: -55, yaw: Math.PI, colorIdx: 2 },
    { id: 'parked_tractor_oakridge', type: 'tractor', x: -486, z: -64, yaw: -Math.PI / 2, colorIdx: 0 },
    { id: 'parked_tractor_sunfield', type: 'tractor', x: -406, z: 148, yaw: 0, colorIdx: 1 },
  ];

  parkedSpecs.forEach((pk) => {
    const built = vehicleBuilder.buildVehicle(pk.type, pk.colorIdx);
    if (built.riderGroup) built.riderGroup.visible = false;
    built.mesh.position.set(pk.x, groundHeightAt(pk.x, pk.z), pk.z);
    built.mesh.rotation.y = pk.yaw;
    group.add(built.mesh);

    agents.push({
      id: pk.id,
      type: pk.type,
      label: labelForTrafficType(pk.type),
      mesh: built.mesh,
      sprungBody: built.sprungBody,
      wheelSteerPivots: built.wheelSteerPivots,
      wheelSpinGroups: built.wheelSpinGroups,
      wheelRadii: built.wheelRadii,
      riderGroup: built.riderGroup,
      x: pk.x,
      z: pk.z,
      yaw: pk.yaw,
      speed: 0,
      maxSpeed:
        pk.type === 'bus'
          ? 16
          : pk.type === 'truck'
            ? 17
            : pk.type === 'tractor'
              ? 12
              : pk.type === 'pickup'
                ? 22
                : pk.type === 'motorcycle'
                  ? 28
                  : 23,
      halfLen: getHalfLen(pk.type),
      fromNode: dummyNode,
      toNode: dummyNode,
      laneOffset: 3.8,
      targetX: pk.x,
      targetZ: pk.z,
      phase: 'segment',
      isPlayerControlled: false,
      isParked: true,
    });
  });

  function pickNextNode(prev: RoadNode, curr: RoadNode): RoadNode {
    const neighbors = GRAPH_NEIGHBORS.get(curr.id) ?? [];
    const candidates = neighbors.filter((n) => n.id !== prev.id);
    if (candidates.length === 0) return prev;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  return {
    group,
    update: (elapsedTime: number, dt: number, playerX: number, playerZ: number) => {
      // Flash emergency vehicle beacons
      const flash = Math.sin(elapsedTime * 16) > 0;
      beaconRedMat.emissiveIntensity = flash ? 3.0 : 0.2;
      beaconBlueMat.emissiveIntensity = flash ? 0.2 : 3.0;

      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        // Skip AI logic for player-controlled or parked vehicles
        if (a.isPlayerControlled || a.isParked) continue;

        // Field working farm tractor loop
        if (a.fieldLoop) {
          const wp = a.fieldLoop.waypoints[a.fieldLoop.wpIdx];
          const fdx = wp.x - a.x;
          const fdz = wp.z - a.z;
          const fDist = Math.hypot(fdx, fdz);
          if (fDist < 2.0) {
            a.fieldLoop.wpIdx = (a.fieldLoop.wpIdx + 1) % a.fieldLoop.waypoints.length;
          } else {
            const pDist = Math.hypot(playerX - a.x, playerZ - a.z);
            const targetSpd = pDist < 5.5 ? 0 : a.maxSpeed;
            a.speed = THREE.MathUtils.damp(a.speed, targetSpd, 4, dt);
            if (a.speed > 0.05) {
              const desiredYaw = Math.atan2(-fdx, -fdz);
              a.yaw = dampAngle(a.yaw, desiredYaw, 3.8, dt);
              const step = Math.min(fDist, a.speed * dt);
              a.x += -Math.sin(a.yaw) * step;
              a.z += -Math.cos(a.yaw) * step;
            }
          }
          a.mesh.position.set(a.x, groundHeightAt(a.x, a.z), a.z);
          a.mesh.rotation.set(0, a.yaw, 0, 'YXZ');
          for (let w = 0; w < a.wheelSpinGroups.length; w++) {
            const rad = a.wheelRadii[w] || 0.34;
            a.wheelSpinGroups[w].rotation.x += -(a.speed * dt) / rad;
          }
          continue;
        }

        const dx = a.targetX - a.x;
        const dz = a.targetZ - a.z;
        const distToTarget = Math.hypot(dx, dz);

        let desiredSpeed = a.maxSpeed;

        // 1) Check Traffic Signal when approaching signalized urban intersection/T-junction
        if (
          !a.toNode.isRural &&
          a.phase === 'segment' &&
          (a.toNode.kind === 'intersection' || a.toNode.kind === 'tjunction') &&
          distToTarget < 12.0 &&
          distToTarget > 1.2
        ) {
          const travelAxis: 'NS' | 'EW' =
            Math.abs(a.toNode.z - a.fromNode.z) > Math.abs(a.toNode.x - a.fromNode.x)
              ? 'NS'
              : 'EW';
          if (!isSignalGreen(travelAxis, elapsedTime)) {
            desiredSpeed = 0;
          }
        }

        // 2) Slow down gently around tight turns
        if (a.phase === 'turning') {
          desiredSpeed = Math.min(desiredSpeed, a.maxSpeed * 0.65);
        }

        // 3) Vehicle-to-vehicle & player collision avoidance ahead
        const fwdX = -Math.sin(a.yaw);
        const fwdZ = -Math.cos(a.yaw);

        const pdx = playerX - a.x;
        const pdz = playerZ - a.z;
        const pDist = Math.hypot(pdx, pdz);
        if (pDist < 12.5 + a.halfLen && pDist > 0.1) {
          const dot = (pdx * fwdX + pdz * fwdZ) / pDist;
          if (dot > 0.78) {
            desiredSpeed = Math.min(desiredSpeed, pDist < 6.5 + a.halfLen ? 0 : a.maxSpeed * 0.35);
          }
        }

        for (let j = 0; j < agents.length; j++) {
          if (i === j) continue;
          const b = agents[j];
          const vdx = b.x - a.x;
          const vdz = b.z - a.z;
          const vDist = Math.hypot(vdx, vdz);
          const safeGap = a.halfLen + b.halfLen + 4.5;
          if (vDist < safeGap + 6.0 && vDist > 0.1) {
            const dot = (vdx * fwdX + vdz * fwdZ) / vDist;
            if (dot > 0.82) {
              if (vDist < safeGap) {
                desiredSpeed = 0;
              } else {
                desiredSpeed = Math.min(desiredSpeed, b.speed * 0.9);
              }
            }
          }
        }

        const accelRate = desiredSpeed < a.speed ? 14.0 : 6.5;
        if (a.speed < desiredSpeed) {
          a.speed = Math.min(desiredSpeed, a.speed + accelRate * dt);
        } else {
          a.speed = Math.max(desiredSpeed, a.speed - accelRate * dt);
        }

        if (distToTarget < 2.4) {
          if (a.phase === 'segment') {
            const nextNode = pickNextNode(a.fromNode, a.toNode);
            a.fromNode = a.toNode;
            a.toNode = nextNode;
            const nextEntry = laneTargetForEdge(a.fromNode, a.toNode, a.laneOffset);
            const dirX = a.toNode.x - a.fromNode.x;
            const dirZ = a.toNode.z - a.fromNode.z;
            const len = Math.max(Math.hypot(dirX, dirZ), 0.001);
            const ux = dirX / len;
            const uz = dirZ / len;
            const exitDist = a.fromNode.kind === 'roundabout' ? 21.0 : 9.5;
            a.targetX = a.fromNode.x + ux * exitDist - uz * a.laneOffset;
            a.targetZ = a.fromNode.z + uz * exitDist + ux * a.laneOffset;
            if (Math.hypot(a.targetX - a.x, a.targetZ - a.z) < 3.0) {
              a.targetX = nextEntry.x;
              a.targetZ = nextEntry.z;
              a.phase = 'segment';
            } else {
              a.phase = 'turning';
            }
          } else {
            const endPt = laneTargetForEdge(a.fromNode, a.toNode, a.laneOffset);
            a.targetX = endPt.x;
            a.targetZ = endPt.z;
            a.phase = 'segment';
          }
        } else if (a.speed > 0.02) {
          const desiredYaw = Math.atan2(-dx, -dz);
          a.yaw = dampAngle(a.yaw, desiredYaw, 5.5, dt);
          const moveStep = Math.min(distToTarget, a.speed * dt);
          a.x += -Math.sin(a.yaw) * moveStep;
          a.z += -Math.cos(a.yaw) * moveStep;
        }

        const gy = groundHeightAt(a.x, a.z);
        const pitch = groundPitchAt(a.x, a.z, a.yaw);
        a.mesh.position.set(a.x, gy, a.z);
        a.mesh.rotation.set(pitch, a.yaw, 0, 'YXZ');

        for (let w = 0; w < a.wheelSpinGroups.length; w++) {
          const rad = a.wheelRadii[w] || 0.34;
          a.wheelSpinGroups[w].rotation.x += -(a.speed * dt) / rad;
        }
      }
    },
    resolvePlayerCollision: (px: number, pz: number, speed: number, activeVehicleId?: string) => {
      let x = px;
      let z = pz;
      let outSpeed = speed;
      const playerRadius = 1.45;

      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a.id === activeVehicleId || a.isPlayerControlled) continue;
        const dx = x - a.x;
        const dz = z - a.z;
        const minSep = playerRadius + (a.type === 'bus' || a.type === 'truck' ? 2.1 : 1.5);
        const dist = Math.hypot(dx, dz);
        if (dist < minSep && dist > 0.001) {
          const push = minSep - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
          outSpeed *= 0.72;
        }
      }
      return { x, z, speed: outSpeed };
    },
    findClosestEnterableVehicle: (px: number, pz: number, maxDistance: number) => {
      let best: EnterableVehicleCandidate | null = null;
      let bestDist = maxDistance;

      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a.type === 'emergency' || a.isPlayerControlled) continue;
        // Account for vehicle length when walking up alongside buses/trucks
        const centerDist = Math.hypot(a.x - px, a.z - pz);
        const effectiveDist = Math.max(0, centerDist - Math.max(0, a.halfLen - 2.0));
        if (effectiveDist <= bestDist) {
          bestDist = effectiveDist;
          best = {
            id: a.id,
            kind: a.type as VehicleKind,
            label: a.label,
            x: a.x,
            z: a.z,
            yaw: a.yaw,
            halfLen: a.halfLen,
            distance: effectiveDist,
          };
        }
      }
      return best;
    },
    claimVehicle: (id: string) => {
      const a = agents.find((ag) => ag.id === id);
      if (!a || a.type === 'emergency') return null;
      a.isPlayerControlled = true;
      a.isParked = true;
      a.fieldLoop = undefined;
      a.speed = 0;
      if (a.riderGroup) a.riderGroup.visible = false;
      return {
        id: a.id,
        kind: a.type as VehicleKind,
        label: a.label,
        mesh: a.mesh,
        x: a.x,
        z: a.z,
        yaw: a.yaw,
      };
    },
    releaseVehicle: (id: string, x: number, z: number, yaw: number) => {
      const a = agents.find((ag) => ag.id === id);
      if (!a) return;
      a.isPlayerControlled = false;
      a.isParked = true;
      a.speed = 0;
      a.x = x;
      a.z = z;
      a.yaw = yaw;
      if (a.riderGroup) a.riderGroup.visible = false;
      const gy = groundHeightAt(x, z);
      const pitch = groundPitchAt(x, z, yaw);
      a.mesh.position.set(x, gy, z);
      a.mesh.rotation.set(pitch, yaw, 0, 'YXZ');
    },
    updateClaimedVehicle: (
      id: string,
      x: number,
      y: number,
      z: number,
      pitch: number,
      yaw: number,
      speed: number,
      dt: number,
      steerAngle = 0
    ) => {
      const a = agents.find((ag) => ag.id === id);
      if (!a) return;
      a.x = x;
      a.z = z;
      a.yaw = yaw;
      a.speed = speed;
      a.mesh.position.set(x, y, z);
      a.mesh.rotation.set(pitch, yaw, 0, 'YXZ');
      // Steer front knuckles & roll sprung suspension slightly
      for (let s = 0; s < a.wheelSteerPivots.length; s++) {
        a.wheelSteerPivots[s].rotation.y = steerAngle;
      }
      a.sprungBody.rotation.z = THREE.MathUtils.damp(
        a.sprungBody.rotation.z,
        -steerAngle * Math.min(1, Math.abs(speed) / 18) * 0.14,
        8,
        dt
      );
      for (let w = 0; w < a.wheelSpinGroups.length; w++) {
        const rad = a.wheelRadii[w] || 0.34;
        a.wheelSpinGroups[w].rotation.x += -(speed * dt) / rad;
      }
    },
    getVehicleTypesSummary: () => {
      const kinds = new Set<VehicleKind>();
      agents.forEach((a) => {
        if (a.type !== 'emergency') kinds.add(a.type as VehicleKind);
      });
      return Array.from(kinds);
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
