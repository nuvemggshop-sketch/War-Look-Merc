/**
 * Constructor del escenario de guerra:
 * - Relieve accidentado con 4 líneas de trincheras excavadas en zig-zag
 * - Sacos de arena, barricadas, torres de vigilancia y edificios en ruinas
 */
class BattlefieldWorld {
    constructor(scene) {
        this.scene = scene;
        this.structures = []; // Cajas de colisión para detectar impacto del dron contra muros
        this.obstacleMeshes = []; // Malla del terreno para consultas de línea de visión
        this.searchlights = [];
        this.terrain = null;
    }

    getTerrainHeight(x, z) {
        let h = Math.sin(x * 0.035) * Math.cos(z * 0.035) * 3.0;
        h += Math.sin(x * 0.1 + z * 0.09) * 0.9;

        // 4 líneas de trincheras profundas en zig-zag
        const trenchZPositions = [-65, -25, 18, 58];
        trenchZPositions.forEach((tz, idx) => {
            const zigzag = Math.sin(x * 0.16 + idx) * 6.5;
            const dist = Math.abs(z - (tz + zigzag));
            if (dist < 2.8) {
                h -= (2.8 - dist) * 1.35;
            }
        });

        // Cráteres de artillería
        const craters = [
            { cx: -28, cz: -10, r: 9 },
            { cx: 32, cz: 8, r: 11 },
            { cx: -12, cz: -48, r: 8 },
            { cx: 45, cz: -55, r: 10 },
            { cx: -55, cz: 35, r: 9 }
        ];
        craters.forEach(c => {
            const d = Math.hypot(x - c.cx, z - c.cz);
            if (d < c.r) {
                h -= Math.cos((d / c.r) * (Math.PI / 2)) * 2.6;
            }
        });

        return h;
    }

    build() {
        this.buildSky();
        this.buildTerrainMesh();
        this.buildTrenchParapets();
        this.buildRuinsAndTowers();
        this.buildProps();
        this.buildMountains();
        this.buildSearchlights();

        // Lista reducida solo con obstáculos altos que bloquean la vista.
        this.sightStructures = this.structures.filter(s => s.blocksSight !== false);
    }

    buildSky() {
        // Cúpula de cielo con degradado de atardecer de guerra
        const canvas = document.createElement('canvas');
        canvas.width = 4;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0.0, '#14161c');
        grad.addColorStop(0.45, '#2b2623');
        grad.addColorStop(0.72, '#4a3528');
        grad.addColorStop(0.9, '#8a4a2a');
        grad.addColorStop(1.0, '#b05a2c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 4, 256);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.LinearFilter;
        const sky = new THREE.Mesh(
            new THREE.SphereGeometry(320, 32, 16),
            new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false })
        );
        sky.position.y = 20;
        this.scene.add(sky);
    }

    /**
     * Crea una malla instanciada a partir de una lista de transformaciones.
     * Reduce cientos de draw calls a uno solo por material.
     */
    createInstanced(geometry, material, transforms, castShadow = false, receiveShadow = true) {
        if (!transforms.length) return null;
        const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
        const dummy = new THREE.Object3D();
        transforms.forEach((t, i) => {
            dummy.position.copy(t.position);
            dummy.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
            dummy.scale.set(t.sx || 1, t.sy || 1, t.sz || 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        return mesh;
    }

    buildProps() {
        // Rocas y escombros instanciados: antes eran 110 draw calls separados.
        const rockGeo = new THREE.DodecahedronGeometry(1, 0);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x3d3731, roughness: 0.98 });
        const debrisMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.8, metalness: 0.5 });
        const rocks = [];
        const debris = [];

        for (let i = 0; i < 110; i++) {
            const x = (Math.random() - 0.5) * 210;
            const z = (Math.random() - 0.5) * 210;
            const y = this.getTerrainHeight(x, z);
            const isDebris = i % 4 === 0;
            const s = isDebris ? 0.25 + Math.random() * 0.5 : 0.35 + Math.random() * 1.1;
            const t = {
                position: new THREE.Vector3(x, y + s * 0.35, z),
                sx: s,
                sy: s * (0.5 + Math.random() * 0.7),
                sz: s,
                rx: Math.random() * Math.PI,
                ry: Math.random() * Math.PI,
                rz: Math.random() * Math.PI
            };
            (isDebris ? debris : rocks).push(t);
        }

        this.createInstanced(rockGeo, rockMat, rocks, true, true);
        this.createInstanced(rockGeo, debrisMat, debris, false, true);

        // Postes de alambre y barriles quemados, también instanciados.
        const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2119, roughness: 0.95 });
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.7, metalness: 0.3 });
        const posts = [];
        const barrels = [];

        [-65, -25, 18, 58].forEach((tz, idx) => {
            for (let x = -85; x <= 85; x += 24) {
                const zig = Math.sin(x * 0.16 + idx) * 6.5;
                const z = tz + zig + (idx % 2 === 0 ? 5.4 : -5.4);
                const y = this.getTerrainHeight(x, z);
                posts.push({
                    position: new THREE.Vector3(x, y + 0.75, z),
                    rz: (Math.random() - 0.5) * 0.16
                });
            }
        });

        for (let i = 0; i < 14; i++) {
            const x = (Math.random() - 0.5) * 150;
            const z = 20 + Math.random() * 80;
            const y = this.getTerrainHeight(x, z);
            barrels.push({
                position: new THREE.Vector3(x, y + 0.48, z),
                rz: Math.random() < 0.35 ? Math.PI / 2 : 0
            });
        }

        this.createInstanced(new THREE.BoxGeometry(0.18, 1.5, 0.18), postMat, posts, false, true);
        this.createInstanced(new THREE.CylinderGeometry(0.36, 0.36, 0.95, 8), barrelMat, barrels, false, true);
    }

    buildMountains() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x25211f, roughness: 1, metalness: 0 });
        const mountains = [];
        for (let i = 0; i < 18; i++) {
            const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
            const radius = 145 + Math.random() * 35;
            const h = 18 + Math.random() * 32;
            const r = 18 + Math.random() * 16;
            mountains.push({
                position: new THREE.Vector3(Math.cos(angle) * radius, h / 2 - 8, Math.sin(angle) * radius),
                sx: r,
                sy: h,
                sz: r,
                ry: Math.random() * Math.PI
            });
        }
        this.createInstanced(new THREE.ConeGeometry(1, 1, 5), mat, mountains, false, false);
    }

    buildSearchlights() {
        // Reflectores lejanos que barren el campo de batalla
        [-70, 70].forEach((x, idx) => {
            const light = new THREE.SpotLight(0xffd8a8, 1.1, 150, 0.16, 0.5, 1);
            light.position.set(x, 30, -85);
            const target = new THREE.Object3D();
            target.position.set(x, 0, -25);
            this.scene.add(light);
            this.scene.add(target);
            light.target = target;
            this.searchlights.push({ light, target, phase: idx * Math.PI, baseX: x });
        });
    }

    update(dt, time) {
        this.searchlights.forEach((s, idx) => {
            s.target.position.x = s.baseX + Math.sin(time * 0.35 + s.phase) * 28;
            s.target.position.z = -25 + Math.cos(time * 0.22 + idx) * 18;
            s.light.intensity = 0.85 + Math.sin(time * 2.1 + idx) * 0.18;
        });
    }

    /**
     * Comprueba si hay visión directa entre dos puntos.
     * Muestrea el terreno y las cajas de estructuras: si algo se interpone, no hay disparo.
     */
    hasLineOfSight(from, to, steps = 12) {
        const dir = new THREE.Vector3().subVectors(to, from);
        const dist = dir.length();
        if (dist < 0.001) return true;
        dir.divideScalar(dist);

        // Muestreo adaptativo: cuanto mayor es la distancia, más fino es el barrido.
        const samples = Math.max(steps, Math.ceil(dist / 2.0));
        const sample = new THREE.Vector3();
        for (let i = 1; i < samples; i++) {
            const t = (i / samples) * dist;
            sample.set(from.x + dir.x * t, from.y + dir.y * t, from.z + dir.z * t);
            if (sample.y < this.getTerrainHeight(sample.x, sample.z) + 0.18) return false;
            if (this.checkStructureCollision(sample, true)) return false;
        }
        return true;
    }

    buildTerrainMesh() {
        const size = 260;
        const segments = 108;
        const geo = new THREE.PlaneGeometry(size, size, segments, segments);
        geo.rotateX(-Math.PI / 2);

        const posAttr = geo.attributes.position;
        const colors = [];

        const colorMud = new THREE.Color(0x3a3026);
        const colorAsh = new THREE.Color(0x292929);
        const colorTrench = new THREE.Color(0x1b1510);

        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const z = posAttr.getZ(i);
            const y = this.getTerrainHeight(x, z);
            posAttr.setY(i, y);

            const c = y < -1.1 ? colorTrench : (y > 1.4 ? colorAsh : colorMud);
            colors.push(c.r, c.g, c.b);
        }

        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const terrainMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.94,
            metalness: 0.04
        });

        const terrain = new THREE.Mesh(geo, terrainMat);
        terrain.receiveShadow = true;
        this.terrain = terrain;
        this.scene.add(terrain);
    }

    buildTrenchParapets() {
        // Sacos de arena y tablones bordeando las trincheras (instanciados)
        const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x5c513e, roughness: 0.9 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x2e2218, roughness: 0.9 });
        const trenchZPositions = [-65, -25, 18, 58];
        const parapets = [];
        const posts = [];

        trenchZPositions.forEach((tz, idx) => {
            for (let x = -95; x <= 95; x += 14) {
                const zigzag = Math.sin(x * 0.16 + idx) * 6.5;
                const zPos = tz + zigzag + (idx % 2 === 0 ? 3.2 : -3.2);
                const yPos = this.getTerrainHeight(x, zPos);

                parapets.push({
                    position: new THREE.Vector3(x, yPos + 0.4, zPos),
                    ry: (Math.random() - 0.5) * 0.3
                });

                // Los sacos de arena bloquean balas y dron, pero no la vista:
                // son cobertura baja y el soldado dispara por encima de ellos.
                this.structures.push({
                    minX: x - 2.8,
                    maxX: x + 2.8,
                    minZ: zPos - 0.62,
                    maxZ: zPos + 0.62,
                    maxY: yPos + 0.88,
                    blocksSight: false
                });

                if (Math.abs(x) % 28 === 0) {
                    posts.push({ position: new THREE.Vector3(x + 2, yPos + 0.9, zPos) });
                }
            }
        });

        this.createInstanced(new THREE.BoxGeometry(5.5, 0.9, 1.1), sandbagMat, parapets, true, true);
        this.createInstanced(new THREE.BoxGeometry(0.4, 2.2, 0.4), woodMat, posts, true, true);
    }

    buildRuinsAndTowers() {
        const concreteMat = new THREE.MeshStandardMaterial({ color: 0x434648, roughness: 0.85 });
        const steelMat = new THREE.MeshStandardMaterial({ color: 0x272a2c, roughness: 0.6, metalness: 0.6 });
        const beamMat = new THREE.MeshStandardMaterial({ color: 0x2b2723, roughness: 0.9, metalness: 0.3 });

        const ruins = [
            { x: -34, z: -34, w: 12, d: 10, h: 14 },
            { x: 40, z: -38, w: 14, d: 12, h: 17 },
            { x: -44, z: 36, w: 10, d: 14, h: 12 },
            { x: 30, z: 42, w: 15, d: 10, h: 15 },
            { x: -6, z: -18, w: 9, d: 9, h: 9 },
            { x: 68, z: 6, w: 11, d: 13, h: 13 }
        ];

        const walls = [];
        const beams = [];

        ruins.forEach(r => {
            const groundY = this.getTerrainHeight(r.x, r.z);
            const baseY = groundY - 0.5;

            walls.push(
                { position: new THREE.Vector3(r.x, baseY + r.h / 2, r.z - r.d / 2), sx: r.w, sy: r.h, sz: 0.9 },
                { position: new THREE.Vector3(r.x - r.w / 2, baseY + (r.h * 0.72) / 2, r.z), sx: 0.9, sy: r.h * 0.72, sz: r.d },
                { position: new THREE.Vector3(r.x + r.w / 2, baseY + (r.h * 0.48) / 2, r.z + r.d * 0.1), sx: 0.9, sy: r.h * 0.48, sz: r.d * 0.8 }
            );

            // Vigas y escombros sobre la ruina
            for (let i = 0; i < 3; i++) {
                beams.push({
                    position: new THREE.Vector3(
                        r.x + (Math.random() - 0.5) * r.w * 0.5,
                        baseY + r.h * 0.55 + i * 1.4,
                        r.z + (Math.random() - 0.5) * r.d * 0.4
                    ),
                    sx: r.w * 0.8,
                    sy: 0.18,
                    sz: 0.18,
                    rz: (Math.random() - 0.5) * 0.5
                });
            }

            // Registrar caja de colisión aproximada del edificio
            this.structures.push({
                minX: r.x - r.w / 2,
                maxX: r.x + r.w / 2,
                minZ: r.z - r.d / 2,
                maxZ: r.z + r.d / 2,
                maxY: groundY + r.h * 0.7
            });
        });

        this.createInstanced(new THREE.BoxGeometry(1, 1, 1), concreteMat, walls, true, true);
        this.createInstanced(new THREE.BoxGeometry(1, 1, 1), beamMat, beams, true, true);

        // Torres de vigilancia metálicas (instanciadas)
        const towers = [{ x: -75, z: -15 }, { x: 75, z: -55 }, { x: 0, z: -78 }];
        const towerTransforms = [];
        towers.forEach(t => {
            const gy = this.getTerrainHeight(t.x, t.z);
            towerTransforms.push({
                position: new THREE.Vector3(t.x, gy + 6, t.z),
                sx: 2.6,
                sy: 13,
                sz: 2.6
            });

            this.structures.push({
                minX: t.x - 1.5,
                maxX: t.x + 1.5,
                minZ: t.z - 1.5,
                maxZ: t.z + 1.5,
                maxY: gy + 12.5
            });
        });
        this.createInstanced(new THREE.BoxGeometry(1, 1, 1), steelMat, towerTransforms, true, true);
    }

    checkStructureCollision(pos, forSight = false) {
        const list = forSight && this.sightStructures ? this.sightStructures : this.structures;
        for (const s of list) {
            if (
                pos.x > s.minX && pos.x < s.maxX &&
                pos.z > s.minZ && pos.z < s.maxZ &&
                pos.y < s.maxY
            ) {
                return true;
            }
        }
        return false;
    }
}