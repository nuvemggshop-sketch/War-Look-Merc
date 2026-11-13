import { SURVIVAL_GOAL_SECONDS } from '../game/rules';
import type {
  GameScreenState,
  HUDTelemetrySnapshot,
  KillBannerData,
  KillFeedEntry,
  RadioMessageData,
} from '../game/types';
import { RadarCanvas } from './RadarCanvas';

interface TacticalHUDProps {
  screenState: GameScreenState;
  hud: HUDTelemetrySnapshot;
  killFeed: KillFeedEntry[];
  killBanner: KillBannerData | null;
  radioMessage: RadioMessageData | null;
  damageFlash: boolean;
  hitMarkerActive: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onToggleSquadOrder: () => void;
  onRequestCommanderReport: () => void;
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

const ALLY_STATE_LABEL: Record<string, string> = {
  COMBATE: 'COMBATE',
  CUBIERTO: 'CUBRIENDO',
  AVANZAR: 'ESCOLTA',
  ESPRINTAR: 'ESPRINT',
  TRINCHERA: 'TRINCHERA',
  PATRULLA: 'EN LÍNEA',
  KIA: 'KIA',
};

function DroneSilhouetteIcon({
  state,
}: {
  state: 'full' | 'current' | 'used';
}) {
  const stroke =
    state === 'current'
      ? '#f57c00'
      : state === 'full'
      ? '#10b981'
      : '#334155';
  const fill =
    state === 'current'
      ? 'rgba(245, 124, 0, 0.25)'
      : state === 'full'
      ? 'rgba(16, 185, 129, 0.22)'
      : 'transparent';

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="5.5" cy="5.5" r="3" stroke={stroke} strokeWidth="1.5" fill={fill} />
      <circle cx="18.5" cy="5.5" r="3" stroke={stroke} strokeWidth="1.5" fill={fill} />
      <circle cx="5.5" cy="18.5" r="3" stroke={stroke} strokeWidth="1.5" fill={fill} />
      <circle cx="18.5" cy="18.5" r="3" stroke={stroke} strokeWidth="1.5" fill={fill} />
      <path
        d="M8 8L16 16M16 8L8 16"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect
        x="9.5"
        y="9.5"
        width="5"
        height="5"
        rx="1.2"
        fill={stroke}
      />
    </svg>
  );
}

export function TacticalHUD({
  screenState,
  hud,
  killFeed,
  killBanner,
  radioMessage,
  damageFlash,
  hitMarkerActive,
  muted,
  onToggleMute,
  onPause,
  onToggleSquadOrder,
  onRequestCommanderReport,
}: TacticalHUDProps) {
  const isPlaying = screenState === 'playing';
  const isTrench = screenState === 'trench';
  const showHud = isPlaying || isTrench;

  if (!showHud) return null;

  const remainingSurvival = Math.max(0, Math.ceil(SURVIVAL_GOAL_SECONDS - hud.elapsedTime));
  const survivalDone = hud.elapsedTime >= SURVIVAL_GOAL_SECONDS;
  const hpPct = Math.max(0, Math.round(hud.hp));
  const batPct = Math.max(0, Math.round(hud.battery));
  const alliesAlive = hud.allies.filter((a) => a.alive).length;

  return (
    <>
      {/* Screen-space FPV Optics & Vignette */}
      <div className="pointer-events-none fixed inset-0 z-10">
        <div className="fpv-scanlines h-full w-full" />
        <div className="fpv-vignette absolute inset-0" />
        {isPlaying && hud.opticsThermal && (
          <div className="fpv-thermal-tint absolute inset-0 border-2 border-emerald-400/25" />
        )}
        <div
          className={`absolute inset-0 transition-opacity duration-150 ${
            damageFlash ? 'fpv-damage-flash opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      {/* Main HUD Container */}
      <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-5">
        {/* Top Row */}
        <div className="flex items-start justify-between gap-3">
          {/* Top-Left: Map, Difficulty & Operation Clock */}
          <div className="rounded-xl border border-slate-500/25 bg-[#0b0e14]/88 px-3.5 py-2.5 shadow-lg">
            <div className="font-display text-[10px] font-semibold tracking-wider text-amber-300/90 uppercase">
              {hud.mapName} · {hud.difficultyName}
            </div>
            <div className="font-display tabular-nums text-xl font-bold text-white sm:text-2xl">
              {formatTime(hud.elapsedTime)}
            </div>
            <div
              className={`font-mono-tech text-[11px] font-medium ${
                survivalDone ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {survivalDone
                ? 'ASEDIO RESISTIDO'
                : `RESISTIR ${formatTime(remainingSurvival)}`}
            </div>
          </div>

          {/* Top-Center: Objectives & Guidance */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="rounded-xl border border-slate-500/25 bg-[#0b0e14]/88 px-4 py-2 text-center shadow-lg">
              <div className="font-display tabular-nums text-xl font-bold text-amber-400 sm:text-2xl">
                {hud.targetsDestroyed} / {hud.totalTargets}
                <span className="ml-2 text-xs font-semibold tracking-wider text-slate-300 uppercase">
                  OBJETIVOS
                </span>
              </div>
              <div className="flex items-center justify-center gap-2 text-[11px] font-medium">
                <span
                  className={
                    hud.extractionActive ? 'text-emerald-400' : 'text-slate-300'
                  }
                >
                  {hud.phaseLabel}
                </span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span
                  className={`font-mono-tech ${
                    hud.enemiesAlive > 16 ? 'text-red-400' : 'text-amber-300'
                  }`}
                >
                  HOSTILES {hud.enemiesAlive}
                </span>
              </div>
            </div>

            {isPlaying && hud.guidance && (
              <div
                className={`rounded-lg border px-3 py-1 font-mono-tech text-[11px] shadow ${
                  hud.guidance.isExtraction
                    ? 'border-emerald-400/55 bg-emerald-950/88 text-emerald-200'
                    : 'border-amber-500/35 bg-[#0b0e14]/88 text-amber-200'
                }`}
              >
                {hud.guidance.relativeBearingDeg < -18
                  ? '◄ IZQ'
                  : hud.guidance.relativeBearingDeg > 18
                  ? 'DER ►'
                  : '▲ FRENTE'}{' '}
                · {hud.guidance.label} · {hud.guidance.distanceMeters}m
              </div>
            )}
          </div>

          {/* Top-Right: Drone Stock, Score, and Utility Buttons */}
          <div className="flex items-start gap-2">
            <div className="rounded-xl border border-slate-500/25 bg-[#0b0e14]/88 px-3.5 py-2 text-right shadow-lg">
              <div
                className="mb-1 flex justify-end gap-0.5"
                aria-label={`Drones restantes: ${hud.dronesRemaining} de ${hud.maxDrones}`}
              >
                {Array.from({ length: hud.maxDrones }).map((_, idx) => {
                  const state =
                    idx < hud.dronesRemaining - 1
                      ? 'full'
                      : idx === hud.dronesRemaining - 1
                      ? 'current'
                      : 'used';
                  return <DroneSilhouetteIcon key={idx} state={state} />;
                })}
              </div>
              <div className="font-mono-tech text-xs text-slate-300">
                UNIDADES{' '}
                <span className="font-bold text-emerald-400">
                  {hud.dronesRemaining}
                </span>{' '}
                · PTS{' '}
                <span
                  data-testid="hud-score"
                  className="font-bold text-amber-400"
                >
                  {hud.score.toString().padStart(4, '0')}
                </span>
                {hud.killStreak >= 2 && (
                  <span className="ml-1.5 font-bold text-red-400">
                    x{hud.killStreak}
                  </span>
                )}
              </div>
            </div>

            <div className="pointer-events-auto flex flex-col gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                aria-label={muted ? 'Activar sonido [M]' : 'Silenciar sonido [M]'}
                title={muted ? 'Activar sonido (M)' : 'Silenciar (M)'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-slate-500/30 bg-[#0b0e14]/90 text-slate-200 transition-colors hover:border-amber-400 hover:text-amber-300"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  {muted ? (
                    <>
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </>
                  ) : (
                    <>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </>
                  )}
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Pausar simulación [P]"
                title="Pausar (P / Esc)"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onPause();
                }}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-slate-500/30 bg-[#0b0e14]/90 text-slate-200 transition-colors hover:border-amber-400 hover:text-amber-300"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Squad List & Comms Quick Actions (Mid-Left) + Killfeed (Mid-Right) */}
        <div className="pointer-events-none flex items-start justify-between">
          <div className="hidden w-56 flex-col gap-1.5 md:flex">
            <div className="rounded-xl border border-slate-500/25 bg-[#0b0e14]/84 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
                <span>Escuadrón Alfa</span>
                <span className="font-mono-tech text-slate-200">
                  {alliesAlive} / {hud.allies.length}
                </span>
              </div>
              <ul className="space-y-1">
                {hud.allies.map((ally) => {
                  const allyPct = Math.max(
                    0,
                    Math.min(100, Math.round((ally.hp / Math.max(1, ally.maxHp)) * 100))
                  );
                  const statusColor = !ally.alive
                    ? 'text-red-400'
                    : ally.state === 'COMBATE'
                    ? 'text-cyan-300'
                    : ally.state === 'TRINCHERA'
                    ? 'text-amber-200'
                    : ally.state === 'CUBIERTO'
                    ? 'text-amber-300'
                    : ally.state === 'ESPRINTAR' || ally.state === 'AVANZAR'
                    ? 'text-sky-300'
                    : 'text-emerald-400';
                  return (
                    <li
                      key={ally.id}
                      className={`flex items-center justify-between text-[11px] ${
                        ally.alive ? 'text-slate-200' : 'text-slate-500 line-through'
                      }`}
                    >
                      <span className="truncate font-medium">{ally.name}</span>
                      <span className={`font-mono-tech text-[10px] ${statusColor}`}>
                        {ally.alive
                          ? `${ALLY_STATE_LABEL[ally.state] ?? 'ACTIVO'} ${allyPct}%`
                          : 'KIA'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="pointer-events-auto flex flex-col gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleSquadOrder();
                }}
                className="flex cursor-pointer items-center justify-between rounded-xl border border-emerald-500/30 bg-[#0b0e14]/88 px-3 py-1.5 font-mono-tech text-[10px] text-emerald-200 transition-colors hover:border-emerald-400"
              >
                <span>[G] ESCUADRÓN</span>
                <span className="font-bold text-amber-300">
                  {hud.squadOrder === 'ESCOLTA' ? 'ESCOLTA' : 'MANTENER'}
                </span>
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onRequestCommanderReport();
                }}
                className="flex cursor-pointer items-center justify-between rounded-xl border border-amber-500/30 bg-[#0b0e14]/88 px-3 py-1.5 font-mono-tech text-[10px] text-amber-200 transition-colors hover:border-amber-400"
              >
                <span>[R] COMANDANTE</span>
                <span className="text-slate-300">INFORME</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            {killFeed.map((entry) => {
              const toneBorder =
                entry.tone === 'kill'
                  ? 'border-amber-500/45 text-slate-100'
                  : entry.tone === 'warning'
                  ? 'border-red-500/55 bg-red-950/80 text-red-200'
                  : entry.tone === 'ally'
                  ? 'border-emerald-500/40 text-emerald-200'
                  : 'border-cyan-500/40 text-cyan-200';
              return (
                <div
                  key={entry.id}
                  className={`rounded-lg border bg-[#0b0e14]/86 px-2.5 py-1 font-mono-tech text-[11px] ${toneBorder}`}
                >
                  {entry.text}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center FPV Artificial Horizon + Reticle */}
        {isPlaying && (
          <div className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div
              className="relative flex h-44 w-44 items-center justify-center"
              style={{
                transform: `rotate(${hud.rollDeg}deg) translateY(${Math.max(
                  -28,
                  Math.min(28, hud.pitchDeg * 0.65)
                )}px)`,
              }}
            >
              <div className="absolute left-3 h-px w-5 bg-emerald-400/50" />
              <div className="absolute right-3 h-px w-5 bg-emerald-400/50" />
              <div className="absolute top-6 left-9 h-px w-3 bg-emerald-400/35" />
              <div className="absolute top-6 right-9 h-px w-3 bg-emerald-400/35" />
              <div className="absolute bottom-6 left-9 h-px w-3 bg-emerald-400/35" />
              <div className="absolute bottom-6 right-9 h-px w-3 bg-emerald-400/35" />
            </div>

            <svg
              width="52"
              height="52"
              viewBox="0 0 52 52"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              aria-hidden="true"
            >
              <line
                x1="26"
                y1="4"
                x2="26"
                y2="16"
                stroke={hud.opticsThermal ? '#34d399' : '#10b981'}
                strokeWidth="1.8"
              />
              <line
                x1="26"
                y1="36"
                x2="26"
                y2="48"
                stroke={hud.opticsThermal ? '#34d399' : '#10b981'}
                strokeWidth="1.8"
              />
              <line
                x1="4"
                y1="26"
                x2="16"
                y2="26"
                stroke={hud.opticsThermal ? '#34d399' : '#10b981'}
                strokeWidth="1.8"
              />
              <line
                x1="36"
                y1="26"
                x2="48"
                y2="26"
                stroke={hud.opticsThermal ? '#34d399' : '#10b981'}
                strokeWidth="1.8"
              />
              <circle cx="26" cy="26" r="2.2" fill="#f57c00" />
            </svg>

            {hitMarkerActive && (
              <svg
                width="36"
                height="36"
                viewBox="0 0 36 36"
                className="hitmarker-pop absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                aria-hidden="true"
              >
                <path
                  d="M6 6L13 13M30 6L23 13M6 30L13 23M30 30L23 23"
                  stroke="#fbbf24"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            )}

            <div className="mt-16 flex flex-col items-center gap-1.5 text-center">
              {hud.opticsThermal && (
                <span className="rounded-lg border border-emerald-400/50 bg-emerald-950/82 px-2.5 py-0.5 font-mono-tech text-[11px] font-semibold text-emerald-300">
                  ÓPTICA 2.5x
                </span>
              )}
              {hud.sniperLock && (
                <span className="rounded-lg border border-red-400/75 bg-red-950/92 px-3 py-1 font-display text-xs font-bold text-red-100">
                  ¡MIRA LÁSER FIJADA!
                </span>
              )}
              {hud.underFire && !hud.sniperLock && (
                <span className="rounded-lg border border-red-500/65 bg-red-950/86 px-3 py-1 font-display text-xs font-bold text-red-200">
                  BAJO FUEGO HOSTIL
                </span>
              )}
              {hud.extractionActive && (
                <span className="rounded-lg border border-emerald-400/65 bg-emerald-950/86 px-3 py-1 font-display text-xs font-bold text-emerald-300">
                  EXTRACCIÓN ACTIVA · HAZ VERDE NORTE
                </span>
              )}
            </div>
          </div>
        )}

        {/* Kill Banner */}
        {killBanner && (
          <div className="pointer-events-none fixed top-28 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-red-500/55 bg-red-950/90 px-4 py-1.5 shadow-lg">
            <span className="mr-2 font-display text-xs font-bold text-red-300">
              BAJA CONFIRMADA
            </span>
            <span className="font-mono-tech text-xs font-semibold text-white">
              +{killBanner.points} PTS · {killBanner.title}
            </span>
          </div>
        )}

        {/* Speaker-Coded Radio Transmission Banner */}
        {radioMessage && (
          <div
            className={`pointer-events-none fixed bottom-28 left-1/2 z-30 w-[min(600px,90vw)] -translate-x-1/2 rounded-2xl border bg-[#0b0e14]/94 px-4 py-2.5 shadow-xl ${
              radioMessage.speaker === 'COMANDANTE'
                ? 'border-amber-500/50'
                : radioMessage.speaker === 'OPERADOR'
                ? 'border-cyan-400/50'
                : 'border-emerald-500/50'
            }`}
          >
            <div
              className={`font-display text-[10px] font-bold tracking-wider uppercase ${
                radioMessage.speaker === 'COMANDANTE'
                  ? 'text-amber-400'
                  : radioMessage.speaker === 'OPERADOR'
                  ? 'text-cyan-300'
                  : 'text-emerald-400'
              }`}
            >
              {radioMessage.callsign}
            </div>
            <p className="mt-0.5 text-sm font-medium text-white">
              &ldquo;{radioMessage.text}&rdquo;
            </p>
          </div>
        )}

        {/* Bottom Row: Flight Telemetry & Radar */}
        {isPlaying ? (
          <div className="flex items-end justify-between gap-3">
            <div className="w-76 max-w-[calc(100vw-180px)] rounded-xl border border-slate-500/25 bg-[#0b0e14]/88 px-3.5 py-2.5 shadow-lg">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-300">CARGA C4</span>
                <div className="mx-2.5 h-2 flex-1 overflow-hidden rounded border border-slate-600/50 bg-slate-900">
                  <div
                    className={`h-full transition-all duration-100 ${
                      hpPct < 30 ? 'bg-red-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${hpPct}%` }}
                  />
                </div>
                <span className="font-mono-tech w-10 text-right font-semibold text-white">
                  {hpPct}%
                </span>
              </div>

              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-slate-300">LIPO 6S</span>
                <div className="mx-2.5 h-2 flex-1 overflow-hidden rounded border border-slate-600/50 bg-slate-900">
                  <div
                    className={`h-full transition-all duration-100 ${
                      batPct < 20 ? 'bg-red-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${batPct}%` }}
                  />
                </div>
                <span
                  className={`font-mono-tech w-10 text-right font-semibold ${
                    batPct < 20 ? 'text-red-400' : 'text-amber-300'
                  }`}
                >
                  {hud.voltage.toFixed(1)}V
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-700/50 pt-1.5 font-mono-tech text-[11px] text-slate-300">
                <span>
                  ALT <strong className="text-amber-400">{hud.altitude.toFixed(1)}m</strong>
                </span>
                <span>
                  VEL <strong className="text-amber-400">{hud.speedKmh}</strong> km/h
                </span>
                <span>
                  HDG <strong className="text-emerald-400">{hud.yawDeg}°</strong>
                </span>
                <span className="text-cyan-300">{hud.flightMode}</span>
              </div>

              <div className="mt-1.5 flex items-center justify-between border-t border-slate-700/50 pt-1.5 font-mono-tech text-[11px]">
                <span className="text-slate-300">[Q] COHETES HE</span>
                <span
                  data-testid="hud-rockets"
                  className={`font-semibold ${
                    hud.rocketsLeft <= 0
                      ? 'text-red-400'
                      : hud.rocketCooldown > 0.05
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                  }`}
                >
                  {hud.rocketsLeft}/{hud.maxRockets}{' '}
                  {hud.rocketsLeft <= 0
                    ? 'AGOTADOS'
                    : hud.rocketCooldown > 0.05
                    ? `(${hud.rocketCooldown.toFixed(1)}s)`
                    : 'LISTO'}
                </span>
              </div>

              {(hud.gamepadConnected || !hud.pointerLocked) && (
                <div className="mt-1 font-mono-tech text-[10px] text-slate-400">
                  {hud.gamepadConnected
                    ? 'PS4 / DUALSENSE · △ COHETE · R1 OFF'
                    : 'CLIC EN PANTALLA PARA APUNTAR'}
                </div>
              )}
            </div>

            <div className="flex flex-col items-center rounded-xl border border-slate-500/25 bg-[#0b0e14]/88 p-2 shadow-lg">
              <RadarCanvas
                dronePos={hud.dronePos}
                entities={hud.radarEntities}
              />
              <span className="mt-1 font-display text-[10px] font-semibold tracking-wider text-slate-400">
                RADAR
              </span>
            </div>
          </div>
        ) : (
          <div />
        )}
      </div>
    </>
  );
}
