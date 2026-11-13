import * as THREE from 'three';
import { AllyManager } from './allies';
import { SoundManager } from './audio';
import { ControlManager } from './controls';
import { PlayerDrone, type DroneTelemetry } from './drone';
import { EnemyManager } from './enemies';
import { EffectsManager } from './particles';
import {
  BATTLEFIELD_MAPS,
  computeRelativeBearingDeg,
  computeSplashDamage,
  DIFFICULTIES,
  evaluateMissionStatus,
  MAX_ROCKETS_PER_DRONE,
  segmentHitsSphere,
  type DifficultyConfig,
} from './rules';
import { TargetManager } from './targets';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import { TrenchViewManager } from './trench_view';
import type {
  DifficultyId,
  EndMissionSummary,
  GameScreenState,
  HUDTelemetrySnapshot,
  KillBannerData,
  KillFeedEntry,
  MapId,
  ObjectiveGuidance,
  RadarEntity,
  RadioMessageData,
  RadioSpeaker,
  SquadOrder,
  TrenchPromptData,
} from './types';
import { TacticalVoiceManager } from './voice';
import { BattlefieldWorld, type ExplosiveBarrel } from './world';

export interface SimulatorCallbacks {
  onStateChange: (state: GameScreenState) => void;
  onHUDUpdate: (hud: HUDTelemetrySnapshot) => void;
  onKillFeed: (entry: KillFeedEntry) => void;
  onKillBanner: (banner: KillBannerData) => void;
  onRadioMessage: (msg: RadioMessageData) => void;
  onDamageFlash: () => void;
  onHitMarker: () => void;
  onTrenchPrompt: (data: TrenchPromptData) => void;
  onEndMission: (summary: EndMissionSummary) => void;
  onGamepadStatus: (connected: boolean, name: string) => void;
}

const BEST_SCORE_STORAGE_KEY = 'fpv_tactical_ops_best_score_v1';

const _enemyCenter = new THREE.Vector3();
const _allyCenter = new THREE.Vector3();
const _tourTarget = new THREE.Vector3(0, 4, -22);

export class FPVSimulator {
  private container: HTMLElement;
  private callbacks: SimulatorCallbacks;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private isSoftwareGl: boolean;
  private textures: ProceduralTextureSet;

  private sound: SoundManager;
  private voice: TacticalVoiceManager;
  private controls: ControlManager;
  private effects: EffectsManager;
  private world: BattlefieldWorld;
  private playerDrone: PlayerDrone;
  private targetManager: TargetManager;
  private enemyManager: EnemyManager;
  private allyManager: AllyManager;
  private trenchView: TrenchViewManager;

  private screenState: GameScreenState = 'title';
  private currentMapId: MapId = 'trinchera';
  private currentDifficultyId: DifficultyId = 'tactico';
  private dronesRemaining = DIFFICULTIES.tactico.dronesReserve;
  private elapsedTime = 0;
  private score = 0;
  private bestScore = 0;
  private enemiesDestroyed = 0;
  private killStreak = 0;
  private lastKillTime = -10;
  private underFire = false;
  private sniperLock = false;
  private squadOrder: SquadOrder = 'ESCOLTA';
  private lastLaserWarnTime = -10;
  private lastCommsTime = -10;
  private lastEnemyShoutFeedTime = -10;
  private phaseLabel = 'FASE 1: BARRER TRINCHERAS';

  private trauma = 0;
  private hitstopTimer = 0;
  private reinforcementTimer = 42;
  private hudAccum = 0;
  private tourTime = 0;
  private feedCounter = 0;
  private disposed = false;
  private frameId = 0;
  private lastFrameMs = performance.now();

  constructor(container: HTMLElement, callbacks: SimulatorCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    try {
      const saved = localStorage.getItem(BEST_SCORE_STORAGE_KEY);
      if (saved) this.bestScore = Number(saved) || 0;
    } catch {
      this.bestScore = 0;
    }

    this.isSoftwareGl = this.detectSoftwareWebGL();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b1917);
    this.scene.fog = new THREE.FogExp2(0x1b1917, 0.0088);

    this.camera = new THREE.PerspectiveCamera(
      92,
      window.innerWidth / window.innerHeight,
      0.1,
      900
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.15)
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.renderer.domElement.dataset.testid = 'fpv-canvas';
    this.container.appendChild(this.renderer.domElement);

    this.textures = createProceduralTextures(this.renderer);
    this.sound = new SoundManager();
    this.voice = new TacticalVoiceManager(this.sound);
    this.voice.onTransmissionDisplay = (tx) => {
      this.feedCounter++;
      this.callbacks.onRadioMessage({
        id: this.feedCounter,
        speaker: tx.speaker,
        callsign: tx.callsign,
        text: tx.text,
        durationMs: tx.durationMs,
      });
    };

    this.effects = new EffectsManager(this.scene, this.sound, this.textures);
    this.world = new BattlefieldWorld(this.scene, this.textures);
    this.world.onArtilleryBoom = () => {
      if (this.screenState === 'playing' || this.screenState === 'trench') {
        this.sound.playArtilleryDistant();
      }
    };
    this.trenchView = new TrenchViewManager(this.scene, this.camera, this.textures);

    this.controls = new ControlManager(this.renderer.domElement, (conn, name) => {
      this.callbacks.onGamepadStatus(conn, name);
    });

    this.setupLighting();
    this.world.build();
    this.effects.setWorld(this.world);
    this.effects.onExplosion = (pos, power) => {
      const dist = pos.distanceTo(this.camera.position);
      if (dist < 75) {
        const boost = Math.min(0.85, power / 48) * (1 - dist / 75);
        this.trauma = Math.min(1.0, this.trauma + boost);
      }
    };
    this.effects.onRocketImpact = (pos) => {
      this.handleSplashExplosion(pos, 7.6, 85, 'COHETE HE');
    };
    this.effects.onFragExplode = (pos) => {
      this.enemyManager.alertNearbyToExplosion(pos, 18);
      if (this.screenState === 'playing' && this.playerDrone.position.distanceTo(pos) < 6.5) {
        const dmg = computeSplashDamage(this.playerDrone.position.distanceTo(pos), 6.5, 28);
        if (dmg > 0) {
          this.playerDrone.takeDamage(dmg);
          this.callbacks.onDamageFlash();
        }
      }
      const diff = this.getDifficulty();
      for (let i = 0; i < this.allyManager.allies.length; i++) {
        const ally = this.allyManager.allies[i];
        if (!ally.alive) continue;
        const d = ally.position.distanceTo(pos);
        if (d < 7.2) {
          this.allyManager.damageAlly(
            ally,
            computeSplashDamage(d, 7.2, Math.round(54 * diff.enemyDamageMult)),
            this.effects
          );
        }
      }
    };

    this.playerDrone = new PlayerDrone(this.scene, this.camera, this.sound);
    this.playerDrone.setVisible(false);

    this.targetManager = new TargetManager(
      this.scene,
      (x, z) => this.world.getTerrainHeight(x, z),
      this.textures
    );
    this.enemyManager = new EnemyManager(
      this.scene,
      (x, z) => this.world.getTerrainHeight(x, z),
      this.world,
      this.textures
    );
    this.allyManager = new AllyManager(
      this.scene,
      (x, z) => this.world.getTerrainHeight(x, z),
      this.world,
      this.textures
    );

    this.allyManager.onAllyDown = (ally) => {
      this.sound.playAllyKIAAlert();
      this.emitFeed(`[KIA] ${ally.name} CAÍDO EN COMBATE`, 'warning');
      const survivors = this.allyManager.getAliveCount();
      this.emitRadio(
        `¡Atención! ¡${ally.name} ha caído en combate! ${
          survivors > 0
            ? `Quedan ${survivors} efectivos en línea. No retrocedan.`
            : 'Escuadrón Alfa aniquilado. Águila, estás solo en el sector.'
        }`,
        'COMANDANTE',
        'CÓNDOR-1 · COMANDANTE',
        5800,
        true
      );
    };
    this.allyManager.onAllyCallout = (ally, text) => {
      const refPos =
        this.screenState === 'playing'
          ? this.playerDrone.position
          : this.camera.position;
      this.voice.speakCombatCallout(text, 'ally', ally.position.distanceTo(refPos));
      this.emitFeed(`[${ally.name}] ${text}`, 'status');
    };

    this.enemyManager.onEnemyKilled = (enemy, lastWords) => {
      const refPos =
        this.screenState === 'playing'
          ? this.playerDrone.position
          : this.camera.position;
      const dist = enemy.position.distanceTo(refPos);
      this.sound.playEnemyDeathScream(dist, enemy.archetype);
      this.voice.speakEnemyLastWords(lastWords, dist);
      if (dist < 42 && this.elapsedTime - this.lastEnemyShoutFeedTime > 2.2) {
        this.lastEnemyShoutFeedTime = this.elapsedTime;
        this.emitFeed(`[HOSTIL] "${lastWords}"`, 'warning');
      }
    };

    this.enemyManager.onEnemyShout = (enemy, text) => {
      const refPos =
        this.screenState === 'playing'
          ? this.playerDrone.position
          : this.camera.position;
      const dist = enemy.position.distanceTo(refPos);
      if (dist < 48) {
        this.sound.playSoldierVocalAlert(dist);
        this.voice.speakEnemyLastWords(text, dist);
      }
      if (dist < 34 && this.elapsedTime - this.lastEnemyShoutFeedTime > 3.2) {
        this.lastEnemyShoutFeedTime = this.elapsedTime;
        this.emitFeed(`[HOSTIL] "${text}"`, 'warning');
      }
    };

    // Populate initial battlefield vista so title flyover shows live world
    const initDiff = this.getDifficulty();
    this.targetManager.spawnTargets(this.currentMapId);
    this.enemyManager.spawnEnemies(this.currentMapId, initDiff);
    this.allyManager.spawnSquad(initDiff);
    this.renderer.shadowMap.needsUpdate = true;

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.handleContextLost
    );
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      this.handleContextRestored
    );
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('mousemove', this.handleTrenchMouseLook);
    window.addEventListener('keydown', this.handleGlobalHotkeys);

    this.setScreenState('title');
    this.frameId = requestAnimationFrame(this.tick);
  }

  private detectSoftwareWebGL(): boolean {
    try {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param) || '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }

  private getDifficulty(): DifficultyConfig {
    return DIFFICULTIES[this.currentDifficultyId];
  }

  private setupLighting(): void {
    const hemiLight = new THREE.HemisphereLight(0x9bb0c4, 0x342a22, 1.28);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffc894, 1.62);
    keyLight.position.set(68, 96, 48);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(512, 512);
      keyLight.shadow.camera.left = -95;
      keyLight.shadow.camera.right = 95;
      keyLight.shadow.camera.top = 95;
      keyLight.shadow.camera.bottom = -95;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 240;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xff6b2b, 0.65);
    rimLight.position.set(-70, 26, -92);
    this.scene.add(rimLight);

    [
      [-45, 4, -40],
      [50, 4, -65],
    ].forEach(([x, y, z]) => {
      const fireLight = new THREE.PointLight(0xff5500, 2.5, 58);
      fireLight.position.set(x, y, z);
      this.scene.add(fireLight);
    });
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private handleContextRestored = (): void => {
    this.renderer.render(this.scene, this.camera);
  };

  private handleResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.15)
    );
  };

  private handleTrenchMouseLook = (e: MouseEvent): void => {
    if (this.screenState !== 'trench') return;
    if ((e.target as HTMLElement | null)?.closest?.('.trench-interactive')) return;
    this.trenchView.lookDelta(e.movementX || 0, e.movementY || 0);
  };

  private handleGlobalHotkeys = (e: KeyboardEvent): void => {
    if (e.code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (e.code === 'KeyR' && (this.screenState === 'playing' || this.screenState === 'trench')) {
      this.requestCommanderReport();
      return;
    }

    if (e.code === 'KeyG' && (this.screenState === 'playing' || this.screenState === 'trench')) {
      this.toggleSquadOrder();
      return;
    }

    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (this.screenState === 'playing') {
        this.pauseMission();
      } else if (this.screenState === 'paused') {
        this.resumeMission();
      }
      return;
    }

    if (
      this.screenState === 'title' &&
      (e.code === 'Enter' || e.code === 'Space')
    ) {
      e.preventDefault();
      this.startMission();
    }
  };

  private setScreenState(next: GameScreenState): void {
    this.screenState = next;
    document.body.dataset.state = next;
    this.callbacks.onStateChange(next);
  }

  private emitFeed(text: string, tone: KillFeedEntry['tone']): void {
    this.feedCounter++;
    this.callbacks.onKillFeed({ id: this.feedCounter, text, tone });
  }

  private emitBanner(title: string, points: number): void {
    this.feedCounter++;
    this.callbacks.onKillBanner({ id: this.feedCounter, title, points });
  }

  private emitRadio(
    text: string,
    speaker: RadioSpeaker = 'COMANDANTE',
    callsign = 'CÓNDOR-1 · COMANDANTE',
    durationMs = 5200,
    urgent = false
  ): void {
    this.voice.speak({ speaker, callsign, text, durationMs }, urgent);
  }

  public requestCommanderReport(): void {
    const now = performance.now() / 1000;
    if (now - this.lastCommsTime < 2.2) return;
    this.lastCommsTime = now;

    this.sound.init();
    this.voice.unlock();

    const remaining = this.targetManager.totalTargets - this.targetManager.getDestroyedCount();
    const aliveAllies = this.allyManager.getAliveCount();
    const guidance = this.computeObjectiveGuidance();

    this.emitRadio(
      'Cóndor-1, aquí Águila FPV. Solicito situación táctica del sector.',
      'OPERADOR',
      'ÁGUILA-FPV · TÚ',
      3800,
      true
    );

    let reply = '';
    if (this.targetManager.extractionActive) {
      reply = `Recibido Águila. Zona de extracción verde despejada al norte${
        guidance ? `, a ${guidance.distanceMeters} metros` : ''
      }. Vuelve al haz de extracción.`;
    } else if (remaining > 0 && guidance) {
      const dirText =
        Math.abs(guidance.relativeBearingDeg) < 25
          ? 'justo al frente'
          : guidance.relativeBearingDeg > 0
          ? 'a tu derecha'
          : 'a tu izquierda';
      reply = `Copiado Águila. Quedan ${remaining} objetivos fortificados. Blanco más cercano ${dirText} a ${guidance.distanceMeters} metros. Escuadrón Alfa con ${aliveAllies} efectivos cubriendo tu avance.`;
    } else {
      reply = `Objetivos neutralizados, Águila. Mantén el sector asegurado hasta completar los 2 minutos de defensa.`;
    }

    this.emitRadio(reply, 'COMANDANTE', 'CÓNDOR-1 · COMANDANTE', 6200, false);
  }

  public toggleSquadOrder(): SquadOrder {
    this.sound.init();
    this.voice.unlock();
    this.sound.playSquadOrderChirp();
    this.squadOrder = this.squadOrder === 'ESCOLTA' ? 'MANTENER' : 'ESCOLTA';

    const alive = this.allyManager.getAliveCount();
    if (this.squadOrder === 'ESCOLTA') {
      this.emitRadio(
        '¡Escuadrón Alfa, avancen conmigo en formación de escolta!',
        'OPERADOR',
        'ÁGUILA-FPV · TÚ',
        3600,
        true
      );
      if (alive > 0) {
        this.emitRadio(
          '¡Copiado Águila! Avanzamos contigo cubriendo flancos.',
          'ESCUADRÓN',
          'CABO RÍOS · ALFA',
          4200,
          false
        );
      }
    } else {
      this.emitRadio(
        '¡Escuadrón Alfa, mantengan línea y fuego de cobertura!',
        'OPERADOR',
        'ÁGUILA-FPV · TÚ',
        3600,
        true
      );
      if (alive > 0) {
        this.emitRadio(
          '¡Afirmativo! Clavamos botas y aseguramos perímetro.',
          'ESCUADRÓN',
          'CABO RÍOS · ALFA',
          4200,
          false
        );
      }
    }
    return this.squadOrder;
  }

  public selectDifficulty(diffId: DifficultyId): void {
    if (this.currentDifficultyId === diffId) return;
    this.currentDifficultyId = diffId;
    const diff = this.getDifficulty();
    this.dronesRemaining = diff.dronesReserve;
    if (this.screenState === 'title') {
      this.enemyManager.spawnEnemies(this.currentMapId, diff);
      this.allyManager.spawnSquad(diff);
    }
  }

  public selectMap(mapId: MapId): void {
    if (this.currentMapId === mapId) return;
    this.currentMapId = mapId;
    const diff = this.getDifficulty();
    this.world.setMap(mapId);
    this.targetManager.spawnTargets(mapId);
    this.enemyManager.spawnEnemies(mapId, diff);
    this.allyManager.spawnSquad(diff);
    this.renderer.shadowMap.needsUpdate = true;
  }

  public getSelectedMapId(): MapId {
    return this.currentMapId;
  }

  public startMission(
    fromUserGesture = true,
    mapId?: MapId,
    diffId?: DifficultyId
  ): void {
    if (diffId && diffId !== this.currentDifficultyId) {
      this.currentDifficultyId = diffId;
    }
    if (mapId && mapId !== this.currentMapId) {
      this.currentMapId = mapId;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.controls.clearHeldInputs();
    if (fromUserGesture) {
      this.sound.init();
      this.voice.unlock();
    } else {
      const unlockAudio = () => {
        this.sound.init();
        this.voice.unlock();
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      };
      window.addEventListener('pointerdown', unlockAudio, { once: true });
      window.addEventListener('keydown', unlockAudio, { once: true });
    }
    this.voice.clear();
    this.effects.clearProjectiles();
    this.trenchView.hide();

    const diff = this.getDifficulty();
    this.dronesRemaining = diff.dronesReserve;
    this.elapsedTime = 0;
    this.score = 0;
    this.enemiesDestroyed = 0;
    this.killStreak = 0;
    this.lastKillTime = -10;
    this.underFire = false;
    this.sniperLock = false;
    this.squadOrder = 'ESCOLTA';
    this.lastLaserWarnTime = -10;
    this.trauma = 0;
    this.hitstopTimer = 0;
    this.reinforcementTimer = 42;
    this.phaseLabel = 'FASE 1: BARRER TRINCHERAS';

    this.world.setMap(this.currentMapId);
    this.playerDrone.reset();
    this.targetManager.spawnTargets(this.currentMapId);
    this.enemyManager.spawnEnemies(this.currentMapId, diff);
    this.allyManager.spawnSquad(diff);
    this.renderer.shadowMap.needsUpdate = true;

    this.setScreenState('playing');
    this.pushHUDUpdate({
      speedKmh: 0,
      altitude: 10,
      isBoosting: false,
      crashed: false,
      bumped: false,
      bumpDamage: 0,
      pitchDeg: -8,
      rollDeg: 0,
      yawDeg: 0,
      voltage: 25.2,
      rocketsLeft: MAX_ROCKETS_PER_DRONE,
      rocketCooldown: 0,
    });

    this.emitRadio(
      BATTLEFIELD_MAPS[this.currentMapId].briefing,
      'COMANDANTE',
      'CÓNDOR-1 · COMANDANTE',
      5800,
      true
    );
    this.emitRadio(
      '¡Escuadrón Alfa listo, avanzamos contigo hacia las trincheras!',
      'ESCUADRÓN',
      'CABO RÍOS · ALFA',
      4800,
      false
    );
    this.controls.requestPointerLock();
  }

  public pauseMission(): void {
    if (this.screenState !== 'playing') return;
    this.controls.clearHeldInputs();
    this.controls.releasePointer();
    this.sound.stopEngine();
    this.voice.clear();
    this.setScreenState('paused');
  }

  public resumeMission(): void {
    if (this.screenState !== 'paused') return;
    this.controls.clearHeldInputs();
    this.setScreenState('playing');
    this.controls.requestPointerLock();
  }

  public returnToTitle(): void {
    this.controls.clearHeldInputs();
    this.controls.releasePointer();
    this.sound.stopEngine();
    this.voice.clear();
    this.trenchView.hide();
    this.playerDrone.setVisible(false);
    this.setScreenState('title');
  }

  public toggleMute(): boolean {
    const next = !this.sound.isMuted();
    this.sound.setMuted(next);
    this.voice.setMuted(next);
    return next;
  }

  public isMuted(): boolean {
    return this.sound.isMuted();
  }

  public deployNextDrone(): void {
    if (this.screenState !== 'trench') return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.controls.clearHeldInputs();
    this.trenchView.hide();
    this.playerDrone.reset();
    this.setScreenState('playing');
    this.pushHUDUpdate({
      speedKmh: 0,
      altitude: 9.4,
      isBoosting: false,
      crashed: false,
      bumped: false,
      bumpDamage: 0,
      pitchDeg: -8,
      rollDeg: 0,
      yawDeg: 0,
      voltage: 25.2,
      rocketsLeft: MAX_ROCKETS_PER_DRONE,
      rocketCooldown: 0,
    });
    this.controls.requestPointerLock();
  }

  private registerPlayerKill(title: string, basePoints: number): void {
    if (this.elapsedTime - this.lastKillTime < 6.5) {
      this.killStreak++;
    } else {
      this.killStreak = 1;
    }
    this.lastKillTime = this.elapsedTime;
    const bonus = this.killStreak >= 2 ? (this.killStreak - 1) * 50 : 0;
    const totalPoints = Math.round((basePoints + bonus) * this.getDifficulty().scoreMult);
    this.score += totalPoints;
    this.sound.playKillConfirm();
    this.emitBanner(
      this.killStreak >= 2 ? `${title} · RACHA x${this.killStreak}` : title,
      totalPoints
    );
    if (this.killStreak === 3) {
      this.emitRadio(
        '¡Triple baja confirmada, excelente puntería Águila!',
        'COMANDANTE',
        'CÓNDOR-1 · COMANDANTE',
        4000,
        false
      );
    }
  }

  private detonateBarrel(barrel: ExplosiveBarrel): void {
    if (barrel.exploded) return;
    barrel.exploded = true;
    barrel.mesh.visible = false;
    this.sound.playBarrelExplosion();
    this.handleSplashExplosion(barrel.position, 9.5, 110, 'BARRIL DE COMBUSTIBLE');
  }

  private handleSplashExplosion(
    center: THREE.Vector3,
    blastRadius: number,
    maxDamage: number,
    sourceLabel: string
  ): void {
    this.effects.createExplosion(center, 0xff5500, 38);
    this.enemyManager.alertNearbyToExplosion(center, 28);
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.032);

    for (let i = 0; i < this.enemyManager.enemies.length; i++) {
      const enemy = this.enemyManager.enemies[i];
      if (!enemy.alive) continue;
      const dist = enemy.position.distanceTo(center);
      if (dist <= blastRadius) {
        const dmg = computeSplashDamage(dist, blastRadius, maxDamage);
        if (this.enemyManager.damageEnemy(enemy, dmg, this.effects)) {
          this.enemiesDestroyed++;
          this.registerPlayerKill(`${sourceLabel} · ${enemy.role}`, 300);
          this.emitFeed(`[${sourceLabel}] ${enemy.role} (+300)`, 'kill');
        }
      }
    }

    const allyDangerRadius = blastRadius * 0.7;
    for (let i = 0; i < this.allyManager.allies.length; i++) {
      const ally = this.allyManager.allies[i];
      if (!ally.alive) continue;
      const dist = ally.position.distanceTo(center);
      if (dist <= allyDangerRadius) {
        this.allyManager.damageAlly(
          ally,
          computeSplashDamage(dist, allyDangerRadius, 55),
          this.effects
        );
      }
    }

    for (let i = 0; i < this.targetManager.targets.length; i++) {
      const target = this.targetManager.targets[i];
      if (target.destroyed) continue;
      const dist = target.position.distanceTo(center);
      if (dist <= target.radius + blastRadius * 0.45) {
        const destroyed = this.targetManager.damageTarget(target, 42, this.effects);
        if (destroyed) {
          this.renderer.shadowMap.needsUpdate = true;
          this.registerPlayerKill(target.name, 550);
          this.emitFeed(`[OBJETIVO] ${target.name} (+550)`, 'kill');
          this.announceTargetMilestone();
        }
      }
    }

    for (let i = 0; i < this.world.explosiveBarrels.length; i++) {
      const b = this.world.explosiveBarrels[i];
      if (!b.exploded && b.position.distanceTo(center) <= blastRadius * 0.85) {
        this.detonateBarrel(b);
      }
    }
  }

  private handleDroneDetonation(
    impactPosition: THREE.Vector3,
    reasonTitle: string
  ): void {
    if (this.screenState !== 'playing') return;

    this.effects.createExplosion(impactPosition, 0xff4400, 44);
    this.enemyManager.alertNearbyToExplosion(impactPosition, 26);
    this.trauma = Math.min(1.0, this.trauma + 0.85);
    this.hitstopTimer = 0.045;

    const blastRadius = 8.5;
    for (let i = 0; i < this.enemyManager.enemies.length; i++) {
      const enemy = this.enemyManager.enemies[i];
      if (!enemy.alive) continue;
      const dist = enemy.position.distanceTo(impactPosition);
      if (dist <= blastRadius) {
        const dmg = computeSplashDamage(dist, blastRadius, 100);
        if (this.enemyManager.damageEnemy(enemy, dmg, this.effects)) {
          this.enemiesDestroyed++;
          this.score += 350;
          this.sound.playKillConfirm();
          this.emitBanner(`EXPLOSIÓN DE ÁREA · ${enemy.role}`, 350);
          this.emitFeed(`[BAJA] ${enemy.role} (+350)`, 'kill');
        }
      }
    }

    for (let i = 0; i < this.targetManager.targets.length; i++) {
      const target = this.targetManager.targets[i];
      if (target.destroyed) continue;
      const dist = target.position.distanceTo(impactPosition);
      if (dist <= target.radius + 3.4) {
        const destroyed = this.targetManager.damageTarget(target, 100, this.effects);
        if (destroyed) {
          this.renderer.shadowMap.needsUpdate = true;
          const pts = Math.round(750 * this.getDifficulty().scoreMult);
          this.score += pts;
          this.sound.playKillConfirm();
          this.emitBanner(`ESTRUCTURA DESTRUIDA · ${target.name}`, pts);
          this.emitFeed(`[OBJETIVO] ${target.name} (+${pts})`, 'kill');
        }
      }
    }

    this.dronesRemaining--;
    if (this.dronesRemaining <= 0) {
      this.emitRadio(
        '¡Sin drones en reserva! Posición sobrepasada, repliegue inmediato.',
        'COMANDANTE',
        'CÓNDOR-1 · COMANDANTE',
        5000,
        true
      );
      this.endMission(
        false,
        'Has agotado todos los drones FPV de tu mochila táctica.'
      );
      return;
    }

    this.playerDrone.setVisible(false);
    this.sound.updateEngine(0, false, true);
    this.controls.releasePointer();
    this.controls.clearHeldInputs();

    const msgs = [
      '¡Impacto confirmado! Recarga otro dron desde la trinchera, seguimos avanzando.',
      '¡Buen golpe, Águila! Vuelve al búnker y despliega la siguiente unidad.',
      'Mantenemos el sector abierto. Prepara el próximo FPV cuando estés listo.',
    ];
    this.emitRadio(
      msgs[Math.floor(Math.random() * msgs.length)],
      'COMANDANTE',
      'CÓNDOR-1 · COMANDANTE',
      5400,
      false
    );

    this.trenchView.show(this.allyManager.getAllies());
    this.setScreenState('trench');
    this.callbacks.onTrenchPrompt({
      dronesRemaining: this.dronesRemaining,
      reasonTitle,
      alliesAlive: this.allyManager.getAliveCount(),
      alliesTotal: this.allyManager.getAllies().length,
    });
  }

  private endMission(victory: boolean, reason: string): void {
    this.sound.stopEngine();
    this.trenchView.hide();
    this.playerDrone.setVisible(false);
    this.controls.releasePointer();
    this.controls.clearHeldInputs();

    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      try {
        localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(this.bestScore));
      } catch {
        // Safe no-op
      }
    }

    const diff = this.getDifficulty();
    this.setScreenState('gameover');
    this.callbacks.onEndMission({
      victory,
      mapId: this.currentMapId,
      mapName: BATTLEFIELD_MAPS[this.currentMapId].name,
      difficultyId: this.currentDifficultyId,
      difficultyName: diff.name,
      reason,
      elapsedTime: this.elapsedTime,
      targetsDestroyed: this.targetManager.getDestroyedCount(),
      totalTargets: this.targetManager.totalTargets,
      enemiesDestroyed: this.enemiesDestroyed,
      dronesUsed: diff.dronesReserve - this.dronesRemaining,
      maxDrones: diff.dronesReserve,
      alliesAlive: this.allyManager.getAliveCount(),
      alliesTotal: this.allyManager.getAllies().length,
      allyLosses: this.allyManager.allyLosses,
      score: this.score,
      bestScore: this.bestScore,
    });
  }

  private checkCollisions(): void {
    const playerPos = this.playerDrone.position;
    const playerActive = this.screenState === 'playing';

    for (let i = this.effects.projectiles.length - 1; i >= 0; i--) {
      const proj = this.effects.projectiles[i];
      const p0 = proj.prevPos;
      const p1 = proj.mesh.position;
      let hit = false;

      if (proj.isEnemy) {
        if (playerActive && segmentHitsSphere(p0, p1, playerPos, 1.15)) {
          this.playerDrone.takeDamage(16);
          this.callbacks.onDamageFlash();
          this.effects.createImpact(p1, 0xff5522, 6);
          this.trauma = Math.min(1.0, this.trauma + 0.34);
          hit = true;
        } else {
          const allyBulletDmg = Math.round(24 * this.getDifficulty().enemyDamageMult);
          for (let aIdx = 0; aIdx < this.allyManager.allies.length; aIdx++) {
            const ally = this.allyManager.allies[aIdx];
            if (!ally.alive) continue;
            _allyCenter.set(ally.position.x, ally.position.y + 0.95, ally.position.z);
            if (segmentHitsSphere(p0, p1, _allyCenter, 1.05)) {
              this.allyManager.damageAlly(ally, allyBulletDmg, this.effects);
              this.effects.createImpact(p1, 0xff5522, 5);
              hit = true;
              break;
            }
          }
        }
      } else {
        for (let bIdx = 0; bIdx < this.world.explosiveBarrels.length; bIdx++) {
          const barrel = this.world.explosiveBarrels[bIdx];
          if (!barrel.exploded && segmentHitsSphere(p0, p1, barrel.position, 1.0)) {
            this.detonateBarrel(barrel);
            hit = true;
            break;
          }
        }

        if (!hit) {
          for (let eIdx = 0; eIdx < this.enemyManager.enemies.length; eIdx++) {
            const enemy = this.enemyManager.enemies[eIdx];
            if (!enemy.alive) continue;
            _enemyCenter.set(enemy.position.x, enemy.position.y + 1.0, enemy.position.z);
            if (segmentHitsSphere(p0, p1, _enemyCenter, 1.35)) {
              if (proj.isRocket) {
                this.handleSplashExplosion(p1.clone(), 7.6, 85, 'COHETE HE');
              } else if (proj.owner?.ally) {
                if (this.enemyManager.damageEnemy(enemy, 9, this.effects)) {
                  this.enemiesDestroyed++;
                  this.score += 80;
                  this.emitFeed(
                    `[ALIADO] ${proj.owner.ally.name} · ${enemy.role} (+80)`,
                    'ally'
                  );
                }
              } else {
                this.sound.playHitMarker();
                this.callbacks.onHitMarker();
                if (this.enemyManager.damageEnemy(enemy, 26, this.effects)) {
                  this.enemiesDestroyed++;
                  this.hitstopTimer = 0.028;
                  this.registerPlayerKill(enemy.role, 250);
                  this.emitFeed(`[BAJA] ${enemy.role} (+250)`, 'kill');
                } else {
                  this.score += 25;
                }
              }
              this.effects.createImpact(p1, 0xffaa55, 5);
              hit = true;
              break;
            }
          }
        }

        if (!hit) {
          for (let tIdx = 0; tIdx < this.targetManager.targets.length; tIdx++) {
            const target = this.targetManager.targets[tIdx];
            if (!target.destroyed && segmentHitsSphere(p0, p1, target.position, target.radius)) {
              if (proj.isRocket) {
                this.handleSplashExplosion(p1.clone(), 7.6, 85, 'COHETE HE');
                hit = true;
                break;
              }
              if (!proj.owner?.ally) {
                this.sound.playHitMarker();
                this.callbacks.onHitMarker();
              }
              const destroyed = this.targetManager.damageTarget(target, 30, this.effects);
              if (destroyed) {
                this.renderer.shadowMap.needsUpdate = true;
                this.hitstopTimer = 0.04;
                if (proj.owner?.ally) {
                  this.score += 250;
                  this.emitFeed(
                    `[ALIADO] ${proj.owner.ally.name} · ${target.name} (+250)`,
                    'ally'
                  );
                } else {
                  this.registerPlayerKill(target.name, 500);
                  this.emitFeed(`[OBJETIVO] ${target.name} (+500)`, 'kill');
                }
                this.announceTargetMilestone();
              }
              this.effects.createImpact(p1, 0xffaa55, 6);
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

    if (!playerActive) return;

    const droneSpeed = this.playerDrone.velocity.length();
    if (droneSpeed >= 6.5) {
      for (let i = 0; i < this.enemyManager.enemies.length; i++) {
        const enemy = this.enemyManager.enemies[i];
        if (enemy.alive && enemy.position.distanceTo(playerPos) < 1.85) {
          this.handleDroneDetonation(
            playerPos.clone(),
            'IMPACTO KAMIKAZE // C4 DETONADO'
          );
          return;
        }
      }
    }

    for (let i = 0; i < this.targetManager.targets.length; i++) {
      const target = this.targetManager.targets[i];
      if (target.destroyed) continue;
      const dist = target.position.distanceTo(playerPos);
      if (dist < target.radius * 0.65 || (droneSpeed >= 7.5 && dist < target.radius)) {
        this.handleDroneDetonation(
          playerPos.clone(),
          'ESTRUCTURA IMPACTADA // EXPLOSIÓN'
        );
        return;
      }
    }
  }

  private announceTargetMilestone(): void {
    const count = this.targetManager.getDestroyedCount();
    const remaining = this.targetManager.totalTargets - count;
    if (count === 1) {
      this.emitRadio(
        `¡Primer puesto fortificado neutralizado! Faltan ${remaining} objetivos, sigan presionando.`,
        'COMANDANTE',
        'CÓNDOR-1 · COMANDANTE',
        4800
      );
    } else if (count === 3) {
      this.emitRadio(
        `Mitad de la línea enemiga destruida. ¡Buen trabajo Águila y Escuadrón Alfa!`,
        'COMANDANTE',
        'CÓNDOR-1 · COMANDANTE',
        4800
      );
    } else if (count === 5) {
      this.emitRadio(
        `¡Solo queda un objetivo hostil! Concentren fuego para asegurar la extracción.`,
        'COMANDANTE',
        'CÓNDOR-1 · COMANDANTE',
        4800
      );
    }
  }

  private computeObjectiveGuidance(): ObjectiveGuidance | null {
    if (this.targetManager.extractionActive) {
      const ex = this.targetManager.extractionPos;
      const dist = Math.round(
        Math.hypot(ex.x - this.playerDrone.position.x, ex.z - this.playerDrone.position.z)
      );
      return {
        label: 'ZONA DE EXTRACCIÓN',
        distanceMeters: dist,
        relativeBearingDeg: computeRelativeBearingDeg(
          this.playerDrone.position.x,
          this.playerDrone.position.z,
          this.playerDrone.yaw,
          ex.x,
          ex.z
        ),
        isExtraction: true,
      };
    }

    let nearestDist = Infinity;
    let nearestTarget: { name: string; x: number; z: number } | null = null;
    for (let i = 0; i < this.targetManager.targets.length; i++) {
      const t = this.targetManager.targets[i];
      if (t.destroyed) continue;
      const d = Math.hypot(
        t.position.x - this.playerDrone.position.x,
        t.position.z - this.playerDrone.position.z
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearestTarget = { name: t.name, x: t.position.x, z: t.position.z };
      }
    }

    if (!nearestTarget) return null;
    return {
      label: nearestTarget.name,
      distanceMeters: Math.round(nearestDist),
      relativeBearingDeg: computeRelativeBearingDeg(
        this.playerDrone.position.x,
        this.playerDrone.position.z,
        this.playerDrone.yaw,
        nearestTarget.x,
        nearestTarget.z
      ),
      isExtraction: false,
    };
  }

  private applyCameraShake(dt: number): void {
    if (this.trauma <= 0.001) return;
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const shake = this.trauma * this.trauma;
    this.camera.position.x += (Math.random() - 0.5) * shake * 0.55;
    this.camera.position.y += (Math.random() - 0.5) * shake * 0.55;
    this.camera.position.z += (Math.random() - 0.5) * shake * 0.55;
    this.camera.rotateZ((Math.random() - 0.5) * shake * 0.045);
  }

  private pushHUDUpdate(telemetry: DroneTelemetry): void {
    const radarEntities: RadarEntity[] = [
      {
        x: this.targetManager.extractionPos.x,
        z: this.targetManager.extractionPos.z,
        kind: 'extraction',
        active: this.targetManager.extractionActive,
      },
    ];

    for (let i = 0; i < this.targetManager.targets.length; i++) {
      const t = this.targetManager.targets[i];
      if (!t.destroyed) {
        radarEntities.push({ x: t.position.x, z: t.position.z, kind: 'target' });
      }
    }
    for (let i = 0; i < this.enemyManager.enemies.length; i++) {
      const e = this.enemyManager.enemies[i];
      if (e.alive) {
        radarEntities.push({
          x: e.position.x,
          z: e.position.z,
          kind: 'enemy',
          urgent: e.threateningPlayer,
        });
      }
    }
    for (let i = 0; i < this.allyManager.allies.length; i++) {
      const a = this.allyManager.allies[i];
      if (a.alive) {
        radarEntities.push({
          x: a.position.x,
          z: a.position.z,
          kind: 'ally',
          urgent: a.state === 'COMBATE',
        });
      }
    }

    const gpInfo = this.controls.getGamepadInfo();
    const diff = this.getDifficulty();

    this.callbacks.onHUDUpdate({
      mapId: this.currentMapId,
      mapName: BATTLEFIELD_MAPS[this.currentMapId].name,
      difficultyId: this.currentDifficultyId,
      difficultyName: diff.name,
      elapsedTime: this.elapsedTime,
      score: this.score,
      killStreak: this.killStreak,
      dronesRemaining: this.dronesRemaining,
      maxDrones: diff.dronesReserve,
      rocketsLeft: telemetry.rocketsLeft,
      maxRockets: MAX_ROCKETS_PER_DRONE,
      rocketCooldown: telemetry.rocketCooldown,
      targetsDestroyed: this.targetManager.getDestroyedCount(),
      totalTargets: this.targetManager.totalTargets,
      enemiesAlive: this.enemyManager.getAliveCount(),
      enemiesDestroyed: this.enemiesDestroyed,
      allyLosses: this.allyManager.allyLosses,
      squadOrder: this.squadOrder,
      allies: this.allyManager.allies.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        alive: a.alive,
        hp: a.hp,
        maxHp: a.maxHp,
        state: a.state,
        x: a.position.x,
        z: a.position.z,
      })),
      hp: this.playerDrone.hp,
      battery: this.playerDrone.battery,
      voltage: telemetry.voltage,
      altitude: telemetry.altitude,
      speedKmh: telemetry.speedKmh,
      pitchDeg: telemetry.pitchDeg,
      rollDeg: telemetry.rollDeg,
      yawDeg: telemetry.yawDeg,
      flightMode: this.playerDrone.flightMode,
      opticsThermal: this.playerDrone.opticsThermal,
      underFire: this.underFire,
      sniperLock: this.sniperLock,
      extractionActive: this.targetManager.extractionActive,
      phaseLabel: this.phaseLabel,
      guidance: this.computeObjectiveGuidance(),
      gamepadConnected: gpInfo.connected,
      gamepadName: gpInfo.name,
      pointerLocked: this.controls.isPointerLocked(),
      dronePos: {
        x: this.playerDrone.position.x,
        z: this.playerDrone.position.z,
        yaw: this.playerDrone.yaw,
      },
      radarEntities,
    });
  }

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => {
        if (!this.disposed) this.tick();
      });
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      let polls = 0;
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        polls++;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED && polls < 24) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick = (): void => {
    if (this.disposed) return;

    const nowMs = performance.now();
    const rawDt = (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (this.screenState === 'title') {
      // Live World Camera Tour around the burning trench battlefield
      this.tourTime += dt;
      this.world.update(dt, this.tourTime);
      this.targetManager.update(dt, this.tourTime);
      this.effects.update(dt);

      const angle = this.tourTime * 0.14;
      this.camera.fov = 72;
      this.camera.position.set(
        Math.sin(angle) * 78,
        24 + Math.sin(this.tourTime * 0.4) * 4,
        Math.cos(angle) * 72 + 12
      );
      this.camera.lookAt(_tourTarget);
      this.camera.updateProjectionMatrix();

      // Poll gamepad on title screen so controller detection shows immediately
      this.controls.getInput();
    } else if (this.screenState === 'playing' || this.screenState === 'trench') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
        this.applyCameraShake(dt);
      } else {
        this.elapsedTime += dt;
        this.effects.update(
          dt,
          this.playerDrone.position,
          this.screenState === 'playing'
        );
        this.world.update(dt, this.elapsedTime);
        this.targetManager.update(dt, this.elapsedTime);
        const diff = this.getDifficulty();
        this.allyManager.update(
          dt,
          this.enemyManager.enemies,
          this.effects,
          this.playerDrone.position,
          this.squadOrder,
          this.elapsedTime,
          diff
        );

        const input = this.controls.getInput();
        let telemetry: DroneTelemetry | null = null;

        if (this.screenState === 'playing') {
          telemetry = this.playerDrone.update(
            dt,
            input,
            this.world,
            this.effects,
            this.elapsedTime
          );
          this.applyCameraShake(dt);

          if (telemetry.bumped && telemetry.bumpDamage > 0) {
            this.trauma = Math.min(1.0, this.trauma + 0.25);
            this.callbacks.onDamageFlash();
          }

          if (telemetry.crashed) {
            this.handleDroneDetonation(
              this.playerDrone.position.clone(),
              'ACCIDENTE EN TERRENO // PÉRDIDA DE UNIDAD'
            );
          }
        } else if (this.screenState === 'trench') {
          this.trenchView.update(dt, input.yaw * 0.65, input.pitch * 0.65);
          if (input.deployPressed) {
            this.deployNextDrone();
          }
        }

        if (this.elapsedTime > 55) {
          this.reinforcementTimer -= dt;
          if (this.reinforcementTimer <= 0) {
            this.reinforcementTimer = 36 + Math.random() * 14;
            const spawned = this.enemyManager.reinforce(3, diff);
            if (spawned > 0) {
              this.emitRadio(
                `¡Refuerzos enemigos al norte! ${spawned} contactos nuevos avanzan hacia las casas.`,
                'COMANDANTE',
                'CÓNDOR-1 · COMANDANTE',
                5200
              );
            }
          }
        }

        const threat = this.enemyManager.update(
          dt,
          this.playerDrone,
          this.effects,
          this.allyManager.getAllies(),
          this.screenState === 'playing',
          this.elapsedTime,
          diff
        );
        this.underFire = threat.underFire;
        this.sniperLock = threat.sniperLock;

        if (this.sniperLock && this.screenState === 'playing') {
          this.sound.playLaserLockWarning();
          if (this.elapsedTime - this.lastLaserWarnTime > 12) {
            this.lastLaserWarnTime = this.elapsedTime;
            this.emitRadio(
              '¡Alerta Águila! Tirador con láser fijándote, entra a una casa o esquiva.',
              'ESCUADRÓN',
              'CABO RÍOS · ALFA',
              4200
            );
          }
        }

        this.checkCollisions();

        if (this.screenState === 'playing') {
          if (this.playerDrone.hp <= 0) {
            this.handleDroneDetonation(
              this.playerDrone.position.clone(),
              'DRON ABATIDO POR FUEGO HOSTIL'
            );
          } else if (this.playerDrone.battery <= 0) {
            this.handleDroneDetonation(
              this.playerDrone.position.clone(),
              'BATERÍA LIPO AGOTADA'
            );
          }
        }

        if (this.screenState === 'playing' && telemetry) {
          const distToExtraction = this.playerDrone.position.distanceTo(
            this.targetManager.extractionPos
          );
          const status = evaluateMissionStatus({
            destroyedTargets: this.targetManager.getDestroyedCount(),
            totalTargets: this.targetManager.totalTargets,
            elapsedTime: this.elapsedTime,
            dronesRemaining: this.dronesRemaining,
            inExtractionZone:
              distToExtraction < this.targetManager.extractionRadius + 2.5,
            extractionActive: this.targetManager.extractionActive,
          });
          this.phaseLabel = status.phaseLabel;

          if (status.shouldActivateExtraction) {
            this.targetManager.setExtractionActive(true);
            this.emitRadio(
              '¡Objetivos eliminados y asedio resistido! Zona de extracción verde activa al norte. ¡Vuelve a casa, Águila!',
              'COMANDANTE',
              'CÓNDOR-1 · COMANDANTE',
              6800,
              true
            );
          }

          if (status.outcome === 'victory') {
            this.score += 1200;
            this.emitRadio(
              '¡Extracción exitosa, Águila! Excelente cobertura sobre el sector.',
              'COMANDANTE',
              'CÓNDOR-1 · COMANDANTE',
              7000,
              true
            );
            this.endMission(
              true,
              'Has destruido los 6 objetivos, resistido el asedio y asegurado la extracción.'
            );
          }

          this.hudAccum += dt;
          if (this.hudAccum >= 0.1 && this.screenState === 'playing') {
            this.hudAccum = 0;
            this.pushHUDUpdate(telemetry);
          }
        } else if (this.screenState === 'trench') {
          this.hudAccum += dt;
          if (this.hudAccum >= 0.2) {
            this.hudAccum = 0;
            this.pushHUDUpdate({
              speedKmh: 0,
              altitude: 0,
              isBoosting: false,
              crashed: false,
              bumped: false,
              bumpDamage: 0,
              pitchDeg: 0,
              rollDeg: 0,
              yawDeg: 0,
              voltage: 25.2,
              rocketsLeft: MAX_ROCKETS_PER_DRONE,
              rocketCooldown: 0,
            });
          }
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextTick();
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.handleContextLost
    );
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored
    );
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.handleTrenchMouseLook);
    window.removeEventListener('keydown', this.handleGlobalHotkeys);

    this.controls.dispose();
    this.voice.dispose();
    this.sound.dispose();
    this.textures.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
