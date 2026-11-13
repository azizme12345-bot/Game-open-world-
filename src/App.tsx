import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  CarFront,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  Footprints,
  Lightbulb,
  LogOut,
  Maximize2,
  Minimize2,
  RotateCw,
  ShieldAlert,
  Sliders,
  SlidersHorizontal,
  Star,
  Sun,
  Volume2,
  Zap,
} from 'lucide-react';
import { CityMapOverlay } from './components/CityMapOverlay';
import { ControlCustomizerModal } from './components/ControlCustomizerModal';
import { CityDriveEngine } from './game/CityDriveEngine';
import type { LandmarkLocation } from './game/roadNetwork';
import {
  DEFAULT_CONTROL_PREFS,
  type CameraPreset,
  type ControlPreferences,
  type DrivingInput,
  type GearMode,
  type HudTelemetry,
  type TimeMode,
  type WalkingInput,
  type WeatherMode,
} from './game/types';

const CAMERA_OPTIONS: { id: CameraPreset; label: string }[] = [
  { id: 'chase', label: 'Chase' },
  { id: 'low', label: 'Low' },
  { id: 'side', label: 'Side' },
  { id: 'wide', label: 'Wide' },
];

const GEAR_OPTIONS: GearMode[] = ['P', 'R', 'N', 'D'];
const TIME_CYCLE: TimeMode[] = ['auto', 'day', 'sunset', 'night'];

type ButtonControlKey = 'accelerate' | 'reverse' | 'steerLeft' | 'steerRight' | 'handbrake';
type SteerControlMode = 'stick' | 'buttons' | 'wheel';

const EMPTY_BUTTONS: Record<ButtonControlKey, boolean> = {
  accelerate: false,
  reverse: false,
  steerLeft: false,
  steerRight: false,
  handbrake: false,
};

const INITIAL_TELEMETRY: HudTelemetry = {
  mode: 'driving',
  activeVehicleKind: 'sports',
  activeVehicleLabel: 'Blue Sports Car',
  speedKmh: 0,
  gear: 'D',
  carHealth: 100,
  repairing: false,
  repairProgress: 0,
  timeOfDayLabel: 'Day',
  weather: 'clear',
  nearbyVehicle: null,
  police: {
    wantedLevel: 0,
    status: 'patrol',
    pendingReasons: [],
    activeTicket: null,
  },
  navTurn: null,
};

function createDefaultControlPrefs(): ControlPreferences {
  return {
    ...DEFAULT_CONTROL_PREFS,
    offsets: { ...DEFAULT_CONTROL_PREFS.offsets },
  };
}

function readRawTiltAngle(e: DeviceOrientationEvent): number {
  const beta = e.beta ?? 0;
  const gamma = e.gamma ?? 0;
  const angle =
    window.screen?.orientation?.angle ??
    (window as unknown as { orientation?: number }).orientation ??
    0;

  if (angle === 90) return -beta;
  if (angle === -90 || angle === 270) return beta;
  if (angle === 180) return gamma;
  return -gamma;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CityDriveEngine | null>(null);

  const touchInputRef = useRef<Record<ButtonControlKey, boolean>>({ ...EMPTY_BUTTONS });
  const keyInputRef = useRef<Record<ButtonControlKey, boolean>>({ ...EMPTY_BUTTONS });
  const gyroSteerRef = useRef(0);
  const activePointerIdsRef = useRef<Record<ButtonControlKey, number | null>>({
    accelerate: null,
    reverse: null,
    steerLeft: null,
    steerRight: null,
    handbrake: null,
  });

  // Walking & Driving Dual-Thumb Virtual Joystick Refs
  const joyStickVecRef = useRef({ x: 0, y: 0 });
  const joyPointerIdRef = useRef<number | null>(null);
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0, active: false });

  const driveSteerAnalogRef = useRef(0);
  const driveJoyPointerIdRef = useRef<number | null>(null);
  const driveJoyBaseRef = useRef<HTMLDivElement | null>(null);
  const [driveJoyKnob, setDriveJoyKnob] = useState({ x: 0, active: false });
  const wheelPointerIdRef = useRef<number | null>(null);
  const wheelBaseRef = useRef<HTMLDivElement | null>(null);
  const wheelPrevAngleRef = useRef<number | null>(null);
  const wheelAngleDegRef = useRef(0);
  const [wheelState, setWheelState] = useState({ angleDeg: 0, active: false });
  const [steerMode, setSteerMode] = useState<SteerControlMode>('stick');

  const lookPointerIdRef = useRef<number | null>(null);
  const lookPrevRef = useRef<{ x: number; y: number } | null>(null);

  const walkKeysRef = useRef({ up: false, down: false, left: false, right: false, shift: false });
  const [runToggle, setRunToggle] = useState(false);
  const [jumpHeld, setJumpHeld] = useState(false);
  const runToggleRef = useRef(false);
  const jumpHeldRef = useRef(false);
  runToggleRef.current = runToggle;
  jumpHeldRef.current = jumpHeld;

  const [controlPrefs, setControlPrefs] = useState<ControlPreferences>(createDefaultControlPrefs);
  const controlPrefsRef = useRef(controlPrefs);
  controlPrefsRef.current = controlPrefs;
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [activePreset, setActivePreset] = useState<CameraPreset>('chase');
  const [headlightsOn, setHeadlightsOn] = useState(true);
  const [gear, setGear] = useState<GearMode>('D');
  const [timeMode, setTimeMode] = useState<TimeMode>('auto');
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('clear');
  const [hornActive, setHornActive] = useState(false);

  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [gyroSensitivity, setGyroSensitivity] = useState(1.25);
  const [gyroPanelOpen, setGyroPanelOpen] = useState(false);
  const gyroOffsetRef = useRef(0);
  const latestRawTiltRef = useRef(0);
  const gyroEnabledRef = useRef(false);
  const gyroSensitivityRef = useRef(1.25);
  gyroEnabledRef.current = gyroEnabled;
  gyroSensitivityRef.current = gyroSensitivity;

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [isTouchPortrait, setIsTouchPortrait] = useState(false);
  const [activeControls, setActiveControls] = useState<Record<ButtonControlKey, boolean>>({
    ...EMPTY_BUTTONS,
  });
  const [activeDestination, setActiveDestination] = useState<LandmarkLocation | null>(null);
  const [telemetry, setTelemetry] = useState<HudTelemetry>(INITIAL_TELEMETRY);
  const modeRef = useRef(telemetry.mode);
  modeRef.current = telemetry.mode;

  const syncDrivingInput = useCallback((updateReactState = true) => {
    const t = touchInputRef.current;
    const k = keyInputRef.current;
    const combined: DrivingInput = {
      accelerate: t.accelerate || k.accelerate,
      reverse: t.reverse || k.reverse,
      steerLeft: t.steerLeft || k.steerLeft,
      steerRight: t.steerRight || k.steerRight,
      steerAnalog: driveSteerAnalogRef.current,
      handbrake: t.handbrake || k.handbrake,
      gyroSteer: gyroEnabledRef.current ? gyroSteerRef.current : 0,
    };
    engineRef.current?.setDrivingInput(combined);
    if (updateReactState) {
      setActiveControls({
        accelerate: combined.accelerate,
        reverse: combined.reverse,
        steerLeft: combined.steerLeft,
        steerRight: combined.steerRight,
        handbrake: Boolean(combined.handbrake),
      });
    }
  }, []);

  const syncWalkingInput = useCallback(() => {
    const wk = walkKeysRef.current;
    const keyX = (wk.right ? 1 : 0) - (wk.left ? 1 : 0);
    const keyY = (wk.up ? 1 : 0) - (wk.down ? 1 : 0);
    const jx = joyStickVecRef.current.x;
    const jy = joyStickVecRef.current.y;
    const moveX = Math.max(-1, Math.min(1, jx + keyX));
    const moveY = Math.max(-1, Math.min(1, jy + keyY));
    const autoSprint = Math.hypot(jx, jy) > 0.92;
    const input: WalkingInput = {
      moveX,
      moveY,
      run: runToggleRef.current || wk.shift || autoSprint,
      jumpPressed: jumpHeldRef.current,
    };
    engineRef.current?.setWalkingInput(input);
  }, []);

  const clearAllInputs = useCallback(() => {
    keyInputRef.current = { ...EMPTY_BUTTONS };
    touchInputRef.current = { ...EMPTY_BUTTONS };
    activePointerIdsRef.current = {
      accelerate: null,
      reverse: null,
      steerLeft: null,
      steerRight: null,
      handbrake: null,
    };
    walkKeysRef.current = { up: false, down: false, left: false, right: false, shift: false };
    joyStickVecRef.current = { x: 0, y: 0 };
    joyPointerIdRef.current = null;
    driveSteerAnalogRef.current = 0;
    driveJoyPointerIdRef.current = null;
    wheelPointerIdRef.current = null;
    wheelPrevAngleRef.current = null;
    wheelAngleDegRef.current = 0;
    lookPointerIdRef.current = null;
    lookPrevRef.current = null;
    setJoyKnob({ x: 0, y: 0, active: false });
    setDriveJoyKnob({ x: 0, active: false });
    setWheelState({ angleDeg: 0, active: false });
    setJumpHeld(false);
    jumpHeldRef.current = false;
    engineRef.current?.setHornActive(false);
    setHornActive(false);
    syncDrivingInput(true);
    syncWalkingInput();
  }, [syncDrivingInput, syncWalkingInput]);

  // Initialize Three.js WebGL scene once outside React state updates
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    let engine: CityDriveEngine | null = null;
    try {
      engine = new CityDriveEngine(container, {
        onContextLost: (lost) => setContextLost(lost),
        onDestinationChanged: (dest) => setActiveDestination(dest),
        onTelemetry: (next) => setTelemetry(next),
      });
      engine.setCameraSensitivity(controlPrefsRef.current.cameraSensitivity);
      engineRef.current = engine;
    } catch {
      setContextLost(true);
    }

    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keep engine camera sensitivity synced with saved preferences
  useEffect(() => {
    engineRef.current?.setCameraSensitivity(controlPrefs.cameraSensitivity);
  }, [controlPrefs.cameraSensitivity]);

  // Track Fullscreen & Touch-Phone Portrait state
  useEffect(() => {
    const checkOrientation = () => {
      const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      setIsTouchPortrait(coarse && window.innerHeight > window.innerWidth);
    };
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, []);

  // Gyroscope orientation listener
  useEffect(() => {
    if (!gyroEnabled) {
      gyroSteerRef.current = 0;
      syncDrivingInput(false);
      return;
    }

    const onOrientation = (e: DeviceOrientationEvent) => {
      const raw = readRawTiltAngle(e);
      latestRawTiltRef.current = raw;
      const delta = raw - gyroOffsetRef.current;
      const absDelta = Math.abs(delta);
      if (absDelta < 3.0) {
        gyroSteerRef.current = 0;
      } else {
        const effective = Math.sign(delta) * (absDelta - 3.0);
        const maxDeg = 28 / gyroSensitivityRef.current;
        gyroSteerRef.current = Math.max(-1, Math.min(1, effective / maxDeg));
      }
      syncDrivingInput(false);
    };

    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      gyroSteerRef.current = 0;
      syncDrivingInput(false);
    };
  }, [gyroEnabled, syncDrivingInput]);

  // Keyboard controls for BOTH Driving & Walking modes + Enter/Exit (E)
  useEffect(() => {
    const mapDriveKey = (code: string): ButtonControlKey | null => {
      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          return 'accelerate';
        case 'KeyS':
        case 'ArrowDown':
          return 'reverse';
        case 'KeyA':
        case 'ArrowLeft':
          return 'steerLeft';
        case 'KeyD':
        case 'ArrowRight':
          return 'steerRight';
        case 'Space':
          return 'handbrake';
        default:
          return null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
        return;
      }
      if (e.code === 'KeyE') {
        if (modeRef.current === 'driving') {
          clearAllInputs();
          engineRef.current?.exitVehicle();
        } else if (modeRef.current === 'walking') {
          clearAllInputs();
          engineRef.current?.enterNearestVehicle();
        }
        return;
      }
      if (e.code === 'KeyF' && modeRef.current === 'driving') {
        engineRef.current?.setHornActive(true);
        setHornActive(true);
        return;
      }

      if (modeRef.current === 'walking') {
        if (e.code === 'KeyW' || e.code === 'ArrowUp') walkKeysRef.current.up = true;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') walkKeysRef.current.down = true;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') walkKeysRef.current.left = true;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') walkKeysRef.current.right = true;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') walkKeysRef.current.shift = true;
        if (e.code === 'Space') {
          e.preventDefault();
          jumpHeldRef.current = true;
          setJumpHeld(true);
        }
        syncWalkingInput();
        return;
      }

      const ctrl = mapDriveKey(e.code);
      if (ctrl) {
        if (e.code === 'Space') e.preventDefault();
        if (!keyInputRef.current[ctrl]) {
          keyInputRef.current[ctrl] = true;
          syncDrivingInput(true);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyF') {
        engineRef.current?.setHornActive(false);
        setHornActive(false);
      }
      if (e.code === 'KeyW' || e.code === 'ArrowUp') walkKeysRef.current.up = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') walkKeysRef.current.down = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') walkKeysRef.current.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') walkKeysRef.current.right = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') walkKeysRef.current.shift = false;
      if (e.code === 'Space') {
        jumpHeldRef.current = false;
        setJumpHeld(false);
      }
      syncWalkingInput();

      const ctrl = mapDriveKey(e.code);
      if (ctrl && keyInputRef.current[ctrl]) {
        keyInputRef.current[ctrl] = false;
        syncDrivingInput(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearAllInputs);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearAllInputs);
    };
  }, [clearAllInputs, syncDrivingInput, syncWalkingInput]);

  const bindTouchControl = (control: ButtonControlKey) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      activePointerIdsRef.current[control] = e.pointerId;
      if (!touchInputRef.current[control]) {
        touchInputRef.current[control] = true;
        syncDrivingInput(true);
      }
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (activePointerIdsRef.current[control] === e.pointerId) {
        activePointerIdsRef.current[control] = null;
        if (touchInputRef.current[control]) {
          touchInputRef.current[control] = false;
          syncDrivingInput(true);
        }
      }
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (activePointerIdsRef.current[control] === e.pointerId) {
        activePointerIdsRef.current[control] = null;
        if (touchInputRef.current[control]) {
          touchInputRef.current[control] = false;
          syncDrivingInput(true);
        }
      }
    },
    onLostPointerCapture: () => {
      if (activePointerIdsRef.current[control] !== null) {
        activePointerIdsRef.current[control] = null;
        if (touchInputRef.current[control]) {
          touchInputRef.current[control] = false;
          syncDrivingInput(true);
        }
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  // Free Fire 360 Virtual Joystick Handlers
  const updateJoystickFromEvent = (clientX: number, clientY: number) => {
    const el = joyBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = rect.width * 0.38;

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setJoyKnob({ x: dx, y: dy, active: true });

    const sens = controlPrefsRef.current.joystickSensitivity;
    const nx = Math.max(-1, Math.min(1, (dx / maxR) * sens));
    const ny = Math.max(-1, Math.min(1, (-dy / maxR) * sens));
    joyStickVecRef.current = { x: nx, y: ny };
    syncWalkingInput();
  };

  const resetJoystick = () => {
    joyPointerIdRef.current = null;
    joyStickVecRef.current = { x: 0, y: 0 };
    setJoyKnob({ x: 0, y: 0, active: false });
    syncWalkingInput();
  };

  // Driving Analog Steering Stick Handlers (drag Left -> positive steerLeft)
  const updateDriveJoystickFromEvent = (clientX: number) => {
    const el = driveJoyBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const maxR = rect.width * 0.36;
    const dx = Math.max(-maxR, Math.min(maxR, clientX - cx));
    setDriveJoyKnob({ x: dx, active: true });

    const sens = controlPrefsRef.current.joystickSensitivity;
    driveSteerAnalogRef.current = Math.max(-1, Math.min(1, (-dx / maxR) * sens));
    syncDrivingInput(false);
  };

  const resetDriveJoystick = () => {
    driveJoyPointerIdRef.current = null;
    driveSteerAnalogRef.current = 0;
    setDriveJoyKnob({ x: 0, active: false });
    syncDrivingInput(false);
  };

  // Driving Steering Wheel Handlers (turn left / CCW -> positive steerLeft)
  const getWheelPointerAngle = (clientX: number, clientY: number): number | null => {
    const el = wheelBaseRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const dx = clientX - cx;
    const dy = clientY - cy;
    if (Math.hypot(dx, dy) < 6) return null;
    return Math.atan2(dy, dx);
  };

  const updateWheelFromEvent = (clientX: number, clientY: number) => {
    const angle = getWheelPointerAngle(clientX, clientY);
    if (angle === null) return;
    if (wheelPrevAngleRef.current === null) {
      wheelPrevAngleRef.current = angle;
      return;
    }
    let deltaRad = angle - wheelPrevAngleRef.current;
    while (deltaRad > Math.PI) deltaRad -= Math.PI * 2;
    while (deltaRad < -Math.PI) deltaRad += Math.PI * 2;
    wheelPrevAngleRef.current = angle;

    const deltaDeg = (-deltaRad * 180) / Math.PI;
    const nextDeg = Math.max(-135, Math.min(135, wheelAngleDegRef.current + deltaDeg));
    wheelAngleDegRef.current = nextDeg;
    setWheelState({ angleDeg: nextDeg, active: true });

    driveSteerAnalogRef.current = Math.max(-1, Math.min(1, nextDeg / 90));
    syncDrivingInput(false);
  };

  const resetWheel = () => {
    wheelPointerIdRef.current = null;
    wheelPrevAngleRef.current = null;
    wheelAngleDegRef.current = 0;
    driveSteerAnalogRef.current = 0;
    setWheelState({ angleDeg: 0, active: false });
    syncDrivingInput(false);
  };

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        if (typeof screen !== 'undefined') {
          const orientation = screen.orientation as unknown as {
            lock?: (mode: string) => Promise<void>;
          };
          if (orientation?.lock) {
            orientation.lock('landscape').catch(() => {});
          }
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen may be restricted by container iframe policy
    }
  };

  const handleTryFullscreenLandscape = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen failures (e.g. iOS Safari)
    }
    try {
      if (typeof screen !== 'undefined') {
        const orientation = screen.orientation as unknown as {
          lock?: (mode: string) => Promise<void>;
        };
        if (orientation?.lock) {
          await orientation.lock('landscape');
        }
      }
    } catch {
      // Ignore orientation lock failures
    }
  };

  const handleSavePrefs = (next: ControlPreferences) => {
    setControlPrefs(next);
    setCustomizerOpen(false);
  };

  const handleSelectCamera = (preset: CameraPreset) => {
    setActivePreset(preset);
    engineRef.current?.setCameraPreset(preset);
  };

  const handleToggleHeadlights = () => {
    const next = !headlightsOn;
    setHeadlightsOn(next);
    engineRef.current?.setHeadlightsEnabled(next);
  };

  const handleSelectGear = (nextGear: GearMode) => {
    setGear(nextGear);
    engineRef.current?.setGear(nextGear);
  };

  const handleCycleTime = () => {
    const idx = TIME_CYCLE.indexOf(timeMode);
    const next = TIME_CYCLE[(idx + 1) % TIME_CYCLE.length];
    setTimeMode(next);
    engineRef.current?.setTimeMode(next);
  };

  const handleToggleWeather = () => {
    const next: WeatherMode = weatherMode === 'clear' ? 'rain' : 'clear';
    setWeatherMode(next);
    engineRef.current?.setWeatherMode(next);
  };

  const handleToggleGyro = async () => {
    if (!gyroEnabled) {
      const DeviceOri = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (DeviceOri && typeof DeviceOri.requestPermission === 'function') {
        try {
          const perm = await DeviceOri.requestPermission();
          if (perm !== 'granted') return;
        } catch {
          return;
        }
      }
      gyroOffsetRef.current = latestRawTiltRef.current;
      setGyroEnabled(true);
    } else {
      setGyroEnabled(false);
    }
  };

  const {
    mode,
    activeVehicleLabel,
    speedKmh,
    carHealth,
    repairing,
    repairProgress,
    timeOfDayLabel,
    navTurn,
    nearbyVehicle,
    police,
  } = telemetry;

  const isMirrored = controlPrefs.handedness === 'left';
  const moveSideStyle = {
    opacity: controlPrefs.buttonOpacity,
    transform: `translate(${isMirrored ? -controlPrefs.offsets.leftPadX : controlPrefs.offsets.leftPadX}px, ${controlPrefs.offsets.leftPadY}px) scale(${controlPrefs.joystickScale})`,
    transformOrigin: isMirrored ? 'bottom right' : 'bottom left',
  };
  const pedalsSideStyle = {
    opacity: controlPrefs.buttonOpacity,
    transform: `translate(${isMirrored ? -controlPrefs.offsets.rightPadX : controlPrefs.offsets.rightPadX}px, ${controlPrefs.offsets.rightPadY}px) scale(${controlPrefs.pedalsScale})`,
    transformOrigin: isMirrored ? 'bottom left' : 'bottom right',
  };
  const actionPadStyle = {
    opacity: controlPrefs.buttonOpacity,
    transform: `translate(${isMirrored ? -controlPrefs.offsets.actionPadX : controlPrefs.offsets.actionPadX}px, ${controlPrefs.offsets.actionPadY}px) scale(${controlPrefs.actionScale})`,
    transformOrigin: isMirrored ? 'bottom left' : 'bottom right',
  };

  const isWalkingHud = mode === 'walking' || mode === 'entering' || mode === 'exiting';
  const isDrivingHud = mode === 'driving';

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-sky-900 select-none">
      {/* Isolated WebGL canvas container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="City Drive 3D Viewport"
      />

      {/* Free Fire Camera-Look Touch Zone in BOTH Driving & Walking Modes */}
      {(isWalkingHud || isDrivingHud) && (
        <div
          aria-label="Camera Look Touch Area"
          onPointerDown={(e) => {
            if (lookPointerIdRef.current !== null) return;
            lookPointerIdRef.current = e.pointerId;
            lookPrevRef.current = { x: e.clientX, y: e.clientY };
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Ignore
            }
          }}
          onPointerMove={(e) => {
            if (lookPointerIdRef.current !== e.pointerId || !lookPrevRef.current) return;
            const dx = e.clientX - lookPrevRef.current.x;
            const dy = e.clientY - lookPrevRef.current.y;
            lookPrevRef.current = { x: e.clientX, y: e.clientY };
            engineRef.current?.applyCameraLook(dx * 1.35, dy * 1.15);
          }}
          onPointerUp={(e) => {
            if (lookPointerIdRef.current === e.pointerId) {
              lookPointerIdRef.current = null;
              lookPrevRef.current = null;
            }
          }}
          onPointerCancel={(e) => {
            if (lookPointerIdRef.current === e.pointerId) {
              lookPointerIdRef.current = null;
              lookPrevRef.current = null;
            }
          }}
          className={`absolute inset-y-0 z-10 w-1/2 touch-none ${
            isMirrored ? 'left-0' : 'right-0'
          }`}
        />
      )}

      {/* Top-Left Brand, Speed/Vehicle/On-Foot Badge, Fullscreen & Layout Buttons, Police Pursuit Status */}
      <header className="pointer-events-none absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight text-white drop-shadow-[0_2px_6px_rgba(8,18,38,0.65)] whitespace-nowrap">
            City Drive
          </h1>

          {/* Digital Speedometer + Mode Badge */}
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-950/85 border border-white/15 px-2 py-0.5 text-xs text-white shadow">
            {isDrivingHud ? (
              <>
                <span className="font-mono font-bold text-sky-300">{speedKmh}</span>
                <span className="text-[10px] text-slate-300">km/h</span>
                <span className="rounded bg-sky-500/20 border border-sky-400/40 px-1 text-[10px] font-bold text-sky-200">
                  {gear}
                </span>
                <span className="hidden sm:inline text-[10px] text-slate-300 border-l border-white/15 pl-1.5">
                  {activeVehicleLabel}
                </span>
              </>
            ) : (
              <>
                <Footprints className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-[11px] font-semibold text-emerald-200">
                  {mode === 'arrested' ? 'Arrested' : 'On Foot'}
                </span>
                <span className="font-mono text-[10px] text-slate-300">{speedKmh} km/h</span>
              </>
            )}
          </div>

          {/* Screen Layout Customizer + Landscape Fullscreen Buttons */}
          <div className="pointer-events-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                clearAllInputs();
                setCustomizerOpen(true);
              }}
              title="Customize Mobile Controls"
              aria-label="Customize Mobile Controls"
              className="flex items-center gap-1 rounded-lg bg-slate-950/85 border border-white/15 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-900 hover:text-white cursor-pointer shadow"
            >
              <Sliders className="w-3.5 h-3.5 text-sky-300" />
              <span className="hidden sm:inline">Layout</span>
            </button>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Landscape Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="flex items-center justify-center rounded-lg bg-slate-950/85 border border-white/15 p-1.5 text-slate-200 hover:bg-slate-900 hover:text-white cursor-pointer shadow"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5 text-sky-300" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 text-sky-300" />
              )}
            </button>
          </div>
        </div>

        {/* Car Health & Repair Badge (Driving mode only, directly below speedometer) */}
        {isDrivingHud && (
          <div className="flex items-center gap-2 self-start rounded-lg bg-slate-950/85 border border-white/15 px-2 py-1 text-xs text-white shadow">
            <span className="text-[11px] font-semibold text-slate-200">Car</span>
            <div className="w-20 h-2 rounded-full bg-slate-800 overflow-hidden border border-white/10">
              <div
                style={{ width: `${carHealth}%` }}
                className={`h-full transition-all duration-150 ${
                  carHealth > 50
                    ? 'bg-emerald-500'
                    : carHealth > 20
                      ? 'bg-amber-400'
                      : 'bg-rose-500'
                }`}
              />
            </div>
            <span className="font-mono text-[11px] font-bold text-slate-100">{carHealth}%</span>
            {carHealth < 100 &&
              (repairing ? (
                <span className="text-[11px] font-semibold text-sky-300">
                  Repairing {Math.round(repairProgress * 100)}%
                </span>
              ) : (
                <button
                  type="button"
                  disabled={speedKmh > 2}
                  onClick={() => engineRef.current?.startRepair()}
                  className={`pointer-events-auto rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    speedKmh > 2
                      ? 'bg-slate-800 text-slate-500 border border-white/10 cursor-not-allowed'
                      : 'bg-sky-500 text-slate-950 hover:bg-sky-400 cursor-pointer'
                  }`}
                >
                  Repair
                </button>
              ))}
          </div>
        )}

        {/* Police Wanted Stars & Pursuit Status */}
        {(police.wantedLevel > 0 || police.status !== 'patrol') && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-slate-950/85 border border-white/15 px-2 py-1 shadow">
              {[1, 2, 3].map((lvl) => (
                <Star
                  key={lvl}
                  className={`w-3.5 h-3.5 ${
                    lvl <= police.wantedLevel
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-slate-600'
                  }`}
                />
              ))}
            </div>

            {police.status === 'pursuit' && (
              <div className="flex items-center gap-1.5 rounded-lg bg-rose-950/90 border border-rose-400/50 px-2.5 py-1 text-[11px] font-semibold text-rose-100">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>
                  Police Pursuit ({police.pendingReasons.length} alert
                  {police.pendingReasons.length === 1 ? '' : 's'})
                </span>
              </div>
            )}

            {police.status === 'officer_approach' && (
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-950/95 border border-amber-400/70 px-2.5 py-1 text-[11px] font-bold text-amber-100 animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>Police Officer Approaching!</span>
              </div>
            )}

            {police.status === 'escaped' && (
              <div className="rounded-lg bg-emerald-600/95 border border-emerald-300 px-2.5 py-1 text-[11px] font-bold text-white shadow">
                ESCAPED POLICE
              </div>
            )}
          </div>
        )}
      </header>

      {/* Interactive Mini-Map & Expandable Full-Screen City Map */}
      <CityMapOverlay
        getSnapshot={() => engineRef.current?.getMapSnapshot() ?? null}
        activeDestination={activeDestination}
        navTurn={navTurn}
        onSelectDestination={(dest) => engineRef.current?.setDestination(dest)}
        onModalOpenChange={(open) => {
          if (open) clearAllInputs();
        }}
      />

      {/* Full-Screen Landscape Prompt Overlay (touch phones in portrait only) */}
      {isTouchPortrait && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-950/95 p-6 text-center text-white">
          <div className="rounded-2xl bg-sky-500/15 border border-sky-400/30 p-4 text-sky-300">
            <RotateCw className="w-10 h-10" />
          </div>
          <h2 className="font-display text-xl font-bold text-white">Turn your phone sideways</h2>
          <p className="max-w-xs text-sm text-slate-300">
            City Drive is played in landscape with both thumbs. Rotate your phone to start.
          </p>
          <button
            type="button"
            onClick={handleTryFullscreenLandscape}
            className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer shadow-lg"
          >
            Try Fullscreen Landscape
          </button>
        </div>
      )}

      {/* Gyroscope Calibration Drawer */}
      {gyroPanelOpen && isDrivingHud && (
        <div className="pointer-events-auto absolute bottom-24 left-3 sm:left-4 z-30 w-56 rounded-xl border border-white/20 bg-slate-950/95 p-3 text-xs text-slate-100 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-sky-400" />
              Gyro Steering
            </span>
            <button
              type="button"
              onClick={handleToggleGyro}
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold cursor-pointer ${
                gyroEnabled
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 border border-white/10'
              }`}
            >
              {gyroEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <label className="block text-[11px] text-slate-300 mb-1">
            Sensitivity: <span className="font-mono text-sky-300">{gyroSensitivity.toFixed(2)}x</span>
          </label>
          <input
            type="range"
            min={0.5}
            max={2.5}
            step={0.05}
            value={gyroSensitivity}
            onChange={(e) => setGyroSensitivity(parseFloat(e.target.value))}
            className="w-full accent-sky-400 cursor-pointer"
          />
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                gyroOffsetRef.current = latestRawTiltRef.current;
              }}
              className="flex-1 rounded-lg bg-sky-500/20 border border-sky-400/40 px-2 py-1.5 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/30 cursor-pointer"
            >
              Calibrate Zero
            </button>
            <button
              type="button"
              onClick={() => setGyroPanelOpen(false)}
              className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/90 p-6">
          <div className="max-w-sm rounded-xl border border-white/15 bg-slate-900 p-6 text-center">
            <p className="font-display text-lg font-semibold text-white">3D Graphics Paused</p>
            <p className="mt-2 text-sm text-slate-300">
              WebGL context was interrupted by the device. Restoring rendering automatically.
            </p>
          </div>
        </div>
      )}

      {/* ============================================================
          DUAL-THUMB DRIVING CONTROLS HUD
          ============================================================ */}
      {isDrivingHud && (
        <>
          {/* Left-Thumb Steering Pad (Virtual Analog Stick or Optional L/R Tap Buttons) */}
          <div
            style={moveSideStyle}
            className={`pointer-events-auto absolute bottom-4 sm:bottom-5 z-20 flex flex-col gap-2 touch-none select-none ${
              isMirrored ? 'right-4 sm:right-5 items-end' : 'left-4 sm:left-5 items-start'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  resetDriveJoystick();
                  resetWheel();
                  setSteerMode((prev) =>
                    prev === 'stick' ? 'buttons' : prev === 'buttons' ? 'wheel' : 'stick'
                  );
                }}
                className={`rounded-lg border px-2 py-1 text-[10px] font-semibold cursor-pointer ${
                  steerMode !== 'buttons'
                    ? 'bg-sky-500/25 border-sky-400/60 text-sky-200'
                    : 'bg-slate-950/85 border-white/15 text-slate-200 hover:text-white'
                }`}
              >
                {steerMode === 'stick' ? 'Stick' : steerMode === 'buttons' ? 'L / R' : 'Wheel'}
              </button>

              <button
                type="button"
                onClick={() => setGyroPanelOpen((p) => !p)}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold cursor-pointer ${
                  gyroEnabled
                    ? 'bg-emerald-500/25 border-emerald-400/60 text-emerald-200'
                    : 'bg-slate-950/85 border-white/15 text-slate-200 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Gyro {gyroEnabled ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                aria-label="Horn"
                aria-pressed={hornActive}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHornActive(true);
                  engineRef.current?.setHornActive(true);
                }}
                onPointerUp={() => {
                  setHornActive(false);
                  engineRef.current?.setHornActive(false);
                }}
                onPointerCancel={() => {
                  setHornActive(false);
                  engineRef.current?.setHornActive(false);
                }}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-semibold cursor-pointer touch-none ${
                  hornActive
                    ? 'bg-amber-400 text-slate-950 border-amber-200 scale-95'
                    : 'bg-slate-950/85 border-white/15 text-amber-200 hover:bg-slate-900'
                }`}
              >
                <Volume2 className="w-3 h-3" />
                <span>Horn</span>
              </button>
            </div>

            {steerMode === 'stick' && (
              <div className="flex flex-col items-center gap-1">
                <div
                  ref={driveJoyBaseRef}
                  aria-label="Steering Virtual Stick"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    driveJoyPointerIdRef.current = e.pointerId;
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // Ignore
                    }
                    updateDriveJoystickFromEvent(e.clientX);
                  }}
                  onPointerMove={(e) => {
                    if (driveJoyPointerIdRef.current !== e.pointerId) return;
                    e.preventDefault();
                    updateDriveJoystickFromEvent(e.clientX);
                  }}
                  onPointerUp={(e) => {
                    if (driveJoyPointerIdRef.current === e.pointerId) {
                      resetDriveJoystick();
                    }
                  }}
                  onPointerCancel={(e) => {
                    if (driveJoyPointerIdRef.current === e.pointerId) {
                      resetDriveJoystick();
                    }
                  }}
                  onLostPointerCapture={resetDriveJoystick}
                  className="relative w-32 h-24 sm:w-36 sm:h-28 rounded-full border-2 border-white/25 bg-slate-950/65 flex items-center justify-center shadow-xl touch-none"
                >
                  <ArrowLeft className="w-4 h-4 text-white/35 absolute left-2.5 pointer-events-none" />
                  <ArrowRight className="w-4 h-4 text-white/35 absolute right-2.5 pointer-events-none" />
                  <div className="w-20 h-1 bg-white/15 rounded-full pointer-events-none" />
                  <div
                    style={{
                      transform: `translate(${driveJoyKnob.x}px, 0px)`,
                    }}
                    className={`absolute w-12 h-12 rounded-full border-2 shadow-lg pointer-events-none transition-colors ${
                      driveJoyKnob.active
                        ? 'bg-sky-400 border-white'
                        : 'bg-slate-200/90 border-sky-300'
                    }`}
                  />
                </div>
                <span className="text-[10px] font-semibold tracking-wide text-white/80 drop-shadow">
                  Steer Stick (A/D)
                </span>
              </div>
            )}

            {steerMode === 'buttons' && (
              <div className="flex items-center gap-2.5" role="group" aria-label="Steering Controls">
                <button
                  type="button"
                  aria-label="Steer Left"
                  aria-pressed={activeControls.steerLeft}
                  {...bindTouchControl('steerLeft')}
                  className={`flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-xl border transition-transform duration-75 touch-none cursor-pointer ${
                    activeControls.steerLeft
                      ? 'bg-sky-500 text-slate-950 border-sky-300 scale-95 shadow-lg'
                      : 'bg-slate-950/82 text-white border-white/20 hover:bg-slate-900/90'
                  }`}
                >
                  <ArrowLeft className="w-6 h-6" />
                  <span className="text-[10px] font-semibold mt-0.5">Left</span>
                </button>

                <button
                  type="button"
                  aria-label="Steer Right"
                  aria-pressed={activeControls.steerRight}
                  {...bindTouchControl('steerRight')}
                  className={`flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-xl border transition-transform duration-75 touch-none cursor-pointer ${
                    activeControls.steerRight
                      ? 'bg-sky-500 text-slate-950 border-sky-300 scale-95 shadow-lg'
                      : 'bg-slate-950/82 text-white border-white/20 hover:bg-slate-900/90'
                  }`}
                >
                  <ArrowRight className="w-6 h-6" />
                  <span className="text-[10px] font-semibold mt-0.5">Right</span>
                </button>
              </div>
            )}

            {steerMode === 'wheel' && (
              <div className="flex flex-col items-center gap-1">
                <div
                  ref={wheelBaseRef}
                  aria-label="Steering Wheel"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    wheelPointerIdRef.current = e.pointerId;
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // Ignore
                    }
                    wheelPrevAngleRef.current = getWheelPointerAngle(e.clientX, e.clientY);
                    setWheelState((prev) => ({ ...prev, active: true }));
                  }}
                  onPointerMove={(e) => {
                    if (wheelPointerIdRef.current !== e.pointerId) return;
                    e.preventDefault();
                    updateWheelFromEvent(e.clientX, e.clientY);
                  }}
                  onPointerUp={(e) => {
                    if (wheelPointerIdRef.current === e.pointerId) {
                      resetWheel();
                    }
                  }}
                  onPointerCancel={(e) => {
                    if (wheelPointerIdRef.current === e.pointerId) {
                      resetWheel();
                    }
                  }}
                  onLostPointerCapture={resetWheel}
                  className="relative w-[140px] h-[140px] rounded-full flex items-center justify-center touch-none cursor-grab active:cursor-grabbing select-none"
                >
                  <svg
                    viewBox="0 0 140 140"
                    style={{ transform: `rotate(${-wheelState.angleDeg}deg)` }}
                    className={`w-[140px] h-[140px] pointer-events-none drop-shadow-xl ${
                      wheelState.active ? '' : 'transition-transform duration-150 ease-out'
                    }`}
                  >
                    {/* Subtle translucent backing */}
                    <circle
                      cx="70"
                      cy="70"
                      r="64"
                      fill="rgba(2, 6, 23, 0.55)"
                    />
                    {/* Three Spokes (Left, Right, Bottom) */}
                    <line
                      x1="70"
                      y1="70"
                      x2="16"
                      y2="64"
                      stroke="#cbd5e1"
                      strokeWidth="10"
                      strokeLinecap="round"
                    />
                    <line
                      x1="70"
                      y1="70"
                      x2="124"
                      y2="64"
                      stroke="#cbd5e1"
                      strokeWidth="10"
                      strokeLinecap="round"
                    />
                    <line
                      x1="70"
                      y1="70"
                      x2="70"
                      y2="124"
                      stroke="#cbd5e1"
                      strokeWidth="11"
                      strokeLinecap="round"
                    />
                    {/* Outer Steering Rim */}
                    <circle
                      cx="70"
                      cy="70"
                      r="56"
                      fill="none"
                      stroke={wheelState.active ? '#38bdf8' : '#e2e8f0'}
                      strokeWidth="12"
                    />
                    <circle
                      cx="70"
                      cy="70"
                      r="56"
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="3"
                    />
                    {/* Top 12-o'clock Center Stripe */}
                    <rect
                      x="66"
                      y="8"
                      width="8"
                      height="12"
                      rx="3"
                      fill={wheelState.active ? '#facc15' : '#38bdf8'}
                    />
                    {/* Center Hub */}
                    <circle
                      cx="70"
                      cy="70"
                      r="20"
                      fill="#1e293b"
                      stroke={wheelState.active ? '#38bdf8' : '#94a3b8'}
                      strokeWidth="3.5"
                    />
                    <circle cx="70" cy="70" r="7" fill="#38bdf8" />
                  </svg>
                </div>
                <span className="text-[10px] font-semibold tracking-wide text-white/80 drop-shadow">
                  Steer Wheel (A/D)
                </span>
              </div>
            )}
          </div>

          {/* Customizable Action Pad: EXIT VEHICLE + Gear Selector */}
          <div
            style={actionPadStyle}
            className={`pointer-events-auto absolute bottom-32 sm:bottom-36 z-20 flex items-center gap-2 touch-none select-none ${
              isMirrored ? 'left-4 sm:left-5' : 'right-4 sm:right-5'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                clearAllInputs();
                engineRef.current?.exitVehicle();
              }}
              aria-label="Exit Vehicle"
              className="flex items-center gap-1.5 rounded-lg bg-amber-500/95 border border-amber-300 px-2.5 py-1.5 text-[11px] font-bold text-slate-950 shadow-lg hover:bg-amber-400 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>EXIT VEHICLE</span>
            </button>

            <div
              className="flex items-center gap-1 rounded-lg bg-slate-950/88 border border-white/15 p-0.5 shadow-lg"
              role="group"
              aria-label="Gear Selector"
            >
              {GEAR_OPTIONS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => handleSelectGear(g)}
                  aria-pressed={gear === g}
                  className={`w-7 h-7 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    gear === g
                      ? g === 'R'
                        ? 'bg-rose-500 text-white'
                        : g === 'P'
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Right-Thumb Pedals Pad */}
          <div
            style={pedalsSideStyle}
            className={`pointer-events-auto absolute bottom-4 sm:bottom-5 z-20 flex flex-col gap-1.5 touch-none select-none ${
              isMirrored ? 'left-4 sm:left-5 items-start' : 'right-4 sm:right-5 items-end'
            }`}
          >
            <div className="flex items-end gap-2">
              <button
                type="button"
                aria-label="Handbrake"
                aria-pressed={activeControls.handbrake}
                {...bindTouchControl('handbrake')}
                className={`flex flex-col items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl border transition-transform duration-75 touch-none cursor-pointer ${
                  activeControls.handbrake
                    ? 'bg-amber-400 text-slate-950 border-amber-200 scale-95 shadow-lg'
                    : 'bg-slate-950/82 text-amber-300 border-amber-400/35 hover:bg-slate-900/90'
                }`}
              >
                <span className="text-xs font-extrabold">HB</span>
                <span className="text-[9px] font-semibold">Brake</span>
              </button>

              <button
                type="button"
                aria-label="Reverse"
                aria-pressed={activeControls.reverse}
                {...bindTouchControl('reverse')}
                className={`flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-xl border transition-transform duration-75 touch-none cursor-pointer ${
                  activeControls.reverse
                    ? 'bg-rose-500 text-white border-rose-300 scale-95 shadow-lg'
                    : 'bg-slate-950/82 text-slate-100 border-white/20 hover:bg-slate-900/90'
                }`}
              >
                <ArrowDown className="w-6 h-6" />
                <span className="text-[10px] font-semibold mt-0.5">Reverse</span>
              </button>

              <button
                type="button"
                aria-label="Accelerate"
                aria-pressed={activeControls.accelerate}
                {...bindTouchControl('accelerate')}
                className={`flex flex-col items-center justify-center w-14 h-16 sm:w-16 sm:h-20 rounded-xl border transition-transform duration-75 touch-none cursor-pointer ${
                  activeControls.accelerate
                    ? 'bg-emerald-400 text-slate-950 border-emerald-200 scale-95 shadow-lg'
                    : 'bg-slate-950/85 text-emerald-300 border-emerald-400/40 hover:bg-slate-900/95'
                }`}
              >
                <ArrowUp className="w-6 h-6" />
                <span className="text-[10px] font-semibold mt-0.5">
                  {gear === 'R' ? 'Rev' : 'Drive'}
                </span>
              </button>
            </div>
            <span className="text-[10px] font-semibold text-white/75 drop-shadow">
              Drag right half to rotate camera
            </span>
          </div>
        </>
      )}

      {/* ============================================================
          FREE FIRE-STYLE ON-FOOT WALKING HUD
          ============================================================ */}
      {isWalkingHud && (
        <>
          {/* Virtual 360° Walking Joystick */}
          <div
            style={moveSideStyle}
            className={`pointer-events-auto absolute bottom-5 z-20 flex flex-col items-center gap-2 touch-none select-none ${
              isMirrored ? 'right-5' : 'left-5'
            }`}
          >
            <div
              ref={joyBaseRef}
              aria-label="Walking Joystick"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                joyPointerIdRef.current = e.pointerId;
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // Ignore
                }
                updateJoystickFromEvent(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (joyPointerIdRef.current !== e.pointerId) return;
                e.preventDefault();
                updateJoystickFromEvent(e.clientX, e.clientY);
              }}
              onPointerUp={(e) => {
                if (joyPointerIdRef.current === e.pointerId) {
                  resetJoystick();
                }
              }}
              onPointerCancel={(e) => {
                if (joyPointerIdRef.current === e.pointerId) {
                  resetJoystick();
                }
              }}
              onLostPointerCapture={resetJoystick}
              className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full border-2 border-white/25 bg-slate-950/60 flex items-center justify-center shadow-xl touch-none"
            >
              <div className="w-16 h-16 rounded-full border border-white/10 pointer-events-none" />
              <div
                style={{
                  transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
                }}
                className={`absolute w-12 h-12 rounded-full border-2 shadow-lg pointer-events-none transition-colors ${
                  joyKnob.active
                    ? 'bg-sky-400 border-white'
                    : 'bg-slate-200/90 border-sky-300'
                }`}
              />
            </div>
            <span className="text-[10px] font-semibold tracking-wide text-white/85 drop-shadow">
              Move (WASD / Stick)
            </span>
          </div>

          {/* Dynamic Contextual ENTER VEHICLE Prompt Button (follows customizable actionPad) */}
          {nearbyVehicle && (
            <div
              style={actionPadStyle}
              className={`pointer-events-auto absolute bottom-32 sm:bottom-36 z-20 touch-none select-none ${
                isMirrored ? 'left-5' : 'right-5'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  clearAllInputs();
                  engineRef.current?.enterNearestVehicle();
                }}
                className="flex items-center gap-2 rounded-xl bg-emerald-500 border-2 border-emerald-200 px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-950 shadow-2xl hover:bg-emerald-400 active:scale-95 cursor-pointer"
              >
                <CarFront className="w-4 h-4 shrink-0" />
                <span>Enter {nearbyVehicle.label} (E)</span>
              </button>
            </div>
          )}

          {/* Free Fire Right-Thumb Action Buttons: Run, Jump */}
          <div
            style={pedalsSideStyle}
            className={`pointer-events-auto absolute bottom-5 z-20 flex flex-col gap-2.5 touch-none select-none ${
              isMirrored ? 'left-5 items-start' : 'right-5 items-end'
            }`}
          >

            <div className="flex items-end gap-3">
              {/* Sprint / Run Toggle */}
              <button
                type="button"
                aria-pressed={runToggle}
                onClick={() => {
                  const next = !runToggle;
                  setRunToggle(next);
                  runToggleRef.current = next;
                  syncWalkingInput();
                }}
                className={`flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 shadow-xl transition-transform cursor-pointer ${
                  runToggle
                    ? 'bg-amber-400 text-slate-950 border-amber-100 scale-95'
                    : 'bg-slate-950/82 text-amber-300 border-amber-400/50 hover:bg-slate-900'
                }`}
              >
                <Zap className="w-5 h-5" />
                <span className="text-[10px] font-bold mt-0.5">{runToggle ? 'Running' : 'Run'}</span>
              </button>

              {/* Jump Button */}
              <button
                type="button"
                aria-label="Jump"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  jumpHeldRef.current = true;
                  setJumpHeld(true);
                  syncWalkingInput();
                }}
                onPointerUp={() => {
                  jumpHeldRef.current = false;
                  setJumpHeld(false);
                  syncWalkingInput();
                }}
                onPointerCancel={() => {
                  jumpHeldRef.current = false;
                  setJumpHeld(false);
                  syncWalkingInput();
                }}
                className={`flex flex-col items-center justify-center w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full border-2 shadow-xl transition-transform cursor-pointer touch-none ${
                  jumpHeld
                    ? 'bg-sky-400 text-slate-950 border-white scale-95'
                    : 'bg-slate-950/85 text-sky-200 border-sky-400/60 hover:bg-slate-900'
                }`}
              >
                <ArrowUp className="w-6 h-6" />
                <span className="text-[10px] font-bold">Jump</span>
              </button>
            </div>

            <span className="text-[10px] font-semibold text-white/80 drop-shadow">
              Drag right half to look
            </span>
          </div>
        </>
      )}

      {/* Collapsible Camera, Lights, Day/Night & Rain Dock (Driving Mode) */}
      {isDrivingHud && (
        <div
          className={`pointer-events-none absolute top-[134px] right-3 sm:top-auto sm:right-auto sm:bottom-3 md:bottom-4 sm:left-1/2 sm:-translate-x-1/2 z-20 flex flex-col items-end sm:items-center transition-transform duration-200 ease-out ${
            dockCollapsed
              ? 'sm:translate-y-[calc(100%-34px)] translate-x-[calc(100%-78px)] sm:translate-x-0'
              : 'translate-y-0 translate-x-0'
          }`}
        >
          <button
            type="button"
            onClick={() => setDockCollapsed((prev) => !prev)}
            className="pointer-events-auto order-1 mb-1 sm:mb-1.5 flex items-center gap-1 rounded-md sm:rounded-t-lg sm:rounded-b-sm bg-slate-950/85 border border-white/15 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            aria-expanded={!dockCollapsed}
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide</span>
              </>
            )}
          </button>

          <div className="pointer-events-auto order-2 flex flex-wrap justify-end sm:justify-center items-center gap-1 sm:gap-1.5 rounded-xl bg-slate-950/88 border border-white/15 px-1.5 sm:px-2 py-1 sm:py-1.5 shadow-xl max-w-[210px] sm:max-w-[335px] md:max-w-none">
            <div className="flex items-center gap-0.5 rounded-lg bg-slate-900/90 p-0.5">
              <Camera className="w-3.5 h-3.5 text-sky-400 ml-1 mr-0.5 shrink-0" aria-hidden="true" />
              {CAMERA_OPTIONS.map((opt) => {
                const isActive = activePreset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectCamera(opt.id)}
                    className={`min-h-[30px] px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : 'text-slate-200 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="h-5 w-px bg-white/15 shrink-0 hidden sm:block" aria-hidden="true" />

            <button
              type="button"
              onClick={handleToggleHeadlights}
              aria-pressed={headlightsOn}
              className={`min-h-[30px] flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                headlightsOn
                  ? 'bg-amber-400/20 text-amber-200 border border-amber-400/40'
                  : 'bg-slate-900/90 text-slate-300 border border-white/10 hover:text-white'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden lg:inline">{headlightsOn ? 'Lights' : 'Off'}</span>
            </button>

            <button
              type="button"
              onClick={handleCycleTime}
              className="min-h-[30px] flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-900/90 text-sky-200 border border-white/15 hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sun className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>{timeMode === 'auto' ? `Auto (${timeOfDayLabel})` : timeOfDayLabel}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleWeather}
              aria-pressed={weatherMode === 'rain'}
              className={`min-h-[30px] flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                weatherMode === 'rain'
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                  : 'bg-slate-900/90 text-slate-300 border border-white/10 hover:text-white'
              }`}
            >
              <CloudRain className="w-3.5 h-3.5 shrink-0" />
              <span>{weatherMode === 'rain' ? 'Rain' : 'Clear'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Police Arrest Ticket Modal — ONLY shown after Officer physically catches & arrests player */}
      {police.activeTicket && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Police Arrest Citation"
        >
          <div className="w-full max-w-sm rounded-2xl border border-rose-400/50 bg-slate-900 p-5 text-slate-100 shadow-2xl">
            <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
              <div className="rounded-xl bg-rose-500/20 p-2 text-rose-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-white">Arrested by Police</h2>
                <p className="text-xs text-slate-300">
                  Officer issued citation #{police.activeTicket.id}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              {police.activeTicket.violations.map((reason, idx) => (
                <div
                  key={`${reason}-${idx}`}
                  className="flex items-center rounded-lg bg-slate-950/70 px-3 py-2 text-xs"
                >
                  <span className="text-slate-200">{reason}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                clearAllInputs();
                engineRef.current?.acknowledgeArrest();
              }}
              className="mt-4 w-full rounded-xl bg-sky-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Control Customizer Modal */}
      {customizerOpen && (
        <ControlCustomizerModal
          initialPrefs={controlPrefs}
          onSave={handleSavePrefs}
          onClose={() => setCustomizerOpen(false)}
        />
      )}
    </div>
  );
}
