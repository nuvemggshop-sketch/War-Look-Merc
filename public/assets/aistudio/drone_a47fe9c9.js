class PlayerDrone {
    constructor(scene, camera, soundManager) {
        this.scene = scene;
        this.camera = camera;
        this.sound = soundManager;

        this.maxHp = 100;
        this.hp = 100;
        this.battery = 100;
        this.fireCooldown = 0;

        this.position = new THREE.Vector3(0, 9, 95);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.yaw = 0;
        this.pitch = -0.12;
        this.visualRoll = 0;
        this.visualPitch = 0;

        this.acceleration = 50;
        this.boostMultiplier = 1.8;
        this.drag = 2.4;
        this.gravity = 2.1;

        this.mesh = new THREE.Group();
        this.propellers = [];
        this.buildDroneFrame();
        this.scene.add(this.mesh);
    }

    buildDroneFrame() {
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b1e20, roughness: 0.5, metalness: 0.7 });
        const warheadMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.4 });
        const propMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.45 });

        // Carga explosiva frontal visible en cámara FPV
        const warhead = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.35, 8), warheadMat);
        warhead.rotation.x = Math.PI / 2;
        warhead.position.set(0, -0.25, -0.45);
        this.mesh.add(warhead);

        const armPositions = [
            { x: -0.42, y: -0.24, z: -0.48 },
            { x: 0.42, y: -0.24, z: -0.48 }
        ];

        armPositions.forEach(pos => {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.45), frameMat);
            arm.position.set(pos.x * 0.7, pos.y, pos.z * 0.7);
            arm.rotation.y = pos.x > 0 ? -0.5 : 0.5;
            this.mesh.add(arm);

            const prop = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.008, 0.04), propMat);
            prop.position.set(pos.x, pos.y + 0.03, pos.z);
            this.mesh.add(prop);
            this.propellers.push(prop);
        });

        this.spotLight = new THREE.SpotLight(0xffeedd, 1.4, 65, Math.PI / 4, 0.5, 1);
        this.spotLight.position.set(0, -0.1, -0.3);
        this.spotLight.target.position.set(0, -1, -10);
        this.mesh.add(this.spotLight);
        this.mesh.add(this.spotLight.target);
    }

    reset() {
        this.hp = this.maxHp;
        this.battery = 100;
        this.position.set(0, 9, 95);
        this.velocity.set(0, 0, 0);
        this.yaw = 0;
        this.pitch = -0.12;
        this.visualRoll = 0;
        this.visualPitch = 0;
        this.fireCooldown = 0;
    }

    takeDamage(amount) {
        this.hp = Math.max(0, this.hp - amount);
    }

    update(dt, input, world, effectsManager) {
        if (this.fireCooldown > 0) this.fireCooldown -= dt;

        this.yaw += input.yaw;
        this.pitch = Math.max(-1.25, Math.min(1.15, this.pitch + input.pitch));

        const isBoosting = input.boost && this.battery > 2 && (input.forward !== 0 || input.strafe !== 0 || input.vertical !== 0);
        if (isBoosting) {
            this.battery = Math.max(0, this.battery - 15 * dt);
        } else {
            this.battery = Math.max(0, this.battery - 0.42 * dt);
        }

        const forwardVec = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const rightVec = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const accel = this.acceleration * (isBoosting ? this.boostMultiplier : 1.0);

        this.velocity.addScaledVector(forwardVec, input.forward * accel * dt);
        this.velocity.addScaledVector(rightVec, input.strafe * accel * dt);
        this.velocity.y += (input.vertical * accel * 0.85 - this.gravity) * dt;

        this.velocity.multiplyScalar(Math.max(0, 1 - this.drag * dt));
        this.position.addScaledVector(this.velocity, dt);

        const mapLimit = 115;
        this.position.x = Math.max(-mapLimit, Math.min(mapLimit, this.position.x));
        this.position.z = Math.max(-mapLimit, Math.min(mapLimit, this.position.z));
        if (this.position.y > 65) {
            this.position.y = 65;
            this.velocity.y = 0;
        }

        // Detectar choque contra el suelo o estructuras
        const floorY = world.getTerrainHeight(this.position.x, this.position.z) + 0.65;
        let crashed = false;

        if (this.position.y < floorY) {
            crashed = true;
            this.position.y = floorY;
        } else if (world.checkStructureCollision(this.position)) {
            crashed = true;
        }

        const targetRoll = -input.strafe * 0.16;
        const targetPitchTilt = -input.forward * 0.12;
        this.visualRoll += (targetRoll - this.visualRoll) * 8 * dt;
        this.visualPitch += (targetPitchTilt - this.visualPitch) * 8 * dt;

        const euler = new THREE.Euler(this.pitch + this.visualPitch, this.yaw, this.visualRoll, 'YXZ');
        this.camera.position.copy(this.position);
        this.camera.quaternion.setFromEuler(euler);

        this.mesh.position.copy(this.position);
        this.mesh.quaternion.copy(this.camera.quaternion);

        const propSpeed = (35 + this.velocity.length() * 2 + (isBoosting ? 25 : 0)) * dt;
        this.propellers.forEach((p, idx) => {
            p.rotation.y += idx % 2 === 0 ? propSpeed : -propSpeed;
        });

        if (input.fire && this.fireCooldown <= 0) {
            this.fireCooldown = 0.28;
            const aimDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            const muzzlePos = this.position.clone().addScaledVector(aimDir, 1.2);
            effectsManager.spawnProjectile(muzzlePos, aimDir, false);
        }

        const speedRatio = Math.min(1, this.velocity.length() / 32);
        this.sound.updateEngine(speedRatio, isBoosting, false);

        return {
            speedKmh: Math.round(this.velocity.length() * 3.6),
            altitude: Math.max(0, (this.position.y - floorY + 0.65)).toFixed(1),
            isBoosting,
            crashed
        };
    }
}