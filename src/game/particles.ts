import * as THREE from 'three';
import type { SoundManager } from './audio';
import { GRAVITY_MPS2 } from './rules';
import type { ProceduralTextureSet } from './textures';
import type { BattlefieldWorld } from './world';

export interface ActiveProjectile {
  mesh: THREE.Mesh;
  prevPos: THREE.Vector3;
  vel: THREE.Vector3;
  isEnemy: boolean;
  isRocket?: boolean;
  owner: { ally?: { name: string }; enemy?: { id: number } } | null;
  gravity: number;
  life: number;
  nearMissTriggered: boolean;
}

export interface ActiveGrenade {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  kind: 'smoke' | 'frag';
  fuseTimer: number;
  smokeTimer: number;
}

interface PooledParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  scale: number;
  life: number;
  maxLife: number;
  gravity: number;
  color: THREE.Color;
}

interface ShockwaveRing {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  speed: number;
}

const MAX_POOL_PARTICLES = 160;
const _dummy = new THREE.Object3D();
const _upVec = new THREE.Vector3(0, 1, 0);
const _dirVec = new THREE.Vector3();
const _sampleVec = new THREE.Vector3();

export class EffectsManager {
  private scene: THREE.Scene;
  private sound: SoundManager;
  private world: BattlefieldWorld | null = null;

  public projectiles: ActiveProjectile[] = [];
  public grenades: ActiveGrenade[] = [];
  public onExplosion: ((position: THREE.Vector3, power: number) => void) | null = null;
  public onRocketImpact: ((position: THREE.Vector3) => void) | null = null;
  public onFragExplode: ((position: THREE.Vector3) => void) | null = null;

  private particleInstanced: THREE.InstancedMesh;
  private particlePool: PooledParticle[] = [];
  private poolCursor = 0;

  private shockwaves: ShockwaveRing[] = [];
  private smokePoints: THREE.Points;
  private smokeSpeeds: Float32Array;
  private smokeOrigins: Float32Array;
  private ashPoints: THREE.Points;
  private ashSpeeds: Float32Array;

  private tracerGeo: THREE.CylinderGeometry;
  private rocketGeo: THREE.CylinderGeometry;
  private grenadeGeo: THREE.SphereGeometry;
  private flashGeo: THREE.SphereGeometry;
  private ringGeo: THREE.RingGeometry;
  private enemyTracerMat: THREE.MeshBasicMaterial;
  private allyTracerMat: THREE.MeshBasicMaterial;
  private playerTracerMat: THREE.MeshBasicMaterial;
  private rocketMat: THREE.MeshBasicMaterial;
  private smokeGrenadeMat: THREE.MeshStandardMaterial;
  private fragGrenadeMat: THREE.MeshBasicMaterial;
  private flashMat: THREE.MeshBasicMaterial;
  private flashMeshes: Array<{ mesh: THREE.Mesh; life: number }> = [];
  private explosionLights: Array<{ light: THREE.PointLight; life: number }> = [];

  constructor(
    scene: THREE.Scene,
    soundManager: SoundManager,
    textures: ProceduralTextureSet
  ) {
    this.scene = scene;
    this.sound = soundManager;

    const pGeo = new THREE.DodecahedronGeometry(0.24, 0);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.particleInstanced = new THREE.InstancedMesh(pGeo, pMat, MAX_POOL_PARTICLES);
    this.particleInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleInstanced.frustumCulled = false;

    for (let i = 0; i < MAX_POOL_PARTICLES; i++) {
      this.particlePool.push({
        active: false,
        pos: new THREE.Vector3(0, -500, 0),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        scale: 0,
        life: 0,
        maxLife: 1,
        gravity: 16,
        color: new THREE.Color(0xffaa55),
      });
      _dummy.position.set(0, -500, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      this.particleInstanced.setMatrixAt(i, _dummy.matrix);
      this.particleInstanced.setColorAt(i, this.particlePool[i].color);
    }
    this.particleInstanced.instanceMatrix.needsUpdate = true;
    if (this.particleInstanced.instanceColor) {
      this.particleInstanced.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.particleInstanced);

    this.tracerGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.85, 5);
    this.rocketGeo = new THREE.CylinderGeometry(0.11, 0.14, 1.35, 6);
    this.grenadeGeo = new THREE.SphereGeometry(0.16, 6, 6);
    this.flashGeo = new THREE.SphereGeometry(0.26, 6, 6);
    this.ringGeo = new THREE.RingGeometry(1.22, 1.34, 32);

    this.enemyTracerMat = new THREE.MeshBasicMaterial({
      color: 0xff3b1f,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.allyTracerMat = new THREE.MeshBasicMaterial({
      color: 0x55ffd0,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.playerTracerMat = new THREE.MeshBasicMaterial({
      color: 0xb7ff66,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.rocketMat = new THREE.MeshBasicMaterial({
      color: 0xff9d2e,
    });
    this.smokeGrenadeMat = new THREE.MeshStandardMaterial({
      color: 0x4b5563,
      roughness: 0.6,
    });
    this.fragGrenadeMat = new THREE.MeshBasicMaterial({
      color: 0xff3b1f,
    });
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd07a,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const smokeLocations = [
      new THREE.Vector3(-45, 0, -40),
      new THREE.Vector3(50, 0, -65),
      new THREE.Vector3(-70, 0, 55),
      new THREE.Vector3(35, 0, 45),
      new THREE.Vector3(0, 0, -85),
    ];
    const perLoc = 10;
    const totalSmoke = smokeLocations.length * perLoc;
    const smokePos = new Float32Array(totalSmoke * 3);
    this.smokeSpeeds = new Float32Array(totalSmoke);
    this.smokeOrigins = new Float32Array(totalSmoke * 2);

    let sIdx = 0;
    smokeLocations.forEach((loc) => {
      for (let i = 0; i < perLoc; i++) {
        smokePos[sIdx * 3] = loc.x + (Math.random() - 0.5) * 8;
        smokePos[sIdx * 3 + 1] = Math.random() * 26;
        smokePos[sIdx * 3 + 2] = loc.z + (Math.random() - 0.5) * 8;
        this.smokeOrigins[sIdx * 2] = loc.x;
        this.smokeOrigins[sIdx * 2 + 1] = loc.z;
        this.smokeSpeeds[sIdx] = 1.2 + Math.random() * 1.6;
        sIdx++;
      }
    });

    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
    const smokeMat = new THREE.PointsMaterial({
      color: 0x3b3835,
      map: textures.smokeSprite,
      size: 11,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.smokePoints = new THREE.Points(smokeGeo, smokeMat);
    this.smokePoints.frustumCulled = false;
    this.scene.add(this.smokePoints);

    const ashCount = 90;
    const ashPos = new Float32Array(ashCount * 3);
    this.ashSpeeds = new Float32Array(ashCount);
    for (let i = 0; i < ashCount; i++) {
      ashPos[i * 3] = (Math.random() - 0.5) * 240;
      ashPos[i * 3 + 1] = Math.random() * 56;
      ashPos[i * 3 + 2] = (Math.random() - 0.5) * 240;
      this.ashSpeeds[i] = 0.8 + Math.random() * 2.2;
    }
    const ashGeo = new THREE.BufferGeometry();
    ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
    const ashMat = new THREE.PointsMaterial({
      color: 0xffb36b,
      map: textures.smokeSprite,
      size: 0.55,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ashPoints = new THREE.Points(ashGeo, ashMat);
    this.ashPoints.frustumCulled = false;
    this.scene.add(this.ashPoints);
  }

  setWorld(world: BattlefieldWorld): void {
    this.world = world;
  }

  private spawnPoolParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    scale: number,
    life: number,
    gravity: number,
    colorHex: number
  ): void {
    const p = this.particlePool[this.poolCursor];
    this.poolCursor = (this.poolCursor + 1) % MAX_POOL_PARTICLES;

    p.active = true;
    p.pos.set(x, y, z);
    p.vel.set(vx, vy, vz);
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.scale = scale;
    p.life = life;
    p.maxLife = life;
    p.gravity = gravity;
    p.color.setHex(colorHex);
    this.particleInstanced.setColorAt(
      (this.poolCursor + MAX_POOL_PARTICLES - 1) % MAX_POOL_PARTICLES,
      p.color
    );
    if (this.particleInstanced.instanceColor) {
      this.particleInstanced.instanceColor.needsUpdate = true;
    }
  }

  createExplosion(position: THREE.Vector3, colorHex = 0xff5500, count = 34): void {
    this.sound.playExplosion(count / 36);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb26b,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, position.y + 0.35, position.z);
    this.scene.add(ring);
    this.shockwaves.push({ mesh: ring, life: 0.46, maxLife: 0.46, speed: 42 });

    const burstCount = Math.min(count, 44);
    for (let i = 0; i < burstCount; i++) {
      const isSmoke = i % 3 === 0;
      const isEmber = i % 5 === 0;
      const col = isSmoke ? 0x22201e : isEmber ? 0xffcc55 : colorHex;
      this.spawnPoolParticle(
        position.x,
        position.y,
        position.z,
        (Math.random() - 0.5) * 28,
        Math.random() * 22 + 4,
        (Math.random() - 0.5) * 28,
        isSmoke ? 2.8 : 1.15,
        0.65 + Math.random() * 0.65,
        isSmoke ? -1.5 : 18,
        col
      );
    }

    this.onExplosion?.(position, count);
  }

  createImpact(position: THREE.Vector3, colorHex = 0xffaa55, count = 6): void {
    for (let i = 0; i < count; i++) {
      this.spawnPoolParticle(
        position.x,
        position.y,
        position.z,
        (Math.random() - 0.5) * 10,
        Math.random() * 6 + 1.5,
        (Math.random() - 0.5) * 10,
        0.55,
        0.24 + Math.random() * 0.2,
        15,
        colorHex
      );
    }
  }

  private createMuzzleFlash(position: THREE.Vector3): void {
    const flash = new THREE.Mesh(this.flashGeo, this.flashMat);
    flash.position.copy(position);
    this.scene.add(flash);
    this.flashMeshes.push({ mesh: flash, life: 0.06 });
  }

  spawnProjectile(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    isEnemy = false,
    owner: { ally?: { name: string }; enemy?: { id: number } } | null = null
  ): void {
    this.sound.playShoot(isEnemy, Boolean(owner?.ally));
    const mat = isEnemy
      ? this.enemyTracerMat
      : owner?.ally
      ? this.allyTracerMat
      : this.playerTracerMat;

    const mesh = new THREE.Mesh(this.tracerGeo, mat);
    mesh.position.copy(origin);
    _dirVec.copy(direction).normalize();
    mesh.quaternion.setFromUnitVectors(_upVec, _dirVec);
    this.scene.add(mesh);

    const speed = isEnemy ? 76 : owner?.ally ? 115 : 148;
    this.createMuzzleFlash(origin);

    this.projectiles.push({
      mesh,
      prevPos: origin.clone(),
      vel: _dirVec.clone().multiplyScalar(speed),
      isEnemy,
      owner,
      gravity: GRAVITY_MPS2,
      life: 2.1,
      nearMissTriggered: false,
    });
  }

  spawnRocket(origin: THREE.Vector3, direction: THREE.Vector3): void {
    this.sound.playRocketLaunch();
    const mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
    mesh.position.copy(origin);
    _dirVec.copy(direction).normalize();
    mesh.quaternion.setFromUnitVectors(_upVec, _dirVec);
    this.scene.add(mesh);
    this.createMuzzleFlash(origin);

    this.projectiles.push({
      mesh,
      prevPos: origin.clone(),
      vel: _dirVec.clone().multiplyScalar(86),
      isEnemy: false,
      isRocket: true,
      owner: null,
      gravity: 3.4,
      life: 3.2,
      nearMissTriggered: false,
    });
  }

  spawnGrenade(
    origin: THREE.Vector3,
    velocity: THREE.Vector3,
    kind: 'smoke' | 'frag'
  ): void {
    if (this.grenades.length >= 12) return;
    this.sound.playGrenadeThrow();
    const mesh = new THREE.Mesh(
      this.grenadeGeo,
      kind === 'frag' ? this.fragGrenadeMat : this.smokeGrenadeMat
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);

    this.grenades.push({
      mesh,
      pos: origin.clone(),
      vel: velocity.clone(),
      kind,
      fuseTimer: kind === 'frag' ? 2.1 : 5.5,
      smokeTimer: 0,
    });
  }

  update(
    dt: number,
    playerPos?: THREE.Vector3,
    playerActive = false
  ): void {
    // 1. Update pooled instanced particles
    let anyParticleUpdated = false;
    for (let i = 0; i < MAX_POOL_PARTICLES; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;
      anyParticleUpdated = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _dummy.position.set(0, -500, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.particleInstanced.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += dt * 5;
      p.rot.z += dt * 4;

      const t = Math.max(0, p.life / p.maxLife);
      _dummy.position.copy(p.pos);
      _dummy.rotation.copy(p.rot);
      _dummy.scale.setScalar(p.scale * (0.35 + 0.65 * t));
      _dummy.updateMatrix();
      this.particleInstanced.setMatrixAt(i, _dummy.matrix);
    }
    if (anyParticleUpdated) {
      this.particleInstanced.instanceMatrix.needsUpdate = true;
    }

    // 2. Explosion lights & muzzle flashes
    for (let i = this.explosionLights.length - 1; i >= 0; i--) {
      const e = this.explosionLights[i];
      e.life -= dt;
      e.light.intensity = Math.max(0, (e.life / 0.34) * 8.5);
      if (e.life <= 0) {
        this.scene.remove(e.light);
        this.explosionLights.splice(i, 1);
      }
    }

    for (let i = this.flashMeshes.length - 1; i >= 0; i--) {
      const f = this.flashMeshes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        this.flashMeshes.splice(i, 1);
      }
    }

    // 3. Ambient smoke & embers
    const now = performance.now() * 0.0003;
    const smokeAttr = this.smokePoints.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < smokeAttr.count; i++) {
      let y = smokeAttr.getY(i) + this.smokeSpeeds[i] * dt;
      let x = smokeAttr.getX(i) + Math.sin(now + i) * dt * 0.7;
      if (y > 28) {
        y = 0.5;
        x = this.smokeOrigins[i * 2] + (Math.random() - 0.5) * 8;
        smokeAttr.setZ(i, this.smokeOrigins[i * 2 + 1] + (Math.random() - 0.5) * 8);
      }
      smokeAttr.setY(i, y);
      smokeAttr.setX(i, x);
    }
    smokeAttr.needsUpdate = true;

    const ashAttr = this.ashPoints.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < ashAttr.count; i++) {
      let y = ashAttr.getY(i) - this.ashSpeeds[i] * dt;
      let x = ashAttr.getX(i) + Math.sin(now * 1.3 + i) * dt * 0.6;
      if (y < 0) {
        y = 54 + Math.random() * 8;
        x = (Math.random() - 0.5) * 240;
      }
      ashAttr.setY(i, y);
      ashAttr.setX(i, x);
    }
    ashAttr.needsUpdate = true;

    // 4. Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= dt;
      const t = 1 - s.life / s.maxLife;
      s.mesh.scale.setScalar(1 + t * s.speed);
      s.mesh.material.opacity = Math.max(0, 0.85 * (1 - t));
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.material.dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    // 5. Thrown grenades (frag & tactical smoke)
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuseTimer -= dt;
      g.vel.y -= GRAVITY_MPS2 * 1.35 * dt;
      g.pos.addScaledVector(g.vel, dt);

      const groundY = this.world ? this.world.getTerrainHeight(g.pos.x, g.pos.z) : 0;
      if (g.pos.y < groundY + 0.16) {
        g.pos.y = groundY + 0.16;
        g.vel.y = Math.abs(g.vel.y) * 0.36;
        g.vel.x *= 0.62;
        g.vel.z *= 0.62;
      }
      g.mesh.position.copy(g.pos);

      if (g.kind === 'smoke') {
        g.smokeTimer -= dt;
        if (g.smokeTimer <= 0 && g.fuseTimer < 4.9) {
          g.smokeTimer = 0.14;
          this.spawnPoolParticle(
            g.pos.x + (Math.random() - 0.5) * 0.8,
            g.pos.y + 0.3,
            g.pos.z + (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 1.4,
            1.4 + Math.random() * 1.4,
            (Math.random() - 0.5) * 1.4,
            3.2,
            1.6,
            -0.6,
            0x9ca3af
          );
        }
      } else {
        // Blink red fuse spark
        if (Math.random() < 0.35) {
          this.spawnPoolParticle(g.pos.x, g.pos.y + 0.15, g.pos.z, 0, 1.5, 0, 0.45, 0.16, 4, 0xff4422);
        }
      }

      if (g.fuseTimer <= 0) {
        if (g.kind === 'frag') {
          this.createExplosion(g.pos, 0xff5500, 26);
          this.onFragExplode?.(g.pos.clone());
        }
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
      }
    }

    // 6. Projectiles & Micro-Rockets with continuous ballistic collision
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.life -= dt;
      proj.prevPos.copy(proj.mesh.position);
      proj.vel.y -= proj.gravity * dt;
      proj.mesh.position.addScaledVector(proj.vel, dt);

      _dirVec.copy(proj.vel).normalize();
      proj.mesh.quaternion.setFromUnitVectors(_upVec, _dirVec);

      if (proj.isRocket) {
        this.spawnPoolParticle(
          proj.mesh.position.x,
          proj.mesh.position.y,
          proj.mesh.position.z,
          (Math.random() - 0.5) * 1.8,
          (Math.random() - 0.5) * 1.8,
          (Math.random() - 0.5) * 1.8,
          1.4,
          0.38,
          -0.8,
          0xd1d5db
        );
      }

      if (
        proj.isEnemy &&
        playerActive &&
        playerPos &&
        !proj.nearMissTriggered &&
        proj.mesh.position.distanceToSquared(playerPos) < 16
      ) {
        proj.nearMissTriggered = true;
        this.sound.playNearMiss();
      }

      let impacted = false;
      if (this.world) {
        const p0 = proj.prevPos;
        const p1 = proj.mesh.position;
        const segLen = p0.distanceTo(p1);
        const subSteps = Math.max(1, Math.ceil(segLen / 0.35));

        for (let s = 1; s <= subSteps; s++) {
          _sampleVec.lerpVectors(p0, p1, s / subSteps);
          if (_sampleVec.y < this.world.getTerrainHeight(_sampleVec.x, _sampleVec.z) + 0.06) {
            if (proj.isRocket) {
              this.onRocketImpact?.(_sampleVec.clone());
            } else {
              this.createImpact(_sampleVec, proj.isEnemy ? 0xff5a2a : 0xc9b07a, 4);
            }
            impacted = true;
            break;
          }
          if (this.world.checkStructureCollision(_sampleVec)) {
            if (proj.isRocket) {
              this.onRocketImpact?.(_sampleVec.clone());
            } else {
              this.createImpact(_sampleVec, 0xffbb66, 6);
            }
            impacted = true;
            break;
          }
        }
      }

      if (impacted || proj.life <= 0 || proj.mesh.position.y < -10) {
        this.scene.remove(proj.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  clearProjectiles(): void {
    this.projectiles.forEach((p) => this.scene.remove(p.mesh));
    this.projectiles = [];
    this.grenades.forEach((g) => this.scene.remove(g.mesh));
    this.grenades = [];
    this.shockwaves.forEach((s) => {
      this.scene.remove(s.mesh);
      s.mesh.material.dispose();
    });
    this.shockwaves = [];
  }
}
