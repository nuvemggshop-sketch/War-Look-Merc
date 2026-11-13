import type { DifficultyId, MapId } from './types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface StructureBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY: number;
  blocksSight?: boolean;
}

export interface GamepadInputSnapshot {
  axes?: readonly number[];
  buttons?: ReadonlyArray<{ pressed: boolean; value: number }>;
}

export interface NormalizedControlInput {
  forward: number;
  strafe: number;
  vertical: number;
  yaw: number;
  pitch: number;
  boost: boolean;
  fire: boolean;
  rocketPressed: boolean;
  toggleOpticsPressed: boolean;
  toggleModePressed: boolean;
  deployPressed: boolean;
}

export interface MapConfig {
  id: MapId;
  code: string;
  name: string;
  subtitle: string;
  description: string;
  climate: string;
  briefing: string;
  trenchZ: readonly number[];
}

export const BATTLEFIELD_MAPS: Record<MapId, MapConfig> = {
  trinchera: {
    id: 'trinchera',
    code: 'SECTOR 01',
    name: 'TRINCHERA DE HIERRO',
    subtitle: 'Noche de Asedio · Barro y Ceniza',
    description: '4 líneas de trincheras en zigzag, casas fortificadas y reflectores de artillería.',
    climate: 'NOCHE · VISIBILIDAD MEDIA',
    briefing:
      'Águila FPV en el aire sobre Trinchera de Hierro. Destruye los 6 puestos hostiles; usa [Q] para cohetes HE sobre trincheras.',
    trenchZ: [-65, -25, 18, 58],
  },
  desierto: {
    id: 'desierto',
    code: 'SECTOR 02',
    name: 'CAÑÓN ROJO',
    subtitle: 'Desierto Árido · Crepúsculo Táctico',
    description: 'Dunas de arenisca, cañones laterales, puestos de adobe y convoy de combustible.',
    climate: 'OCASO · BRUMA DE ARENA',
    briefing:
      'Águila FPV desplegado en Cañón Rojo. Los mercenarios protegen un convoy y baterías antiaéreas entre las dunas.',
    trenchZ: [-60, -18, 24, 62],
  },
  ciudad: {
    id: 'ciudad',
    code: 'SECTOR 03',
    name: 'ZONA INDUSTRIAL',
    subtitle: 'Complejo Urbano · Tormenta Eléctrica',
    description: 'Avenidas de asfalto, canales de drenaje como trincheras y naves industriales transitables.',
    climate: 'TORMENTA · FOCOS URBANOS',
    briefing:
      'Águila FPV sobre Zona Industrial. Vuela entre naves, usa los canales de drenaje y neutraliza la red enemiga.',
    trenchZ: [-58, -12, 30],
  },
};

export const MAP_ORDER: readonly MapId[] = ['trinchera', 'desierto', 'ciudad'];

export interface DifficultyConfig {
  id: DifficultyId;
  name: string;
  summary: string;
  dronesReserve: number;
  allyMaxHp: number;
  allyRegen: number;
  allyRegenCapRatio: number;
  enemyDamageMult: number;
  enemyAccuracyMult: number;
  enemyFireRateMult: number;
  enemyHpMult: number;
  maxConcurrentAttackers: number;
  scoreMult: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  recluta: {
    id: 'recluta',
    name: 'RECLUTA',
    summary: '10 drones · Aliados 115 HP · Fuego suave',
    dronesReserve: 10,
    allyMaxHp: 115,
    allyRegen: 2.0,
    allyRegenCapRatio: 0.65,
    enemyDamageMult: 0.72,
    enemyAccuracyMult: 0.78,
    enemyFireRateMult: 0.85,
    enemyHpMult: 0.85,
    maxConcurrentAttackers: 3,
    scoreMult: 0.8,
  },
  tactico: {
    id: 'tactico',
    name: 'TÁCTICO',
    summary: '8 drones · Aliados 85 HP · Sin curación',
    dronesReserve: 8,
    allyMaxHp: 85,
    allyRegen: 0,
    allyRegenCapRatio: 0,
    enemyDamageMult: 1.0,
    enemyAccuracyMult: 1.0,
    enemyFireRateMult: 1.0,
    enemyHpMult: 1.0,
    maxConcurrentAttackers: 4,
    scoreMult: 1.0,
  },
  veterano: {
    id: 'veterano',
    name: 'VETERANO',
    summary: '6 drones · Aliados 65 HP · Hostiles letales',
    dronesReserve: 6,
    allyMaxHp: 65,
    allyRegen: 0,
    allyRegenCapRatio: 0,
    enemyDamageMult: 1.35,
    enemyAccuracyMult: 1.25,
    enemyFireRateMult: 1.22,
    enemyHpMult: 1.15,
    maxConcurrentAttackers: 5,
    scoreMult: 1.35,
  },
  realista: {
    id: 'realista',
    name: 'REALISTA',
    summary: '5 drones · Aliados 50 HP · Letalidad real',
    dronesReserve: 5,
    allyMaxHp: 50,
    allyRegen: 0,
    allyRegenCapRatio: 0,
    enemyDamageMult: 1.75,
    enemyAccuracyMult: 1.45,
    enemyFireRateMult: 1.38,
    enemyHpMult: 1.2,
    maxConcurrentAttackers: 6,
    scoreMult: 1.75,
  },
};

export const DIFFICULTY_ORDER: readonly DifficultyId[] = [
  'recluta',
  'tactico',
  'veterano',
  'realista',
];

export const GRAVITY_MPS2 = 9.8;
export const SURVIVAL_GOAL_SECONDS = 120;
export const TOTAL_MISSION_TARGETS = 6;
export const MAX_DRONES_RESERVE = 8;
export const MAX_ROCKETS_PER_DRONE = 4;
export const TERRAIN_SIZE = 340;
export const TERRAIN_SEGMENTS = 76;
export const TRENCH_Z_POSITIONS = [-65, -25, 18, 58] as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function applyDeadzone(val: number, threshold = 0.14): number {
  if (Math.abs(val) < threshold) return 0;
  const sign = Math.sign(val);
  return sign * ((Math.abs(val) - threshold) / (1 - threshold));
}

export function getTrenchCenterZ(
  x: number,
  trenchIdx: number,
  mapId: MapId = 'trinchera'
): number {
  const list = BATTLEFIELD_MAPS[mapId].trenchZ;
  const tz = list[trenchIdx] ?? list[0];
  if (mapId === 'ciudad') {
    // Urban concrete drainage channels run straight with slight tactical doglegs
    return tz + Math.sin(x * 0.08 + trenchIdx) * 2.2;
  }
  if (mapId === 'desierto') {
    return tz + Math.sin(x * 0.11 + trenchIdx * 1.3) * 7.8;
  }
  return tz + Math.sin(x * 0.16 + trenchIdx) * 6.5;
}

/**
 * Returns the nearest floor point inside one of the carved tactical trenches
 * for the active map so infantry can sprint, leap over parapets, and crouch inside cover.
 */
export function getNearestTrenchPoint(
  x: number,
  z: number,
  mapId: MapId = 'trinchera'
): { x: number; z: number; distance: number; trenchIndex: number } {
  const list = BATTLEFIELD_MAPS[mapId].trenchZ;
  const clampedX = clamp(x, -90, 90);
  let bestIdx = 0;
  let bestZ = getTrenchCenterZ(clampedX, 0, mapId);
  let bestDist = Math.abs(z - bestZ);

  for (let i = 1; i < list.length; i++) {
    const cz = getTrenchCenterZ(clampedX, i, mapId);
    const d = Math.abs(z - cz);
    if (d < bestDist) {
      bestDist = d;
      bestZ = cz;
      bestIdx = i;
    }
  }

  return {
    x: clampedX,
    z: bestZ,
    distance: Math.hypot(clampedX - x, bestZ - z),
    trenchIndex: bestIdx,
  };
}

/**
 * Deterministic terrain elevation formula shared between Three.js mesh,
 * physics collisions, line-of-sight checks, and unit tests.
 */
export function getTerrainHeightAt(
  x: number,
  z: number,
  mapId: MapId = 'trinchera'
): number {
  let h = 0;

  if (mapId === 'desierto') {
    // Rolling desert dunes + raised flanking canyon rims
    h = Math.sin(x * 0.028 + z * 0.015) * 3.1 + Math.cos(z * 0.042) * 1.4;
    h += Math.sin(x * 0.085 - z * 0.06) * 0.55;
    if (Math.abs(x) > 78) {
      h += Math.min(8.5, (Math.abs(x) - 78) * 0.28);
    }
  } else if (mapId === 'ciudad') {
    // Mostly level concrete industrial yard with gentle ramp grades & sunken drainage channels
    h = Math.sin(x * 0.02) * Math.cos(z * 0.02) * 0.55;
    h += Math.sin(x * 0.09) * 0.12;
  } else {
    h = Math.sin(x * 0.035) * Math.cos(z * 0.035) * 2.8;
    h += Math.sin(x * 0.1 + z * 0.09) * 0.75;
  }

  const trenchList = BATTLEFIELD_MAPS[mapId].trenchZ;
  const trenchDepth = mapId === 'ciudad' ? 1.55 : mapId === 'desierto' ? 1.65 : 1.75;
  for (let idx = 0; idx < trenchList.length; idx++) {
    const centerZ = getTrenchCenterZ(x, idx, mapId);
    const dist = Math.abs(z - centerZ);
    if (dist < 4.5) {
      const t = 1 - dist / 4.5;
      h -= t * t * trenchDepth;
    }
  }

  const craters =
    mapId === 'desierto'
      ? [
          { cx: -34, cz: -8, r: 10 },
          { cx: 30, cz: 14, r: 9 },
          { cx: -8, cz: -44, r: 8.5 },
          { cx: 48, cz: -50, r: 11 },
        ]
      : mapId === 'ciudad'
      ? [
          { cx: -22, cz: -28, r: 7 },
          { cx: 28, cz: 12, r: 8 },
          { cx: -48, cz: 20, r: 7.5 },
        ]
      : [
          { cx: -28, cz: -10, r: 9 },
          { cx: 32, cz: 8, r: 11 },
          { cx: -12, cz: -48, r: 8 },
          { cx: 45, cz: -55, r: 10 },
          { cx: -55, cz: 35, r: 9 },
          { cx: 14, cz: 46, r: 7.5 },
        ];

  for (let i = 0; i < craters.length; i++) {
    const c = craters[i];
    const d = Math.hypot(x - c.cx, z - c.cz);
    if (d < c.r) {
      h -= Math.cos((d / c.r) * (Math.PI / 2)) * (mapId === 'ciudad' ? 1.4 : 2.2);
    }
  }

  return h;
}

/**
 * Continuous segment-sphere intersection to prevent fast bullets from tunneling.
 */
export function segmentHitsSphere(
  p0: Vec3,
  p1: Vec3,
  center: Vec3,
  radius: number
): boolean {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;

  const fx = p0.x - center.x;
  const fy = p0.y - center.y;
  const fz = p0.z - center.z;

  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-8) {
    return fx * fx + fy * fy + fz * fz <= radius * radius;
  }

  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const c = fx * fx + fy * fy + fz * fz - radius * radius;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return false;

  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
}

/**
 * Computes splash damage with smooth linear-quadratic distance falloff.
 */
export function computeSplashDamage(
  distance: number,
  blastRadius: number,
  maxDamage: number
): number {
  if (distance >= blastRadius || blastRadius <= 0) return 0;
  const ratio = 1 - distance / blastRadius;
  return Math.round(maxDamage * (0.35 + 0.65 * ratio * ratio));
}

/**
 * Evaluates whether a projectile aim point needs ballistic gravity compensation.
 */
export function computeBallisticElevationOffset(
  distance: number,
  projectileSpeed: number,
  gravity = GRAVITY_MPS2
): number {
  if (projectileSpeed <= 0 || distance <= 0) return 0;
  const flightTime = distance / projectileSpeed;
  return 0.5 * gravity * flightTime * flightTime;
}

/**
 * Checks if a sphere/point intersects any solid wall/structure slab.
 * Supports minY so open doorways, windows, and overhead roofs allow flight inside buildings.
 */
export function pointHitsStructure(
  pos: Vec3,
  structures: readonly StructureBox[],
  forSight = false,
  radius = 0
): boolean {
  for (let i = 0; i < structures.length; i++) {
    const s = structures[i];
    if (forSight && s.blocksSight === false) continue;
    const minY = s.minY ?? -Infinity;
    if (
      pos.x + radius > s.minX &&
      pos.x - radius < s.maxX &&
      pos.z + radius > s.minZ &&
      pos.z - radius < s.maxZ &&
      pos.y + radius > minY &&
      pos.y - radius < s.maxY
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks clear line-of-sight between two world points across terrain & structures.
 */
export function hasClearLineOfSight(
  from: Vec3,
  to: Vec3,
  structures: readonly StructureBox[],
  heightAt: (x: number, z: number) => number = getTerrainHeightAt
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.001) return true;

  const samples = Math.max(8, Math.ceil(dist / 3.5));
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    const z = from.z + dz * t;
    if (y < heightAt(x, z) + 0.18) return false;
    if (pointHitsStructure({ x, y, z }, structures, true)) return false;
  }
  return true;
}

/**
 * Relative horizontal bearing (-180..+180 deg) from drone yaw to a world target.
 */
export function computeRelativeBearingDeg(
  fromX: number,
  fromZ: number,
  droneYaw: number,
  toX: number,
  toZ: number
): number {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const targetAngle = Math.atan2(-dx, -dz);
  let delta = targetAngle - droneYaw;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.round((-delta * 180) / Math.PI);
}

/**
 * Evaluates mission phase and extraction readiness.
 */
export function evaluateMissionStatus(params: {
  destroyedTargets: number;
  totalTargets: number;
  elapsedTime: number;
  dronesRemaining: number;
  inExtractionZone: boolean;
  extractionActive: boolean;
}): {
  shouldActivateExtraction: boolean;
  outcome: 'ongoing' | 'victory' | 'defeat';
  phaseLabel: string;
} {
  if (params.dronesRemaining <= 0) {
    return {
      shouldActivateExtraction: false,
      outcome: 'defeat',
      phaseLabel: 'SIN RESERVA DE DRONES',
    };
  }

  const allTargetsDone = params.destroyedTargets >= params.totalTargets;
  const timeDone = params.elapsedTime >= SURVIVAL_GOAL_SECONDS;
  const readyForExtraction = allTargetsDone && timeDone;

  if (params.extractionActive && params.inExtractionZone) {
    return {
      shouldActivateExtraction: false,
      outcome: 'victory',
      phaseLabel: 'EXTRACCIÓN COMPLETADA',
    };
  }

  if (params.extractionActive) {
    return {
      shouldActivateExtraction: false,
      outcome: 'ongoing',
      phaseLabel: 'FASE FINAL: EXTRACCIÓN ACTIVA',
    };
  }

  if (readyForExtraction) {
    return {
      shouldActivateExtraction: true,
      outcome: 'ongoing',
      phaseLabel: 'FASE FINAL: EXTRACCIÓN ACTIVA',
    };
  }

  if (allTargetsDone && !timeDone) {
    return {
      shouldActivateExtraction: false,
      outcome: 'ongoing',
      phaseLabel: 'FASE 2: RESISTIR ASEDIO',
    };
  }

  return {
    shouldActivateExtraction: false,
    outcome: 'ongoing',
    phaseLabel: 'FASE 1: BARRER TRINCHERAS',
  };
}

/**
 * Pure gamepad mapper where R1 (button index 5) is strictly ignored.
 * Primary fire is bound to Square (button index 2), Micro-Rocket to Triangle (button index 3),
 * Boost/Deploy to Cross (button index 0), Optics/Zoom to Circle (button index 1),
 * Flight Mode to L1 (button index 4), Vertical climb/dive to R2 (7) and L2 (6).
 */
export function mapGamepadToControlInput(
  gp: GamepadInputSnapshot,
  prevButtons: readonly boolean[] = []
): {
  forward: number;
  strafe: number;
  vertical: number;
  yaw: number;
  pitch: number;
  boost: boolean;
  fire: boolean;
  rocketPressed: boolean;
  toggleOpticsPressed: boolean;
  toggleModePressed: boolean;
  deployPressed: boolean;
  currentButtons: boolean[];
} {
  const axes = gp.axes ?? [];
  const buttons = gp.buttons ?? [];

  const lx = applyDeadzone(axes[0] ?? 0);
  const ly = applyDeadzone(axes[1] ?? 0);
  const rx = applyDeadzone(axes[2] ?? 0);
  const ry = applyDeadzone(axes[3] ?? 0);

  const btnPressed = (idx: number) => Boolean(buttons[idx]?.pressed);
  const btnValue = (idx: number) => buttons[idx]?.value ?? (btnPressed(idx) ? 1 : 0);
  const justPressed = (idx: number) => btnPressed(idx) && !prevButtons[idx];

  const currentButtons = [
    btnPressed(0), // Cross
    btnPressed(1), // Circle
    btnPressed(2), // Square (Fire)
    btnPressed(3), // Triangle (Micro-Rocket)
    btnPressed(4), // L1 (Flight mode)
    false,         // R1 (index 5) deliberately ignored because hardware R1 is broken
    btnPressed(6), // L2
    btnPressed(7), // R2
  ];

  return {
    strafe: clamp(lx, -1, 1),
    forward: clamp(-ly, -1, 1),
    vertical: clamp(btnValue(7) - btnValue(6), -1, 1),
    yaw: -rx * 0.048,
    pitch: -ry * 0.038,
    boost: btnPressed(0), // X (Cruz)
    fire: btnPressed(2),  // Cuadrado (R1 ignorado siempre)
    rocketPressed: justPressed(3), // Triángulo -> Cohete HE
    toggleOpticsPressed: justPressed(1), // Círculo -> Óptica
    toggleModePressed: justPressed(4), // L1 -> Acro/Estabilizado
    deployPressed: justPressed(0) || justPressed(2), // Cruz o Cuadrado en trinchera
    currentButtons,
  };
}
