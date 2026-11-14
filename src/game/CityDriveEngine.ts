import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBlueSportsCar, type SportsCarHandle } from './car';
import { createAnimeCity, type CityEnvironmentHandle } from './city';
import {
  computeNavigationRoute,
  computeRouteDistance,
  computeTurnInstruction,
  type RoutePoint,
} from './navigation';
import { createPlayerCharacter, type PlayerCharacterHandle } from './playerCharacter';
import { createPoliceSystem, type PoliceSystemHandle } from './police';
import { createPedestrianSystem, type PedestrianSystemHandle } from './population';
import { createAnimeSkyDome, type SkyDomeHandle } from './sky';
import {
  groundHeightAt,
  groundPitchAt,
  isObstacleOrWaterBlocked,
  isOnPavedRoad,
  resolveRoadPosition,
  resolveWalkPosition,
  type LandmarkLocation,
} from './roadNetwork';
import { cityAudio } from './sound';
import { createCityTextures, type ProceduralTextureSet } from './textures';
import { createTrafficSystem, type TrafficSystemHandle } from './traffic';
import { createWeatherSystem, type WeatherSystemHandle } from './weather';
import type {
  CameraPreset,
  CityDriveCallbacks,
  DrivingInput,
  GearMode,
  HudTelemetry,
  MapSnapshot,
  NavigationTurnInfo,
  NearbyVehiclePrompt,
  PlayerMode,
  TimeMode,
  VehicleKind,
  WalkingInput,
  WeatherMode,
} from './types';

// Pre-allocated scratch vectors & colors for zero-GC render loop
const _camTargetPos = new THREE.Vector3();
const _lookTargetPos = new THREE.Vector3();
const _daySunCol = new THREE.Color(0xfff4df);
const _sunsetSunCol = new THREE.Color(0xff9654);
const _moonCol = new THREE.Color(0x6b8cff);
const _dayFogCol = new THREE.Color(0xcdeaff);
const _sunsetFogCol = new THREE.Color(0xf0a67e);
const _nightFogCol = new THREE.Color(0x131d36);
const _rainFogCol = new THREE.Color(0x5a6b82);
const _tmpFogCol = new THREE.Color();
const _dayHemiSky = new THREE.Color(0x88ccff);
const _nightHemiSky = new THREE.Color(0x283e75);
const _dayHemiGnd = new THREE.Color(0x5d6775);
const _nightHemiGnd = new THREE.Color(0x161d2b);

interface CameraSphericalState {
  azimuth: number; // 0 = directly behind car (+Z looking toward -Z)
  elevation: number; // radians above horizon
  distance: number;
  lookZOffset: number;
  lookYOffset: number;
}

const CAMERA_PRESETS: Record<CameraPreset, CameraSphericalState> = {
  chase: {
    azimuth: 0.0,
    elevation: 0.24,
    distance: 7.8,
    lookZOffset: -2.6,
    lookYOffset: 1.15,
  },
  low: {
    azimuth: 0.22,
    elevation: 0.11,
    distance: 6.2,
    lookZOffset: -1.5,
    lookYOffset: 0.85,
  },
  side: {
    azimuth: 1.18,
    elevation: 0.22,
    distance: 7.4,
    lookZOffset: -0.2,
    lookYOffset: 0.95,
  },
  wide: {
    azimuth: -0.34,
    elevation: 0.38,
    distance: 11.4,
    lookZOffset: -4.2,
    lookYOffset: 1.35,
  },
  driver: {
    azimuth: 0.0,
    elevation: 0.0,
    distance: 0.01,
    lookZOffset: -18.0,
    lookYOffset: 1.15,
  },
};

const DRIVER_SEAT_OFFSETS: Record<VehicleKind, { side: number; height: number; fwd: number }> = {
  sports: { side: -0.35, height: 1.15, fwd: 0.08 },
  car: { side: -0.36, height: 1.32, fwd: 0.15 },
  vip: { side: -0.36, height: 1.34, fwd: 0.15 },
  pickup: { side: -0.38, height: 1.56, fwd: 0.25 },
  bus: { side: -0.55, height: 2.08, fwd: 2.2 },
  truck: { side: -0.52, height: 2.15, fwd: 1.4 },
  tank: { side: 0.0, height: 2.05, fwd: 0.8 },
  motorcycle: { side: 0.0, height: 1.38, fwd: 0.05 },
  tractor: { side: 0.0, height: 1.85, fwd: -0.2 },
  airplane: { side: 0.0, height: 1.65, fwd: 0.6 },
  helicopter: { side: -0.3, height: 1.65, fwd: 0.6 },
};

interface VehicleHandlingSpec {
  maxFwdSpeed: number;
  maxRevSpeed: number;
  accelRate: number;
  brakeRate: number;
  turnRate: number;
  cameraDistance: number;
}

const VEHICLE_HANDLING: Record<VehicleKind, VehicleHandlingSpec> = {
  sports: {
    maxFwdSpeed: 28.0,
    maxRevSpeed: -10.5,
    accelRate: 14.2,
    brakeRate: 27.5,
    turnRate: 2.38,
    cameraDistance: 7.8,
  },
  car: {
    maxFwdSpeed: 23.0,
    maxRevSpeed: -9.0,
    accelRate: 11.5,
    brakeRate: 24.0,
    turnRate: 2.15,
    cameraDistance: 7.8,
  },
  bus: {
    maxFwdSpeed: 16.0,
    maxRevSpeed: -6.5,
    accelRate: 7.4,
    brakeRate: 19.0,
    turnRate: 1.48,
    cameraDistance: 11.2,
  },
  truck: {
    maxFwdSpeed: 17.5,
    maxRevSpeed: -7.2,
    accelRate: 8.2,
    brakeRate: 20.0,
    turnRate: 1.62,
    cameraDistance: 10.6,
  },
  motorcycle: {
    maxFwdSpeed: 29.5,
    maxRevSpeed: -5.0,
    accelRate: 16.2,
    brakeRate: 28.0,
    turnRate: 2.85,
    cameraDistance: 5.8,
  },
  tractor: {
    maxFwdSpeed: 11.5,
    maxRevSpeed: -5.5,
    accelRate: 8.5,
    brakeRate: 22.0,
    turnRate: 2.5,
    cameraDistance: 7.4,
  },
  pickup: {
    maxFwdSpeed: 22.0,
    maxRevSpeed: -8.5,
    accelRate: 11.2,
    brakeRate: 23.0,
    turnRate: 2.05,
    cameraDistance: 8.4,
  },
  vip: {
    maxFwdSpeed: 26.0,
    maxRevSpeed: -9.0,
    accelRate: 13.0,
    brakeRate: 25.0,
    turnRate: 2.1,
    cameraDistance: 8.5,
  },
  tank: {
    maxFwdSpeed: 14.0,
    maxRevSpeed: -5.0,
    accelRate: 6.0,
    brakeRate: 22.0,
    turnRate: 1.2,
    cameraDistance: 11.0,
  },
  airplane: {
    maxFwdSpeed: 45.0,
    maxRevSpeed: -10.0,
    accelRate: 18.0,
    brakeRate: 30.0,
    turnRate: 2.5,
    cameraDistance: 12.0,
  },
  helicopter: {
    maxFwdSpeed: 32.0,
    maxRevSpeed: -10.0,
    accelRate: 12.0,
    brakeRate: 20.0,
    turnRate: 2.8,
    cameraDistance: 10.0,
  },
};

const PLAYER_BLUE_SPORTS_ID = 'player_blue_sports';

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export class CityDriveEngine {
  private container: HTMLElement;
  private callbacks: CityDriveCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private envRenderTarget: THREE.WebGLRenderTarget;

  private textures: ProceduralTextureSet;
  private skyDome: SkyDomeHandle;
  private city: CityEnvironmentHandle;
  private pedestrians: PedestrianSystemHandle;
  private traffic: TrafficSystemHandle;
  private police: PoliceSystemHandle;
  private weather: WeatherSystemHandle;
  private car: SportsCarHandle;
  private playerChar: PlayerCharacterHandle;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3(38, 56, 26);
  private readonly dynamicSunDir = new THREE.Vector3(38, 56, 26);

  // Day/Night & Weather state
  private timeMode: TimeMode = 'auto';
  private weatherMode: WeatherMode = 'clear';
  private rainFactor = 0;
  private nightFactor = 0;
  private timeOfDayLabel: 'Day' | 'Sunset' | 'Night' = 'Day';

  // Navigation & Mini-Map state
  private activeDestination: LandmarkLocation | null = null;
  private activeRoute: RoutePoint[] = [];
  private remainingDistance = 0;
  private navTurn: NavigationTurnInfo | null = null;
  private lastRouteRefreshTime = -10;
  private lastTelemetryTime = -10;
  private hitPoliceThisStep = false;
  private hitPedestrianThisStep = false;

  private frameId = 0;
  private disposed = false;

  // Player Mode & Vehicle Registry
  private playerMode: PlayerMode = 'driving';
  private activeVehicleId: string = PLAYER_BLUE_SPORTS_ID;
  private activeVehicleKind: VehicleKind = 'sports';
  private activeVehicleLabel = 'Blue Sports Car';
  private sportsCarPos = { x: 0, z: 0, heading: 0 };
  private ownedVehicleIds = new Set<string>([PLAYER_BLUE_SPORTS_ID]);

  // Active Vehicle Driving State
  private drivingInput: DrivingInput = {
    accelerate: false,
    reverse: false,
    steerLeft: false,
    steerRight: false,
    handbrake: false,
    gyroSteer: 0,
  };
  private static readonly IDLE_RPM = 800;
  private static readonly REDLINE_RPM = 7000;
  private static readonly GEAR_SPEED_CAPS: Record<'1' | '2' | '3' | '4' | '5' | '6', number> = {
    '1': 0.25,
    '2': 0.4,
    '3': 0.6,
    '4': 0.78,
    '5': 0.9,
    '6': 1.0,
  };
  private static readonly GEAR_ACCEL_MULT: Record<'1' | '2' | '3' | '4' | '5' | '6', number> = {
    '1': 1.65,
    '2': 1.35,
    '3': 1.12,
    '4': 0.92,
    '5': 0.78,
    '6': 0.65,
  };

  private gear: GearMode = 'D';
  private isManualGear = false;
  private rpm = CityDriveEngine.IDLE_RPM;
  private carHealth = 100;
  private repairing = false;
  private repairProgress = 0;
  private damageCooldown = 0;
  private readonly repairSeconds = 2.5;
  private carX = 0;
  private carZ = 0;
  private lastFreeCarX = 0;
  private lastFreeCarZ = 0;
  private carSpeed = 0;
  private carHeading = 0;
  private steerAngle = 0;
  private camHeading = 0;
  private activePreset: CameraPreset = 'chase';

  // On-Foot Walking & Enter/Exit Transition State
  private walkingInput: WalkingInput = {
    moveX: 0,
    moveY: 0,
    run: false,
    jumpPressed: false,
  };
  private prevJumpPressed = false;
  private walkX = 0;
  private walkZ = 0;
  private walkHeading = 0;
  private walkSpeed = 0;
  private walkJumpOffset = 0;
  private walkJumpVel = 0;
  private walkCamYaw = 0;
  private walkCamPitch = 0.24;
  private cameraSensitivity = 1.0;

  private transitionTimer = 0;
  private readonly TRANSITION_DURATION = 0.4;
  private transitionFrom = { x: 0, z: 0 };
  private transitionTo = { x: 0, z: 0 };
  private pendingEnterCandidate: {
    id: string;
    kind: VehicleKind;
    label: string;
    x: number;
    z: number;
    yaw: number;
  } | null = null;
  private nearbyVehicle: NearbyVehiclePrompt | null = null;

  // Camera damping state
  private currentCam: CameraSphericalState = { ...CAMERA_PRESETS.chase };
  private targetCam: CameraSphericalState = { ...CAMERA_PRESETS.chase };

  // Pointer & multi-touch state for Android mobile + desktop mouse
  private activePointers = new Map<number, { x: number; y: number }>();
  private prevPinchDist: number | null = null;
  private isDragging = false;

  constructor(container: HTMLElement, callbacks: CityDriveCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.clock = new THREE.Clock();

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    // 1. Renderer setup (Android-optimized pixel ratio + software WebGL guard)
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const maxDpr = isMobile ? 1.75 : 2.0;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, maxDpr)
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    this.container.appendChild(canvas);

    // 2. Scene, Fog & Studio Environment Reflections (RoomEnvironment)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcdeaff);
    this.scene.fog = new THREE.FogExp2(0xcdeaff, 0.00165);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRenderTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    pmremGenerator.dispose();

    // 3. Third-Person Perspective Camera
    this.camera = new THREE.PerspectiveCamera(56, width / height, 0.25, 950);
    this.applyCameraImmediate();

    // 4. Realistic Daylight + Anime Color-Temperature Rig
    const sunDirection = this.sunOffset.clone();
    this.sunLight = new THREE.DirectionalLight(0xfff4df, 2.25);
    this.sunLight.position.copy(sunDirection);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = isMobile ? 1024 : 2048;
    this.sunLight.shadow.mapSize.height = isMobile ? 1024 : 2048;
    this.sunLight.shadow.camera.near = 8;
    this.sunLight.shadow.camera.far = 185;
    const frustum = 44;
    this.sunLight.shadow.camera.left = -frustum;
    this.sunLight.shadow.camera.right = frustum;
    this.sunLight.shadow.camera.top = frustum;
    this.sunLight.shadow.camera.bottom = -frustum;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.sunLight.shadow.radius = 2.0;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.hemiLight = new THREE.HemisphereLight(0x88ccff, 0x5d6775, 0.88);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.rimLight = new THREE.DirectionalLight(0xaad8ff, 0.6);
    this.rimLight.position.set(-28, 22, -32);
    this.scene.add(this.rimLight);

    // 5. Build Procedural Textures, Sky Dome, Anime City, Traffic, Police, Weather, Car & Player Character
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createCityTextures(maxAniso);

    this.skyDome = createAnimeSkyDome(sunDirection);
    this.scene.add(this.skyDome.mesh);

    this.city = createAnimeCity(this.textures);
    this.scene.add(this.city.group);

    this.pedestrians = createPedestrianSystem();
    this.scene.add(this.pedestrians.group);

    this.traffic = createTrafficSystem();
    this.scene.add(this.traffic.group);

    this.police = createPoliceSystem();
    this.scene.add(this.police.group);

    this.weather = createWeatherSystem();
    this.scene.add(this.weather.group);

    this.car = createBlueSportsCar(this.textures.contactShadow);
    this.car.group.position.set(0, 0, 0);
    this.scene.add(this.car.group);

    this.playerChar = createPlayerCharacter(this.textures.contactShadow);
    this.playerChar.group.visible = false;
    this.scene.add(this.playerChar.group);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.tick();
  }

  private getMaxForwardGear(): number {
    return this.activeVehicleKind === 'sports' ? 6 : 5;
  }

  private getManualGearSequence(): GearMode[] {
    return this.getMaxForwardGear() === 6
      ? ['R', 'N', '1', '2', '3', '4', '5', '6']
      : ['R', 'N', '1', '2', '3', '4', '5'];
  }

  private syncDriverVisibility(): void {
    const isDriverView = this.playerMode === 'driving' && this.activePreset === 'driver';
    this.car.group.visible = !(isDriverView && this.activeVehicleId === PLAYER_BLUE_SPORTS_ID);
    if (this.activeVehicleId !== PLAYER_BLUE_SPORTS_ID) {
      this.traffic.setVehicleVisible(this.activeVehicleId, !isDriverView);
    }
  }

  public setCameraPreset(preset: CameraPreset): void {
    this.activePreset = preset;
    const p = CAMERA_PRESETS[preset];
    this.targetCam.azimuth = p.azimuth;
    this.targetCam.elevation = p.elevation;
    this.targetCam.distance =
      preset === 'chase' ? VEHICLE_HANDLING[this.activeVehicleKind].cameraDistance : p.distance;
    this.targetCam.lookZOffset = p.lookZOffset;
    this.targetCam.lookYOffset = p.lookYOffset;
    this.syncDriverVisibility();
  }

  public setCameraSensitivity(sens: number): void {
    this.cameraSensitivity = THREE.MathUtils.clamp(sens, 0.4, 2.5);
  }

  public applyCameraLook(dx: number, dy: number): void {
    const scale = 0.0065 * this.cameraSensitivity;
    if (this.playerMode === 'walking' || this.playerMode === 'arrested') {
      this.walkCamYaw -= dx * scale;
      this.walkCamPitch = THREE.MathUtils.clamp(this.walkCamPitch + dy * scale * 0.72, 0.06, 0.95);
    } else {
      this.targetCam.azimuth -= dx * scale;
      this.targetCam.elevation = THREE.MathUtils.clamp(
        this.targetCam.elevation + dy * scale * 0.72,
        0.05,
        1.12
      );
      this.targetCam.lookZOffset = THREE.MathUtils.lerp(this.targetCam.lookZOffset, 0, 0.08);
    }
  }

  public setHeadlightsEnabled(enabled: boolean): void {
    this.car.setHeadlightsEnabled(enabled);
  }

  public setDrivingInput(input: DrivingInput): void {
    this.drivingInput.accelerate = input.accelerate;
    this.drivingInput.reverse = input.reverse;
    this.drivingInput.steerLeft = input.steerLeft;
    this.drivingInput.steerRight = input.steerRight;
    this.drivingInput.steerAnalog = input.steerAnalog ?? 0;
    this.drivingInput.handbrake = Boolean(input.handbrake);
    this.drivingInput.gyroSteer = input.gyroSteer ?? 0;
  }

  public setWalkingInput(input: WalkingInput): void {
    this.walkingInput.moveX = THREE.MathUtils.clamp(input.moveX, -1, 1);
    this.walkingInput.moveY = THREE.MathUtils.clamp(input.moveY, -1, 1);
    this.walkingInput.run = Boolean(input.run);
    this.walkingInput.jumpPressed = Boolean(input.jumpPressed);
  }

  public setGear(gear: GearMode): void {
    this.gear = gear;
    this.lastTelemetryTime = -10;
  }

  public setManualGearMode(enabled: boolean): void {
    this.isManualGear = enabled;
    if (enabled) {
      if (this.gear === 'P') {
        this.gear = 'N';
      } else if (this.gear === 'D') {
        const spec = VEHICLE_HANDLING[this.activeVehicleKind];
        const powerFactor = 0.35 + 0.65 * (this.carHealth / 100);
        const normalMaxFwd = spec.maxFwdSpeed * powerFactor;
        const maxGear = this.getMaxForwardGear();
        let chosen: GearMode = '1';
        for (let g = 1; g <= maxGear; g++) {
          const key = String(g) as '1' | '2' | '3' | '4' | '5' | '6';
          chosen = key;
          if (this.carSpeed <= normalMaxFwd * CityDriveEngine.GEAR_SPEED_CAPS[key]) {
            break;
          }
        }
        this.gear = this.carSpeed > 0.5 ? chosen : '1';
      }
    } else if (this.gear !== 'P' && this.gear !== 'R' && this.gear !== 'N') {
      this.gear = 'D';
    }
    this.lastTelemetryTime = -10;
  }

  public shiftGear(delta: 1 | -1): void {
    if (!this.isManualGear || this.playerMode !== 'driving') return;
    const seq = this.getManualGearSequence();
    let idx = seq.indexOf(this.gear);
    if (idx === -1) idx = seq.indexOf('1');
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= seq.length) return;

    const nextGear = seq[nextIdx];
    if (
      delta < 0 &&
      (nextGear === '1' ||
        nextGear === '2' ||
        nextGear === '3' ||
        nextGear === '4' ||
        nextGear === '5' ||
        nextGear === '6')
    ) {
      const spec = VEHICLE_HANDLING[this.activeVehicleKind];
      const powerFactor = 0.35 + 0.65 * (this.carHealth / 100);
      const normalMaxFwd = spec.maxFwdSpeed * powerFactor;
      const targetCap = normalMaxFwd * CityDriveEngine.GEAR_SPEED_CAPS[nextGear];
      const projectedRpm =
        CityDriveEngine.IDLE_RPM +
        (Math.max(0, this.carSpeed) / Math.max(targetCap, 0.01)) *
          (CityDriveEngine.REDLINE_RPM - CityDriveEngine.IDLE_RPM);
      if (projectedRpm > CityDriveEngine.REDLINE_RPM) {
        return;
      }
    }

    this.gear = nextGear;
    this.lastTelemetryTime = -10;
  }

  public setTimeMode(mode: TimeMode): void {
    this.timeMode = mode;
  }

  public setWeatherMode(mode: WeatherMode): void {
    this.weatherMode = mode;
  }

  public setHornActive(active: boolean): void {
    cityAudio.setHorn(active && this.playerMode === 'driving');
  }

  public startRepair(): void {
    if (this.playerMode !== 'driving') return;
    if (this.carHealth >= 100) return;
    if (Math.abs(this.carSpeed) > 0.8) return;
    this.repairing = true;
    this.repairProgress = 0;
  }

  public exitVehicle(): void {
    if (this.playerMode !== 'driving') return;
    cityAudio.setHorn(false);
    this.repairing = false;
    this.repairProgress = 0;
    this.carSpeed = 0;

    // Leave active vehicle parked safely in the world & restore visibility if in driver view
    this.car.group.visible = true;
    if (this.activeVehicleId === PLAYER_BLUE_SPORTS_ID) {
      this.sportsCarPos = { x: this.carX, z: this.carZ, heading: this.carHeading };
    } else {
      this.traffic.setVehicleVisible(this.activeVehicleId, true);
      this.traffic.releaseVehicle(this.activeVehicleId, this.carX, this.carZ, this.carHeading);
    }

    // Step out onto driver (left) side of vehicle
    const leftX = -Math.cos(this.carHeading);
    const leftZ = Math.sin(this.carHeading);
    const sideOffset = this.activeVehicleKind === 'motorcycle' ? 1.05 : 1.55;
    const rawOut = resolveWalkPosition(this.carX + leftX * sideOffset, this.carZ + leftZ * sideOffset);

    this.transitionFrom = { x: this.carX, z: this.carZ };
    this.transitionTo = rawOut;
    this.walkX = this.carX;
    this.walkZ = this.carZ;
    this.walkHeading = this.carHeading;
    this.walkCamYaw = this.carHeading;
    this.walkCamPitch = 0.24;
    this.walkJumpOffset = 0;
    this.walkJumpVel = 0;
    this.transitionTimer = 0;
    this.playerMode = 'exiting';
    this.playerChar.group.visible = true;
  }

  public enterNearestVehicle(): void {
    if (this.playerMode !== 'walking') return;
    const candidate = this.findClosestEnterable(5.0);
    if (!candidate) return;

    // Claim traffic vehicle immediately so it stops moving while player walks up to door
    if (candidate.id !== PLAYER_BLUE_SPORTS_ID) {
      const claimed = this.traffic.claimVehicle(candidate.id);
      if (!claimed) return;
      // Trigger theft alert ONLY if stealing an unowned traffic/parked vehicle (never issues immediate fine!)
      if (!this.ownedVehicleIds.has(claimed.id)) {
        this.ownedVehicleIds.add(claimed.id);
        this.police.registerTheftViolation();
      }
      this.pendingEnterCandidate = {
        id: claimed.id,
        kind: claimed.kind,
        label: claimed.label,
        x: claimed.x,
        z: claimed.z,
        yaw: claimed.yaw,
      };
    } else {
      this.pendingEnterCandidate = {
        id: PLAYER_BLUE_SPORTS_ID,
        kind: 'sports',
        label: 'Blue Sports Car',
        x: this.sportsCarPos.x,
        z: this.sportsCarPos.z,
        yaw: this.sportsCarPos.heading,
      };
    }

    this.transitionFrom = { x: this.walkX, z: this.walkZ };
    this.transitionTo = { x: this.pendingEnterCandidate.x, z: this.pendingEnterCandidate.z };
    this.transitionTimer = 0;
    this.playerMode = 'entering';
    this.playerChar.group.visible = true;
  }

  public acknowledgeArrest(): void {
    this.police.acknowledgeArrest();
    if (this.playerMode === 'arrested') {
      this.playerMode = 'walking';
      this.walkSpeed = 0;
      this.walkJumpOffset = 0;
      this.walkJumpVel = 0;
    }
  }

  private findClosestEnterable(maxDist: number): NearbyVehiclePrompt | null {
    const sportsDist = Math.hypot(this.sportsCarPos.x - this.walkX, this.sportsCarPos.z - this.walkZ);
    let best: NearbyVehiclePrompt | null =
      sportsDist <= maxDist
        ? {
            id: PLAYER_BLUE_SPORTS_ID,
            kind: 'sports',
            label: 'Blue Sports Car',
            distance: sportsDist,
          }
        : null;

    const trafficCand = this.traffic.findClosestEnterableVehicle(this.walkX, this.walkZ, maxDist);
    if (trafficCand && (!best || trafficCand.distance < best.distance)) {
      best = {
        id: trafficCand.id,
        kind: trafficCand.kind,
        label: trafficCand.label,
        distance: trafficCand.distance,
      };
    }
    return best;
  }

  public setDestination(destination: LandmarkLocation | null): void {
    this.activeDestination = destination;
    if (!destination) {
      this.activeRoute = [];
      this.remainingDistance = 0;
      this.navTurn = null;
      this.city.setNavigationRoute([], null);
      this.callbacks.onDestinationChanged?.(null);
      return;
    }

    const pos = this.getActivePlayerPosition();
    this.activeRoute = computeNavigationRoute(pos.x, pos.z, destination);
    this.remainingDistance = computeRouteDistance(this.activeRoute);
    this.navTurn = computeTurnInstruction(
      this.activeRoute,
      this.playerMode === 'walking' ? this.walkHeading : this.carHeading,
      destination.name
    );
    this.lastRouteRefreshTime = this.clock.getElapsedTime();
    this.city.setNavigationRoute(this.activeRoute, destination);
    this.callbacks.onDestinationChanged?.(destination);
  }

  private getActivePlayerPosition(): { x: number; y: number; z: number; heading: number } {
    if (this.playerMode === 'driving') {
      return {
        x: this.carX,
        y: groundHeightAt(this.carX, this.carZ),
        z: this.carZ,
        heading: this.carHeading,
      };
    }
    return {
      x: this.walkX,
      y: groundHeightAt(this.walkX, this.walkZ),
      z: this.walkZ,
      heading: this.walkHeading,
    };
  }

  public getMapSnapshot(): MapSnapshot {
    const pos = this.getActivePlayerPosition();
    return {
      carX: pos.x,
      carZ: pos.z,
      carHeading: pos.heading,
      carSpeed: this.playerMode === 'driving' ? this.carSpeed : this.walkSpeed,
      activeDestination: this.activeDestination,
      route: this.activeRoute,
      remainingDistance: this.remainingDistance,
    };
  }

  private applyCameraImmediate(): void {
    const { azimuth, elevation, distance, lookZOffset, lookYOffset } = this.currentCam;
    const horizDist = Math.cos(elevation) * distance;
    const y = Math.sin(elevation) * distance + 0.8;
    const x = Math.sin(azimuth) * horizDist;
    const z = Math.cos(azimuth) * horizDist;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, lookYOffset, lookZOffset);
  }

  private updateDriving(elapsed: number, dt: number): void {
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    if (!isObstacleOrWaterBlocked(this.carX, this.carZ, 1.3)) {
      this.lastFreeCarX = this.carX;
      this.lastFreeCarZ = this.carZ;
    }

    const spec = VEHICLE_HANDLING[this.activeVehicleKind];
    const powerFactor = 0.35 + 0.65 * (this.carHealth / 100);
    const NORMAL_MAX_FWD = spec.maxFwdSpeed * powerFactor;
    const onRoad = isOnPavedRoad(this.carX, this.carZ);
    const offRoadCapFactor = onRoad ? 1.0 : 0.45;
    const MAX_FWD_SPEED = NORMAL_MAX_FWD * offRoadCapFactor;
    const MAX_REV_SPEED = spec.maxRevSpeed * offRoadCapFactor;
    const ACCEL_RATE = spec.accelRate * powerFactor;
    const BRAKE_RATE = spec.brakeRate;
    const HANDBRAKE_RATE = 38.0;
    const REVERSE_RATE = 9.5;
    const wetGrip = 1 - this.rainFactor * 0.25;
    const COAST_DECEL = (6.2 + (onRoad ? 0 : 2.1)) * wetGrip;
    const MAX_STEER = 0.42;

    const { accelerate, reverse, steerLeft, steerRight, handbrake, gyroSteer, steerAnalog } =
      this.drivingInput;
    let isBraking = false;
    this.hitPoliceThisStep = false;
    this.hitPedestrianThisStep = false;

    let targetRpm = CityDriveEngine.IDLE_RPM;

    if (handbrake) {
      if (Math.abs(this.carSpeed) <= HANDBRAKE_RATE * dt) {
        this.carSpeed = 0;
      } else {
        this.carSpeed -= Math.sign(this.carSpeed) * HANDBRAKE_RATE * dt;
      }
      isBraking = true;
    } else if (this.gear === 'P') {
      if (Math.abs(this.carSpeed) <= BRAKE_RATE * dt) {
        this.carSpeed = 0;
      } else {
        this.carSpeed -= Math.sign(this.carSpeed) * BRAKE_RATE * dt;
      }
      isBraking = true;
    } else if (this.gear === 'N') {
      if (reverse) {
        if (Math.abs(this.carSpeed) <= BRAKE_RATE * dt) {
          this.carSpeed = 0;
        } else {
          this.carSpeed -= Math.sign(this.carSpeed) * BRAKE_RATE * dt;
        }
        isBraking = true;
      } else if (Math.abs(this.carSpeed) <= COAST_DECEL * dt) {
        this.carSpeed = 0;
      } else {
        this.carSpeed -= Math.sign(this.carSpeed) * COAST_DECEL * dt;
      }
      if (accelerate) {
        targetRpm = 6600;
      }
    } else if (this.gear === 'R') {
      if (accelerate && !reverse) {
        if (this.carSpeed > 0.1) {
          this.carSpeed = Math.max(0, this.carSpeed - BRAKE_RATE * dt);
          isBraking = true;
        } else {
          this.carSpeed = Math.max(MAX_REV_SPEED, this.carSpeed - REVERSE_RATE * dt);
          isBraking = true;
        }
      } else if (reverse) {
        if (Math.abs(this.carSpeed) <= BRAKE_RATE * dt) {
          this.carSpeed = 0;
        } else {
          this.carSpeed -= Math.sign(this.carSpeed) * BRAKE_RATE * dt;
        }
        isBraking = true;
      } else if (Math.abs(this.carSpeed) <= COAST_DECEL * dt) {
        this.carSpeed = 0;
      } else {
        this.carSpeed -= Math.sign(this.carSpeed) * COAST_DECEL * dt;
      }
      const revNorm = THREE.MathUtils.clamp(
        Math.abs(this.carSpeed) / Math.max(Math.abs(spec.maxRevSpeed), 0.1),
        0,
        1
      );
      targetRpm =
        CityDriveEngine.IDLE_RPM +
        revNorm * (6400 - CityDriveEngine.IDLE_RPM) +
        (accelerate ? 350 : 0);
    } else if (
      this.isManualGear &&
      (this.gear === '1' ||
        this.gear === '2' ||
        this.gear === '3' ||
        this.gear === '4' ||
        this.gear === '5' ||
        this.gear === '6')
    ) {
      const ratio = CityDriveEngine.GEAR_SPEED_CAPS[this.gear];
      const accelMult = CityDriveEngine.GEAR_ACCEL_MULT[this.gear];
      const gearMaxSpeed = NORMAL_MAX_FWD * ratio;
      const effectiveCap = Math.min(gearMaxSpeed, MAX_FWD_SPEED);
      const gearAccel = ACCEL_RATE * accelMult;

      const rawWheelRpm =
        CityDriveEngine.IDLE_RPM +
        (Math.max(0, this.carSpeed) / Math.max(gearMaxSpeed, 0.01)) *
          (CityDriveEngine.REDLINE_RPM - CityDriveEngine.IDLE_RPM);
      const atRevLimiter = rawWheelRpm >= CityDriveEngine.REDLINE_RPM;

      if (accelerate && !reverse) {
        if (this.carSpeed < 0) {
          this.carSpeed = Math.min(0, this.carSpeed + BRAKE_RATE * dt);
          isBraking = true;
        } else if (!atRevLimiter && this.carSpeed < effectiveCap) {
          this.carSpeed = Math.min(effectiveCap, this.carSpeed + gearAccel * dt);
        } else if (this.carSpeed > effectiveCap) {
          this.carSpeed = Math.max(effectiveCap, this.carSpeed - 12.0 * dt);
        }
      } else if (reverse && !accelerate) {
        if (Math.abs(this.carSpeed) <= BRAKE_RATE * dt) {
          this.carSpeed = 0;
        } else {
          this.carSpeed -= Math.sign(this.carSpeed) * BRAKE_RATE * dt;
        }
        isBraking = true;
      } else {
        if (Math.abs(this.carSpeed) <= COAST_DECEL * dt) {
          this.carSpeed = 0;
        } else {
          this.carSpeed -= Math.sign(this.carSpeed) * COAST_DECEL * dt;
        }
      }

      targetRpm = THREE.MathUtils.clamp(
        CityDriveEngine.IDLE_RPM +
          (Math.max(0, this.carSpeed) / Math.max(gearMaxSpeed, 0.01)) *
            (CityDriveEngine.REDLINE_RPM - CityDriveEngine.IDLE_RPM),
        CityDriveEngine.IDLE_RPM,
        CityDriveEngine.REDLINE_RPM
      );
    } else {
      // Automatic 'D' mode (preserved unchanged + off-road top speed limit)
      if (accelerate && !reverse) {
        if (this.carSpeed < 0) {
          this.carSpeed = Math.min(0, this.carSpeed + BRAKE_RATE * dt);
          isBraking = true;
        } else if (this.carSpeed <= MAX_FWD_SPEED) {
          this.carSpeed = Math.min(MAX_FWD_SPEED, this.carSpeed + ACCEL_RATE * dt);
        } else {
          this.carSpeed = Math.max(MAX_FWD_SPEED, this.carSpeed - 12.0 * dt);
        }
      } else if (reverse && !accelerate) {
        if (this.carSpeed > 0.1) {
          this.carSpeed = Math.max(0, this.carSpeed - BRAKE_RATE * dt);
          isBraking = true;
        } else {
          this.carSpeed = Math.max(MAX_REV_SPEED, this.carSpeed - REVERSE_RATE * dt);
          isBraking = true;
        }
      } else {
        if (Math.abs(this.carSpeed) <= COAST_DECEL * dt) {
          this.carSpeed = 0;
        } else {
          this.carSpeed -= Math.sign(this.carSpeed) * COAST_DECEL * dt;
        }
      }

      // Smooth simulated automatic gearbox RPM progression
      const maxGear = this.getMaxForwardGear();
      let prevCap = 0;
      let autoRatio = 1.0;
      const spdNorm = Math.max(0, this.carSpeed) / Math.max(NORMAL_MAX_FWD, 0.1);
      for (let g = 1; g <= maxGear; g++) {
        const key = String(g) as '1' | '2' | '3' | '4' | '5' | '6';
        const cap = CityDriveEngine.GEAR_SPEED_CAPS[key];
        if (spdNorm <= cap || g === maxGear) {
          const span = Math.max(cap - prevCap * 0.65, 0.05);
          autoRatio = THREE.MathUtils.clamp((spdNorm - prevCap * 0.65) / span, 0, 1);
          break;
        }
        prevCap = cap;
      }
      targetRpm =
        this.carSpeed < -0.1
          ? CityDriveEngine.IDLE_RPM +
            (Math.abs(this.carSpeed) / Math.max(Math.abs(spec.maxRevSpeed), 0.1)) *
              (5800 - CityDriveEngine.IDLE_RPM)
          : CityDriveEngine.IDLE_RPM +
            autoRatio * (6600 - CityDriveEngine.IDLE_RPM) +
            (accelerate && this.carSpeed >= 0 ? 250 : 0);
    }

    // Small off-road drag + ensure off-road top speed cap is enforced smoothly
    if (!onRoad) {
      this.carSpeed *= Math.max(0, 1 - 1.45 * dt);
      if (this.carSpeed > MAX_FWD_SPEED) {
        this.carSpeed = Math.max(MAX_FWD_SPEED, this.carSpeed - 14.0 * dt);
      } else if (this.carSpeed < MAX_REV_SPEED) {
        this.carSpeed = Math.min(MAX_REV_SPEED, this.carSpeed + 14.0 * dt);
      }
    }

    this.rpm = THREE.MathUtils.damp(
      this.rpm,
      THREE.MathUtils.clamp(targetRpm, CityDriveEngine.IDLE_RPM, CityDriveEngine.REDLINE_RPM),
      14,
      dt
    );

    const buttonSteer = (steerLeft ? 1 : 0) - (steerRight ? 1 : 0);
    const combinedSteer = THREE.MathUtils.clamp(
      buttonSteer + (steerAnalog ?? 0) + (gyroSteer ?? 0),
      -1,
      1
    );
    const targetSteer = combinedSteer * MAX_STEER;
    this.steerAngle = THREE.MathUtils.damp(this.steerAngle, targetSteer, 11, dt);

    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.carSpeed) / 4.2, 0, 1);
    const dirSign = this.carSpeed >= 0 ? 1 : -1;
    const driftBoost = handbrake && Math.abs(this.carSpeed) > 7 ? 1.32 : 1.0;
    this.carHeading += this.steerAngle * spec.turnRate * driftBoost * speedFactor * dirSign * dt;

    if (
      (handbrake && Math.abs(this.carSpeed) > 7) ||
      (Math.abs(this.steerAngle) > 0.28 && Math.abs(this.carSpeed) > 12)
    ) {
      cityAudio.playScreech();
    }

    const fwdX = -Math.sin(this.carHeading);
    const fwdZ = -Math.cos(this.carHeading);
    const rawNextX = this.carX + fwdX * this.carSpeed * dt;
    const rawNextZ = this.carZ + fwdZ * this.carSpeed * dt;

    const speedBefore = Math.abs(this.carSpeed);
    const roadResolved = resolveRoadPosition(rawNextX, rawNextZ, this.carSpeed);
    const trafficResolved = this.traffic.resolvePlayerCollision(
      roadResolved.x,
      roadResolved.z,
      roadResolved.speed,
      this.activeVehicleId
    );
    let collidedThisStep = roadResolved.blocked;
    if (trafficResolved.speed < roadResolved.speed * 0.85) {
      collidedThisStep = true;
    }

    // Collide with parked Blue Sports Car if currently driving another vehicle
    let nextX = trafficResolved.x;
    let nextZ = trafficResolved.z;
    let nextSpeed = trafficResolved.speed;
    if (this.activeVehicleId !== PLAYER_BLUE_SPORTS_ID) {
      const dx = nextX - this.sportsCarPos.x;
      const dz = nextZ - this.sportsCarPos.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.0 && d > 0.001) {
        const push = 3.0 - d;
        nextX += (dx / d) * push;
        nextZ += (dz / d) * push;
        nextSpeed *= 0.72;
        collidedThisStep = true;
      }
    }

    const policeResolved = this.police.resolvePlayerCollision(nextX, nextZ, nextSpeed);
    if (policeResolved.hitPolice) {
      collidedThisStep = true;
      if (speedBefore > 0.5) {
        this.hitPoliceThisStep = true;
      }
    }

    nextX = policeResolved.x;
    nextZ = policeResolved.z;
    nextSpeed = policeResolved.speed;

    // Anti-stuck safeguard: if pushed into a building or water, revert to last free position
    if (isObstacleOrWaterBlocked(nextX, nextZ, 1.2)) {
      nextX = this.lastFreeCarX;
      nextZ = this.lastFreeCarZ;
      nextSpeed = 0;
      collidedThisStep = true;
    }

    this.carX = nextX;
    this.carZ = nextZ;
    this.carSpeed = nextSpeed;

    if (speedBefore * 3.6 > 15 && this.pedestrians.checkVehicleCollision(this.carX, this.carZ, 1.8)) {
      this.hitPedestrianThisStep = true;
    }

    if (collidedThisStep) {
      const lostSpeed = speedBefore - Math.abs(this.carSpeed);
      if (lostSpeed >= 2.5 && this.damageCooldown <= 0) {
        const strength = THREE.MathUtils.clamp((lostSpeed - 2.5) / 9, 0, 1);
        const damage = 4 + strength * 22;
        this.carHealth = Math.max(0, this.carHealth - damage);
        this.damageCooldown = 0.45;
        this.repairing = false;
        this.repairProgress = 0;
        cityAudio.playCrash(0.25 + strength * 0.75);
      }
    }

    const nextY = groundHeightAt(this.carX, this.carZ);
    const pitch = groundPitchAt(this.carX, this.carZ, this.carHeading);
    const isDriverView = this.activePreset === 'driver';

    if (this.activeVehicleId === PLAYER_BLUE_SPORTS_ID) {
      this.sportsCarPos = { x: this.carX, z: this.carZ, heading: this.carHeading };
      this.car.group.visible = !isDriverView;
      this.car.group.position.set(this.carX, nextY, this.carZ);
      this.car.group.rotation.set(pitch, this.carHeading, 0, 'YXZ');
      this.car.updateDrive(elapsed, this.carSpeed, this.steerAngle, isBraking, dt);
      this.playerChar.group.visible = false;
    } else {
      this.traffic.setVehicleVisible(this.activeVehicleId, !isDriverView);
      this.traffic.updateClaimedVehicle(
        this.activeVehicleId,
        this.carX,
        nextY,
        this.carZ,
        pitch,
        this.carHeading,
        this.carSpeed,
        dt,
        this.steerAngle
      );
      // Show detailed skeletal player character seated visibly on Motorcycle or Open-Cab Tractor (unless in Driver view)
      if (!isDriverView && this.activeVehicleKind === 'motorcycle') {
        this.playerChar.group.visible = true;
        this.playerChar.group.position.set(this.carX, nextY + 0.34, this.carZ);
        this.playerChar.group.rotation.set(pitch - 0.14, this.carHeading, 0, 'YXZ');
        this.playerChar.update(elapsed, dt, 0, false, 0, false, 'sit_moto', this.steerAngle * 2.2);
      } else if (!isDriverView && this.activeVehicleKind === 'tractor') {
        const seatRearOffset = 0.68;
        const sx = this.carX + Math.sin(this.carHeading) * seatRearOffset;
        const sz = this.carZ + Math.cos(this.carHeading) * seatRearOffset;
        this.playerChar.group.visible = true;
        this.playerChar.group.position.set(sx, nextY + 0.56, sz);
        this.playerChar.group.rotation.set(pitch, this.carHeading, 0, 'YXZ');
        this.playerChar.update(
          elapsed,
          dt,
          0,
          false,
          0,
          false,
          'sit_tractor',
          this.steerAngle * 2.2
        );
      } else {
        this.playerChar.group.visible = false;
      }
    }
  }

  private updateWalking(elapsed: number, dt: number): void {
    this.hitPoliceThisStep = false;
    this.hitPedestrianThisStep = false;

    const { moveX, moveY, run, jumpPressed } = this.walkingInput;
    const inputMag = Math.min(1, Math.hypot(moveX, moveY));

    // Jump impulse on rising edge
    if (jumpPressed && !this.prevJumpPressed && this.walkJumpOffset <= 0.02) {
      this.walkJumpVel = 7.4;
    }
    this.prevJumpPressed = jumpPressed;

    if (this.walkJumpOffset > 0 || this.walkJumpVel > 0) {
      this.walkJumpOffset += this.walkJumpVel * dt;
      this.walkJumpVel -= 20.0 * dt;
      if (this.walkJumpOffset <= 0) {
        this.walkJumpOffset = 0;
        this.walkJumpVel = 0;
      }
    }

    if (inputMag > 0.08) {
      // Camera-relative Free Fire walking directions
      const camFwdX = -Math.sin(this.walkCamYaw);
      const camFwdZ = -Math.cos(this.walkCamYaw);
      const camRightX = Math.cos(this.walkCamYaw);
      const camRightZ = -Math.sin(this.walkCamYaw);

      const worldDirX = camFwdX * moveY + camRightX * moveX;
      const worldDirZ = camFwdZ * moveY + camRightZ * moveX;
      const len = Math.max(Math.hypot(worldDirX, worldDirZ), 0.001);
      const nx = worldDirX / len;
      const nz = worldDirZ / len;

      const targetHeading = Math.atan2(-nx, -nz);
      this.walkHeading = dampAngle(this.walkHeading, targetHeading, 12, dt);

      const maxSpd = run ? 8.4 : 4.3;
      this.walkSpeed = THREE.MathUtils.damp(this.walkSpeed, maxSpd * inputMag, 10, dt);

      const nextWalk = resolveWalkPosition(
        this.walkX + nx * this.walkSpeed * dt,
        this.walkZ + nz * this.walkSpeed * dt
      );
      this.walkX = nextWalk.x;
      this.walkZ = nextWalk.z;
    } else {
      this.walkSpeed = THREE.MathUtils.damp(this.walkSpeed, 0, 12, dt);
    }

    // Soft collision pushout vs parked Blue Sports Car so player doesn't walk straight through it
    const sdx = this.walkX - this.sportsCarPos.x;
    const sdz = this.walkZ - this.sportsCarPos.z;
    const sd = Math.hypot(sdx, sdz);
    if (sd < 1.85 && sd > 0.001) {
      this.walkX = this.sportsCarPos.x + (sdx / sd) * 1.85;
      this.walkZ = this.sportsCarPos.z + (sdz / sd) * 1.85;
    }

    const gy = groundHeightAt(this.walkX, this.walkZ);
    this.playerChar.group.visible = true;
    this.playerChar.group.position.set(this.walkX, gy, this.walkZ);
    this.playerChar.group.rotation.set(0, this.walkHeading, 0);
    this.playerChar.update(elapsed, dt, this.walkSpeed, run, this.walkJumpOffset, false);

    // Check nearby enterable vehicles
    this.nearbyVehicle = this.findClosestEnterable(4.8);
  }

  private updateTransition(elapsed: number, dt: number): void {
    this.transitionTimer += dt;
    const t = Math.min(1, this.transitionTimer / this.TRANSITION_DURATION);

    this.walkX = THREE.MathUtils.lerp(this.transitionFrom.x, this.transitionTo.x, t);
    this.walkZ = THREE.MathUtils.lerp(this.transitionFrom.z, this.transitionTo.z, t);
    const gy = groundHeightAt(this.walkX, this.walkZ);
    const hop = Math.sin(t * Math.PI) * 0.22;

    this.playerChar.group.visible = true;
    this.playerChar.group.position.set(this.walkX, gy, this.walkZ);
    this.playerChar.group.rotation.set(0, this.walkHeading, 0);
    this.playerChar.update(elapsed, dt, 3.5, false, hop, false, 'enter_exit');

    if (t >= 1) {
      if (this.playerMode === 'exiting') {
        this.playerMode = 'walking';
        this.walkSpeed = 0;
        this.nearbyVehicle = this.findClosestEnterable(4.8);
      } else if (this.playerMode === 'entering' && this.pendingEnterCandidate) {
        const target = this.pendingEnterCandidate;
        this.pendingEnterCandidate = null;
        this.activeVehicleId = target.id;
        this.activeVehicleKind = target.kind;
        this.activeVehicleLabel = target.label;
        this.carX = target.x;
        this.carZ = target.z;
        this.lastFreeCarX = target.x;
        this.lastFreeCarZ = target.z;
        this.carHeading = target.yaw;
        this.camHeading = target.yaw;
        this.carSpeed = 0;
        this.rpm = CityDriveEngine.IDLE_RPM;
        this.steerAngle = 0;
        this.gear = this.isManualGear ? '1' : 'D';
        this.nearbyVehicle = null;
        this.playerMode = 'driving';
        this.setCameraPreset(this.activePreset);
      }
    }
  }

  private updateWorldFollow(elapsed: number): void {
    const pos = this.getActivePlayerPosition();
    this.sunLight.target.position.set(pos.x, pos.y, pos.z);
    this.sunLight.position.set(pos.x, pos.y, pos.z).add(this.dynamicSunDir);
    this.skyDome.mesh.position.set(pos.x, pos.y, pos.z);

    if (this.activeDestination) {
      const distToDest = Math.hypot(
        this.activeDestination.roadX - pos.x,
        this.activeDestination.roadZ - pos.z
      );
      if (distToDest < 14) {
        this.setDestination(null);
      } else if (elapsed - this.lastRouteRefreshTime > 0.45) {
        this.lastRouteRefreshTime = elapsed;
        this.activeRoute = computeNavigationRoute(pos.x, pos.z, this.activeDestination);
        this.remainingDistance = computeRouteDistance(this.activeRoute);
        this.navTurn = computeTurnInstruction(
          this.activeRoute,
          pos.heading,
          this.activeDestination.name
        );
        this.city.setNavigationRoute(this.activeRoute, this.activeDestination);
      }
    }
  }

  private updateEnvironment(elapsed: number, dt: number): void {
    const targetRain = this.weatherMode === 'rain' ? 1.0 : 0.0;
    this.rainFactor = THREE.MathUtils.damp(this.rainFactor, targetRain, 2.2, dt);

    let cycleAngle = 0.25;
    if (this.timeMode === 'auto') {
      cycleAngle = 0.35 + (elapsed / 140) * Math.PI * 2;
    } else if (this.timeMode === 'day') {
      cycleAngle = 0.25;
    } else if (this.timeMode === 'sunset') {
      cycleAngle = Math.PI * 0.47;
    } else {
      cycleAngle = Math.PI;
    }

    const elevationCos = Math.cos(cycleAngle);
    const targetNight = THREE.MathUtils.clamp(-elevationCos * 1.45, 0, 1);
    const sunsetFactor = THREE.MathUtils.clamp(1 - Math.abs(elevationCos) * 2.8, 0, 1);
    this.nightFactor = THREE.MathUtils.damp(this.nightFactor, targetNight, 3.0, dt);

    if (this.nightFactor > 0.55) {
      this.timeOfDayLabel = 'Night';
    } else if (sunsetFactor > 0.35) {
      this.timeOfDayLabel = 'Sunset';
    } else {
      this.timeOfDayLabel = 'Day';
    }

    const sunElevY = Math.max(12, Math.abs(elevationCos) * 58 + 12);
    const sunHorizX = Math.sin(cycleAngle) * 48 + 18;
    this.dynamicSunDir.set(sunHorizX, sunElevY, 26);

    this.sunLight.color
      .copy(_daySunCol)
      .lerp(_sunsetSunCol, sunsetFactor)
      .lerp(_moonCol, this.nightFactor);

    const rainDim = 1 - this.rainFactor * 0.42;
    this.sunLight.intensity =
      (2.25 * (1 - this.nightFactor * 0.82) + 0.35 * this.nightFactor) * rainDim;

    this.hemiLight.intensity = (0.88 - this.nightFactor * 0.55) * (1 - this.rainFactor * 0.22);
    this.hemiLight.color.copy(_dayHemiSky).lerp(_nightHemiSky, this.nightFactor);
    this.hemiLight.groundColor.copy(_dayHemiGnd).lerp(_nightHemiGnd, this.nightFactor);
    this.rimLight.intensity = 0.6 * (1 - this.nightFactor * 0.5);

    _tmpFogCol
      .copy(_dayFogCol)
      .lerp(_sunsetFogCol, sunsetFactor)
      .lerp(_nightFogCol, this.nightFactor)
      .lerp(_rainFogCol, this.rainFactor * 0.65);

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(_tmpFogCol);
      this.scene.fog.density = 0.00165 + this.rainFactor * 0.0028 + this.nightFactor * 0.0006;
    }
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(_tmpFogCol);
    }

    this.skyDome.setAtmosphere(this.dynamicSunDir, sunsetFactor, this.nightFactor, this.rainFactor);
    this.city.setEnvironmentState(this.nightFactor, this.rainFactor);
    this.car.setNightIntensity(Math.max(this.nightFactor, this.rainFactor * 0.55));

    const pos = this.getActivePlayerPosition();
    this.weather.update(pos.x, pos.y, pos.z, dt, this.rainFactor);
  }

  private updateCamera(elapsed: number, dt: number): void {
    if (this.playerMode === 'walking' || this.playerMode === 'exiting' || this.playerMode === 'arrested') {
      const dist = 4.6;
      const horiz = Math.cos(this.walkCamPitch) * dist;
      const py = groundHeightAt(this.walkX, this.walkZ);

      _camTargetPos.set(
        this.walkX + Math.sin(this.walkCamYaw) * horiz,
        py + Math.sin(this.walkCamPitch) * dist + 1.45,
        this.walkZ + Math.cos(this.walkCamYaw) * horiz
      );
      _lookTargetPos.set(this.walkX, py + 1.32, this.walkZ);

      this.camera.position.lerp(_camTargetPos, 1 - Math.exp(-10 * dt));
      this.camera.lookAt(_lookTargetPos);

      if (Math.abs(this.camera.fov - 58) > 0.05) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 58, 6, dt);
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    if (this.playerMode === 'driving' && this.activePreset === 'driver') {
      const seat = DRIVER_SEAT_OFFSETS[this.activeVehicleKind];
      const cy = groundHeightAt(this.carX, this.carZ);
      const pitch = groundPitchAt(this.carX, this.carZ, this.carHeading);
      const fwdX = -Math.sin(this.carHeading);
      const fwdZ = -Math.cos(this.carHeading);
      const rightX = Math.cos(this.carHeading);
      const rightZ = -Math.sin(this.carHeading);

      const speedBump =
        Math.sin(elapsed * 19) * 0.006 * Math.min(1, Math.abs(this.carSpeed) / 14);
      const seatX = this.carX + rightX * seat.side + fwdX * seat.fwd;
      const seatY = cy + seat.height + Math.sin(pitch) * seat.fwd + speedBump;
      const seatZ = this.carZ + rightZ * seat.side + fwdZ * seat.fwd;

      this.camera.position.set(seatX, seatY, seatZ);
      _lookTargetPos.set(
        seatX + fwdX * 24,
        seatY + Math.sin(pitch) * 24 - 0.35,
        seatZ + fwdZ * 24
      );
      this.camera.lookAt(_lookTargetPos);

      const targetFov = 64 + (Math.abs(this.carSpeed) / 28.0) * 5.0;
      if (Math.abs(this.camera.fov - targetFov) > 0.02) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5.5, dt);
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    const lambda = 7.5;
    this.currentCam.azimuth = THREE.MathUtils.damp(
      this.currentCam.azimuth,
      this.targetCam.azimuth,
      lambda,
      dt
    );
    this.currentCam.elevation = THREE.MathUtils.damp(
      this.currentCam.elevation,
      this.targetCam.elevation,
      lambda,
      dt
    );
    this.currentCam.distance = THREE.MathUtils.damp(
      this.currentCam.distance,
      this.targetCam.distance,
      lambda,
      dt
    );
    this.currentCam.lookZOffset = THREE.MathUtils.damp(
      this.currentCam.lookZOffset,
      this.targetCam.lookZOffset,
      lambda,
      dt
    );
    this.currentCam.lookYOffset = THREE.MathUtils.damp(
      this.currentCam.lookYOffset,
      this.targetCam.lookYOffset,
      lambda,
      dt
    );

    this.camHeading = dampAngle(this.camHeading, this.carHeading, 5.5, dt);

    const { azimuth, elevation, distance, lookZOffset, lookYOffset } = this.currentCam;
    const totalAzimuth = this.camHeading + azimuth;
    const horizDist = Math.cos(elevation) * distance;
    const cy = groundHeightAt(this.carX, this.carZ);

    _camTargetPos.set(
      this.carX + Math.sin(totalAzimuth) * horizDist,
      cy + Math.sin(elevation) * distance + 0.8,
      this.carZ + Math.cos(totalAzimuth) * horizDist
    );

    const lookForward = -lookZOffset;
    _lookTargetPos.set(
      this.carX - Math.sin(this.camHeading) * lookForward,
      cy + lookYOffset,
      this.carZ - Math.cos(this.camHeading) * lookForward
    );

    this.camera.position.lerp(_camTargetPos, 1 - Math.exp(-12 * dt));
    this.camera.lookAt(_lookTargetPos);

    const targetFov = 56 + (Math.abs(this.carSpeed) / 26.0) * 5.0;
    if (Math.abs(this.camera.fov - targetFov) > 0.02) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 4.5, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext | null;
    if (!gl) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync && gl.deleteSync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    this.skyDome.update(elapsed);

    if (this.playerMode === 'driving') {
      this.updateDriving(elapsed, dt);
    } else if (this.playerMode === 'walking') {
      this.updateWalking(elapsed, dt);
    } else if (this.playerMode === 'entering' || this.playerMode === 'exiting') {
      this.updateTransition(elapsed, dt);
    } else if (this.playerMode === 'arrested') {
      const gy = groundHeightAt(this.walkX, this.walkZ);
      this.playerChar.group.visible = true;
      this.playerChar.group.position.set(this.walkX, gy, this.walkZ);
      this.playerChar.group.rotation.set(0, this.walkHeading, 0);
      this.playerChar.update(elapsed, dt, 0, false, 0, true);
    }

    this.updateWorldFollow(elapsed);
    this.updateEnvironment(elapsed, dt);

    const pos = this.getActivePlayerPosition();
    this.traffic.update(elapsed, dt, pos.x, pos.z);

    const isOnFoot = this.playerMode !== 'driving';
    const policeResult = this.police.update(
      elapsed,
      dt,
      pos.x,
      pos.z,
      this.playerMode === 'driving' ? this.carSpeed : this.walkSpeed,
      isOnFoot,
      this.hitPoliceThisStep,
      this.hitPedestrianThisStep
    );

    if (this.repairing) {
      if (this.playerMode !== 'driving' || Math.abs(this.carSpeed) > 0.8) {
        this.repairing = false;
        this.repairProgress = 0;
      } else {
        this.repairProgress = Math.min(1, this.repairProgress + dt / this.repairSeconds);
        if (this.repairProgress >= 1) {
          this.carHealth = 100;
          this.repairing = false;
          this.repairProgress = 0;
        }
      }
    }

    // Handle physical arrest transition cleanly
    if (policeResult.hudState.status === 'arrested' && this.playerMode !== 'arrested') {
      cityAudio.setHorn(false);
      this.repairing = false;
      this.repairProgress = 0;
      if (this.playerMode === 'driving') {
        this.carSpeed = 0;
        this.car.group.visible = true;
        if (this.activeVehicleId === PLAYER_BLUE_SPORTS_ID) {
          this.sportsCarPos = { x: this.carX, z: this.carZ, heading: this.carHeading };
        } else {
          this.traffic.setVehicleVisible(this.activeVehicleId, true);
          this.traffic.releaseVehicle(this.activeVehicleId, this.carX, this.carZ, this.carHeading);
        }
        const leftX = -Math.cos(this.carHeading);
        const leftZ = Math.sin(this.carHeading);
        const out = resolveWalkPosition(this.carX + leftX * 1.45, this.carZ + leftZ * 1.45);
        this.walkX = out.x;
        this.walkZ = out.z;
        this.walkHeading = this.carHeading;
      }
      this.walkSpeed = 0;
      this.playerMode = 'arrested';
      this.playerChar.group.visible = true;
    } else if (policeResult.forceStopPlayer) {
      this.carSpeed = 0;
      this.walkSpeed = 0;
    }

    const engineLoad = THREE.MathUtils.clamp(
      (this.rpm - CityDriveEngine.IDLE_RPM) /
        (CityDriveEngine.REDLINE_RPM - CityDriveEngine.IDLE_RPM),
      0,
      1
    );
    cityAudio.setEngine(this.playerMode === 'driving', engineLoad);
    cityAudio.setSiren(policeResult.hudState.status === 'pursuit');

    this.pedestrians.update(elapsed, dt);
    this.city.update(elapsed);
    this.updateCamera(elapsed, dt);

    if (elapsed - this.lastTelemetryTime > 0.1) {
      this.lastTelemetryTime = elapsed;
      const telemetry: HudTelemetry = {
        mode: this.playerMode,
        activeVehicleKind: this.activeVehicleKind,
        activeVehicleLabel: this.activeVehicleLabel,
        speedKmh: Math.round(
          Math.abs(this.playerMode === 'driving' ? this.carSpeed : this.walkSpeed) * 3.6
        ),
        gear: this.gear,
        isManualGear: this.isManualGear,
        rpm: Math.round(this.rpm),
        maxForwardGear: this.getMaxForwardGear(),
        steerAngle: this.steerAngle,
        carHealth: Math.round(this.carHealth),
        repairing: this.repairing,
        repairProgress: this.repairProgress,
        timeOfDayLabel: this.timeOfDayLabel,
        weather: this.weatherMode,
        nearbyVehicle: this.playerMode === 'walking' ? this.nearbyVehicle : null,
        police: policeResult.hudState,
        navTurn: this.navTurn,
      };
      this.callbacks.onTelemetry?.(telemetry);
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private handlePointerDown = (e: PointerEvent): void => {
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.activePointers.size === 1) {
      this.isDragging = true;
      this.prevPinchDist = null;
    } else if (this.activePointers.size === 2) {
      this.isDragging = false;
      this.prevPinchDist = this.computePinchDistance();
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    const prev = this.activePointers.get(e.pointerId);
    if (!prev) return;

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 1 && this.isDragging) {
      this.applyCameraLook(dx, dy);
    } else if (this.activePointers.size === 2) {
      const dist = this.computePinchDistance();
      if (dist !== null && this.prevPinchDist !== null) {
        const delta = this.prevPinchDist - dist;
        this.targetCam.distance = THREE.MathUtils.clamp(
          this.targetCam.distance + delta * 0.025,
          4.8,
          15.5
        );
      }
      this.prevPinchDist = dist;
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) {
      this.prevPinchDist = null;
    }
    if (this.activePointers.size === 0) {
      this.isDragging = false;
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.targetCam.distance = THREE.MathUtils.clamp(
      this.targetCam.distance + e.deltaY * 0.006,
      4.8,
      15.5
    );
  };

  private handleDoubleClick = (): void => {
    this.setCameraPreset('chase');
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    if (this.disposed) return;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.callbacks.onContextLost?.(true);
  };

  private handleContextRestored = (): void => {
    if (this.disposed) return;
    this.callbacks.onContextLost?.(false);
    this.tick();
  };

  private computePinchDistance(): number | null {
    if (this.activePointers.size < 2) return null;
    const pts = Array.from(this.activePointers.values());
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  }

  private bindEvents(): void {
    const canvas = this.renderer.domElement;
    window.addEventListener('resize', this.handleResize);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    canvas.addEventListener('dblclick', this.handleDoubleClick);
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    const canvas = this.renderer.domElement;
    window.removeEventListener('resize', this.handleResize);
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('pointercancel', this.handlePointerUp);
    canvas.removeEventListener('wheel', this.handleWheel);
    canvas.removeEventListener('dblclick', this.handleDoubleClick);
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

    cityAudio.dispose();
    this.playerChar.dispose();
    this.car.dispose();
    this.police.dispose();
    this.weather.dispose();
    this.traffic.dispose();
    this.pedestrians.dispose();
    this.city.dispose();
    this.skyDome.dispose();
    this.textures.dispose();
    this.envRenderTarget.dispose();
    this.renderer.dispose();

    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
