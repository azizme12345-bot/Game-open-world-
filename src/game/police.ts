import * as THREE from 'three';
import { createSkeletalHumanCharacter, type SkeletalHumanHandle } from './humanCharacter';
import {
  groundHeightAt,
  groundPitchAt,
  NODE_MAP,
  resolveRoadPosition,
  resolveWalkPosition,
  ROAD_NODES,
  ROAD_SEGMENTS,
  type RoadNode,
} from './roadNetwork';
import { cityAudio } from './sound';
import type { ArrestTicket, PoliceHudState } from './types';
import { createVehicleBuilder } from './vehicleFactory';

export interface PoliceSystemHandle {
  group: THREE.Group;
  update: (
    elapsedTime: number,
    dt: number,
    playerX: number,
    playerZ: number,
    playerSpeed: number,
    isPlayerOnFoot: boolean,
    hitPolice: boolean,
    hitPedestrian: boolean
  ) => { forceStopPlayer: boolean; hudState: PoliceHudState };
  resolvePlayerCollision: (
    px: number,
    pz: number,
    speed: number
  ) => { x: number; z: number; speed: number; hitPolice: boolean };
  registerTheftViolation: () => void;
  acknowledgeArrest: () => void;
  getHudState: () => PoliceHudState;
  dispose: () => void;
}

type OfficerBehavior = 'in_car' | 'exiting_car' | 'on_foot_chase' | 'arresting' | 'returning_to_car';

interface PoliceOfficerRig {
  group: THREE.Group;
  human: SkeletalHumanHandle;
  x: number;
  z: number;
  yaw: number;
  exitTimer: number;
}

interface PoliceUnit {
  mesh: THREE.Group;
  wheelSpinGroups: THREE.Group[];
  wheelRadii: number[];
  x: number;
  z: number;
  yaw: number;
  speed: number;
  fromNode: RoadNode;
  toNode: RoadNode;
  pursuing: boolean;
  officerState: OfficerBehavior;
  officer: PoliceOfficerRig;
}

// Build road graph neighbors for police pathfinding
const POLICE_GRAPH = new Map<string, RoadNode[]>();
ROAD_NODES.forEach((n) => POLICE_GRAPH.set(n.id, []));
ROAD_SEGMENTS.forEach((seg) => {
  const a = NODE_MAP.get(seg.a);
  const b = NODE_MAP.get(seg.b);
  if (a && b) {
    POLICE_GRAPH.get(a.id)?.push(b);
    POLICE_GRAPH.get(b.id)?.push(a);
  }
});

function pickClosestNode(x: number, z: number): RoadNode {
  let best = ROAD_NODES[0];
  let bestD = Infinity;
  for (const n of ROAD_NODES) {
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function pickPursuitNextNode(prev: RoadNode, curr: RoadNode, targetX: number, targetZ: number): RoadNode {
  const neighbors = POLICE_GRAPH.get(curr.id) ?? [];
  const candidates = neighbors.filter((n) => n.id !== prev.id);
  const pool = candidates.length > 0 ? candidates : neighbors;
  if (pool.length === 0) return prev;

  let best = pool[0];
  let bestDist = Infinity;
  for (const cand of pool) {
    const d = Math.hypot(cand.x - targetX, cand.z - targetZ);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best;
}

function pickPatrolNextNode(prev: RoadNode, curr: RoadNode): RoadNode {
  const neighbors = POLICE_GRAPH.get(curr.id) ?? [];
  const candidates = neighbors.filter((n) => n.id !== prev.id);
  const pool = candidates.length > 0 ? candidates : neighbors;
  if (pool.length === 0) return prev;
  return pool[Math.floor(Math.random() * pool.length)];
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export function createPoliceSystem(): PoliceSystemHandle {
  const group = new THREE.Group();
  group.name = 'CityPoliceUnits';

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

  // Emergency Siren Beacon Materials (shared with Police Interceptor models)
  const sirenRedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xff2233, emissive: 0xff1122, emissiveIntensity: 0.4 })
  );
  const sirenBlueMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x2288ff, emissive: 0x1177ff, emissiveIntensity: 0.4 })
  );

  const cruiserBuilder = createVehicleBuilder({
    trackGeo,
    trackMat,
    beaconRedMat: sirenRedMat,
    beaconBlueMat: sirenBlueMat,
  });

  const buildOfficerRig = (idx: number): PoliceOfficerRig => {
    const skinTones = [0xf3cbb0, 0xc88b5d, 0x6b3e26];
    const human = createSkeletalHumanCharacter({
      role: 'police',
      skinColor: skinTones[idx % skinTones.length],
      hairColor: 0x1e140e,
      jacketColor: 0x1e3a8a,
      pantsColor: 0x0f172a,
    });
    human.group.visible = false;
    return {
      group: human.group,
      human,
      x: 0,
      z: 0,
      yaw: 0,
      exitTimer: 0,
    };
  };

  // Single dynamic siren PointLight attached to the nearest pursuing cruiser
  const sirenGlow = new THREE.PointLight(0x3b82f6, 0, 26, 1.6);
  group.add(sirenGlow);

  // Spawn 3 Police Interceptors stationed around the city
  const spawns = [
    { from: 'NW_4WAY', to: 'N_WEST_TJUNC' }, // Police HQ corridor
    { from: 'ME_4WAY', to: 'CENTER_4WAY' }, // Midtown East patrol
    { from: 'SW_TJUNC', to: 'S_TJUNC' }, // South Boulevard patrol
  ];

  const units: PoliceUnit[] = spawns.map((sp, idx) => {
    const fromNode = NODE_MAP.get(sp.from)!;
    const toNode = NODE_MAP.get(sp.to)!;
    const x = (fromNode.x + toNode.x) * 0.5;
    const z = (fromNode.z + toNode.z) * 0.5;
    const yaw = Math.atan2(-(toNode.x - fromNode.x), -(toNode.z - fromNode.z));
    const built = cruiserBuilder.buildVehicle('emergency', idx);
    built.mesh.position.set(x, groundHeightAt(x, z), z);
    built.mesh.rotation.y = yaw;
    group.add(built.mesh);

    const officer = buildOfficerRig(idx);
    group.add(officer.group);

    return {
      mesh: built.mesh,
      wheelSpinGroups: built.wheelSpinGroups,
      wheelRadii: built.wheelRadii,
      x,
      z,
      yaw,
      speed: 10,
      fromNode,
      toNode,
      pursuing: false,
      officerState: 'in_car',
      officer,
    };
  });

  // Law, Pending Major Crimes, & Arrest State
  let wantedLevel = 0;
  let status: PoliceHudState['status'] = 'patrol';
  let escapeTimer = 0;
  let escapedBannerTimer = 0;

  let pendingViolations: string[] = [];
  const registeredViolationKeys = new Set<string>();
  let activeTicket: ArrestTicket | null = null;
  let ticketCounter = 0;

  let policeHitCooldown = 0;
  let pedestrianHitCooldown = 0;
  let theftCooldown = 0;

  const ESCAPE_DURATION = 9.0;

  const registerPendingViolation = (dedupKey: string, reason: string) => {
    if (status === 'arrested') return;
    if (registeredViolationKeys.has(dedupKey)) return;

    registeredViolationKeys.add(dedupKey);
    pendingViolations.push(reason);
    wantedLevel = Math.min(3, Math.max(1, pendingViolations.length));
    escapeTimer = 0;
    if (status !== 'officer_approach') {
      status = 'pursuit';
    }
    cityAudio.playViolationChime();
  };

  const animateOfficer = (
    off: PoliceOfficerRig,
    elapsedTime: number,
    dt: number,
    movingSpeed: number,
    arresting: boolean
  ) => {
    off.human.update(
      elapsedTime,
      dt,
      movingSpeed,
      movingSpeed > 5.2,
      0,
      arresting ? 'arrested' : 'locomotion',
      0
    );
  };

  const completePhysicalArrest = (arrestingUnit: PoliceUnit) => {
    if (status === 'arrested') return;
    const items = pendingViolations.length > 0 ? [...pendingViolations] : ['Evading Police'];

    ticketCounter += 1;
    activeTicket = {
      id: ticketCounter,
      violations: items,
    };

    pendingViolations = [];
    registeredViolationKeys.clear();
    wantedLevel = 0;
    escapeTimer = 0;
    status = 'arrested';
    arrestingUnit.officerState = 'arresting';
  };

  const getHudState = (): PoliceHudState => ({
    wantedLevel,
    status,
    pendingReasons: [...pendingViolations],
    activeTicket,
  });

  const acknowledgeArrest = () => {
    if (status !== 'arrested') return;
    activeTicket = null;
    pendingViolations = [];
    registeredViolationKeys.clear();
    wantedLevel = 0;
    escapeTimer = 0;
    status = 'patrol';
    policeHitCooldown = 4.0;
    pedestrianHitCooldown = 4.0;
    theftCooldown = 3.0;

    // Return officers back inside their cruisers & send cruisers back onto patrol
    for (const u of units) {
      u.officerState = 'in_car';
      u.officer.group.visible = false;
      u.pursuing = false;
      u.fromNode = pickClosestNode(u.x, u.z);
      u.toNode = pickPatrolNextNode(u.fromNode, u.fromNode);
      u.speed = 9;
    }
  };

  return {
    group,
    getHudState,
    acknowledgeArrest,
    registerTheftViolation: () => {
      if (theftCooldown > 0 || status === 'arrested') return;
      theftCooldown = 6.0;
      registerPendingViolation(`theft_${Math.floor(performance.now() / 6000)}`, 'Vehicle Theft');
    },
    update: (
      elapsedTime: number,
      dt: number,
      playerX: number,
      playerZ: number,
      playerSpeed: number,
      isPlayerOnFoot: boolean,
      hitPolice: boolean,
      hitPedestrian: boolean
    ) => {
      let forceStopPlayer = false;

      if (policeHitCooldown > 0) policeHitCooldown -= dt;
      if (pedestrianHitCooldown > 0) pedestrianHitCooldown -= dt;
      if (theftCooldown > 0) theftCooldown -= dt;

      if (status === 'escaped') {
        escapedBannerTimer -= dt;
        if (escapedBannerTimer <= 0) {
          status = 'patrol';
        }
      }

      // 1) Detect Major Crimes Only (Hitting a Police Car, Hitting a Pedestrian > 15 km/h; Vehicle Theft is via registerTheftViolation)
      if (status !== 'arrested' && !isPlayerOnFoot) {
        if (hitPolice && policeHitCooldown <= 0) {
          policeHitCooldown = 6.0;
          registerPendingViolation(`police_hit_${Math.floor(elapsedTime / 6)}`, 'Hit Police Car');
        }
        if (hitPedestrian && Math.abs(playerSpeed) * 3.6 > 15 && pedestrianHitCooldown <= 0) {
          pedestrianHitCooldown = 6.0;
          registerPendingViolation(`ped_hit_${Math.floor(elapsedTime / 6)}`, 'Hit Pedestrian');
        }
      }

      // 2) Update Police Cruisers & Animated On-Foot Police Officers
      const isPursuing = wantedLevel > 0 && status !== 'arrested';

      const sortedIndices = units
        .map((u, idx) => ({ idx, dist: Math.hypot(u.x - playerX, u.z - playerZ) }))
        .sort((a, b) => a.dist - b.dist);

      let nearestPursuitDist = Infinity;
      let nearestPursuitUnit: PoliceUnit | null = null;
      let anyOfficerApproaching = false;

      sortedIndices.forEach(({ idx, dist }, rank) => {
        const u = units[idx];
        u.pursuing = isPursuing && rank < Math.max(1, wantedLevel);

        if (u.pursuing && dist < nearestPursuitDist) {
          nearestPursuitDist = dist;
          nearestPursuitUnit = u;
        }

        // Handle frozen arrest tableau while arrest ticket modal is open
        if (status === 'arrested') {
          u.speed = 0;
          if (u.officerState === 'arresting') {
            const dx = playerX - u.officer.x;
            const dz = playerZ - u.officer.z;
            u.officer.yaw = dampAngle(u.officer.yaw, Math.atan2(-dx, -dz), 10, dt);
            u.officer.group.visible = true;
            u.officer.group.position.set(u.officer.x, groundHeightAt(u.officer.x, u.officer.z), u.officer.z);
            u.officer.group.rotation.y = u.officer.yaw;
            animateOfficer(u.officer, elapsedTime, dt, 0, true);
          }
          return;
        }

        // Handle Officer on-foot state machine
        if (u.officerState === 'exiting_car') {
          u.speed = THREE.MathUtils.damp(u.speed, 0, 10, dt);
          u.officer.exitTimer += dt;
          const leftX = -Math.cos(u.yaw);
          const leftZ = Math.sin(u.yaw);
          const t = Math.min(1, u.officer.exitTimer / 0.45);
          u.officer.x = u.x + leftX * (0.45 + t * 1.15);
          u.officer.z = u.z + leftZ * (0.45 + t * 1.15);
          u.officer.yaw = Math.atan2(-(playerX - u.officer.x), -(playerZ - u.officer.z));
          u.officer.group.visible = true;
          u.officer.group.position.set(u.officer.x, groundHeightAt(u.officer.x, u.officer.z), u.officer.z);
          u.officer.group.rotation.y = u.officer.yaw;
          animateOfficer(u.officer, elapsedTime, dt, 2.5, false);
          anyOfficerApproaching = true;

          if (u.officer.exitTimer >= 0.45) {
            u.officerState = 'on_foot_chase';
          }
        } else if (u.officerState === 'on_foot_chase') {
          u.speed = 0;
          anyOfficerApproaching = true;
          const dx = playerX - u.officer.x;
          const dz = playerZ - u.officer.z;
          const offDist = Math.hypot(dx, dz);

          // If player drove/ran far away or sped off (> 22m), officer runs back to cruiser to chase by car
          if (!isPursuing || offDist > 22.0 || (!isPlayerOnFoot && Math.abs(playerSpeed) > 10.5)) {
            u.officerState = 'returning_to_car';
          } else if (offDist <= 1.85) {
            // Physically caught the player -> ARREST & ISSUE TICKET ONCE!
            forceStopPlayer = true;
            completePhysicalArrest(u);
          } else {
            const desiredYaw = Math.atan2(-dx, -dz);
            u.officer.yaw = dampAngle(u.officer.yaw, desiredYaw, 9, dt);
            const runSpeed = offDist > 6 ? 7.2 : 5.4;
            const step = Math.min(offDist - 1.5, runSpeed * dt);
            const nextPos = resolveWalkPosition(
              u.officer.x + (-Math.sin(u.officer.yaw)) * Math.max(0, step),
              u.officer.z + (-Math.cos(u.officer.yaw)) * Math.max(0, step)
            );
            u.officer.x = nextPos.x;
            u.officer.z = nextPos.z;
            u.officer.group.visible = true;
            u.officer.group.position.set(u.officer.x, groundHeightAt(u.officer.x, u.officer.z), u.officer.z);
            u.officer.group.rotation.y = u.officer.yaw;
            animateOfficer(u.officer, elapsedTime, dt, runSpeed, false);
          }
        } else if (u.officerState === 'returning_to_car') {
          u.speed = 0;
          const doorX = u.x - Math.cos(u.yaw) * 1.4;
          const doorZ = u.z + Math.sin(u.yaw) * 1.4;
          const dx = doorX - u.officer.x;
          const dz = doorZ - u.officer.z;
          const dDoor = Math.hypot(dx, dz);
          if (dDoor < 0.75) {
            u.officerState = 'in_car';
            u.officer.group.visible = false;
          } else {
            const desiredYaw = Math.atan2(-dx, -dz);
            u.officer.yaw = dampAngle(u.officer.yaw, desiredYaw, 9, dt);
            const step = Math.min(dDoor, 6.8 * dt);
            u.officer.x += (-Math.sin(u.officer.yaw)) * step;
            u.officer.z += (-Math.cos(u.officer.yaw)) * step;
            u.officer.group.visible = true;
            u.officer.group.position.set(u.officer.x, groundHeightAt(u.officer.x, u.officer.z), u.officer.z);
            u.officer.group.rotation.y = u.officer.yaw;
            animateOfficer(u.officer, elapsedTime, dt, 6.8, false);
          }
        } else {
          // Officer is inside cruiser ('in_car') -> drive patrol or pursuit
          u.officer.group.visible = false;

          if (u.pursuing) {
            const shouldStopAndDeploy =
              rank === 0 &&
              dist < 13.5 &&
              (isPlayerOnFoot || Math.abs(playerSpeed) < 4.5);

            if (shouldStopAndDeploy) {
              u.speed = THREE.MathUtils.damp(u.speed, 0, 9, dt);
              if (u.speed < 1.2) {
                u.speed = 0;
                u.officerState = 'exiting_car';
                u.officer.exitTimer = 0;
                anyOfficerApproaching = true;
              }
            } else {
              let targetX = u.toNode.x;
              let targetZ = u.toNode.z;

              if (dist < 48) {
                targetX = playerX;
                targetZ = playerZ;
              } else {
                const distToNode = Math.hypot(u.toNode.x - u.x, u.toNode.z - u.z);
                if (distToNode < 9.5) {
                  const nextN = pickPursuitNextNode(u.fromNode, u.toNode, playerX, playerZ);
                  u.fromNode = u.toNode;
                  u.toNode = nextN;
                }
                targetX = u.toNode.x;
                targetZ = u.toNode.z;
              }

              const dx = targetX - u.x;
              const dz = targetZ - u.z;
              const d = Math.max(Math.hypot(dx, dz), 0.001);
              const desiredYaw = Math.atan2(-dx, -dz);
              u.yaw = dampAngle(u.yaw, desiredYaw, 6.0, dt);

              const chaseMaxSpeed =
                dist < 12 ? Math.max(6.5, Math.abs(playerSpeed)) : 23.0 + wantedLevel * 1.6;
              u.speed = THREE.MathUtils.damp(u.speed, chaseMaxSpeed, 4.5, dt);

              if (dist > 6.5) {
                const step = Math.min(d, u.speed * dt);
                const rawX = u.x + (-Math.sin(u.yaw)) * step;
                const rawZ = u.z + (-Math.cos(u.yaw)) * step;
                const res = resolveRoadPosition(rawX, rawZ, u.speed);
                u.x = res.x;
                u.z = res.z;
              } else {
                u.speed *= 0.82;
              }
            }
          } else {
            // Calm city patrol along road graph
            const dx = u.toNode.x - u.x;
            const dz = u.toNode.z - u.z;
            const d = Math.hypot(dx, dz);
            if (d < 8.5) {
              const nextN = pickPatrolNextNode(u.fromNode, u.toNode);
              u.fromNode = u.toNode;
              u.toNode = nextN;
            } else {
              const desiredYaw = Math.atan2(-dx, -dz);
              u.yaw = dampAngle(u.yaw, desiredYaw, 4.5, dt);
              u.speed = THREE.MathUtils.damp(u.speed, 11.5, 3.5, dt);
              const step = Math.min(d, u.speed * dt);
              u.x += (-Math.sin(u.yaw)) * step;
              u.z += (-Math.cos(u.yaw)) * step;
            }
          }
        }

        const gy = groundHeightAt(u.x, u.z);
        const pitch = groundPitchAt(u.x, u.z, u.yaw);
        u.mesh.position.set(u.x, gy, u.z);
        u.mesh.rotation.set(pitch, u.yaw, 0, 'YXZ');

        for (let w = 0; w < u.wheelSpinGroups.length; w++) {
          const rad = u.wheelRadii[w] || 0.35;
          u.wheelSpinGroups[w].rotation.x += -(u.speed * dt) / rad;
        }
      });

      // 3) Flashing Siren Beacons & Dynamic Siren Light
      if (isPursuing || status === 'arrested') {
        const flash = Math.sin(elapsedTime * 18) > 0;
        sirenRedMat.emissiveIntensity = flash ? 3.5 : 0.25;
        sirenBlueMat.emissiveIntensity = flash ? 0.25 : 3.5;

        if (nearestPursuitUnit) {
          const nu = nearestPursuitUnit as PoliceUnit;
          sirenGlow.intensity = 4.5;
          sirenGlow.color.setHex(flash ? 0xff2244 : 0x2288ff);
          sirenGlow.position.set(nu.x, groundHeightAt(nu.x, nu.z) + 2.2, nu.z);
        }
      } else {
        sirenRedMat.emissiveIntensity = 0.35;
        sirenBlueMat.emissiveIntensity = 0.35;
        sirenGlow.intensity = 0;
      }

      // 4) Pursuit Outcome: Officer Approach vs Escape ($0 fine if escaped!)
      if (isPursuing && status !== 'arrested') {
        if (anyOfficerApproaching) {
          status = 'officer_approach';
          escapeTimer = 0;
        } else if (nearestPursuitDist > 78.0) {
          status = 'pursuit';
          escapeTimer += dt;
          if (escapeTimer >= ESCAPE_DURATION) {
            // Successfully escaped police -> clear pending violations with $0 fine!
            wantedLevel = 0;
            escapeTimer = 0;
            pendingViolations = [];
            registeredViolationKeys.clear();
            status = 'escaped';
            escapedBannerTimer = 2.8;
          }
        } else {
          status = 'pursuit';
          escapeTimer = Math.max(0, escapeTimer - dt * 0.8);
        }
      }

      return { forceStopPlayer, hudState: getHudState() };
    },
    resolvePlayerCollision: (px: number, pz: number, speed: number) => {
      let x = px;
      let z = pz;
      let outSpeed = speed;
      let hitPolice = false;
      const minSep = 2.8;

      for (const u of units) {
        const dx = x - u.x;
        const dz = z - u.z;
        const dist = Math.hypot(dx, dz);
        if (dist < minSep && dist > 0.001) {
          const push = minSep - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
          outSpeed *= 0.65;
          hitPolice = true;
        }
      }
      return { x, z, speed: outSpeed, hitPolice };
    },
    dispose: () => {
      units.forEach((u) => u.officer.human.dispose());
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
