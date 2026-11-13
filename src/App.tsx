import { useCallback, useEffect, useRef, useState } from 'react';
import { GameModals } from './components/GameModals';
import { TacticalHUD } from './components/TacticalHUD';
import {
  BATTLEFIELD_MAPS,
  DIFFICULTIES,
  MAX_ROCKETS_PER_DRONE,
  TOTAL_MISSION_TARGETS,
} from './game/rules';
import { FPVSimulator } from './game/simulator';
import type {
  DifficultyId,
  EndMissionSummary,
  GameScreenState,
  HUDTelemetrySnapshot,
  KillBannerData,
  KillFeedEntry,
  MapId,
  RadioMessageData,
  TrenchPromptData,
} from './game/types';

const INITIAL_HUD: HUDTelemetrySnapshot = {
  mapId: 'trinchera',
  mapName: BATTLEFIELD_MAPS.trinchera.name,
  difficultyId: 'tactico',
  difficultyName: DIFFICULTIES.tactico.name,
  elapsedTime: 0,
  score: 0,
  killStreak: 0,
  dronesRemaining: DIFFICULTIES.tactico.dronesReserve,
  maxDrones: DIFFICULTIES.tactico.dronesReserve,
  rocketsLeft: MAX_ROCKETS_PER_DRONE,
  maxRockets: MAX_ROCKETS_PER_DRONE,
  rocketCooldown: 0,
  targetsDestroyed: 0,
  totalTargets: TOTAL_MISSION_TARGETS,
  enemiesAlive: 18,
  enemiesDestroyed: 0,
  allyLosses: 0,
  squadOrder: 'ESCOLTA',
  allies: [],
  hp: 100,
  battery: 100,
  voltage: 25.2,
  altitude: 10,
  speedKmh: 0,
  pitchDeg: -8,
  rollDeg: 0,
  yawDeg: 0,
  flightMode: 'ESTABILIZADO',
  opticsThermal: false,
  underFire: false,
  sniperLock: false,
  extractionActive: false,
  phaseLabel: 'FASE 1: BARRER TRINCHERAS',
  guidance: null,
  gamepadConnected: false,
  gamepadName: '',
  pointerLocked: false,
  dronePos: { x: 0, z: 94, yaw: 0 },
  radarEntities: [],
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<FPVSimulator | null>(null);

  const [screenState, setScreenState] = useState<GameScreenState>('title');
  const [selectedMap, setSelectedMap] = useState<MapId>('trinchera');
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyId>('tactico');
  const [hud, setHud] = useState<HUDTelemetrySnapshot>(INITIAL_HUD);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [killBanner, setKillBanner] = useState<KillBannerData | null>(null);
  const [radioMessage, setRadioMessage] = useState<RadioMessageData | null>(null);
  const [damageFlash, setDamageFlash] = useState(false);
  const [hitMarkerActive, setHitMarkerActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [gamepadInfo, setGamepadInfo] = useState({ connected: false, name: '' });
  const [trenchData, setTrenchData] = useState<TrenchPromptData | null>(null);
  const [endSummary, setEndSummary] = useState<EndMissionSummary | null>(null);

  const bannerTimerRef = useRef<number>(0);
  const radioTimerRef = useRef<number>(0);
  const damageTimerRef = useRef<number>(0);
  const hitTimerRef = useRef<number>(0);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const sim = new FPVSimulator(container, {
      onStateChange: (next) => {
        setScreenState(next);
        if (next === 'playing') {
          setTrenchData(null);
        }
      },
      onHUDUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onKillFeed: (entry) => {
        setKillFeed((prev) => [entry, ...prev].slice(0, 5));
        window.setTimeout(() => {
          setKillFeed((prev) => prev.filter((item) => item.id !== entry.id));
        }, 4800);
      },
      onKillBanner: (banner) => {
        setKillBanner(banner);
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = window.setTimeout(() => {
          setKillBanner(null);
        }, 2300);
      },
      onRadioMessage: (msg) => {
        setRadioMessage(msg);
        clearTimeout(radioTimerRef.current);
        radioTimerRef.current = window.setTimeout(() => {
          setRadioMessage(null);
        }, msg.durationMs);
      },
      onDamageFlash: () => {
        setDamageFlash(true);
        clearTimeout(damageTimerRef.current);
        damageTimerRef.current = window.setTimeout(() => {
          setDamageFlash(false);
        }, 170);
      },
      onHitMarker: () => {
        setHitMarkerActive(true);
        clearTimeout(hitTimerRef.current);
        hitTimerRef.current = window.setTimeout(() => {
          setHitMarkerActive(false);
        }, 180);
      },
      onTrenchPrompt: (data) => {
        setTrenchData(data);
      },
      onEndMission: (summary) => {
        setEndSummary(summary);
      },
      onGamepadStatus: (connected, name) => {
        setGamepadInfo({ connected, name });
      },
    });

    simRef.current = sim;

    // Support ?map=trinchera|desierto|ciudad, ?diff=recluta|tactico|veterano|realista and ?autostart=1
    const params = new URLSearchParams(window.location.search);
    const mapParam = params.get('map');
    const initialMap: MapId =
      mapParam === 'desierto' || mapParam === 'ciudad' || mapParam === 'trinchera'
        ? mapParam
        : 'trinchera';
    const diffParam = params.get('diff');
    const initialDiff: DifficultyId =
      diffParam === 'recluta' ||
      diffParam === 'tactico' ||
      diffParam === 'veterano' ||
      diffParam === 'realista'
        ? diffParam
        : 'tactico';
    if (initialDiff !== 'tactico') {
      setSelectedDifficulty(initialDiff);
      sim.selectDifficulty(initialDiff);
    }
    if (initialMap !== 'trinchera') {
      setSelectedMap(initialMap);
      sim.selectMap(initialMap);
    }
    if (params.get('autostart') === '1') {
      sim.startMission(false, initialMap, initialDiff);
    }

    return () => {
      clearTimeout(bannerTimerRef.current);
      clearTimeout(radioTimerRef.current);
      clearTimeout(damageTimerRef.current);
      clearTimeout(hitTimerRef.current);
      sim.dispose();
      simRef.current = null;
    };
  }, []);

  const handleSelectMap = useCallback((mapId: MapId) => {
    setSelectedMap(mapId);
    simRef.current?.selectMap(mapId);
  }, []);

  const handleSelectDifficulty = useCallback((diffId: DifficultyId) => {
    setSelectedDifficulty(diffId);
    simRef.current?.selectDifficulty(diffId);
  }, []);

  const handleStart = useCallback(() => {
    setKillFeed([]);
    setKillBanner(null);
    setEndSummary(null);
    simRef.current?.startMission(true, selectedMap, selectedDifficulty);
  }, [selectedMap, selectedDifficulty]);

  const handleDeployNext = useCallback(() => {
    simRef.current?.deployNextDrone();
  }, []);

  const handleResume = useCallback(() => {
    simRef.current?.resumeMission();
  }, []);

  const handleReturnToTitle = useCallback(() => {
    simRef.current?.returnToTitle();
  }, []);

  const handleToggleMute = useCallback(() => {
    if (!simRef.current) return;
    setMuted(simRef.current.toggleMute());
  }, []);

  const handlePause = useCallback(() => {
    simRef.current?.pauseMission();
  }, []);

  const handleToggleSquadOrder = useCallback(() => {
    simRef.current?.toggleSquadOrder();
  }, []);

  const handleRequestCommanderReport = useCallback(() => {
    simRef.current?.requestCommanderReport();
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#080a0c]">
      {/* Isolated WebGL canvas mount — never torn down by React HUD updates */}
      <div
        ref={mountRef}
        className="fixed inset-0 z-0 h-full w-full"
        aria-label="Escena 3D de combate FPV"
      />

      <TacticalHUD
        screenState={screenState}
        hud={hud}
        killFeed={killFeed}
        killBanner={killBanner}
        radioMessage={radioMessage}
        damageFlash={damageFlash}
        hitMarkerActive={hitMarkerActive}
        muted={muted}
        onToggleMute={handleToggleMute}
        onPause={handlePause}
        onToggleSquadOrder={handleToggleSquadOrder}
        onRequestCommanderReport={handleRequestCommanderReport}
      />

      <GameModals
        screenState={screenState}
        selectedMap={selectedMap}
        selectedDifficulty={selectedDifficulty}
        gamepadConnected={gamepadInfo.connected}
        gamepadName={gamepadInfo.name}
        trenchData={trenchData}
        endSummary={endSummary}
        onSelectMap={handleSelectMap}
        onSelectDifficulty={handleSelectDifficulty}
        onStart={handleStart}
        onDeployNext={handleDeployNext}
        onResume={handleResume}
        onRestart={handleStart}
        onReturnToTitle={handleReturnToTitle}
      />
    </main>
  );
}
