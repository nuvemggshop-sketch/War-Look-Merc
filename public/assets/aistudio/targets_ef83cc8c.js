class TargetManager {
    constructor(scene, getTerrainHeight) {
        this.scene = scene;
        this.getTerrainHeight = getTerrainHeight;
        this.targets = [];
        this.totalTargets = 6;

        this.extractionZone = null;
        this.extractionPos = new THREE.Vector3(0, 0, -98);
        this.extractionActive = false;

        this.buildExtractionZone();
    }

    buildExtractionZone() {
        const group = new THREE.Group();
        const y = this.getTerrainHeight(this.extractionPos.x, this.extractionPos.z);
        this.extractionPos.y = y;

        const baseGeo = new THREE.RingGeometry(3.5, 5.5, 32);
        const baseMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, side: THREE.DoubleSide, transparent: true, opacity: 0.25 });
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        baseMesh.rotation.x = -Math.PI / 2;
        baseMesh.position.y = 0.25;
        group.add(baseMesh);

        const beamGeo = new THREE.CylinderGeometry(4.2, 4.2, 55, 24, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
        const beamMesh = new THREE.Mesh(beamGeo, beamMat);
        beamMesh.position.y = 27.5;
        group.add(beamMesh);

        group.position.copy(this.extractionPos);
        this.scene.add(group);

        this.extractionZone = { group, baseMat, beamMat, radius: 6.5 };
    }

    spawnTargets() {
        this.targets.forEach(t => this.scene.remove(t.mesh));
        this.targets = [];

        const locations = [
            { x: -65, z: -55, type: 'PUESTO DE MANDO MERCENARIO' },
            { x: 68, z: -48, type: 'BLINDADO DE ASALTO' },
            { x: -52, z: 22, type: 'BÚNKER DE MUNICIÓN' },
            { x: 58, z: 30, type: 'REPETIDOR TÁCTICO' },
            { x: -18, z: -68, type: 'MORTERO PESADO' },
            { x: 24, z: -25, type: 'GENERADOR DE CAMPAÑA' }
        ];

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a352f, roughness: 0.7, metalness: 0.4 });
        const accentMat = new THREE.MeshStandardMaterial({ color: 0x8a2218, roughness: 0.5 });

        locations.forEach((loc, index) => {
            const group = new THREE.Group();
            const groundY = this.getTerrainHeight(loc.x, loc.z);

            const chassis = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.4, 7.5), bodyMat);
            chassis.position.y = 1.2;
            group.add(chassis);

            const turret = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 3.6), accentMat);
            turret.position.y = 2.9;
            group.add(turret);

            const beaconGeo = new THREE.OctahedronGeometry(0.95, 0);
            const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
            const beacon = new THREE.Mesh(beaconGeo, beaconMat);
            beacon.position.y = 6.5;
            group.add(beacon);

            const pointLight = new THREE.PointLight(0xff2222, 2.2, 24);
            pointLight.position.y = 5.5;
            group.add(pointLight);

            group.position.set(loc.x, groundY, loc.z);
            group.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(group);

            this.targets.push({
                id: index,
                name: loc.type,
                mesh: group,
                beacon,
                position: new THREE.Vector3(loc.x, groundY + 2, loc.z),
                hp: 60,
                destroyed: false,
                radius: 4.8
            });
        });

        this.setExtractionActive(false);
    }

    setExtractionActive(active) {
        this.extractionActive = active;
        if (this.extractionZone) {
            this.extractionZone.baseMat.opacity = active ? 0.85 : 0.15;
            this.extractionZone.beamMat.opacity = active ? 0.28 : 0.04;
        }
    }

    damageTarget(target, amount, effectsManager) {
        if (target.destroyed) return false;
        target.hp -= amount;
        if (target.hp <= 0) {
            target.destroyed = true;
            effectsManager.createExplosion(target.position, 0xff4400, 42);
            this.scene.remove(target.mesh);
            return true;
        }
        return false;
    }

    update(dt, time) {
        this.targets.forEach(t => {
            if (!t.destroyed) {
                t.beacon.rotation.y += dt * 2.5;
                t.beacon.position.y = 6.5 + Math.sin(time * 4 + t.id) * 0.4;
            }
        });

        if (this.extractionActive && this.extractionZone) {
            this.extractionZone.beamMat.opacity = 0.22 + Math.sin(time * 5) * 0.08;
        }
    }

    getDestroyedCount() {
        return this.targets.filter(t => t.destroyed).length;
    }
}