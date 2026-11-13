import * as THREE from 'three';
import type { SoundManager } from './audio';
import type { EffectsManager } from './particles';
import { clamp, MAX_ROCKETS_PER_DRONE, type NormalizedControlInput } from './rules';
import type { FlightMode } from './types';
import type { BattlefieldWorld } from './world';

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

const _prevPos = new THREE.Vector3();

export interface DroneTelemetry {
  speedKmh: number;
  altitude: number;
  isBoosting: boolean;
  crashed: boolean;
  bumped: boolean;
  bumpDamage: number;
  pitchDeg: number;
  rollDeg: number;
  yawDeg: number;
  voltage: number;
  rocketsLeft: number;
  rocketCooldown: number;
}

export class PlayerDrone {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sound: SoundManager;

  public readonly maxHp = 100;
  public hp = 100;
  public battery = 100;
  public fireCooldown = 0;
  public rocketsLeft = MAX_ROCKETS_PER_DRONE;
  public rocketCooldown = 0;
  private bumpGraceTimer = 0;

  public position = new THREE.Vector3(0, 10, 94);
  public velocity = new THREE.Vector3(0, 0, 0);
  public yaw = 0;
  public pitch = -0.14;
  public visualRoll = 0;
  public visualPitch = 0;

  public flightMode: FlightMode = 'ESTABILIZADO';
  public opticsThermal = false;

  private currentFov = 92;
  private recoilOffset = 0;
  private mesh = new THREE.Group();
  private propellers: THREE.Mesh[] = [];
  private armedLed!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    soundManager: SoundManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.sound = soundManager;

    this.buildCompositeDroneFrame();
    this.scene.add(this.mesh);
  }

  private buildCompositeDroneFrame(): void {
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x16191b,
      roughness: 0.42,
      metalness: 0.65,
    });
    const warheadMat = new THREE.MeshStandardMaterial({
      color: 0x3b442d,
      roughness: 0.56,
      metalness: 0.28,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x4b5257,
      roughness: 0.3,
      metalness: 0.85,
    });
    const propMat = new THREE.MeshBasicMaterial({
      color: 0x9ca3af,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Lower carbon chassis plate & slim FPV roll-cage corner guards
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.025, 0.36),
      carbonMat
    );
    chassis.position.set(0, -0.36, -0.34);
    this.mesh.add(chassis);

    // Subtle olive-drab RPG/C4 charge nose peeking only at bottom center edge
    const warheadBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.048, 0.28, 10),
      warheadMat
    );
    warheadBody.rotation.x = Math.PI / 2;
    warheadBody.position.set(0, -0.35, -0.45);
    this.mesh.add(warheadBody);

    const warheadFuse = new THREE.Mesh(
      new THREE.ConeGeometry(0.032, 0.085, 10),
      steelMat
    );
    warheadFuse.rotation.x = -Math.PI / 2;
    warheadFuse.position.set(0, -0.35, -0.62);
    this.mesh.add(warheadFuse);

    this.armedLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3b1f })
    );
    this.armedLed.position.set(0, -0.315, -0.54);
    this.mesh.add(this.armedLed);

    // Front left & right carbon arms + compact motor bells + subtle corner rotor blur discs
    const armConfigs = [
      { x: -0.44, y: -0.34, z: -0.46, yaw: 0.52 },
      { x: 0.44, y: -0.34, z: -0.46, yaw: -0.52 },
    ];

    armConfigs.forEach((cfg) => {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.034, 0.016, 0.44),
        carbonMat
      );
      arm.position.set(cfg.x * 0.62, cfg.y, cfg.z * 0.65);
      arm.rotation.y = cfg.yaw;
      this.mesh.add(arm);

      const motor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.028, 0.032, 10),
        steelMat
      );
      motor.position.set(cfg.x, cfg.y + 0.016, cfg.z);
      this.mesh.add(motor);

      const propDisc = new THREE.Mesh(
        new THREE.CircleGeometry(0.16, 18),
        propMat
      );
      propDisc.rotation.x = -Math.PI / 2;
      propDisc.position.set(cfg.x, cfg.y + 0.034, cfg.z);
      this.mesh.add(propDisc);

      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.004, 0.018),
        carbonMat
      );
      blade.position.set(cfg.x, cfg.y + 0.036, cfg.z);
      this.mesh.add(blade);
      this.propellers.push(blade);
    });
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  reset(): void {
    this.hp = this.maxHp;
    this.battery = 100;
    this.position.set(0, 10, 94);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = -0.14;
    this.visualRoll = 0;
    this.visualPitch = 0;
    this.fireCooldown = 0;
    this.rocketsLeft = MAX_ROCKETS_PER_DRONE;
    this.rocketCooldown = 0;
    this.bumpGraceTimer = 0;
    this.recoilOffset = 0;
    this.currentFov = this.opticsThermal ? 48 : 92;
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
    this.mesh.visible = true;
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
  }

  update(
    dt: number,
    input: NormalizedControlInput,
    world: BattlefieldWorld,
    effectsManager: EffectsManager,
    time: number
  ): DroneTelemetry {
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.rocketCooldown > 0) this.rocketCooldown = Math.max(0, this.rocketCooldown - dt);
    if (this.bumpGraceTimer > 0) this.bumpGraceTimer -= dt;

    if (input.toggleModePressed) {
      this.flightMode =
        this.flightMode === 'ESTABILIZADO' ? 'ACRO' : 'ESTABILIZADO';
    }
    if (input.toggleOpticsPressed) {
      this.opticsThermal = !this.opticsThermal;
    }

    const isAcro = this.flightMode === 'ACRO';
    const lookSensitivity = this.opticsThermal ? 0.58 : isAcro ? 1.25 : 1.0;

    this.yaw += input.yaw * lookSensitivity;
    this.pitch = clamp(
      this.pitch + input.pitch * lookSensitivity,
      -1.28,
      1.18
    );

    const hasThrottle =
      input.forward !== 0 || input.strafe !== 0 || input.vertical !== 0;
    const isBoosting = input.boost && this.battery > 2 && hasThrottle;

    if (isBoosting) {
      this.battery = Math.max(0, this.battery - 13.5 * dt);
    } else {
      this.battery = Math.max(0, this.battery - 0.38 * dt);
    }
    if (this.battery < 20) {
      this.sound.playLowBatteryBeep();
    }

    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const baseAccel = isAcro ? 62 : 52;
    const boostMult = isAcro ? 1.95 : 1.75;
    const accel = baseAccel * (isBoosting ? boostMult : 1.0);

    this.velocity.addScaledVector(_forward, input.forward * accel * dt);
    this.velocity.addScaledVector(_right, input.strafe * accel * dt);

    // Realistic ground effect lift cushion within 2.5m of terrain
    const terrainY = world.getTerrainHeight(this.position.x, this.position.z);
    const agl = this.position.y - terrainY;
    const groundEffect = agl > 0 && agl < 2.6 ? (1 - agl / 2.6) * 2.2 : 0;
    const gravity = 2.15;

    this.velocity.y +=
      (input.vertical * accel * 0.86 - gravity + groundEffect) * dt;

    // Frame-rate independent aerodynamic drag
    const dragFactor = Math.exp(-(isAcro ? 1.95 : 2.35) * dt);
    this.velocity.multiplyScalar(dragFactor);

    _prevPos.copy(this.position);
    this.position.addScaledVector(this.velocity, dt);

    const mapLimit = 118;
    this.position.x = clamp(this.position.x, -mapLimit, mapLimit);
    this.position.z = clamp(this.position.z, -mapLimit, mapLimit);
    if (this.position.y > 68) {
      this.position.y = 68;
      this.velocity.y = Math.min(0, this.velocity.y);
    }

    const impactSpeed = this.velocity.length();
    const floorY = world.getTerrainHeight(this.position.x, this.position.z) + 0.55;
    let crashed = false;
    let bumped = false;
    let bumpDamage = 0;

    const hitFloor = this.position.y < floorY;
    // Tight 0.38m chassis radius lets the FPV fly cleanly through 3.8m doorways & 3.4m windows
    const hitWall = !hitFloor && world.checkStructureCollision(this.position, false, 0.38);

    if (hitFloor) {
      this.position.y = floorY;
      if (impactSpeed >= 18.5 || (this.velocity.y < -14 && input.vertical < -0.5)) {
        crashed = true;
      } else if (this.velocity.y < -2.2) {
        bumped = true;
        bumpDamage = Math.max(8, Math.round(impactSpeed * 1.1));
        this.velocity.y = Math.max(2.2, -this.velocity.y * 0.42);
        this.velocity.x *= 0.68;
        this.velocity.z *= 0.68;
      } else {
        this.velocity.y = Math.max(0, this.velocity.y);
      }
    } else if (hitWall) {
      if (impactSpeed >= 18.5) {
        crashed = true;
      } else {
        // Axis-separated slide against wall so flying near/inside a house never traps or explodes
        const tryX = { x: this.position.x, y: _prevPos.y, z: _prevPos.z };
        const tryZ = { x: _prevPos.x, y: _prevPos.y, z: this.position.z };
        const xBlocked = world.checkStructureCollision(tryX, false, 0.38);
        const zBlocked = world.checkStructureCollision(tryZ, false, 0.38);

        if (xBlocked) {
          this.position.x = _prevPos.x;
          this.velocity.x = -this.velocity.x * 0.38;
        }
        if (zBlocked) {
          this.position.z = _prevPos.z;
          this.velocity.z = -this.velocity.z * 0.38;
        }
        if (!xBlocked && !zBlocked) {
          this.position.y = _prevPos.y;
          this.velocity.y = -this.velocity.y * 0.35;
        } else if (world.checkStructureCollision(this.position, false, 0.38)) {
          this.position.y = _prevPos.y;
          if (world.checkStructureCollision(this.position, false, 0.38)) {
            this.position.copy(_prevPos);
          }
          this.velocity.y = -this.velocity.y * 0.32;
        }
        bumped = true;
        bumpDamage =
          impactSpeed < 2.5
            ? 0
            : Math.max(4, Math.round((impactSpeed - 2.0) * 1.45));
      }
    }

    if (bumped && bumpDamage > 0 && this.bumpGraceTimer <= 0) {
      this.bumpGraceTimer = 0.45;
      this.takeDamage(bumpDamage);
      this.sound.playWallBump(clamp(impactSpeed / 16, 0.3, 1));
      effectsManager.createImpact(this.position, 0xffcc66, 6);
      if (this.hp <= 0) {
        crashed = true;
      }
    } else if (bumped) {
      bumpDamage = 0;
    }

    // Smooth banking and aerodynamic pitch tilt
    const maxRoll = isAcro ? 0.28 : 0.18;
    const maxTilt = isAcro ? 0.2 : 0.13;
    const targetRoll = -input.strafe * maxRoll - input.yaw * 0.65;
    const targetPitchTilt = -input.forward * maxTilt;
    const tiltDamp = 1 - Math.exp(-9 * dt);
    this.visualRoll += (targetRoll - this.visualRoll) * tiltDamp;
    this.visualPitch += (targetPitchTilt - this.visualPitch) * tiltDamp;

    // Weapon firing & Micro-Rocket HE launch with camera recoil kick
    if (input.fire && this.fireCooldown <= 0) {
      this.fireCooldown = 0.24;
      this.recoilOffset = 0.025;
      _aimDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      _muzzlePos.copy(this.position).addScaledVector(_aimDir, 1.25);
      effectsManager.spawnProjectile(_muzzlePos, _aimDir, false);
    }
    if (input.rocketPressed && this.rocketsLeft > 0 && this.rocketCooldown <= 0) {
      this.rocketsLeft--;
      this.rocketCooldown = 2.0;
      this.recoilOffset = 0.055;
      _aimDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      _muzzlePos.copy(this.position).addScaledVector(_aimDir, 1.45);
      effectsManager.spawnRocket(_muzzlePos, _aimDir);
    }
    this.recoilOffset *= Math.exp(-18 * dt);

    // Dynamic FPV FOV kick with airspeed & zoom optics
    const speed = this.velocity.length();
    const targetFov = this.opticsThermal
      ? 48
      : 92 + clamp(speed / 36, 0, 1) * 14 + (isBoosting ? 4 : 0);
    this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-10 * dt));
    if (Math.abs(this.camera.fov - this.currentFov) > 0.08) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // Subtle high-frequency rotor vibration
    const vib = Math.sin(time * 58) * (0.004 + (isBoosting ? 0.005 : 0));
    _euler.set(
      this.pitch + this.visualPitch + this.recoilOffset + vib,
      this.yaw,
      this.visualRoll,
      'YXZ'
    );
    this.camera.position.copy(this.position);
    this.camera.quaternion.setFromEuler(_euler);

    this.mesh.position.copy(this.position);
    this.mesh.quaternion.copy(this.camera.quaternion);

    // Blink armed warhead LED
    this.armedLed.material.color.setHex(
      Math.sin(time * 10) > 0 ? 0xff3b1f : 0x550c05
    );

    const propSpeed = (38 + speed * 2.2 + (isBoosting ? 28 : 0)) * dt;
    this.propellers.forEach((p, idx) => {
      p.rotation.y += idx % 2 === 0 ? propSpeed : -propSpeed;
    });

    const speedRatio = clamp(speed / 34, 0, 1);
    const maneuverLoad = clamp(
      Math.abs(input.strafe) + Math.abs(input.yaw * 10),
      0,
      1
    );
    this.sound.updateEngine(speedRatio, isBoosting, false, maneuverLoad);

    const voltage = 18.6 + (this.battery / 100) * 6.6; // 6S LiPo realistic voltage (25.2V -> 18.6V)

    return {
      speedKmh: Math.round(speed * 3.6),
      altitude: Math.max(0, Number((this.position.y - floorY + 0.55).toFixed(1))),
      isBoosting,
      crashed,
      bumped,
      bumpDamage,
      pitchDeg: Math.round(THREE.MathUtils.radToDeg(this.pitch)),
      rollDeg: Math.round(THREE.MathUtils.radToDeg(this.visualRoll)),
      yawDeg: ((Math.round(THREE.MathUtils.radToDeg(-this.yaw)) % 360) + 360) % 360,
      voltage: Number(voltage.toFixed(1)),
      rocketsLeft: this.rocketsLeft,
      rocketCooldown: Number(this.rocketCooldown.toFixed(1)),
    };
  }
}
