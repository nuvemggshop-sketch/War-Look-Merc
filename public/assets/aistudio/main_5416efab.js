class FPVSimulator {
    constructor() {
        this.container = document.getElementById('canvas-container');

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x181715);
        this.scene.fog = new THREE.FogExp2(0x1c1a18, 0.011);

        this.camera = new THREE.PerspectiveCamera(95, window.innerWidth / window.innerHeight, 0.1, 350);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.basePixelRatio = Math.min(window.devicePixelRatio, 1.5);
        this.pixelRatio = this.basePixelRatio;
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.12;
        this.container.appendChild(this.renderer.domElement);

        // Monitor de rendimiento para resolución adaptativa y HUD limitado
        this.fpsAccum = 0;
        this.fpsFrames = 0;
        this.hudAccum = 0;
        this.currentFps = 60;

        this.maxDrones = 8;
        this.cameraShake = 0;
        this.reinforcementTimer = 42;
        this.state = {
            running: false,
            respawning: false,
            dronesRemaining: this.maxDrones,
            maxDrones: this.maxDrones,
            elapsedTime: 0,
            score: 0,
            enemiesDestroyed: 0,
            underFire: false
        };

        this.sound = new SoundManager();
        this.notifications = new NotificationManager(this.sound);
        this.ui = new UIManager();
        this.effects = new EffectsManager(this.scene, this.sound);
        this.world = new BattlefieldWorld(this.scene);
        this.trenchView = new TrenchViewManager(this.scene, this.camera);

        this.controls = new ControlManager(this.renderer.domElement, (conn, name) => {
            this.ui.updateGamepadStatus(conn, name);
        });

        this.setupLighting();
        this.world.build();
        this.effects.setWorld(this.world);
        this.effects.onExplosion = (position, power) => {
            const dist = position.distanceTo(this.camera.position);
            if (dist < 70) this.cameraShake = Math.max(this.cameraShake, Math.min(1.2, power / 40) * (1 - dist / 70));
        };

        this.playerDrone = new PlayerDrone(this.scene, this.camera, this.sound);
        this.targetManager = new TargetManager(this.scene, (x, z) => this.world.getTerrainHeight(x, z));
        this.enemyManager = new EnemyManager(this.scene, (x, z) => this.world.getTerrainHeight(x, z), this.world);
        this.allyManager = new AllyManager(this.scene, (x, z) => this.world.getTerrainHeight(x, z), this.world);
        this.allyManager.onAllyDown = (ally) => {
            this.notifications.showRadioMessage(`¡${ally.name} ha caído! El escuadrón amigo mantiene la línea.`, 4500);
        };
        this.allyManager.onAllyCallout = (ally, text) => {
            this.notifications.notifyAllyStatus(ally.name, text);
        };

        this.bindEvents();
        this.clock = new THREE.Clock();

        this.renderer.render(this.scene, this.camera);
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    setupLighting() {
        const hemiLight = new THREE.HemisphereLight(0x8a7c6a, 0x241f1b, 0.85);
        this.scene.add(hemiLight);

        const ambient = new THREE.AmbientLight(0x4a4038, 0.35);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffc08a, 1.35);
        dirLight.position.set(65, 95, 45);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(1024, 1024);
        dirLight.shadow.camera.left = -95;
        dirLight.shadow.camera.right = 95;
        dirLight.shadow.camera.top = 95;
        dirLight.shadow.camera.bottom = -95;
        dirLight.shadow.camera.near = 1;
        dirLight.shadow.camera.far = 240;
        dirLight.shadow.bias = -0.0008;
        this.scene.add(dirLight);

        // Luz cálida desde el horizonte para separar siluetas del fondo
        const rimLight = new THREE.DirectionalLight(0xff6a2a, 0.45);
        rimLight.position.set(-70, 25, -90);
        this.scene.add(rimLight);

        // Solo dos focos de fuego: menos luces dinámicas = shader más barato
        const fireCoords = [[-45, 4, -40], [50, 4, -65]];
        fireCoords.forEach(([x, y, z]) => {
            const fireLight = new THREE.PointLight(0xff5500, 2.4, 55);
            fireLight.position.set(x, y, z);
            this.scene.add(fireLight);
        });
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        document.getElementById('btn-start').addEventListener('click', () => this.startMission());
        document.getElementById('btn-restart').addEventListener('click', () => this.startMission());
    }

    startMission() {
        this.sound.init();
        this.effects.clearProjectiles();
        this.notifications.clear();
        this.trenchView.hide();

        this.state.running = true;
        this.state.respawning = false;
        this.state.dronesRemaining = this.maxDrones;
        this.state.elapsedTime = 0;
        this.state.score = 0;
        this.state.enemiesDestroyed = 0;
        this.state.underFire = false;
        this.cameraShake = 0;
        this.reinforcementTimer = 42;

        this.playerDrone.reset();
        this.targetManager.spawnTargets();
        this.enemyManager.spawnEnemies();
        this.allyManager.spawnSquad();
        this.ui.resetSquad();
        this.ui.updateSquad(this.allyManager.getAllies());

        this.ui.updateDroneStock(this.state.dronesRemaining, this.maxDrones);
        this.ui.showHUD();

        this.notifications.showRadioMessage("¡Comando en línea! Sectores hostiles detectados. Tu escuadrón amigo cubre el flanco. Despliega tu primer FPV.");

        if (this.renderer.domElement.requestPointerLock) {
            this.renderer.domElement.requestPointerLock();
        }
    }

    /**
     * Gestiona la detonación del dron y transporta la cámara a la trinchera con los soldados aliados
     */
    handleDroneDetonation(impactPosition, reasonTitle) {
        if (!this.state.running || this.state.respawning) return;

        this.effects.createExplosion(impactPosition, 0xff4400, 42);
        this.cameraShake = Math.max(this.cameraShake, 0.9);

        // Daño en área (Radio de 8m)
        const blastRadius = 8.0;
        this.enemyManager.enemies.forEach(enemy => {
            if (enemy.alive && enemy.position.distanceTo(impactPosition) <= blastRadius) {
                this.enemyManager.destroyEnemy(enemy, this.effects);
                this.state.enemiesDestroyed++;
                this.state.score += 350;
                this.notifications.notifyKill(`EXPLOSIÓN DE ÁREA: ${enemy.role}`, 350);
            }
        });

        this.targetManager.targets.forEach(target => {
            if (!target.destroyed && target.position.distanceTo(impactPosition) <= target.radius + 3.0) {
                const destroyed = this.targetManager.damageTarget(target, 100, this.effects);
                if (destroyed) {
                    this.state.score += 750;
                    this.notifications.notifyKill(`ESTRUCTURA DESTRUIDA: ${target.name}`, 750);
                }
            }
        });

        this.state.dronesRemaining--;
        this.ui.updateDroneStock(this.state.dronesRemaining, this.maxDrones);

        if (this.state.dronesRemaining <= 0) {
            this.notifications.showRadioMessage("¡No quedan más drones en reserva! Posición sobrepasada.");
            this.endMission(false, 'Has agotado todos los drones FPV de tu mochila táctica.');
            return;
        }

        this.state.respawning = true;
        this.sound.updateEngine(0, false, true);
        this.controls.releasePointer();

        const radioMsgs = [
            "¡Buen impacto, soldado! Recupera la posición en trinchera y prepara el siguiente FPV.",
            "¡Explosión limpia! Vuelve al búnker, respira y despliega otra unidad cuando estés listo.",
            "¡Buen trabajo! Los aliados cubren tu sector. Lanza el próximo dron desde la trinchera."
        ];
        const msg = radioMsgs[Math.floor(Math.random() * radioMsgs.length)];
        this.notifications.showRadioMessage(msg, 6000);

        // Mostrar vista de trinchera con soldados aliados
        this.trenchView.show(this.state.dronesRemaining, reasonTitle, () => {
            this.playerDrone.reset();
            this.notifications.hideStatic();
            this.state.respawning = false;
            this.ui.showHUD();
            if (this.renderer.domElement.requestPointerLock) {
                this.renderer.domElement.requestPointerLock();
            }
        }, this.allyManager.getAllies());
    }

    endMission(victory, reason) {
        this.state.running = false;
        this.state.respawning = false;
        this.sound.stopEngine();
        this.notifications.clear();
        this.trenchView.hide();
        this.controls.releasePointer();

        const destroyedCount = this.targetManager.getDestroyedCount();
        const allyStats = {
            alive: this.allyManager.getAliveCount(),
            total: this.allyManager.getAllies().length,
            losses: this.allyManager.allyLosses
        };
        this.ui.showEndScreen(victory, reason, this.state, destroyedCount, this.targetManager.totalTargets, allyStats);
    }

    segmentHitsSphere(p0, p1, center, radius) {
        const d = new THREE.Vector3().subVectors(p1, p0);
        const f = new THREE.Vector3().subVectors(p0, center);
        const a = d.dot(d);
        if (a < 1e-8) return f.lengthSq() <= radius * radius;
        const b = 2 * f.dot(d);
        const c = f.dot(f) - radius * radius;
        let disc = b * b - 4 * a * c;
        if (disc < 0) return false;
        disc = Math.sqrt(disc);
        const t1 = (-b - disc) / (2 * a);
        const t2 = (-b + disc) / (2 * a);
        return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
    }

    checkCollisions() {
        const playerPos = this.playerDrone.position;
        const playerActive = !this.state.respawning;

        for (let i = this.effects.projectiles.length - 1; i >= 0; i--) {
            const proj = this.effects.projectiles[i];
            const p0 = proj.prevPos || proj.mesh.position;
            const p1 = proj.mesh.position;
            let hit = false;

            if (proj.isEnemy) {
                if (playerActive && this.segmentHitsSphere(p0, p1, playerPos, 1.15)) {
                    this.playerDrone.takeDamage(16);
                    this.ui.triggerDamageFlash();
                    this.effects.createImpact(p1, 0xff5522, 5);
                    this.cameraShake = Math.max(this.cameraShake, 0.22);
                    hit = true;
                } else {
                    // El fuego hostil también puede alcanzar a los amigos del escuadrón
                    for (const ally of this.allyManager.getAllies()) {
                        if (!ally.alive) continue;
                        const allyCenter = ally.position.clone().add(new THREE.Vector3(0, 0.95, 0));
                        if (this.segmentHitsSphere(p0, p1, allyCenter, 1.05)) {
                            this.allyManager.damageAlly(ally, 18, this.effects);
                            this.effects.createImpact(p1, 0xff5522, 5);
                            hit = true;
                            break;
                        }
                    }
                }
            } else {
                for (const enemy of this.enemyManager.enemies) {
                    if (!enemy.alive) continue;
                    const enemyCenter = enemy.position.clone().add(new THREE.Vector3(0, 1.0, 0));
                    if (this.segmentHitsSphere(p0, p1, enemyCenter, 1.35)) {
                        if (proj.owner && proj.owner.ally) {
                            const killed = this.enemyManager.damageEnemy(enemy, 9, this.effects);
                            if (killed) {
                                this.state.enemiesDestroyed++;
                                this.state.score += 80;
                                this.notifications.notifyAllyKill(proj.owner.ally.name, enemy.role);
                            }
                        } else {
                            this.enemyManager.destroyEnemy(enemy, this.effects);
                            this.state.enemiesDestroyed++;
                            this.state.score += 250;
                            this.notifications.notifyKill(enemy.role, 250);
                        }
                        this.effects.createImpact(p1, 0xffaa55, 4);
                        hit = true;
                        break;
                    }
                }

                if (!hit) {
                    for (const target of this.targetManager.targets) {
                        if (!target.destroyed && this.segmentHitsSphere(p0, p1, target.position, target.radius)) {
                            const destroyed = this.targetManager.damageTarget(target, 30, this.effects);
                            if (destroyed) {
                                if (proj.owner && proj.owner.ally) {
                                    this.state.score += 250;
                                    this.notifications.notifyAllyKill(proj.owner.ally.name, target.name, 'DESTRUIDO');
                                } else {
                                    this.state.score += 500;
                                    this.notifications.notifyKill(target.name, 500);
                                }
                            }
                            this.effects.createImpact(p1, 0xffaa55, 5);
                            hit = true;
                            break;
                        }
                    }
                }
            }

            if (hit) {
                this.scene.remove(proj.mesh);
                this.effects.projectiles.splice(i, 1);
            }
        }

        // Mientras el piloto está en la trinchera no hay dron que pueda impactar
        if (!playerActive) return;

        for (const enemy of this.enemyManager.enemies) {
            if (enemy.alive && enemy.position.distanceTo(playerPos) < 2.2) {
                this.handleDroneDetonation(playerPos.clone(), 'IMPACTO KAMIKAZE // C4 DETONADO');
                return;
            }
        }

        for (const target of this.targetManager.targets) {
            if (!target.destroyed && target.position.distanceTo(playerPos) < target.radius) {
                this.handleDroneDetonation(playerPos.clone(), 'ESTRUCTURA IMPACTADA // EXPLOSIÓN');
                return;
            }
        }
    }

    applyCameraShake(dt) {
        if (this.cameraShake <= 0.001) return;
        this.cameraShake = Math.max(0, this.cameraShake - dt * 2.1);
        const s = this.cameraShake * 0.55;
        this.camera.position.x += (Math.random() - 0.5) * s;
        this.camera.position.y += (Math.random() - 0.5) * s;
        this.camera.position.z += (Math.random() - 0.5) * s;
        this.camera.rotateZ((Math.random() - 0.5) * this.cameraShake * 0.03);
    }

    /**
     * Resolución adaptativa: si el equipo no llega a 45 FPS baja el pixel ratio
     * automáticamente; si sobra rendimiento lo vuelve a subir.
     */
    updatePerformance(dt) {
        this.fpsAccum += dt;
        this.fpsFrames++;
        if (this.fpsAccum < 1) return;

        const fps = this.fpsFrames / this.fpsAccum;
        let next = this.pixelRatio;
        if (fps < 45) next = Math.max(0.7, this.pixelRatio - 0.15);
        else if (fps > 58) next = Math.min(this.basePixelRatio, this.pixelRatio + 0.1);

        if (Math.abs(next - this.pixelRatio) > 0.01) {
            this.pixelRatio = next;
            this.renderer.setPixelRatio(next);
        }

        this.fpsAccum = 0;
        this.fpsFrames = 0;
    }

    animate() {
        requestAnimationFrame(this.animate);
        const dt = Math.min(this.clock.getDelta(), 0.05);

        if (this.state.running) {
            this.state.elapsedTime += dt;
            this.updatePerformance(dt);
            this.effects.update(dt);
            this.world.update(dt, this.state.elapsedTime);
            this.targetManager.update(dt, this.state.elapsedTime);
            this.allyManager.update(dt, this.enemyManager.enemies, this.playerDrone, this.effects);
            this.trenchView.update(dt);

            // El HUD y el radar se refrescan 10 veces por segundo, no cada frame.
            this.hudAccum += dt;
            const refreshHud = this.hudAccum >= 0.1;
            if (refreshHud) {
                this.hudAccum = 0;
                this.ui.updateSquad(this.allyManager.getAllies());
            }

            let telemetry = null;

            if (!this.state.respawning) {
                const input = this.controls.getInput();
                telemetry = this.playerDrone.update(dt, input, this.world, this.effects);
                this.applyCameraShake(dt);

                if (telemetry.crashed) {
                    this.handleDroneDetonation(this.playerDrone.position.clone(), 'ACCIDENTE EN TERRENO // PÉRDIDA DE UNIDAD');
                }
            }

            // Refuerzos enemigos periódicos para mantener la presión del asedio
            if (this.state.elapsedTime > 55) {
                this.reinforcementTimer -= dt;
                if (this.reinforcementTimer <= 0) {
                    this.reinforcementTimer = 36 + Math.random() * 14;
                    const spawned = this.enemyManager.reinforce(3);
                    if (spawned > 0) {
                        this.notifications.showRadioMessage(`¡Refuerzos enemigos detectados al norte! ${spawned} contactos nuevos avanzan hacia la trinchera.`, 5200);
                    }
                }
            }

            // La batalla continúa mientras el piloto está en la trinchera:
            // los enemigos siguen disparando y el escuadrón amigo sigue combatiendo.
            this.state.underFire = this.enemyManager.update(
                dt,
                this.playerDrone,
                this.effects,
                this.allyManager.getAllies(),
                !this.state.respawning
            );
            this.checkCollisions();

            if (!this.state.respawning) {
                if (this.playerDrone.hp <= 0) {
                    this.handleDroneDetonation(this.playerDrone.position.clone(), 'DRON ABATIDO POR FUEGO HOSTIL');
                } else if (this.playerDrone.battery <= 0) {
                    this.handleDroneDetonation(this.playerDrone.position.clone(), 'BATERÍA LIPO AGOTADA');
                }
            }

            if (!this.state.respawning && telemetry) {
                const destroyedTargets = this.targetManager.getDestroyedCount();
                const allTargetsDone = destroyedTargets >= this.targetManager.totalTargets;
                const survivedTwoMinutes = this.state.elapsedTime >= 120;

                if (allTargetsDone && survivedTwoMinutes && !this.targetManager.extractionActive) {
                    this.targetManager.setExtractionActive(true);
                    this.notifications.showRadioMessage("¡Objetivos eliminados y tiempo cumplido! La zona de extracción está activa.", 7000);
                }

                if (this.targetManager.extractionActive) {
                    const distToExtraction = this.playerDrone.position.distanceTo(this.targetManager.extractionPos);
                    if (distToExtraction < this.targetManager.extractionZone.radius + 2.5) {
                        this.state.score += 1200;
                        this.notifications.showRadioMessage("¡Extracción exitosa! Buen trabajo, soldado.", 8000);
                        this.endMission(true, 'Has destruido los 6 objetivos, resistido el asedio y asegurado la extracción.');
                    }
                }

                if (refreshHud) {
                    this.ui.updateHUD(
                        this.state,
                        this.playerDrone,
                        telemetry,
                        this.targetManager.targets,
                        this.enemyManager.enemies,
                        this.targetManager.extractionPos,
                        this.targetManager.extractionActive,
                        this.allyManager.getAllies()
                    );
                }
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.simulator = new FPVSimulator();
});