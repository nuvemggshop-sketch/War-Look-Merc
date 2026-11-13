import * as THREE from 'three';
import type { AllySoldier } from './allies';
import { clamp } from './rules';
import type { ProceduralTextureSet } from './textures';

interface SoldierSlot {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  label: THREE.Sprite;
  labelData: {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: THREE.CanvasTexture;
  };
}

const _trenchEuler = new THREE.Euler(0, 0, 0, 'YXZ');

export class TrenchViewManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTextureSet;

  public active = false;
  private trenchPosition = new THREE.Vector3(0, 3.5, 98);
  private group = new THREE.Group();
  private soldierSlots: SoldierSlot[] = [];
  private spareDroneMesh!: THREE.Group;
  private trenchYaw = 0;
  private trenchPitch = -0.1;
  private swayTime = 0;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    textures: ProceduralTextureSet
  ) {
    this.scene = scene;
    this.camera = camera;
    this.textures = textures;

    this.buildTrenchInterior();
  }

  private buildTrenchInterior(): void {
    const matBag = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.sandbagMap,
      bumpMap: this.textures.sandbagBump,
      bumpScale: 0.14,
      roughness: 0.92,
    });
    const matHelmet = new THREE.MeshStandardMaterial({
      color: 0x46523f,
      roughness: 0.55,
    });
    const crateMat = new THREE.MeshStandardMaterial({
      color: 0x3b2c1c,
      roughness: 0.9,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.metalMap,
      roughness: 0.45,
      metalness: 0.65,
    });

    // Front sandbag parapet
    for (let i = -4; i <= 4; i++) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.15, 1.2), matBag);
      bag.position.set(i * 2.1, 0.48, -4.1);
      this.group.add(bag);
    }

    // Timber dugout side posts
    [-4.8, 4.8].forEach((px) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.2, 0.35), crateMat);
      beam.position.set(px, 1.6, -3.7);
      this.group.add(beam);
    });

    // Squadmates positioned on flanking firing steps so center view over parapet stays clear
    const slotPositions = [
      { x: -3.2, z: -2.9, yaw: 0.22 },
      { x: -1.65, z: -3.15, yaw: 0.1 },
      { x: 1.65, z: -3.15, yaw: -0.1 },
      { x: 3.2, z: -2.9, yaw: -0.22 },
    ];
    const rigMat = new THREE.MeshStandardMaterial({ color: 0x262d24, roughness: 0.85 });
    const rifleMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c1e,
      roughness: 0.4,
      metalness: 0.75,
    });

    slotPositions.forEach((pos) => {
      const soldier = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x3b4b36,
        roughness: 0.82,
      });

      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.28), bodyMat);
      torso.position.y = 0.68;
      soldier.add(torso);

      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.32), rigMat);
      vest.position.y = 0.72;
      soldier.add(vest);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xa88267, roughness: 0.85 })
      );
      head.position.y = 1.14;
      soldier.add(head);

      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.165, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
        matHelmet
      );
      helmet.position.y = 1.17;
      soldier.add(helmet);

      const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.72), rifleMat);
      rifle.position.set(0.18, 0.82, -0.32);
      soldier.add(rifle);

      const { sprite, data } = this.makeNameSprite('');
      sprite.position.set(0, 1.52, 0);
      soldier.add(sprite);

      soldier.position.set(pos.x, 0, pos.z);
      soldier.rotation.y = pos.yaw;
      this.group.add(soldier);
      this.soldierSlots.push({
        group: soldier,
        bodyMat,
        label: sprite,
        labelData: data,
      });
    });

    // Warm dugout lantern mounted on far right timber post
    const lantern = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.3, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xffb066 })
    );
    lantern.position.set(4.55, 1.55, -3.5);
    this.group.add(lantern);

    const lanternHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff9a44,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    lanternHalo.position.copy(lantern.position);
    this.group.add(lanternHalo);

    // Center launch crate & flank ammo crates
    [0, -3.8, 3.8].forEach((xOff, idx) => {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(idx === 0 ? 1.25 : 1.0, idx === 0 ? 0.86 : 0.65, 0.8),
        crateMat
      );
      crate.position.set(xOff, idx === 0 ? 0.43 : 0.32, idx === 0 ? -3.15 : -3.45);
      this.group.add(crate);
    });

    // Ready-to-launch 4-rotor spare FPV drone resting on center launch crate
    this.spareDroneMesh = new THREE.Group();
    const droneCore = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.06, 0.32),
      metalMat
    );
    this.spareDroneMesh.add(droneCore);
    const warhead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.06, 0.28, 10),
      new THREE.MeshStandardMaterial({ color: 0x3b442d, roughness: 0.5 })
    );
    warhead.rotation.x = Math.PI / 2;
    warhead.position.set(0, 0.055, -0.06);
    this.spareDroneMesh.add(warhead);

    [
      [-0.24, -0.2],
      [0.24, -0.2],
      [-0.24, 0.2],
      [0.24, 0.2],
    ].forEach(([ax, az]) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.34), metalMat);
      arm.position.set(ax * 0.55, 0.01, az * 0.55);
      arm.rotation.y = Math.atan2(ax, az);
      this.spareDroneMesh.add(arm);

      const prop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.01, 12),
        new THREE.MeshBasicMaterial({
          color: 0x9ca3af,
          transparent: true,
          opacity: 0.32,
        })
      );
      prop.position.set(ax, 0.04, az);
      this.spareDroneMesh.add(prop);
    });

    this.spareDroneMesh.position.set(0, 0.9, -3.15);
    this.group.add(this.spareDroneMesh);

    this.group.position.copy(this.trenchPosition);
    this.group.visible = false;
    this.scene.add(this.group);
  }

  private makeNameSprite(text: string): {
    sprite: THREE.Sprite;
    data: SoldierSlot['labelData'];
  } {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.22, 0.3, 1);
    sprite.renderOrder = 10;
    const data = { canvas, ctx, texture };
    this.drawNameSprite(data, text, true);
    return { sprite, data };
  }

  private drawNameSprite(
    data: SoldierSlot['labelData'],
    text: string,
    alive: boolean
  ): void {
    const { canvas, ctx, texture } = data;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (text) {
      ctx.font = 'bold 24px "Share Tech Mono", "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(16, 10, 224, 44);
      ctx.strokeStyle = alive
        ? 'rgba(0, 255, 102, 0.85)'
        : 'rgba(255, 60, 60, 0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 10, 224, 44);
      ctx.fillStyle = alive ? '#9dffbe' : '#ff9a9a';
      ctx.fillText(alive ? text : `${text} · KIA`, 128, 33);
    }
    texture.needsUpdate = true;
  }

  show(allies: readonly AllySoldier[] = []): void {
    this.active = true;
    this.swayTime = 0;
    this.trenchYaw = 0;
    this.trenchPitch = -0.08;

    this.camera.fov = 78;
    this.camera.updateProjectionMatrix();
    this.camera.position
      .copy(this.trenchPosition)
      .add(new THREE.Vector3(0, 1.2, 0));
    this.applyCameraRotation();

    this.soldierSlots.forEach((slot, idx) => {
      const ally = allies[idx];
      const alive = ally ? ally.alive : false;
      slot.group.visible = alive;
      slot.bodyMat.color.setHex(alive ? 0x3a4a35 : 0x2a1c1a);
      this.drawNameSprite(
        slot.labelData,
        ally ? ally.name : 'SIN ASIGNAR',
        alive
      );
    });

    this.group.visible = true;
  }

  lookDelta(dx: number, dy: number): void {
    if (!this.active) return;
    this.trenchYaw = clamp(this.trenchYaw - dx * 0.0022, -1.15, 1.15);
    this.trenchPitch = clamp(this.trenchPitch - dy * 0.0022, -0.55, 0.35);
    this.applyCameraRotation();
  }

  private applyCameraRotation(): void {
    _trenchEuler.set(this.trenchPitch, this.trenchYaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(_trenchEuler);
  }

  update(dt: number, stickYaw = 0, stickPitch = 0): void {
    if (!this.active) return;
    this.swayTime += dt;

    if (Math.abs(stickYaw) > 0.001 || Math.abs(stickPitch) > 0.001) {
      this.trenchYaw = clamp(this.trenchYaw + stickYaw, -1.15, 1.15);
      this.trenchPitch = clamp(this.trenchPitch + stickPitch, -0.55, 0.35);
      this.applyCameraRotation();
    }

    for (let i = 0; i < this.soldierSlots.length; i++) {
      const slot = this.soldierSlots[i];
      slot.group.position.y = Math.sin(this.swayTime * 2.1 + i * 1.3) * 0.018;
      slot.group.rotation.z = Math.sin(this.swayTime * 1.4 + i) * 0.008;
    }

    this.spareDroneMesh.rotation.y = Math.sin(this.swayTime * 0.8) * 0.1;
  }

  hide(): void {
    this.active = false;
    this.group.visible = false;
  }
}
