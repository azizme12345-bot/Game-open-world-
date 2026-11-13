import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  Crosshair,
  Map as MapIcon,
  Maximize2,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  RouteOff,
  X,
} from 'lucide-react';
import {
  CITY_BLOCKS,
  CITY_LANDMARKS,
  CREEK_CENTER_X,
  CREEK_WIDTH,
  FARM_PLOTS,
  RIVER_CENTER_X,
  RIVER_WIDTH,
  ROAD_SEGMENTS,
  ROAD_WIDTH,
  ROUNDABOUT_2_CENTER,
  ROUNDABOUT_CENTER,
  ROUNDABOUT_INNER_R,
  ROUNDABOUT_OUTER_R,
  type LandmarkLocation,
} from '../game/roadNetwork';
import type { MapSnapshot, NavigationTurnInfo } from '../game/types';

interface CityMapOverlayProps {
  getSnapshot: () => MapSnapshot | null;
  activeDestination: LandmarkLocation | null;
  navTurn?: NavigationTurnInfo | null;
  onSelectDestination: (dest: LandmarkLocation | null) => void;
  onModalOpenChange?: (open: boolean) => void;
}

const DISTRICT_COLORS: Record<string, string> = {
  downtown: '#263859',
  commercial: '#3b3355',
  park: '#1e563f',
  civic: '#2c425c',
  residential: '#3b4252',
  service: '#333b48',
  airport: '#28364a',
};

function drawWorldMap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  centerZ: number,
  scale: number,
  snap: MapSnapshot,
  showLabels: boolean
) {
  ctx.clearRect(0, 0, width, height);

  // Base terrain
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width * 0.5, height * 0.5);
  ctx.scale(scale, scale);
  ctx.translate(-centerX, -centerZ);

  // 1. Countryside Valley & Farm Plots
  ctx.fillStyle = '#142d20';
  ctx.fillRect(-680, -390, 1020, 700);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-205, -268, 510, 344);

  for (let i = 0; i < FARM_PLOTS.length; i++) {
    const fp = FARM_PLOTS[i];
    ctx.fillStyle =
      fp.crop === 'wheat'
        ? '#6b5920'
        : fp.crop === 'pasture'
          ? '#1e4b30'
          : fp.crop === 'orchard'
            ? '#1d5a3b'
            : '#4a3623';
    ctx.fillRect(fp.minX, fp.minZ, fp.maxX - fp.minX, fp.maxZ - fp.minZ);
  }

  // 1B. East River & Countryside Creek
  ctx.fillStyle = '#0c4a6e';
  ctx.fillRect(RIVER_CENTER_X - RIVER_WIDTH * 0.5, -310, RIVER_WIDTH, 410);
  ctx.fillRect(CREEK_CENTER_X - CREEK_WIDTH * 0.5, -360, CREEK_WIDTH, 640);

  // 2. City District Blocks
  for (let i = 0; i < CITY_BLOCKS.length; i++) {
    const b = CITY_BLOCKS[i];
    ctx.fillStyle = DISTRICT_COLORS[b.district] ?? '#1e293b';
    ctx.fillRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
  }

  // Airport Runway & Terminal Apron
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(250, -250, 48, 118);
  ctx.fillStyle = '#334155';
  ctx.fillRect(268, -246, 16, 108);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 0.8;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(276, -242);
  ctx.lineTo(276, -142);
  ctx.stroke();
  ctx.setLineDash([]);

  // 3. Connected Road Segments
  for (let i = 0; i < ROAD_SEGMENTS.length; i++) {
    const seg = ROAD_SEGMENTS[i];
    ctx.lineCap = 'square';
    ctx.lineWidth = seg.roadType === 'dirt' ? ROAD_WIDTH - 2.4 : ROAD_WIDTH;
    if (seg.roadType === 'bridge') {
      ctx.strokeStyle = '#64748b';
    } else if (seg.roadType === 'creek_bridge') {
      ctx.strokeStyle = '#8b5e3c';
    } else if (seg.roadType === 'dirt') {
      ctx.strokeStyle = '#73573d';
    } else if (seg.roadType === 'tunnel') {
      ctx.strokeStyle = '#475569';
    } else if (seg.roadType === 'highway') {
      ctx.strokeStyle = '#526075';
    } else {
      ctx.strokeStyle = '#475569';
    }
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.z1);
    ctx.lineTo(seg.x2, seg.z2);
    ctx.stroke();

    if (seg.roadType !== 'dirt') {
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = seg.roadType === 'tunnel' ? '#f59e0b' : '#cbd5e1';
      if (seg.roadType === 'tunnel') ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.z1);
      ctx.lineTo(seg.x2, seg.z2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 4. Roundabouts
  [ROUNDABOUT_CENTER, ROUNDABOUT_2_CENTER].forEach((rb) => {
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(rb.x, rb.z, ROUNDABOUT_OUTER_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e563f';
    ctx.beginPath();
    ctx.arc(rb.x, rb.z, ROUNDABOUT_INNER_R, 0, Math.PI * 2);
    ctx.fill();
  });

  // 5. Active GPS Route
  if (snap.route.length >= 2) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4.5, 3.2 / scale);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
    ctx.beginPath();
    ctx.moveTo(snap.route[0].x, snap.route[0].z);
    for (let i = 1; i < snap.route.length; i++) {
      ctx.lineTo(snap.route[i].x, snap.route[i].z);
    }
    ctx.stroke();

    ctx.lineWidth = Math.max(2.4, 1.8 / scale);
    ctx.strokeStyle = '#22d3ee';
    ctx.beginPath();
    ctx.moveTo(snap.route[0].x, snap.route[0].z);
    for (let i = 1; i < snap.route.length; i++) {
      ctx.lineTo(snap.route[i].x, snap.route[i].z);
    }
    ctx.stroke();
  }

  // 6. City Landmarks
  const pinR = showLabels ? Math.max(4.2, 5.5 / scale) : Math.max(3.6, 3.2 / scale);
  for (let i = 0; i < CITY_LANDMARKS.length; i++) {
    const lm = CITY_LANDMARKS[i];
    const isDest = snap.activeDestination?.id === lm.id;

    if (isDest) {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = Math.max(1.5, 2 / scale);
      ctx.beginPath();
      ctx.arc(lm.x, lm.z, pinR * 1.9, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = lm.color;
    ctx.beginPath();
    ctx.arc(lm.x, lm.z, pinR, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.0, 1.4 / scale);
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    if (showLabels) {
      ctx.font = `600 ${Math.max(8, Math.round(11 / scale))}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
      const labelW = ctx.measureText(lm.name).width + 8 / scale;
      const labelH = 14 / scale;
      const ly = lm.z - pinR - 14 / scale;
      ctx.fillRect(lm.x - labelW * 0.5, ly - labelH * 0.72, labelW, labelH);
      ctx.fillStyle = isDest ? '#67e8f9' : '#f8fafc';
      ctx.fillText(lm.name, lm.x, ly);
    }
  }

  // 7. Player Blue Sports Car Marker (heading arrow)
  ctx.save();
  ctx.translate(snap.carX, snap.carZ);
  ctx.rotate(-snap.carHeading);

  const arrowS = showLabels ? Math.max(6.5, 9 / scale) : Math.max(5.5, 5.2 / scale);
  // Subtle heading cone
  ctx.fillStyle = 'rgba(56, 189, 248, 0.24)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-arrowS * 1.2, -arrowS * 2.5);
  ctx.lineTo(arrowS * 1.2, -arrowS * 2.5);
  ctx.closePath();
  ctx.fill();

  // Crisp player chevron
  ctx.fillStyle = '#38bdf8';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.2, 1.5 / scale);
  ctx.beginPath();
  ctx.moveTo(0, -arrowS * 1.15);
  ctx.lineTo(arrowS * 0.82, arrowS * 0.85);
  ctx.lineTo(0, arrowS * 0.42);
  ctx.lineTo(-arrowS * 0.82, arrowS * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

export function CityMapOverlay({
  getSnapshot,
  activeDestination,
  navTurn,
  onSelectDestination,
  onModalOpenChange,
}: CityMapOverlayProps) {
  const [fullMapOpen, setFullMapOpen] = useState(false);
  const [distLabel, setDistLabel] = useState<number>(0);

  // Full-screen map interactive camera state (zoom & pan in world units)
  const [zoom, setZoom] = useState(0.85);
  const panRef = useRef<{ x: number; z: number }>({ x: -110, z: -65 });
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; moved: boolean }>({
    active: false,
    lastX: 0,
    lastY: 0,
    moved: false,
  });

  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const setMapOpen = useCallback(
    (open: boolean) => {
      setFullMapOpen(open);
      onModalOpenChange?.(open);
      if (open) {
        const snap = getSnapshot();
        if (snap) {
          panRef.current = { x: snap.carX, z: snap.carZ };
        }
      }
    },
    [getSnapshot, onModalOpenChange]
  );

  // Keyboard shortcut 'M' to toggle Full City Map
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        setMapOpen(!fullMapOpen);
      } else if (e.key === 'Escape' && fullMapOpen) {
        setMapOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullMapOpen, setMapOpen]);

  // Continuous live canvas renderer for Mini-Map & Full-Screen Map
  useEffect(() => {
    let rafId = 0;
    let frameCounter = 0;

    const renderFrame = () => {
      const snap = getSnapshot();
      if (snap) {
        frameCounter++;
        if (frameCounter % 12 === 0 && snap.activeDestination) {
          setDistLabel(Math.round(snap.remainingDistance));
        }

        // Draw Mini-Map
        const mini = miniCanvasRef.current;
        if (mini) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const cw = mini.clientWidth;
          const ch = mini.clientHeight;
          if (cw > 0 && ch > 0) {
            if (mini.width !== Math.round(cw * dpr) || mini.height !== Math.round(ch * dpr)) {
              mini.width = Math.round(cw * dpr);
              mini.height = Math.round(ch * dpr);
            }
            const ctx = mini.getContext('2d');
            if (ctx) {
              ctx.save();
              ctx.scale(dpr, dpr);
              drawWorldMap(ctx, cw, ch, snap.carX, snap.carZ, 0.72, snap, false);
              ctx.restore();
            }
          }
        }

        // Draw Full-Screen Map when open
        if (fullMapOpen) {
          const full = fullCanvasRef.current;
          if (full) {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const cw = full.clientWidth;
            const ch = full.clientHeight;
            if (cw > 0 && ch > 0) {
              if (full.width !== Math.round(cw * dpr) || full.height !== Math.round(ch * dpr)) {
                full.width = Math.round(cw * dpr);
                full.height = Math.round(ch * dpr);
              }
              const ctx = full.getContext('2d');
              if (ctx) {
                ctx.save();
                ctx.scale(dpr, dpr);
                drawWorldMap(
                  ctx,
                  cw,
                  ch,
                  panRef.current.x,
                  panRef.current.z,
                  zoomRef.current,
                  snap,
                  true
                );
                ctx.restore();
              }
            }
          }
        }
      }
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [fullMapOpen, getSnapshot]);

  // Full map pointer pan + landmark tap selection
  const handleFullMapPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handleFullMapPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    if (Math.hypot(dx, dy) > 4) {
      dragRef.current.moved = true;
    }
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    panRef.current.x = Math.max(-620, Math.min(320, panRef.current.x - dx / zoomRef.current));
    panRef.current.z = Math.max(-340, Math.min(260, panRef.current.z - dy / zoomRef.current));
  };

  const handleFullMapPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasMoved = dragRef.current.moved;
    dragRef.current.active = false;
    if (!wasMoved && fullCanvasRef.current) {
      const rect = fullCanvasRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const wx = panRef.current.x + (cx - rect.width * 0.5) / zoomRef.current;
      const wz = panRef.current.z + (cy - rect.height * 0.5) / zoomRef.current;

      let closest: LandmarkLocation | null = null;
      let bestDist = 22 / zoomRef.current;
      for (const lm of CITY_LANDMARKS) {
        const d = Math.hypot(lm.x - wx, lm.z - wz);
        if (d < bestDist) {
          bestDist = d;
          closest = lm;
        }
      }
      if (closest) {
        onSelectDestination(closest);
      }
    }
  };

  const handleCenterOnCar = () => {
    const snap = getSnapshot();
    if (snap) {
      panRef.current = { x: snap.carX, z: snap.carZ };
      setZoom(1.55);
    }
  };

  return (
    <>
      {/* Compact Live Mini-Map (Top-Right) */}
      <div className="pointer-events-auto absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex flex-col items-end gap-1.5">
        <div className="overflow-hidden rounded-xl border border-white/20 bg-slate-950/90 shadow-xl">
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            aria-label="Open full city map"
            className="group relative block w-[112px] h-[112px] sm:w-[144px] sm:h-[144px] cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <canvas ref={miniCanvasRef} className="w-full h-full block" />
            <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-md bg-slate-950/85 border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-slate-100 group-hover:bg-sky-500 group-hover:text-slate-950 transition-colors">
              <Maximize2 className="w-2.5 h-2.5" />
              <span>Map</span>
            </span>
          </button>

          {activeDestination && (
            <div className="border-t border-white/10 bg-slate-900/95 px-2 py-1 text-[10px] text-cyan-200 max-w-[124px] sm:max-w-[156px]">
              <div className="flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1 truncate font-medium">
                  <Navigation className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span className="truncate">{activeDestination.name}</span>
                </span>
                <span className="font-mono text-[10px] text-cyan-300 shrink-0">{distLabel}m</span>
              </div>
              {navTurn && (
                <div className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-white truncate">
                  {navTurn.direction === 'left' && <CornerUpLeft className="w-3 h-3 text-emerald-400 shrink-0" />}
                  {navTurn.direction === 'right' && <CornerUpRight className="w-3 h-3 text-emerald-400 shrink-0" />}
                  {navTurn.direction === 'uturn' && <RotateCcw className="w-3 h-3 text-amber-400 shrink-0" />}
                  {(navTurn.direction === 'straight' || navTurn.direction === 'arrive') && (
                    <ArrowUp className="w-3 h-3 text-cyan-400 shrink-0" />
                  )}
                  <span className="truncate">{navTurn.instruction}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expandable Full-Screen City Map & GPS Route Planner */}
      {fullMapOpen && (
        <div
          className="fixed inset-0 z-40 flex flex-col bg-slate-950/96 text-slate-100"
          role="dialog"
          aria-modal="true"
          aria-label="City Drive Navigation Map"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/90 px-4 py-2.5 shrink-0">
            <div className="flex items-center gap-2.5">
              <MapIcon className="w-5 h-5 text-sky-400" />
              <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-white">
                City Map &amp; GPS Navigation
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {activeDestination && (
                <button
                  type="button"
                  onClick={() => onSelectDestination(null)}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/15 px-2.5 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25 cursor-pointer"
                >
                  <RouteOff className="w-3.5 h-3.5" />
                  <span>Clear Route</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setMapOpen(false)}
                aria-label="Close map"
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Drive</span>
              </button>
            </div>
          </div>

          {/* Interactive Map Canvas + Landmark Selector */}
          <div className="relative flex-1 flex flex-col md:flex-row min-h-0">
            {/* Map Canvas Area */}
            <div className="relative flex-1 min-h-0 bg-slate-950 overflow-hidden">
              <canvas
                ref={fullCanvasRef}
                onPointerDown={handleFullMapPointerDown}
                onPointerMove={handleFullMapPointerMove}
                onPointerUp={handleFullMapPointerUp}
                onWheel={(e) => {
                  setZoom((z) => Math.max(0.42, Math.min(3.5, z - e.deltaY * 0.0015)));
                }}
                className="w-full h-full block touch-none cursor-grab active:cursor-grabbing"
              />

              {/* Zoom & Recenter Controls */}
              <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 rounded-xl border border-white/15 bg-slate-900/95 p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3.5, z + 0.35))}
                  aria-label="Zoom in"
                  className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800 text-white hover:bg-sky-500 hover:text-slate-950 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.42, z - 0.35))}
                  aria-label="Zoom out"
                  className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800 text-white hover:bg-sky-500 hover:text-slate-950 transition-colors cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleCenterOnCar}
                  aria-label="Center on car"
                  className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800 text-sky-300 hover:bg-sky-500 hover:text-slate-950 transition-colors cursor-pointer"
                >
                  <Crosshair className="w-4 h-4" />
                </button>
              </div>

              <div className="pointer-events-none absolute top-3 left-3 rounded-lg border border-white/10 bg-slate-900/90 px-2.5 py-1 text-[11px] text-slate-300">
                Drag to pan · Tap any pin or pick a destination
              </div>
            </div>

            {/* Destination Selector Drawer */}
            <aside className="w-full md:w-72 border-t md:border-t-0 md:border-l border-white/10 bg-slate-900/95 p-3 overflow-y-auto max-h-[38vh] md:max-h-none shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Select Destination ({CITY_LANDMARKS.length})
              </p>
              <div className="grid grid-cols-2 md:grid-cols-1 gap-1.5">
                {CITY_LANDMARKS.map((lm) => {
                  const selected = activeDestination?.id === lm.id;
                  return (
                    <button
                      key={lm.id}
                      type="button"
                      onClick={() => onSelectDestination(selected ? null : lm)}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                        selected
                          ? 'border-cyan-400 bg-cyan-500/20 text-white font-semibold'
                          : 'border-white/10 bg-slate-800/70 text-slate-200 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: lm.color }}
                        />
                        <span className="truncate">{lm.name}</span>
                      </span>
                      {selected && (
                        <Navigation className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
