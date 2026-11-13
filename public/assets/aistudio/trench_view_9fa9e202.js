/**
 * Administra la vista de trinchera y búnker cuando el dron es destruido.
 * Muestra soldados aliados protegiendo la posición y permite desplegar el siguiente FPV.
 */
class TrenchViewManager {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.promptBox = document.getElementById('trench-prompt');
        this.statusMsg = document.getElementById('trench-status-msg');
        this.squadBadge = document.getElementById('trench-squad-badge');
        this.deployBtn = document.getElementById('btn-deploy-next');
        this.hud = document.getElementById('hud');

        this.trenchPosition = new THREE.Vector3(0, 3.5, 98);
        this.active = false;
        this.onDeployCallback = null;
        this.soldierSlots = [];
        this.trenchYaw = 0;
        this.trenchPitch = -0.1;
        this.swayTime = 0;

        this.buildTrenchInterior();
    }

    buildTrenchInterior() {
        this.group = new THREE.Group();
        const matBag = new THREE.MeshStandardMaterial({ color: 0x4f4435, roughness: 0.9 });
        const matHelmet = new THREE.MeshStandardMaterial({ color: 0x46523f, roughness: 0.6 });

        // Muro de sacos de trinchera alrededor de la cámara del jugador
        for (let i = -4; i <= 4; i++) {
            const bag = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.2), matBag);
            bag.position.set(i * 2.1, 0.5, -4);
            this.group.add(bag);
        }

        // Puestos del escuadrón amigo en la trinchera
        [-2.7, -0.9, 0.9, 2.7].forEach(xOff => {
            const soldier = new THREE.Group();

            const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a4a35, roughness: 0.8 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.5), bodyMat);
            body.position.y = 0.55;
            soldier.add(body);

            const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.28, 0.44), matHelmet);
            helmet.position.y = 1.28;
            soldier.add(helmet);

            const label = this.makeNameSprite('');
            label.position.set(0, 1.72, 0);
            soldier.add(label);

            soldier.position.set(xOff, 0, -2.8);
            this.group.add(soldier);

            this.soldierSlots.push({ group: soldier, bodyMat, label });
        });

        // Iluminación cálida del búnker para que el escuadrón sea visible
        const trenchLight = new THREE.PointLight(0xff9a55, 1.6, 24);
        trenchLight.position.set(0, 2.6, -2.2);
        this.group.add(trenchLight);

        const lantern = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.36, 0.28),
            new THREE.MeshBasicMaterial({ color: 0xffb066 })
        );
        lantern.position.set(2.9, 1.35, -3.3);
        this.group.add(lantern);

        // Cajas de munición a los costados
        const crateMat = new THREE.MeshStandardMaterial({ color: 0x3b2c1c, roughness: 0.95 });
        [-3.5, 3.5].forEach(xOff => {
            const crate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.72), crateMat);
            crate.position.set(xOff, 0.31, -3.5);
            this.group.add(crate);
        });

        this.group.position.copy(this.trenchPosition);
        this.group.visible = false;
        this.scene.add(this.group);
    }

    makeNameSprite(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2.0, 0.5, 1);
        sprite.renderOrder = 10;
        sprite.userData = { canvas, ctx, texture };
        this.drawNameSprite(sprite.userData, text, true);
        return sprite;
    }

    drawNameSprite(data, text, alive) {
        const { canvas, ctx, texture } = data;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (text) {
            ctx.font = 'bold 24px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(16, 10, 224, 44);
            ctx.strokeStyle = alive ? 'rgba(0, 255, 102, 0.85)' : 'rgba(255, 60, 60, 0.85)';
            ctx.lineWidth = 2;
            ctx.strokeRect(16, 10, 224, 44);
            ctx.fillStyle = alive ? '#9dffbe' : '#ff9a9a';
            ctx.fillText(text, 128, 33);
        }
        texture.needsUpdate = true;
    }

    show(dronesRemaining, reasonText, callback, allies = []) {
        this.active = true;
        this.onDeployCallback = callback;
        this.swayTime = 0;
        this.trenchYaw = 0;
        this.trenchPitch = -0.1;

        // Posicionar cámara dentro de la trinchera mirando hacia el campo de batalla
        this.camera.position.copy(this.trenchPosition).add(new THREE.Vector3(0, 1.2, 0));
        this.applyCameraRotation();

        // Refrescar el estado del escuadrón amigo en la trinchera (conserva sus bajas y su salud)
        const aliveCount = allies.filter(a => a.alive).length;
        this.soldierSlots.forEach((slot, idx) => {
            const ally = allies[idx];
            const alive = ally ? ally.alive : false;
            slot.bodyMat.color.setHex(alive ? 0x3a4a35 : 0x2a1c1a);
            this.drawNameSprite(slot.label.userData, ally ? ally.name : 'SIN ASIGNAR', alive);
        });

        this.group.visible = true;
        this.statusMsg.textContent = `${reasonText} (Drones restantes: ${dronesRemaining})`;
        this.squadBadge.textContent = `ESCUADRÓN ${aliveCount} / ${allies.length || 0}`;
        this.promptBox.classList.remove('hidden');

        // Sin dron activo: ocultar la telemetría de vuelo y dejar la vista limpia
        if (this.hud) this.hud.classList.add('trench-mode');

        // Evento para continuar: el jugador decide cuándo lanzar el siguiente dron
        const triggerDeploy = () => {
            if (!this.active) return;
            this.hide();
            if (this.onDeployCallback) this.onDeployCallback();
        };

        this.deployBtn.onclick = triggerDeploy;
        this.keypressListener = (e) => {
            if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyF') {
                triggerDeploy();
            }
        };
        window.addEventListener('keydown', this.keypressListener);

        // Mirar alrededor de la trinchera con el ratón sin bloquear el puntero
        this.mouseMoveListener = (e) => {
            if (!this.active) return;
            if (e.target && e.target.closest && e.target.closest('.trench-box')) return;
            this.trenchYaw = Math.max(-1.15, Math.min(1.15, this.trenchYaw - (e.movementX || 0) * 0.0022));
            this.trenchPitch = Math.max(-0.55, Math.min(0.35, this.trenchPitch - (e.movementY || 0) * 0.0022));
            this.applyCameraRotation();
        };
        window.addEventListener('mousemove', this.mouseMoveListener);

        // Evitar que un clic en la escena active el pointer lock mientras se decide el lanzamiento
        this.clickBlocker = (e) => {
            if (!this.active) return;
            if (e.target && e.target.closest && e.target.closest('.trench-box')) return;
            if (e.target && e.target.closest && e.target.closest('#canvas-container')) {
                e.stopPropagation();
                e.preventDefault();
            }
        };
        window.addEventListener('click', this.clickBlocker, true);
    }

    applyCameraRotation() {
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.trenchPitch, this.trenchYaw, 0, 'YXZ'));
    }

    update(dt) {
        if (!this.active) return;
        this.swayTime += dt;
        this.soldierSlots.forEach((slot, idx) => {
            slot.group.position.y = Math.sin(this.swayTime * 2.1 + idx * 1.3) * 0.018;
            slot.group.rotation.z = Math.sin(this.swayTime * 1.4 + idx) * 0.008;
        });
    }

    hide() {
        this.active = false;
        this.group.visible = false;
        this.promptBox.classList.add('hidden');
        if (this.hud) this.hud.classList.remove('trench-mode');
        if (this.keypressListener) {
            window.removeEventListener('keydown', this.keypressListener);
        }
        if (this.mouseMoveListener) {
            window.removeEventListener('mousemove', this.mouseMoveListener);
        }
        if (this.clickBlocker) {
            window.removeEventListener('click', this.clickBlocker, true);
        }
    }
}