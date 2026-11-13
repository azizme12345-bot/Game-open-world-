import type { RoutePoint } from './navigation';
import type { LandmarkLocation } from './roadNetwork';

export type CameraPreset = 'chase' | 'low' | 'side' | 'wide';
export type GearMode = 'P' | 'R' | 'N' | 'D';
export type WeatherMode = 'clear' | 'rain';
export type TimeMode = 'auto' | 'day' | 'sunset' | 'night';

export type PlayerMode = 'driving' | 'walking' | 'entering' | 'exiting' | 'arrested';
export type VehicleKind = 'sports' | 'car' | 'bus' | 'truck' | 'motorcycle' | 'tractor' | 'pickup' | 'vip' | 'tank' | 'airplane' | 'helicopter';

export interface DrivingInput {
  accelerate: boolean;
  reverse: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  steerAnalog?: number; // Normalized -1 (right) to +1 (left) from virtual joystick
  handbrake?: boolean;
  gyroSteer?: number; // Normalized -1 (right) to +1 (left)
}

export interface WalkingInput {
  moveX: number; // -1 (left) to +1 (right)
  moveY: number; // -1 (backward) to +1 (forward)
  run: boolean;
  jumpPressed: boolean;
}

export interface NearbyVehiclePrompt {
  id: string;
  kind: VehicleKind;
  label: string;
  distance: number;
}

export interface NavigationTurnInfo {
  instruction: string;
  direction: 'straight' | 'left' | 'right' | 'uturn' | 'arrive';
  distanceToTurn: number;
  totalRemaining: number;
  destinationName: string;
}

export interface ArrestTicket {
  id: number;
  violations: string[];
}

export interface PoliceHudState {
  wantedLevel: number; // 0..3
  status: 'patrol' | 'pursuit' | 'officer_approach' | 'arrested' | 'escaped';
  pendingReasons: string[];
  activeTicket: ArrestTicket | null;
}

export interface HudTelemetry {
  mode: PlayerMode;
  activeVehicleKind: VehicleKind;
  activeVehicleLabel: string;
  speedKmh: number;
  gear: GearMode;
  carHealth: number;
  repairing: boolean;
  repairProgress: number;
  timeOfDayLabel: 'Day' | 'Sunset' | 'Night';
  weather: WeatherMode;
  nearbyVehicle: NearbyVehiclePrompt | null;
  police: PoliceHudState;
  navTurn: NavigationTurnInfo | null;
}

export interface MapSnapshot {
  carX: number;
  carZ: number;
  carHeading: number;
  carSpeed: number;
  activeDestination: LandmarkLocation | null;
  route: RoutePoint[];
  remainingDistance: number;
}

export interface ControlOffsets {
  leftPadX: number;
  leftPadY: number;
  rightPadX: number;
  rightPadY: number;
  actionPadX: number;
  actionPadY: number;
}

export interface ControlPreferences {
  handedness: 'right' | 'left';
  buttonScale: number; // Global fallback 0.75 .. 1.4
  joystickScale: number; // 0.75 .. 1.45
  pedalsScale: number; // 0.75 .. 1.45
  actionScale: number; // 0.75 .. 1.45
  buttonOpacity: number; // 0.55 .. 1.0
  joystickSensitivity: number; // 0.6 .. 1.8
  cameraSensitivity: number; // 0.5 .. 2.0
  offsets: ControlOffsets;
}

export const DEFAULT_CONTROL_PREFS: ControlPreferences = {
  handedness: 'right',
  buttonScale: 1.0,
  joystickScale: 1.0,
  pedalsScale: 1.0,
  actionScale: 1.0,
  buttonOpacity: 0.95,
  joystickSensitivity: 1.15,
  cameraSensitivity: 1.0,
  offsets: {
    leftPadX: 0,
    leftPadY: 0,
    rightPadX: 0,
    rightPadY: 0,
    actionPadX: 0,
    actionPadY: 0,
  },
};

export interface CityDriveCallbacks {
  onFpsWarning?: (lowFps: boolean) => void;
  onContextLost?: (lost: boolean) => void;
  onDestinationChanged?: (destination: LandmarkLocation | null) => void;
  onTelemetry?: (telemetry: HudTelemetry) => void;
}
