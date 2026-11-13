import * as THREE from 'three';
import type { EnemySoldier } from './enemies';
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
import type { AllyAIState, SquadOrder } from './types';
import type { BattlefieldWorld } from './world';

export interface AllySoldier {
  id: number;
  name: string;
  role: string;
  mesh: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  torso: THREE.Mesh;
  backpack: THREE.Mesh;
  head: THREE.Mesh;
  rifle: THREE.Mesh;
  visor: THREE.Mesh;
  marker: THREE.Mesh;
  label: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  labelCtx: CanvasRenderingContext2D;
  labelTex: THREE.CanvasTexture;
  position: THREE.Vector3;
  home: THREE.Vector3;
  flankOffset: { x: number; z: number };
  patrolDir: number;
  walkPhase: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  state: AllyAIState;
  downGroundY: number;
  lastHitTime: number;
  fireTimer: number;
  burstLeft: number;
  burstTimer: number;
  reactionTimer: number;
  thinkTimer: number;
  flinch: number;
  targetEnemy: EnemySoldier | null;
  targetPos: THREE.Vector3 | null;
  targetDist: number;
  advanceGoal: THREE.Vector3;
  los: boolean;
  strafeDir: number;
  calloutTimer: number;
  scanPhase: number;
  // Realistic human locomotion & trench cover state
  verticalOffset: number;
  velY: number;
  grounded: boolean;
  jumpCooldown: number;
  crouchAmount: number;
  peekTimer: number;
  peeking: boolean;
  recoilOffset: number;
  throwAnimTimer: number;
  smokeCooldown: number;
  reloadTimer: number;
  evadeGrenadeTimer: number;
  targetBarrelIdx: number;
}

const _chest = new THREE.Vector3();
const _enemyChest = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _toGoal = new THREE.Vector3();
const _next = new THREE.Vector3();
const _side = new THREE.Vector3();
const _slide = new THREE.Vector3();
const _holdSpot = new THREE.Vector3();

export class AllyManager {
  private scene: THREE.Scene;
  private getTerrainHeight: (x: number, z: number) => number;
  private world: BattlefieldWorld;
  private textures: ProceduralTextureSet;

  public allies: AllySoldier[] = [];
  public allyLosses = 0;
  public onAllyDown: ((ally: AllySoldier) => void) | null = null;
  public onAllyCallout: ((ally: AllySoldier, text: string) => void) | null = null;

  private readonly definitions = [
    { name: 'CABO RÍOS', role: 'LÍDER', home: { x: -10, z: 62 }, flank: { x: -7, z: 5 } },
    { name: 'SOLDADO VEGA', role: 'TIRADOR', home: { x: 10, z: 60 }, flank: { x: 8, z: 7 } },
    { name: 'SOLDADO MÉNDEZ', role: 'ASALTO', home: { x: -18, z: 58 }, flank: { x: -14, z: 9 } },
    { name: 'SOLDADO TORRES', role: 'APOYO', home: { x: 18, z: 59 }, flank: { x: 14, z: 8 } },
  ];

  private assets: {
    uniformMat: THREE.MeshStandardMaterial;
    vestMat: THREE.MeshStandardMaterial;
    helmetMat: THREE.MeshStandardMaterial;
    visorAliveMat: THREE.MeshBasicMaterial;
    visorDeadMat: THREE.MeshBasicMaterial;
    rifleMat: THREE.MeshStandardMaterial;
    markerMat: THREE.MeshBasicMaterial;
    shadowMat: THREE.MeshBasicMaterial;
    legGeo: THREE.BoxGeometry;
    armGeo: THREE.BoxGeometry;
    torsoGeo: THREE.BoxGeometry;
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

    const legGeo = new THREE.BoxGeometry(0.24, 0.75, 0.26);
    legGeo.translate(0, -0.375, 0);

    const armGeo = new THREE.BoxGeometry(0.18, 0.62, 0.2);
    armGeo.translate(0, -0.26, 0);

    this.assets = {
      uniformMat: new THREE.MeshStandardMaterial({ color: 0x3a4a35, roughness: 0.85 }),
      vestMat: new THREE.MeshStandardMaterial({ color: 0x232b22, roughness: 0.7 }),
      helmetMat: new THREE.MeshStandardMaterial({ color: 0x46523f, roughness: 0.55 }),
      visorAliveMat: new THREE.MeshBasicMaterial({ color: 0x00ff66 }),
      visorDeadMat: new THREE.MeshBasicMaterial({ color: 0x261616 }),
      rifleMat: new THREE.MeshStandardMaterial({
        color: 0x151515,
        roughness: 0.45,
        metalness: 0.5,
      }),
      markerMat: new THREE.MeshBasicMaterial({ color: 0x00ff66 }),
      shadowMat: new THREE.MeshBasicMaterial({
        map: this.textures.contactShadow,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
      legGeo,
      armGeo,
      torsoGeo: new THREE.BoxGeometry(0.68, 0.85, 0.42),
      backpackGeo: new THREE.BoxGeometry(0.44, 0.52, 0.24),
      headGeo: new THREE.SphereGeometry(0.26, 8, 8),
      visorGeo: new THREE.BoxGeometry(0.32, 0.1, 0.12),
      rifleGeo: new THREE.BoxGeometry(0.08, 0.08, 0.95),
      markerGeo: new THREE.OctahedronGeometry(0.2, 0),
      shadowGeo: new THREE.CircleGeometry(0.85, 12),
    };
  }

  spawnSquad(difficulty: DifficultyConfig = DIFFICULTIES.tactico): void {
    this.allies.forEach((a) => this.scene.remove(a.mesh));
    this.allies = [];
    this.allyLosses = 0;

    const a = this.assets;

    this.definitions.forEach((def, idx) => {
      const group = new THREE.Group();

      const shadow = new THREE.Mesh(a.shadowGeo, a.shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.05;
      group.add(shadow);

      const leftLeg = new THREE.Mesh(a.legGeo, a.uniformMat);
      leftLeg.position.set(-0.18, 0.75, 0);
      group.add(leftLeg);

      const rightLeg = new THREE.Mesh(a.legGeo, a.uniformMat);
      rightLeg.position.set(0.18, 0.75, 0);
      group.add(rightLeg);

      const torso = new THREE.Mesh(a.torsoGeo, a.vestMat);
      torso.position.y = 1.15;
      group.add(torso);

      const leftArm = new THREE.Mesh(a.armGeo, a.uniformMat);
      leftArm.position.set(-0.42, 1.48, 0);
      group.add(leftArm);

      const rightArm = new THREE.Mesh(a.armGeo, a.uniformMat);
      rightArm.position.set(0.42, 1.48, 0);
      group.add(rightArm);

      const backpack = new THREE.Mesh(a.backpackGeo, a.vestMat);
      backpack.position.set(0, 1.2, -0.3);
      group.add(backpack);

      const head = new THREE.Mesh(a.headGeo, a.helmetMat);
      head.position.y = 1.78;
      group.add(head);

      const visor = new THREE.Mesh(a.visorGeo, a.visorAliveMat);
      visor.position.set(0, 1.78, 0.22);
      group.add(visor);

      const rifle = new THREE.Mesh(a.rifleGeo, a.rifleMat);
      rifle.position.set(0.28, 1.18, 0.32);
      group.add(rifle);

      const marker = new THREE.Mesh(a.markerGeo, a.markerMat);
      marker.position.y = 2.25;
      group.add(marker);

      const labelInfo = this.makeLabelSprite(def.name);
      labelInfo.sprite.position.y = 2.95;
      group.add(labelInfo.sprite);

      const groundY = this.getTerrainHeight(def.home.x, def.home.z);
      group.position.set(def.home.x, groundY, def.home.z);
      this.scene.add(group);

      this.allies.push({
        id: idx,
        name: def.name,
        role: def.role,
        mesh: group,
        leftLeg,
        rightLeg,
        leftArm,
        rightArm,
        torso,
        backpack,
        head,
        rifle,
        visor,
        marker,
        label: labelInfo.sprite,
        labelCanvas: labelInfo.canvas,
        labelCtx: labelInfo.ctx,
        labelTex: labelInfo.texture,
        position: group.position,
        home: new THREE.Vector3(def.home.x, groundY, def.home.z),
        flankOffset: def.flank,
        patrolDir: idx % 2 === 0 ? 1 : -1,
        walkPhase: Math.random() * Math.PI * 2,
        hp: difficulty.allyMaxHp,
        maxHp: difficulty.allyMaxHp,
        alive: true,
        state: 'AVANZAR',
        downGroundY: groundY,
        lastHitTime: 99,
        fireTimer: 0.9 + Math.random() * 1.4,
        burstLeft: 0,
        burstTimer: 0,
        reactionTimer: 0,
        thinkTimer: Math.random() * 0.25,
        flinch: 0,
        targetEnemy: null,
        targetPos: null,
        targetDist: Infinity,
        advanceGoal: new THREE.Vector3(def.home.x, groundY, def.home.z),
        los: false,
        strafeDir: idx % 2 === 0 ? 1 : -1,
        calloutTimer: 0,
        scanPhase: Math.random() * Math.PI * 2,
        verticalOffset: 0,
        velY: 0,
        grounded: true,
        jumpCooldown: Math.random() * 0.9,
        crouchAmount: 0,
        peekTimer: Math.random() * 2.0,
        peeking: true,
        recoilOffset: 0,
        throwAnimTimer: 0,
        smokeCooldown: 4 + Math.random() * 5,
        reloadTimer: 0,
        evadeGrenadeTimer: 0,
        targetBarrelIdx: -1,
      });
    });
  }

  private makeLabelSprite(text: string): {
    sprite: THREE.Sprite;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: THREE.CanvasTexture;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.paintLabel(canvas, ctx, texture, text, true);

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.4, 0.6, 1);
    sprite.renderOrder = 10;
    return { sprite, canvas, ctx, texture };
  }

  private paintLabel(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    texture: THREE.CanvasTexture,
    text: string,
    alive: boolean
  ): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 23px "Share Tech Mono", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = alive ? 'rgba(8, 12, 10, 0.75)' : 'rgba(26, 8, 8, 0.78)';
    ctx.fillRect(14, 10, 228, 44);
    ctx.strokeStyle = alive
      ? 'rgba(0, 255, 102, 0.85)'
      : 'rgba(239, 68, 68, 0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 10, 228, 44);
    ctx.fillStyle = alive ? '#a7ffd0' : '#fca5a5';
    ctx.fillText(alive ? text : `${text} · KIA`, 128, 33);
    texture.needsUpdate = true;
  }

  private callout(ally: AllySoldier, text: string): void {
    if (ally.calloutTimer > 0) return;
    ally.calloutTimer = 7.5 + Math.random() * 4;
    this.onAllyCallout?.(ally, text);
  }

  private jump(ally: AllySoldier, power = 5.0): void {
    if (!ally.grounded || ally.jumpCooldown > 0) return;
    ally.velY = power;
    ally.grounded = false;
    ally.jumpCooldown = 1.4 + Math.random() * 0.6;
  }

  damageAlly(
    ally: AllySoldier,
    amount: number,
    effectsManager: EffectsManager
  ): boolean {
    if (!ally.alive) return false;
    ally.hp -= amount;
    ally.lastHitTime = 0;
    ally.flinch = 0.22;
    if (ally.hp > 0) {
      if (ally.hp < ally.maxHp * 0.5) {
        ally.state = 'CUBIERTO';
        this.jump(ally, 4.9);
        this.callout(ally, '¡Fuego intenso! ¡Saltando a la trinchera!');
      }
      return false;
    }

    // Permanent KIA: never respawns
    ally.hp = 0;
    ally.alive = false;
    ally.state = 'KIA';
    ally.verticalOffset = 0;
    ally.velY = 0;
    ally.downGroundY = this.getTerrainHeight(ally.position.x, ally.position.z);
    ally.position.y = ally.downGroundY;
    ally.marker.visible = false;
    ally.visor.material = this.assets.visorDeadMat;
    ally.label.position.y = 1.45;
    ally.label.material.opacity = 0.82;
    this.paintLabel(ally.labelCanvas, ally.labelCtx, ally.labelTex, ally.name, false);
    this.allyLosses++;

    effectsManager.createExplosion(
      ally.position.clone().add(new THREE.Vector3(0, 1, 0)),
      0x992211,
      12
    );
    this.onAllyDown?.(ally);
    return true;
  }

  private getEscortGoal(ally: AllySoldier, playerPos: THREE.Vector3): THREE.Vector3 {
    const gx = clamp(playerPos.x + ally.flankOffset.x, -86, 86);
    const gz = clamp(playerPos.z + ally.flankOffset.z, -58, 66);
    const gy = this.getTerrainHeight(gx, gz);
    return new THREE.Vector3(gx, gy, gz);
  }

  private think(
    ally: AllySoldier,
    enemies: readonly EnemySoldier[],
    effectsManager: EffectsManager,
    playerPos: THREE.Vector3,
    squadOrder: SquadOrder
  ): void {
    _chest.set(ally.position.x, ally.position.y + 1.18, ally.position.z);
    ally.targetBarrelIdx = -1;

    // 1. Tactical Grenade Avoidance: dive/sprint away from incoming enemy frag grenades
    for (let g = 0; g < effectsManager.grenades.length; g++) {
      const gr = effectsManager.grenades[g];
      if (gr.kind !== 'frag') continue;
      const gd = ally.position.distanceTo(gr.pos);
      if (gd < 8.8) {
        const dx = ally.position.x - gr.pos.x;
        const dz = ally.position.z - gr.pos.z;
        const len = Math.max(0.1, Math.hypot(dx, dz));
        const ex = clamp(ally.position.x + (dx / len) * 11, -88, 88);
        const ez = clamp(ally.position.z + (dz / len) * 11, -84, 82);
        ally.advanceGoal.set(ex, this.getTerrainHeight(ex, ez), ez);
        ally.evadeGrenadeTimer = 1.65;
        ally.state = 'ESPRINTAR';
        this.jump(ally, 5.2);
        this.callout(ally, '¡Granada enemiga, salten a cubierto!');
        return;
      }
    }

    let best: EnemySoldier | null = null;
    let bestScore = Infinity;
    let nearest: EnemySoldier | null = null;
    let nearestDist = Infinity;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy.alive) continue;
      const d = ally.position.distanceTo(enemy.position);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = enemy;
      }
      if (d > 68) continue;
      _enemyChest.set(enemy.position.x, enemy.position.y + 1.15, enemy.position.z);
      if (!this.world.hasLineOfSight(_chest, _enemyChest)) continue;

      const roleBonus =
        ally.role === 'TIRADOR' && enemy.archetype === 'SNIPER' ? -15 : 0;
      const score = d + (enemy.threateningPlayer ? -18 : 0) + roleBonus;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }

    // 2. Smart Explosive Barrel Targeting if an enemy stands beside a red fuel drum
    if (best) {
      for (let b = 0; b < this.world.explosiveBarrels.length; b++) {
        const barrel = this.world.explosiveBarrels[b];
        if (barrel.exploded) continue;
        if (
          barrel.position.distanceTo(best.position) < 6.8 &&
          ally.position.distanceTo(barrel.position) < 62 &&
          this.world.hasLineOfSight(_chest, barrel.position)
        ) {
          ally.targetBarrelIdx = b;
          break;
        }
      }
    }

    const escortGoal = this.getEscortGoal(ally, playerPos);
    const distFromEscort = Math.hypot(
      ally.position.x - escortGoal.x,
      ally.position.z - escortGoal.z
    );
    const nearTrench = getNearestTrenchPoint(
      ally.position.x,
      ally.position.z,
      this.world.currentMapId
    );

    if (ally.lastHitTime < 3.5 && ally.hp < ally.maxHp * 0.58) {
      // Seek hard trench cover immediately when wounded
      if (nearTrench.distance < 32) {
        ally.advanceGoal.set(
          nearTrench.x,
          this.getTerrainHeight(nearTrench.x, nearTrench.z),
          nearTrench.z
        );
        ally.state = nearTrench.distance < 3.2 ? 'TRINCHERA' : 'CUBIERTO';
      } else {
        ally.state = 'CUBIERTO';
        _holdSpot.copy(ally.position);
        _holdSpot.z = clamp(_holdSpot.z + 5.0, -84, 82);
        _holdSpot.y = this.getTerrainHeight(_holdSpot.x, _holdSpot.z);
        ally.advanceGoal.copy(_holdSpot);
      }
      ally.los = Boolean(best);
      ally.targetEnemy = best;
      if (ally.targetBarrelIdx >= 0) {
        ally.targetPos = this.world.explosiveBarrels[ally.targetBarrelIdx].position.clone();
      } else {
        ally.targetPos = best
          ? new THREE.Vector3(best.position.x, best.position.y + 1.15, best.position.z)
          : null;
      }
      ally.targetDist = bestScore;
      return;
    }

    if (best) {
      if (!ally.los || ally.targetEnemy !== best) {
        ally.reactionTimer = 0.2 + Math.random() * 0.14;
        if (ally.role === 'LÍDER') {
          this.callout(ally, '¡Contacto hostil al frente, abriendo fuego!');
        } else {
          this.callout(ally, '¡Enemigo en visual, suprimiendo!');
        }
      }
      ally.targetEnemy = best;
      if (ally.targetBarrelIdx >= 0) {
        ally.targetPos = this.world.explosiveBarrels[ally.targetBarrelIdx].position.clone();
      } else {
        ally.targetPos = new THREE.Vector3(
          best.position.x,
          best.position.y + 1.15,
          best.position.z
        );
      }
      ally.targetDist = bestScore;
      ally.los = true;

      if (squadOrder === 'ESCOLTA' && distFromEscort > 19) {
        ally.advanceGoal.copy(escortGoal);
      } else if (nearTrench.distance < 7.5) {
        // Bound into nearby trench to shoot from real cover!
        ally.advanceGoal.set(
          nearTrench.x,
          this.getTerrainHeight(nearTrench.x, nearTrench.z),
          nearTrench.z
        );
      } else {
        ally.advanceGoal.copy(ally.position);
      }
      ally.state = nearTrench.distance < 3.4 ? 'TRINCHERA' : 'COMBATE';
    } else {
      ally.los = false;
      ally.targetEnemy = null;
      ally.targetPos = null;

      if (squadOrder === 'ESCOLTA') {
        if (distFromEscort > 18) {
          ally.advanceGoal.copy(escortGoal);
          ally.state = 'ESPRINTAR';
        } else if (distFromEscort > 5.5) {
          ally.advanceGoal.copy(escortGoal);
          ally.state = 'AVANZAR';
        } else if (nearest && nearestDist < 54) {
          // Flank around nearest enemy while keeping squad formation
          const flankSign = ally.id % 2 === 0 ? -1 : 1;
          const midX = clamp(
            escortGoal.x * 0.55 + nearest.position.x * 0.45 + flankSign * 5.5,
            -88,
            88
          );
          const midZ = clamp(
            escortGoal.z * 0.55 + nearest.position.z * 0.45,
            -84,
            82
          );
          ally.advanceGoal.set(midX, this.getTerrainHeight(midX, midZ), midZ);
          ally.state = 'AVANZAR';
        } else if (nearTrench.distance < 8.5) {
          ally.advanceGoal.set(
            nearTrench.x,
            this.getTerrainHeight(nearTrench.x, nearTrench.z),
            nearTrench.z
          );
          ally.state = nearTrench.distance < 2.8 ? 'TRINCHERA' : 'AVANZAR';
        } else {
          ally.advanceGoal.copy(escortGoal);
          ally.state = 'PATRULLA';
        }
      } else {
        if (nearTrench.distance < 14) {
          ally.advanceGoal.set(
            nearTrench.x,
            this.getTerrainHeight(nearTrench.x, nearTrench.z),
            nearTrench.z
          );
          ally.state = nearTrench.distance < 2.8 ? 'TRINCHERA' : 'CUBIERTO';
        } else {
          ally.advanceGoal.copy(ally.position);
          ally.state = 'PATRULLA';
        }
      }
    }
  }

  private moveToward(
    ally: AllySoldier,
    goal: THREE.Vector3,
    speed: number,
    dt: number,
    faceTarget = false
  ): boolean {
    _toGoal.subVectors(goal, ally.position);
    _toGoal.y = 0;
    const dist = _toGoal.length();

    if (dist > 1.5) {
      _toGoal.divideScalar(dist);
      const stepX = _toGoal.x * speed * dt;
      const stepZ = _toGoal.z * speed * dt;

      const nextX = clamp(ally.position.x + stepX, -94, 94);
      const nextZ = clamp(ally.position.z + stepZ, -92, 92);
      const curGroundY = this.getTerrainHeight(ally.position.x, ally.position.z);
      const nextGroundY = this.getTerrainHeight(nextX, nextZ);

      // Jump naturally when stepping over trench lips / parapets
      const slope = nextGroundY - curGroundY;
      if (ally.grounded && ally.jumpCooldown <= 0 && (slope > 0.22 || slope < -0.35)) {
        this.jump(ally, 4.9);
      }

      const waistY = (px: number, pz: number) =>
        this.getTerrainHeight(px, pz) + 0.85 + ally.verticalOffset;

      _next.set(nextX, waistY(nextX, nextZ), nextZ);
      if (!this.world.checkStructureCollision(_next, false, 0.45)) {
        ally.position.x = nextX;
        ally.position.z = nextZ;
      } else if (
        ally.grounded &&
        ally.jumpCooldown <= 0 &&
        !this.world.checkStructureCollision(
          { x: nextX, y: nextGroundY + 1.4, z: nextZ },
          false,
          0.4
        )
      ) {
        // Vault over sandbag barrier
        this.jump(ally, 5.2);
        ally.position.x = nextX;
        ally.position.z = nextZ;
      } else {
        let moved = false;
        _slide.set(nextX, waistY(nextX, ally.position.z), ally.position.z);
        if (!this.world.checkStructureCollision(_slide, false, 0.45)) {
          ally.position.x = nextX;
          moved = true;
        }
        _slide.set(ally.position.x, waistY(ally.position.x, nextZ), nextZ);
        if (!this.world.checkStructureCollision(_slide, false, 0.45)) {
          ally.position.z = nextZ;
          moved = true;
        }
        if (!moved) {
          _side.set(-_toGoal.z, 0, _toGoal.x).multiplyScalar(ally.strafeDir);
          const sx = clamp(ally.position.x + _side.x * speed * 0.8 * dt, -94, 94);
          const sz = clamp(ally.position.z + _side.z * speed * 0.8 * dt, -92, 92);
          _slide.set(sx, waistY(sx, sz), sz);
          if (!this.world.checkStructureCollision(_slide, false, 0.45)) {
            ally.position.x = sx;
            ally.position.z = sz;
          } else {
            ally.strafeDir *= -1;
          }
        }
      }

      if (!faceTarget) {
        ally.mesh.rotation.x = 0;
        ally.mesh.rotation.y = Math.atan2(_toGoal.x, _toGoal.z);
      }
      return true;
    }

    return false;
  }

  private updatePose(
    ally: AllySoldier,
    crouchTarget: number,
    sprinting: boolean,
    moving: boolean,
    dt: number,
    time: number
  ): void {
    ally.crouchAmount += (crouchTarget - ally.crouchAmount) * Math.min(1, 10 * dt);
    const c = ally.crouchAmount;
    ally.recoilOffset = Math.max(0, ally.recoilOffset - dt * 4.5);

    const breathe = moving ? 0 : Math.sin(time * 3.0 + ally.id) * 0.015;
    const hipY = 0.75 - c * 0.28;
    ally.leftLeg.position.y = hipY;
    ally.rightLeg.position.y = hipY;

    const torsoY = 1.15 - c * 0.34 + breathe;
    ally.torso.position.y = torsoY;
    ally.torso.rotation.x = !ally.grounded ? 0.36 : sprinting ? 0.24 : c * 0.14;
    ally.backpack.position.y = torsoY + 0.05;
    ally.head.position.y = torsoY + 0.62;
    ally.visor.position.y = ally.head.position.y;
    ally.leftArm.position.y = torsoY + 0.33;
    ally.rightArm.position.y = torsoY + 0.33;
    ally.rifle.position.y = torsoY + 0.04;
    ally.rifle.position.z = 0.32 - ally.recoilOffset * 0.12;

    if (!ally.grounded) {
      ally.leftLeg.rotation.x = 0.58;
      ally.rightLeg.rotation.x = -0.36;
      ally.leftArm.rotation.x = -0.74;
      ally.rightArm.rotation.x = -0.38;
    } else if (moving) {
      const strideRate = sprinting ? 11.6 : 6.8;
      const strideAmp = sprinting ? 0.85 : 0.52;
      ally.walkPhase += dt * strideRate;
      ally.leftLeg.rotation.x = Math.sin(ally.walkPhase) * strideAmp - c * 0.32;
      ally.rightLeg.rotation.x = -Math.sin(ally.walkPhase) * strideAmp - c * 0.32;
      if (sprinting) {
        ally.leftArm.rotation.x = -Math.sin(ally.walkPhase) * 0.72;
        ally.rightArm.rotation.x = Math.sin(ally.walkPhase) * 0.55 - 0.35;
        ally.rifle.rotation.x = 0.28;
      } else {
        ally.leftArm.rotation.x = -0.65;
        ally.rightArm.rotation.x = -0.75;
      }
    } else {
      ally.leftLeg.rotation.x += (-c * 0.5 - ally.leftLeg.rotation.x) * Math.min(1, 10 * dt);
      ally.rightLeg.rotation.x += (c * 0.3 - ally.rightLeg.rotation.x) * Math.min(1, 10 * dt);
      ally.leftArm.rotation.x = ally.reloadTimer > 0 ? -0.92 : -0.7 - ally.recoilOffset * 0.18;
      ally.rightArm.rotation.x = ally.reloadTimer > 0 ? -0.45 : -0.8 - ally.recoilOffset * 0.22;
    }

    if (ally.throwAnimTimer > 0) {
      const throwPhase = 1 - ally.throwAnimTimer / 0.48;
      ally.leftArm.rotation.x = -2.3 + throwPhase * 2.8;
    }
  }

  private fireAt(ally: AllySoldier, effectsManager: EffectsManager): void {
    if (!ally.targetPos) return;
    ally.recoilOffset = 0.85;
    _muzzle.set(
      ally.position.x,
      ally.position.y + ally.torso.position.y + 0.05,
      ally.position.z
    );
    _aim.copy(ally.targetPos);
    const dist = _muzzle.distanceTo(_aim);
    _aim.y += computeBallisticElevationOffset(dist, 115, GRAVITY_MPS2);

    _dir.subVectors(_aim, _muzzle).normalize();
    _dir.x += (Math.random() - 0.5) * 0.028;
    _dir.y += (Math.random() - 0.5) * 0.024;
    _dir.z += (Math.random() - 0.5) * 0.028;
    _dir.normalize();

    effectsManager.spawnProjectile(_muzzle.clone(), _dir.clone(), false, {
      ally: { name: ally.name },
    });
  }

  update(
    dt: number,
    enemies: readonly EnemySoldier[],
    effectsManager: EffectsManager,
    playerPos: THREE.Vector3,
    squadOrder: SquadOrder = 'ESCOLTA',
    time = 0,
    difficulty: DifficultyConfig = DIFFICULTIES.tactico
  ): void {
    for (let i = 0; i < this.allies.length; i++) {
      const ally = this.allies[i];
      ally.calloutTimer = Math.max(0, ally.calloutTimer - dt);
      ally.flinch = Math.max(0, ally.flinch - dt);
      ally.jumpCooldown = Math.max(0, ally.jumpCooldown - dt);
      ally.throwAnimTimer = Math.max(0, ally.throwAnimTimer - dt);
      ally.smokeCooldown = Math.max(0, ally.smokeCooldown - dt);
      ally.reloadTimer = Math.max(0, ally.reloadTimer - dt);
      ally.evadeGrenadeTimer = Math.max(0, ally.evadeGrenadeTimer - dt);

      if (!ally.alive) {
        ally.mesh.rotation.x = 0;
        ally.mesh.rotation.z = Math.min(
          Math.PI / 2,
          Math.max(0, ally.mesh.rotation.z) + dt * 4.0
        );
        ally.torso.rotation.x *= 0.85;
        ally.position.y = ally.downGroundY + 0.28 * (1 - ally.mesh.rotation.z / (Math.PI / 2));
        continue;
      }

      if (!ally.grounded || ally.verticalOffset > 0) {
        ally.velY -= 16.5 * dt;
        ally.verticalOffset += ally.velY * dt;
        if (ally.verticalOffset <= 0) {
          const hardLand = ally.velY < -3.2;
          ally.verticalOffset = 0;
          ally.velY = 0;
          ally.grounded = true;
          if (hardLand) {
            ally.crouchAmount = Math.max(ally.crouchAmount, 0.6);
          }
        }
      }

      ally.lastHitTime += dt;
      ally.marker.rotation.y += dt * 3;
      ally.marker.position.y = 2.25 + Math.sin(time * 4 + ally.id) * 0.1;

      ally.thinkTimer -= dt;
      if (ally.thinkTimer <= 0) {
        ally.thinkTimer = 0.22 + Math.random() * 0.14;
        this.think(ally, enemies, effectsManager, playerPos, squadOrder);
      }

      let moving = false;
      let sprinting = false;
      let crouchTarget = 0;

      if (ally.evadeGrenadeTimer > 0) {
        sprinting = true;
        moving = this.moveToward(ally, ally.advanceGoal, 6.9, dt);
        crouchTarget = 0.15;
      } else if (ally.state === 'CUBIERTO' || ally.state === 'TRINCHERA') {
        const distToCover = Math.hypot(
          ally.position.x - ally.advanceGoal.x,
          ally.position.z - ally.advanceGoal.z
        );
        if (distToCover > 2.2) {
          sprinting = true;
          moving = this.moveToward(ally, ally.advanceGoal, 5.8, dt);
          crouchTarget = 0.2;
        } else {
          ally.state = 'TRINCHERA';
          ally.peekTimer -= dt;
          if (ally.peekTimer <= 0) {
            ally.peeking = !ally.peeking;
            ally.peekTimer = ally.peeking ? 1.5 : 1.15;
          }
          crouchTarget = ally.peeking && ally.los ? 0.28 : 0.9;
        }

        // Only Recluta allows limited field dressing up to cap; Táctico+ has real permanent damage!
        if (difficulty.allyRegen > 0 && ally.lastHitTime > 6.0) {
          const cap = ally.maxHp * difficulty.allyRegenCapRatio;
          if (ally.hp < cap) {
            ally.hp = Math.min(cap, ally.hp + difficulty.allyRegen * dt);
          }
        }
      }

      if (ally.los && ally.targetPos && !sprinting) {
        if (ally.state !== 'TRINCHERA') ally.state = 'COMBATE';
        const dx = ally.targetPos.x - ally.position.x;
        const dz = ally.targetPos.z - ally.position.z;
        if (dx * dx + dz * dz > 1e-6) {
          ally.mesh.rotation.x = 0;
          ally.mesh.rotation.y = Math.atan2(dx, dz);
        }

        if (ally.state === 'COMBATE') {
          crouchTarget = ally.hp < ally.maxHp * 0.55 ? 0.72 : 0.12;
        }
        ally.rifle.rotation.x = -0.06 + crouchTarget * 0.16;

        const distFromGoal = Math.hypot(
          ally.position.x - ally.advanceGoal.x,
          ally.position.z - ally.advanceGoal.z
        );
        if (squadOrder === 'ESCOLTA' && distFromGoal > 6.5) {
          moving = this.moveToward(ally, ally.advanceGoal, 4.8, dt, true);
        }

        ally.reactionTimer = Math.max(0, ally.reactionTimer - dt);
        ally.fireTimer -= dt;
        if (ally.reactionTimer <= 0 && ally.burstLeft <= 0 && ally.fireTimer <= 0) {
          ally.burstLeft = 2 + Math.floor(Math.random() * 3);
          ally.burstTimer = 0;
          ally.fireTimer = 1.35 + Math.random() * 1.0;
        }
        if (ally.reactionTimer <= 0 && ally.burstLeft > 0) {
          ally.burstTimer -= dt;
          if (ally.burstTimer <= 0) {
            this.fireAt(ally, effectsManager);
            ally.burstLeft--;
            ally.burstTimer = 0.12 + Math.random() * 0.06;
            if (ally.burstLeft === 0 && Math.random() < 0.35) {
              ally.reloadTimer = 0.85;
              if (Math.random() < 0.45) {
                this.callout(ally, '¡Recargando, cubran el sector!');
              }
            }
          }
        }

        if (ally.smokeCooldown <= 0 && ally.hp < ally.maxHp * 0.72) {
          ally.smokeCooldown = 16 + Math.random() * 8;
          ally.throwAnimTimer = 0.48;
          const smokeOrigin = ally.position.clone().add(new THREE.Vector3(0, 1.4, 0));
          const smokeVel = ally.targetPos
            .clone()
            .sub(smokeOrigin)
            .normalize()
            .multiplyScalar(7.5);
          smokeVel.y = 5.4;
          effectsManager.spawnGrenade(smokeOrigin, smokeVel, 'smoke');
          this.callout(ally, '¡Lanzando granada de humo, cubriendo posición!');
        }
      } else if (ally.state === 'ESPRINTAR' || ally.state === 'AVANZAR') {
        const escortDist = Math.hypot(
          ally.position.x - ally.advanceGoal.x,
          ally.position.z - ally.advanceGoal.z
        );
        sprinting = ally.state === 'ESPRINTAR' || escortDist > 20;
        const moveSpeed = sprinting ? 6.8 : 5.0;
        moving = this.moveToward(ally, ally.advanceGoal, moveSpeed, dt);
        ally.scanPhase += dt * 2.2;
        ally.head.rotation.y = Math.sin(ally.scanPhase) * 0.35;
      } else if (!moving && ally.state === 'PATRULLA') {
        const nextX = ally.position.x + ally.patrolDir * 1.6 * dt;
        const anchorX = ally.advanceGoal.x;
        if (Math.abs(nextX - anchorX) > 4.5) ally.patrolDir *= -1;
        const waistY = this.getTerrainHeight(nextX, ally.position.z) + 0.85 + ally.verticalOffset;
        _next.set(nextX, waistY, ally.position.z);
        if (!this.world.checkStructureCollision(_next, false, 0.45)) {
          ally.position.x = nextX;
          moving = true;
        } else {
          ally.patrolDir *= -1;
        }
        ally.mesh.rotation.x = 0;
        ally.mesh.rotation.y = ally.patrolDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        ally.scanPhase += dt * 1.4;
        ally.head.rotation.y = Math.sin(ally.scanPhase) * 0.45;
      }

      if (ally.reloadTimer > 0) {
        crouchTarget = Math.max(crouchTarget, 0.82);
      }
      this.updatePose(ally, crouchTarget, sprinting, moving, dt, time);

      // Strictly keep alive soldier's boots planted on exact rendered terrain (+ jump offset)
      ally.position.y =
        this.getTerrainHeight(ally.position.x, ally.position.z) + ally.verticalOffset;
      ally.mesh.rotation.x = 0;

      if (ally.state === 'COMBATE') {
        ally.head.rotation.y *= 0.85;
      }

      if (ally.flinch > 0) {
        ally.mesh.rotation.z =
          Math.sin(time * 65) * 0.14 * (ally.flinch / 0.22);
      } else {
        ally.mesh.rotation.z *= 0.85;
      }
    }
  }

  getAllies(): AllySoldier[] {
    return this.allies;
  }

  getAliveCount(): number {
    let c = 0;
    for (let i = 0; i < this.allies.length; i++) {
      if (this.allies[i].alive) c++;
    }
    return c;
  }
}
