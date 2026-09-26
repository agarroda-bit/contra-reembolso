// Ciclo de día y noche: cielo, sol, luna, estrellas, nubes, luces, sombras, niebla y farolas.
// Lee game.clock.hour cada frame (lo avanza el núcleo) y lo ajusta todo a partir de la hora.
import * as THREE from 'three';
import type { Game } from '../core/game';
import { SkyDome } from './sky/skydome';
import { Clouds } from './sky/clouds';
import { sampleSky, SKY_STRIDE, OFF } from './sky/palette';

export interface DayNight {
  /** Cambia la hora del mundo (0..24) y lo aplica al momento. */
  setHour(h: number): void;
  /** Luz principal: el sol de día, la luna (azulada y débil) de noche. Proyecta las sombras. */
  readonly sun: THREE.DirectionalLight;
  /** Punto al que siguen las sombras. null = jugador (game.mod.player.position) o delante de la cámara. */
  followTarget: THREE.Vector3 | null;
  /** Multiplicador de la exposición para efectos (flash, hierbas...). 1 = normal. */
  exposureScale: number;
  /** Dirección hacia el sol (unitaria; y < 0 cuando está bajo el horizonte). */
  readonly sunDirection: THREE.Vector3;
  /** Dirección hacia la luna. */
  readonly moonDirection: THREE.Vector3;
  /** Dirección hacia la luz principal actual (sol o luna). */
  readonly lightDirection: THREE.Vector3;
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  /** Color del horizonte/niebla y del cenit ahora mismo, tal y como se ven (agua, reflejos, menús). */
  readonly horizonColor: THREE.Color;
  readonly zenithColor: THREE.Color;
  dispose(): void;
}

// ── Recorrido del sol ──
const SUNRISE = 6.8; // el sol asoma por el este (+X)
const SUNSET = 20.3; // y se pone por el oeste (-X)
const TILT = 0.52; // inclinación de la órbita hacia el sur (+Z): altura máxima ≈ 60°
const MOON_LEAD = 0.35; // la luna va un poco adelantada respecto a la antípoda del sol
const MOON_TILT = 0.45;

// ── Sombras ──
const SHADOW_HALF = 60; // la cámara de sombras cubre ±60 m
const SHADOW_DIST = 160; // distancia de la luz al objetivo

// ── Farolas ──
const LAMP_COLOR = '#ffbf73';
const LAMP_INTENSITY = 38;
const LAMP_DISTANCE = 24;
const LAMP_DECAY = 1.5;
const LAMP_REASSIGN = 0.5; // s

/** Ángulo del sol en su órbita (0 = sale, π = se pone, 2π = vuelve a salir). */
function sunAngle(h: number): number {
  if (h >= SUNRISE && h <= SUNSET) return ((h - SUNRISE) / (SUNSET - SUNRISE)) * Math.PI;
  const n = h > SUNSET ? h - SUNSET : h + 24 - SUNSET;
  return Math.PI + (n / (24 - (SUNSET - SUNRISE))) * Math.PI;
}

function orbit(theta: number, tilt: number, out: THREE.Vector3): THREE.Vector3 {
  const s = Math.sin(theta);
  return out.set(Math.cos(theta), s * Math.cos(tilt), s * Math.sin(tilt)).normalize();
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function wrapHour(h: number): number {
  return ((h % 24) + 24) % 24;
}

/** Hueco del grupo de farolas: una luz real que se mueve a la farola más cercana. */
interface LampSlot {
  light: THREE.PointLight;
  lamp: number; // índice actual en lampPositions (-1 = ninguno)
  target: number; // índice al que tiene que ir
  level: number; // 0..1 (fundido al cambiar de farola)
}

export function installDayNight(game: Game): DayNight {
  const scene = game.scene;
  const S = new Float32Array(SKY_STRIDE);

  const sunDir = new THREE.Vector3(0, 1, 0);
  const moonDir = new THREE.Vector3(0, -1, 0);
  const lightDir = new THREE.Vector3(0, 1, 0);
  const horizonColor = new THREE.Color();
  const zenithColor = new THREE.Color();

  // ── Luces ──
  const sun = new THREE.DirectionalLight('#ffffff', 2.5);
  sun.name = 'sol';
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight('#cfe3ff', '#7a6a52', 1.4);
  hemi.name = 'cielo-hemisferio';
  scene.add(hemi);
  const ambient = new THREE.AmbientLight('#9098a8', 0.3);
  ambient.name = 'ambiente';
  scene.add(ambient);

  // ── Cielo y nubes ──
  const dome = new SkyDome(scene);
  const clouds = new Clouds(scene);
  const U = dome.uniforms;
  const CU = clouds.uniforms;

  // ── Farolas ──
  const lampGroup = new THREE.Group();
  lampGroup.name = 'luces-farolas';
  scene.add(lampGroup);
  let slots: LampSlot[] = [];
  let lampTimer = 0;
  const bestIdx = [-1, -1, -1, -1, -1, -1, -1, -1];
  const bestD = [0, 0, 0, 0, 0, 0, 0, 0];

  function buildLampPool(n: number) {
    for (const s of slots) {
      s.light.removeFromParent();
      s.light.dispose();
    }
    slots = [];
    n = Math.max(0, Math.min(8, n | 0));
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(LAMP_COLOR, 0, LAMP_DISTANCE, LAMP_DECAY);
      l.castShadow = false;
      l.position.set(0, -100, 0);
      lampGroup.add(l);
      slots.push({ light: l, lamp: -1, target: -1, level: 0 });
    }
    lampTimer = 0;
  }

  // ── Calidad (sombras, radios, luces) ──
  function applyQuality() {
    const q = game.quality;
    sun.castShadow = q.shadows;
    const size = q.shadowMapSize;
    // three redimensiona el mapa él solo cuando cambia mapSize
    sun.shadow.mapSize.set(size, size);
    sun.shadow.needsUpdate = true;
    const cam = sun.shadow.camera;
    cam.left = -SHADOW_HALF;
    cam.right = SHADOW_HALF;
    cam.top = SHADOW_HALF;
    cam.bottom = -SHADOW_HALF;
    cam.near = 1;
    cam.far = SHADOW_DIST + 140;
    cam.updateProjectionMatrix();
    const texel = (SHADOW_HALF * 2) / size;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = texel * 0.45;
    dome.setFar(game.camera.far);
    const fog = scene.fog as THREE.Fog | null;
    clouds.setRange(fog?.far ?? game.camera.far * 0.75, game.camera.far);
    if (slots.length !== q.maxLights) buildLampPool(q.maxLights);
  }
  applyQuality();
  const offSettings = game.events.on('settings', () => applyQuality());

  // ── Estado ──
  let lastNight = -1;
  let lastWorld: unknown = null;
  let lastHourInt = -1;
  const tmp = new THREE.Vector3();
  const fallbackTarget = new THREE.Vector3();
  const snapped = new THREE.Vector3();
  const shadowDir = new THREE.Vector3(0, 1, 0);
  const ax = new THREE.Vector3();
  const ay = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const sunCol = new THREE.Vector3();
  const sunHalo = new THREE.Vector3();

  const setV = (v: THREE.Vector3, o: number) => v.set(S[o], S[o + 1], S[o + 2]);
  const setC = (c: THREE.Color, o: number) => c.setRGB(S[o], S[o + 1], S[o + 2], THREE.SRGBColorSpace);
  const mixV = (out: THREE.Vector3, a: number, b: number, t: number) =>
    out.set(
      ((a >> 16) & 255) / 255 + ((((b >> 16) & 255) - ((a >> 16) & 255)) / 255) * t,
      ((a >> 8) & 255) / 255 + ((((b >> 8) & 255) - ((a >> 8) & 255)) / 255) * t,
      (a & 255) / 255 + (((b & 255) - (a & 255)) / 255) * t,
    );

  const api: DayNight = {
    sun,
    hemi,
    ambient,
    followTarget: null,
    exposureScale: 1,
    sunDirection: sunDir,
    moonDirection: moonDir,
    lightDirection: lightDir,
    horizonColor,
    zenithColor,
    setHour(h: number) {
      game.clock.hour = wrapHour(h);
      update(0, true);
    },
    dispose() {
      offSettings();
      game.removeSystem(system);
      buildLampPool(0);
      lampGroup.removeFromParent();
      sun.removeFromParent();
      sun.target.removeFromParent();
      sun.shadow.map?.dispose();
      hemi.removeFromParent();
      ambient.removeFromParent();
      dome.dispose();
      clouds.dispose();
      if (game.mod.dayNight === api) delete game.mod.dayNight;
    },
  };

  function update(dt: number, force = false) {
    const hour = wrapHour(game.clock.hour);
    const theta = sunAngle(hour);
    orbit(theta, TILT, sunDir);
    orbit(theta + Math.PI + MOON_LEAD, MOON_TILT, moonDir);
    sampleSky(hour, S);

    // ── Noche (0 día .. 1 noche cerrada) ──
    const night = 1 - smoothstep(-0.2, 0.1, sunDir.y);
    game.night = night;
    // (también si el mundo acaba de cambiar: el nuevo tiene que enterarse de la hora)
    if (
      game.world !== lastWorld ||
      Math.abs(night - lastNight) > 0.01 ||
      (night === 0 && lastNight !== 0) ||
      (night === 1 && lastNight !== 1)
    ) {
      lastNight = night;
      lastWorld = game.world;
      game.world?.setNight(night);
    }
    const hi = Math.floor(hour);
    if (hi !== lastHourInt) {
      lastHourInt = hi;
      game.events.emit('daynight', { night, hour });
    }

    // ── Cúpula ──
    setV(U.uZenith.value, OFF.zenith);
    setV(U.uMid.value, OFF.mid);
    setV(U.uHorizon.value, OFF.horizon);
    setV(U.uFog.value, OFF.fog);
    setV(U.uGlow.value, OFF.glow);
    // el resplandor se apaga cuando el sol se hunde mucho
    U.uGlowK.value = S[OFF.glowK] * smoothstep(-0.28, -0.02, sunDir.y);
    U.uSunDir.value.copy(sunDir);
    const low = 1 - smoothstep(0.0, 0.4, sunDir.y);
    mixV(sunCol, 0xfffbe8, 0xffa75a, low);
    mixV(sunHalo, 0xfff0c8, 0xff7a30, low);
    U.uSunCol.value.copy(sunCol);
    U.uSunHalo.value.copy(sunHalo);
    U.uSunSize.value = 0.036 + low * 0.018; // radio angular (rad)
    U.uSunVis.value = smoothstep(-0.09, -0.01, sunDir.y);
    U.uMoonDir.value.copy(moonDir);
    U.uMoonVis.value = (0.35 + 0.65 * night) * smoothstep(-0.04, 0.03, moonDir.y);
    setC(horizonColor, OFF.fog);
    setC(zenithColor, OFF.zenith);

    // ── Estrellas ──
    const starOp = S[OFF.stars];
    dome.starUniforms.uOpacity.value = starOp;
    dome.starUniforms.uTime.value = game.time.real;
    dome.starUniforms.uPixelRatio.value = game.renderer.getPixelRatio();
    dome.stars.visible = starOp > 0.005;

    // ── Niebla y exposición ──
    // (three mezcla la niebla DESPUÉS del tone mapping y en sRGB: el mismo color que pinta la
    // cúpula, así que los objetos lejanos empalman con el cielo sin costura)
    const fog = scene.fog as THREE.Fog | null;
    if (fog) fog.color.copy(horizonColor);
    game.renderer.toneMappingExposure = S[OFF.exp] * api.exposureScale;

    // ── Luz principal: sol o luna (se funde a cero en el relevo) ──
    let fade: number;
    if (sunDir.y > -0.02) {
      lightDir.copy(sunDir);
      fade = smoothstep(-0.02, 0.08, sunDir.y);
    } else {
      lightDir.copy(moonDir);
      fade = smoothstep(-0.02, -0.14, sunDir.y) * smoothstep(-0.02, 0.12, moonDir.y);
    }
    sun.color.setRGB(S[OFF.key], S[OFF.key + 1], S[OFF.key + 2], THREE.SRGBColorSpace);
    sun.intensity = S[OFF.keyI] * fade;
    // sin luz no hace falta repintar el mapa de sombras
    sun.shadow.autoUpdate = sun.intensity > 0.01;
    setC(hemi.color, OFF.hemiSky);
    setC(hemi.groundColor, OFF.hemiGround);
    hemi.intensity = S[OFF.hemiI];
    setC(ambient.color, OFF.amb);
    ambient.intensity = S[OFF.ambI];

    // ── Sombras que siguen al jugador, ajustadas a la rejilla de texels ──
    const cam = game.camera;
    let target = api.followTarget ?? (game.mod.player?.position as THREE.Vector3 | undefined) ?? null;
    if (!target) {
      cam.getWorldDirection(tmp);
      tmp.y = 0;
      if (tmp.lengthSq() < 1e-6) tmp.set(0, 0, -1);
      tmp.normalize();
      fallbackTarget.copy(cam.position).addScaledVector(tmp, 35);
      fallbackTarget.y = game.world ? game.world.heightAt(fallbackTarget.x, fallbackTarget.z) : 0;
      target = fallbackTarget;
    }
    // la dirección de las sombras avanza a saltitos de ~0,2° (si no, los bordes titilan cada frame)
    if (force || shadowDir.dot(lightDir) < 0.999994) shadowDir.copy(lightDir);
    ax.crossVectors(UP, shadowDir);
    if (ax.lengthSq() < 1e-8) ax.set(1, 0, 0);
    ax.normalize();
    ay.crossVectors(shadowDir, ax);
    const texel = (SHADOW_HALF * 2) / sun.shadow.mapSize.x;
    const px = Math.round(target.dot(ax) / texel) * texel;
    const py = Math.round(target.dot(ay) / texel) * texel;
    const pz = target.dot(shadowDir);
    snapped.set(0, 0, 0).addScaledVector(ax, px).addScaledVector(ay, py).addScaledVector(shadowDir, pz);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(shadowDir, SHADOW_DIST);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();

    // ── Nubes ──
    clouds.update(game.time.elapsed, cam.position);
    setV(CU.uLit.value, OFF.cloudLit);
    setV(CU.uShade.value, OFF.cloudShade);
    setV(CU.uRim.value, OFF.glow);
    CU.uRimK.value = 0.1 + S[OFF.glowK] * 0.6 * smoothstep(-0.25, 0.0, sunDir.y);
    CU.uSunDir.value.copy(sunDir);
    setV(CU.uHaze.value, OFF.horizon);
    setV(CU.uHazeHigh.value, OFF.mid);
    // de día las ilumina el sol; con el sol bajo, desde abajo (panzas encendidas); de noche, la luna
    const lowSun = 1 - smoothstep(0.1, 0.35, sunDir.y);
    tmp.set(sunDir.x, sunDir.y + (-0.35 - sunDir.y) * lowSun, sunDir.z).normalize();
    const w = smoothstep(-0.36, -0.2, sunDir.y);
    CU.uLightDir.value.copy(moonDir).lerp(tmp, w);
    if (CU.uLightDir.value.lengthSq() < 1e-4) CU.uLightDir.value.copy(UP);
    CU.uLightDir.value.normalize();
    CU.uTopK.value = 0.38 - 0.26 * lowSun * w;

    // ── Farolas ──
    updateLamps(dt, night, force);
  }

  function updateLamps(dt: number, night: number, force: boolean) {
    if (!slots.length) return;
    const lamps = game.world?.lampPositions;
    const on = smoothstep(0.25, 0.7, night);
    if (!lamps || !lamps.length || on <= 0) {
      for (const s of slots) s.light.intensity = 0;
      lampTimer = 0; // al encenderse, reparte enseguida
      return;
    }
    lampTimer -= dt;
    if (lampTimer <= 0 || force) {
      lampTimer = LAMP_REASSIGN;
      // las k farolas más cercanas a la cámara (sin reservar memoria)
      const k = slots.length;
      const c = game.camera.position;
      // las de detrás de la cámara cuentan como si estuvieran más lejos
      game.camera.getWorldDirection(tmp);
      const fx = tmp.x, fz = tmp.z;
      for (let i = 0; i < k; i++) {
        bestIdx[i] = -1;
        bestD[i] = Infinity;
      }
      for (let i = 0; i < lamps.length; i++) {
        const p = lamps[i];
        const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
        let d = dx * dx + dy * dy + dz * dz;
        if (dx * fx + dz * fz < -4) d *= 3;
        if (d >= bestD[k - 1]) continue;
        let j = k - 1;
        while (j > 0 && bestD[j - 1] > d) {
          bestD[j] = bestD[j - 1];
          bestIdx[j] = bestIdx[j - 1];
          j--;
        }
        bestD[j] = d;
        bestIdx[j] = i;
      }
      // los huecos que ya están en una farola buena se quedan; el resto se reparte
      for (const s of slots) s.target = -2;
      for (let i = 0; i < k; i++) {
        const idx = bestIdx[i];
        if (idx < 0) continue;
        for (const s of slots) {
          if (s.target === -2 && s.lamp === idx) {
            s.target = idx;
            bestIdx[i] = -1;
            break;
          }
        }
      }
      for (let i = 0; i < k; i++) {
        const idx = bestIdx[i];
        if (idx < 0) continue;
        for (const s of slots) {
          if (s.target === -2) {
            s.target = idx;
            break;
          }
        }
      }
      for (const s of slots) if (s.target === -2) s.target = -1;
    }
    const step = force ? 1 : Math.min(1, dt * 4);
    for (const s of slots) {
      if (s.lamp !== s.target) {
        s.level = Math.max(0, s.level - step);
        if (s.level <= 0) {
          s.lamp = s.target;
          if (s.lamp >= 0) s.light.position.copy(lamps[s.lamp]);
        }
      } else if (s.lamp >= 0) {
        s.level = Math.min(1, s.level + step);
      }
      s.light.intensity = s.lamp >= 0 ? LAMP_INTENSITY * on * s.level : 0;
    }
  }

  const system = game.addSystem({
    name: 'dayNight',
    update: (dt) => update(dt),
    // en pausa también se ve bien el cielo (menús con el mundo detrás)
    pausedUpdate: () => update(0),
  });

  update(0, true);
  game.mod.dayNight = api;
  return api;
}
