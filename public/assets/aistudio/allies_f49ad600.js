/**
 * Escuadrón amigo: soldados aliados con IA que cubren la trinchera,
 * patrullan el sector y abren fuego contra los mercenarios enemigos.
 * Si un amigo cae, se reincorpora al combate tras unos segundos.
 */
class AllyManager {
    constructor(scene, getTerrainHeight, world) {
        this.scene = scene;
        this.getTerrainHeight = getTerrainHeight;
        this.world = world;
        this.allies = [];
        this.allyLosses = 0;
        this.onAllyDown = null;
        this.onAllyCallout = null;

        this.definitions = [
            { name: 'CABO RÍOS', home: { x: -10, z: 86 } },
            { name: 'SOLDADO VEGA', home: { x: 10, z: 84 } },
            { name: 'SOLDADO MÉNDEZ', home: { x: -18, z: 78 } },
            { name: 'SOLDADO TORRES', home: { x: 18, z: 80 } }
        ];

        // Assets compartidos para todo el escuadrón.
        this.assets = {
            uniformMat: new THREE.MeshStandardMaterial({ color: 0x3a4a35, roughness: 0.85 }),
            vestMat: new THREE.MeshStandardMaterial({ color: 0x232b22, roughness: 0.7 }),
            helmetMat: new THREE.MeshStandardMaterial({ color: 0x46523f, roughness: 0.6 }),
            visorMat: new THREE.MeshBasicMaterial({ color: 0x00ff66 }),
            rifleMat: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5, metalness: 0.4 }),
            markerMat: new THREE.MeshBasicMaterial({ color: 0x00ff66 }),
            legGeo: new THREE.BoxGeometry(0.24, 0.75, 0.26),
            torsoGeo: new THREE.BoxGeometry(0.68, 0.85, 0.42),
            backpackGeo: new THREE.BoxGeometry(0.44, 0.52, 0.24),
            headGeo: new THREE.SphereGeometry(0.26, 8, 8),
            visorGeo: new THREE.BoxGeometry(0.32, 0.1, 0.12),
            rifleGeo: new THREE.BoxGeometry(0.08, 0.08, 0.95),
            markerGeo: new THREE.OctahedronGeometry(0.2, 0)
        };
    }

    spawnSquad() {
        this.allies.forEach(a => this.scene.remove(a.mesh));
        this.allies = [];
        this.allyLosses = 0;

        const a = this.assets;

        this.definitions.forEach((def, idx) => {
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

            // Marcador verde flotante para identificar a los amigos a distancia
            const marker = new THREE.Mesh(a.markerGeo, a.markerMat);
            marker.position.y = 2.15;
            group.add(marker);

            const label = this.makeLabelSprite(def.name);
            label.position.y = 2.8;
            group.add(label);

            // Solo torso y cabeza proyectan sombra: menos draw calls en el shadow pass.
            torso.castShadow = true;
            head.castShadow = true;

            const groundY = this.getTerrainHeight(def.home.x, def.home.z);
            group.position.set(def.home.x, groundY, def.home.z);
            this.scene.add(group);

            this.allies.push({
                id: idx,
                name: def.name,
                mesh: group,
                leftLeg,
                rightLeg,
                torso,
                head,
                rifle,
                marker,
                label,
                position: group.position,
                home: new THREE.Vector3(def.home.x, groundY, def.home.z),
                patrolDir: idx % 2 === 0 ? 1 : -1,
                walkPhase: Math.random() * Math.PI * 2,
                hp: 120,
                maxHp: 120,
                alive: true,
                state: 'PATRULLA',
                downTimer: 0,
                downGroundY: groundY,
                lastHitTime: 99,
                fireTimer: 1.0 + Math.random() * 1.6,
                burstLeft: 0,
                burstTimer: 0,
                reactionTimer: 0,
                thinkTimer: Math.random() * 0.3,
                flinch: 0,
                targetEnemy: null,
                targetPos: null,
                advanceGoal: new THREE.Vector3(def.home.x, groundY, def.home.z),
                maxAdvance: 46 + (idx % 2) * 9,
                los: false,
                strafeDir: idx % 2 === 0 ? 1 : -1,
                calloutTimer: 0,
                scanPhase: Math.random() * Math.PI * 2
            });
        });
    }

    makeLabelSprite(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const texture = new THREE.CanvasTexture(canvas);

        ctx.font = 'bold 26px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(18, 10, 220, 44);
        ctx.strokeStyle = 'rgba(0, 255, 102, 0.85)';
        ctx.lineWidth = 2;
        ctx.strokeRect(18, 10, 220, 44);
        ctx.fillStyle = '#9dffbe';
        ctx.fillText(text, 128, 33);
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2.6, 0.65, 1);
        sprite.renderOrder = 10;
        return sprite;
    }

    callout(ally, text) {
        if (ally.calloutTimer > 0) return;
        ally.calloutTimer = 7 + Math.random() * 4;
        if (this.onAllyCallout) this.onAllyCallout(ally, text);
    }

    damageAlly(ally, amount, effectsManager) {
        if (!ally.alive) return false;

        ally.hp -= amount;
        ally.lastHitTime = 0;
        ally.flinch = 0.22;
        ally.state = 'CUBIERTO';
        this.callout(ally, '¡Contacto! ¡Busco cobertura!');

        if (ally.hp > 0) return false;

        ally.alive = false;
        ally.state = 'CAÍDO';
        ally.downTimer = 12;
        ally.downGroundY = ally.position.y;
        ally.marker.visible = false;
        ally.label.material.opacity = 0.4;
        this.allyLosses++;

        if (effectsManager) {
            effectsManager.createExplosion(ally.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x884422, 10);
        }
        if (this.onAllyDown) this.onAllyDown(ally);
        return true;
    }

    reviveAlly(ally) {
        ally.alive = true;
        ally.hp = ally.maxHp;
        ally.downTimer = 0;
        ally.state = 'PATRULLA';
        ally.lastHitTime = 99;
        ally.fireTimer = 1.2 + Math.random() * 1.2;
        ally.marker.visible = true;
        ally.label.material.opacity = 1;
        ally.mesh.rotation.z = 0;
        ally.position.copy(ally.home);
        ally.position.y = this.getTerrainHeight(ally.position.x, ally.position.z);
        ally.downGroundY = ally.position.y;
        ally.mesh.visible = true;
        this.callout(ally, '¡Estoy en pie, cubriendo!');
    }

    /**
     * Calcula un punto de avance hacia el enemigo, manteniendo una distancia
     * de combate y sin alejarse demasiado de la línea de origen.
     */
    computeAdvanceGoal(ally, enemy, desiredDistance) {
        const fromHome = enemy.position.clone().sub(ally.home);
        fromHome.y = 0;
        if (fromHome.lengthSq() < 0.01) return ally.home.clone();
        fromHome.normalize();

        const goal = enemy.position.clone().addScaledVector(fromHome, -desiredDistance);
        const offset = (ally.id - 1.5) * 2.6;
        goal.x += -fromHome.z * offset;
        goal.z += fromHome.x * offset;

        const fromHomeToGoal = goal.clone().sub(ally.home);
        fromHomeToGoal.y = 0;
        if (fromHomeToGoal.length() > ally.maxAdvance) {
            fromHomeToGoal.setLength(ally.maxAdvance);
            goal.copy(ally.home).add(fromHomeToGoal);
        }

        goal.y = this.getTerrainHeight(goal.x, goal.z);
        return goal;
    }

    think(ally, enemies) {
        const chest = ally.position.clone().add(new THREE.Vector3(0, 1.15, 0));
        let best = null;
        let bestScore = Infinity;
        let nearest = null;
        let nearestDist = Infinity;

        enemies.forEach(enemy => {
            if (!enemy.alive) return;
            const d = ally.position.distanceTo(enemy.position);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = enemy;
            }
            if (d > 64) return;
            const enemyChest = enemy.position.clone().add(new THREE.Vector3(0, 1.15, 0));
            if (!this.world.hasLineOfSight(chest, enemyChest)) return;

            // Prioriza a los mercenarios que están amenazando al piloto
            const score = d + (enemy.threateningPlayer ? -14 : 0);
            if (score < bestScore) {
                bestScore = score;
                best = enemy;
            }
        });

        if (best) {
            if (!ally.los || ally.targetEnemy !== best) {
                ally.reactionTimer = 0.22 + Math.random() * 0.18;
                this.callout(ally, '¡Enemigo a la vista, abriendo fuego!');
            }
            ally.targetEnemy = best;
            ally.targetPos = best.position.clone().add(new THREE.Vector3(0, 1.15, 0));
            ally.targetDist = bestScore;
            ally.advanceGoal = this.computeAdvanceGoal(ally, best, 17);
            ally.los = true;
            ally.state = 'COMBATE';
        } else {
            ally.los = false;
            ally.targetEnemy = null;
            ally.targetPos = null;

            if (ally.lastHitTime < 4.5) {
                ally.state = 'CUBIERTO';
            } else if (nearest && nearestDist < 105) {
                // Sin línea de visión: avanza y flanquea hacia el enemigo más cercano.
                ally.advanceGoal = this.computeAdvanceGoal(ally, nearest, 20);
                ally.state = 'AVANZAR';
            } else {
                ally.advanceGoal = ally.home.clone();
                ally.state = 'PATRULLA';
            }
        }
    }

    /**
     * Desplaza al aliado hacia un objetivo, evitando muros.
     * Si faceTarget es true no toca la rotación (se usa en combate).
     */
    moveToward(ally, goal, speed, dt, faceTarget = false) {
        const toGoal = goal.clone().sub(ally.position);
        toGoal.y = 0;
        const dist = toGoal.length();

        if (dist > 1.6) {
            toGoal.normalize();
            const next = ally.position.clone().addScaledVector(toGoal, speed * dt);
            next.y = this.getTerrainHeight(next.x, next.z);

            if (!this.world.checkStructureCollision(next)) {
                ally.position.copy(next);
            } else {
                // Deslizamiento lateral si el camino está bloqueado
                const side = new THREE.Vector3(-toGoal.z, 0, toGoal.x).multiplyScalar(ally.strafeDir);
                const slide = ally.position.clone().addScaledVector(side, speed * 0.7 * dt);
                slide.y = this.getTerrainHeight(slide.x, slide.z);
                if (!this.world.checkStructureCollision(slide)) ally.position.copy(slide);
                else ally.strafeDir *= -1;
            }

            if (!faceTarget) ally.mesh.rotation.y = Math.atan2(toGoal.x, toGoal.z);
            ally.walkPhase += dt * 6.5;
            ally.leftLeg.rotation.x = Math.sin(ally.walkPhase) * 0.55;
            ally.rightLeg.rotation.x = -Math.sin(ally.walkPhase) * 0.55;
            return true;
        }

        ally.leftLeg.rotation.x *= 0.8;
        ally.rightLeg.rotation.x *= 0.8;
        return false;
    }

    fireAt(ally, effectsManager) {
        const muzzle = ally.position.clone().add(new THREE.Vector3(0, ally.torso.position.y + 0.05, 0));
        const aim = ally.targetPos.clone();
        const dist = muzzle.distanceTo(aim);
        const flightTime = dist / 115;
        aim.y += 0.5 * 9.8 * flightTime * flightTime;

        const dir = aim.sub(muzzle).normalize();
        dir.x += (Math.random() - 0.5) * 0.035;
        dir.y += (Math.random() - 0.5) * 0.03;
        dir.z += (Math.random() - 0.5) * 0.035;
        dir.normalize();

        effectsManager.spawnProjectile(muzzle, dir, false, { ally });
    }

    update(dt, enemies, playerDrone, effectsManager) {
        this.allies.forEach(ally => {
            ally.calloutTimer = Math.max(0, ally.calloutTimer - dt);
            ally.flinch = Math.max(0, ally.flinch - dt);

            if (!ally.alive) {
                ally.downTimer -= dt;
                ally.mesh.rotation.z = Math.min(Math.PI / 2, ally.mesh.rotation.z + dt * 3.5);
                ally.position.y = Math.max(ally.downGroundY - 0.3, ally.position.y - dt * 0.8);
                if (ally.downTimer <= 0) this.reviveAlly(ally);
                return;
            }

            ally.lastHitTime += dt;
            ally.marker.rotation.y += dt * 3;
            ally.marker.position.y = 2.15 + Math.sin(performance.now() * 0.004 + ally.id) * 0.12;

            ally.thinkTimer -= dt;
            if (ally.thinkTimer <= 0) {
                ally.thinkTimer = 0.18 + Math.random() * 0.16;
                this.think(ally, enemies);
            }

            if (ally.los && ally.targetPos) {
                ally.state = 'COMBATE';
                const lookTarget = new THREE.Vector3(ally.targetPos.x, ally.position.y, ally.targetPos.z);
                ally.mesh.lookAt(lookTarget);

                // Se agacha si está herido, pero sigue disparando
                const crouch = ally.hp < 48;
                ally.torso.position.y += ((crouch ? 0.9 : 1.15) - ally.torso.position.y) * 8 * dt;
                ally.head.position.y = ally.torso.position.y + 0.63;
                ally.rifle.position.y = ally.torso.position.y + 0.03;
                ally.rifle.rotation.x = -0.06 + (crouch ? 0.2 : 0);

                // Avanza hacia el enemigo si aún está lejos, manteniendo el fuego.
                const advancing = ally.targetDist > 24 &&
                    this.moveToward(ally, ally.advanceGoal, 3.2, dt, true);
                if (!advancing) {
                    ally.leftLeg.rotation.x *= 0.85;
                    ally.rightLeg.rotation.x *= 0.85;
                }

                ally.reactionTimer = Math.max(0, ally.reactionTimer - dt);
                ally.fireTimer -= dt;
                if (ally.reactionTimer <= 0 && ally.burstLeft <= 0 && ally.fireTimer <= 0) {
                    ally.burstLeft = 2 + Math.floor(Math.random() * 3);
                    ally.burstTimer = 0;
                    ally.fireTimer = 1.5 + Math.random() * 1.1;
                }
                if (ally.reactionTimer <= 0 && ally.burstLeft > 0) {
                    ally.burstTimer -= dt;
                    if (ally.burstTimer <= 0) {
                        this.fireAt(ally, effectsManager);
                        ally.burstLeft--;
                        ally.burstTimer = 0.12 + Math.random() * 0.07;
                    }
                }
            } else if (ally.state === 'CUBIERTO') {
                // Retrocede a su cobertura y se recupera lentamente
                this.moveToward(ally, ally.home, 4.2, dt);

                ally.torso.position.y += (0.92 - ally.torso.position.y) * 6 * dt;
                ally.head.position.y = ally.torso.position.y + 0.63;
                ally.rifle.position.y = ally.torso.position.y + 0.03;

                if (ally.lastHitTime > 4.5 && ally.hp < ally.maxHp) {
                    ally.hp = Math.min(ally.maxHp, ally.hp + 5 * dt);
                }
                if (ally.lastHitTime > 6 && ally.hp >= ally.maxHp * 0.85) {
                    ally.state = 'PATRULLA';
                }
            } else if (ally.state === 'AVANZAR') {
                // Avanza hacia el enemigo sin línea de visión para flanquearlo.
                const moving = this.moveToward(ally, ally.advanceGoal, 3.8, dt);
                if (!moving) {
                    ally.leftLeg.rotation.x *= 0.8;
                    ally.rightLeg.rotation.x *= 0.8;
                }

                ally.torso.position.y += (1.15 - ally.torso.position.y) * 6 * dt;
                ally.head.position.y = ally.torso.position.y + 0.63;
                ally.rifle.position.y = ally.torso.position.y + 0.03;

                ally.scanPhase += dt * 2.2;
                ally.head.rotation.y = Math.sin(ally.scanPhase) * 0.35;
            } else {
                // PATRULLA: regresa a la línea si se alejó; si no, vigila el sector.
                const distToHome = Math.hypot(ally.position.x - ally.home.x, ally.position.z - ally.home.z);
                if (distToHome > 4) {
                    this.moveToward(ally, ally.home, 2.8, dt);
                } else {
                    ally.walkPhase += dt * 4.5;
                    const nextX = ally.position.x + ally.patrolDir * 1.7 * dt;
                    if (Math.abs(nextX - ally.home.x) > 5.5) ally.patrolDir *= -1;

                    const next = new THREE.Vector3(nextX, 0, ally.position.z);
                    next.y = this.getTerrainHeight(next.x, next.z);
                    if (!this.world.checkStructureCollision(next)) ally.position.copy(next);

                    ally.mesh.rotation.y = ally.patrolDir > 0 ? Math.PI / 2 : -Math.PI / 2;
                    ally.leftLeg.rotation.x = Math.sin(ally.walkPhase) * 0.4;
                    ally.rightLeg.rotation.x = -Math.sin(ally.walkPhase) * 0.4;
                }

                ally.torso.position.y += (1.15 - ally.torso.position.y) * 6 * dt;
                ally.head.position.y = ally.torso.position.y + 0.63;
                ally.rifle.position.y = ally.torso.position.y + 0.03;

                // Escanea el horizonte mientras patrulla
                ally.scanPhase += dt * 1.4;
                ally.head.rotation.y = Math.sin(ally.scanPhase) * 0.45;
            }

            if (ally.state === 'COMBATE') {
                ally.head.rotation.y *= 0.85;
            }

            if (ally.flinch > 0) {
                ally.mesh.rotation.z = Math.sin(performance.now() * 0.07) * 0.14 * (ally.flinch / 0.22);
            } else {
                ally.mesh.rotation.z *= 0.85;
            }
        });
    }

    getAllies() {
        return this.allies;
    }

    getAliveCount() {
        return this.allies.filter(a => a.alive).length;
    }
}
