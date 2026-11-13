import * as THREE from 'three';
import {
  BATTLEFIELD_MAPS,
  clamp,
  getTerrainHeightAt,
  getTrenchCenterZ,
  hasClearLineOfSight,
  pointHitsStructure,
  TERRAIN_SEGMENTS,
  TERRAIN_SIZE,
  type StructureBox,
  type Vec3,
} from './rules';
import type { ProceduralTextureSet } from './textures';
import type { MapId } from './types';

interface SearchlightEntry {
  target: THREE.Object3D;
  cone: THREE.Mesh;
  phase: number;
  baseX: number;
}

export interface ExplosiveBarrel {
  id: number;
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  exploded: boolean;
}

export class BattlefieldWorld {
  private scene: THREE.Scene;
  private textures: ProceduralTextureSet;
  private worldGroup = new THREE.Group();
  private structures: StructureBox[] = [];
  private sightStructures: StructureBox[] = [];
  private searchlights: SearchlightEntry[] = [];
  private artilleryFlashes: Array<{
    mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    timer: number;
  }> = [];
  private terrainGridHeights: Float32Array | null = null;

  private disposableTextures: THREE.Texture[] = [];

  public currentMapId: MapId = 'trinchera';
  public explosiveBarrels: ExplosiveBarrel[] = [];
  public onArtilleryBoom: (() => void) | null = null;

  private readonly sampleVec: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(scene: THREE.Scene, textures: ProceduralTextureSet) {
    this.scene = scene;
    this.textures = textures;
    this.scene.add(this.worldGroup);
  }

  /**
   * Exact barycentric height matching the rendered Three.js terrain triangles
   * so allies, enemies, props, and structures never sink below or float above ground.
   */
  getTerrainHeight(x: number, z: number): number {
    if (!this.terrainGridHeights) {
      return getTerrainHeightAt(x, z, this.currentMapId);
    }

    const half = TERRAIN_SIZE * 0.5;
    const cols = TERRAIN_SEGMENTS + 1;
    const step = TERRAIN_SIZE / TERRAIN_SEGMENTS;
    const gx = clamp((x + half) / step, 0, TERRAIN_SEGMENTS - 0.0001);
    const gz = clamp((z + half) / step, 0, TERRAIN_SEGMENTS - 0.0001);

    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;

    const h00 = this.terrainGridHeights[iz * cols + ix];
    const h10 = this.terrainGridHeights[iz * cols + ix + 1];
    const h01 = this.terrainGridHeights[(iz + 1) * cols + ix];
    const h11 = this.terrainGridHeights[(iz + 1) * cols + ix + 1];

    if (fx + fz <= 1) {
      return h00 + fx * (h10 - h00) + fz * (h01 - h00);
    }
    return h11 + (1 - fx) * (h01 - h11) + (1 - fz) * (h10 - h11);
  }

  setMap(mapId: MapId): void {
    this.currentMapId = mapId;
    this.clearWorld();
    this.build();
  }

  private clearWorld(): void {
    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();

    this.worldGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && !disposedGeos.has(mesh.geometry)) {
        disposedGeos.add(mesh.geometry);
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (let i = 0; i < mats.length; i++) {
          if (!disposedMats.has(mats[i])) {
            disposedMats.add(mats[i]);
            mats[i].dispose();
          }
        }
      }
    });

    for (let i = 0; i < this.disposableTextures.length; i++) {
      this.disposableTextures[i].dispose();
    }
    this.disposableTextures = [];

    while (this.worldGroup.children.length > 0) {
      this.worldGroup.remove(this.worldGroup.children[0]);
    }
    this.structures = [];
    this.sightStructures = [];
    this.searchlights = [];
    this.artilleryFlashes = [];
    this.explosiveBarrels = [];
    this.terrainGridHeights = null;
  }

  build(): void {
    this.applySceneAtmosphere();
    this.buildSky();
    this.buildTerrainMesh();
    this.buildTrenchParapets();
    this.buildRuinsAndTowers();
    this.buildPropsAndWrecks();
    this.buildExplosiveBarrels();
    this.buildMountains();
    this.buildSearchlights();
    this.buildDistantArtillery();

    this.sightStructures = this.structures.filter((s) => s.blocksSight !== false);
  }

  private applySceneAtmosphere(): void {
    if (this.currentMapId === 'desierto') {
      const bg = new THREE.Color(0x3a2419);
      this.scene.background = bg;
      this.scene.fog = new THREE.FogExp2(0x3a2419, 0.0072);
    } else if (this.currentMapId === 'ciudad') {
      const bg = new THREE.Color(0x111722);
      this.scene.background = bg;
      this.scene.fog = new THREE.FogExp2(0x111722, 0.0082);
    } else {
      const bg = new THREE.Color(0x1b1917);
      this.scene.background = bg;
      this.scene.fog = new THREE.FogExp2(0x1b1917, 0.0088);
    }
  }

  private buildSky(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);

    if (this.currentMapId === 'desierto') {
      grad.addColorStop(0.0, '#14111d');
      grad.addColorStop(0.36, '#39252d');
      grad.addColorStop(0.65, '#7e3c25');
      grad.addColorStop(0.84, '#c7682d');
      grad.addColorStop(0.95, '#e89b48');
      grad.addColorStop(1.0, '#4d2b1c');
    } else if (this.currentMapId === 'ciudad') {
      grad.addColorStop(0.0, '#070b14');
      grad.addColorStop(0.4, '#111b2c');
      grad.addColorStop(0.68, '#1e2c40');
      grad.addColorStop(0.86, '#314459');
      grad.addColorStop(0.95, '#544a3d');
      grad.addColorStop(1.0, '#161b24');
    } else {
      grad.addColorStop(0.0, '#0d1016');
      grad.addColorStop(0.38, '#1d2027');
      grad.addColorStop(0.66, '#392c25');
      grad.addColorStop(0.84, '#6e3b24');
      grad.addColorStop(0.95, '#9d4c25');
      grad.addColorStop(1.0, '#2a221d');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    this.disposableTextures.push(texture);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(340, 24, 12),
      new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        fog: false,
      })
    );
    sky.position.y = 18;
    this.worldGroup.add(sky);
  }

  private createInstanced(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    transforms: Array<{
      x: number;
      y: number;
      z: number;
      rx?: number;
      ry?: number;
      rz?: number;
      sx?: number;
      sy?: number;
      sz?: number;
      color?: THREE.Color;
    }>,
    castShadow = false,
    receiveShadow = true
  ): THREE.InstancedMesh | null {
    if (transforms.length === 0) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    const dummy = new THREE.Object3D();
    let hasColor = false;

    transforms.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
      dummy.scale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (t.color) {
        mesh.setColorAt(i, t.color);
        hasColor = true;
      }
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (hasColor && mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.computeBoundingSphere();
    this.worldGroup.add(mesh);
    return mesh;
  }

  private buildTerrainMesh(): void {
    const size = TERRAIN_SIZE;
    const segments = TERRAIN_SEGMENTS;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position;
    const colors: number[] = [];
    const heights = new Float32Array(posAttr.count);

    const palette =
      this.currentMapId === 'desierto'
        ? {
            low: new THREE.Color(0x5a341f),
            mid: new THREE.Color(0x9a6b42),
            high: new THREE.Color(0xb88450),
            accent: new THREE.Color(0x7a4a2b),
          }
        : this.currentMapId === 'ciudad'
        ? {
            low: new THREE.Color(0x181c22),
            mid: new THREE.Color(0x2b3038),
            high: new THREE.Color(0x3a404a),
            accent: new THREE.Color(0x22272e),
          }
        : {
            low: new THREE.Color(0x1f1812),
            mid: new THREE.Color(0x45392c),
            high: new THREE.Color(0x2b2928),
            accent: new THREE.Color(0x3a3b2a),
          };
    const tempColor = new THREE.Color();

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const y = getTerrainHeightAt(x, z, this.currentMapId);
      heights[i] = y;
      posAttr.setY(i, y);

      if (this.currentMapId === 'ciudad' && Math.abs(x) < 10) {
        // Dark paved central urban avenue
        tempColor.setHex(0x1f242c);
      } else if (y < -0.85) {
        tempColor.copy(palette.low);
      } else if (y > 1.5) {
        tempColor.copy(palette.high).lerp(palette.accent, 0.25);
      } else {
        const patch = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 0.5 + 0.5;
        tempColor.copy(palette.mid).lerp(palette.accent, patch * 0.35);
      }
      colors.push(tempColor.r, tempColor.g, tempColor.b);
    }

    this.terrainGridHeights = heights;

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const terrainMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
    });

    const terrain = new THREE.Mesh(geo, terrainMat);
    terrain.receiveShadow = true;
    this.worldGroup.add(terrain);
  }

  private buildTrenchParapets(): void {
    const sandbagMat = new THREE.MeshLambertMaterial({
      color:
        this.currentMapId === 'desierto'
          ? 0xd6b588
          : this.currentMapId === 'ciudad'
          ? 0x7c8591
          : 0xbcb098,
      map: this.textures.sandbagMap,
    });
    const woodMat = new THREE.MeshLambertMaterial({
      color: this.currentMapId === 'ciudad' ? 0x2c333b : 0x3b2c1e,
    });

    const trenchZPositions = BATTLEFIELD_MAPS[this.currentMapId].trenchZ;
    const parapets: Array<{ x: number; y: number; z: number; ry: number; sx: number }> = [];
    const posts: Array<{ x: number; y: number; z: number; rz: number }> = [];
    const duckboards: Array<{ x: number; y: number; z: number; ry: number }> = [];

    trenchZPositions.forEach((_tz, idx) => {
      for (let x = -96; x <= 96; x += 12) {
        const floorZ = getTrenchCenterZ(x, idx, this.currentMapId);
        const zPos = floorZ + (idx % 2 === 0 ? 3.2 : -3.2);
        const yPos = this.getTerrainHeight(x, zPos);

        parapets.push({
          x,
          y: yPos + 0.32,
          z: zPos,
          ry: this.currentMapId === 'ciudad' ? 0 : Math.cos(x * 0.16 + idx) * 0.4,
          sx: 0.92 + ((Math.abs(x) * 7) % 5) * 0.04,
        });

        const floorY = this.getTerrainHeight(x, floorZ);
        duckboards.push({
          x,
          y: floorY + 0.01,
          z: floorZ,
          ry: this.currentMapId === 'ciudad' ? 0 : Math.cos(x * 0.16 + idx) * 0.35,
        });

        this.structures.push({
          minX: x - 2.8,
          maxX: x + 2.8,
          minZ: zPos - 0.65,
          maxZ: zPos + 0.65,
          maxY: yPos + 0.85,
          blocksSight: false,
        });

        if (Math.abs(x) % 24 === 0) {
          posts.push({
            x: x + 2.2,
            y: yPos + 0.72,
            z: zPos + (idx % 2 === 0 ? 1.8 : -1.8),
            rz: ((x + idx) % 3 - 1) * 0.12,
          });
        }
      }
    });

    this.createInstanced(new THREE.BoxGeometry(5.5, 0.98, 1.15), sandbagMat, parapets, false, true);
    this.createInstanced(new THREE.BoxGeometry(0.32, 2.0, 0.32), woodMat, posts, false, false);
    this.createInstanced(new THREE.BoxGeometry(4.4, 0.12, 1.1), woodMat, duckboards, false, true);
  }

  private buildRuinsAndTowers(): void {
    const concreteMat = new THREE.MeshLambertMaterial({
      color:
        this.currentMapId === 'desierto'
          ? 0xd4b08a
          : this.currentMapId === 'ciudad'
          ? 0x9aa4b2
          : 0xffffff,
      map: this.textures.concreteMap,
    });
    const steelMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      map: this.textures.metalMap,
    });
    const beamMat = new THREE.MeshLambertMaterial({
      color: 0x3a2e23,
    });
    const interiorBagMat = new THREE.MeshLambertMaterial({
      color: 0xbcb098,
      map: this.textures.sandbagMap,
    });

    const houses =
      this.currentMapId === 'desierto'
        ? [
            { x: -38, z: -36, w: 12, d: 11, h: 7.2 },
            { x: 36, z: -32, w: 13, d: 10, h: 7.6 },
            { x: -48, z: 32, w: 11, d: 11, h: 6.8 },
            { x: 34, z: 40, w: 12, d: 11, h: 7.4 },
            { x: 0, z: -4, w: 10, d: 10, h: 6.6 },
            { x: 64, z: 12, w: 11, d: 11, h: 7.2 },
          ]
        : this.currentMapId === 'ciudad'
        ? [
            { x: -32, z: -38, w: 14, d: 12, h: 8.6 },
            { x: 34, z: -40, w: 14, d: 12, h: 9.0 },
            { x: -36, z: 10, w: 13, d: 12, h: 8.2 },
            { x: 34, z: 12, w: 13, d: 12, h: 8.4 },
            { x: -38, z: 50, w: 12, d: 10, h: 7.8 },
            { x: 38, z: 48, w: 12, d: 10, h: 7.8 },
            { x: 0, z: -64, w: 14, d: 11, h: 8.6 },
          ]
        : [
            { x: -34, z: -34, w: 12, d: 10, h: 7.4 },
            { x: 40, z: -38, w: 13, d: 11, h: 8.0 },
            { x: -44, z: 36, w: 11, d: 12, h: 7.2 },
            { x: 30, z: 42, w: 13, d: 10, h: 7.6 },
            { x: -16, z: -14, w: 10, d: 10, h: 6.8 },
            { x: 68, z: 6, w: 11, d: 12, h: 7.4 },
          ];

    const walls: Array<{
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
    }> = [];
    const beams: Array<{
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
      rz?: number;
    }> = [];
    const interiorBags: Array<{
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
    }> = [];

    const addSolidSlab = (
      cx: number,
      cy: number,
      cz: number,
      sx: number,
      sy: number,
      sz: number,
      blocksSight = true
    ) => {
      walls.push({ x: cx, y: cy, z: cz, sx, sy, sz });
      this.structures.push({
        minX: cx - sx * 0.5,
        maxX: cx + sx * 0.5,
        minZ: cz - sz * 0.5,
        maxZ: cz + sz * 0.5,
        minY: cy - sy * 0.5,
        maxY: cy + sy * 0.5,
        blocksSight,
      });
    };

    houses.forEach((r) => {
      const groundY = this.getTerrainHeight(r.x, r.z);
      const t = 0.72;
      const doorW = 3.8;
      const doorH = 3.8;
      const sideSegW = (r.w - doorW) * 0.5;
      const winW = 3.4;
      const sillH = 1.45;
      const winH = 2.4;
      const sideWallD = (r.d - winW) * 0.5;
      const baseFloor = groundY - 0.8;
      const totalH = r.h + 0.8;

      walls.push({
        x: r.x,
        y: groundY - 0.12,
        z: r.z,
        sx: r.w + 0.4,
        sy: 0.35,
        sz: r.d + 0.4,
      });

      [-r.d * 0.5, r.d * 0.5].forEach((zOff) => {
        const wz = r.z + zOff;
        addSolidSlab(
          r.x - (doorW * 0.5 + sideSegW * 0.5),
          baseFloor + totalH * 0.5,
          wz,
          sideSegW,
          totalH,
          t
        );
        addSolidSlab(
          r.x + (doorW * 0.5 + sideSegW * 0.5),
          baseFloor + totalH * 0.5,
          wz,
          sideSegW,
          totalH,
          t
        );
        const headerH = r.h - doorH;
        if (headerH > 0.3) {
          addSolidSlab(
            r.x,
            groundY + doorH + headerH * 0.5,
            wz,
            doorW,
            headerH,
            t
          );
        }
      });

      [-r.w * 0.5, r.w * 0.5].forEach((xOff) => {
        const wx = r.x + xOff;
        addSolidSlab(
          wx,
          baseFloor + totalH * 0.5,
          r.z - (winW * 0.5 + sideWallD * 0.5),
          t,
          totalH,
          sideWallD
        );
        addSolidSlab(
          wx,
          baseFloor + totalH * 0.5,
          r.z + (winW * 0.5 + sideWallD * 0.5),
          t,
          totalH,
          sideWallD
        );
        addSolidSlab(
          wx,
          baseFloor + (sillH + 0.8) * 0.5,
          r.z,
          t,
          sillH + 0.8,
          winW,
          false
        );
        const winHeaderH = Math.max(0.5, r.h - (sillH + winH));
        addSolidSlab(
          wx,
          groundY + sillH + winH + winHeaderH * 0.5,
          r.z,
          t,
          winHeaderH,
          winW
        );
      });

      const roofY = groundY + r.h + 0.22;
      addSolidSlab(r.x - r.w * 0.28, roofY, r.z, r.w * 0.44, 0.44, r.d + 0.2);
      addSolidSlab(r.x + r.w * 0.28, roofY, r.z, r.w * 0.44, 0.44, r.d + 0.2);

      beams.push(
        { x: r.x, y: groundY + r.h - 0.15, z: r.z - r.d * 0.22, sx: r.w - 0.8, sy: 0.28, sz: 0.28 },
        { x: r.x, y: groundY + r.h - 0.15, z: r.z + r.d * 0.22, sx: r.w - 0.8, sy: 0.28, sz: 0.28 }
      );
      interiorBags.push({
        x: r.x + r.w * 0.22,
        y: groundY + 0.36,
        z: r.z,
        sx: 0.85,
        sy: 0.88,
        sz: 2.6,
      });
    });

    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);

    // Urban cargo shipping containers for Zona Industrial
    if (this.currentMapId === 'ciudad') {
      const containerMat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        map: this.textures.metalMap,
      });
      const containers = [
        { x: -16, z: 22, sx: 6.5, sy: 3.1, sz: 2.8, c: new THREE.Color(0x2d4f6e) },
        { x: 18, z: -28, sx: 2.8, sy: 3.1, sz: 6.5, c: new THREE.Color(0x6e3a2d) },
        { x: -62, z: -18, sx: 6.5, sy: 3.1, sz: 2.8, c: new THREE.Color(0x4b5c3b) },
        { x: 64, z: -8, sx: 2.8, sy: 3.1, sz: 6.5, c: new THREE.Color(0x635531) },
      ];
      const containerTransforms = containers.map((c) => {
        const gy = this.getTerrainHeight(c.x, c.z);
        this.structures.push({
          minX: c.x - c.sx * 0.5,
          maxX: c.x + c.sx * 0.5,
          minZ: c.z - c.sz * 0.5,
          maxZ: c.z + c.sz * 0.5,
          minY: gy - 0.4,
          maxY: gy + c.sy,
          blocksSight: true,
        });
        return { x: c.x, y: gy + c.sy * 0.5, z: c.z, sx: c.sx, sy: c.sy, sz: c.sz, color: c.c };
      });
      this.createInstanced(unitBoxGeo, containerMat, containerTransforms, true, true);
    }

    this.createInstanced(unitBoxGeo, concreteMat, walls, true, true);
    this.createInstanced(unitBoxGeo, beamMat, beams, false, false);
    this.createInstanced(unitBoxGeo, interiorBagMat, interiorBags, false, true);

    const towers =
      this.currentMapId === 'ciudad'
        ? [
            { x: -68, z: -48 },
            { x: 68, z: -48 },
            { x: -68, z: 42 },
          ]
        : [
            { x: -75, z: -15 },
            { x: 75, z: -55 },
            { x: 0, z: -78 },
          ];
    const steelParts: Array<{
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
      ry?: number;
    }> = [];

    towers.forEach((t) => {
      const gy = this.getTerrainHeight(t.x, t.z);
      [-1.15, 1.15].forEach((lx) => {
        [-1.15, 1.15].forEach((lz) => {
          steelParts.push({
            x: t.x + lx,
            y: gy + 5.5,
            z: t.z + lz,
            sx: 0.28,
            sy: 11.5,
            sz: 0.28,
          });
        });
      });
      steelParts.push(
        { x: t.x, y: gy + 10.6, z: t.z, sx: 3.4, sy: 0.35, sz: 3.4 },
        { x: t.x, y: gy + 11.4, z: t.z + 1.55, sx: 3.4, sy: 1.2, sz: 0.22 },
        { x: t.x, y: gy + 11.4, z: t.z - 1.55, sx: 3.4, sy: 1.2, sz: 0.22 },
        { x: t.x, y: gy + 13.3, z: t.z, sx: 3.7, sy: 0.25, sz: 3.7 }
      );

      this.structures.push({
        minX: t.x - 1.8,
        maxX: t.x + 1.8,
        minZ: t.z - 1.8,
        maxZ: t.z + 1.8,
        maxY: gy + 13.4,
        blocksSight: true,
      });
    });

    this.createInstanced(new THREE.BoxGeometry(1, 1, 1), steelMat, steelParts, true, true);
  }

  private buildPropsAndWrecks(): void {
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
    });
    const rocks: Array<{
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
      rx: number;
      ry: number;
      rz: number;
      color: THREE.Color;
    }> = [];

    const rockCount = this.currentMapId === 'desierto' ? 72 : 52;
    for (let i = 0; i < rockCount; i++) {
      const x = Math.sin(i * 19.7 + this.currentMapId.length) * 115;
      const z = Math.cos(i * 31.3) * 115;
      if (Math.abs(x) < 10 && z > 65) continue;
      if (this.currentMapId === 'ciudad' && Math.abs(x) < 11) continue;
      const y = this.getTerrainHeight(x, z);
      const s = 0.38 + ((i * 17) % 10) * 0.11;
      const tint = 0.2 + ((i * 13) % 7) * 0.025;
      const col =
        this.currentMapId === 'desierto'
          ? new THREE.Color(tint * 1.55, tint * 1.0, tint * 0.68)
          : this.currentMapId === 'ciudad'
          ? new THREE.Color(tint * 0.85, tint * 0.9, tint * 1.02)
          : new THREE.Color(tint * 1.05, tint * 0.95, tint * 0.85);
      rocks.push({
        x,
        y: y + s * 0.3,
        z,
        sx: s,
        sy: s * 0.65,
        sz: s * 0.95,
        rx: i * 0.7,
        ry: i * 1.1,
        rz: i * 0.4,
        color: col,
      });
    }
    this.createInstanced(rockGeo, rockMat, rocks, false, false);

    // Streetlight poles with warm sodium lamps in Zona Industrial
    if (this.currentMapId === 'ciudad') {
      const poleMat = new THREE.MeshLambertMaterial({ color: 0x3b424d });
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc66e });
      const poles: Array<{ x: number; y: number; z: number }> = [];
      const lamps: Array<{ x: number; y: number; z: number }> = [];
      for (let z = -70; z <= 70; z += 35) {
        [-11.5, 11.5].forEach((x) => {
          const gy = this.getTerrainHeight(x, z);
          poles.push({ x, y: gy + 3.4, z });
          lamps.push({ x: x > 0 ? x - 0.7 : x + 0.7, y: gy + 6.7, z });
        });
      }
      this.createInstanced(new THREE.CylinderGeometry(0.12, 0.16, 6.8, 6), poleMat, poles, false, false);
      this.createInstanced(new THREE.BoxGeometry(0.9, 0.24, 0.45), lampMat, lamps, false, false);
    }

    const barrelMat = new THREE.MeshLambertMaterial({
      color: 0x4b3324,
    });
    const barrels: Array<{ x: number; y: number; z: number; rz: number }> = [];
    for (let i = 0; i < 16; i++) {
      const x = -72 + i * 9;
      const z = 14 + Math.sin(i * 2.1) * 52;
      const y = this.getTerrainHeight(x, z);
      barrels.push({
        x,
        y: y + 0.48,
        z,
        rz: i % 4 === 0 ? Math.PI / 2 : 0,
      });
    }
    this.createInstanced(
      new THREE.CylinderGeometry(0.36, 0.36, 0.95, 8),
      barrelMat,
      barrels,
      false,
      false
    );

    const wreckMat = new THREE.MeshLambertMaterial({
      color: this.currentMapId === 'desierto' ? 0x4d3a2c : 0x262523,
    });
    const wrecks = [
      { x: -24, z: 32, ry: 0.4 },
      { x: 26, z: -8, ry: -0.6 },
      { x: -58, z: -12, ry: 1.1 },
      { x: 48, z: 26, ry: -1.2 },
    ];
    wrecks.forEach((w) => {
      const gy = this.getTerrainHeight(w.x, w.z);
      const grp = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.3, 5.8), wreckMat);
      hull.position.y = 0.75;
      hull.castShadow = true;
      hull.receiveShadow = true;
      grp.add(hull);

      const turret = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 2.3), wreckMat);
      turret.position.set(0.15, 1.75, -0.3);
      turret.rotation.y = 0.45;
      turret.castShadow = true;
      grp.add(turret);

      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.13, 3.2, 8),
        wreckMat
      );
      barrel.rotation.x = Math.PI / 2 - 0.12;
      barrel.position.set(0.4, 1.85, 1.9);
      grp.add(barrel);

      grp.position.set(w.x, gy, w.z);
      grp.rotation.y = w.ry;
      grp.rotation.z = 0.08;
      this.worldGroup.add(grp);

      this.structures.push({
        minX: w.x - 2.6,
        maxX: w.x + 2.6,
        minZ: w.z - 2.6,
        maxZ: w.z + 2.6,
        maxY: gy + 2.3,
        blocksSight: true,
      });
    });
  }

  private buildExplosiveBarrels(): void {
    const redDrumMat = new THREE.MeshLambertMaterial({
      color: 0xc92a1d,
    });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffb703 });
    const drumGeo = new THREE.CylinderGeometry(0.48, 0.48, 1.25, 8);
    const ringGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.18, 8);

    const coords = [
      { x: -16, z: -22 },
      { x: 22, z: -20 },
      { x: -46, z: -58 },
      { x: 42, z: -56 },
      { x: -24, z: 18 },
      { x: 18, z: 22 },
      { x: -56, z: 28 },
      { x: 54, z: 16 },
    ];

    coords.forEach((c, idx) => {
      const gy = this.getTerrainHeight(c.x, c.z);
      const drum = new THREE.Mesh(drumGeo, redDrumMat);
      drum.position.set(c.x, gy + 0.62, c.z);

      const stripe = new THREE.Mesh(ringGeo, stripeMat);
      stripe.position.y = 0.18;
      drum.add(stripe);

      this.worldGroup.add(drum);
      this.explosiveBarrels.push({
        id: idx,
        mesh: drum,
        position: drum.position,
        exploded: false,
      });
    });
  }

  private buildMountains(): void {
    const layers =
      this.currentMapId === 'desierto'
        ? [
            { radius: 158, baseHeight: 16, peakAmp: 26, segs: 72, colorA: 0x452617, colorB: 0x7d4527 },
            { radius: 192, baseHeight: 22, peakAmp: 32, segs: 84, colorA: 0x2e1911, colorB: 0x5c321d },
          ]
        : this.currentMapId === 'ciudad'
        ? [
            { radius: 164, baseHeight: 14, peakAmp: 18, segs: 72, colorA: 0x10151d, colorB: 0x1e2836 },
            { radius: 196, baseHeight: 20, peakAmp: 24, segs: 84, colorA: 0x0b0f16, colorB: 0x17202c },
          ]
        : [
            { radius: 162, baseHeight: 11, peakAmp: 20, segs: 72, colorA: 0x1e1b18, colorB: 0x2c2520 },
            { radius: 194, baseHeight: 17, peakAmp: 27, segs: 84, colorA: 0x151415, colorB: 0x241e1b },
          ];

    layers.forEach((layer, layerIdx) => {
      const radialSegs = layer.segs;
      const geo = new THREE.CylinderGeometry(
        layer.radius,
        layer.radius + 28,
        1,
        radialSegs,
        3,
        true
      );
      const pos = geo.attributes.position;
      const colors: number[] = [];
      const cLow = new THREE.Color(layer.colorA);
      const cHigh = new THREE.Color(layer.colorB);
      const tmp = new THREE.Color();

      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const angle = Math.atan2(vz, vx);
        const t = vy + 0.5;

        const pmod = (v: number) => ((v % 2) + 2) % 2;
        const tri1 = Math.max(0, 1 - Math.abs(pmod(angle * 4.5 + layerIdx * 0.7) - 1));
        const tri2 = Math.max(0, 1 - Math.abs(pmod(angle * 11.3 + 1.1) - 1));
        const tri3 = Math.abs(Math.sin(angle * 23 + layerIdx * 1.9));
        const jagged = Math.pow(tri1, 1.5) * 0.52 + tri2 * 0.33 + tri3 * 0.15;

        const northDelta = Math.atan2(Math.sin(angle + Math.PI / 2), Math.cos(angle + Math.PI / 2));
        const passFactor = 0.42 + 0.58 * Math.min(1, Math.abs(northDelta) / 0.52);

        const crestHeight = (layer.baseHeight + jagged * layer.peakAmp) * passFactor;
        const worldY = -10 + t * crestHeight;
        const radialJitter =
          1 + (Math.sin(angle * 15 + t * 5) * 0.04) * (1 - t * 0.4);

        pos.setXYZ(i, vx * radialJitter, worldY, vz * radialJitter);

        tmp.copy(cLow).lerp(cHigh, t);
        colors.push(tmp.r, tmp.g, tmp.b);
      }

      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();

      const ridgeMat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.BackSide,
      });
      const ridgeMesh = new THREE.Mesh(geo, ridgeMat);
      this.worldGroup.add(ridgeMesh);
    });
  }

  private buildSearchlights(): void {
    const fadeCanvas = document.createElement('canvas');
    fadeCanvas.width = 16;
    fadeCanvas.height = 128;
    const fCtx = fadeCanvas.getContext('2d')!;
    const grad = fCtx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, '#ffffff');
    grad.addColorStop(0.25, '#bbbbbb');
    grad.addColorStop(0.65, '#383838');
    grad.addColorStop(1.0, '#000000');
    fCtx.fillStyle = grad;
    fCtx.fillRect(0, 0, 16, 128);
    const alphaTex = new THREE.CanvasTexture(fadeCanvas);
    this.disposableTextures.push(alphaTex);

    const coneMat = new THREE.MeshBasicMaterial({
      color: this.currentMapId === 'ciudad' ? 0x99ccff : 0xffd7a3,
      alphaMap: alphaTex,
      transparent: true,
      opacity: this.currentMapId === 'desierto' ? 0.035 : 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    [-70, 70].forEach((x, idx) => {
      const target = new THREE.Object3D();
      target.position.set(x * 0.6, 0, -24);
      this.worldGroup.add(target);

      const coneGeo = new THREE.ConeGeometry(8.5, 72, 16, 1, true);
      coneGeo.translate(0, -36, 0);
      coneGeo.rotateX(Math.PI / 2);
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(x, 28, -82);
      this.worldGroup.add(cone);

      this.searchlights.push({ target, cone, phase: idx * Math.PI, baseX: x });
    });
  }

  private buildDistantArtillery(): void {
    const flashGeo = new THREE.SphereGeometry(6, 10, 8);
    [
      new THREE.Vector3(-95, 16, -142),
      new THREE.Vector3(88, 18, -146),
    ].forEach((pos, idx) => {
      const mat = new THREE.MeshBasicMaterial({
        color: this.currentMapId === 'ciudad' ? 0x88b4ff : 0xff7b33,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(flashGeo, mat);
      mesh.position.copy(pos);
      this.worldGroup.add(mesh);
      this.artilleryFlashes.push({
        mesh,
        timer: 2.5 + idx * 3.8,
      });
    });
  }

  update(dt: number, time: number): void {
    for (let i = 0; i < this.searchlights.length; i++) {
      const s = this.searchlights[i];
      s.target.position.x = s.baseX * 0.55 + Math.sin(time * 0.35 + s.phase) * 30;
      s.target.position.z = -24 + Math.cos(time * 0.22 + i) * 18;
      s.cone.lookAt(s.target.position);
    }

    for (let i = 0; i < this.artilleryFlashes.length; i++) {
      const f = this.artilleryFlashes[i];
      f.timer -= dt;
      if (f.timer <= 0) {
        f.mesh.material.opacity = 0.85;
        f.timer = 4.2 + Math.random() * 5.5;
        this.onArtilleryBoom?.();
      } else {
        f.mesh.material.opacity = Math.max(0, f.mesh.material.opacity - dt * 2.8);
      }
    }
  }

  hasLineOfSight(from: Vec3, to: Vec3): boolean {
    return hasClearLineOfSight(from, to, this.sightStructures, (x, z) =>
      this.getTerrainHeight(x, z)
    );
  }

  checkStructureCollision(pos: Vec3, forSight = false, radius = 0): boolean {
    this.sampleVec.x = pos.x;
    this.sampleVec.y = pos.y;
    this.sampleVec.z = pos.z;
    return pointHitsStructure(
      this.sampleVec,
      forSight ? this.sightStructures : this.structures,
      forSight,
      radius
    );
  }
}
