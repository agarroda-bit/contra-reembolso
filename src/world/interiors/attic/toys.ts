// Los lujos nuevos del ático (fase 9): trono dorado, futbolín, máquina recreativa, piscina de bolas,
// flamenco hinchable, cabina de DJ, tobogán al jacuzzi y un robot aspirador con gorro de fiesta.
// Cada uno es un grupo con su modelo (colores por vértice, pocas mallas) y, si se mueve, su update.
import * as THREE from 'three';
import type { Game } from '../../../core/game';
import { GeoBuilder, vertexColorMaterial } from '../../../core/geo';
import { fx as rnd } from '../../../core/rng';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture, texPlane, meshOf, outlinedText } from './kit';

const lambert = vertexColorMaterial;
const shiny = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 70, specular: '#6b5a3a' });

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Caja estirada entre dos puntos (a lo largo de a→c), de ancho w y grueso t. `up` orienta el ancho. */
function beam(b: GeoBuilder, a: THREE.Vector3, c: THREE.Vector3, w: number, t: number, color: string, up = UP) {
  _z.subVectors(c, a);
  const len = _z.length();
  if (len < 1e-5) return;
  _z.divideScalar(len);
  _x.crossVectors(up, _z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z).setPosition((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
  b.add(new THREE.BoxGeometry(w, t, len).applyMatrix4(_m), color);
}

/** Tubo (cilindro) entre dos puntos. */
function tube(b: GeoBuilder, a: THREE.Vector3, c: THREE.Vector3, r0: number, r1: number, seg: number, color: string) {
  _y.subVectors(c, a);
  const len = _y.length();
  if (len < 1e-5) return;
  _y.divideScalar(len);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, _y);
  _m.compose(new THREE.Vector3((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2), q, new THREE.Vector3(1, 1, 1));
  b.add(new THREE.CylinderGeometry(r1, r0, len, seg).applyMatrix4(_m), color);
}

/** Curva de Bézier cuadrática. */
export function bezier(a: THREE.Vector3, c: THREE.Vector3, e: THREE.Vector3, u: number, out = new THREE.Vector3()): THREE.Vector3 {
  const v = 1 - u;
  return out.set(
    v * v * a.x + 2 * v * u * c.x + u * u * e.x,
    v * v * a.y + 2 * v * u * c.y + u * u * e.y,
    v * v * a.z + 2 * v * u * c.z + u * u * e.z,
  );
}

// ─────────────────────────────── trono dorado ───────────────────────────────

/**
 * Trono dorado sobre una tarima de terciopelo. Origen = suelo, centro de la tarima; mira hacia +Z.
 * El asiento queda a 0,71 m (0,25 de tarima + 0,46 de sentarse).
 */
export function buildThrone(): THREE.Group {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  const gold = '#d4af37', goldD = '#b8901f', red = '#b3123a', velvet = '#e0457b';
  b.box(2.0, 0.25, 1.7, red, 0, 0.125, 0);
  b.box(2.06, 0.05, 1.76, gold, 0, 0.255, 0);
  b.box(2.06, 0.05, 1.76, gold, 0, 0.025, 0);
  b.box(1.2, 0.12, 0.36, red, 0, 0.06, 1.02);
  // base y asiento
  b.box(1.02, 0.28, 0.82, gold, 0, 0.41, -0.05);
  b.box(0.92, 0.16, 0.74, velvet, 0, 0.63, -0.03);
  // respaldo altísimo con terciopelo y tachuelas
  b.box(1.12, 1.8, 0.2, gold, 0, 1.4, -0.44);
  b.box(0.8, 1.38, 0.06, velvet, 0, 1.36, -0.32);
  for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) b.sphere(0.035, goldD, -0.22 + k * 0.22, 0.95 + j * 0.8, -0.28);
  b.sphere(0.1, '#e63946', 0, 1.78, -0.29, 1, 1, 1, 0.6);
  // brazos con bolas
  for (const s of [-1, 1]) {
    b.box(0.16, 0.36, 0.84, gold, s * 0.56, 0.78, -0.05);
    b.sphere(0.12, goldD, s * 0.56, 1.0, 0.36, 1);
    b.sphere(0.1, goldD, s * 0.62, 2.28, -0.44, 1);
  }
  // corona en lo alto del respaldo
  b.cyl(0.4, 0.34, 0.16, 10, gold, 0, 2.38, -0.44);
  for (let k = 0; k < 5; k++) {
    const x = -0.3 + k * 0.15;
    b.cyl(0, 0.07, 0.26, 4, gold, x, 2.58, -0.44);
    b.sphere(0.04, k % 2 ? '#35d0ff' : '#e63946', x, 2.72, -0.44);
  }
  // patas de garra
  for (const x of [-0.45, 0.45]) for (const z of [-0.4, 0.3]) b.sphere(0.07, goldD, x, 0.3, z);
  g.add(meshOf(b, shiny));
  const plaque = texPlane(1.1, 0.2, canvasTexture(256, 48, (c, w, h) => {
    c.fillStyle = '#d4af37';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1b1030';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 24px system-ui, sans-serif';
    c.fillText('EL REY DEL REPARTO', w / 2, h / 2 + 1, w - 10);
  }));
  plaque.position.set(0, 0.14, 0.855);
  g.add(plaque);
  return g;
}

// ─────────────────────────────── futbolín ───────────────────────────────

export interface FoosCtl {
  group: THREE.Group;
  readonly busy: boolean;
  play(onEnd: (red: number, blue: number) => void, game: Game): void;
  update(dt: number, game: Game): void;
}

const FOOS_X = [-0.63, -0.45, -0.27, -0.09, 0.09, 0.27, 0.45, 0.63];
const FOOS_N = [1, 2, 3, 5, 5, 3, 2, 1];
const FOOS_RED = [true, true, false, true, false, true, false, false];
const FIELD_Y = 0.945;

/** Futbolín: largo en X (portería roja en -X, azul en +X). Los mangos rojos, hacia +Z (donde juegas tú). */
export function buildFoosball(): FoosCtl {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  b.box(1.56, 0.3, 0.86, '#1d4ed8', 0, 0.78, 0);
  for (const x of [-0.7, 0.7]) for (const z of [-0.35, 0.35]) b.box(0.1, 0.64, 0.1, '#1b1030', x, 0.32, z);
  b.box(1.5, 0.06, 0.8, '#1b1030', 0, 0.2, 0);
  b.box(1.4, 0.02, 0.72, '#1f8a4c', 0, FIELD_Y - 0.01, 0);
  b.box(0.02, 0.004, 0.72, '#ffffff', 0, FIELD_Y + 0.001, 0);
  b.box(0.2, 0.004, 0.02, '#ffffff', -0.6, FIELD_Y + 0.001, 0.14).box(0.2, 0.004, 0.02, '#ffffff', -0.6, FIELD_Y + 0.001, -0.14);
  b.box(0.2, 0.004, 0.02, '#ffffff', 0.6, FIELD_Y + 0.001, 0.14).box(0.2, 0.004, 0.02, '#ffffff', 0.6, FIELD_Y + 0.001, -0.14);
  // bandas amarillas y porterías
  b.box(1.56, 0.08, 0.05, '#ffd23f', 0, FIELD_Y + 0.04, 0.4).box(1.56, 0.08, 0.05, '#ffd23f', 0, FIELD_Y + 0.04, -0.4);
  for (const s of [-1, 1]) {
    b.box(0.05, 0.08, 0.26, '#ffd23f', s * 0.76, FIELD_Y + 0.04, 0.27).box(0.05, 0.08, 0.26, '#ffd23f', s * 0.76, FIELD_Y + 0.04, -0.27);
    b.box(0.08, 0.07, 0.26, '#111111', s * 0.8, FIELD_Y + 0.02, 0);
  }
  // marcador de bolitas
  for (let k = 0; k < 5; k++) b.sphere(0.018, k < 3 ? '#e63946' : '#3a86ff', -0.2 + k * 0.1, FIELD_Y + 0.1, -0.43);
  g.add(meshOf(b, lambert));
  // barras con muñequitos: una malla por equipo (se deslizan a la vez al jugar)
  const team = (red: boolean) => {
    const t = new GeoBuilder();
    const shirt = red ? '#e63946' : '#3a86ff';
    FOOS_X.forEach((x, i) => {
      if (FOOS_RED[i] !== red) return;
      t.cyl(0.011, 0.011, 1.12, 6, '#c9ccd1', x, 1.02, 0, Math.PI / 2, 0, 0);
      const hz = red ? 0.58 : -0.58;
      t.cyl(0.03, 0.03, 0.14, 8, '#1b1030', x, 1.02, hz, Math.PI / 2, 0, 0);
      const n = FOOS_N[i];
      for (let k = 0; k < n; k++) {
        const z = n === 1 ? 0 : -0.26 + (k * 0.52) / (n - 1);
        t.box(0.045, 0.1, 0.035, shirt, x, 0.99, z);
        t.box(0.04, 0.04, 0.04, '#f4cfb6', x, 1.065, z);
      }
    });
    const m = meshOf(t, lambert, false, false);
    g.add(m);
    return m;
  };
  const redM = team(true), blueM = team(false);
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.02, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }));
  ball.position.set(0, FIELD_Y + 0.02, 0);
  g.add(ball);

  let playing = false, t = 0, pause = 0, red = 0, blue = 0, vx = 0, vz = 0, clickCd = 0;
  let cb: ((r: number, b: number) => void) | null = null;
  const serve = () => {
    ball.position.set(0, FIELD_Y + 0.02, (rnd.next() - 0.5) * 0.3);
    const a = (rnd.next() - 0.5) * 1.2 + (rnd.next() < 0.5 ? 0 : Math.PI);
    vx = Math.cos(a) * 1.4;
    vz = Math.sin(a) * 1.4;
  };
  return {
    group: g,
    get busy() {
      return playing;
    },
    play(onEnd, game) {
      if (playing) return;
      playing = true;
      t = 0;
      red = blue = 0;
      pause = 0.4;
      cb = onEnd;
      serve();
      game.mod.audio?.play('click', { volume: 0.5, pitch: 0.7 });
    },
    update(dt, game) {
      if (!playing) return;
      t += dt;
      clickCd -= dt;
      redM.position.z = Math.sin(t * 7.3) * 0.05 + Math.sin(t * 17) * 0.015;
      blueM.position.z = Math.sin(t * 6.1 + 1.3) * 0.05;
      if (pause > 0) {
        pause -= dt;
        return;
      }
      const px = ball.position.x;
      ball.position.x += vx * dt;
      ball.position.z += vz * dt;
      ball.rotation.x += vz * dt * 30;
      ball.rotation.z -= vx * dt * 30;
      // bandas
      if (Math.abs(ball.position.z) > 0.36) {
        ball.position.z = Math.sign(ball.position.z) * 0.36;
        vz = -vz;
      }
      // chuts: al cruzar una barra, si pasa cerca de un muñeco, lo devuelve (más fuerte)
      for (let i = 0; i < FOOS_X.length; i++) {
        const x = FOOS_X[i];
        if ((px - x) * (ball.position.x - x) > 0) continue;
        const off = (FOOS_RED[i] ? redM : blueM).position.z;
        const n = FOOS_N[i];
        for (let k = 0; k < n; k++) {
          const z = (n === 1 ? 0 : -0.26 + (k * 0.52) / (n - 1)) + off;
          if (Math.abs(z - ball.position.z) < 0.045 && rnd.next() < 0.8) {
            // los rojos chutan hacia +X y los azules hacia -X
            const dir = FOOS_RED[i] ? 1 : -1;
            const sp = 1.6 + rnd.next() * 1.4;
            const a = (rnd.next() - 0.5) * 1.1;
            vx = Math.cos(a) * sp * dir;
            vz = Math.sin(a) * sp;
            if (clickCd <= 0) {
              clickCd = 0.08;
              game.mod.audio?.play('click', { volume: 0.45, pitch: 1.2 + rnd.next() * 0.4 });
            }
            break;
          }
        }
      }
      // porterías (hueco de ±0,12) o rebote en el fondo
      if (Math.abs(ball.position.x) > 0.74) {
        if (Math.abs(ball.position.z) < 0.12) {
          if (ball.position.x > 0) red++;
          else blue++;
          game.mod.audio?.play(ball.position.x > 0 ? 'cheer' : 'boo', { volume: 0.35 });
          game.mod.particles?.emit('confetti', g.localToWorld(new THREE.Vector3(Math.sign(ball.position.x) * 0.7, 1.1, 0)), { count: 10, speed: 0.4 });
          pause = 0.7;
          serve();
        } else {
          ball.position.x = Math.sign(ball.position.x) * 0.74;
          vx = -vx * 0.9;
        }
      }
      if (red >= 3 || blue >= 3 || t > 30) {
        playing = false;
        redM.position.z = blueM.position.z = 0;
        ball.position.set(0, FIELD_Y + 0.02, 0);
        const done = cb;
        cb = null;
        done?.(red, blue);
      }
    },
  };
}

// ─────────────────────────────── máquina recreativa ───────────────────────────────

export interface ArcadeCtl {
  group: THREE.Group;
  readonly busy: boolean;
  play(onEnd: (score: number) => void): void;
  update(dt: number): void;
}

/** Máquina recreativa «PAQUETE-MAN». Mira hacia +Z. La pantalla se repinta a 10 fotos por segundo. */
export function buildArcade(): ArcadeCtl {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  const body = '#6c3bd1', side = '#ff4f81';
  b.box(0.8, 1.1, 0.7, body, 0, 0.55, 0);
  b.box(0.8, 0.72, 0.42, body, 0, 1.52, -0.14);
  b.box(0.8, 0.26, 0.62, body, 0, 2.0, -0.04);
  b.box(0.84, 0.1, 0.4, '#1b1030', 0, 1.13, 0.2, -0.3, 0, 0);
  for (const s of [-1, 1]) b.box(0.04, 2.14, 0.78, side, s * 0.42, 1.07, -0.02);
  b.box(0.84, 0.12, 0.74, '#1b1030', 0, 0.06, 0);
  // mandos: palanca y botones
  b.cyl(0.012, 0.012, 0.12, 6, '#c9ccd1', -0.16, 1.24, 0.26);
  b.sphere(0.04, '#e63946', -0.16, 1.31, 0.26, 1);
  b.cyl(0.03, 0.03, 0.03, 10, '#ffd23f', 0.06, 1.2, 0.25, -0.3, 0, 0).cyl(0.03, 0.03, 0.03, 10, '#35d0ff', 0.17, 1.2, 0.25, -0.3, 0, 0);
  // monedero
  b.box(0.18, 0.2, 0.02, '#1b1030', 0, 0.72, 0.355);
  b.box(0.04, 0.08, 0.025, '#ff7b1a', -0.04, 0.73, 0.36).box(0.04, 0.08, 0.025, '#ff7b1a', 0.04, 0.73, 0.36);
  g.add(meshOf(b, lambert));
  // marquesina y pantalla: UNA malla con UNA textura (arriba la marquesina, abajo el juego)
  const marqCanvas = canvasTexture(256, 64, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#ff2e88');
    gr.addColorStop(1, '#ffd23f');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 32px system-ui, sans-serif';
    outlinedText(c, 'PAQUETE-MAN', w / 2, h / 2 + 2, '#ffffff', '#1b1030', 7);
  }).image as HTMLCanvasElement;
  const W = 160, H = 120;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const ctx = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const remapV = (geo: THREE.BufferGeometry, v0: number, v1: number) => {
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
    return geo;
  };
  const marqGeo = remapV(new THREE.PlaneGeometry(0.78, 0.22), 0.75, 1).translate(0, 2.0, 0.275);
  const screenGeo = remapV(new THREE.PlaneGeometry(0.62, 0.46), 0, 0.75).rotateX(-0.12).translate(0, 1.55, 0.105);
  const screen = new THREE.Mesh(mergeGeometries([marqGeo, screenGeo]), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  marqGeo.dispose();
  screenGeo.dispose();
  g.add(screen);

  let playing = false, t = 0, acc = 1, score = 0, lives = 3, pacX = 20, pacDir = 1, ghostX = 150, power = 0, over = 0;
  let cb: ((s: number) => void) | null = null;
  const dots: boolean[] = [];
  const resetDots = () => {
    dots.length = 0;
    for (let i = 0; i < 18; i++) dots.push(true);
  };
  resetDots();
  const draw = () => {
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(marqCanvas, 0, 0);
    c.setTransform(1.6, 0, 0, 1.6, 0, 64);
    c.fillStyle = '#05030f';
    c.fillRect(0, 0, W, H);
    // laberinto
    c.strokeStyle = '#2f5bff';
    c.lineWidth = 3;
    c.strokeRect(4, 22, W - 8, H - 30);
    c.strokeRect(20, 40, 50, 16);
    c.strokeRect(90, 40, 50, 16);
    c.strokeRect(20, 92, 120, 10);
    // pasillo con paquetes que comerse
    for (let i = 0; i < dots.length; i++) {
      if (!dots[i]) continue;
      const x = 12 + i * 8;
      if (i % 6 === 3) {
        c.fillStyle = Math.floor(t * 6) % 2 ? '#ffd23f' : '#ff7b1a';
        c.fillRect(x - 3, 71, 7, 7);
      } else {
        c.fillStyle = '#c8915a';
        c.fillRect(x - 1, 73, 3, 3);
      }
    }
    // Paquete-Man: caja amarilla que abre y cierra la boca
    const mouth = Math.abs(Math.sin(t * 14)) * 0.7;
    c.fillStyle = '#ffd23f';
    c.beginPath();
    const a0 = pacDir > 0 ? mouth : Math.PI + mouth, a1 = pacDir > 0 ? Math.PI * 2 - mouth : Math.PI - mouth + Math.PI * 2;
    c.moveTo(pacX, 74);
    c.arc(pacX, 74, 7, a0, a1);
    c.closePath();
    c.fill();
    // fantasma de Los Devueltos (morado; azul si has comido el paquete gordo)
    const gc = power > 0 ? (Math.floor(t * 8) % 2 ? '#2f5bff' : '#ffffff') : '#a531ff';
    c.fillStyle = gc;
    c.beginPath();
    c.arc(ghostX, 72, 7, Math.PI, 0);
    c.lineTo(ghostX + 7, 81);
    for (let k = 0; k < 3; k++) c.lineTo(ghostX + 7 - (k + 0.5) * 4.6, k % 2 ? 81 : 77);
    c.lineTo(ghostX - 7, 81);
    c.fill();
    c.fillStyle = '#ffffff';
    c.fillRect(ghostX - 4, 69, 3, 4);
    c.fillRect(ghostX + 2, 69, 3, 4);
    // marcador
    c.fillStyle = '#ffffff';
    c.font = '700 10px monospace';
    c.textAlign = 'left';
    c.fillText(`PUNTOS ${String(score).padStart(5, '0')}`, 6, 14);
    c.textAlign = 'right';
    c.fillStyle = '#ffd23f';
    c.fillText('■'.repeat(Math.max(0, lives)), W - 6, 14);
    c.textAlign = 'center';
    if (!playing) {
      c.font = '900 13px monospace';
      c.fillStyle = Math.floor(t * 2) % 2 ? '#ff2e88' : '#ffffff';
      c.fillText(over > 0 ? 'GAME OVER' : 'INSERTA MONEDA', W / 2, 118 - 6);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    tex.needsUpdate = true;
  };
  draw();
  return {
    group: g,
    get busy() {
      return playing;
    },
    play(onEnd) {
      if (playing) return;
      playing = true;
      cb = onEnd;
      score = 0;
      lives = 3;
      pacX = 20;
      pacDir = 1;
      ghostX = 150;
      power = 0;
      over = 0;
      t = 0;
      resetDots();
    },
    update(dt) {
      t += dt;
      acc += dt;
      if (playing) {
        // Paquete-Man va y viene comiendo; el fantasma le persigue (o huye si hay power)
        pacX += pacDir * 55 * dt;
        if (pacX > W - 14) pacDir = -1;
        if (pacX < 14) pacDir = 1;
        const i = Math.round((pacX - 12) / 8);
        if (i >= 0 && i < dots.length && dots[i]) {
          dots[i] = false;
          score += i % 6 === 3 ? 50 : 10;
          if (i % 6 === 3) power = 3;
        }
        if (dots.every((d) => !d)) resetDots();
        power = Math.max(0, power - dt);
        const toward = power > 0 ? -1 : 1;
        ghostX += Math.sign(pacX - ghostX) * toward * (32 + rnd.next() * 20) * dt;
        ghostX = Math.max(10, Math.min(W - 10, ghostX));
        if (Math.abs(ghostX - pacX) < 8) {
          if (power > 0) {
            score += 200;
            ghostX = pacX > W / 2 ? 12 : W - 12;
          } else {
            lives--;
            ghostX = pacX > W / 2 ? 12 : W - 12;
          }
        }
        if (lives <= 0 || t > 12) {
          playing = false;
          over = 3;
          const done = cb;
          cb = null;
          done?.(score);
        }
      } else {
        over = Math.max(0, over - dt);
        // modo demostración: se pasea solo
        pacX += pacDir * 30 * dt;
        if (pacX > W - 14) pacDir = -1;
        if (pacX < 14) pacDir = 1;
        ghostX += Math.sign(pacX - ghostX) * 20 * dt;
      }
      if (acc >= 0.1) {
        acc = 0;
        draw();
      }
    },
  };
}

// ─────────────────────────────── piscina de bolas ───────────────────────────────

export interface PitCtl {
  group: THREE.Group;
  splash(): void;
  update(dt: number): void;
}

const BALL_COLS = ['#e63946', '#ffd23f', '#3a86ff', '#06d6a0', '#ff4f81', '#ff7b1a', '#b14dff'];

/** Piscina de bolas de 2,6 × 2,6 m con paredes acolchadas. Origen = suelo, centro. */
export function buildBallPit(): PitCtl {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  const S = 1.3;
  const walls: [number, number, number, number, string][] = [
    [0, -S, 2.6, 0.2, '#e63946'], [0, S, 2.6, 0.2, '#3a86ff'], [-S, 0, 0.2, 2.6, '#06d6a0'], [S, 0, 0.2, 2.6, '#ffd23f'],
  ];
  for (const [x, z, w, d, c] of walls) {
    b.box(w, 0.5, d, c, x, 0.25, z);
    b.box(w + 0.02, 0.06, d + 0.02, '#ffffff', x, 0.52, z);
  }
  for (const x of [-S, S]) for (const z of [-S, S]) {
    b.cyl(0.13, 0.13, 0.7, 10, '#ffffff', x, 0.35, z);
    b.sphere(0.13, '#ff4f81', x, 0.76, z, 1);
  }
  b.box(2.4, 0.26, 2.4, '#ff7ab8', 0, 0.13, 0);
  g.add(meshOf(b, lambert));
  // bolas: una sola malla instanciada
  const R = 0.085;
  const pos: number[] = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
    pos.push(-1.05 + i * 0.19 + (rnd.next() - 0.5) * 0.05, 0.33 + rnd.next() * 0.06, -1.05 + j * 0.19 + (rnd.next() - 0.5) * 0.05);
  }
  for (let k = 0; k < 50; k++) pos.push((rnd.next() - 0.5) * 2.1, 0.43 + rnd.next() * 0.04, (rnd.next() - 0.5) * 2.1);
  const N = pos.length / 3;
  const balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(R, 0), new THREE.MeshLambertMaterial({ flatShading: true }), N);
  const col = new THREE.Color();
  const dm = new THREE.Object3D();
  const base = Float32Array.from(pos);
  const cur = Float32Array.from(pos);
  const vel = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    balls.setColorAt(i, col.set(BALL_COLS[i % BALL_COLS.length]));
    dm.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    dm.rotation.set(rnd.next() * 3, rnd.next() * 3, 0);
    dm.updateMatrix();
    balls.setMatrixAt(i, dm.matrix);
  }
  balls.castShadow = false;
  balls.receiveShadow = true;
  g.add(balls);
  let active = 0;
  return {
    group: g,
    splash() {
      active = 2.2;
      for (let i = 0; i < N; i++) {
        const x = cur[i * 3], z = cur[i * 3 + 2];
        const d = Math.hypot(x, z);
        const k = Math.max(0, 1 - d / 1.3);
        vel[i * 3] = (x / (d || 1)) * k * (0.8 + rnd.next());
        vel[i * 3 + 1] = k * (2 + rnd.next() * 2.5);
        vel[i * 3 + 2] = (z / (d || 1)) * k * (0.8 + rnd.next());
      }
    },
    update(dt) {
      if (active <= 0) return;
      active -= dt;
      for (let i = 0; i < N; i++) {
        const ix = i * 3;
        vel[ix + 1] -= 9 * dt;
        cur[ix] += vel[ix] * dt;
        cur[ix + 1] += vel[ix + 1] * dt;
        cur[ix + 2] += vel[ix + 2] * dt;
        // dentro de la piscina y sin hundirse
        cur[ix] = Math.max(-1.1, Math.min(1.1, cur[ix]));
        cur[ix + 2] = Math.max(-1.1, Math.min(1.1, cur[ix + 2]));
        if (cur[ix + 1] < base[ix + 1]) {
          cur[ix + 1] = base[ix + 1];
          vel[ix + 1] = Math.abs(vel[ix + 1]) > 1 ? -vel[ix + 1] * 0.3 : 0;
          vel[ix] *= 0.6;
          vel[ix + 2] *= 0.6;
        }
        if (active <= 0) {
          cur[ix + 1] = base[ix + 1];
          vel[ix] = vel[ix + 1] = vel[ix + 2] = 0;
        }
        dm.position.set(cur[ix], cur[ix + 1], cur[ix + 2]);
        dm.rotation.set(i, i * 0.7, 0);
        dm.updateMatrix();
        balls.setMatrixAt(i, dm.matrix);
      }
      balls.instanceMatrix.needsUpdate = true;
    },
  };
}

// ─────────────────────────────── flamenco hinchable ───────────────────────────────

export interface FlamingoCtl {
  group: THREE.Group;
  /** Altura (sobre el suelo) de donde te sientas, según flote en el jacuzzi o esté en el suelo. */
  seatY(floating: boolean): number;
  update(dt: number, floating: boolean): void;
}

/** Flamenco hinchable gigante (flotador): mira hacia +X. Origen = centro del flotador. */
export function buildFlamingo(): FlamingoCtl {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const b = new GeoBuilder();
  const pink = '#ff7ab8', pinkD = '#e0457b';
  b.add(new THREE.TorusGeometry(0.45, 0.19, 6, 14), pink, 0, 0, 0, Math.PI / 2, 0, 0);
  // alas y cola
  b.sphere(0.22, pinkD, 0, 0.12, 0.36, 1, 1.5, 0.55, 0.8);
  b.sphere(0.22, pinkD, 0, 0.12, -0.36, 1, 1.5, 0.55, 0.8);
  b.cyl(0, 0.16, 0.34, 6, pinkD, -0.66, 0.18, 0, 0, 0, 1.1);
  // cuello en S hasta la cabeza
  const pts = [
    new THREE.Vector3(-0.42, 0.1, 0), new THREE.Vector3(-0.5, 0.45, 0), new THREE.Vector3(-0.42, 0.85, 0),
    new THREE.Vector3(-0.25, 1.15, 0), new THREE.Vector3(-0.2, 1.4, 0), new THREE.Vector3(-0.05, 1.55, 0),
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    tube(b, pts[i], pts[i + 1], 0.13 - i * 0.012, 0.12 - i * 0.012, 8, pink);
    b.sphere(0.125 - i * 0.012, pink, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z, 0);
  }
  b.sphere(0.15, pink, 0.02, 1.58, 0, 1);
  // pico blanco con la punta negra, curvado hacia abajo
  tube(b, new THREE.Vector3(0.12, 1.58, 0), new THREE.Vector3(0.3, 1.5, 0), 0.07, 0.045, 6, '#fff8e7');
  tube(b, new THREE.Vector3(0.3, 1.5, 0), new THREE.Vector3(0.37, 1.4, 0), 0.045, 0.012, 6, '#1b1030');
  for (const s of [-1, 1]) {
    b.sphere(0.04, '#ffffff', 0.1, 1.64, s * 0.11, 0);
    b.sphere(0.022, '#1b1030', 0.125, 1.645, s * 0.13, 0);
  }
  inner.add(meshOf(b, shiny));
  let t = rnd.next() * 10;
  return {
    group: g,
    seatY: (floating) => (floating ? 0.36 : 0.19) + 0.17,
    update(dt, floating) {
      t += dt;
      if (floating) {
        inner.position.y = 0.36 + Math.sin(t * 1.6) * 0.03;
        inner.rotation.z = Math.sin(t * 1.1) * 0.05;
        inner.rotation.x = Math.sin(t * 0.8 + 1) * 0.04;
      } else {
        inner.position.y = 0.19;
        inner.rotation.set(0, 0, 0);
      }
    },
  };
}

// ─────────────────────────────── cabina de DJ ───────────────────────────────

export interface DjCtl {
  group: THREE.Group;
  update(dt: number, playing: boolean): void;
}

/** Cabina de DJ con dos platos, mesa de mezclas y altavoces. La parte de delante mira a +X. */
export function buildDjBooth(): DjCtl {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  b.box(0.7, 0.95, 2.0, '#1b1030', 0, 0.475, 0);
  b.box(0.76, 0.05, 2.06, '#ff2e88', 0, 0.975, 0);
  for (const z of [-0.55, 0.55]) {
    b.box(0.5, 0.06, 0.5, '#c9ccd1', -0.02, 1.03, z);
    b.cyl(0.015, 0.015, 0.02, 6, '#1b1030', 0.18, 1.07, z + 0.18);
    b.box(0.03, 0.02, 0.2, '#c9ccd1', 0.16, 1.075, z + 0.1, 0, 0.4, 0);
  }
  // mesa de mezclas con ruedecitas y faders
  b.box(0.36, 0.08, 0.42, '#2b2d42', -0.02, 1.04, 0);
  for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) b.cyl(0.018, 0.018, 0.03, 8, ['#ffd23f', '#35d0ff', '#ff4f81'][k], -0.1 + k * 0.08, 1.09, -0.1 + j * 0.2);
  b.box(0.1, 0.02, 0.03, '#ffffff', 0.08, 1.085, 0);
  // cascos encima
  b.add(new THREE.TorusGeometry(0.09, 0.015, 4, 10, Math.PI), '#1b1030', -0.2, 1.07, 0.3, Math.PI / 2, 0, 0);
  // altavoces a los lados
  for (const s of [-1, 1]) {
    const z = s * 1.33;
    b.box(0.62, 1.35, 0.6, '#2b2d42', 0, 0.675, z);
    b.cyl(0.2, 0.2, 0.05, 12, '#ff2e88', 0.3, 0.45, z, 0, 0, Math.PI / 2);
    b.cyl(0.13, 0.13, 0.06, 12, '#111111', 0.31, 0.45, z, 0, 0, Math.PI / 2);
    b.cyl(0.09, 0.09, 0.05, 10, '#35d0ff', 0.3, 1.05, z, 0, 0, Math.PI / 2);
    b.cyl(0.05, 0.05, 0.06, 10, '#111111', 0.31, 1.05, z, 0, 0, Math.PI / 2);
  }
  g.add(meshOf(b, lambert));
  // discos (una malla instanciada: los dos giran)
  const d = new GeoBuilder();
  d.cyl(0.19, 0.19, 0.014, 16, '#111111', 0, 0, 0);
  d.cyl(0.06, 0.06, 0.016, 12, '#ffd23f', 0, 0.001, 0);
  d.box(0.03, 0.017, 0.08, '#ffffff', 0, 0.001, 0.13);
  const discs = new THREE.InstancedMesh(d.build(), lambert, 2);
  const dm = new THREE.Object3D();
  const setDiscs = (a: number) => {
    [-0.55, 0.55].forEach((z, i) => {
      dm.position.set(-0.02, 1.068, z);
      dm.rotation.set(0, a * (i ? 1 : 1.07), 0);
      dm.updateMatrix();
      discs.setMatrixAt(i, dm.matrix);
    });
    discs.instanceMatrix.needsUpdate = true;
  };
  setDiscs(0);
  g.add(discs);
  // frontal luminoso: nombre y ecualizador (se repinta solo durante la fiesta)
  const W = 256, H = 80;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  let t = 0, acc = 0, ang = 0;
  const bars = new Float32Array(16);
  const draw = (playing: boolean) => {
    c.fillStyle = '#12082a';
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) {
      const hgt = playing ? bars[i] : 0.12 + 0.05 * Math.sin(i);
      const hh = hgt * (H - 30);
      c.fillStyle = `hsl(${(i * 22 + t * (playing ? 120 : 0)) % 360},100%,60%)`;
      c.fillRect(8 + i * 15, H - 6 - hh, 11, hh);
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 26px system-ui, sans-serif';
    outlinedText(c, 'DJ PAQUETÓN', W / 2, 20, playing ? '#ffffff' : '#ffd23f', '#ff2e88', 5);
    tex.needsUpdate = true;
  };
  draw(false);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  front.rotation.y = Math.PI / 2;
  front.position.set(0.356, 0.52, 0);
  g.add(front);
  let wasPlaying = false;
  return {
    group: g,
    update(dt, playing) {
      t += dt;
      if (playing) {
        ang += dt * 4.2;
        setDiscs(ang);
        acc += dt;
        if (acc > 0.08) {
          acc = 0;
          for (let i = 0; i < 16; i++) bars[i] = Math.max(0.08, Math.min(1, bars[i] * 0.6 + (0.25 + Math.abs(Math.sin(t * (3 + i * 0.7) + i)) * 0.75 * rnd.next()) * 0.6));
          draw(true);
        }
      } else if (wasPlaying) {
        draw(false);
      }
      wasPlaying = playing;
    },
  };
}

// ─────────────────────────────── tobogán ───────────────────────────────

export interface SlideDef {
  /** Centro de la torre (suelo). */
  tower: THREE.Vector3;
  /** Recorrido del tobogán: salida, punto de control y final (coordenadas del ático). */
  a: THREE.Vector3;
  c: THREE.Vector3;
  e: THREE.Vector3;
}

/** Tobogán de parque infantil (versión rico) con torre, escalera y tejadito. Coordenadas del ático. */
export function buildSlide(d: SlideDef): THREE.Group {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  const { x, z } = d.tower;
  const top = d.a.y - 0.05;
  for (const dx of [-0.4, 0.4]) for (const dz of [-0.4, 0.4]) b.cyl(0.05, 0.05, top + 0.95, 8, '#ffffff', x + dx, (top + 0.95) / 2, z + dz);
  b.box(0.9, 0.08, 0.9, '#3a86ff', x, top, z);
  // barandillas (oeste, este y norte)
  b.box(0.05, 0.05, 0.9, '#ff4f81', x - 0.4, top + 0.45, z).box(0.05, 0.05, 0.9, '#ff4f81', x + 0.4, top + 0.45, z);
  b.box(0.9, 0.05, 0.05, '#ff4f81', x, top + 0.45, z - 0.4);
  // tejadito a dos aguas
  b.cyl(0, 0.72, 0.5, 4, '#e63946', x, top + 1.2, z, 0, Math.PI / 4, 0);
  b.sphere(0.07, '#ffd23f', x, top + 1.47, z, 0);
  // escalera por el norte
  for (const dx of [-0.25, 0.25]) b.box(0.05, top + 0.1, 0.05, '#ffd23f', x + dx, (top + 0.1) / 2, z - 0.48);
  for (let k = 1; k <= 7; k++) b.box(0.5, 0.04, 0.05, '#ffd23f', x, (k * top) / 8, z - 0.48);
  // la rampa: tramos con fondo amarillo y bordes naranjas, que siguen la curva
  const N = 10;
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), side = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    bezier(d.a, d.c, d.e, i / N, p0);
    bezier(d.a, d.c, d.e, (i + 1) / N, p1);
    dir.subVectors(p1, p0).normalize();
    side.crossVectors(UP, dir).normalize();
    const q0 = p0.clone().addScaledVector(dir, -0.02), q1 = p1.clone().addScaledVector(dir, 0.02);
    beam(b, q0, q1, 0.56, 0.04, i % 2 ? '#ffd23f' : '#ffe066');
    for (const s of [-1, 1]) {
      beam(b, q0.clone().addScaledVector(side, s * 0.29).setY(q0.y + 0.07), q1.clone().addScaledVector(side, s * 0.29).setY(q1.y + 0.07), 0.05, 0.15, '#ff7b1a');
    }
  }
  // un par de patas bajo la rampa
  for (const u of [0.45, 0.8]) {
    bezier(d.a, d.c, d.e, u, p0);
    if (p0.y > 0.5) b.cyl(0.04, 0.04, p0.y - 0.04, 6, '#ffffff', p0.x, (p0.y - 0.04) / 2, p0.z);
  }
  g.add(meshOf(b, lambert));
  return g;
}

// ─────────────────────────────── robot aspirador ───────────────────────────────

export interface RobotCtl {
  group: THREE.Group;
  /** Posición local (en el suelo del ático). */
  readonly pos: THREE.Vector3;
  poke(): void;
  update(dt: number, player: THREE.Vector3 | null, game: Game): void;
}

/** Robot aspirador «Paquetito» con gorro de fiesta: da vueltas alrededor de un punto. */
export function buildRobot(center: THREE.Vector3, radius: number): RobotCtl {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  b.cyl(0.27, 0.28, 0.08, 16, '#f4f4f4', 0, 0.05, 0);
  b.cyl(0.2, 0.2, 0.012, 16, '#2b2d42', 0, 0.095, 0);
  b.box(0.3, 0.05, 0.05, '#c9ccd1', 0, 0.05, 0.25);
  b.box(0.05, 0.03, 0.03, '#35d0ff', -0.07, 0.07, 0.268).box(0.05, 0.03, 0.03, '#35d0ff', 0.07, 0.07, 0.268);
  b.cyl(0.012, 0.012, 0.004, 8, '#39ff14', 0.12, 0.103, -0.08);
  // gorro de fiesta a rayas
  b.cyl(0.035, 0.1, 0.1, 8, '#ff4f81', 0, 0.15, 0).cyl(0.001, 0.035, 0.1, 8, '#ffd23f', 0, 0.25, 0);
  b.sphere(0.035, '#35d0ff', 0, 0.31, 0, 0);
  // cepillos
  for (const s of [-1, 1]) b.box(0.08, 0.01, 0.08, '#8a8f99', s * 0.19, 0.012, 0.16, 0, s * 0.6, 0);
  g.add(meshOf(b, lambert, false, false));
  let ang = rnd.next() * Math.PI * 2, dir = 1, wait = 0, spin = 0, spinT = 6 + rnd.next() * 8, beepCd = 0;
  const pos = new THREE.Vector3();
  const place = () => {
    pos.set(center.x + Math.cos(ang) * radius, 0, center.z + Math.sin(ang) * radius);
    g.position.copy(pos);
    // mira hacia donde va (tangente)
    const tx = -Math.sin(ang) * dir, tz = Math.cos(ang) * dir;
    g.rotation.y = Math.atan2(tx, tz) + spin;
  };
  place();
  return {
    group: g,
    pos,
    poke() {
      spin = 0.001;
      wait = 1.4;
    },
    update(dt, player, game) {
      beepCd -= dt;
      if (spin > 0) {
        spin += dt * 9;
        if (spin > Math.PI * 4) spin = 0;
        place();
        return;
      }
      if (wait > 0) {
        wait -= dt;
        return;
      }
      // si le cortas el paso, pita y da media vuelta
      if (player && Math.hypot(player.x - pos.x, player.z - pos.z) < 0.6) {
        if (beepCd <= 0) {
          beepCd = 2;
          game.mod.audio?.play('bell', { pitch: 2.2, volume: 0.25 });
        }
        dir = -dir;
        wait = 0.8;
        place();
        return;
      }
      spinT -= dt;
      if (spinT <= 0) {
        spinT = 8 + rnd.next() * 10;
        spin = 0.001;
      }
      ang += (dir * 0.45 * dt) / Math.max(0.5, radius);
      place();
    },
  };
}
