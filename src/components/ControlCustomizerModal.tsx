import { useRef, useState } from 'react';
import { ArrowLeftRight, Move, RotateCcw, Save, Sliders, X } from 'lucide-react';
import { DEFAULT_CONTROL_PREFS, type ControlPreferences } from '../game/types';

interface ControlCustomizerModalProps {
  initialPrefs: ControlPreferences;
  onSave: (prefs: ControlPreferences) => void;
  onClose: () => void;
}

type PadGroupId = 'leftPad' | 'rightPad' | 'actionPad';

const PAD_META: Record<
  PadGroupId,
  {
    label: string;
    xKey: keyof ControlPreferences['offsets'];
    yKey: keyof ControlPreferences['offsets'];
    scaleKey: 'joystickScale' | 'pedalsScale' | 'actionScale';
    accent: string;
  }
> = {
  leftPad: {
    label: 'Move / Steer Joystick',
    xKey: 'leftPadX',
    yKey: 'leftPadY',
    scaleKey: 'joystickScale',
    accent: 'border-sky-400 bg-sky-500/20',
  },
  rightPad: {
    label: 'Pedals / Run & Jump',
    xKey: 'rightPadX',
    yKey: 'rightPadY',
    scaleKey: 'pedalsScale',
    accent: 'border-emerald-400 bg-emerald-500/20',
  },
  actionPad: {
    label: 'Actions / Exit / Gear',
    xKey: 'actionPadX',
    yKey: 'actionPadY',
    scaleKey: 'actionScale',
    accent: 'border-amber-400 bg-amber-500/20',
  },
};

export function ControlCustomizerModal({
  initialPrefs,
  onSave,
  onClose,
}: ControlCustomizerModalProps) {
  const [draft, setDraft] = useState<ControlPreferences>(() => ({
    ...initialPrefs,
    offsets: { ...initialPrefs.offsets },
  }));
  const [selectedPad, setSelectedPad] = useState<PadGroupId>('leftPad');

  const dragStateRef = useRef<{
    pad: PadGroupId;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const isMirrored = draft.handedness === 'left';

  const startPadDrag = (pad: PadGroupId, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPad(pad);
    const meta = PAD_META[pad];
    dragStateRef.current = {
      pad,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: draft.offsets[meta.xKey],
      origY: draft.offsets[meta.yKey],
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors on synthetic events
    }
  };

  const movePadDrag = (pad: PadGroupId, e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st || st.pad !== pad) return;
    e.preventDefault();
    const rawDx = e.clientX - st.startClientX;
    const rawDy = e.clientY - st.startClientY;
    // Invert X offset direction when pad sits on the mirrored edge
    const signX =
      pad === 'leftPad'
        ? isMirrored
          ? -1
          : 1
        : isMirrored
          ? -1
          : 1;
    const meta = PAD_META[pad];
    const minX = pad === 'leftPad' ? -24 : -140;
    const maxX = pad === 'leftPad' ? 140 : 24;
    const nextX = Math.max(minX, Math.min(maxX, Math.round(st.origX + rawDx * signX)));
    const nextY = Math.max(-160, Math.min(24, Math.round(st.origY + rawDy)));

    setDraft((prev) => ({
      ...prev,
      offsets: {
        ...prev.offsets,
        [meta.xKey]: nextX,
        [meta.yKey]: nextY,
      },
    }));
  };

  const endPadDrag = () => {
    dragStateRef.current = null;
  };

  const handleReset = () => {
    setDraft({
      ...DEFAULT_CONTROL_PREFS,
      offsets: { ...DEFAULT_CONTROL_PREFS.offsets },
    });
  };

  const activeMeta = PAD_META[selectedPad];
  const activeScale = draft[activeMeta.scaleKey];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 text-slate-100 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Customize HUD Controls"
    >
      {/* Top Editor Inspector Bar */}
      <div className="border-b border-white/15 bg-slate-900/95 px-3 sm:px-5 py-2.5 shadow-xl shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-400" />
            <h2 className="font-display text-sm sm:text-base font-bold text-white">
              HUD Control Customizer
            </h2>
            <span className="hidden md:inline text-xs text-slate-400">
              · Drag any control pad below to reposition
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setDraft((p) => ({
                  ...p,
                  handedness: p.handedness === 'right' ? 'left' : 'right',
                }))
              }
              className="flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{isMirrored ? 'Side: Left-Handed' : 'Side: Standard'}</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 rounded-lg border border-white/15 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cancel customization"
              className="flex items-center gap-1 rounded-lg border border-white/15 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cancel</span>
            </button>

            <button
              type="button"
              onClick={() => onSave(draft)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          </div>
        </div>

        {/* Selected Control Group Fine-Tune Sliders */}
        <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-xl bg-slate-950/75 border border-white/10 p-2.5 text-xs">
          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span className="truncate font-semibold text-sky-300">{activeMeta.label} Size</span>
              <span className="font-mono">{Math.round(activeScale * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.75}
              max={1.45}
              step={0.05}
              value={activeScale}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setDraft((p) => ({ ...p, [activeMeta.scaleKey]: v }));
              }}
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Opacity</span>
              <span className="font-mono text-sky-300">{Math.round(draft.buttonOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.55}
              max={1.0}
              step={0.05}
              value={draft.buttonOpacity}
              onChange={(e) =>
                setDraft((p) => ({ ...p, buttonOpacity: parseFloat(e.target.value) }))
              }
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Joystick Sens.</span>
              <span className="font-mono text-sky-300">{draft.joystickSensitivity.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min={0.6}
              max={1.8}
              step={0.05}
              value={draft.joystickSensitivity}
              onChange={(e) =>
                setDraft((p) => ({ ...p, joystickSensitivity: parseFloat(e.target.value) }))
              }
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Camera Look</span>
              <span className="font-mono text-sky-300">{draft.cameraSensitivity.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={draft.cameraSensitivity}
              onChange={(e) =>
                setDraft((p) => ({ ...p, cameraSensitivity: parseFloat(e.target.value) }))
              }
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Interactive Landscape Drag-and-Drop HUD Stage */}
      <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,rgba(30,58,138,0.22),rgba(2,6,23,0.92))]">
        {/* Center guide crosshair */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/10" />
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-lg border border-white/15 bg-slate-900/85 px-3 py-1 text-[11px] text-slate-300">
          Tap a group to resize · Drag anywhere in the lower area to customize thumb placement
        </div>

        {/* 1. Move / Steer Joystick Group */}
        <div
          onPointerDown={(e) => startPadDrag('leftPad', e)}
          onPointerMove={(e) => movePadDrag('leftPad', e)}
          onPointerUp={endPadDrag}
          onPointerCancel={endPadDrag}
          style={{
            opacity: draft.buttonOpacity,
            transform: `translate(${isMirrored ? -draft.offsets.leftPadX : draft.offsets.leftPadX}px, ${draft.offsets.leftPadY}px) scale(${draft.joystickScale})`,
            transformOrigin: isMirrored ? 'bottom right' : 'bottom left',
          }}
          className={`absolute bottom-5 z-20 rounded-2xl border-2 p-2.5 cursor-grab active:cursor-grabbing touch-none ${
            isMirrored ? 'right-5' : 'left-5'
          } ${
            selectedPad === 'leftPad'
              ? PAD_META.leftPad.accent
              : 'border-white/25 bg-slate-900/65'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-bold text-sky-200 mb-1.5">
            <Move className="w-3 h-3" />
            <span>Move / Steer Stick</span>
          </div>
          <div className="w-28 h-28 rounded-full border-2 border-white/40 bg-slate-950/75 flex items-center justify-center">
            <div className="w-11 h-11 rounded-full bg-sky-400 border-2 border-white shadow" />
          </div>
        </div>

        {/* 2. Action / Gear / Exit Bar Group */}
        <div
          onPointerDown={(e) => startPadDrag('actionPad', e)}
          onPointerMove={(e) => movePadDrag('actionPad', e)}
          onPointerUp={endPadDrag}
          onPointerCancel={endPadDrag}
          style={{
            opacity: draft.buttonOpacity,
            transform: `translate(${isMirrored ? -draft.offsets.actionPadX : draft.offsets.actionPadX}px, ${draft.offsets.actionPadY}px) scale(${draft.actionScale})`,
            transformOrigin: isMirrored ? 'bottom left' : 'bottom right',
          }}
          className={`absolute bottom-36 z-20 rounded-2xl border-2 px-3 py-2 cursor-grab active:cursor-grabbing touch-none ${
            isMirrored ? 'left-5' : 'right-5'
          } ${
            selectedPad === 'actionPad'
              ? PAD_META.actionPad.accent
              : 'border-white/25 bg-slate-900/65'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-bold text-amber-200 mb-1">
            <Move className="w-3 h-3" />
            <span>Actions &amp; Exit / Gear</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-amber-400 px-2 py-1 text-[10px] font-bold text-slate-950">
              EXIT / ENTER
            </span>
            <span className="rounded-md bg-slate-800 border border-white/20 px-2 py-1 text-[10px] font-bold text-white">
              P R N D
            </span>
            <span className="rounded-md bg-slate-800 border border-white/20 px-2 py-1 text-[10px] font-bold text-amber-200">
              Horn
            </span>
          </div>
        </div>

        {/* 3. Right-Thumb Pedals / Run & Jump Group */}
        <div
          onPointerDown={(e) => startPadDrag('rightPad', e)}
          onPointerMove={(e) => movePadDrag('rightPad', e)}
          onPointerUp={endPadDrag}
          onPointerCancel={endPadDrag}
          style={{
            opacity: draft.buttonOpacity,
            transform: `translate(${isMirrored ? -draft.offsets.rightPadX : draft.offsets.rightPadX}px, ${draft.offsets.rightPadY}px) scale(${draft.pedalsScale})`,
            transformOrigin: isMirrored ? 'bottom left' : 'bottom right',
          }}
          className={`absolute bottom-5 z-20 rounded-2xl border-2 p-2.5 cursor-grab active:cursor-grabbing touch-none ${
            isMirrored ? 'left-5' : 'right-5'
          } ${
            selectedPad === 'rightPad'
              ? PAD_META.rightPad.accent
              : 'border-white/25 bg-slate-900/65'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-200 mb-1.5">
            <Move className="w-3 h-3" />
            <span>Drive / Brake / Jump</span>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-11 h-11 rounded-xl border border-amber-400/60 bg-slate-950/80 flex items-center justify-center text-[10px] font-bold text-amber-300">
              HB
            </div>
            <div className="w-12 h-12 rounded-xl border border-white/30 bg-slate-950/80 flex items-center justify-center text-[10px] font-bold text-rose-300">
              Rev
            </div>
            <div className="w-12 h-16 rounded-xl border border-emerald-400/60 bg-slate-950/80 flex items-center justify-center text-[10px] font-bold text-emerald-300">
              Drive
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
