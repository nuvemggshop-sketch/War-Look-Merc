import * as THREE from 'three';
import type { EffectsManager } from './particles';
import type { ProceduralTextureSet } from './textures';

export interface TacticalTarget {
  id: number;
  name: string;
  mesh: THREE.Group;
  beacon: THREE.Mesh;
  radarPart?: THREE.Object3D;
  position: THREE.Vector3;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  radius: number;
}

export class TargetManager {
  private scene: THREE.Scene;
  private getTerrainHeight: (x: number, z: number) => number;
  private textures: ProceduralTextureSet;

  public targets: TacticalTarget[] = [];
  public readonly totalTargets = 6;

  public extractionPos = new THREE.Vector3(0, 0, -98);
  public extractionActive = false;
  public readonly extractionRadius = 6.8;

  private extractionGroup!: THREE.Group;
  private extractionBaseMat!: THREE.MeshBasicMaterial;
  private extractionBeamMat!: THREE.MeshBasicMaterial;
  private extractionRing!: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    getTerrainHeight: (x: number, z: number) => number,
    textures: ProceduralTextureSet
  ) {
    this.scene = scene;
    this.getTerrainHeight = getTerrainHeight;
    this.textures = textures;

    this.buildExtractionZone();
  }

  private buildExtractionZone(): void {
    const group = new THREE.Group();
    const y = this.getTerrainHeight(this.extractionPos.x, this.extractionPos.z);
    this.extractionPos.y = y;

    const baseGeo = new THREE.RingGeometry(3.5, 5.8, 32);
    this.extractionBaseMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
    });
    const baseMesh = new THREE.Mesh(baseGeo, this.extractionBaseMat);
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.y = 0.28;
    group.add(baseMesh);

    const innerGeo = new THREE.RingGeometry(1.8, 2.5, 6);
    const innerRing = new THREE.Mesh(innerGeo, this.extractionBaseMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.32;
    group.add(innerRing);
    this.extractionRing = innerRing;

    const beamGeo = new THREE.CylinderGeometry(4.4, 4.4, 58, 24, 1, true);
    this.extractionBeamMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beamMesh = new THREE.Mesh(beamGeo, this.extractionBeamMat);
    beamMesh.position.y = 29;
    group.add(beamMesh);

    // 4 landing pad pylons
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x262d29,
      roughness: 0.6,
      metalness: 0.5,
    });
    const capMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
    [
      [-4.6, -4.6],
      [4.6, -4.6],
      [-4.6, 4.6],
      [4.6, 4.6],
    ].forEach(([px, pz]) => {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.3, 0.35), pylonMat);
      pylon.position.set(px, 0.65, pz);
      group.add(pylon);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.42), capMat);
      cap.position.set(px, 1.35, pz);
      group.add(cap);
    });

    group.position.copy(this.extractionPos);
    this.scene.add(group);
    this.extractionGroup = group;
  }

  spawnTargets(mapId: 'trinchera' | 'desierto' | 'ciudad' = 'trinchera'): void {
    this.targets.forEach((t) => this.scene.remove(t.mesh));
    this.targets = [];

    const exY = this.getTerrainHeight(this.extractionPos.x, this.extractionPos.z);
    this.extractionPos.y = exY;
    this.extractionGroup.position.copy(this.extractionPos);

    const locations =
      mapId === 'desierto'
        ? ([
            { x: -62, z: -58, type: 'RADAR DE CAÑÓN', kind: 'relay' },
            { x: 64, z: -52, type: 'CONVOY DE COMBUSTIBLE', kind: 'generator' },
            { x: -50, z: 24, type: 'BATERÍA ANTIAÉREA', kind: 'tank' },
            { x: 56, z: 28, type: 'POLVORÍN DEL DESIERTO', kind: 'bunker' },
            { x: -16, z: -64, type: 'ARTILLERÍA AUTOPROPULSADA', kind: 'mortar' },
            { x: 22, z: -16, type: 'CENTRO DE COMUNICACIONES', kind: 'command' },
          ] as const)
        : mapId === 'ciudad'
        ? ([
            { x: -56, z: -56, type: 'ANTENA DE GUERRA ELECTRÓNICA', kind: 'relay' },
            { x: 58, z: -54, type: 'BLINDADO URBANO', kind: 'tank' },
            { x: -56, z: 28, type: 'SUBESTACIÓN ELÉCTRICA', kind: 'generator' },
            { x: 56, z: 32, type: 'DEPÓSITO DE DRONES HOSTIL', kind: 'bunker' },
            { x: -12, z: -48, type: 'MORTERO DE AVENIDA', kind: 'mortar' },
            { x: 18, z: -18, type: 'CENTRO LOGÍSTICO ENEMIGO', kind: 'command' },
          ] as const)
        : ([
            { x: -65, z: -55, type: 'PUESTO DE MANDO MERCENARIO', kind: 'command' },
            { x: 68, z: -48, type: 'BLINDADO DE ASALTO', kind: 'tank' },
            { x: -52, z: 22, type: 'BÚNKER DE MUNICIÓN', kind: 'bunker' },
            { x: 58, z: 30, type: 'REPETIDOR TÁCTICO', kind: 'relay' },
            { x: -18, z: -68, type: 'MORTERO PESADO', kind: 'mortar' },
            { x: 24, z: -25, type: 'GENERADOR DE CAMPAÑA', kind: 'generator' },
          ] as const);

    const armorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.metalMap,
      roughness: 0.45,
      metalness: 0.65,
    });
    const oliveMat = new THREE.MeshStandardMaterial({
      color: 0x3b4032,
      roughness: 0.78,
      metalness: 0.15,
    });
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.concreteMap,
      bumpMap: this.textures.concreteBump,
      bumpScale: 0.12,
      roughness: 0.88,
      metalness: 0.06,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x8f2419,
      roughness: 0.5,
      metalness: 0.3,
    });
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.sandbagMap,
      roughness: 0.92,
      metalness: 0.02,
    });
    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.textures.contactShadow,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });

    locations.forEach((loc, index) => {
      const group = new THREE.Group();
      const groundY = this.getTerrainHeight(loc.x, loc.z);

      // Soft contact shadow disc
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(5.6, 20), shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.06;
      group.add(shadow);

      let radarPart: THREE.Object3D | undefined;

      if (loc.kind === 'tank') {
        const hull = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.5, 7.2), oliveMat);
        hull.position.y = 1.0;
        hull.castShadow = true;
        group.add(hull);

        const leftTrack = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.15, 7.5), armorMat);
        leftTrack.position.set(-2.2, 0.58, 0);
        group.add(leftTrack);

        const rightTrack = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.15, 7.5), armorMat);
        rightTrack.position.set(2.2, 0.58, 0);
        group.add(rightTrack);

        const turret = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.15, 3.4), accentMat);
        turret.position.set(0, 2.25, -0.3);
        turret.castShadow = true;
        group.add(turret);

        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.17, 4.6, 10),
          armorMat
        );
        barrel.rotation.x = Math.PI / 2 - 0.06;
        barrel.position.set(0, 2.35, 3.1);
        group.add(barrel);
        radarPart = turret;
      } else if (loc.kind === 'command') {
        const container = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.8, 7.6), oliveMat);
        container.position.y = 1.4;
        container.castShadow = true;
        group.add(container);

        const skirt = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.1, 8.8), sandMat);
        skirt.position.y = 0.55;
        group.add(skirt);

        const roofUnit = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.7, 3.2), accentMat);
        roofUnit.position.set(0, 3.1, -0.8);
        group.add(roofUnit);

        const dish = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.7, 12), armorMat);
        dish.rotation.x = Math.PI / 3;
        dish.position.set(1.2, 3.8, 1.2);
        group.add(dish);
        radarPart = dish;
      } else if (loc.kind === 'bunker') {
        const base = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.6, 6.2), concreteMat);
        base.position.y = 1.3;
        base.castShadow = true;
        group.add(base);

        const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.9, 1.2, 8), concreteMat);
        roof.position.y = 3.0;
        group.add(roof);

        const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 0.4), accentMat);
        door.position.set(0, 1.0, 3.15);
        group.add(door);
      } else if (loc.kind === 'relay') {
        const skid = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.2, 4.4), armorMat);
        skid.position.y = 0.6;
        group.add(skid);

        const mast = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.4, 1.1), armorMat);
        mast.position.y = 3.6;
        mast.castShadow = true;
        group.add(mast);

        const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.4, 0.6, 12), accentMat);
        dish.rotation.z = Math.PI / 2;
        dish.position.set(0.8, 4.9, 0);
        group.add(dish);
        radarPart = mast;
      } else if (loc.kind === 'mortar') {
        const pit = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.1, 1.2, 12), sandMat);
        pit.position.y = 0.6;
        group.add(pit);

        const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.35, 10), armorMat);
        plate.position.y = 0.35;
        group.add(plate);

        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 3.8, 12), accentMat);
        tube.rotation.x = 0.48;
        tube.position.set(0, 2.0, 0.4);
        tube.castShadow = true;
        group.add(tube);
      } else {
        const base = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.1, 6.4), armorMat);
        base.position.y = 1.05;
        base.castShadow = true;
        group.add(base);

        [-1.3, 1.3].forEach((tx) => {
          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(0.72, 0.72, 4.8, 12),
            accentMat
          );
          tank.rotation.x = Math.PI / 2;
          tank.position.set(tx, 2.5, 0);
          group.add(tank);
        });

        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 10), oliveMat);
        stack.position.set(0, 3.2, -1.6);
        group.add(stack);
      }

      const beaconGeo = new THREE.OctahedronGeometry(0.85, 0);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.y = 6.6;
      group.add(beacon);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.75, 10, 8),
        new THREE.MeshBasicMaterial({
          color: 0xff3b1f,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.position.y = 6.6;
      group.add(halo);

      group.position.set(loc.x, groundY, loc.z);
      group.rotation.y = (index * 1.1) % (Math.PI * 2);
      this.scene.add(group);

      this.targets.push({
        id: index,
        name: loc.type,
        mesh: group,
        beacon,
        radarPart,
        position: new THREE.Vector3(loc.x, groundY + 2.0, loc.z),
        hp: 60,
        maxHp: 60,
        destroyed: false,
        radius: 4.9,
      });
    });

    this.setExtractionActive(false);
  }

  setExtractionActive(active: boolean): void {
    this.extractionActive = active;
    this.extractionBaseMat.opacity = active ? 0.88 : 0.16;
    this.extractionBeamMat.opacity = active ? 0.28 : 0.04;
    this.extractionGroup.visible = true;
  }

  damageTarget(
    target: TacticalTarget,
    amount: number,
    effectsManager: EffectsManager
  ): boolean {
    if (target.destroyed) return false;
    target.hp -= amount;
    if (target.hp <= 0) {
      target.destroyed = true;
      effectsManager.createExplosion(target.position, 0xff4400, 44);
      this.scene.remove(target.mesh);
      return true;
    }
    return false;
  }

  update(dt: number, time: number): void {
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (!t.destroyed) {
        t.beacon.rotation.y += dt * 2.6;
        t.beacon.position.y = 6.6 + Math.sin(time * 4 + t.id) * 0.35;
        if (t.radarPart) {
          t.radarPart.rotation.y += dt * 0.8;
        }
      }
    }

    if (this.extractionActive) {
      this.extractionBeamMat.opacity = 0.22 + Math.sin(time * 5) * 0.08;
      this.extractionRing.rotation.z += dt * 1.4;
    }
  }

  getDestroyedCount(): number {
    let count = 0;
    for (let i = 0; i < this.targets.length; i++) {
      if (this.targets[i].destroyed) count++;
    }
    return count;
  }
}
