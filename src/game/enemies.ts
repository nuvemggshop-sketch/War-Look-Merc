import * as THREE from 'three';
import type { AllySoldier } from './allies';
import type { PlayerDrone } from './drone';
import type { EffectsManager } from './particles';
import {
  clamp,
  computeBallisticElevationOffset,
  DIFFICULTIES,
  getNearestTrenchPoint,
  GRAVITY_MPS2,
  type DifficultyConfig,
} from './rules';
import type { ProceduralTextureSet } from './textures';
import type { BattlefieldWorld } from './world';

export type EnemyArchetype = 'ASSAULT' | 'SNIPER' | 'HEAVY';

export type EnemyAIState =
  | 'PATRULLA'
  | 'COMBATE'
  | 'CORRER'
  | 'TRINCHERA'
  | 'ESQUIVAR'
  | 'CAÍDO';

export interface EnemySoldier {
  id: number;
  role: string;
  archetype: EnemyArchetype;
  mesh: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  torso: THREE.Mesh;
  backpack: THREE.Mesh;
  head: THREE.Mesh;
  visor: THREE.Mesh;
  rifle: THREE.Mesh;
  marker: THREE.Mesh;
  laserLine: THREE.Line;
  position: THREE.Vector3;
  originX: number;
  originZ: number;
  patrolDir: number;
  walkPhase: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  state: EnemyAIState;
  thinkTimer: number;
  fireTimer: number;
  burstLeft: number;
  burstTimer: number;
  flinch: number;
  deathTimer: number;
  deathGroundY: number;
  removed: boolean;
  targetPos: THREE.Vector3 | null;
  targetType: 'player' | 'ally' | null;
  targetDist: number;
  los: boolean;
  lastSeenPos: THREE.Vector3 | null;
  strafeDir: number;
  threateningPlayer: boolean;
  hasAttackToken: boolean;
  // Realistic human locomotion & trench cover state
  verticalOffset: number;
  velY: number;
  grounded: boolean;
  jumpCooldown: number;
  crouchAmount: number;
  peekTimer: number;
  peeking: boolean;
  trenchGoal: { x: number; z: number } | null;
  evadeTimer: number;
  woundedShouted: boolean;
  droneAlertCooldown: number;
  recoilOffset: number;
  throwAnimTimer: number;
  grenadeCooldown: number;
  reloadTimer: number;
  headScanPhase: number;
}

const ENEMY_LAST_WORDS: readonly string[] = [
  '¡Aghh! ¡Me dieron!',
  '¡Maldición... cubran el flanco!',
  '¡No... el dron me alcanzó!',
  '¡Médico... estoy fuera!',
  '¡Carajo! ¡Retirada!',
  '¡Tiren abajo ese maldito dron!',
  '¡Arghh! ¡A cubierto todos!',
  '¡No puedo más... sigan sin mí!',
];

const ENEMY_ALERT_SHOUTS: readonly string[] = [
  '¡Dron encima! ¡A la trinchera!',
  '¡Salten! ¡Viene picando!',
  '¡Cubran posición, fuego contra el dron!',
  '¡Granada va, agáchense!',
  '¡Flanco derecho expuesto, muévanse!',
];

const _muzzle = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _nextPos = new THREE.Vector3();
const _slidePos = new THREE.Vector3();
const _allyChest = new THREE.Vector3();
const _laserEndLocal = new THREE.Vector3();

export class EnemyManager {
  private scene: THREE.Scene;
  private getTerrainHeight: (x: number, z: number) => number;
  private world: BattlefieldWorld;
  private textures: ProceduralTextureSet;

  public enemies: EnemySoldier[] = [];
  public readonly maxEnemies = 26;
  private readonly maxConcurrentPlayerAttackers = 4;

  public onEnemyKilled: ((enemy: EnemySoldier, lastWords: string) => void) | null = null;
  public onEnemyShout: ((enemy: EnemySoldier, text: string) => void) | null = null;

  private assets: {
    uniformAssaultMat: THREE.MeshStandardMaterial;
    uniformSniperMat: THREE.MeshStandardMaterial;
    uniformHeavyMat: THREE.MeshStandardMaterial;
    vestMat: THREE.MeshStandardMaterial;
    helmetMat: THREE.MeshStandardMaterial;
    visorRedMat: THREE.MeshBasicMaterial;
    visorAmberMat: THREE.MeshBasicMaterial;
    rifleMat: THREE.MeshStandardMaterial;
    markerMat: THREE.MeshBasicMaterial;
    shadowMat: THREE.MeshBasicMaterial;
    legGeo: THREE.BoxGeometry;
    armGeo: THREE.BoxGeometry;
    torsoGeo: THREE.BoxGeometry;
    heavyArmorGeo: THREE.BoxGeometry;
    backpackGeo: THREE.BoxGeometry;
    headGeo: THREE.SphereGeometry;
    visorGeo: THREE.BoxGeometry;
    rifleGeo: THREE.BoxGeometry;
    markerGeo: THREE.OctahedronGeometry;
    shadowGeo: THREE.CircleGeometry;
  };

  constructor(
    scene: THREE.Scene,
    getTerrainHeight: (x: number, z: number) => number,
    world: BattlefieldWorld,
    textures: ProceduralTextureSet
  ) {
    this.scene = scene;
    this.getTerrainHeight = getTerrainHeight;
    this.world = world;
    this.textures = textures;

    // Hip-pivoted leg & shoulder-pivoted arm geometries for natural running/crouching/jumping
    const legGeo = new THREE.BoxGeometry(0.24, 0.75, 0.26);
    legGeo.translate(0, -0.375, 0);

    const armGeo = new THREE.BoxGeometry(0.18, 0.62, 0.2);
    armGeo.translate(0, -0.26, 0);

    this.assets = {
      uniformAssaultMat: new THREE.MeshStandardMaterial({
        color: 0x33392b,
        roughness: 0.85,
      }),
      uniformSniperMat: new THREE.MeshStandardMaterial({
        color: 0x454236,
        roughness: 0.9,
      }),
      uniformHeavyMat: new THREE.MeshStandardMaterial({
        color: 0x26282a,
        roughness: 0.58,
        metalness: 0.35,
      }),
      vestMat: new THREE.MeshStandardMaterial({
        color: 0x1a1c1a,
        roughness: 0.7,
        metalness: 0.15,
      }),
      helmetMat: new THREE.MeshStandardMaterial({
        color: 0x3b352c,
        roughness: 0.55,
        metalness: 0.25,
      }),
      visorRedMat: new THREE.MeshBasicMaterial({ color: 0xff2822 }),
      visorAmberMat: new THREE.MeshBasicMaterial({ color: 0xffa022 }),
      rifleMat: new THREE.MeshStandardMaterial({
        color: 0x181a1c,
        roughness: 0.4,
        metalness: 0.65,
      }),
      markerMat: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
      shadowMat: new THREE.MeshBasicMaterial({
        map: this.textures.contactShadow,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
      legGeo,
      armGeo,
      torsoGeo: new THREE.BoxGeometry(0.68, 0.85, 0.42),
      heavyArmorGeo: new THREE.BoxGeometry(0.84, 0.35, 0.48),
      backpackGeo: new THREE.BoxGeometry(0.44, 0.55, 0.24),
      headGeo: new THREE.SphereGeometry(0.26, 8, 8),
      visorGeo: new THREE.BoxGeometry(0.32, 0.1, 0.12),
      rifleGeo: new THREE.BoxGeometry(0.08, 0.09, 0.98),
      markerGeo: new THREE.OctahedronGeometry(0.16, 0),
      shadowGeo: new THREE.CircleGeometry(0.85, 12),
    };
  }

  spawnEnemies(
    mapId: 'trinchera' | 'desierto' | 'ciudad' = 'trinchera',
    difficulty: DifficultyConfig = DIFFICULTIES.tactico
  ): void {
    this.enemies.forEach((e) => this.scene.remove(e.mesh));
    this.enemies = [];

    const baseCoords: Array<{
      x: number;
      z: number;
      role: string;
      archetype: EnemyArchetype;
    }> =
      mapId === 'ciudad'
        ? [
            { x: -50, z: -58, role: 'FUSILERO URBANO', archetype: 'ASSAULT' },
            { x: -16, z: -58, role: 'TIRADOR DE AZOTEA', archetype: 'SNIPER' },
            { x: 24, z: -57, role: 'MERCENARIO DE ASALTO', archetype: 'ASSAULT' },
            { x: 56, z: -55, role: 'OPERADOR PESADO', archetype: 'HEAVY' },
            { x: -58, z: -13, role: 'CENTINELA DE DRENAJE', archetype: 'ASSAULT' },
            { x: -20, z: -12, role: 'TIRADOR URBANO', archetype: 'SNIPER' },
            { x: 14, z: -12, role: 'GUARDIA DE AVENIDA', archetype: 'ASSAULT' },
            { x: 52, z: -13, role: 'MERCENARIO DE ASALTO', archetype: 'ASSAULT' },
            { x: -54, z: 30, role: 'TIRADOR DE DRENAJE', archetype: 'SNIPER' },
            { x: -12, z: 30, role: 'FUSILERO URBANO', archetype: 'ASSAULT' },
            { x: 26, z: 30, role: 'OPERADOR PESADO', archetype: 'HEAVY' },
            { x: 58, z: 31, role: 'EXPLORADOR HOSTIL', archetype: 'ASSAULT' },
            { x: -28, z: 46, role: 'GUARDIA DE BLOQUE', archetype: 'ASSAULT' },
            { x: 0, z: -38, role: 'COMANDANTE DE ESCUADRA', archetype: 'HEAVY' },
            { x: -38, z: -42, role: 'CENTINELA DE NAVE', archetype: 'SNIPER' },
            { x: 40, z: -40, role: 'CENTINELA DE NAVE', archetype: 'ASSAULT' },
          ]
        : [
            { x: -55, z: -62, role: 'FUSILERO MERCENARIO', archetype: 'ASSAULT' },
            { x: -20, z: -64, role: 'TIRADOR DE TRINCHERA', archetype: 'SNIPER' },
            { x: 25, z: -63, role: 'MERCENARIO DE ASALTO', archetype: 'ASSAULT' },
            { x: 65, z: -60, role: 'OPERADOR PESADO', archetype: 'HEAVY' },
            { x: -70, z: -24, role: 'EXPLORADOR HOSTIL', archetype: 'ASSAULT' },
            { x: -30, z: -26, role: 'TIRADOR DE TRINCHERA', archetype: 'SNIPER' },
            { x: 12, z: -23, role: 'GUARDIA DE SECTOR', archetype: 'ASSAULT' },
            { x: 52, z: -25, role: 'MERCENARIO DE ASALTO', archetype: 'ASSAULT' },
            { x: -60, z: 18, role: 'TIRADOR DE TRINCHERA', archetype: 'SNIPER' },
            { x: -18, z: 19, role: 'FUSILERO MERCENARIO', archetype: 'ASSAULT' },
            { x: 28, z: 17, role: 'OPERADOR PESADO', archetype: 'HEAVY' },
            { x: 70, z: 20, role: 'EXPLORADOR HOSTIL', archetype: 'ASSAULT' },
            { x: -45, z: 56, role: 'GUARDIA DE TRINCHERA', archetype: 'ASSAULT' },
            { x: -10, z: 58, role: 'FUSILERO MERCENARIO', archetype: 'ASSAULT' },
            { x: 35, z: 57, role: 'MERCENARIO DE ASALTO', archetype: 'ASSAULT' },
            { x: 0, z: -42, role: 'COMANDANTE DE ESCUADRA', archetype: 'HEAVY' },
            { x: -40, z: -45, role: 'CENTINELA DE RUINAS', archetype: 'SNIPER' },
            { x: 47, z: -47, role: 'CENTINELA DE RUINAS', archetype: 'ASSAULT' },
          ];

    baseCoords.forEach((coord, idx) => {
      const safe = this.findValidSpawn(coord.x, coord.z);
      this.createEnemy(
        { x: safe.x, z: safe.z, role: coord.role, archetype: coord.archetype },
        idx,
        difficulty
      );
    });
  }

  private findValidSpawn(x: number, z: number): { x: number; z: number } {
    const isValid = (px: number, pz: number) => {
      const py = this.getTerrainHeight(px, pz) + 0.9;
      return !this.world.checkStructureCollision({ x: px, y: py, z: pz }, false, 0.55);
    };

    if (isValid(x, z)) return { x, z };

    for (let radius = 1.5; radius <= 12; radius += 1.5) {
      for (let step = 0; step < 12; step++) {
        const angle = (step / 12) * Math.PI * 2;
        const px = x + Math.cos(angle) * radius;
        const pz = z + Math.sin(angle) * radius;
        if (isValid(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  }

  private createEnemy(
    coord: { x: number; z: number; role: string; archetype: EnemyArchetype },
    idx: number,
    difficulty: DifficultyConfig = DIFFICULTIES.tactico
  ): void {
    const a = this.assets;
    const group = new THREE.Group();

    const shadow = new THREE.Mesh(a.shadowGeo, a.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04;
    group.add(shadow);

    const uniformMat =
      coord.archetype === 'HEAVY'
        ? a.uniformHeavyMat
        : coord.archetype === 'SNIPER'
        ? a.uniformSniperMat
        : a.uniformAssaultMat;

    const leftLeg = new THREE.Mesh(a.legGeo, uniformMat);
    leftLeg.position.set(-0.18, 0.75, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(a.legGeo, uniformMat);
    rightLeg.position.set(0.18, 0.75, 0);
    group.add(rightLeg);

    const torso = new THREE.Mesh(a.torsoGeo, a.vestMat);
    torso.position.y = 1.15;
    group.add(torso);

    if (coord.archetype === 'HEAVY') {
      const pauldrons = new THREE.Mesh(a.heavyArmorGeo, a.uniformHeavyMat);
      pauldrons.position.y = 0.27;
      torso.add(pauldrons);
    }

    const leftArm = new THREE.Mesh(a.armGeo, uniformMat);
    leftArm.position.set(-0.42, 1.48, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(a.armGeo, uniformMat);
    rightArm.position.set(0.42, 1.48, 0);
    group.add(rightArm);

    const backpack = new THREE.Mesh(a.backpackGeo, a.vestMat);
    backpack.position.set(0, 1.2, -0.3);
    group.add(backpack);

    const head = new THREE.Mesh(a.headGeo, a.helmetMat);
    head.position.y = 1.78;
    group.add(head);

    const visor = new THREE.Mesh(
      a.visorGeo,
      coord.archetype === 'HEAVY' ? a.visorAmberMat : a.visorRedMat
    );
    visor.position.set(0, 1.78, 0.22);
    group.add(visor);

    const rifle = new THREE.Mesh(a.rifleGeo, a.rifleMat);
    rifle.position.set(0.28, 1.18, 0.32);
    if (coord.archetype === 'SNIPER') {
      rifle.scale.set(1, 1, 1.35);
    }
    group.add(rifle);

    const marker = new THREE.Mesh(a.markerGeo, a.markerMat);
    marker.position.y = 2.38;
    group.add(marker);

    // Laser sight telegraph for Snipers & Heavy warning
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.28, 1.24, 0.75),
      new THREE.Vector3(0.28, 1.24, 15),
    ]);
    const laserMat = new THREE.LineBasicMaterial({
      color: 0xff2222,
      transparent: true,
      opacity: 0.7,
    });
    const laserLine = new THREE.Line(laserGeo, laserMat);
    laserLine.visible = false;
    group.add(laserLine);

    const groundY = this.getTerrainHeight(coord.x, coord.z);
    group.position.set(coord.x, groundY, coord.z);
    this.scene.add(group);

    const baseHp = coord.archetype === 'HEAVY' ? 45 : coord.archetype === 'SNIPER' ? 22 : 26;
    const maxHp = Math.max(12, Math.round(baseHp * difficulty.enemyHpMult));

    this.enemies.push({
      id: idx,
      role: coord.role,
      archetype: coord.archetype,
      mesh: group,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      torso,
      backpack,
      head,
      visor,
      rifle,
      marker,
      laserLine,
      position: group.position,
      originX: coord.x,
      originZ: coord.z,
      patrolDir: idx % 2 === 0 ? 1 : -1,
      walkPhase: Math.random() * Math.PI * 2,
      hp: maxHp,
      maxHp,
      alive: true,
      state: 'PATRULLA',
      thinkTimer: Math.random() * 0.4,
      fireTimer: 1.4 + Math.random() * 2.0,
      burstLeft: 0,
      burstTimer: 0,
      flinch: 0,
      deathTimer: 0,
      deathGroundY: groundY,
      removed: false,
      targetPos: null,
      targetType: null,
      targetDist: Infinity,
      los: false,
      lastSeenPos: null,
      strafeDir: idx % 2 === 0 ? 1 : -1,
      threateningPlayer: false,
      hasAttackToken: false,
      verticalOffset: 0,
      velY: 0,
      grounded: true,
      jumpCooldown: Math.random() * 1.2,
      crouchAmount: 0,
      peekTimer: Math.random() * 2.5,
      peeking: false,
      trenchGoal: null,
      evadeTimer: 0,
      woundedShouted: false,
      droneAlertCooldown: 0,
      recoilOffset: 0,
      throwAnimTimer: 0,
      grenadeCooldown: 7 + Math.random() * 8,
      reloadTimer: 0,
      headScanPhase: Math.random() * Math.PI * 2,
    });
  }

  reinforce(
    count = 3,
    difficulty: DifficultyConfig = DIFFICULTIES.tactico
  ): number {
    const alive = this.getAliveCount();
    if (alive >= this.maxEnemies) return 0;
    const toSpawn = Math.min(count, this.maxEnemies - alive);

    const specs: Array<{ role: string; archetype: EnemyArchetype }> = [
      { role: 'FUSILERO MERCENARIO', archetype: 'ASSAULT' },
      { role: 'MERCENARIO DE ASALTO', archetype: 'ASSAULT' },
      { role: 'TIRADOR DE TRINCHERA', archetype: 'SNIPER' },
      { role: 'OPERADOR PESADO', archetype: 'HEAVY' },
    ];
    let spawned = 0;
    for (let i = 0; i < toSpawn; i++) {
      const rawX = (Math.random() - 0.5) * 130;
      const rawZ = -82 - Math.random() * 16;
      const safe = this.findValidSpawn(rawX, rawZ);
      const spec = specs[Math.floor(Math.random() * specs.length)];
      this.createEnemy(
        { x: safe.x, z: safe.z, role: spec.role, archetype: spec.archetype },
        this.enemies.length,
        difficulty
      );
      spawned++;
    }
    return spawned;
  }

  private jump(enemy: EnemySoldier, power = 5.1): void {
    if (!enemy.grounded || enemy.jumpCooldown > 0) return;
    enemy.velY = power;
    enemy.grounded = false;
    enemy.jumpCooldown = 1.35 + Math.random() * 0.7;
  }

  alertNearbyToExplosion(origin: THREE.Vector3, radius = 26): void {
    const mapId = this.world.currentMapId;
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;
      if (enemy.position.distanceTo(origin) < radius) {
        const nearestTrench = getNearestTrenchPoint(
          enemy.position.x + (Math.random() - 0.5) * 8,
          enemy.position.z,
          mapId
        );
        enemy.trenchGoal = { x: nearestTrench.x, z: nearestTrench.z };
        enemy.evadeTimer = 3.2;
        if (enemy.grounded && enemy.jumpCooldown <= 0) {
          this.jump(enemy, 5.2);
        }
      }
    }
  }

  destroyEnemy(enemy: EnemySoldier, effectsManager: EffectsManager): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    enemy.state = 'CAÍDO';
    enemy.deathTimer = 1.45;
    enemy.verticalOffset = 0;
    enemy.velY = 0;
    enemy.deathGroundY = this.getTerrainHeight(enemy.position.x, enemy.position.z);
    enemy.position.y = enemy.deathGroundY;
    enemy.marker.visible = false;
    enemy.laserLine.visible = false;
    enemy.threateningPlayer = false;
    enemy.hasAttackToken = false;
    effectsManager.createExplosion(
      enemy.position.clone().add(new THREE.Vector3(0, 1, 0)),
      0xff3300,
      18
    );

    const words =
      ENEMY_LAST_WORDS[Math.floor(Math.random() * ENEMY_LAST_WORDS.length)];
    this.onEnemyKilled?.(enemy, words);
  }

  damageEnemy(
    enemy: EnemySoldier,
    amount: number,
    effectsManager: EffectsManager
  ): boolean {
    if (!enemy.alive) return false;
    enemy.hp -= amount;
    enemy.flinch = 0.18;
    if (enemy.hp <= 0) {
      this.destroyEnemy(enemy, effectsManager);
      return true;
    }

    // Wounded soldier shouts and sprints/dives into the nearest trench for cover
    if (!enemy.woundedShouted && enemy.hp <= enemy.maxHp * 0.45) {
      enemy.woundedShouted = true;
      this.onEnemyShout?.(enemy, '¡Argh! ¡Estoy herido, a la trinchera!');
      const trench = getNearestTrenchPoint(
        enemy.position.x + (Math.random() - 0.5) * 6,
        enemy.position.z,
        this.world.currentMapId
      );
      enemy.trenchGoal = { x: trench.x, z: trench.z };
      enemy.evadeTimer = 3.4;
      this.jump(enemy, 4.9);
    } else if (!enemy.trenchGoal && enemy.hp < enemy.maxHp * 0.8) {
      const trench = getNearestTrenchPoint(
        enemy.position.x,
        enemy.position.z,
        this.world.currentMapId
      );
      if (trench.distance < 34) {
        enemy.trenchGoal = { x: trench.x, z: trench.z };
      }
    }
    return false;
  }

  private updateDeath(enemy: EnemySoldier, dt: number): void {
    if (enemy.removed) return;
    enemy.deathTimer -= dt;
    const collapse = clamp((1.45 - enemy.deathTimer) / 0.45, 0, 1);
    enemy.mesh.rotation.x = 0;
    enemy.mesh.rotation.z = collapse * (Math.PI / 2);
    enemy.torso.rotation.x = -0.35 * (1 - collapse);
    enemy.leftArm.rotation.x = -0.5 * collapse;
    enemy.rightArm.rotation.x = 0.4 * collapse;
    enemy.rifle.position.y = Math.max(0.2, enemy.rifle.position.y - dt * 1.4);
    enemy.position.y = Math.max(
      enemy.deathGroundY - 0.1,
      enemy.deathGroundY + 0.25 * (1 - collapse)
    );
    if (enemy.deathTimer <= 0) {
      this.scene.remove(enemy.mesh);
      enemy.removed = true;
    }
  }

  private think(
    enemy: EnemySoldier,
    playerDrone: PlayerDrone,
    allies: readonly AllySoldier[],
    playerActive: boolean
  ): void {
    _muzzle.set(enemy.position.x, enemy.position.y + 1.25, enemy.position.z);
    let bestPos: THREE.Vector3 | null = null;
    let bestType: 'player' | 'ally' | null = null;
    let bestDist = Infinity;

    const maxRange = enemy.archetype === 'SNIPER' ? 92 : 76;
    let bestScore = Infinity;

    if (playerActive) {
      const d = enemy.position.distanceTo(playerDrone.position);
      if (d < maxRange && this.world.hasLineOfSight(_muzzle, playerDrone.position)) {
        bestPos = playerDrone.position.clone();
        bestType = 'player';
        bestDist = d;
        // Infantry & heavies prioritize nearby ground squadmates over high-altitude drones
        bestScore = d + (playerDrone.position.y > 14 && enemy.archetype !== 'SNIPER' ? 20 : 0);
      }

      // Evasive human reaction when a fast FPV drone dives closely at this soldier
      const droneSpeed = playerDrone.velocity.length();
      if (d < 19 && droneSpeed > 6.5 && enemy.droneAlertCooldown <= 0) {
        enemy.droneAlertCooldown = 4.5;
        enemy.evadeTimer = 2.6;
        const trench = getNearestTrenchPoint(
          enemy.position.x + (Math.random() - 0.5) * 10,
          enemy.position.z,
          this.world.currentMapId
        );
        enemy.trenchGoal = { x: trench.x, z: trench.z };
        this.jump(enemy, 5.4);
        const shout =
          ENEMY_ALERT_SHOUTS[Math.floor(Math.random() * ENEMY_ALERT_SHOUTS.length)];
        this.onEnemyShout?.(enemy, shout);
      }
    }

    for (let i = 0; i < allies.length; i++) {
      const ally = allies[i];
      if (!ally.alive) continue;
      const d = enemy.position.distanceTo(ally.position);
      if (d > 72 || d >= bestScore) continue;
      _allyChest.set(ally.position.x, ally.position.y + 1.1, ally.position.z);
      if (this.world.hasLineOfSight(_muzzle, _allyChest)) {
        bestPos = _allyChest.clone();
        bestType = 'ally';
        bestDist = d;
        bestScore = d;
      }
    }

    if (bestPos && bestType) {
      enemy.targetPos = bestPos;
      enemy.targetType = bestType;
      enemy.targetDist = bestDist;
      enemy.los = true;
      enemy.lastSeenPos = bestPos.clone();
      enemy.threateningPlayer = bestType === 'player';

      if (!enemy.trenchGoal && enemy.archetype !== 'HEAVY' && Math.random() < 0.25) {
        const trench = getNearestTrenchPoint(
          enemy.position.x + (Math.random() - 0.5) * 12,
          enemy.position.z,
          this.world.currentMapId
        );
        if (trench.distance < 22) {
          enemy.trenchGoal = { x: trench.x, z: trench.z };
        }
      }
    } else {
      enemy.los = false;
      enemy.threateningPlayer = false;
      enemy.laserLine.visible = false;
      if (enemy.lastSeenPos) {
        enemy.targetPos = enemy.lastSeenPos.clone();
        enemy.targetType = null;
        enemy.targetDist = enemy.position.distanceTo(enemy.lastSeenPos);
      } else {
        enemy.targetPos = null;
      }
    }
  }

  private moveHuman(
    enemy: EnemySoldier,
    dirX: number,
    dirZ: number,
    speed: number,
    dt: number,
    faceMovement = true
  ): boolean {
    const nextX = clamp(enemy.position.x + dirX * speed * dt, -96, 96);
    const nextZ = clamp(enemy.position.z + dirZ * speed * dt, -96, 96);
    const curY = this.getTerrainHeight(enemy.position.x, enemy.position.z);
    const nextGroundY = this.getTerrainHeight(nextX, nextZ);

    // Jump automatically when vaulting over sandbag parapets or steep trench lips
    const slope = nextGroundY - curY;
    if (enemy.grounded && enemy.jumpCooldown <= 0 && (slope > 0.22 || slope < -0.35)) {
      this.jump(enemy, 4.7);
    }

    const waistY = (px: number, pz: number) =>
      this.getTerrainHeight(px, pz) + 0.85 + enemy.verticalOffset;

    _nextPos.set(nextX, waistY(nextX, nextZ), nextZ);
    let moved = false;
    if (!this.world.checkStructureCollision(_nextPos, false, 0.44)) {
      enemy.position.x = nextX;
      enemy.position.z = nextZ;
      moved = true;
    } else {
      // Try leaping over low sandbags, otherwise axis-separate slide
      if (enemy.grounded && enemy.jumpCooldown <= 0 && !this.world.checkStructureCollision(
        { x: nextX, y: nextGroundY + 1.4, z: nextZ },
        false,
        0.4
      )) {
        this.jump(enemy, 5.1);
        enemy.position.x = nextX;
        enemy.position.z = nextZ;
        moved = true;
      } else {
        _slidePos.set(nextX, waistY(nextX, enemy.position.z), enemy.position.z);
        if (!this.world.checkStructureCollision(_slidePos, false, 0.44)) {
          enemy.position.x = nextX;
          moved = true;
        }
        _slidePos.set(enemy.position.x, waistY(enemy.position.x, nextZ), nextZ);
        if (!this.world.checkStructureCollision(_slidePos, false, 0.44)) {
          enemy.position.z = nextZ;
          moved = true;
        }
        if (!moved) {
          enemy.strafeDir *= -1;
        }
      }
    }

    if (faceMovement && (dirX * dirX + dirZ * dirZ > 1e-5)) {
      enemy.mesh.rotation.x = 0;
      enemy.mesh.rotation.y = Math.atan2(dirX, dirZ);
    }
    return moved;
  }

  private updatePose(
    enemy: EnemySoldier,
    crouchTarget: number,
    sprinting: boolean,
    moving: boolean,
    dt: number,
    time: number
  ): void {
    enemy.crouchAmount += (crouchTarget - enemy.crouchAmount) * Math.min(1, 10 * dt);
    const c = enemy.crouchAmount;
    enemy.recoilOffset = Math.max(0, enemy.recoilOffset - dt * 4.5);

    const breathe = moving ? 0 : Math.sin(time * 3.2 + enemy.id) * 0.015;
    const hipY = 0.75 - c * 0.28;
    enemy.leftLeg.position.y = hipY;
    enemy.rightLeg.position.y = hipY;

    const torsoY = 1.15 - c * 0.34 + breathe;
    enemy.torso.position.y = torsoY;
    enemy.torso.rotation.x = !enemy.grounded ? 0.38 : sprinting ? 0.25 : c * 0.14;
    enemy.backpack.position.y = torsoY + 0.05;
    enemy.head.position.y = torsoY + 0.62;
    enemy.visor.position.y = enemy.head.position.y;
    enemy.leftArm.position.y = torsoY + 0.33;
    enemy.rightArm.position.y = torsoY + 0.33;
    enemy.rifle.position.y = torsoY + 0.04;
    enemy.rifle.position.z = 0.32 - enemy.recoilOffset * 0.12;

    // Head scanning when idle or patrolling
    if (!enemy.los && enemy.grounded) {
      enemy.headScanPhase += dt * 1.8;
      enemy.head.rotation.y = Math.sin(enemy.headScanPhase) * 0.42;
      enemy.visor.rotation.y = enemy.head.rotation.y;
    } else {
      enemy.head.rotation.y *= 0.85;
      enemy.visor.rotation.y = enemy.head.rotation.y;
    }

    if (!enemy.grounded) {
      // Athletic mid-air jump tuck pose
      enemy.leftLeg.rotation.x = 0.62;
      enemy.rightLeg.rotation.x = -0.38;
      enemy.leftArm.rotation.x = -0.78;
      enemy.rightArm.rotation.x = -0.4;
    } else if (moving) {
      const strideRate = sprinting ? 11.8 : 6.2;
      const strideAmp = sprinting ? 0.88 : 0.48;
      enemy.walkPhase += dt * strideRate;
      enemy.leftLeg.rotation.x = Math.sin(enemy.walkPhase) * strideAmp - c * 0.35;
      enemy.rightLeg.rotation.x = -Math.sin(enemy.walkPhase) * strideAmp - c * 0.35;
      if (sprinting) {
        enemy.leftArm.rotation.x = -Math.sin(enemy.walkPhase) * 0.78;
        enemy.rightArm.rotation.x = Math.sin(enemy.walkPhase) * 0.55 - 0.35;
        enemy.rifle.rotation.x = 0.32;
      } else {
        enemy.leftArm.rotation.x = -0.65;
        enemy.rightArm.rotation.x = -0.75;
      }
    } else {
      enemy.leftLeg.rotation.x += (-c * 0.52 - enemy.leftLeg.rotation.x) * Math.min(1, 10 * dt);
      enemy.rightLeg.rotation.x += (c * 0.32 - enemy.rightLeg.rotation.x) * Math.min(1, 10 * dt);
      enemy.leftArm.rotation.x = enemy.reloadTimer > 0 ? -0.95 : -0.72 - enemy.recoilOffset * 0.18;
      enemy.rightArm.rotation.x = enemy.reloadTimer > 0 ? -0.45 : -0.82 - enemy.recoilOffset * 0.22;
    }

    // Overhead arm throw animation when tossing a grenade
    if (enemy.throwAnimTimer > 0) {
      const throwPhase = 1 - enemy.throwAnimTimer / 0.48;
      enemy.leftArm.rotation.x = -2.3 + throwPhase * 2.8;
    }
  }

  private fireAt(
    enemy: EnemySoldier,
    playerDrone: PlayerDrone,
    effectsManager: EffectsManager,
    difficulty: DifficultyConfig = DIFFICULTIES.tactico
  ): void {
    if (!enemy.targetPos) return;
    enemy.recoilOffset = 0.85;
    _muzzle.set(
      enemy.position.x,
      enemy.position.y + enemy.torso.position.y + 0.08,
      enemy.position.z
    );
    _aim.copy(enemy.targetPos);

    if (enemy.targetType === 'player') {
      const flightTime = _muzzle.distanceTo(_aim) / 76;
      _aim.addScaledVector(playerDrone.velocity, flightTime * 0.34);
    }

    const dist = _muzzle.distanceTo(_aim);
    _aim.y += computeBallisticElevationOffset(dist, 76, GRAVITY_MPS2);

    _dir.subVectors(_aim, _muzzle).normalize();
    const baseSpread =
      enemy.archetype === 'SNIPER'
        ? 0.022
        : enemy.archetype === 'HEAVY'
        ? 0.068
        : 0.044;
    const spread = baseSpread / Math.max(0.5, difficulty.enemyAccuracyMult);
    _dir.x += (Math.random() - 0.5) * spread;
    _dir.y += (Math.random() - 0.5) * (spread * 0.85);
    _dir.z += (Math.random() - 0.5) * spread;
    _dir.normalize();

    effectsManager.spawnProjectile(_muzzle.clone(), _dir.clone(), true, {
      enemy: { id: enemy.id },
    });
  }

  update(
    dt: number,
    playerDrone: PlayerDrone,
    effectsManager: EffectsManager,
    allies: readonly AllySoldier[] = [],
    playerActive = true,
    time = 0,
    difficulty: DifficultyConfig = DIFFICULTIES.tactico
  ): { underFire: boolean; sniperLock: boolean } {
    let underFireWarning = false;
    let sniperLock = false;
    let activePlayerTokens = 0;

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive || !e.threateningPlayer) {
        e.hasAttackToken = false;
      } else if (e.hasAttackToken) {
        activePlayerTokens++;
      }
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (!enemy.alive) {
        this.updateDeath(enemy, dt);
        continue;
      }

      enemy.flinch = Math.max(0, enemy.flinch - dt);
      enemy.jumpCooldown = Math.max(0, enemy.jumpCooldown - dt);
      enemy.evadeTimer = Math.max(0, enemy.evadeTimer - dt);
      enemy.droneAlertCooldown = Math.max(0, enemy.droneAlertCooldown - dt);
      enemy.throwAnimTimer = Math.max(0, enemy.throwAnimTimer - dt);
      enemy.grenadeCooldown = Math.max(0, enemy.grenadeCooldown - dt);
      enemy.reloadTimer = Math.max(0, enemy.reloadTimer - dt);

      // Vertical jump arc physics strictly >= 0 above ground
      if (!enemy.grounded || enemy.verticalOffset > 0) {
        enemy.velY -= 16.5 * dt;
        enemy.verticalOffset += enemy.velY * dt;
        if (enemy.verticalOffset <= 0) {
          const hardLand = enemy.velY < -3.2;
          enemy.verticalOffset = 0;
          enemy.velY = 0;
          enemy.grounded = true;
          if (hardLand) {
            enemy.crouchAmount = Math.max(enemy.crouchAmount, 0.65);
          }
        }
      }

      enemy.marker.rotation.y += dt * 4;
      enemy.marker.position.y = 2.38 + Math.sin(time * 3 + enemy.id) * 0.08;

      enemy.thinkTimer -= dt;
      if (enemy.thinkTimer <= 0) {
        enemy.thinkTimer = 0.22 + Math.random() * 0.16;
        this.think(enemy, playerDrone, allies, playerActive);
      }

      const maxTokens = Math.max(this.maxConcurrentPlayerAttackers, difficulty.maxConcurrentAttackers);
      if (
        enemy.threateningPlayer &&
        !enemy.hasAttackToken &&
        activePlayerTokens < maxTokens
      ) {
        enemy.hasAttackToken = true;
        activePlayerTokens++;
      }

      const engageRange = enemy.archetype === 'SNIPER' ? 88 : 74;
      let sprinting = false;
      let moving = false;
      let crouchTarget = 0;

      // Priority 1: Sprinting into trench cover / dodging fast drone dive
      if (enemy.evadeTimer > 0 && enemy.trenchGoal) {
        const dx = enemy.trenchGoal.x - enemy.position.x;
        const dz = enemy.trenchGoal.z - enemy.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.2) {
          enemy.state = enemy.grounded ? 'CORRER' : 'ESQUIVAR';
          sprinting = true;
          moving = this.moveHuman(enemy, dx / d, dz / d, 5.9, dt, true);
          enemy.laserLine.visible = false;
        } else {
          enemy.evadeTimer = 0;
          enemy.state = 'TRINCHERA';
          crouchTarget = 0.92;
        }
      } else if (enemy.los && enemy.targetPos && enemy.targetDist < engageRange) {
        const nearTrench = getNearestTrenchPoint(
          enemy.position.x,
          enemy.position.z,
          this.world.currentMapId
        );
        const insideTrench = nearTrench.distance < 3.4;

        // If outside trench and wounded or under rush, sprint toward trench while fighting
        if (!insideTrench && enemy.trenchGoal) {
          const dx = enemy.trenchGoal.x - enemy.position.x;
          const dz = enemy.trenchGoal.z - enemy.position.z;
          const d = Math.hypot(dx, dz);
          if (d > 2.4) {
            enemy.state = 'CORRER';
            sprinting = true;
            moving = this.moveHuman(enemy, dx / d, dz / d, 5.6, dt, true);
          } else {
            enemy.trenchGoal = null;
          }
        }

        if (!sprinting) {
          // Face target upright
          const tdx = enemy.targetPos.x - enemy.position.x;
          const tdz = enemy.targetPos.z - enemy.position.z;
          if (tdx * tdx + tdz * tdz > 1e-6) {
            enemy.mesh.rotation.x = 0;
            enemy.mesh.rotation.y = Math.atan2(tdx, tdz);
          }

          if (insideTrench) {
            enemy.state = 'TRINCHERA';
            enemy.peekTimer -= dt;
            if (enemy.peekTimer <= 0) {
              enemy.peeking = !enemy.peeking;
              enemy.peekTimer = enemy.peeking
                ? 1.5 + Math.random() * 1.1
                : 1.1 + Math.random() * 1.1;
            }
            // Crouch deep behind parapet when reloading, pop up slightly to shoot
            crouchTarget = enemy.peeking ? 0.26 : 0.88;
          } else {
            enemy.state = 'COMBATE';
            crouchTarget =
              enemy.archetype === 'SNIPER'
                ? 0.82
                : enemy.hp < enemy.maxHp * 0.55 || enemy.targetDist < 22
                ? 0.65
                : 0.15;

            // Agile tactical sidestepping while firing
            if (enemy.archetype === 'ASSAULT' && enemy.targetDist > 16) {
              const distNorm = Math.max(1, Math.hypot(tdx, tdz));
              const sx = (-tdz / distNorm) * enemy.strafeDir;
              const sz = (tdx / distNorm) * enemy.strafeDir;
              moving = this.moveHuman(enemy, sx, sz, 2.3, dt, false);
              if (Math.random() < 0.012) enemy.strafeDir *= -1;
            }
          }
        }

        enemy.rifle.rotation.x = -0.08 + crouchTarget * 0.16;

        const canShootPlayer =
          enemy.targetType !== 'player' || enemy.hasAttackToken;
        const canExpose = !insideTrench || enemy.peeking || enemy.burstLeft > 0;

        if (canShootPlayer && !sprinting && canExpose) {
          enemy.fireTimer -= dt;

          if (
            enemy.archetype === 'SNIPER' &&
            enemy.fireTimer > 0 &&
            enemy.fireTimer < 0.52
          ) {
            enemy.laserLine.visible = true;
            if (enemy.targetType === 'player') sniperLock = true;
            enemy.mesh.updateMatrixWorld();
            _laserEndLocal.copy(enemy.targetPos);
            enemy.mesh.worldToLocal(_laserEndLocal);
            const posAttr = enemy.laserLine.geometry.attributes
              .position as THREE.BufferAttribute;
            posAttr.setXYZ(0, 0.28, enemy.torso.position.y + 0.05, 0.72);
            posAttr.setXYZ(1, _laserEndLocal.x, _laserEndLocal.y, _laserEndLocal.z);
            posAttr.needsUpdate = true;
          } else {
            enemy.laserLine.visible = false;
          }

          if (enemy.burstLeft <= 0 && enemy.fireTimer <= 0) {
            enemy.burstLeft =
              enemy.archetype === 'HEAVY'
                ? 4 + Math.floor(Math.random() * 2)
                : enemy.archetype === 'SNIPER'
                ? 1
                : 2 + Math.floor(Math.random() * 2);
            enemy.burstTimer = 0;
            const rateScale = 1 / Math.max(0.5, difficulty.enemyFireRateMult);
            enemy.fireTimer =
              (enemy.archetype === 'SNIPER'
                ? 2.4 + Math.random() * 1.1
                : enemy.archetype === 'HEAVY'
                ? 1.9 + Math.random() * 0.9
                : 1.55 + Math.random() * 1.1) * rateScale;
          }

          if (enemy.burstLeft > 0) {
            enemy.burstTimer -= dt;
            if (enemy.burstTimer <= 0) {
              this.fireAt(enemy, playerDrone, effectsManager, difficulty);
              enemy.burstLeft--;
              enemy.burstTimer = enemy.archetype === 'HEAVY' ? 0.11 : 0.15;
              if (enemy.burstLeft === 0 && Math.random() < 0.35) {
                enemy.reloadTimer = 0.85;
              }
            }
          }

          // Toss frag grenade at engaged allies/low drone
          if (
            enemy.grenadeCooldown <= 0 &&
            enemy.targetDist > 9 &&
            enemy.targetDist < 26 &&
            enemy.targetPos.y - enemy.position.y < 5.0
          ) {
            enemy.grenadeCooldown = 12 + Math.random() * 7;
            enemy.throwAnimTimer = 0.48;
            const throwOrigin = enemy.position.clone().add(new THREE.Vector3(0, 1.5, 0));
            const throwVel = enemy.targetPos
              .clone()
              .sub(throwOrigin)
              .multiplyScalar(0.85);
            throwVel.y = 7.2;
            effectsManager.spawnGrenade(throwOrigin, throwVel, 'frag');
            this.onEnemyShout?.(enemy, '¡Granada va, al suelo!');
          }
        } else {
          enemy.laserLine.visible = false;
        }

        if (enemy.threateningPlayer) underFireWarning = true;
      } else {
        enemy.laserLine.visible = false;
        if (enemy.targetPos && enemy.archetype !== 'SNIPER') {
          enemy.state = 'CORRER';
          sprinting = true;
          _toTarget.subVectors(enemy.targetPos, enemy.position);
          _toTarget.y = 0;
          if (_toTarget.lengthSq() > 0.001) _toTarget.normalize();
          _perp.set(-_toTarget.z, 0, _toTarget.x).multiplyScalar(enemy.strafeDir);
          _moveDir
            .copy(_toTarget)
            .multiplyScalar(0.55)
            .addScaledVector(_perp, 0.7)
            .normalize();
          moving = this.moveHuman(enemy, _moveDir.x, _moveDir.z, 4.7, dt, true);
        } else {
          enemy.state = 'PATRULLA';
          if (Math.abs(enemy.position.x - enemy.originX) > 10) {
            enemy.patrolDir *= -1;
          }
          moving = this.moveHuman(enemy, enemy.patrolDir, 0, 2.3, dt, true);
        }
      }

      if (enemy.reloadTimer > 0) {
        crouchTarget = Math.max(crouchTarget, 0.85);
      }
      this.updatePose(enemy, crouchTarget, sprinting, moving, dt, time);

      // Strictly keep feet >= exact terrain triangle (+ jump offset)
      enemy.position.y =
        this.getTerrainHeight(enemy.position.x, enemy.position.z) + enemy.verticalOffset;
      enemy.mesh.rotation.x = 0;

      if (enemy.flinch > 0) {
        enemy.mesh.rotation.z =
          Math.sin(time * 60) * 0.12 * (enemy.flinch / 0.18);
      } else {
        enemy.mesh.rotation.z *= 0.85;
      }
    }

    return { underFire: underFireWarning, sniperLock };
  }

  getAliveCount(): number {
    let count = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].alive) count++;
    }
    return count;
  }
}
