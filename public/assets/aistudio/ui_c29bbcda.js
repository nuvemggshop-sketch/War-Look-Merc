class UIManager {
    constructor() {
        this.startScreen = document.getElementById('start-screen');
        this.endScreen = document.getElementById('end-screen');
        this.hud = document.getElementById('hud');

        this.hudTime = document.getElementById('hud-time');
        this.hudSurviveStatus = document.getElementById('hud-survive-status');
        this.hudTargets = document.getElementById('hud-targets');
        this.hudMissionPhase = document.getElementById('hud-mission-phase');
        this.hudEnemies = document.getElementById('hud-enemies');
        this.hudScore = document.getElementById('hud-score');
        this.hudDrones = document.getElementById('hud-drones');
        this.hudGamepadBadge = document.getElementById('hud-gamepad-badge');
        this.droneStockIcons = document.getElementById('drone-stock-icons');
        this.lastScore = -1;

        this.barHp = document.getElementById('bar-hp');
        this.valHp = document.getElementById('val-hp');
        this.barBat = document.getElementById('bar-bat');
        this.valBat = document.getElementById('val-bat');
        this.hudAlt = document.getElementById('hud-alt');
        this.hudSpd = document.getElementById('hud-spd');

        this.warningAlert = document.getElementById('warning-alert');
        this.extractionAlert = document.getElementById('extraction-alert');
        this.damageVignette = document.getElementById('damage-vignette');

        this.menuGpDot = document.getElementById('menu-gp-dot');
        this.menuGpText = document.getElementById('menu-gp-text');

        this.minimapCanvas = document.getElementById('minimap');
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        this.squadCount = document.getElementById('squad-count');
        this.squadList = document.getElementById('squad-list');
        this.squadSignature = '';
    }

    resetSquad() {
        this.squadSignature = '';
    }

    updateSquad(allies) {
        if (!this.squadCount || !this.squadList || !allies) return;

        const aliveCount = allies.filter(a => a.alive).length;
        const signature = allies.map(a => `${a.name}:${a.alive ? a.state : 'down'}:${Math.ceil(a.hp / 12)}:${Math.ceil(a.downTimer)}`).join('|');
        if (signature === this.squadSignature) return;
        this.squadSignature = signature;

        this.squadCount.textContent = `${aliveCount} / ${allies.length}`;
        this.squadList.innerHTML = '';

        const stateLabels = {
            COMBATE: 'EN COMBATE',
            CUBIERTO: 'CUBRIENDO',
            AVANZAR: 'AVANZANDO',
            PATRULLA: 'PATRULLA',
            CAÍDO: 'CAÍDO'
        };

        allies.forEach(ally => {
            const li = document.createElement('li');
            if (!ally.alive) li.classList.add('down');
            else if (ally.state === 'COMBATE') li.classList.add('engaged');
            else if (ally.state === 'CUBIERTO') li.classList.add('covering');
            else if (ally.state === 'AVANZAR') li.classList.add('advancing');

            const dot = document.createElement('span');
            dot.className = 'squad-dot';

            const name = document.createElement('span');
            name.className = 'squad-name';
            name.textContent = ally.name;

            const status = document.createElement('span');
            status.className = 'squad-status';
            if (!ally.alive) {
                status.textContent = `CAÍDO ${Math.ceil(ally.downTimer)}s`;
            } else {
                status.textContent = `${stateLabels[ally.state] || 'ACTIVO'} ${Math.ceil(ally.hp)}%`;
            }

            li.appendChild(dot);
            li.appendChild(name);
            li.appendChild(status);
            this.squadList.appendChild(li);
        });
    }

    updateGamepadStatus(connected, name) {
        if (connected) {
            this.menuGpDot.classList.add('connected');
            this.menuGpText.textContent = `MANDO DETECTADO: ${name.substring(0, 42)}`;
            this.menuGpText.style.color = '#00ff66';
            this.hudGamepadBadge.textContent = 'PS4 / DUALSENSE';
            this.hudGamepadBadge.style.color = '#00ff66';
        } else {
            this.menuGpDot.classList.remove('connected');
            this.menuGpText.textContent = 'Buscando mando PS4 / DualSense... (Pulsa cualquier botón)';
            this.menuGpText.style.color = '#889296';
            this.hudGamepadBadge.textContent = 'TECLADO / RATÓN';
            this.hudGamepadBadge.style.color = '#889296';
        }
    }

    updateDroneStock(dronesRemaining, maxDrones) {
        this.droneStockIcons.innerHTML = '';
        for (let i = 0; i < maxDrones; i++) {
            const span = document.createElement('span');
            span.className = 'd-icon';
            if (i < dronesRemaining - 1) span.classList.add('active');
            else if (i === dronesRemaining - 1) span.classList.add('current');
            this.droneStockIcons.appendChild(span);
        }
        if (this.hudDrones) this.hudDrones.textContent = dronesRemaining;
    }

    showHUD() {
        this.startScreen.classList.add('hidden');
        this.endScreen.classList.add('hidden');
        this.hud.classList.remove('hidden');
    }

    triggerDamageFlash() {
        this.damageVignette.classList.add('hit');
        setTimeout(() => this.damageVignette.classList.remove('hit'), 180);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    updateHUD(state, drone, telemetry, targets, enemies, extractionPos, extractionActive, allies = []) {
        this.hudTime.textContent = this.formatTime(state.elapsedTime);
        if (state.elapsedTime >= 120) {
            this.hudSurviveStatus.textContent = 'TIEMPO CUMPLIDO';
            this.hudSurviveStatus.style.color = '#00ff66';
        } else {
            const rem = Math.ceil(120 - state.elapsedTime);
            this.hudSurviveStatus.textContent = `RESISTE: ${this.formatTime(rem)}`;
            this.hudSurviveStatus.style.color = '#ff6a00';
        }

        const destroyed = targets.filter(t => t.destroyed).length;
        this.hudTargets.textContent = `${destroyed} / ${targets.length}`;
        this.hudScore.textContent = state.score.toString().padStart(4, '0');
        if (this.lastScore !== state.score) {
            this.lastScore = state.score;
            this.hudScore.classList.remove('bump');
            void this.hudScore.offsetWidth;
            this.hudScore.classList.add('bump');
        }
        if (this.hudEnemies) {
            this.hudEnemies.textContent = `HOSTILES ACTIVOS: ${enemies.filter(e => e.alive).length}`;
            this.hudEnemies.classList.toggle('heavy', enemies.filter(e => e.alive).length > 16);
        }

        if (extractionActive) {
            this.hudMissionPhase.textContent = 'FASE FINAL: EXTRACCIÓN ACTIVA';
            this.hudMissionPhase.style.color = '#00ff66';
            this.extractionAlert.classList.remove('hidden');
        } else {
            this.hudMissionPhase.textContent = 'FASE 1: ELIMINAR OBJETIVOS';
            this.hudMissionPhase.style.color = '#ff6a00';
            this.extractionAlert.classList.add('hidden');
        }

        const hpPct = Math.max(0, Math.round(drone.hp));
        this.barHp.style.width = `${hpPct}%`;
        this.valHp.textContent = `${hpPct}%`;
        this.barHp.classList.toggle('critical', hpPct < 30);

        const batPct = Math.max(0, Math.round(drone.battery));
        this.barBat.style.width = `${batPct}%`;
        this.valBat.textContent = `${batPct}%`;
        this.barBat.classList.toggle('critical', batPct < 20);
        this.hud.classList.toggle('critical-battery', batPct < 20);

        this.hudAlt.textContent = telemetry.altitude;
        this.hudSpd.textContent = telemetry.speedKmh;

        if (state.underFire) this.warningAlert.classList.remove('hidden');
        else this.warningAlert.classList.add('hidden');

        this.drawMinimap(drone, targets, enemies, extractionPos, extractionActive, allies);
    }

    drawMinimap(drone, targets, enemies, extractionPos, extractionActive, allies = []) {
        const ctx = this.minimapCtx;
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const scale = 0.64;

        ctx.clearRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(0, 255, 102, 0.2)';
        ctx.lineWidth = 1;
        [25, 50, 75].forEach(r => {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Barrido del radar
        const sweep = performance.now() * 0.0014;
        ctx.strokeStyle = 'rgba(0, 255, 102, 0.38)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(sweep) * 74, cy + Math.sin(sweep) * 74);
        ctx.stroke();

        const toRadarCoords = (worldPos) => {
            const dx = worldPos.x - drone.position.x;
            const dz = worldPos.z - drone.position.z;
            const cos = Math.cos(drone.yaw);
            const sin = Math.sin(drone.yaw);
            const rx = (dx * cos - dz * sin) * scale;
            const ry = (dx * sin + dz * cos) * scale;
            return { x: cx + rx, y: cy + ry };
        };

        const extPt = toRadarCoords(extractionPos);
        ctx.fillStyle = extractionActive ? '#00ff66' : 'rgba(0, 255, 102, 0.35)';
        ctx.beginPath();
        ctx.arc(extPt.x, extPt.y, extractionActive ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();

        targets.forEach(t => {
            if (t.destroyed) return;
            const pt = toRadarCoords(t.position);
            ctx.shadowBlur = 7;
            ctx.shadowColor = '#ff2a2a';
            ctx.fillStyle = '#ff2a2a';
            ctx.fillRect(pt.x - 4, pt.y - 4, 8, 8);
            ctx.shadowBlur = 0;
        });

        enemies.forEach(e => {
            if (!e.alive) return;
            const pt = toRadarCoords(e.position);
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#ff9900';
            ctx.fillStyle = e.threateningPlayer ? '#ff5522' : '#ff9900';
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, e.threateningPlayer ? 3.4 : 2.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        allies.forEach(a => {
            if (!a.alive) return;
            const pt = toRadarCoords(a.position);
            ctx.shadowBlur = 7;
            ctx.shadowColor = '#00ffcc';
            ctx.fillStyle = a.state === 'COMBATE' ? '#66ffe0' : '#00ffcc';
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, a.state === 'COMBATE' ? 3.1 : 2.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 6);
        ctx.lineTo(cx - 4, cy + 5);
        ctx.lineTo(cx + 4, cy + 5);
        ctx.closePath();
        ctx.fill();
    }

    showEndScreen(victory, reason, state, targetsDestroyed, totalTargets, allyStats = { alive: 0, total: 0, losses: 0 }) {
        this.hud.classList.add('hidden');
        this.endScreen.classList.remove('hidden');

        const title = document.getElementById('end-title');
        const tag = document.getElementById('end-status-tag');
        title.textContent = victory ? 'POSICIÓN ASEGURADA // VICTORIA' : 'SIN DRONES // POSICIÓN PERDIDA';
        title.style.color = victory ? '#00ff66' : '#ff2a2a';
        tag.textContent = victory ? 'EXTRACCIÓN COMPLETADA' : 'ESCUADRÓN FPV AGOTADO';

        document.getElementById('end-reason').textContent = reason;
        document.getElementById('end-time').textContent = this.formatTime(state.elapsedTime);
        document.getElementById('end-targets').textContent = `${targetsDestroyed} / ${totalTargets}`;
        document.getElementById('end-kills').textContent = state.enemiesDestroyed;
        const maxDrones = state.maxDrones || 8;
        document.getElementById('end-drones').textContent = `${maxDrones - state.dronesRemaining} / ${maxDrones}`;
        document.getElementById('end-allies').textContent = `${allyStats.alive} / ${allyStats.total}`;
        document.getElementById('end-ally-losses').textContent = allyStats.losses;
        document.getElementById('end-score').textContent = state.score;
    }
}