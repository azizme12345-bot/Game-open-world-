import {
  NODE_MAP,
  ROAD_NODES,
  ROAD_SEGMENTS,
  type LandmarkLocation,
  type RoadNode,
} from './roadNetwork';
import type { NavigationTurnInfo } from './types';

export interface RoutePoint {
  x: number;
  z: number;
}

// Build adjacency list from ROAD_SEGMENTS
const ADJACENCY = new Map<string, { neighborId: string; cost: number }[]>();
ROAD_NODES.forEach((n) => ADJACENCY.set(n.id, []));

ROAD_SEGMENTS.forEach((seg) => {
  const a = NODE_MAP.get(seg.a);
  const b = NODE_MAP.get(seg.b);
  if (!a || !b) return;
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  ADJACENCY.get(a.id)?.push({ neighborId: b.id, cost: dist });
  ADJACENCY.get(b.id)?.push({ neighborId: a.id, cost: dist });
});

function findClosestNodesToPoint(x: number, z: number): {
  primary: RoadNode;
  secondary: RoadNode | null;
  projX: number;
  projZ: number;
} {
  let bestDistSq = Infinity;
  let bestSeg = ROAD_SEGMENTS[0];
  let bestProjX = x;
  let bestProjZ = z;

  for (const seg of ROAD_SEGMENTS) {
    const a = NODE_MAP.get(seg.a)!;
    const b = NODE_MAP.get(seg.b)!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / lenSq)) : 0;
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestSeg = seg;
      bestProjX = px;
      bestProjZ = pz;
    }
  }

  const nodeA = NODE_MAP.get(bestSeg.a)!;
  const nodeB = NODE_MAP.get(bestSeg.b)!;
  const da = Math.hypot(bestProjX - nodeA.x, bestProjZ - nodeA.z);
  const db = Math.hypot(bestProjX - nodeB.x, bestProjZ - nodeB.z);
  return da <= db
    ? { primary: nodeA, secondary: nodeB, projX: bestProjX, projZ: bestProjZ }
    : { primary: nodeB, secondary: nodeA, projX: bestProjX, projZ: bestProjZ };
}

/**
 * Computes the shortest connected road route from (startX, startZ) to destination landmark.
 */
export function computeNavigationRoute(
  startX: number,
  startZ: number,
  dest: LandmarkLocation
): RoutePoint[] {
  const startInfo = findClosestNodesToPoint(startX, startZ);
  const goalInfo = findClosestNodesToPoint(dest.roadX, dest.roadZ);

  // If on the same segment, return direct segment path
  if (
    (startInfo.primary.id === goalInfo.primary.id &&
      startInfo.secondary?.id === goalInfo.secondary?.id) ||
    (startInfo.primary.id === goalInfo.secondary?.id &&
      startInfo.secondary?.id === goalInfo.primary.id)
  ) {
    return [
      { x: startX, z: startZ },
      { x: goalInfo.projX, z: goalInfo.projZ },
    ];
  }

  // Dijkstra across ROAD_NODES
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const unvisited = new Set<string>();

  for (const n of ROAD_NODES) {
    dist.set(n.id, Infinity);
    prev.set(n.id, null);
    unvisited.add(n.id);
  }

  // Seed both endpoints of starting segment for exact shortest entry
  const startCandidates = [startInfo.primary];
  if (startInfo.secondary) startCandidates.push(startInfo.secondary);
  for (const sc of startCandidates) {
    dist.set(sc.id, Math.hypot(sc.x - startInfo.projX, sc.z - startInfo.projZ));
  }

  while (unvisited.size > 0) {
    let currId: string | null = null;
    let bestD = Infinity;
    for (const id of unvisited) {
      const d = dist.get(id)!;
      if (d < bestD) {
        bestD = d;
        currId = id;
      }
    }
    if (!currId || bestD === Infinity) break;
    unvisited.delete(currId);

    if (currId === goalInfo.primary.id) break;

    const neighbors = ADJACENCY.get(currId) ?? [];
    for (const nb of neighbors) {
      if (!unvisited.has(nb.neighborId)) continue;
      const alt = bestD + nb.cost;
      if (alt < dist.get(nb.neighborId)!) {
        dist.set(nb.neighborId, alt);
        prev.set(nb.neighborId, currId);
      }
    }
  }

  // Reconstruct node chain
  const nodeChain: RoadNode[] = [];
  let trace: string | null = goalInfo.primary.id;
  while (trace) {
    const n = NODE_MAP.get(trace);
    if (n) nodeChain.unshift(n);
    trace = prev.get(trace) ?? null;
  }

  const pts: RoutePoint[] = [{ x: startX, z: startZ }];
  for (const n of nodeChain) {
    const last = pts[pts.length - 1];
    if (Math.hypot(n.x - last.x, n.z - last.z) > 2.5) {
      pts.push({ x: n.x, z: n.z });
    }
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(goalInfo.projX - last.x, goalInfo.projZ - last.z) > 1.5) {
    pts.push({ x: goalInfo.projX, z: goalInfo.projZ });
  }
  return pts;
}

export function computeRouteDistance(route: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  }
  return total;
}

export function computeTurnInstruction(
  route: RoutePoint[],
  carHeading: number,
  destinationName: string
): NavigationTurnInfo | null {
  if (route.length < 2) return null;
  const totalRemaining = computeRouteDistance(route);

  if (totalRemaining < 26) {
    return {
      instruction: `Arriving at ${destinationName}`,
      direction: 'arrive',
      distanceToTurn: Math.round(totalRemaining),
      totalRemaining: Math.round(totalRemaining),
      destinationName,
    };
  }

  // First segment direction from car toward route[1]
  const p0 = route[0];
  const p1 = route[1];
  const seg1Len = Math.hypot(p1.x - p0.x, p1.z - p0.z);

  // Check if car is facing opposite to initial route segment
  const fwdX = -Math.sin(carHeading);
  const fwdZ = -Math.cos(carHeading);
  const dir1X = (p1.x - p0.x) / Math.max(seg1Len, 0.001);
  const dir1Z = (p1.z - p0.z) / Math.max(seg1Len, 0.001);
  const dotCar = fwdX * dir1X + fwdZ * dir1Z;
  if (dotCar < -0.55) {
    return {
      instruction: 'Make a U-Turn onto route',
      direction: 'uturn',
      distanceToTurn: Math.round(seg1Len),
      totalRemaining: Math.round(totalRemaining),
      destinationName,
    };
  }

  // Look ahead for the next meaningful turn (>= 35 deg)
  let accumDist = seg1Len;
  for (let i = 1; i < route.length - 1; i++) {
    const a = route[i - 1];
    const b = route[i];
    const c = route[i + 1];
    const v1x = b.x - a.x;
    const v1z = b.z - a.z;
    const v2x = c.x - b.x;
    const v2z = c.z - b.z;
    const l1 = Math.hypot(v1x, v1z);
    const l2 = Math.hypot(v2x, v2z);
    if (l1 > 1 && l2 > 1) {
      const u1x = v1x / l1;
      const u1z = v1z / l1;
      const u2x = v2x / l2;
      const u2z = v2z / l2;
      const dot = u1x * u2x + u1z * u2z;
      if (dot < 0.82) {
        // 2D cross product in XZ plane: u1x * u2z - u1z * u2x > 0 means turning RIGHT (clockwise from -Z to +X)
        const cross = u1x * u2z - u1z * u2x;
        const turnDir = cross > 0 ? 'right' : 'left';
        const label = turnDir === 'right' ? 'Turn Right' : 'Turn Left';
        return {
          instruction: `${label} in ${Math.max(5, Math.round(accumDist))}m`,
          direction: turnDir,
          distanceToTurn: Math.round(accumDist),
          totalRemaining: Math.round(totalRemaining),
          destinationName,
        };
      }
    }
    accumDist += l2;
  }

  return {
    instruction: `Continue straight ${Math.round(totalRemaining)}m`,
    direction: 'straight',
    distanceToTurn: Math.round(totalRemaining),
    totalRemaining: Math.round(totalRemaining),
    destinationName,
  };
}
