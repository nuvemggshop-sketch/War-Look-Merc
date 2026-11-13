/**
 * Mercenarios enemigos en trinchera con comportamiento de cobertura e IA táctica.
 * Solo disparan si tienen línea de visión real: el terreno y los muros bloquean sus balas.
 */
class EnemyManager {
    constructor(scene, getTerrainHeight, world) {
        this.scene = scene;
        this.getTerrainHeight = getTerrainHeight;
        this.world = world;
        this.enemies = [];
        this.maxEnemies = 26;

        // Geometrías y materiales compartidos: no se recrean por cada soldado.
        this.assets = {
            uniformMat: new THREE.MeshStandardMaterial({ color: 0x2c3327, roughness: 0.85 }),
            vestMat: new THREE.MeshStandardMaterial({ color: 0x1a1c1a, roughness: 0.7 }),
            helmetMat: new THREE.MeshStandardMaterial({ color: 0x3b352c, roughness: 0.6 }),
            visorMat: new THREE.MeshBasicMaterial({ color: 0xff2222 }),
            rifleMat: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5, metalness: 0.4 }),
            markerMat: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
            legGeo: new THREE.BoxGeometry(0.24, 0.75, 0.26),
            torsoGeo: new THREE.BoxGeometry(0.68, 0.85, 0.42),
            backpackGeo: new THREE.BoxGeometry(0.44, 0.55, 0.24),
            headGeo: new THREE.SphereGeometry(0.26, 8, 8),
            visorGeo: new THREE.BoxGeometry(0.32, 0.1, 0.12),
            rifleGeo: new THREE.BoxGeometry(0.08, 0.08, 0.95),
            markerGeo: new THREE.OctahedronGeometry(0.16, 0)
        };
    }

    spawnEnemies() {
        this.enemies.forEach(e => this.scene.remove(e.mesh));
        this.enemies = [];

        const spawnCoords = [
            { x: -55, z: -62, role: 'FUSILERO MERCENARIO' },
            { x: -20, z: -64, role: 'TIRADOR DE TRINCHERA' },
            { x: 25, z: -63, role: 'MERCENARIO DE ASALTO' },
            { x: 65, z: -60, role: 'OPERADOR PESADO' },
            { x: -70, z: -24, role: 'EXPLORADOR HOSTIL' },
            { x: -30, z: -26, role: 'FUSILERO MERCENARIO' },
            { x: 12, z: -23, role: 'GUARDIA DE SECTOR' },
            { x: 52, z: -25, role: 'MERCENARIO DE ASALTO' },
            { x: -60, z: 18, role: 'TIRADOR DE TRINCHERA' },
            { x: -18, z: 19, role: 'FUSILERO MERCENARIO' },
            { x: 28, z: 17, role: 'OPERADOR PESADO' },
            { x: 70, z: 20, role: 'EXPLORADOR HOSTIL' },
            { x: -45, z: 56, role: 'GUARDIA DE TRINCHERA' },
            { x: -10, z: 58, role: 'FUSILERO MERCENARIO' },
            { x: 35, z: 57, role: 'MERCENARIO DE ASALTO' },
            { x: 0, z: -42, role: 'COMANDANTE DE ESCUADRA' },
            { x: -40, z: -45, role: 'CENTINELA DE RUINAS' },
            { x: 47, z: -47, role: 'CENTINELA DE RUINAS' }
        ];

        spawnCoords.forEach((coord, idx) => {
            const safe = this.findValidSpawn(coord.x, coord.z);
            this.createEnemy({ x: safe.x, z: safe.z, role: coord.role }, idx);
        });
    }

    /**
     * Evita que un mercenario aparezca incrustado en sacos de arena, ruinas o torres.
     * Busca en espiral un punto libre de colisión.
     */
    findValidSpawn(x, z) {
        const isValid = (px, pz) => {
            const py = this.getTerrainHeight(px, pz) + 1.0;
            return !this.world.checkStructureCollision(new THREE.Vector3(px, py, pz));
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

    createEnemy(coord, idx) {
        const a = this.assets;
        const group = new THREE.Group();

        const leftLeg = new THREE.Mesh(a.legGeo, a.uniformMat);
        leftLeg.position.set(-0.18, 0.38, 0);
        group.add(leftLeg);

        const rightLeg = new THREE.Mesh(a.legGeo, a.uniformMat);
        rightLeg.position.set(0.18, 0.38, 0);
        group.add(rightLeg);

        const torso = new THREE.Mesh(a.torsoGeo, a.vestMat);
        torso.position.y = 1.15;
        group.add(torso);

        const backpack = new THREE.Mesh(a.backpackGeo, a.vestMat);
        backpack.position.set(0, 1.2, 0.3);
        group.add(backpack);

        const head = new THREE.Mesh(a.headGeo, a.helmetMat);
        head.position.y = 1.78;
        group.add(head);

        const visor = new THREE.Mesh(a.visorGeo, a.visorMat);
        visor.position.set(0, 1.78, 0.22);
        group.add(visor);

        const rifle = new THREE.Mesh(a.rifleGeo, a.rifleMat);
        rifle.position.set(0.28, 1.18, 0.32);
        group.add(rifle);

        const marker = new THREE.Mesh(a.markerGeo, a.markerMat);
        marker.position.y = 2.35;
        group.add(marker);

        // Solo torso y cabeza proyectan sombra: menos draw calls en el shadow pass.
        torso.castShadow = true;
        head.castShadow = true;

        const groundY = this.getTerrainHeight(coord.x, coord.z);
        group.position.set(coord.x, groundY, coord.z);
        this.scene.add(group);

        this.enemies.push({
            id: idx,
            role: coord.role,
            mesh: group,
            leftLeg,
            rightLeg,
            torso,
            head,
            rifle,
            marker,
            position: group.position,
            originX: coord.x,
            originZ: coord.z,
            patrolDir: idx % 2 === 0 ? 1 : -1,
            walkPhase: Math.random() * Math.PI * 2,
            hp: 25,
            maxHp: 25,
            alive: true,
            state: 'PATRULLA',
            thinkTimer: Math.random() * 0.4,
            fireTimer: 1.2 + Math.random() * 2.2,
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
            threateningPlayer: false
        });
    }

    reinforce(count = 3) {
        if (this.enemies.filter(e => e.alive).length >= this.maxEnemies) return 0;

        const roles = ['FUSILERO MERCENARIO', 'MERCENARIO DE ASALTO', 'TIRADOR DE TRINCHERA', 'EXPLORADOR HOSTIL'];
        let spawned = 0;
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 130;
            const z = -82 - Math.random() * 16;
            const idx = this.enemies.length;
            this.createEnemy({ x, z, role: roles[Math.floor(Math.random() * roles.length)] }, idx);
            spawned++;
        }
        return spawned;
    }

    destroyEnemy(enemy, effectsManager) {
        if (!enemy.alive) return;
        enemy.alive = false;
        enemy.state = 'CAÍDO';
        enemy.deathTimer = 1.25;
        enemy.deathGroundY = enemy.position.y;
        enemy.marker.visible = false;
        effectsManager.createExplosion(enemy.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff3300, 18);
    }

    damageEnemy(enemy, amount, effectsManager) {
        if (!enemy.alive) return false;
        enemy.hp -= amount;
        enemy.flinch = 0.16;
        if (enemy.hp <= 0) {
            this.destroyEnemy(enemy, effectsManager);
            return true;
        }
        return false;
    }

    updateDeath(enemy, dt) {
        if (enemy.removed) return;
        enemy.deathTimer -= dt;
        enemy.mesh.rotation.z = Math.min(Math.PI / 2, enemy.mesh.rotation.z + dt * 4);
        enemy.position.y = Math.max(enemy.deathGroundY - 0.25, enemy.position.y - dt * 0.9);
        if (enemy.deathTimer <= 0) {
            this.scene.remove(enemy.mesh);
            enemy.removed = true;
        }
    }

    think(enemy, playerDrone, allies, playerActive) {
        const muzzle = enemy.position.clone().add(new THREE.Vector3(0, 1.25, 0));
        let best = null;
        let bestDist = Infinity;

        if (playerActive) {
            const d = enemy.position.distanceTo(playerDrone.position);
            if (d < 78 && this.world.hasLineOfSight(muzzle, playerDrone.position)) {
                best = { type: 'player', pos: playerDrone.position.clone(), dist: d };
                bestDist = d;
            }
        }

        allies.forEach(ally => {
            if (!ally.alive) return;
            const d = enemy.position.distanceTo(ally.position);
            if (d >= bestDist || d > 68) return;
            const allyChest = ally.position.clone().add(new THREE.Vector3(0, 1.1, 0));
            if (this.world.hasLineOfSight(muzzle, allyChest)) {
                best = { type: 'ally', pos: allyChest, dist: d };
                bestDist = d;
            }
        });

        if (best) {
            enemy.targetPos = best.pos;
            enemy.targetType = best.type;
            enemy.targetDist = best.dist;
            enemy.los = true;
            enemy.lastSeenPos = best.pos.clone();
            enemy.threateningPlayer = best.type === 'player';
        } else {
            enemy.los = false;
            enemy.threateningPlayer = false;
            if (enemy.lastSeenPos) {
                enemy.targetPos = enemy.lastSeenPos.clone();
                enemy.targetType = null;
                enemy.targetDist = enemy.position.distanceTo(enemy.lastSeenPos);
            } else {
                enemy.targetPos = null;
            }
        }
    }

    fireAt(enemy, playerDrone, effectsManager) {
        const muzzle = enemy.position.clone().add(new THREE.Vector3(0, enemy.torso.position.y + 0.08, 0));
        const aim = enemy.targetPos.clone();

        // Predicción sencilla del movimiento del dron y compensación de caída por gravedad
        if (enemy.targetType === 'player') {
            const flightTime = muzzle.distanceTo(aim) / 74;
            aim.addScaledVector(playerDrone.velocity, flightTime * 0.32);
        }
        const dist = muzzle.distanceTo(aim);
        const flightTime = dist / 74;
        aim.y += 0.5 * 9.8 * flightTime * flightTime;

        const dir = aim.sub(muzzle).normalize();
        dir.x += (Math.random() - 0.5) * 0.055;
        dir.y += (Math.random() - 0.5) * 0.045;
        dir.z += (Math.random() - 0.5) * 0.055;
        dir.normalize();

        effectsManager.spawnProjectile(muzzle, dir, true, { enemy });
    }

    update(dt, playerDrone, effectsManager, allies = [], playerActive = true) {
        let underFireWarning = false;

        this.enemies.forEach(enemy => {
            if (!enemy.alive) {
                this.updateDeath(enemy, dt);
                return;
            }

            enemy.flinch = Math.max(0, enemy.flinch - dt);
            enemy.marker.rotation.y += dt * 4;
            enemy.marker.position.y = 2.35 + Math.sin(performance.now() * 0.003 + enemy.id) * 0.08;

            enemy.thinkTimer -= dt;
            if (enemy.thinkTimer <= 0) {
                enemy.thinkTimer = 0.16 + Math.random() * 0.18;
                this.think(enemy, playerDrone, allies, playerActive);
            }

            if (enemy.los && enemy.targetPos && enemy.targetDist < 74) {
                enemy.state = 'COMBATE';
                const lookTarget = new THREE.Vector3(enemy.targetPos.x, enemy.position.y, enemy.targetPos.z);
                enemy.mesh.lookAt(lookTarget);

                // Se agacha al recibir fuego cercano o si está herido
                const crouch = enemy.targetDist < 24 || enemy.hp < 12;
                enemy.torso.position.y += ((crouch ? 0.86 : 1.15) - enemy.torso.position.y) * 8 * dt;
                enemy.head.position.y = enemy.torso.position.y + 0.63;
                enemy.rifle.position.y = enemy.torso.position.y + 0.03;
                enemy.rifle.rotation.x = -0.08 + (crouch ? 0.18 : 0);

                enemy.leftLeg.rotation.x *= 0.85;
                enemy.rightLeg.rotation.x *= 0.85;

                enemy.fireTimer -= dt;
                if (enemy.burstLeft <= 0 && enemy.fireTimer <= 0) {
                    enemy.burstLeft = 2 + Math.floor(Math.random() * 3);
                    enemy.burstTimer = 0;
                    enemy.fireTimer = 1.6 + Math.random() * 1.2;
                }
                if (enemy.burstLeft > 0) {
                    enemy.burstTimer -= dt;
                    if (enemy.burstTimer <= 0) {
                        this.fireAt(enemy, playerDrone, effectsManager);
                        enemy.burstLeft--;
                        enemy.burstTimer = 0.14 + Math.random() * 0.08;
                    }
                }

                if (enemy.threateningPlayer) underFireWarning = true;
            } else {
                enemy.state = enemy.targetPos ? 'REPOSICIONAR' : 'PATRULLA';
                enemy.torso.position.y += (1.15 - enemy.torso.position.y) * 6 * dt;
                enemy.head.position.y = enemy.torso.position.y + 0.63;
                enemy.rifle.position.y = enemy.torso.position.y + 0.03;

                enemy.walkPhase += dt * 5;
                let moveDir;

                if (enemy.targetPos) {
                    // Intenta flanquear el obstáculo que bloquea la visión
                    const toTarget = enemy.targetPos.clone().sub(enemy.position);
                    toTarget.y = 0;
                    if (toTarget.lengthSq() > 0.001) toTarget.normalize();
                    const perp = new THREE.Vector3(-toTarget.z, 0, toTarget.x).multiplyScalar(enemy.strafeDir);
                    moveDir = toTarget.multiplyScalar(0.35).add(perp.multiplyScalar(0.9)).normalize();
                } else {
                    moveDir = new THREE.Vector3(enemy.patrolDir, 0, 0);
                    if (Math.abs(enemy.position.x - enemy.originX) > 9) {
                        enemy.patrolDir *= -1;
                        moveDir.x = enemy.patrolDir;
                    }
                }

                const speed = enemy.targetPos ? 3.4 : 2.2;
                const nextPos = enemy.position.clone().addScaledVector(moveDir, speed * dt);
                nextPos.y = this.getTerrainHeight(nextPos.x, nextPos.z);

                if (!this.world.checkStructureCollision(nextPos)) {
                    enemy.position.copy(nextPos);
                } else {
                    enemy.strafeDir *= -1;
                }

                enemy.mesh.rotation.y = Math.atan2(moveDir.x, moveDir.z);
                enemy.leftLeg.rotation.x = Math.sin(enemy.walkPhase) * 0.5;
                enemy.rightLeg.rotation.x = -Math.sin(enemy.walkPhase) * 0.5;
            }

            if (enemy.flinch > 0) {
                enemy.mesh.rotation.z = Math.sin(performance.now() * 0.06) * 0.12 * (enemy.flinch / 0.16);
            } else {
                enemy.mesh.rotation.z *= 0.85;
            }
        });

        return underFireWarning;
    }

    getAliveCount() {
        return this.enemies.filter(e => e.alive).length;
    }
}
