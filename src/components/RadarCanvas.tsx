import { useEffect, useRef } from 'react';
import type { RadarEntity } from '../game/types';

interface RadarCanvasProps {
  dronePos: { x: number; z: number; yaw: number };
  entities: RadarEntity[];
}

export function RadarCanvas({ dronePos, entities }: RadarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 0.62;

    ctx.clearRect(0, 0, w, h);

    // Background rings & crosshairs
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.22)';
    ctx.lineWidth = 1;
    [22, 44, 66].forEach((r) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.beginPath();
    ctx.moveTo(cx, 6);
    ctx.lineTo(cx, h - 6);
    ctx.moveTo(6, cy);
    ctx.lineTo(w - 6, cy);
    ctx.stroke();

    // Sweeping radar line
    const sweep = performance.now() * 0.0014;
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.42)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * 66, cy + Math.sin(sweep) * 66);
    ctx.stroke();

    const cos = Math.cos(dronePos.yaw);
    const sin = Math.sin(dronePos.yaw);
    const toRadar = (wx: number, wz: number) => {
      const dx = wx - dronePos.x;
      const dz = wz - dronePos.z;
      return {
        x: cx + (dx * cos - dz * sin) * scale,
        y: cy + (dx * sin + dz * cos) * scale,
      };
    };

    for (let i = 0; i < entities.length; i++) {
      const ent = entities[i];
      const pt = toRadar(ent.x, ent.z);

      // Clamp distant blips onto radar perimeter ring
      const rx = pt.x - cx;
      const ry = pt.y - cy;
      const dist = Math.hypot(rx, ry);
      const maxR = 64;
      const px = dist > maxR ? cx + (rx / dist) * maxR : pt.x;
      const py = dist > maxR ? cy + (ry / dist) * maxR : pt.y;

      if (ent.kind === 'extraction') {
        ctx.fillStyle = ent.active ? '#10b981' : 'rgba(16, 185, 129, 0.35)';
        ctx.beginPath();
        ctx.arc(px, py, ent.active ? 5.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (ent.kind === 'target') {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(px - 3.5, py - 3.5, 7, 7);
      } else if (ent.kind === 'enemy') {
        ctx.fillStyle = ent.urgent ? '#ff4500' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(px, py, ent.urgent ? 3.2 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (ent.kind === 'ally') {
        ctx.fillStyle = ent.urgent ? '#22d3ee' : '#10b981';
        ctx.beginPath();
        ctx.arc(px, py, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player drone heading triangle
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 4, cy + 5);
    ctx.lineTo(cx + 4, cy + 5);
    ctx.closePath();
    ctx.fill();
  }, [dronePos, entities]);

  return (
    <canvas
      ref={canvasRef}
      width={140}
      height={140}
      aria-label="Radar táctico del campo de batalla"
      className="rounded-full border border-emerald-500/30 bg-[#050809]"
    />
  );
}
