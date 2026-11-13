class EffectsManager {
    constructor(scene, soundManager) {
        this.scene = scene;
        this.sound = soundManager;
        this.particles = [];
        this.projectiles = [];
        this.shockwaves = [];
        this.world = null;
        this.onExplosion = null;

        this.particleGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        this.bulletGeo = new THREE.SphereGeometry(0.18, 6, 6);
        this.tracerGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.7, 5);
        this.sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);

        this.initAmbientSmoke();
        this.initAsh();
    }

    setWorld(world) {
        this.world = world;
    }

    initAmbientSmoke() {
        // Humo ambiental en un único sistema de partículas (1 draw call).
        const smokeLocations = [
            new THREE.Vector3(-45, 0, -40),
            new THREE.Vector3(50, 0, -65),
            new THREE.Vector3(-70, 0, 55),
            new THREE.Vector3(35, 0, 45),
            new THREE.Vector3(0, 0, -85)
        ];
        const perLocation = 16;
        const count = smokeLocations.length * perLocation;
        const positions = new Float32Array(count * 3);
        this.smokeSpeeds = new Float32Array(count);
        this.smokeOrigins = new Float32Array(count * 2);

        let idx = 0;
        smokeLocations.forEach(loc => {
            for (let i = 0; i < perLocation; i++) {
                positions[idx * 3] = loc.x + (Math.random() - 0.5) * 9;
                positions[idx * 3 + 1] = Math.random() * 22;
                positions[idx * 3 + 2] = loc.z + (Math.random() - 0.5) * 9;
                this.smokeOrigins[idx * 2] = loc.x;
                this.smokeOrigins[idx * 2 + 1] = loc.z;
                this.smokeSpeeds[idx] = 1.0 + Math.random() * 1.6;
                idx++;
            }
        });

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0x2a2a2a,
            size: 4.5,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.32,
            depthWrite: false
        });
        this.smoke = new THREE.Points(geo, mat);
        this.smoke.frustumCulled = false;
        this.scene.add(this.smoke);
    }

    initAsh() {
        const count = 550;
        const positions = new Float32Array(count * 3);
        this.ashSpeeds = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 220;
            positions[i * 3 + 1] = Math.random() * 55;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 220;
            this.ashSpeeds[i] = 0.8 + Math.random() * 2.2;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xc9bfae,
            size: 0.22,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        this.ash = new THREE.Points(geo, mat);
        this.scene.add(this.ash);
    }

    createExplosion(position, colorHex = 0xff5500, count = 38) {
        this.sound.playExplosion();

        const light = new THREE.PointLight(0xff6600, 9, 55);
        light.position.copy(position);
        this.scene.add(light);
        setTimeout(() => this.scene.remove(light), 320);

        // Onda expansiva
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffaa66,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.4, 32), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(position);
        ring.position.y += 0.3;
        this.scene.add(ring);
        this.shockwaves.push({ mesh: ring, life: 0.65, maxLife: 0.65, speed: 42 });

        for (let i = 0; i < count; i++) {
            const isSmoke = i % 3 === 0;
            const mat = new THREE.MeshBasicMaterial({
                color: isSmoke ? 0x1b1b1b : colorHex,
                transparent: true,
                opacity: 0.92,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(this.particleGeo, mat);
            mesh.position.copy(position);
            const s = isSmoke ? 2.2 : 1.0;
            mesh.scale.set(s, s, s);
            this.scene.add(mesh);

            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 30,
                Math.random() * 24 + 5,
                (Math.random() - 0.5) * 30
            );

            this.particles.push({ mesh, vel, life: 0.8 + Math.random() * 0.7, maxLife: 1.5, isAmbient: false });
        }

        if (this.onExplosion) this.onExplosion(position, count);
    }

    createImpact(position, color = 0xffaa55, count = 5) {
        for (let i = 0; i < count; i++) {
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
            const mesh = new THREE.Mesh(this.sparkGeo, mat);
            mesh.position.copy(position);
            this.scene.add(mesh);
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 9,
                Math.random() * 6 + 1,
                (Math.random() - 0.5) * 9
            );
            this.particles.push({ mesh, vel, life: 0.22 + Math.random() * 0.2, maxLife: 0.42, isAmbient: false });
        }
    }

    createMuzzleFlash(position, color = 0xffcc66) {
        const light = new THREE.PointLight(color, 2.4, 10);
        light.position.copy(position);
        this.scene.add(light);
        setTimeout(() => this.scene.remove(light), 70);

        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const flash = new THREE.Mesh(this.bulletGeo, mat);
        flash.position.copy(position);
        flash.scale.setScalar(1.9);
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 55);
    }

    spawnProjectile(origin, direction, isEnemy = false, owner = null) {
        this.sound.playShoot(isEnemy);
        const color = isEnemy ? 0xff3a1a : (owner ? 0x66ffcc : 0x9dff66);
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(this.tracerGeo, mat);
        mesh.position.copy(origin);
        const dir = direction.clone().normalize();
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        this.scene.add(mesh);

        const speed = isEnemy ? 74 : (owner ? 115 : 140);
        this.createMuzzleFlash(origin, color);

        this.projectiles.push({
            mesh,
            prevPos: origin.clone(),
            vel: dir.multiplyScalar(speed),
            isEnemy,
            owner,
            gravity: 9.8,
            life: 2.0
        });
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            p.vel.y -= 15 * dt;
            p.mesh.position.addScaledVector(p.vel, dt);
            p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
            p.mesh.rotation.x += dt * 6;
            p.mesh.rotation.z += dt * 4;
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
            }
        }

        if (this.smoke) {
            const pos = this.smoke.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                let y = pos.getY(i) + this.smokeSpeeds[i] * dt;
                let x = pos.getX(i) + Math.sin(performance.now() * 0.0003 + i) * dt * 0.6;
                if (y > 26) {
                    y = 0.5;
                    x = this.smokeOrigins[i * 2] + (Math.random() - 0.5) * 9;
                    pos.setZ(i, this.smokeOrigins[i * 2 + 1] + (Math.random() - 0.5) * 9);
                }
                pos.setY(i, y);
                pos.setX(i, x);
            }
            pos.needsUpdate = true;
        }

        if (this.ash) {
            const pos = this.ash.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                let y = pos.getY(i) - this.ashSpeeds[i] * dt;
                let x = pos.getX(i) + Math.sin(performance.now() * 0.0004 + i) * dt * 0.5;
                if (y < 0) {
                    y = 52 + Math.random() * 8;
                    x = (Math.random() - 0.5) * 220;
                }
                pos.setY(i, y);
                pos.setX(i, x);
            }
            pos.needsUpdate = true;
        }

        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const s = this.shockwaves[i];
            s.life -= dt;
            const t = 1 - s.life / s.maxLife;
            s.mesh.scale.setScalar(1 + t * s.speed);
            s.mesh.material.opacity = Math.max(0, 0.85 * (1 - t));
            if (s.life <= 0) {
                this.scene.remove(s.mesh);
                this.shockwaves.splice(i, 1);
            }
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.life -= dt;
            proj.prevPos.copy(proj.mesh.position);
            proj.vel.y -= proj.gravity * dt;
            proj.mesh.position.addScaledVector(proj.vel, dt);
            proj.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), proj.vel.clone().normalize());

            let impacted = false;
            if (this.world) {
                // Colisión por segmento: evita que una bala rápida atraviese un muro fino.
                const p0 = proj.prevPos;
                const p1 = proj.mesh.position;
                const segLen = p0.distanceTo(p1);
                const subSteps = Math.max(1, Math.ceil(segLen / 0.3));
                const sample = new THREE.Vector3();

                for (let s = 1; s <= subSteps; s++) {
                    sample.lerpVectors(p0, p1, s / subSteps);
                    if (sample.y < this.world.getTerrainHeight(sample.x, sample.z) + 0.06) {
                        this.createImpact(sample.clone(), proj.isEnemy ? 0xff5a2a : 0xc9b07a, 4);
                        impacted = true;
                        break;
                    }
                    if (this.world.checkStructureCollision(sample)) {
                        this.createImpact(sample.clone(), 0xffbb66, 6);
                        impacted = true;
                        break;
                    }
                }
            }

            if (impacted || proj.life <= 0 || proj.mesh.position.y < -8) {
                this.scene.remove(proj.mesh);
                this.projectiles.splice(i, 1);
            }
        }
    }

    clearProjectiles() {
        this.projectiles.forEach(p => this.scene.remove(p.mesh));
        this.projectiles = [];
        this.shockwaves.forEach(s => this.scene.remove(s.mesh));
        this.shockwaves = [];
    }
}
