import { useState } from 'react';
import {
  BATTLEFIELD_MAPS,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  MAP_ORDER,
} from '../game/rules';
import type {
  DifficultyId,
  EndMissionSummary,
  GameScreenState,
  MapId,
  TrenchPromptData,
} from '../game/types';

interface GameModalsProps {
  screenState: GameScreenState;
  selectedMap: MapId;
  selectedDifficulty: DifficultyId;
  gamepadConnected: boolean;
  gamepadName: string;
  trenchData: TrenchPromptData | null;
  endSummary: EndMissionSummary | null;
  onSelectMap: (mapId: MapId) => void;
  onSelectDifficulty: (diffId: DifficultyId) => void;
  onStart: () => void;
  onDeployNext: () => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnToTitle: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
}

export function GameModals({
  screenState,
  selectedMap,
  selectedDifficulty,
  gamepadConnected,
  gamepadName,
  trenchData,
  endSummary,
  onSelectMap,
  onSelectDifficulty,
  onStart,
  onDeployNext,
  onResume,
  onRestart,
  onReturnToTitle,
}: GameModalsProps) {
  const [showControls, setShowControls] = useState(false);

  if (screenState === 'title') {
    const activeMap = BATTLEFIELD_MAPS[selectedMap];
    const activeDiff = DIFFICULTIES[selectedDifficulty];

    return (
      <div className="fixed inset-0 z-40 flex items-center overflow-y-auto bg-gradient-to-r from-[#07090c]/95 via-[#07090c]/75 to-transparent p-5 sm:p-10">
        <div className="w-full max-w-2xl rounded-2xl border border-slate-500/20 bg-[#0b0e14]/88 p-5 shadow-2xl sm:p-7">
          {/* Crest Lockup */}
          <div className="mb-4 flex items-center gap-3.5">
            <svg
              width="42"
              height="42"
              viewBox="0 0 48 48"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <circle cx="11" cy="11" r="6" stroke="#f57c00" strokeWidth="2" />
              <circle cx="37" cy="11" r="6" stroke="#f57c00" strokeWidth="2" />
              <circle cx="11" cy="37" r="6" stroke="#f57c00" strokeWidth="2" />
              <circle cx="37" cy="37" r="6" stroke="#f57c00" strokeWidth="2" />
              <path
                d="M15.5 15.5L32.5 32.5M32.5 15.5L15.5 32.5"
                stroke="#e2e8f0"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <polygon
                points="24,14 31,24 24,34 17,24"
                fill="#0b0e12"
                stroke="#10b981"
                strokeWidth="2"
              />
              <circle cx="24" cy="24" r="3" fill="#f57c00" />
            </svg>
            <div>
              <div className="font-display text-xs font-semibold tracking-[0.14em] text-amber-400 uppercase">
                Simulador Aéreo &amp; Escuadrón Táctico
              </div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                FPV TACTICAL OPS
              </h1>
            </div>
          </div>

          <p className="mb-5 text-sm leading-relaxed text-slate-300">
            Destruye los 6 puestos fortificados, resiste el asedio junto a tu escuadrón y extrae por la baliza norte.
          </p>

          {/* 3-Map Selector */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-xs font-bold tracking-wider text-slate-200 uppercase">
                Escenario
              </span>
              <span className="font-mono-tech text-[11px] text-slate-400">
                {activeMap.climate}
              </span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {MAP_ORDER.map((id) => {
                const map = BATTLEFIELD_MAPS[id];
                const isActive = selectedMap === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onSelectMap(id)}
                    className={`cursor-pointer rounded-xl border p-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${
                      isActive
                        ? 'border-amber-400 bg-amber-500/15 shadow-md'
                        : 'border-slate-600/30 bg-[#10151e]/85 hover:border-slate-400/55'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono-tech text-[10px] font-bold ${
                          isActive ? 'text-amber-300' : 'text-slate-400'
                        }`}
                      >
                        {map.code}
                      </span>
                      {isActive && (
                        <span className="h-2 w-2 rounded-sm bg-emerald-400" />
                      )}
                    </div>
                    <div className="font-display mt-1 text-sm font-bold text-white">
                      {map.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {map.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4-Difficulty Selector */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-xs font-bold tracking-wider text-slate-200 uppercase">
                Dificultad
              </span>
              <span className="font-mono-tech text-[11px] text-amber-300">
                {activeDiff.summary}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DIFFICULTY_ORDER.map((diffId) => {
                const diff = DIFFICULTIES[diffId];
                const isActive = selectedDifficulty === diffId;
                return (
                  <button
                    key={diffId}
                    type="button"
                    data-difficulty={diffId}
                    aria-pressed={isActive}
                    onClick={() => onSelectDifficulty(diffId)}
                    className={`cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${
                      isActive
                        ? 'border-amber-400 bg-amber-500/15 text-white shadow-sm'
                        : 'border-slate-600/30 bg-[#10151e]/85 text-slate-300 hover:border-slate-400/55'
                    }`}
                  >
                    <div className="font-display text-xs font-bold tracking-wide">
                      {diff.name}
                    </div>
                    <div className="font-mono-tech mt-0.5 text-[10px] text-slate-400">
                      {diff.dronesReserve} FPV · {diff.allyMaxHp} HP
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-start="true"
              onClick={onStart}
              className="font-display cursor-pointer rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold tracking-wide text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
            >
              Entrar en Combate
            </button>

            <button
              type="button"
              aria-expanded={showControls}
              onClick={() => setShowControls((v) => !v)}
              className="font-display cursor-pointer rounded-xl border border-slate-500/35 bg-[#121822]/90 px-4 py-3 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-400 hover:text-white"
            >
              {showControls ? 'Ocultar Controles' : 'Controles'}
            </button>

            <span className="font-mono-tech text-[11px] text-slate-400">
              {gamepadConnected
                ? `Mando activo: ${gamepadName.slice(0, 28)} (R1 OFF)`
                : 'PS4 / DualSense listo · R1 desactivado'}
            </span>
          </div>

          {/* Collapsible Clean Controls Panel */}
          {showControls && (
            <div className="mt-4 grid gap-3 rounded-xl border border-slate-600/30 bg-[#080b10]/90 p-3.5 sm:grid-cols-2">
              <div>
                <div className="font-display mb-1 text-xs font-bold text-amber-400">
                  Teclado + Ratón
                </div>
                <div className="space-y-0.5 text-xs text-slate-300">
                  <div>
                    <strong className="text-white">WASD / Espacio / Shift:</strong> Vuelo y altura
                  </div>
                  <div>
                    <strong className="text-white">Clic / F:</strong> Cañón ·{' '}
                    <strong className="text-white">Q:</strong> Cohete HE
                  </div>
                  <div>
                    <strong className="text-white">E:</strong> Turbo ·{' '}
                    <strong className="text-white">V:</strong> Óptica ·{' '}
                    <strong className="text-white">C:</strong> Acro
                  </div>
                  <div>
                    <strong className="text-white">R:</strong> Radio ·{' '}
                    <strong className="text-white">G:</strong> Escuadrón ·{' '}
                    <strong className="text-white">P:</strong> Pausa
                  </div>
                </div>
              </div>

              <div>
                <div className="font-display mb-1 text-xs font-bold text-emerald-400">
                  Mando PS4 (R1 Desactivado)
                </div>
                <div className="space-y-0.5 text-xs text-slate-300">
                  <div>
                    <strong className="text-white">Sticks:</strong> Desplazar y apuntar
                  </div>
                  <div>
                    <strong className="text-white">Cuadrado (□):</strong> Disparar ·{' '}
                    <strong className="text-white">Triángulo (△):</strong> Cohete
                  </div>
                  <div>
                    <strong className="text-white">Cruz (X):</strong> Turbo ·{' '}
                    <strong className="text-white">R2 / L2:</strong> Subir / Bajar
                  </div>
                  <div>
                    <strong className="text-white">Círculo (○):</strong> Óptica ·{' '}
                    <strong className="text-white">L1:</strong> Acro
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screenState === 'trench' && trenchData) {
    return (
      <div className="pointer-events-none fixed inset-0 z-30 flex items-end justify-center bg-gradient-to-t from-[#050709]/90 via-[#050709]/30 to-transparent p-5 pb-8">
        <div className="trench-interactive pointer-events-auto w-full max-w-xl rounded-2xl border border-slate-500/30 bg-[#0b0e14]/94 p-5 shadow-2xl">
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-bold text-amber-400 sm:text-lg">
              BÚNKER DE LANZAMIENTO
            </h2>
            <span className="font-mono-tech text-xs font-semibold text-emerald-400">
              ESCUADRÓN {trenchData.alliesAlive} / {trenchData.alliesTotal} · DRONES{' '}
              {trenchData.dronesRemaining}
            </span>
          </div>
          <p className="mb-4 text-sm text-slate-300">
            {trenchData.reasonTitle}.
          </p>
          <button
            type="button"
            onClick={onDeployNext}
            className="font-display w-full cursor-pointer rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold tracking-wide text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          >
            Lanzar Siguiente Dron FPV (Espacio / Cruz X / Cuadrado)
          </button>
        </div>
      </div>
    );
  }

  if (screenState === 'paused') {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#050709]/80 p-5">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-title"
          className="w-full max-w-sm rounded-2xl border border-slate-500/30 bg-[#0d1117]/96 p-6 shadow-2xl"
        >
          <div className="font-display text-xs font-semibold tracking-wider text-amber-400 uppercase">
            Simulación en pausa
          </div>
          <h2 id="pause-title" className="font-display mt-1 text-2xl font-bold text-white">
            OPERACIÓN PAUSADA
          </h2>

          <div className="mt-5 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="font-display cursor-pointer rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold tracking-wide text-slate-950 transition-colors hover:bg-amber-400"
            >
              Reanudar Misión
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="font-display cursor-pointer rounded-xl border border-slate-500/35 bg-slate-800/75 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-amber-400"
            >
              Reiniciar Defensa
            </button>
            <button
              type="button"
              onClick={onReturnToTitle}
              className="font-display cursor-pointer rounded-xl border border-slate-600/35 bg-transparent px-5 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:text-white"
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screenState === 'gameover' && endSummary) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#050709]/85 p-5">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-title"
          className="w-full max-w-xl rounded-2xl border border-slate-500/30 bg-[#0d1117]/96 p-6 shadow-2xl"
        >
          <div className="font-display text-xs font-semibold tracking-wider text-amber-400 uppercase">
            {endSummary.mapName} · {endSummary.difficultyName}
          </div>
          <h2
            id="end-title"
            className={`font-display mt-1 text-2xl font-extrabold sm:text-3xl ${
              endSummary.victory ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {endSummary.victory ? 'POSICIÓN ASEGURADA' : 'POSICIÓN PERDIDA'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-300">{endSummary.reason}</p>

          <div className="my-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-700/60 bg-black/40 p-3">
              <div className="text-[11px] text-slate-400">TIEMPO TOTAL</div>
              <div className="font-display tabular-nums mt-0.5 text-lg font-bold text-white">
                {formatTime(endSummary.elapsedTime)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-black/40 p-3">
              <div className="text-[11px] text-slate-400">OBJETIVOS</div>
              <div className="font-display tabular-nums mt-0.5 text-lg font-bold text-white">
                {endSummary.targetsDestroyed} / {endSummary.totalTargets}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-black/40 p-3">
              <div className="text-[11px] text-slate-400">HOSTILES</div>
              <div className="font-display tabular-nums mt-0.5 text-lg font-bold text-white">
                {endSummary.enemiesDestroyed}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-black/40 p-3">
              <div className="text-[11px] text-slate-400">DRONES</div>
              <div className="font-display tabular-nums mt-0.5 text-lg font-bold text-white">
                {endSummary.dronesUsed} / {endSummary.maxDrones}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-black/40 p-3">
              <div className="text-[11px] text-slate-400">ALIADOS EN PIE</div>
              <div className="font-display tabular-nums mt-0.5 text-lg font-bold text-emerald-400">
                {endSummary.alliesAlive} / {endSummary.alliesTotal}
              </div>
            </div>
            <div className="rounded-xl border border-amber-500/45 bg-black/45 p-3">
              <div className="text-[11px] text-slate-400">PUNTUACIÓN</div>
              <div className="font-display tabular-nums mt-0.5 text-lg font-bold text-amber-400">
                {endSummary.score}{' '}
                <span className="text-xs font-normal text-slate-400">
                  / {endSummary.bestScore}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              data-start="true"
              onClick={onRestart}
              className="font-display flex-1 cursor-pointer rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold tracking-wide text-slate-950 transition-colors hover:bg-amber-400"
            >
              Reiniciar Defensa
            </button>
            <button
              type="button"
              onClick={onReturnToTitle}
              className="font-display cursor-pointer rounded-xl border border-slate-600/45 bg-slate-800/75 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:text-white"
            >
              Menú Principal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
