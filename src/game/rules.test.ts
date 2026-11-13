import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBallisticElevationOffset,
  computeRelativeBearingDeg,
  computeSplashDamage,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  evaluateMissionStatus,
  getNearestTrenchPoint,
  getTerrainHeightAt,
  getTrenchCenterZ,
  hasClearLineOfSight,
  MAP_ORDER,
  mapGamepadToControlInput,
  pointHitsStructure,
  segmentHitsSphere,
  type StructureBox,
} from './rules';

test('segmentHitsSphere detects fast projectile passing through target sphere', () => {
  const hit = segmentHitsSphere(
    { x: 0, y: 1, z: -10 },
    { x: 0, y: 1, z: 10 },
    { x: 0, y: 1, z: 0 },
    1.2
  );
  assert.equal(hit, true);

  const miss = segmentHitsSphere(
    { x: 5, y: 1, z: -10 },
    { x: 5, y: 1, z: 10 },
    { x: 0, y: 1, z: 0 },
    1.2
  );
  assert.equal(miss, false);
});

test('computeSplashDamage falls off with distance and zeroes outside radius', () => {
  assert.equal(computeSplashDamage(0, 8, 100), 100);
  const mid = computeSplashDamage(4, 8, 100);
  assert.ok(mid > 35 && mid < 80);
  assert.equal(computeSplashDamage(8, 8, 100), 0);
  assert.equal(computeSplashDamage(12, 8, 100), 0);
});

test('computeBallisticElevationOffset compensates for gravity drop', () => {
  const drop = computeBallisticElevationOffset(74, 74, 9.8);
  assert.ok(Math.abs(drop - 4.9) < 0.01);
});

test('hasClearLineOfSight blocks vision behind tall walls but allows low sandbag fire', () => {
  const structures: StructureBox[] = [
    { minX: -5, maxX: 5, minZ: -2, maxZ: 2, maxY: 20, blocksSight: true },
    { minX: 15, maxX: 25, minZ: -2, maxZ: 2, maxY: 1.5, blocksSight: false },
  ];
  const flat = () => 0;

  assert.equal(
    hasClearLineOfSight({ x: 0, y: 2, z: -10 }, { x: 0, y: 2, z: 10 }, structures, flat),
    false
  );
  assert.equal(
    hasClearLineOfSight({ x: 20, y: 1, z: -10 }, { x: 20, y: 1, z: 10 }, structures, flat),
    true
  );
});

test('pointHitsStructure supports minY doorways/lintels and drone collision radius', () => {
  const doorwayWalls: StructureBox[] = [
    // Left pier
    { minX: -5, maxX: -2, minZ: -0.5, maxZ: 0.5, minY: 0, maxY: 4, blocksSight: true },
    // Right pier
    { minX: 2, maxX: 5, minZ: -0.5, maxZ: 0.5, minY: 0, maxY: 4, blocksSight: true },
    // Door lintel overhead (y: 3.8..4.8)
    { minX: -2, maxX: 2, minZ: -0.5, maxZ: 0.5, minY: 3.8, maxY: 4.8, blocksSight: true },
  ];

  // Drone radius 0.38 flies cleanly through open center doorway at y = 2.0
  assert.equal(
    pointHitsStructure({ x: 0, y: 2.0, z: 0 }, doorwayWalls, false, 0.38),
    false
  );
  // Drone clips the lintel overhead at y = 3.9
  assert.equal(
    pointHitsStructure({ x: 0, y: 3.9, z: 0 }, doorwayWalls, false, 0.38),
    true
  );
  // Drone clips left pier when straying too close
  assert.equal(
    pointHitsStructure({ x: -1.8, y: 2.0, z: 0 }, doorwayWalls, false, 0.38),
    true
  );
});

test('computeRelativeBearingDeg computes ahead, right, and left relative headings', () => {
  // Forward in simulator at yaw=0 is -Z
  assert.equal(computeRelativeBearingDeg(0, 0, 0, 0, -50), 0);
  // Target to the East (+X) when facing North (-Z) is +90 deg (right)
  assert.equal(computeRelativeBearingDeg(0, 0, 0, 50, 0), 90);
  // Target to the West (-X) when facing North (-Z) is -90 deg (left)
  assert.equal(computeRelativeBearingDeg(0, 0, 0, -50, 0), -90);
});

test('getTerrainHeightAt carves trenches lower than surrounding ridges', () => {
  const trenchCenter = getTerrainHeightAt(0, -65);
  const openRidge = getTerrainHeightAt(0, -42);
  assert.ok(trenchCenter < openRidge);
});

test('evaluateMissionStatus enforces objectives, 2-minute survival, and extraction', () => {
  const midMission = evaluateMissionStatus({
    destroyedTargets: 6,
    totalTargets: 6,
    elapsedTime: 60,
    dronesRemaining: 5,
    inExtractionZone: true,
    extractionActive: false,
  });
  assert.equal(midMission.shouldActivateExtraction, false);
  assert.equal(midMission.outcome, 'ongoing');

  const readyToActivate = evaluateMissionStatus({
    destroyedTargets: 6,
    totalTargets: 6,
    elapsedTime: 120,
    dronesRemaining: 3,
    inExtractionZone: false,
    extractionActive: false,
  });
  assert.equal(readyToActivate.shouldActivateExtraction, true);

  const won = evaluateMissionStatus({
    destroyedTargets: 6,
    totalTargets: 6,
    elapsedTime: 125,
    dronesRemaining: 3,
    inExtractionZone: true,
    extractionActive: true,
  });
  assert.equal(won.outcome, 'victory');

  const lost = evaluateMissionStatus({
    destroyedTargets: 5,
    totalTargets: 6,
    elapsedTime: 90,
    dronesRemaining: 0,
    inExtractionZone: false,
    extractionActive: false,
  });
  assert.equal(lost.outcome, 'defeat');
});

test('mapGamepadToControlInput strictly ignores broken R1 (button 5) and fires with Square (button 2)', () => {
  const buttons = Array.from({ length: 8 }, () => ({ pressed: false, value: 0 }));
  // Simulate R1 stuck or pressed (index 5) while Square is not pressed
  buttons[5] = { pressed: true, value: 1 };
  const r1Only = mapGamepadToControlInput({ axes: [0, 0, 0, 0], buttons });
  assert.equal(r1Only.fire, false);
  assert.equal(r1Only.boost, false);
  assert.equal(r1Only.currentButtons[5], false);

  // Now press Square (index 2) and Cross (index 0) and R2 (index 7)
  buttons[2] = { pressed: true, value: 1 };
  buttons[0] = { pressed: true, value: 1 };
  buttons[7] = { pressed: true, value: 0.8 };
  const squareFire = mapGamepadToControlInput({ axes: [0.5, -0.5, 0, 0], buttons });
  assert.equal(squareFire.fire, true);
  assert.equal(squareFire.boost, true);
  assert.ok(squareFire.vertical > 0.7);
  assert.ok(squareFire.strafe > 0.3);
  assert.ok(squareFire.forward > 0.3);
});

test('getNearestTrenchPoint locates closest carved trench floor below surrounding ridges', () => {
  const nearest = getNearestTrenchPoint(8, -21);
  assert.equal(nearest.trenchIndex, 1);
  const expectedZ = getTrenchCenterZ(8, 1);
  assert.ok(Math.abs(nearest.z - expectedZ) < 0.001);
  const floorHeight = getTerrainHeightAt(nearest.x, nearest.z);
  const ridgeHeight = getTerrainHeightAt(nearest.x, nearest.z + 10);
  assert.ok(floorHeight < ridgeHeight - 0.8);
});

test('all 3 battlefield maps carve trenches distinctly and have unique terrain elevations', () => {
  const hTrinchera = getTerrainHeightAt(15, -35, 'trinchera');
  const hDesierto = getTerrainHeightAt(15, -35, 'desierto');
  const hCiudad = getTerrainHeightAt(15, -35, 'ciudad');

  assert.notEqual(Math.round(hTrinchera * 100), Math.round(hDesierto * 100));
  assert.notEqual(Math.round(hDesierto * 100), Math.round(hCiudad * 100));

  for (const mapId of MAP_ORDER) {
    const nearest = getNearestTrenchPoint(12, -16, mapId);
    const floor = getTerrainHeightAt(nearest.x, nearest.z, mapId);
    const rim = getTerrainHeightAt(nearest.x, nearest.z + 6, mapId);
    assert.ok(floor < rim - 0.5, `Expected carved trench lower than rim on ${mapId}`);
  }
});

test('mapGamepadToControlInput maps Triangle (button 3) to rocketPressed while keeping R1 off', () => {
  const buttons = Array.from({ length: 8 }, () => ({ pressed: false, value: 0 }));
  buttons[3] = { pressed: true, value: 1 };
  buttons[5] = { pressed: true, value: 1 }; // R1 held down, must stay ignored

  const firstPress = mapGamepadToControlInput({ axes: [0, 0, 0, 0], buttons }, []);
  assert.equal(firstPress.rocketPressed, true);
  assert.equal(firstPress.currentButtons[5], false);

  // Holding Triangle does not re-trigger edge-pressed rocket
  const held = mapGamepadToControlInput(
    { axes: [0, 0, 0, 0], buttons },
    firstPress.currentButtons
  );
  assert.equal(held.rocketPressed, false);
  assert.equal(held.currentButtons[5], false);
});

test('difficulty presets scale drones, ally HP, enemy lethality, and disable passive healing on tactical+', () => {
  assert.deepEqual([...DIFFICULTY_ORDER], ['recluta', 'tactico', 'veterano', 'realista']);

  for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
    const prev = DIFFICULTIES[DIFFICULTY_ORDER[i - 1]];
    const curr = DIFFICULTIES[DIFFICULTY_ORDER[i]];
    assert.ok(curr.dronesReserve < prev.dronesReserve, `${curr.id} should have fewer drones than ${prev.id}`);
    assert.ok(curr.allyMaxHp < prev.allyMaxHp, `${curr.id} should have lower ally HP than ${prev.id}`);
    assert.ok(curr.enemyDamageMult > prev.enemyDamageMult, `${curr.id} should deal more damage than ${prev.id}`);
    assert.ok(curr.scoreMult > prev.scoreMult, `${curr.id} should award higher score multiplier than ${prev.id}`);
  }

  assert.ok(DIFFICULTIES.recluta.allyRegen > 0);
  assert.equal(DIFFICULTIES.tactico.allyRegen, 0);
  assert.equal(DIFFICULTIES.veterano.allyRegen, 0);
  assert.equal(DIFFICULTIES.realista.allyRegen, 0);
});



