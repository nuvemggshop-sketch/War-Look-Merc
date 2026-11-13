export type GameScreenState = 'title' | 'playing' | 'trench' | 'paused' | 'gameover';

export type MapId = 'trinchera' | 'desierto' | 'ciudad';

export type DifficultyId = 'recluta' | 'tactico' | 'veterano' | 'realista';

export type FlightMode = 'ESTABILIZADO' | 'ACRO';

export type AllyAIState =
  | 'PATRULLA'
  | 'COMBATE'
  | 'CUBIERTO'
  | 'AVANZAR'
  | 'ESPRINTAR'
  | 'TRINCHERA'
  | 'KIA';

export type SquadOrder = 'ESCOLTA' | 'MANTENER';

export type RadioSpeaker = 'COMANDANTE' | 'ESCUADRÓN' | 'OPERADOR';

export interface AllySnapshot {
  id: number;
  name: string;
  role: string;
  alive: boolean;
  hp: number;
  maxHp: number;
  state: AllyAIState;
  x: number;
  z: number;
}

export interface RadarEntity {
  x: number;
  z: number;
  kind: 'target' | 'enemy' | 'ally' | 'extraction';
  urgent?: boolean;
  active?: boolean;
}

export interface ObjectiveGuidance {
  label: string;
  distanceMeters: number;
  relativeBearingDeg: number; // -180..+180 (0 = dead ahead)
  isExtraction: boolean;
}

export interface HUDTelemetrySnapshot {
  mapId: MapId;
  mapName: string;
  difficultyId: DifficultyId;
  difficultyName: string;
  elapsedTime: number;
  score: number;
  killStreak: number;
  dronesRemaining: number;
  maxDrones: number;
  rocketsLeft: number;
  maxRockets: number;
  rocketCooldown: number;
  targetsDestroyed: number;
  totalTargets: number;
  enemiesAlive: number;
  enemiesDestroyed: number;
  allyLosses: number;
  squadOrder: SquadOrder;
  allies: AllySnapshot[];
  hp: number;
  battery: number;
  voltage: number;
  altitude: number;
  speedKmh: number;
  pitchDeg: number;
  rollDeg: number;
  yawDeg: number;
  flightMode: FlightMode;
  opticsThermal: boolean;
  underFire: boolean;
  sniperLock: boolean;
  extractionActive: boolean;
  phaseLabel: string;
  guidance: ObjectiveGuidance | null;
  gamepadConnected: boolean;
  gamepadName: string;
  pointerLocked: boolean;
  dronePos: { x: number; z: number; yaw: number };
  radarEntities: RadarEntity[];
}

export interface KillFeedEntry {
  id: number;
  text: string;
  tone: 'kill' | 'ally' | 'status' | 'warning';
}

export interface KillBannerData {
  id: number;
  title: string;
  points: number;
}

export interface RadioMessageData {
  id: number;
  speaker: RadioSpeaker;
  callsign: string;
  text: string;
  durationMs: number;
}

export interface EndMissionSummary {
  victory: boolean;
  mapId: MapId;
  mapName: string;
  difficultyId: DifficultyId;
  difficultyName: string;
  reason: string;
  elapsedTime: number;
  targetsDestroyed: number;
  totalTargets: number;
  enemiesDestroyed: number;
  dronesUsed: number;
  maxDrones: number;
  alliesAlive: number;
  alliesTotal: number;
  allyLosses: number;
  score: number;
  bestScore: number;
}

export interface TrenchPromptData {
  dronesRemaining: number;
  reasonTitle: string;
  alliesAlive: number;
  alliesTotal: number;
}
