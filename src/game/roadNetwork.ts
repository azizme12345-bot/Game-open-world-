import * as THREE from 'three';

export const ROAD_WIDTH = 16;
export const ROAD_HALF_W = ROAD_WIDTH / 2; // 8.0m
export const SIDEWALK_WIDTH = 5.4;
export const CELL_PITCH = 96;

export const RIVER_CENTER_X = 144;
export const RIVER_WIDTH = 34; // X = 127..161

export const CREEK_CENTER_X = -296;
export const CREEK_WIDTH = 26; // Countryside Creek: X = -309..-283

export const ROUNDABOUT_CENTER = { x: 0, z: -144 };
export const ROUNDABOUT_2_CENTER = { x: -192, z: -48 };
export const ROUNDABOUT_INNER_R = 9.0;
export const ROUNDABOUT_OUTER_R = 22.0;

export type CardinalDir = 'N' | 'S' | 'E' | 'W';

export interface RoadNode {
  id: string;
  x: number;
  z: number;
  kind: 'intersection' | 'tjunction' | 'corner' | 'roundabout';
  connections: CardinalDir[];
  isRural?: boolean;
}

export interface RoadSegment {
  id: string;
  a: string;
  b: string;
  axis: 'NS' | 'EW';
  roadType: 'avenue' | 'highway' | 'bridge' | 'tunnel' | 'airport' | 'rural' | 'dirt' | 'creek_bridge';
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  startPos: number;
  endPos: number;
  length: number;
  centerX: number;
  centerZ: number;
}

export interface DrivableRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface LandmarkLocation {
  id: string;
  name: string;
  category:
    | 'downtown'
    | 'mall'
    | 'park'
    | 'hospital'
    | 'police'
    | 'fire'
    | 'gas'
    | 'parking'
    | 'residential'
    | 'airport'
    | 'bridge'
    | 'tunnel'
    | 'village'
    | 'farm';
  x: number;
  z: number;
  roadX: number; // Nearest drivable road point for GPS destination
  roadZ: number;
  color: string;
}

export interface FarmPlotSpec {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  crop: 'wheat' | 'pasture' | 'plowed' | 'orchard';
}

export const ROAD_NODES: RoadNode[] = [
  // --- CITY CORE ---
  // Row Z = +48 (Southern Boulevard + Tunnel Corridor)
  { id: 'W2_S_CORNER', x: -192, z: 48, kind: 'intersection', connections: ['N', 'S', 'E'] },
  { id: 'SW_TJUNC', x: -96, z: 48, kind: 'tjunction', connections: ['N', 'W', 'E'] },
  { id: 'S_TJUNC', x: 0, z: 48, kind: 'intersection', connections: ['N', 'S', 'W', 'E'] },
  { id: 'SE_TJUNC', x: 96, z: 48, kind: 'tjunction', connections: ['N', 'W', 'E'] },
  { id: 'E_HWY_S', x: 192, z: 48, kind: 'corner', connections: ['N', 'W'] },

  // Row Z = -48 (Midtown Boulevard + River Bridge + Countryside Highway West)
  { id: 'W2_ROUNDABOUT', x: -192, z: -48, kind: 'roundabout', connections: ['N', 'S', 'W', 'E'] },
  { id: 'MW_4WAY', x: -96, z: -48, kind: 'intersection', connections: ['N', 'S', 'W', 'E'] },
  { id: 'CENTER_4WAY', x: 0, z: -48, kind: 'intersection', connections: ['N', 'S', 'W', 'E'] },
  { id: 'ME_4WAY', x: 96, z: -48, kind: 'intersection', connections: ['N', 'S', 'W', 'E'] },
  { id: 'E_HWY_M', x: 192, z: -48, kind: 'tjunction', connections: ['N', 'S', 'W'] },

  // Row Z = -144 (North Civic Boulevard + Central Roundabout + North Bridge + Airport Entry)
  { id: 'W2_N_TJUNC', x: -192, z: -144, kind: 'tjunction', connections: ['N', 'S', 'E'] },
  { id: 'NW_4WAY', x: -96, z: -144, kind: 'intersection', connections: ['N', 'S', 'W', 'E'] },
  { id: 'ROUNDABOUT', x: 0, z: -144, kind: 'roundabout', connections: ['N', 'S', 'W', 'E'] },
  { id: 'NE_4WAY', x: 96, z: -144, kind: 'intersection', connections: ['N', 'S', 'W', 'E'] },
  { id: 'E_HWY_N', x: 192, z: -144, kind: 'intersection', connections: ['N', 'S', 'W', 'E'] },
  { id: 'AIRPORT_TERM', x: 264, z: -144, kind: 'corner', connections: ['N', 'W'] },

  // Row Z = -240 (Northern Express Loop)
  { id: 'W2_NW_CORNER', x: -192, z: -240, kind: 'intersection', connections: ['S', 'W', 'E'] },
  { id: 'N_WEST_TJUNC', x: -96, z: -240, kind: 'tjunction', connections: ['S', 'W', 'E'] },
  { id: 'N_CENTER_TJUNC', x: 0, z: -240, kind: 'tjunction', connections: ['S', 'W', 'E'] },
  { id: 'N_EAST_TJUNC', x: 96, z: -240, kind: 'tjunction', connections: ['S', 'W', 'E'] },
  { id: 'E_HWY_TOP', x: 192, z: -240, kind: 'tjunction', connections: ['S', 'W', 'E'] },
  { id: 'AIRPORT_NORTH', x: 264, z: -240, kind: 'corner', connections: ['S', 'W'] },

  // --- COUNTRYSIDE & FARMING WORLD ---
  // Southern Valley Route (Z = +168)
  { id: 'C_SOUTH_OAK', x: -520, z: 168, kind: 'corner', connections: ['N', 'E'], isRural: true },
  { id: 'C_SOUTH_SUN', x: -392, z: 168, kind: 'intersection', connections: ['N', 'W', 'E'], isRural: true },
  { id: 'C_SOUTH_W2', x: -192, z: 168, kind: 'tjunction', connections: ['N', 'W', 'E'], isRural: true },
  { id: 'C_SOUTH_E', x: 0, z: 168, kind: 'corner', connections: ['N', 'W'], isRural: true },

  // Greenvale Village & Western Farm Highway (Z = -48)
  { id: 'C_WEST_OAK', x: -520, z: -48, kind: 'intersection', connections: ['N', 'S', 'E'], isRural: true },
  { id: 'C_GREENVALE', x: -392, z: -48, kind: 'intersection', connections: ['N', 'S', 'W', 'E'], isRural: true },

  // Millstone Village & Northern Orchard Highway (Z = -240)
  { id: 'C_NORTH_OAK', x: -520, z: -240, kind: 'corner', connections: ['S', 'E'], isRural: true },
  { id: 'C_MILLSTONE', x: -392, z: -240, kind: 'tjunction', connections: ['S', 'W', 'E'], isRural: true },
];

const RAW_SEGMENTS: {
  id: string;
  a: string;
  b: string;
  axis: 'NS' | 'EW';
  roadType: RoadSegment['roadType'];
}[] = [
  // North-South Avenues
  { id: 'NS_W2_1', a: 'W2_S_CORNER', b: 'W2_ROUNDABOUT', axis: 'NS', roadType: 'avenue' },
  { id: 'NS_W2_2', a: 'W2_ROUNDABOUT', b: 'W2_N_TJUNC', axis: 'NS', roadType: 'avenue' },
  { id: 'NS_W2_3', a: 'W2_N_TJUNC', b: 'W2_NW_CORNER', axis: 'NS', roadType: 'avenue' },

  { id: 'NS_W_1', a: 'SW_TJUNC', b: 'MW_4WAY', axis: 'NS', roadType: 'avenue' },
  { id: 'NS_W_2', a: 'MW_4WAY', b: 'NW_4WAY', axis: 'NS', roadType: 'avenue' },
  { id: 'NS_W_3', a: 'NW_4WAY', b: 'N_WEST_TJUNC', axis: 'NS', roadType: 'avenue' },

  { id: 'NS_C_1', a: 'S_TJUNC', b: 'CENTER_4WAY', axis: 'NS', roadType: 'avenue' },
  { id: 'NS_C_2', a: 'CENTER_4WAY', b: 'ROUNDABOUT', axis: 'NS', roadType: 'avenue' },
  { id: 'NS_C_3', a: 'ROUNDABOUT', b: 'N_CENTER_TJUNC', axis: 'NS', roadType: 'avenue' },

  { id: 'NS_E_1', a: 'SE_TJUNC', b: 'ME_4WAY', axis: 'NS', roadType: 'avenue' },
  { id: 'NS_E_2', a: 'ME_4WAY', b: 'NE_4WAY', axis: 'NS', roadType: 'avenue' },
  { id: 'NS_E_3', a: 'NE_4WAY', b: 'N_EAST_TJUNC', axis: 'NS', roadType: 'avenue' },

  { id: 'NS_HWY_1', a: 'E_HWY_S', b: 'E_HWY_M', axis: 'NS', roadType: 'highway' },
  { id: 'NS_HWY_2', a: 'E_HWY_M', b: 'E_HWY_N', axis: 'NS', roadType: 'highway' },
  { id: 'NS_HWY_3', a: 'E_HWY_N', b: 'E_HWY_TOP', axis: 'NS', roadType: 'highway' },

  { id: 'NS_AIR_RUNWAY', a: 'AIRPORT_TERM', b: 'AIRPORT_NORTH', axis: 'NS', roadType: 'airport' },

  // East-West Streets & River Crossings
  { id: 'EW_S_0', a: 'W2_S_CORNER', b: 'SW_TJUNC', axis: 'EW', roadType: 'avenue' },
  { id: 'EW_S_1', a: 'SW_TJUNC', b: 'S_TJUNC', axis: 'EW', roadType: 'avenue' },
  { id: 'EW_S_2', a: 'S_TJUNC', b: 'SE_TJUNC', axis: 'EW', roadType: 'avenue' },
  { id: 'EW_S_TUNNEL', a: 'SE_TJUNC', b: 'E_HWY_S', axis: 'EW', roadType: 'tunnel' },

  { id: 'EW_M_0', a: 'W2_ROUNDABOUT', b: 'MW_4WAY', axis: 'EW', roadType: 'avenue' },
  { id: 'EW_M_1', a: 'MW_4WAY', b: 'CENTER_4WAY', axis: 'EW', roadType: 'avenue' },
  { id: 'EW_M_2', a: 'CENTER_4WAY', b: 'ME_4WAY', axis: 'EW', roadType: 'avenue' },
  { id: 'EW_M_BRIDGE', a: 'ME_4WAY', b: 'E_HWY_M', axis: 'EW', roadType: 'bridge' },

  { id: 'EW_R_0', a: 'W2_N_TJUNC', b: 'NW_4WAY', axis: 'EW', roadType: 'avenue' },
  { id: 'EW_R_1', a: 'NW_4WAY', b: 'ROUNDABOUT', axis: 'EW', roadType: 'avenue' },
  { id: 'EW_R_2', a: 'ROUNDABOUT', b: 'NE_4WAY', axis: 'EW', roadType: 'avenue' },
  { id: 'EW_R_BRIDGE', a: 'NE_4WAY', b: 'E_HWY_N', axis: 'EW', roadType: 'bridge' },
  { id: 'EW_AIR_1', a: 'E_HWY_N', b: 'AIRPORT_TERM', axis: 'EW', roadType: 'airport' },

  { id: 'EW_N_0', a: 'W2_NW_CORNER', b: 'N_WEST_TJUNC', axis: 'EW', roadType: 'highway' },
  { id: 'EW_N_1', a: 'N_WEST_TJUNC', b: 'N_CENTER_TJUNC', axis: 'EW', roadType: 'highway' },
  { id: 'EW_N_2', a: 'N_CENTER_TJUNC', b: 'N_EAST_TJUNC', axis: 'EW', roadType: 'highway' },
  { id: 'EW_N_3', a: 'N_EAST_TJUNC', b: 'E_HWY_TOP', axis: 'EW', roadType: 'highway' },
  { id: 'EW_AIR_2', a: 'E_HWY_TOP', b: 'AIRPORT_NORTH', axis: 'EW', roadType: 'airport' },

  // --- COUNTRYSIDE HIGHWAYS, CREEK BRIDGE & FARM ROADS ---
  { id: 'EW_CREEK_BRIDGE', a: 'C_GREENVALE', b: 'W2_ROUNDABOUT', axis: 'EW', roadType: 'creek_bridge' },
  { id: 'EW_RURAL_M_W', a: 'C_WEST_OAK', b: 'C_GREENVALE', axis: 'EW', roadType: 'rural' },

  { id: 'NS_C_CITY_W2', a: 'W2_S_CORNER', b: 'C_SOUTH_W2', axis: 'NS', roadType: 'rural' },
  { id: 'NS_C_CITY_S', a: 'S_TJUNC', b: 'C_SOUTH_E', axis: 'NS', roadType: 'rural' },
  { id: 'EW_C_SOUTH_1', a: 'C_SOUTH_W2', b: 'C_SOUTH_E', axis: 'EW', roadType: 'rural' },
  { id: 'EW_C_SOUTH_2', a: 'C_SOUTH_SUN', b: 'C_SOUTH_W2', axis: 'EW', roadType: 'creek_bridge' },
  { id: 'EW_C_SOUTH_3', a: 'C_SOUTH_OAK', b: 'C_SOUTH_SUN', axis: 'EW', roadType: 'dirt' },

  { id: 'NS_GREEN_S', a: 'C_GREENVALE', b: 'C_SOUTH_SUN', axis: 'NS', roadType: 'dirt' },
  { id: 'NS_GREEN_N', a: 'C_MILLSTONE', b: 'C_GREENVALE', axis: 'NS', roadType: 'rural' },
  { id: 'NS_OAK_S', a: 'C_WEST_OAK', b: 'C_SOUTH_OAK', axis: 'NS', roadType: 'dirt' },
  { id: 'NS_OAK_N', a: 'C_NORTH_OAK', b: 'C_WEST_OAK', axis: 'NS', roadType: 'dirt' },

  { id: 'EW_C_NORTH_1', a: 'C_MILLSTONE', b: 'W2_NW_CORNER', axis: 'EW', roadType: 'creek_bridge' },
  { id: 'EW_C_NORTH_2', a: 'C_NORTH_OAK', b: 'C_MILLSTONE', axis: 'EW', roadType: 'dirt' },
];

export const NODE_MAP = new Map<string, RoadNode>(ROAD_NODES.map((n) => [n.id, n]));

function nodeTrimRadius(node: RoadNode): number {
  return node.kind === 'roundabout' ? 20.0 : ROAD_HALF_W;
}

export const ROAD_SEGMENTS: RoadSegment[] = RAW_SEGMENTS.map((raw) => {
  const nodeA = NODE_MAP.get(raw.a)!;
  const nodeB = NODE_MAP.get(raw.b)!;

  if (raw.axis === 'NS') {
    const minNode = nodeA.z < nodeB.z ? nodeA : nodeB;
    const maxNode = nodeA.z < nodeB.z ? nodeB : nodeA;
    const startZ = minNode.z + nodeTrimRadius(minNode);
    const endZ = maxNode.z - nodeTrimRadius(maxNode);
    return {
      ...raw,
      x1: nodeA.x,
      z1: nodeA.z,
      x2: nodeB.x,
      z2: nodeB.z,
      startPos: startZ,
      endPos: endZ,
      length: endZ - startZ,
      centerX: nodeA.x,
      centerZ: (startZ + endZ) * 0.5,
    };
  } else {
    const minNode = nodeA.x < nodeB.x ? nodeA : nodeB;
    const maxNode = nodeA.x < nodeB.x ? nodeB : nodeA;
    const startX = minNode.x + nodeTrimRadius(minNode);
    const endX = maxNode.x - nodeTrimRadius(maxNode);
    return {
      ...raw,
      x1: nodeA.x,
      z1: nodeA.z,
      x2: nodeB.x,
      z2: nodeB.z,
      startPos: startX,
      endPos: endX,
      length: endX - startX,
      centerX: (startX + endX) * 0.5,
      centerZ: nodeA.z,
    };
  }
});

// East River Bridge elevation profile (spans X in [112, 176] on Z=-48 and Z=-144)
export const BRIDGE_X_START = 112;
export const BRIDGE_X_END = 176;
export const BRIDGE_HEIGHT = 4.4;

// Countryside Creek Bridge elevation profile (spans X in [-324, -268] on Z=-48, Z=-240, Z=+168)
export const CREEK_BRIDGE_X_START = -324;
export const CREEK_BRIDGE_X_END = -268;
export const CREEK_BRIDGE_HEIGHT = 3.2;

export function isOnBridgeSpan(x: number, z: number): boolean {
  if (x >= BRIDGE_X_START && x <= BRIDGE_X_END) {
    return (
      Math.abs(z - -48) < 11 ||
      Math.abs(z - -144) < 11 ||
      Math.abs(z - -240) < 11
    );
  }
  return false;
}

export function isOnCreekBridgeSpan(x: number, z: number): boolean {
  if (x >= CREEK_BRIDGE_X_START && x <= CREEK_BRIDGE_X_END) {
    return (
      Math.abs(z - -48) < 11 ||
      Math.abs(z - -240) < 11 ||
      Math.abs(z - 168) < 11
    );
  }
  return false;
}

export function groundHeightAt(x: number, z: number): number {
  if (isOnBridgeSpan(x, z)) {
    const t = (x - BRIDGE_X_START) / (BRIDGE_X_END - BRIDGE_X_START);
    return BRIDGE_HEIGHT * 0.5 * (1 - Math.cos(Math.PI * 2 * t));
  }
  if (isOnCreekBridgeSpan(x, z)) {
    const t = (x - CREEK_BRIDGE_X_START) / (CREEK_BRIDGE_X_END - CREEK_BRIDGE_X_START);
    return CREEK_BRIDGE_HEIGHT * 0.5 * (1 - Math.cos(Math.PI * 2 * t));
  }
  return 0;
}

export function groundPitchAt(x: number, z: number, heading: number): number {
  if (isOnBridgeSpan(x, z)) {
    const span = BRIDGE_X_END - BRIDGE_X_START;
    const t = (x - BRIDGE_X_START) / span;
    const dydx = ((BRIDGE_HEIGHT * Math.PI) / span) * Math.sin(Math.PI * 2 * t);
    const fwdX = -Math.sin(heading);
    return Math.atan(dydx * fwdX);
  }
  if (isOnCreekBridgeSpan(x, z)) {
    const span = CREEK_BRIDGE_X_END - CREEK_BRIDGE_X_START;
    const t = (x - CREEK_BRIDGE_X_START) / span;
    const dydx = ((CREEK_BRIDGE_HEIGHT * Math.PI) / span) * Math.sin(Math.PI * 2 * t);
    const fwdX = -Math.sin(heading);
    return Math.atan(dydx * fwdX);
  }
  return 0;
}

// Continuous drivable rectangles (Urban streets + Runway + Rural roads)
const CAR_HALF_MARGIN = 0.95;
const DRIVABLE_HALF_W = ROAD_HALF_W - CAR_HALF_MARGIN; // 7.05m

export const DRIVABLE_RECTS: DrivableRect[] = RAW_SEGMENTS.map((raw) => {
  const nodeA = NODE_MAP.get(raw.a)!;
  const nodeB = NODE_MAP.get(raw.b)!;
  return {
    minX: Math.min(nodeA.x, nodeB.x) - DRIVABLE_HALF_W,
    maxX: Math.max(nodeA.x, nodeB.x) + DRIVABLE_HALF_W,
    minZ: Math.min(nodeA.z, nodeB.z) - DRIVABLE_HALF_W,
    maxZ: Math.max(nodeA.z, nodeB.z) + DRIVABLE_HALF_W,
  };
});

// Add wide drivable Airport Runway & Apron pad (X = 254..290, Z = -246..-138)
DRIVABLE_RECTS.push({
  minX: 254,
  maxX: 290,
  minZ: -246,
  maxZ: -138,
});

const ROUNDABOUTS = [ROUNDABOUT_CENTER, ROUNDABOUT_2_CENTER];
const RB_DRIVABLE_INNER = ROUNDABOUT_INNER_R + 0.95; // 9.95m
const RB_DRIVABLE_OUTER = ROUNDABOUT_OUTER_R - 0.95; // 21.05m

export function isInCountrysideZone(x: number, z: number): boolean {
  // Open countryside lies west of urban edge (-202), south of Southern Blvd (60), or north of North Express (-252)
  return x < -202 || z > 60 || z < -252;
}

export function resolveSolidObstacles(x: number, z: number, margin = 1.0): { x: number; z: number } {
  let rx = x;
  let rz = z;

  for (let i = 0; i < CITY_BLOCKS.length; i++) {
    const b = CITY_BLOCKS[i];
    const minX = b.minX - margin;
    const maxX = b.maxX + margin;
    const minZ = b.minZ - margin;
    const maxZ = b.maxZ + margin;

    if (rx > minX && rx < maxX && rz > minZ && rz < maxZ) {
      const dMinX = rx - minX;
      const dMaxX = maxX - rx;
      const dMinZ = rz - minZ;
      const dMaxZ = maxZ - rz;
      const minD = Math.min(dMinX, dMaxX, dMinZ, dMaxZ);

      if (minD === dMinX) rx = minX;
      else if (minD === dMaxX) rx = maxX;
      else if (minD === dMinZ) rz = minZ;
      else rz = maxZ;
    }
  }

  return { x: rx, z: rz };
}

export function resolveRoadPosition(
  x: number,
  z: number,
  speed: number
): { x: number; z: number; speed: number } {
  const solid = resolveSolidObstacles(x, z, 1.4);
  const px = solid.x;
  const pz = solid.z;

  // 1) Free open-world Countryside & Agricultural Field Exploration (no artificial wall!)
  if (isInCountrysideZone(px, pz)) {
    let cx = THREE.MathUtils.clamp(px, -680, 320);
    let cz = THREE.MathUtils.clamp(pz, -420, 310);

    // Keep out of Countryside Creek water unless crossing on one of the 3 Creek Bridges
    const onCreekBridgeCorridor =
      Math.abs(cz - -48) < 9.5 ||
      Math.abs(cz - -240) < 9.5 ||
      Math.abs(cz - 168) < 9.5;
    if (!onCreekBridgeCorridor && cx > CREEK_CENTER_X - 14.5 && cx < CREEK_CENTER_X + 14.5) {
      cx = cx < CREEK_CENTER_X ? CREEK_CENTER_X - 14.5 : CREEK_CENTER_X + 14.5;
    }

    // Also keep out of East River if driving south/north of city
    const onEastRiverBridge = Math.abs(cz - 48) < 9 || Math.abs(cz - -240) < 9.5;
    if (!onEastRiverBridge && cx > 125.5 && cx < 162.5) {
      cx = cx < RIVER_CENTER_X ? 125.5 : 162.5;
    }

    return { x: cx, z: cz, speed: (px !== x || pz !== z) ? speed * 0.5 : speed };
  }

  // 2) Check both city roundabouts
  for (let rIdx = 0; rIdx < ROUNDABOUTS.length; rIdx++) {
    const rb = ROUNDABOUTS[rIdx];
    const rdx = px - rb.x;
    const rdz = pz - rb.z;
    const rDist = Math.hypot(rdx, rdz);
    if (rDist <= RB_DRIVABLE_OUTER) {
      if (rDist >= RB_DRIVABLE_INNER) {
        return { x: px, z: pz, speed: (px !== x || pz !== z) ? speed * 0.5 : speed };
      }
      const safeDist = Math.max(rDist, 0.001);
      return {
        x: rb.x + (rdx / safeDist) * RB_DRIVABLE_INNER,
        z: rb.z + (rdz / safeDist) * RB_DRIVABLE_INNER,
        speed: speed * 0.85,
      };
    }
  }

  // 3) Urban paved roads & airport apron
  let bestDistSq = Infinity;
  let bestX = px;
  let bestZ = pz;

  for (let i = 0; i < DRIVABLE_RECTS.length; i++) {
    const r = DRIVABLE_RECTS[i];
    if (px >= r.minX && px <= r.maxX && pz >= r.minZ && pz <= r.maxZ) {
      return { x: px, z: pz, speed: (px !== x || pz !== z) ? speed * 0.5 : speed };
    }
    const cx = THREE.MathUtils.clamp(px, r.minX, r.maxX);
    const cz = THREE.MathUtils.clamp(pz, r.minZ, r.maxZ);
    const dSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestX = cx;
      bestZ = cz;
    }
  }

  for (let rIdx = 0; rIdx < ROUNDABOUTS.length; rIdx++) {
    const rb = ROUNDABOUTS[rIdx];
    const rdx = px - rb.x;
    const rdz = pz - rb.z;
    const rDist = Math.hypot(rdx, rdz);
    if (rDist > RB_DRIVABLE_OUTER) {
      const cx = rb.x + (rdx / rDist) * RB_DRIVABLE_OUTER;
      const cz = rb.z + (rdz / rDist) * RB_DRIVABLE_OUTER;
      const dSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestX = cx;
        bestZ = cz;
      }
    }
  }

  const blockedHit = px !== x || pz !== z;
  return { x: bestX, z: bestZ, speed: blockedHit ? speed * 0.4 : speed * 0.94 };
}

export function resolveWalkPosition(x: number, z: number): { x: number; z: number } {
  let wx = THREE.MathUtils.clamp(x, -680, 320);
  let wz = THREE.MathUtils.clamp(z, -420, 310);

  const solid = resolveSolidObstacles(wx, wz, 0.75);
  wx = solid.x;
  wz = solid.z;

  // Prevent walking into East River unless on bridge/tunnel
  const onRiverCrossing =
    Math.abs(wz - -48) < 11.5 ||
    Math.abs(wz - -144) < 11.5 ||
    Math.abs(wz - -240) < 11.5 ||
    Math.abs(wz - 48) < 10.0;

  if (!onRiverCrossing && wx > 125.5 && wx < 162.5) {
    wx = wx < RIVER_CENTER_X ? 125.5 : 162.5;
  }

  // Prevent walking into Countryside Creek unless on Creek Bridge
  const onCreekBridge =
    Math.abs(wz - -48) < 11.5 ||
    Math.abs(wz - -240) < 11.5 ||
    Math.abs(wz - 168) < 11.5;

  if (!onCreekBridge && wx > CREEK_CENTER_X - 14.5 && wx < CREEK_CENTER_X + 14.5) {
    wx = wx < CREEK_CENTER_X ? CREEK_CENTER_X - 14.5 : CREEK_CENTER_X + 14.5;
  }

  return { x: wx, z: wz };
}

export interface CityBlockSpec {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  district:
    | 'downtown'
    | 'commercial'
    | 'park'
    | 'civic'
    | 'residential'
    | 'service'
    | 'airport';
  roundaboutCorner?: {
    corner: 'SW' | 'SE' | 'NW' | 'NE';
    center: { x: number; z: number };
  };
}

export const CITY_BLOCKS: CityBlockSpec[] = [
  {
    id: 'BLK_RES_S',
    minX: -192 + ROAD_HALF_W,
    maxX: -96 - ROAD_HALF_W,
    minZ: -48 + ROAD_HALF_W,
    maxZ: 48 - ROAD_HALF_W,
    district: 'residential',
    roundaboutCorner: { corner: 'NW', center: ROUNDABOUT_2_CENTER },
  },
  {
    id: 'BLK_DOWNTOWN_W',
    minX: -96 + ROAD_HALF_W,
    maxX: 0 - ROAD_HALF_W,
    minZ: -48 + ROAD_HALF_W,
    maxZ: 48 - ROAD_HALF_W,
    district: 'downtown',
  },
  {
    id: 'BLK_DOWNTOWN_E',
    minX: 0 + ROAD_HALF_W,
    maxX: 96 - ROAD_HALF_W,
    minZ: -48 + ROAD_HALF_W,
    maxZ: 48 - ROAD_HALF_W,
    district: 'downtown',
  },
  {
    id: 'BLK_RES_M',
    minX: -192 + ROAD_HALF_W,
    maxX: -96 - ROAD_HALF_W,
    minZ: -144 + ROAD_HALF_W,
    maxZ: -48 - ROAD_HALF_W,
    district: 'residential',
    roundaboutCorner: { corner: 'SW', center: ROUNDABOUT_2_CENTER },
  },
  {
    id: 'BLK_PARK',
    minX: -96 + ROAD_HALF_W,
    maxX: 0 - ROAD_HALF_W,
    minZ: -144 + ROAD_HALF_W,
    maxZ: -48 - ROAD_HALF_W,
    district: 'park',
    roundaboutCorner: { corner: 'NE', center: ROUNDABOUT_CENTER },
  },
  {
    id: 'BLK_MALL',
    minX: 0 + ROAD_HALF_W,
    maxX: 96 - ROAD_HALF_W,
    minZ: -144 + ROAD_HALF_W,
    maxZ: -48 - ROAD_HALF_W,
    district: 'commercial',
    roundaboutCorner: { corner: 'NW', center: ROUNDABOUT_CENTER },
  },
  {
    id: 'BLK_SERVICE',
    minX: -192 + ROAD_HALF_W,
    maxX: -96 - ROAD_HALF_W,
    minZ: -240 + ROAD_HALF_W,
    maxZ: -144 - ROAD_HALF_W,
    district: 'service',
  },
  {
    id: 'BLK_CIVIC',
    minX: -96 + ROAD_HALF_W,
    maxX: 0 - ROAD_HALF_W,
    minZ: -240 + ROAD_HALF_W,
    maxZ: -144 - ROAD_HALF_W,
    district: 'civic',
    roundaboutCorner: { corner: 'SE', center: ROUNDABOUT_CENTER },
  },
  {
    id: 'BLK_COMM_N',
    minX: 0 + ROAD_HALF_W,
    maxX: 96 - ROAD_HALF_W,
    minZ: -240 + ROAD_HALF_W,
    maxZ: -144 - ROAD_HALF_W,
    district: 'commercial',
    roundaboutCorner: { corner: 'SW', center: ROUNDABOUT_CENTER },
  },
];

// Countryside Agricultural Fields & Orchards
export const FARM_PLOTS: FarmPlotSpec[] = [
  { id: 'FARM_WHEAT_SW', minX: -502, maxX: -412, minZ: -24, maxZ: 74, crop: 'wheat' },
  { id: 'FARM_PLOW_SW', minX: -502, maxX: -412, minZ: 82, maxZ: 150, crop: 'plowed' },
  { id: 'FARM_WHEAT_N', minX: -502, maxX: -412, minZ: -222, maxZ: -120, crop: 'wheat' },
  { id: 'FARM_PASTURE_NW', minX: -372, maxX: -316, minZ: -222, maxZ: -68, crop: 'pasture' },
  { id: 'FARM_ORCHARD_S', minX: -372, maxX: -316, minZ: -24, maxZ: 146, crop: 'orchard' },
  { id: 'FARM_MEADOW_SE', minX: -172, maxX: -20, minZ: 72, maxZ: 148, crop: 'wheat' },
  { id: 'FARM_PASTURE_FAR', minX: -620, maxX: -540, minZ: -160, maxZ: 60, crop: 'wheat' },
];

export const CITY_LANDMARKS: LandmarkLocation[] = [
  {
    id: 'downtown',
    name: 'Downtown Towers',
    category: 'downtown',
    x: -24,
    z: -4,
    roadX: 0,
    roadZ: -4,
    color: '#38bdf8',
  },
  {
    id: 'mall',
    name: 'Grand Shopping Mall',
    category: 'mall',
    x: 48,
    z: -96,
    roadX: 48,
    roadZ: -48,
    color: '#f472b6',
  },
  {
    id: 'park',
    name: 'Central City Park',
    category: 'park',
    x: -48,
    z: -96,
    roadX: -48,
    roadZ: -48,
    color: '#34d399',
  },
  {
    id: 'hospital',
    name: 'City Hospital',
    category: 'hospital',
    x: -32,
    z: -180,
    roadX: 0,
    roadZ: -180,
    color: '#ef4444',
  },
  {
    id: 'police',
    name: 'Police Headquarters',
    category: 'police',
    x: -70,
    z: -180,
    roadX: -96,
    roadZ: -180,
    color: '#3b82f6',
  },
  {
    id: 'fire',
    name: 'Fire Station',
    category: 'fire',
    x: -52,
    z: -214,
    roadX: -52,
    roadZ: -240,
    color: '#f97316',
  },
  {
    id: 'gas',
    name: 'Fuel Express Station',
    category: 'gas',
    x: -124,
    z: -176,
    roadX: -96,
    roadZ: -176,
    color: '#facc15',
  },
  {
    id: 'parking',
    name: 'Parking Garage',
    category: 'parking',
    x: -164,
    z: -206,
    roadX: -192,
    roadZ: -206,
    color: '#a78bfa',
  },
  {
    id: 'residential',
    name: 'Sakura Residences',
    category: 'residential',
    x: -144,
    z: -4,
    roadX: -144,
    roadZ: 48,
    color: '#fb923c',
  },
  {
    id: 'bridge',
    name: 'East River Bridge',
    category: 'bridge',
    x: 144,
    z: -144,
    roadX: 144,
    roadZ: -144,
    color: '#22d3ee',
  },
  {
    id: 'tunnel',
    name: 'Harbor Express Tunnel',
    category: 'tunnel',
    x: 144,
    z: 48,
    roadX: 144,
    roadZ: 48,
    color: '#94a3b8',
  },
  {
    id: 'airport',
    name: 'City International Airport',
    category: 'airport',
    x: 264,
    z: -190,
    roadX: 264,
    roadZ: -190,
    color: '#60a5fa',
  },
  // --- Countryside Villages & Farms ---
  {
    id: 'greenvale',
    name: 'Greenvale Village',
    category: 'village',
    x: -392,
    z: -74,
    roadX: -392,
    roadZ: -48,
    color: '#4ade80',
  },
  {
    id: 'sunfield_farm',
    name: 'Sunfield Wheat Farm',
    category: 'farm',
    x: -442,
    z: 140,
    roadX: -392,
    roadZ: 168,
    color: '#eab308',
  },
  {
    id: 'oakridge_barn',
    name: 'Oakridge Barn & Silos',
    category: 'farm',
    x: -512,
    z: -68,
    roadX: -520,
    roadZ: -48,
    color: '#dc2626',
  },
  {
    id: 'millstone',
    name: 'Millstone Village',
    category: 'village',
    x: -392,
    z: -214,
    roadX: -392,
    roadZ: -240,
    color: '#a3e635',
  },
  {
    id: 'creek_bridge',
    name: 'Sunset Creek Bridge',
    category: 'bridge',
    x: -296,
    z: -48,
    roadX: -296,
    roadZ: -48,
    color: '#2dd4bf',
  },
];
