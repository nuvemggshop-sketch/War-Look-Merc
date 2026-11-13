import * as THREE from 'three';

export interface ProceduralTextureSet {
  terrainBump: THREE.CanvasTexture;
  terrainRoughness: THREE.CanvasTexture;
  concreteMap: THREE.CanvasTexture;
  concreteBump: THREE.CanvasTexture;
  sandbagMap: THREE.CanvasTexture;
  sandbagBump: THREE.CanvasTexture;
  metalMap: THREE.CanvasTexture;
  smokeSprite: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function seededNoise(x: number, y: number, seed = 17): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(
  renderer: THREE.WebGLRenderer
): ProceduralTextureSet {
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy() || 1);

  // 1. Terrain micro-relief bump + roughness
  const terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = 256;
  terrainCanvas.height = 256;
  const tCtx = terrainCanvas.getContext('2d')!;
  const tImg = tCtx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const n1 = seededNoise(x * 0.25, y * 0.25, 3);
      const n2 = seededNoise(x * 0.8, y * 0.8, 11);
      const pebble = n1 * 0.65 + n2 * 0.35;
      const v = Math.floor(85 + pebble * 135);
      const idx = (y * 256 + x) * 4;
      tImg.data[idx] = v;
      tImg.data[idx + 1] = v;
      tImg.data[idx + 2] = v;
      tImg.data[idx + 3] = 255;
    }
  }
  tCtx.putImageData(tImg, 0, 0);
  const terrainBump = configureTexture(terrainCanvas, false, 24, 24, maxAniso);
  const terrainRoughness = configureTexture(terrainCanvas, false, 24, 24, maxAniso);

  // 2. Weathered Concrete (albedo + bump)
  const concCanvas = document.createElement('canvas');
  concCanvas.width = 256;
  concCanvas.height = 256;
  const cCtx = concCanvas.getContext('2d')!;
  cCtx.fillStyle = '#4f5356';
  cCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const x = seededNoise(i, 1, 5) * 256;
    const y = seededNoise(i, 2, 9) * 256;
    const sz = 1 + seededNoise(i, 3, 13) * 4;
    const shade = 55 + Math.floor(seededNoise(i, 4, 21) * 48);
    cCtx.fillStyle = `rgb(${shade},${shade + 2},${shade + 3})`;
    cCtx.fillRect(x, y, sz, sz);
  }
  // Scorch streaks and seam joints
  cCtx.strokeStyle = 'rgba(20, 20, 22, 0.45)';
  cCtx.lineWidth = 2;
  for (let y = 32; y < 256; y += 64) {
    cCtx.beginPath();
    cCtx.moveTo(0, y);
    cCtx.lineTo(256, y);
    cCtx.stroke();
  }
  const concreteMap = configureTexture(concCanvas, true, 2, 2, maxAniso);

  const concBumpCanvas = document.createElement('canvas');
  concBumpCanvas.width = 256;
  concBumpCanvas.height = 256;
  const cbCtx = concBumpCanvas.getContext('2d')!;
  cbCtx.drawImage(concCanvas, 0, 0);
  const concreteBump = configureTexture(concBumpCanvas, false, 2, 2, maxAniso);

  // 3. Woven Sandbag Burlap (albedo + bump)
  const sandCanvas = document.createElement('canvas');
  sandCanvas.width = 128;
  sandCanvas.height = 128;
  const sCtx = sandCanvas.getContext('2d')!;
  sCtx.fillStyle = '#6c5f49';
  sCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) {
    sCtx.fillStyle = y % 8 === 0 ? 'rgba(35,28,18,0.28)' : 'rgba(180,165,130,0.16)';
    sCtx.fillRect(0, y, 128, 2);
  }
  for (let x = 0; x < 128; x += 4) {
    sCtx.fillStyle = x % 8 === 0 ? 'rgba(35,28,18,0.22)' : 'rgba(180,165,130,0.12)';
    sCtx.fillRect(x, 0, 2, 128);
  }
  // Stacked bag seam lines
  sCtx.strokeStyle = 'rgba(22, 18, 12, 0.65)';
  sCtx.lineWidth = 3;
  for (let row = 0; row < 4; row++) {
    const ry = row * 32;
    sCtx.beginPath();
    sCtx.moveTo(0, ry);
    sCtx.lineTo(128, ry);
    sCtx.stroke();
    const offset = (row % 2) * 32;
    sCtx.beginPath();
    sCtx.moveTo(offset + 32, ry);
    sCtx.lineTo(offset + 32, ry + 32);
    sCtx.stroke();
  }
  const sandbagMap = configureTexture(sandCanvas, true, 2, 1, maxAniso);
  const sandbagBump = configureTexture(sandCanvas, false, 2, 1, maxAniso);

  // 4. Brushed Tactical Steel / Armor
  const metalCanvas = document.createElement('canvas');
  metalCanvas.width = 128;
  metalCanvas.height = 128;
  const mCtx = metalCanvas.getContext('2d')!;
  mCtx.fillStyle = '#313639';
  mCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y++) {
    const streak = 42 + Math.floor(seededNoise(y, 8, 99) * 24);
    mCtx.fillStyle = `rgb(${streak},${streak + 3},${streak + 5})`;
    mCtx.fillRect(0, y, 128, 1);
  }
  mCtx.strokeStyle = 'rgba(12,14,16,0.5)';
  mCtx.strokeRect(2, 2, 124, 124);
  const metalMap = configureTexture(metalCanvas, true, 1, 1, maxAniso);

  // 5. Soft Radial Smoke Sprite
  const smokeCanvas = document.createElement('canvas');
  smokeCanvas.width = 128;
  smokeCanvas.height = 128;
  const smCtx = smokeCanvas.getContext('2d')!;
  const smGrad = smCtx.createRadialGradient(64, 64, 4, 64, 64, 62);
  smGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
  smGrad.addColorStop(0.35, 'rgba(210,210,210,0.5)');
  smGrad.addColorStop(0.72, 'rgba(130,130,130,0.16)');
  smGrad.addColorStop(1, 'rgba(0,0,0,0)');
  smCtx.fillStyle = smGrad;
  smCtx.fillRect(0, 0, 128, 128);
  const smokeSprite = new THREE.CanvasTexture(smokeCanvas);
  smokeSprite.colorSpace = THREE.SRGBColorSpace;
  smokeSprite.needsUpdate = true;

  // 6. Soft Contact Shadow Disc
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const shCtx = shadowCanvas.getContext('2d')!;
  const shGrad = shCtx.createRadialGradient(32, 32, 4, 32, 32, 30);
  shGrad.addColorStop(0, 'rgba(0,0,0,0.72)');
  shGrad.addColorStop(0.55, 'rgba(0,0,0,0.32)');
  shGrad.addColorStop(1, 'rgba(0,0,0,0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 64, 64);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;
  contactShadow.needsUpdate = true;

  return {
    terrainBump,
    terrainRoughness,
    concreteMap,
    concreteBump,
    sandbagMap,
    sandbagBump,
    metalMap,
    smokeSprite,
    contactShadow,
    dispose: () => {
      terrainBump.dispose();
      terrainRoughness.dispose();
      concreteMap.dispose();
      concreteBump.dispose();
      sandbagMap.dispose();
      sandbagBump.dispose();
      metalMap.dispose();
      smokeSprite.dispose();
      contactShadow.dispose();
    },
  };
}
