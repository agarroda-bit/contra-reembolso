// Animación procedural: calcula cada frame una "pose" (ángulos de todos los huesos + cara)
// y mezcla suavemente al cambiar de estado. Sin reservar memoria por frame.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { CharacterAnimParams, CharacterPose } from '../../core/contracts';
import { B, BONE_COUNT, THIGH, SHIN, ANKLE, HIP_Y, HIPJ, HIP_X, ARM_UP, ARM_FORE, SHOULDER_X, SHOULDER_Y, SPINE_Y, DRIVE_LAYOUT, RIDE_LAYOUT, SIT_LAYOUT, SEAT_DROP } from './skeleton';
import type { CharacterKind } from './looks';

const PI = Math.PI;
const TAU = PI * 2;

// ─────────────── canales de la pose ───────────────
const NB3 = BONE_COUNT * 3;
export const CH = {
  hx: NB3, // posición de la cadera
  hy: NB3 + 1,
  hz: NB3 + 2,
  eye: NB3 + 3, // apertura de ojos (1 normal, >1 muy abiertos)
  dead: NB3 + 4, // 1 = ojos en X
  mouth: NB3 + 5, // -0.6 (boca fina) .. 1.2 (muy abierta)
  mouthW: NB3 + 6, // ancho de boca
  brow: NB3 + 7, // cejas arriba (+) / abajo (-)
  angry: NB3 + 8, // cejas enfadadas (+) / preocupadas (-)
  phone: NB3 + 9, // móvil visible
  tape: NB3 + 10, // cinta en el suelo visible
  stars: NB3 + 11, // estrellitas de mareo
} as const;
export const NCH = NB3 + 12;

/** Canales del tronco para arriba (capa de apuntado). */
const UPPER = [B.spine, B.neck, B.head, B.armL, B.foreL, B.handL, B.armR, B.foreR, B.handR];
const RIGHT_ARM = [B.armR, B.foreR, B.handR, B.head, B.neck];
const ARMS = [B.armL, B.foreL, B.handL, B.armR, B.foreR, B.handR];
const LEFT_ARM = [B.armL, B.foreL, B.handL];
const R_ARM = [B.armR, B.foreR, B.handR];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smooth = (x: number) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function R(o: Float32Array, b: number, x: number, y: number, z: number) {
  const i = b * 3;
  o[i] = x;
  o[i + 1] = y;
  o[i + 2] = z;
}
function AR(o: Float32Array, b: number, x: number, y: number, z: number) {
  const i = b * 3;
  o[i] += x;
  o[i + 1] += y;
  o[i + 2] += z;
}
/** Brazo por lado (+1 izquierdo, -1 derecho): y/z se reflejan. z > 0 = hacia fuera. */
function arm(o: Float32Array, side: number, x: number, y: number, z: number, fx: number, hx = 0, hy = 0, hz = 0) {
  const a = side > 0 ? B.armL : B.armR, f = side > 0 ? B.foreL : B.foreR, h = side > 0 ? B.handL : B.handR;
  R(o, a, x, y * side, z * side);
  R(o, f, fx, 0, 0);
  R(o, h, hx, hy * side, hz * side);
}
function neutral(o: Float32Array) {
  o.fill(0);
  o[CH.hy] = HIP_Y;
  o[CH.eye] = 1;
  o[CH.mouthW] = 1;
}
function lerpInto(o: Float32Array, a: Float32Array, b: Float32Array, t: number) {
  for (let i = 0; i < NCH; i++) o[i] = a[i] + (b[i] - a[i]) * t;
}
function lerpBones(o: Float32Array, src: Float32Array, bones: readonly number[], t: number) {
  for (let k = 0; k < bones.length; k++) {
    const i = bones[k] * 3;
    o[i] += (src[i] - o[i]) * t;
    o[i + 1] += (src[i + 1] - o[i + 1]) * t;
    o[i + 2] += (src[i + 2] - o[i + 2]) * t;
  }
}
/** Ruido suave barato (suma de senos). */
function wave(t: number, seed: number) {
  return Math.sin(t * 1.0 + seed) * 0.6 + Math.sin(t * 2.3 + seed * 1.7) * 0.3 + Math.sin(t * 4.1 + seed * 3.1) * 0.1;
}

// ─────────────── cinemática inversa de brazos ───────────────
const _m4 = new Matrix4();
const _eu = new Euler();
const _qh = new Quaternion();
const _qs = new Quaternion();
const _qi = new Quaternion();
const _qw = new Quaternion();
const _v1 = new Vector3();
const _v2 = new Vector3();
const _aimC = new Vector3();
const _aimCS = new Float32Array(2);
/** Muñeca en un punto del marco de apuntado (centro de hombros + inclinación). Llamar tras spineFrame/shoulderCenter. */
function aimPut(o: Float32Array, side: number, x: number, y: number, z: number, px: number, py: number, pz: number) {
  const cp = _aimCS[0], sn = _aimCS[1];
  armIKBody(o, side, _aimC.x + x, _aimC.y + y * cp + z * sn, _aimC.z - y * sn + z * cp, px, py, pz);
}

/**
 * Lleva la muñeca (hueso de la mano) a (tx, ty, tz) en el espacio del pecho (hueso spine),
 * con el codo apuntando hacia (px, py, pz). side +1 = brazo izquierdo, -1 = derecho.
 * La mano sigue al antebrazo, con un giro opcional (hx, hy, hz; y/z reflejados por lado).
 */
function armIK(o: Float32Array, side: number, tx: number, ty: number, tz: number, px: number, py: number, pz: number, hx = 0, hy = 0, hz = 0) {
  const dx = tx - side * SHOULDER_X, dy = ty - SHOULDER_Y, dz = tz;
  let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let t1x = 0, t1y = -1, t1z = 0;
  if (d > 1e-5) {
    t1x = dx / d;
    t1y = dy / d;
    t1z = dz / d;
  }
  d = clamp(d, 0.1, ARM_UP + ARM_FORE - 0.002);
  // codo: ley del coseno (el antebrazo dobla hacia delante con x negativo)
  const cg = (ARM_UP * ARM_UP + ARM_FORE * ARM_FORE - d * d) / (2 * ARM_UP * ARM_FORE);
  const f = -(PI - Math.acos(clamp(cg, -1, 1)));
  // base local del brazo: e1 = hacia la muñeca, e2 = hacia el codo, e3 = e1 x e2
  const e1y = (-ARM_UP - ARM_FORE * Math.cos(f)) / d, e1z = (-ARM_FORE * Math.sin(f)) / d;
  const dot = -ARM_UP * e1y;
  let e2y = -ARM_UP - dot * e1y, e2z = -dot * e1z;
  const e2l = Math.sqrt(e2y * e2y + e2z * e2z) || 1;
  e2y /= e2l;
  e2z /= e2l;
  const e3x = e1y * e2z - e1z * e2y;
  // base destino: t1 = hacia la muñeca, t2 = codo hacia el polo
  const pd = px * t1x + py * t1y + pz * t1z;
  let t2x = px - pd * t1x, t2y = py - pd * t1y, t2z = pz - pd * t1z;
  let tl = Math.sqrt(t2x * t2x + t2y * t2y + t2z * t2z);
  if (tl < 1e-4) {
    t2x = 0; t2y = 0; t2z = -1;
    const q = t2z * t1z;
    t2x -= q * t1x; t2y -= q * t1y; t2z -= q * t1z;
    tl = Math.sqrt(t2x * t2x + t2y * t2y + t2z * t2z) || 1;
  }
  t2x /= tl;
  t2y /= tl;
  t2z /= tl;
  const t3x = t1y * t2z - t1z * t2y, t3y = t1z * t2x - t1x * t2z, t3z = t1x * t2y - t1y * t2x;
  // R = t1·e1ᵀ + t2·e2ᵀ + t3·e3ᵀ
  _m4.set(
    t3x * e3x, t1x * e1y + t2x * e2y, t1x * e1z + t2x * e2z, 0,
    t3y * e3x, t1y * e1y + t2y * e2y, t1y * e1z + t2y * e2z, 0,
    t3z * e3x, t1z * e1y + t2z * e2y, t1z * e1z + t2z * e2z, 0,
    0, 0, 0, 1,
  );
  _eu.setFromRotationMatrix(_m4, 'XYZ');
  const a = side > 0 ? B.armL : B.armR, fb = side > 0 ? B.foreL : B.foreR, h = side > 0 ? B.handL : B.handR;
  R(o, a, _eu.x, _eu.y, _eu.z);
  R(o, fb, f, 0, 0);
  R(o, h, hx, hy * side, hz * side);
}

const _qp = new Quaternion();
const _qp2 = new Quaternion();
const _mp = new Matrix4();
const _px = new Vector3();
const _py = new Vector3();
const _pz = new Vector3();
/**
 * Gira el hueso del móvil para que la pantalla (+X) mire a la cara y el lado largo (+Y) vaya hacia delante.
 * landscape = en horizontal delante de la cara, como quien graba un vídeo.
 */
function phoneFacing(o: Float32Array, landscape = false) {
  // orientación de la mano derecha en el espacio del pecho
  _eu.set(o[B.armR * 3], o[B.armR * 3 + 1], o[B.armR * 3 + 2], 'XYZ');
  _qp.setFromEuler(_eu);
  _eu.set(o[B.foreR * 3], o[B.foreR * 3 + 1], o[B.foreR * 3 + 2], 'XYZ');
  _qp.multiply(_qp2.setFromEuler(_eu));
  _eu.set(o[B.handR * 3], o[B.handR * 3 + 1], o[B.handR * 3 + 2], 'XYZ');
  _qp.multiply(_qp2.setFromEuler(_eu));
  // orientación deseada en el espacio del pecho
  if (landscape) {
    _px.set(0, 0.15, -1).normalize();
    _py.set(-1, 0, 0);
  } else {
    _px.set(0.1, 0.85, -0.5).normalize();
    _py.set(0, 0.45, 0.9);
  }
  _py.addScaledVector(_px, -_py.dot(_px)).normalize();
  _pz.crossVectors(_px, _py);
  _mp.makeBasis(_px, _py, _pz);
  _qp2.setFromRotationMatrix(_mp);
  _qp.invert().multiply(_qp2);
  _eu.setFromQuaternion(_qp, 'XYZ');
  R(o, B.phone, _eu.x, _eu.y, _eu.z);
}

/** Prepara el paso de espacio del cuerpo (root) a espacio del pecho con la cadera y el tronco de `o`. */
function spineFrame(o: Float32Array) {
  _eu.set(o[B.hips * 3], o[B.hips * 3 + 1], o[B.hips * 3 + 2], 'XYZ');
  _qh.setFromEuler(_eu);
  _eu.set(o[B.spine * 3], o[B.spine * 3 + 1], o[B.spine * 3 + 2], 'XYZ');
  _qs.setFromEuler(_eu);
  // origen del pecho en el cuerpo
  _v2.set(0, SPINE_Y, 0).applyQuaternion(_qh);
  _v2.x += o[CH.hx];
  _v2.y += o[CH.hy];
  _v2.z += o[CH.hz];
  _qw.copy(_qh).multiply(_qs);
  _qi.copy(_qw).invert();
}
/** Brazo con la muñeca en un punto del cuerpo (llamar antes a spineFrame). Polo también en el cuerpo. */
function armIKBody(o: Float32Array, side: number, x: number, y: number, z: number, px: number, py: number, pz: number, hx = 0, hy = 0, hz = 0) {
  _v1.set(x - _v2.x, y - _v2.y, z - _v2.z).applyQuaternion(_qi);
  const tx = _v1.x, ty = _v1.y, tz = _v1.z;
  _v1.set(px, py, pz).applyQuaternion(_qi);
  armIK(o, side, tx, ty, tz, _v1.x, _v1.y, _v1.z, hx, hy, hz);
}
/** Centro de los hombros en el espacio del cuerpo (tras spineFrame). */
function shoulderCenter(out: Vector3) {
  out.set(0, SHOULDER_Y, 0).applyQuaternion(_qw).add(_v2);
  return out;
}

// ─────────────── cinemática inversa de piernas ───────────────
const IK = { t: 0, s: 0 };
const LEG = THIGH + SHIN;
/** Ángulos de muslo (IK.t, hacia delante negativo) y rodilla (IK.s) para llevar el tobillo a (dz, dy). */
function legIK(dz: number, dy: number) {
  let d = Math.sqrt(dz * dz + dy * dy);
  if (d > LEG - 0.002) d = LEG - 0.002;
  if (d < 0.12) d = 0.12;
  const alpha = Math.atan2(dz, -dy);
  const cb = (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d);
  const beta = Math.acos(clamp(cb, -1, 1));
  const ck = (THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN);
  IK.t = -(alpha + beta);
  IK.s = PI - Math.acos(clamp(ck, -1, 1));
}

/**
 * Piernas con los pies en sitios concretos del suelo (relativos a su posición de reposo).
 * Usa la altura de la cadera y la inclinación de la pelvis ya escritas en `o`.
 */
function legs(o: Float32Array, fxL: number, fzL: number, liftL: number, fxR: number, fzR: number, liftR: number) {
  const hipsX = o[B.hips * 3], hipsZ = o[B.hips * 3 + 2];
  const H = o[CH.hy] - HIPJ;
  const px = o[CH.hx], pz = o[CH.hz];
  for (let side = 1; side >= -1; side -= 2) {
    const fx = side > 0 ? fxL : fxR, fz = side > 0 ? fzL : fzR, lift = side > 0 ? liftL : liftR;
    const dx = fx - px;
    const dz = fz - pz;
    const dy = ANKLE + lift - H;
    const vert = Math.sqrt(dx * dx + dy * dy);
    const ab = Math.atan2(dx, -dy);
    legIK(dz, -vert);
    const th = side > 0 ? B.thighL : B.thighR, sh = side > 0 ? B.shinL : B.shinR, ft = side > 0 ? B.footL : B.footR;
    R(o, th, IK.t - hipsX, 0, ab - hipsZ);
    R(o, sh, IK.s, 0, 0);
    R(o, ft, -(IK.t + IK.s), 0, -ab);
  }
}

// ─────────────── forma de andar según el tipo ───────────────
interface Gait {
  hunch: number; // encorvado
  stride: number; // largo de paso
  swing: number; // braceo
  bounce: number; // rebote
  armOut: number; // brazos separados
  swagger: number; // chulería (cadera)
  handsBehind: number; // manos a la espalda (abuela)
  speedMul: number; // cadencia
}
const GAITS: Record<string, Gait> = {
  normal: { hunch: 0, stride: 1, swing: 1, bounce: 1, armOut: 0, swagger: 0, handsBehind: 0, speedMul: 1 },
  abuela: { hunch: 0.32, stride: 0.72, swing: 0.3, bounce: 0.5, armOut: 0, swagger: 0, handsBehind: 1, speedMul: 1 },
  rico: { hunch: -0.06, stride: 1.05, swing: 1.1, bounce: 0.8, armOut: 0.04, swagger: 1, handsBehind: 0, speedMul: 1 },
  fiestero: { hunch: 0, stride: 0.95, swing: 1.3, bounce: 2.2, armOut: 0.05, swagger: 0.5, handsBehind: 0, speedMul: 1 },
  devuelto: { hunch: 0.09, stride: 1, swing: 1.1, bounce: 1, armOut: 0.12, swagger: 0.5, handsBehind: 0, speedMul: 1 },
  policia: { hunch: -0.03, stride: 1, swing: 0.9, bounce: 0.8, armOut: 0.07, swagger: 0, handsBehind: 0, speedMul: 1 },
};

const BLEND: Record<CharacterPose, number> = {
  normal: 0.25, drive: 0.3, ride: 0.3, dance: 0.35, knocked: 0.12, getup: 0.15, dead: 0.3,
  enter_car: 0.2, pull_out: 0.2, pulled: 0.15, sit: 0.35, phone: 0.3, hands_up: 0.25, taped: 0.25, stunned: 0.25,
};

// ─────────────── gestos (capa por encima de andar/parado) ───────────────
/**
 * Gestos cortos que se ponen encima de la pose normal: celebrar, aburrirse, señalar...
 * Parado se hacen con todo el cuerpo; andando, solo de cintura para arriba.
 */
export type Gesture =
  | 'cheer' // puño arriba (cobrar una entrega)
  | 'celebrate' // saltito, bailecito y vuelta (algo grande)
  | 'shrug' // encogerse de hombros
  | 'wave' // saludar
  | 'watch' // mirar el reloj (aburrido)
  | 'yawn' // bostezar y estirarse
  | 'scratch' // rascarse la cabeza
  | 'arms' // brazos cruzados y pie impaciente
  | 'point' // señalar y gritar
  | 'film' // grabar con el móvil
  | 'fist' // agitar el puño (enfadado)
  | 'flail' // huir con los brazos en alto
  | 'cover' // cubrirse la cabeza (tiros)
  | 'lookback'; // correr mirando hacia atrás
const GEST: Record<Gesture, { dur: number; prio: number; idle?: boolean }> = {
  cheer: { dur: 1.3, prio: 2 },
  celebrate: { dur: 3.3, prio: 3 },
  shrug: { dur: 1.2, prio: 2 },
  wave: { dur: 1.6, prio: 2 },
  watch: { dur: 3.2, prio: 1, idle: true },
  yawn: { dur: 2.7, prio: 1, idle: true },
  scratch: { dur: 2.3, prio: 1, idle: true },
  arms: { dur: 3.4, prio: 1, idle: true },
  point: { dur: 1.8, prio: 2 },
  film: { dur: 2.6, prio: 2 },
  fist: { dur: 2, prio: 2 },
  flail: { dur: 2, prio: 2 },
  cover: { dur: 2, prio: 2 },
  lookback: { dur: 2, prio: 2 },
};
/** Gestos de aburrimiento (parado mucho rato). */
const FIDGETS: Gesture[] = ['watch', 'yawn', 'arms', 'scratch'];
/** Canales de la cara. */
const FACE = [CH.eye, CH.mouth, CH.mouthW, CH.brow, CH.angry, CH.phone];
/** Duración del puñetazo (s). */
const PUNCH = 0.36;
/** Preparación del salto (s): se agacha un poco antes de despegar. */
export const JUMP_WINDUP = 0.07;
/** Número de bailes distintos (0-5 los de siempre del club; 6-9, nuevos). */
export const DANCE_COUNT = 10;

// ─────────────── fotogramas clave precalculados ───────────────
function standPose(o: Float32Array) {
  neutral(o);
  o[CH.hy] = 0.885 + HIPJ;
  legs(o, 0, 0, 0, 0, 0, 0);
  arm(o, 1, 0, 0, 0.07, -0.12);
  arm(o, -1, 0, 0, 0.07, -0.12);
}
function lyingPose(o: Float32Array) {
  // boca arriba: la espalda y los talones tocan el suelo, nada lo atraviesa
  // (ojo: en muslos y brazos, x positivo = hacia atrás = hacia el suelo al estar tumbado)
  neutral(o);
  o[CH.hy] = 0.135;
  R(o, B.hips, -PI / 2, 0, 0);
  R(o, B.neck, 0.2, 0, 0);
  R(o, B.head, 0.16, 0, 0);
  arm(o, 1, 0.1, 0, 0.45, -0.3);
  arm(o, -1, 0.1, 0, 0.45, -0.3);
  for (const side of [1, -1]) {
    R(o, side > 0 ? B.thighL : B.thighR, -0.1, 0, side * 0.12);
    R(o, side > 0 ? B.shinL : B.shinR, 0.18, 0, 0);
    R(o, side > 0 ? B.footL : B.footR, 0.35, side * 0.5, 0);
  }
}
/** Altura de la cadera (espacio del cuerpo) para que el trasero toque un asiento a `seatY` m del root. */
function seatHip(seatY: number, s: number) {
  return seatY / s + SEAT_DROP;
}
/** Al volante. `s` = escala del cuerpo (look.height): el coche no cambia, el muñeco sí. */
function drivePose(o: Float32Array, s: number) {
  neutral(o);
  o[CH.hy] = seatHip(DRIVE_LAYOUT.seatY, s);
  o[CH.hz] = -0.04;
  R(o, B.hips, -0.12, 0, 0);
  // pies en el suelo del coche (y = 0 del root), hacia los pedales
  legs(o, 0.03, 0.5 / s, 0, -0.03, 0.47 / s, 0);
  R(o, B.spine, -0.06, 0, 0);
  R(o, B.head, 0.16, 0, 0);
  wheelHands(o, 0, s);
}

/** Manos al volante (girado `steer` rad, + = a la izquierda). Con la cadera y el tronco ya puestos. */
function wheelHands(o: Float32Array, steer: number, s: number) {
  spineFrame(o);
  const L = DRIVE_LAYOUT, r = L.wheelRadius, ct = Math.cos(L.wheelTilt), st = Math.sin(L.wheelTilt);
  const k = 1 / s;
  for (let side = 1; side >= -1; side -= 2) {
    const ang = side * (PI / 3) + steer; // las diez y diez
    const u = Math.sin(ang) * r, v = Math.cos(ang) * r;
    const gx = (L.wheel.x + u) * k, gy = (L.wheel.y + v * ct) * k, gz = (L.wheel.z + v * st) * k;
    armIKBody(o, side, gx + side * 0.012, gy - 0.025, gz - 0.058, side * 0.8, -1, -0.3);
  }
}

/** Manos en los puños del manillar (girado `yaw` rad). */
function barHands(o: Float32Array, yaw: number, s: number) {
  spineFrame(o);
  const L = RIDE_LAYOUT, hw = L.barHalfWidth, c = Math.cos(yaw), sn = Math.sin(yaw);
  const k = 1 / s;
  for (let side = 1; side >= -1; side -= 2) {
    const gx = (L.bar.x + side * hw * c) * k, gz = (L.bar.z - side * hw * sn) * k;
    armIKBody(o, side, gx - side * 0.006, L.bar.y * k + 0.02, gz - 0.062, side, -0.5, -0.5);
  }
}

const KF_STAND = new Float32Array(NCH);
const KF_LYING = new Float32Array(NCH);
const KF_SITUP = new Float32Array(NCH);
const KF_CROUCH = new Float32Array(NCH);
const KF_DUCK = new Float32Array(NCH);
const KF_LEGIN = new Float32Array(NCH);
const KF_REACH = new Float32Array(NCH);
const KF_GRAB = new Float32Array(NCH);
const KF_PULL = new Float32Array(NCH);
const KF_YANK = new Float32Array(NCH);
const KF_EXIT = new Float32Array(NCH);
(function buildKeyframes() {
  standPose(KF_STAND);
  lyingPose(KF_LYING);

  // incorporarse: sentado en el suelo
  const o = KF_SITUP;
  neutral(o);
  o[CH.hy] = 0.16;
  R(o, B.hips, -0.3, 0, 0);
  legs(o, 0.02, 0.32, 0, -0.02, 0.3, 0);
  R(o, B.spine, 0.65, 0, 0);
  R(o, B.head, -0.25, 0, 0);
  arm(o, 1, -0.9, 0, 0.15, -0.3);
  arm(o, -1, -0.9, 0, 0.15, -0.3);
  o[CH.mouth] = 0.3;

  // agachado
  const c = KF_CROUCH;
  neutral(c);
  c[CH.hy] = 0.5;
  R(c, B.hips, 0.35, 0, 0);
  legs(c, 0.02, 0.06, 0, -0.02, 0.02, 0);
  R(c, B.spine, 0.3, 0, 0);
  R(c, B.head, -0.45, 0, 0);
  arm(c, 1, -0.55, 0, 0.1, -0.45);
  arm(c, -1, -0.55, 0, 0.1, -0.45);

  // subir al coche: agacharse y agarrarse al marco
  const d = KF_DUCK;
  neutral(d);
  d[CH.hy] = 0.78 + HIPJ;
  R(d, B.hips, 0.2, 0, 0);
  legs(d, 0.03, 0.12, 0, -0.03, -0.06, 0);
  R(d, B.spine, 0.35, 0, 0);
  R(d, B.head, -0.15, 0, 0);
  arm(d, -1, -2.3, 0, 0.25, -0.4);
  arm(d, 1, -1.0, 0, 0.1, -0.5);
  const l = KF_LEGIN;
  neutral(l);
  l[CH.hy] = 0.68 + HIPJ;
  l[CH.hz] = 0.05;
  R(l, B.hips, 0.1, 0.45, 0);
  legs(l, 0.1, 0.38, 0.32, -0.03, -0.05, 0);
  R(l, B.spine, 0.3, -0.2, 0);
  R(l, B.head, -0.1, 0, 0);
  arm(l, -1, -2.0, 0, 0.3, -0.5);
  arm(l, 1, -0.9, 0, 0.2, -0.6);

  // sacar a alguien del coche
  const r = KF_REACH;
  neutral(r);
  r[CH.hy] = 0.84 + HIPJ;
  R(r, B.hips, 0.12, 0, 0);
  legs(r, 0.02, 0.25, 0, -0.02, -0.18, 0);
  R(r, B.spine, 0.3, 0, 0);
  R(r, B.head, -0.2, 0, 0);
  arm(r, 1, -1.5, 0, -0.18, -0.15);
  arm(r, -1, -1.5, 0, -0.18, -0.15);
  r[CH.angry] = 0.6;
  const g = KF_GRAB;
  g.set(r);
  arm(g, 1, -1.3, 0, -0.2, -0.45);
  arm(g, -1, -1.3, 0, -0.2, -0.45);
  const p = KF_PULL;
  neutral(p);
  p[CH.hy] = 0.8 + HIPJ;
  p[CH.hz] = -0.08;
  R(p, B.hips, -0.12, 0, 0);
  legs(p, 0.03, 0.25, 0, -0.03, -0.12, 0);
  R(p, B.spine, -0.3, 0, 0);
  R(p, B.head, -0.05, 0, 0);
  arm(p, 1, -0.55, 0, -0.1, -1.4);
  arm(p, -1, -0.55, 0, -0.1, -1.4);
  p[CH.angry] = 1;
  p[CH.mouth] = 0.7;
  p[CH.mouthW] = 1.1;
  // tirón final: el cuerpo echado atrás del todo y los brazos pegados al pecho
  const y = KF_YANK;
  y.set(p);
  y[CH.hz] = -0.14;
  R(y, B.hips, -0.22, 0.25, 0);
  R(y, B.spine, -0.42, 0.3, 0);
  arm(y, 1, -0.2, 0, -0.05, -1.9);
  arm(y, -1, -0.35, 0, 0.1, -1.7);
  legs(y, 0.06, 0.3, 0, -0.03, -0.22, 0);
  y[CH.mouth] = 1;

  // salir del coche: agachado, todavía con un pie dentro y la mano en el marco de la puerta
  const e = KF_EXIT;
  neutral(e);
  e[CH.hy] = 0.72 + HIPJ;
  e[CH.hx] = -0.05;
  R(e, B.hips, 0.25, -0.35, 0);
  legs(e, 0.05, 0.06, 0, -0.18, -0.06, 0.28);
  R(e, B.spine, 0.42, 0, 0);
  R(e, B.head, -0.3, 0, 0);
  arm(e, -1, -2.25, 0, 0.35, -0.45);
  arm(e, 1, -0.75, 0, 0.35, -0.6);
})();

// secuencias (constantes: sin reservar memoria por frame)
const SEQ_GETUP = [KF_LYING, KF_SITUP, KF_CROUCH, KF_STAND];
const T_GETUP = [0, 0.35, 0.68, 1.0];
/** Subir al coche: dura lo mismo que el paso del gestor de vehículos (0,45 s). */
const T_ENTER = [0, 0.14, 0.31, 0.45];
/** Robar el coche (1 s): llega a la puerta, agarra, tira, pega el tirón y se mete. */
const SEQ_PULL = [KF_REACH, KF_REACH, KF_GRAB, KF_PULL, KF_YANK, KF_DUCK];
const T_PULL = [0, 0.36, 0.5, 0.66, 0.8, 1.0];
const SEQ_EXIT = [KF_EXIT, KF_DUCK, KF_STAND];
const T_EXIT = [0, 0.2, 0.46];

/** Tres fotogramas clave del salto (despegue, arriba, cayendo): valor según la fase guardada en PL. */
const PL = { ph: 0, a: 0, b: 0 };
function pl(x0: number, x1: number, x2: number) {
  return PL.ph <= 1 ? lerp(x0, x1, PL.a) : lerp(x1, x2, PL.b);
}

/** Aleatorio fijo por número (para el baile del robot). */
function hash01(n: number, seed: number) {
  return (((Math.sin(n * 12.9898 + seed) * 43758.5453) % 1) + 1) % 1;
}
/** Postura del robot: valor i interpolado entre el paso anterior y el actual. */
function robotV(step: number, i: number, snap: number, seed: number, k: number) {
  return lerp(hash01(step - 1 + i * 7, seed), hash01(step + i * 7, seed), snap) * k;
}

/** Interpolación por fotogramas clave (suavizada). */
function keyframes(o: Float32Array, frames: Float32Array[], times: number[], t: number) {
  if (t <= times[0]) return void o.set(frames[0]);
  for (let i = 0; i < times.length - 1; i++) {
    if (t <= times[i + 1]) {
      const u = smooth((t - times[i]) / (times[i + 1] - times[i]));
      lerpInto(o, frames[i], frames[i + 1], u);
      return;
    }
  }
  o.set(frames[frames.length - 1]);
}

// ─────────────── el animador ───────────────
export class Animator {
  /** Pose final de este frame. */
  readonly cur = new Float32Array(NCH);
  private from = new Float32Array(NCH);
  private tgt = new Float32Array(NCH);
  private tmpA = new Float32Array(NCH);
  private tmpB = new Float32Array(NCH);

  pose: CharacterPose | null = null;
  private sub = '';
  poseT = 0;
  private blendT = 1;
  private blendDur = 0;
  t = 0;

  private phase = 0;
  private speedS = 0;
  private airW = 0;
  private airTime = 0;
  private groundTime = 0;
  private vy = 0;
  private landT = 1;
  private landAmt = 0;
  aimW = 0;
  aimPitch = 0;
  weapon: NonNullable<CharacterAnimParams['weapon']> = 'none';
  private recoil = 0;
  private blinkT = 2;
  blink = 1;
  /** Parpadeo automático (se puede apagar para fotos). */
  blinkEnabled = true;
  private wobbleS = 0;
  private swingL = 0; // fase de vuelo de cada pie (0..1) para inclinar la puntera
  private swingR = 0;
  /** Aceleración suavizada (m/s²): se inclina al arrancar y se echa atrás al frenar. */
  private accS = 0;
  private lastSpeedS = 0;
  /** Giro suavizado (rad/s, + = a la izquierda): se inclina hacia dentro de la curva. */
  private turnS = 0;
  private lastHeading = NaN;
  /** Rumbo del personaje (lo escribe su dueño antes de update; NaN = no inclinarse en las curvas). */
  heading = NaN;
  /** Agachado (lo pide el dueño) y su peso suavizado. */
  crouch = false;
  private crouchW = 0;
  /** Tiempo desde que empezó a prepararse para saltar (>= JUMP_WINDUP: nada). */
  private windT = 1;
  /** Puñetazo: tiempo desde el golpe y mano (+1 izquierda, -1 derecha). */
  private punchT = 1;
  private punchSide = 1;
  /** Tiempo desde que se bajó de un vehículo (salir agachado por la puerta). */
  private exitT = 1;
  /** Gesto en curso (null = ninguno). */
  gest: Gesture | null = null;
  gestT = 0;
  private gestDur = 0;
  private gestFullW = 0;
  /** Segundos parado sin hacer nada; al pasar de fidgetAfter hace un gesto de aburrimiento (0 = nunca). */
  private idleT = 0;
  fidgetAfter: number;
  private fidgetN: number;
  /** Los bailarines que no son el jugador cambian de baile de vez en cuando (el jugador baila el que elige). */
  danceMix = true;
  private danceKey = -1;

  gait: Gait = GAITS.normal;
  /** Escala del cuerpo (look.height): corrige asientos, volante y manillar, que no se escalan. */
  bodyScale = 1;
  /** Pose al volante para esta escala (y final de enter_car). */
  private kfDrive = new Float32Array(NCH);
  private seqEnter: Float32Array[] = [KF_STAND, KF_DUCK, KF_LEGIN, this.kfDrive];
  readonly seed: number;
  danceStyle: number;
  baseAngry = 0;
  baseMouth = 0;

  constructor(seed: number, kind?: CharacterKind, emblem?: string | null) {
    this.seed = seed;
    this.configure(kind, emblem);
    this.danceStyle = seed % DANCE_COUNT;
    this.phase = (seed % 1000) / 1000;
    this.t = (seed % 997) * 0.37;
    this.blinkT = 1 + (seed % 7) * 0.4;
    // cada uno se aburre a su ritmo (el jugador lo ajusta a 10 s)
    this.fidgetAfter = 7 + (seed % 11);
    this.fidgetN = seed % FIDGETS.length;
    standPose(this.cur);
    this.setScale(1);
  }

  /**
   * Empieza un gesto encima de la pose normal (celebrar, señalar, aburrirse...). `dur` en segundos
   * (Infinity = hasta stopGesture). No quita un gesto más importante que esté a medias.
   */
  gesture(g: Gesture, dur?: number): boolean {
    const d = GEST[g];
    if (!d) return false;
    const cur = this.gest;
    if (cur && this.gestDur - this.gestT > 0.3 && GEST[cur].prio > d.prio) return false;
    if (cur === g && this.gestDur === Infinity && dur === Infinity) return true;
    if (cur) {
      // cambiar de un gesto a otro sin saltos: mezcla desde la pose de ahora
      this.from.set(this.cur);
      this.blendT = 0;
      this.blendDur = 0.2;
    }
    this.gest = g;
    this.gestT = 0;
    this.gestDur = dur ?? d.dur;
    this.idleT = 0;
    return true;
  }

  /** El gesto en curso dura hasta que alguien lo pare (huir, enfadarse...). */
  get gestLoop(): boolean {
    return this.gest !== null && this.gestDur === Infinity;
  }

  /** Termina el gesto en curso (se deshace suave en `fade` segundos). */
  stopGesture(fade = 0.25) {
    if (this.gest && this.gestDur - this.gestT > fade) this.gestDur = this.gestT + fade;
  }

  /** Se agacha un momento antes de saltar (el salto de verdad llega JUMP_WINDUP s después). */
  jumpWindup() {
    this.windT = 0;
  }

  /** Escala del cuerpo (la llama el personaje al cambiar la altura). */
  setScale(s: number) {
    this.bodyScale = s > 0.2 ? s : 1;
    drivePose(this.kfDrive, this.bodyScale);
  }

  /** Postura y cara por defecto según el tipo de personaje. */
  configure(kind?: CharacterKind, emblem?: string | null) {
    this.gait = GAITS[kind ?? ''] ?? (emblem === 'devueltos' ? GAITS.devuelto : emblem === 'policia' ? GAITS.policia : GAITS.normal);
    this.baseAngry = kind === 'devuelto' || emblem === 'devueltos' ? 0.8 : kind === 'policia' || emblem === 'policia' ? 0.45 : 0;
    this.baseMouth = kind === 'devuelto' || emblem === 'devueltos' ? -0.45 : kind === 'policia' ? -0.3 : kind === 'fiestero' ? 0.35 : 0;
  }

  update(dt: number, p: CharacterAnimParams) {
    dt *= p.timeScale ?? 1;
    if (!(dt > 0)) dt = 0; // NaN o negativo: no avanza (un NaN aquí rompería el muñeco para siempre)
    if (dt > 0.1) dt = 0.1;
    this.t += dt;
    const pose = p.pose;
    const grounded = p.grounded;

    // aire y aterrizaje
    if (!grounded) {
      this.airTime += dt;
      this.groundTime = 0;
    } else {
      if (this.airTime > 0.18) {
        this.landT = 0;
        this.landAmt = clamp01(this.airTime / 0.7) * 0.8 + 0.2;
      }
      this.airTime = 0;
      this.groundTime += dt;
    }
    this.landT = Math.min(1, this.landT + dt / 0.32);

    let sub: string = pose;
    if (pose === 'knocked') {
      // con histéresis: los botes de la física no hacen parpadear entre "volando" y "tumbado"
      const inKnock = this.pose === 'knocked';
      if (inKnock && this.sub === 'k1') sub = grounded || this.airTime < 0.15 ? 'k1' : 'k0';
      else sub = grounded && this.groundTime > 0.1 && inKnock && this.poseT > 0.1 ? 'k1' : 'k0';
    }
    if (sub !== this.sub) {
      const prev = this.pose;
      if (pose !== prev) {
        this.poseT = 0;
        // al bajarse de un vehículo sale agachado por la puerta
        if (pose === 'normal' && (prev === 'drive' || prev === 'ride')) this.exitT = 0;
        // levantarse estando sentado (sacado del coche, de una silla): se salta la parte de estar tumbado
        if (pose === 'getup' && (prev === 'pulled' || prev === 'sit')) this.poseT = T_GETUP[1];
        if (pose !== 'normal') {
          this.gest = null;
          this.idleT = 0;
        }
      }
      this.from.set(this.cur);
      this.blendT = 0;
      this.blendDur = BLEND[pose] ?? 0.25;
      this.pose = pose;
      this.sub = sub;
    } else this.poseT += dt;

    const speed = Math.max(0, p.speed || 0);
    this.lastSpeedS = this.speedS;
    this.speedS += (speed - this.speedS) * Math.min(1, dt * 9);
    if (dt > 0) this.accS += ((this.speedS - this.lastSpeedS) / dt - this.accS) * Math.min(1, dt * 6);
    // giro (para inclinarse en las curvas)
    let turn = 0;
    const h = this.heading;
    if (h === h && dt > 0) {
      if (this.lastHeading === this.lastHeading) {
        let d = h - this.lastHeading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        turn = clamp(d / dt, -8, 8);
      }
      this.lastHeading = h;
    }
    this.turnS += (turn - this.turnS) * Math.min(1, dt * 7);
    this.crouchW += ((this.crouch && pose === 'normal' ? 1 : 0) - this.crouchW) * Math.min(1, dt * 10);
    if (this.crouchW < 0.001) this.crouchW = 0;
    this.windT += dt;
    this.exitT += dt;
    const wob = p.wobble !== undefined && Number.isFinite(p.wobble) ? clamp01(p.wobble) : 0;
    this.wobbleS += (wob - this.wobbleS) * Math.min(1, dt * 3);
    const canAim = pose === 'normal' || pose === 'drive' || pose === 'ride';
    const aimTarget = p.aiming && canAim ? 1 : 0;
    this.aimW += (aimTarget - this.aimW) * Math.min(1, dt * 14);
    if (this.aimW < 0.001) this.aimW = 0;
    const pitchIn = p.aimPitch;
    this.aimPitch += ((pitchIn !== undefined && Number.isFinite(pitchIn) ? pitchIn : 0) - this.aimPitch) * Math.min(1, dt * 20);
    if (p.weapon) this.weapon = p.weapon;
    this.punchT += dt;
    if (p.shot && this.weapon === 'none') {
      // con los puños: puñetazo (alternando las manos)
      this.punchT = 0;
      this.punchSide = -this.punchSide;
      this.recoil = 0;
    } else if (p.shot) this.recoil = 1;
    else this.recoil = Math.max(0, this.recoil - dt / (this.weapon === 'throw' ? 0.45 : 0.14));

    const vy = p.vy !== undefined && Number.isFinite(p.vy) ? p.vy : 0;
    this.vy = vy;
    const air = pose === 'normal' && !grounded && (this.airTime > 0.1 || vy > 1.5) ? 1 : 0;
    // (al despegar de un salto entra rápido, para que se vea el impulso)
    this.airW += (air - this.airW) * Math.min(1, dt * (air ? (vy > 3 ? 22 : 10) : 18));

    // parpadeo
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blinkT = 2 + ((this.seed + this.t * 1000) % 3000) / 1000;
    }
    this.blink = this.blinkT < 0.12 && this.blinkEnabled ? 0.08 : 1;

    const o = this.tgt;
    switch (pose) {
      case 'drive':
        this.poseDrive(o);
        break;
      case 'ride':
        this.poseRide(o);
        break;
      case 'sit':
        this.poseSit(o);
        break;
      case 'dance':
        this.poseDance(o);
        break;
      case 'knocked':
        this.poseKnocked(o, this.sub === 'k1');
        break;
      case 'dead':
        this.poseDead(o);
        break;
      case 'getup':
        keyframes(o, SEQ_GETUP, T_GETUP, this.poseT);
        this.face(o);
        break;
      case 'enter_car':
        keyframes(o, this.seqEnter, T_ENTER, this.poseT);
        break;
      case 'pull_out': {
        const tt = this.poseT;
        keyframes(o, SEQ_PULL, T_PULL, tt);
        if (tt < 0.36) {
          // llega a la puerta a zancadas, con los brazos por delante
          const st = Math.sin(tt * 26);
          legs(o, 0.02, 0.25 + st * 0.12, Math.max(0, st) * 0.1, -0.02, -0.18 - st * 0.12, Math.max(0, -st) * 0.1);
        } else if (tt > 0.5 && tt < 0.84) {
          // forcejeo
          const sh = Math.sin(this.t * 40) * 0.06;
          AR(o, B.armL, sh, 0, 0);
          AR(o, B.armR, -sh, 0, 0);
          AR(o, B.spine, 0, sh * 0.8, 0);
        }
        break;
      }
      case 'pulled':
        this.posePulled(o);
        break;
      case 'taped':
        this.poseTaped(o);
        break;
      case 'phone':
      case 'hands_up':
      case 'stunned':
      case 'normal':
      default:
        this.poseNormal(o, dt, speed, p, pose);
        break;
    }

    if (pose === 'normal') {
      // bajarse del vehículo: sale agachado (se corta si echa a andar)
      if (this.exitT < T_EXIT[2]) {
        keyframes(this.tmpA, SEQ_EXIT, T_EXIT, this.exitT);
        const k = 1 - smooth(this.speedS / 1.6);
        if (k > 0) lerpInto(o, o, this.tmpA, k * (1 - smooth((this.exitT - 0.3) / 0.16)));
      }
      this.gestureLayer(o, dt);
    }

    // capa de apuntado (tronco y brazos)
    if (this.aimW > 0) this.aimLayer(o, pose);
    if (this.recoil > 0) this.recoilLayer(o);
    if (this.punchT < PUNCH && (pose === 'normal' || pose === 'phone')) this.punchLayer(o);

    // mezcla con la pose anterior
    this.blendT += dt;
    const w = this.blendDur > 0 ? smooth(this.blendT / this.blendDur) : 1;
    if (w >= 1) this.cur.set(o);
    else lerpInto(this.cur, this.from, o, w);
  }

  // ─────────── expresión por defecto ───────────
  private face(o: Float32Array) {
    o[CH.angry] = this.baseAngry;
    o[CH.mouth] = this.baseMouth;
    o[CH.mouthW] = 1;
    o[CH.eye] = 1;
  }

  // ─────────── andar / correr / parado (+ móvil, manos arriba, mareo) ───────────
  private poseNormal(o: Float32Array, dt: number, speed: number, p: CharacterAnimParams, pose: CharacterPose) {
    neutral(o);
    this.face(o);
    const wob = this.wobbleS;
    const stunned = pose === 'stunned';
    const t = this.t;
    const g = this.gait;
    this.loco(o, dt, stunned ? Math.min(speed, 1.2) : speed, Math.max(wob, stunned ? 0.6 : 0));

    if (this.airW > 0.001 && pose === 'normal') {
      this.airPose(this.tmpA, this.vy);
      lerpInto(o, o, this.tmpA, this.airW);
    }

    if (pose === 'phone') {
      AR(o, B.spine, 0.04, 0, 0);
      AR(o, B.neck, 0.14, 0, 0);
      R(o, B.head, 0.48, 0.06, 0);
      // móvil delante del pecho, con la pantalla hacia la cara
      armIK(o, -1, -0.05, 0.19, 0.29, -1, -1, -0.15);
      phoneFacing(o);
      o[CH.phone] = 1;
      o[CH.mouth] = 0.15;
      o[CH.eye] = 0.85;
    } else if (pose === 'hands_up') {
      const tr = Math.sin(t * 38) * 0.035;
      arm(o, 1, -2.85 + tr, 0, 0.32, -0.42, 0, 0, 0);
      arm(o, -1, -2.85 - tr, 0, 0.32, -0.42, 0, 0, 0);
      AR(o, B.spine, -0.06, 0, 0);
      R(o, B.head, -0.05 + tr, Math.sin(t * 2.1) * 0.25, 0);
      o[CH.hy] -= 0.015 + Math.abs(Math.sin(t * 19)) * 0.008;
      this.legsFromCurrent(o);
      o[CH.mouth] = 0.85;
      o[CH.mouthW] = 0.55;
      o[CH.brow] = 1;
      o[CH.angry] = -0.8;
      o[CH.eye] = 1.25;
    } else if (stunned) {
      const w = t * 2.6;
      o[CH.hx] += Math.cos(w) * 0.05;
      o[CH.hz] += Math.sin(w) * 0.05;
      o[CH.hy] -= 0.03 + Math.sin(t * 5) * 0.02;
      this.legsFromCurrent(o);
      AR(o, B.spine, Math.sin(w) * 0.14, 0, Math.cos(w) * 0.14);
      R(o, B.neck, Math.sin(w * 1.3) * 0.15, 0, Math.cos(w * 1.3) * 0.15);
      R(o, B.head, Math.sin(w * 1.3 + 0.8) * 0.3, Math.sin(w * 0.7) * 0.2, Math.cos(w * 1.3 + 0.8) * 0.3);
      arm(o, 1, Math.sin(w + 1) * 0.35, 0, 0.3 + Math.cos(w) * 0.15, -0.3);
      arm(o, -1, Math.sin(w + 2.4) * 0.35, 0, 0.3 - Math.cos(w) * 0.15, -0.3);
      o[CH.stars] = 1;
      o[CH.eye] = 0.45;
      o[CH.mouth] = 0.4 + Math.sin(t * 3) * 0.2;
      o[CH.mouthW] = 0.8;
      o[CH.angry] = -0.5;
      o[CH.brow] = 0.3;
    } else if (wob > 0.05) {
      o[CH.eye] = lerp(1, 0.55, wob);
      o[CH.mouth] = lerp(o[CH.mouth], 0.8, wob);
      o[CH.angry] = lerp(o[CH.angry], -0.4, wob);
      o[CH.brow] = 0.4 * wob;
    }
    if (g.handsBehind > 0 && pose === 'normal' && this.aimW < 0.5) {
      arm(o, 1, 0.35, -1.9, 0.12, -1.2, 0, 0, 0);
      arm(o, -1, 0.35, -1.9, 0.12, -1.2, 0, 0, 0);
    }
  }

  /** Recalcula las piernas con los pies donde estaban (tras mover la cadera). */
  private legsFromCurrent(o: Float32Array) {
    legs(o, this.fxL, this.fzL, this.fyL, this.fxR, this.fzR, this.fyR);
  }
  private fxL = 0;
  private fzL = 0;
  private fyL = 0;
  private fxR = 0;
  private fzR = 0;
  private fyR = 0;

  private loco(o: Float32Array, dt: number, speed: number, wob: number) {
    const g = this.gait;
    const t = this.t;
    const v = speed;
    const cw = this.crouchW;
    const run = clamp01((v - 2.2) / 3.3) * (1 - cw);
    const mw = smooth(this.speedS / 0.7);
    const idle = 1 - mw;
    let C: number;
    if (v <= 2) C = 1.25 * Math.sqrt(Math.max(0.3, v / 2));
    else if (v <= 6) C = 1.25 + 1.25 * ((v - 2) / 4);
    else C = 2.5 * Math.pow(v / 6, 0.6);
    C *= g.stride * (1 - 0.35 * cw);
    // el root avanza en metros del mundo y el cuerpo va escalado: el paso también
    this.phase = (this.phase + (v * dt) / (C * this.bodyScale)) % 1;
    const ph = this.phase;
    const s = lerp(0.58, 0.36, run);
    const S = C * s;
    const lift = lerp(0.1, 0.3, run) * (1 - 0.25 * cw) + wob * 0.09;

    // trayectoria de cada pie
    let zL = 0, yL = 0, zR = 0, yR = 0;
    for (let side = 1; side >= -1; side -= 2) {
      const q = side > 0 ? ph : (ph + 0.5) % 1;
      let fz: number, fy: number, sw = 0;
      if (q < s) {
        const u = q / s;
        fz = S * (0.5 - u);
        fy = 0;
      } else {
        const u = (q - s) / (1 - s);
        fz = S * (-0.5 + smooth(u)) - run * 0.14 * Math.sin(PI * u) * (1 - u);
        fy = lift * Math.sin(PI * Math.pow(u, 0.8));
        sw = Math.sin(PI * u);
      }
      if (side > 0) { zL = fz; yL = fy; this.swingL = sw; } else { zR = fz; yR = fy; this.swingR = sw; }
    }
    const half = Math.max(0.05, S / 2);
    const nL = clamp(zL / half, -1.2, 1.2), nR = clamp(zR / half, -1.2, 1.2);

    // parado: respira, carga el peso en una pierna y luego en la otra, y mira a su alrededor
    const br = Math.sin(t * 1.9 + this.seed) * idle;
    const ws = clamp(Math.sin(t * 0.37 + this.seed * 1.3) * 2.2, -1, 1) * idle * (1 - cw);
    const seg = (t + (this.seed % 97) * 0.31) / 2.7;
    const si = Math.floor(seg);
    const turnK = smooth((seg - si - 0.72) / 0.2);
    const lookY = lerp(hash01(si, this.seed) - 0.5, hash01(si + 1, this.seed) - 0.5, turnK) * 1.25;
    const lookX = lerp(hash01(si + 57, this.seed), hash01(si + 58, this.seed), turnK) * 0.18 - 0.07;

    // cadera: rebote al andar (de dibujo animado) y más al correr
    const bobW = -0.036 * (0.5 + 0.5 * Math.cos(TAU * 2 * (ph - 0.04)));
    const bobR = 0.05 * Math.cos(TAU * 2 * (ph - 0.43));
    const idleH = 0.885 + br * 0.004 - Math.abs(ws) * 0.012;
    const moveH = lerp(0.845, 0.8, run) + lerp(bobW, bobR, run) * g.bounce;
    let H = lerp(idleH, moveH, mw);
    // agachado (parado, en cuclillas; andando, de puntillas como un ladrón de dibujos)
    H -= cw * lerp(0.32, 0.25, mw);
    // aceleración: se echa hacia delante al arrancar y hacia atrás al frenar en seco
    const acc = clamp(this.accS * 0.022, -0.26, 0.16) * smooth(this.speedS / 2.5);
    // curvas: se inclina hacia dentro (más cuanto más rápido)
    const bank = clamp(-this.turnS * 0.045 * clamp01(this.speedS / 5), -0.24, 0.24) * mw;
    let spineX = 0, headX = 0, armFwd = 0, armOutX = 0;
    // preparación del salto: flexiona las rodillas y echa los brazos atrás
    if (this.windT < JUMP_WINDUP) {
      const u = smooth(this.windT / JUMP_WINDUP);
      H -= 0.1 * u;
      spineX += 0.22 * u;
      headX -= 0.12 * u;
      armFwd += 0.7 * u;
    }
    // aterrizaje: flexión rápida (más fuerte cuanto más alto venía)
    if (this.landT < 1) {
      const u = this.landT;
      const f = u < 0.2 ? smooth(u / 0.2) : 1 - smooth((u - 0.2) / 0.8);
      const k = this.landAmt * f;
      H -= 0.17 * k;
      spineX += 0.3 * k;
      headX -= 0.18 * k;
      armOutX += 0.45 * k;
      armFwd -= 0.35 * k;
    }
    H -= wob * (0.03 + 0.02 * Math.sin(t * 2.3));
    const shift = ws * 0.035 + Math.sin(t * 0.45 + this.seed) * 0.006 * idle;
    o[CH.hx] = shift + wob * 0.09 * Math.sin(t * 1.4);
    o[CH.hy] = H + HIPJ;
    o[CH.hz] = -0.03 * cw;
    R(
      o, B.hips,
      0.1 * run * mw + 0.32 * cw,
      -0.12 * nL * mw * (1 + g.swagger * 0.8),
      (0.06 * Math.sin(TAU * ph) * (1 - run) * mw) * (1 + g.swagger) + ws * 0.07 + wob * 0.14 * Math.sin(t * 1.7) + bank,
    );

    // pies (al pararse vuelven a su sitio). Al apuntar parado: pie izquierdo adelantado.
    // Con el peso en una pierna, la otra se adelanta un poco y se abre.
    const st = this.aimW * idle;
    const splay = wob * 0.08 + cw * 0.05;
    const freeL = Math.max(0, -ws), freeR = Math.max(0, ws);
    this.fxL = splay + st * 0.03 + freeL * 0.03;
    this.fzL = zL * mw + st * 0.13 + freeL * 0.08;
    this.fyL = yL * mw;
    this.fxR = -splay - st * 0.02 - freeR * 0.03;
    this.fzR = zR * mw - st * 0.1 + freeR * 0.08;
    this.fyR = yR * mw;
    legs(o, this.fxL, this.fzL, this.fyL, this.fxR, this.fzR, this.fyR);
    // puntera caída al levantar el pie
    AR(o, B.footL, this.swingL * 0.35 * mw, 0, 0);
    AR(o, B.footR, this.swingR * 0.35 * mw, 0, 0);

    // brazos (contrarios a las piernas); el antebrazo va un poco por detrás del brazo
    const amp = lerp(0.55, 0.95, run) * mw * g.swing;
    const out = 0.07 + 0.1 * run + g.armOut + wob * 0.45 + br * 0.025 + armOutX;
    const flap = wob * 0.55 * Math.sin(t * 3.1);
    const aL = -amp * nR, aR = -amp * nL;
    const relax = 0.1 * idle + (this.seed % 5) * 0.012 * idle;
    arm(o, 1, aL + flap + armFwd, 0, out, -(0.14 + relax + 1.3 * run * mw + Math.max(0, -aL) * 0.6), 0, 0.1 * idle, 0);
    arm(o, -1, aR - flap + armFwd, 0, out, -(0.14 + relax + 1.3 * run * mw + Math.max(0, -aR) * 0.6), 0, 0.1 * idle, 0);
    if (cw > 0) {
      // de puntillas: manos delante del pecho, como un ladrón de dibujos
      const sw = Math.sin(TAU * ph) * 0.25 * mw;
      const a = this.tmpB;
      a.set(o);
      arm(a, 1, -0.75 + sw, 0, 0.3, -1.75, 0.3, 0, 0);
      arm(a, -1, -0.75 - sw, 0, 0.3, -1.75, 0.3, 0, 0);
      lerpBones(o, a, ARMS, cw);
    }

    // tronco y cabeza (el tronco gira un poco contra la cadera al andar; cabeza estable)
    const lean = lerp(0.03, 0.3, run) * mw + g.hunch + acc + 0.38 * cw + spineX;
    R(
      o, B.spine,
      lean - br * 0.025 + wob * 0.14 * Math.sin(t * 0.9),
      0.28 * nL * amp + lookY * 0.2 * idle,
      -ws * 0.1 - bank * 0.5 + wob * 0.28 * Math.sin(t * 1.3),
    );
    const nod = 0.035 * Math.sin(TAU * 2 * ph) * mw * (1 - run);
    const walkLook = wave(t * 0.3, this.seed + 5) * 0.22 * mw * (1 - run);
    R(
      o, B.head,
      -(lean - spineX) * 0.75 + headX + lookX * idle + nod - 0.3 * cw,
      lookY * 0.8 * idle + walkLook - 0.16 * nL * amp,
      ws * 0.05 + bank * 0.3 + wob * 0.35 * Math.sin(t * 1.7 + 1),
    );
    o[B.neck * 3] = br * 0.02;
  }

  // ─────────── salto y caída ───────────
  private airPose(o: Float32Array, vy: number) {
    const t = this.t;
    // fase del salto: 0 = despegue (estirado), 1 = arriba del todo (recogido), 2 = cayendo (piernas abajo)
    const ph = vy > 0 ? clamp01(1 - vy / 7.8) : 1 + clamp01(-vy / 8.5);
    PL.ph = ph;
    PL.a = smooth((Math.min(ph, 1) - 0.12) / 0.8);
    PL.b = smooth(Math.max(0, ph - 1));
    // caída larga (de un tejado, del coche...): pataleo y brazos como aspas
    const k = clamp01((this.airTime - 0.8) / 0.45) * clamp01(-vy / 5);
    neutral(o);
    this.face(o);
    const sw = Math.sin(t * 11), sw2 = Math.sin(t * 11 + 1);
    R(o, B.thighL, lerp(pl(0.1, -1.25, -0.75), -0.4 + sw * 0.5, k), 0, 0.08);
    R(o, B.shinL, lerp(pl(0.15, 1.7, 0.55), 0.7 + sw2 * 0.4, k), 0, 0);
    R(o, B.thighR, lerp(pl(0.25, -0.7, -0.15), -0.4 - sw * 0.5, k), 0, -0.08);
    R(o, B.shinR, lerp(pl(0.35, 1.25, 0.3), 0.7 - sw2 * 0.4, k), 0, 0);
    R(o, B.footL, pl(0.65, 0.35, 0.1), 0, 0);
    R(o, B.footR, pl(0.7, 0.35, 0.15), 0, 0);
    // brazos: arriba al despegar, abiertos para equilibrarse arriba, en alto al caer
    const fl = Math.sin(t * 15) * 0.35, fl2 = Math.sin(t * 15 + 2) * 0.35;
    arm(o, 1, lerp(pl(-2.6, -1.0, -1.8), -2.6 + fl, k), 0, lerp(pl(0.3, 0.95, 0.85), 0.55 + Math.sin(t * 12) * 0.25, k), lerp(pl(-0.3, -0.75, -0.4), -0.35, k));
    arm(o, -1, lerp(pl(-2.4, -0.8, -1.6), -2.6 + fl2, k), 0, lerp(pl(0.3, 1.05, 0.95), 0.55 + Math.sin(t * 12 + 1) * 0.25, k), lerp(pl(-0.3, -0.7, -0.4), -0.35, k));
    R(o, B.spine, lerp(pl(-0.14, 0.14, 0.02), -0.15, k), 0, 0);
    R(o, B.head, lerp(pl(-0.25, -0.05, 0.12), -0.2, k), 0, 0);
    // cara: «¡hop!» al saltar, «¡uuuh!» al caer de alto
    o[CH.mouth] = lerp(pl(0.55, 0.35, 0.6), 1.15, k);
    o[CH.mouthW] = lerp(pl(0.8, 1.1, 0.8), 0.7, k);
    o[CH.brow] = lerp(pl(0.5, 0.3, 0.6), 1, k);
    o[CH.eye] = lerp(pl(1.1, 1.0, 1.2), 1.35, k);
    o[CH.angry] = lerp(this.baseAngry * 0.5, -0.7, k);
  }

  // ─────────── apuntar ───────────
  private aimLayer(o: Float32Array, pose: CharacterPose) {
    const a = this.tmpB;
    a.set(o);
    const pitch = clamp(this.aimPitch, -1.2, 1.2);
    const w = this.weapon;
    const seated = pose === 'drive' || pose === 'ride';
    // el tronco hace parte de la inclinación; el fusil y el arma pesada giran el pecho (hombro izquierdo delante)
    const sp = seated ? 0 : pitch * 0.3;
    const twist = seated ? 0 : w === 'rifle' ? -0.38 : w === 'heavy' ? -0.3 : w === 'throw' ? 0 : -0.08;
    if (!seated) {
      // el pecho mira al frente aunque la cadera gire al andar
      R(a, B.spine, 0.04 - sp + (a[B.spine * 3] - 0.04) * 0.3, -a[B.hips * 3 + 1] + twist, 0);
      R(a, B.neck, -pitch * 0.12, -twist * 0.4, 0);
      R(a, B.head, -pitch * 0.3, -twist * 0.6, w === 'rifle' ? 0.12 : 0);
    } else {
      R(a, B.head, -pitch * 0.3, 0, 0);
    }
    if (w === 'throw' && !seated) {
      // brazo atrás preparado; al lanzar (recoil) se va hacia delante
      const u = 1 - this.recoil;
      const rel = this.recoil > 0 ? (u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8) : 0;
      arm(a, -1, lerp(-2.5, -0.9, rel), 0, lerp(0.25, -0.15, rel), lerp(-1.7, -0.2, rel));
      arm(a, 1, -1.35 - pitch * 0.7, 0, -0.1, -0.2);
      AR(a, B.spine, 0.25 * rel, lerp(-0.45, 0.35, rel), 0);
    } else {
      // muñecas en puntos del cuerpo alrededor del centro de los hombros, girados con la inclinación
      spineFrame(a);
      shoulderCenter(_aimC);
      _aimCS[0] = Math.cos(pitch);
      _aimCS[1] = Math.sin(pitch);
      if (seated) {
        aimPut(a, -1, -0.13, -0.02, 0.46, -1, -1, 0);
      } else if (w === 'rifle') {
        aimPut(a, -1, -0.11, -0.04, 0.26, -1, -0.45, -0.3); // mano del gatillo, codo fuera
        aimPut(a, 1, -0.07, -0.085, 0.47, 0.45, -1, 0); // mano de apoyo bajo el cañón
      } else if (w === 'heavy') {
        aimPut(a, -1, -0.17, -0.4, 0.22, -1, 0, -0.6); // a la cadera
        aimPut(a, 1, -0.03, -0.33, 0.44, 0.6, -1, 0);
      } else if (w === 'none') {
        // puños: guardia de boxeo (puños a la altura de la barbilla, codos abajo)
        const bob = Math.sin(this.t * 7) * 0.012;
        aimPut(a, -1, -0.1, 0.1 + bob, 0.26, -0.5, -1, 0.1);
        aimPut(a, 1, 0.07, 0.13 - bob, 0.31, 0.5, -1, 0.1);
        AR(a, B.spine, 0.1, 0, 0);
        AR(a, B.head, -0.1, 0, 0);
      } else {
        // pistola a dos manos
        aimPut(a, -1, -0.04, -0.02, 0.475, -0.6, -1, -0.2);
        aimPut(a, 1, 0.0, -0.058, 0.44, 0.8, -1, -0.2);
      }
    }
    lerpBones(o, a, seated ? RIGHT_ARM : UPPER, this.aimW);
  }

  private recoilLayer(o: Float32Array) {
    const k = this.recoil * this.recoil;
    const aw = 0.5 + 0.5 * this.aimW;
    const ka = k * aw;
    switch (this.weapon) {
      case 'rifle':
        // culatazo en el hombro: el tronco se va atrás y el cañón sube
        AR(o, B.spine, -0.13 * ka, 0.08 * ka, 0);
        AR(o, B.armR, -0.14 * ka, 0, 0);
        AR(o, B.armL, -0.16 * ka, 0, 0);
        AR(o, B.handR, -0.2 * ka, 0, 0);
        AR(o, B.head, -0.08 * ka, 0.05 * ka, 0);
        o[CH.hz] -= 0.03 * ka;
        break;
      case 'heavy': {
        const sh = Math.sin(this.t * 70);
        AR(o, B.spine, (-0.08 + sh * 0.025) * ka, sh * 0.03 * ka, 0);
        AR(o, B.armR, (-0.15 + sh * 0.07) * ka, 0, 0);
        AR(o, B.armL, (-0.12 - sh * 0.05) * ka, 0, 0);
        AR(o, B.head, sh * 0.04 * ka, 0, 0);
        break;
      }
      case 'throw':
        break;
      default:
        // pistola: el arma salta hacia arriba (muñeca y brazo) y el hombro se va atrás
        AR(o, B.armR, -0.38 * ka, 0, 0);
        AR(o, B.foreR, -0.15 * ka, 0, 0);
        AR(o, B.handR, -0.45 * ka, 0, 0);
        AR(o, B.armL, -0.3 * ka * this.aimW, 0, 0);
        AR(o, B.spine, -0.06 * ka, 0.05 * ka, 0);
        AR(o, B.head, -0.04 * ka, 0, 0);
        break;
    }
    if (this.weapon !== 'throw') {
      // guiño y mueca con cada disparo
      o[CH.eye] = lerp(o[CH.eye], 0.5, k);
      o[CH.angry] = lerp(o[CH.angry], 0.75, k);
      o[CH.mouth] = lerp(o[CH.mouth], -0.3, k);
      o[CH.mouthW] = lerp(o[CH.mouthW], 1.3, k);
    }
  }

  // ─────────── puñetazo ───────────
  /** Directo con recorrido: carga atrás, golpe con giro de tronco y paso adelante, y vuelta a la guardia. */
  private punchLayer(o: Float32Array) {
    const u = this.punchT;
    const side = this.punchSide;
    let ext: number;
    if (u < 0.07) ext = -0.5 * smooth(u / 0.07);
    else if (u < 0.14) ext = lerp(-0.5, 1, smooth((u - 0.07) / 0.07));
    else if (u < 0.2) ext = 1;
    else ext = 1 - smooth((u - 0.2) / (PUNCH - 0.2));
    const w = u < PUNCH - 0.08 ? 1 : 1 - smooth((u - (PUNCH - 0.08)) / 0.08);
    const a = this.tmpB;
    a.set(o);
    const e = Math.max(0, ext);
    // tronco: el hombro del golpe va hacia delante
    R(a, B.spine, a[B.spine * 3] + 0.12 + 0.08 * e, side * (-0.5 * e + 0.25 * Math.max(0, -ext)), 0);
    R(a, B.head, -0.12, -side * 0.35 * e, 0);
    // puño que golpea: de la barbilla a brazo estirado a la altura del hombro
    const gx = side * 0.1, gy = 0.42, gz = 0.2 + 0.08 * Math.min(0, ext);
    armIK(a, side, lerp(gx, side * 0.03, e), lerp(gy, 0.36, e), lerp(gz, 0.62, e), side * 0.6, -1, -0.2);
    // el otro, en guardia
    armIK(a, -side, -side * 0.08, 0.4, 0.22, -side * 0.5, -1, 0.1);
    lerpBones(o, a, UPPER, w);
    // un paso adelante con el golpe
    o[CH.hz] += 0.05 * e * w;
    AR(o, B.hips, 0, side * -0.18 * e * w, 0);
    o[CH.angry] = lerp(o[CH.angry], 0.9, w);
    o[CH.mouth] = lerp(o[CH.mouth], 0.35 + 0.4 * e, w);
    o[CH.mouthW] = lerp(o[CH.mouthW], 0.8, w);
    o[CH.eye] = lerp(o[CH.eye], 0.8, w);
  }

  // ─────────── gestos ───────────
  private gestureLayer(o: Float32Array, dt: number) {
    const moving = this.speedS > 0.35 || this.airW > 0.05;
    // aburrimiento: parado un buen rato sin hacer nada
    const still = !moving && this.aimW < 0.01 && this.wobbleS < 0.05 && this.crouchW < 0.05 && this.punchT >= PUNCH && this.landT >= 1;
    if (!this.gest) {
      if (still && this.fidgetAfter > 0) {
        this.idleT += dt;
        if (this.idleT > this.fidgetAfter) {
          this.gesture(FIDGETS[this.fidgetN++ % FIDGETS.length]);
          // el siguiente, un rato después
          this.idleT = this.fidgetAfter - 5 - hash01(this.fidgetN, this.seed) * 6;
        }
      } else this.idleT = 0;
      this.gestFullW = 0;
      return;
    }
    const g = this.gest;
    const def = GEST[g];
    // apuntar, agacharse o pegar cortan el gesto; andar corta los de aburrimiento
    if (this.aimW > 0.2 || this.crouchW > 0.3 || this.punchT < PUNCH || (def.idle && moving)) this.stopGesture(0.15);
    // una celebración larga se acorta si echa a andar
    else if (g === 'celebrate' && moving) this.stopGesture(0.6);
    this.gestT += dt;
    if (this.gestT >= this.gestDur) {
      this.gest = null;
      return;
    }
    const env = smooth(this.gestT / 0.18) * smooth((this.gestDur - this.gestT) / 0.25);
    this.gestFullW += ((moving ? 0 : 1) - this.gestFullW) * Math.min(1, dt * 8);
    const a = this.tmpA;
    a.set(o);
    this.gesturePose(a, g, this.gestT, this.gestDur);
    // parado, con todo el cuerpo; andando, de cintura para arriba
    const fw = env * this.gestFullW;
    if (fw > 0.001) lerpInto(o, o, a, fw);
    const k = fw < 0.999 ? (env - fw) / (1 - fw) : 0;
    if (k > 0.001) {
      lerpBones(o, a, UPPER, k);
      for (let i = 0; i < FACE.length; i++) o[FACE[i]] += (a[FACE[i]] - o[FACE[i]]) * k;
    }
  }

  /** Pose de cada gesto (sobre una copia de la pose normal). t = segundos desde que empezó. */
  private gesturePose(o: Float32Array, g: Gesture, t: number, dur: number) {
    const T = this.t;
    switch (g) {
      case 'cheer': {
        // ¡toma! puño derecho al cielo dos veces, el izquierdo tira hacia abajo
        const up = smooth(t / 0.16);
        const pump = up * (0.75 + 0.25 * Math.cos(Math.max(0, t - 0.16) * 15));
        arm(o, -1, lerp(-1.1, -2.95, pump), 0, 0.22, lerp(-1.7, -0.3, pump));
        arm(o, 1, -0.35, 0, 0.12, -2.0 + 0.3 * Math.sin(t * 15), 0.2, 0, 0);
        AR(o, B.spine, -0.1 * up, 0.12 * up, 0.08 * up);
        R(o, B.head, -0.3 * up, 0.1, 0.1 * up);
        // saltito
        o[CH.hy] += 0.05 * Math.max(0, Math.sin(Math.min(1, t / 0.5) * PI)) - 0.03 * smooth((t - 0.5) / 0.2) * (1 - smooth((t - 0.8) / 0.3));
        this.legsFromCurrent(o);
        this.happyFace(o, 1);
        break;
      }
      case 'celebrate': {
        this.happyFace(o, 1);
        if (t < 0.7) {
          // salto con los dos puños arriba: ¡SÍÍÍ!
          const u = t / 0.7;
          const hop = Math.max(0, Math.sin(clamp01((u - 0.12) / 0.7) * PI));
          const crouch = u < 0.12 ? smooth(u / 0.12) : 1 - smooth((u - 0.12) / 0.1);
          o[CH.hy] += 0.22 * hop - 0.1 * crouch;
          legs(o, 0.06, 0.02, hop * 0.2, -0.06, 0.02, hop * 0.2);
          if (hop > 0) {
            AR(o, B.thighL, -0.6 * hop, 0, 0);
            AR(o, B.shinL, 1.0 * hop, 0, 0);
            AR(o, B.thighR, -0.6 * hop, 0, 0);
            AR(o, B.shinR, 1.0 * hop, 0, 0);
          }
          const armsUp = smooth(u / 0.25);
          arm(o, 1, lerp(0.3, -2.95, armsUp), 0, 0.42, -0.35);
          arm(o, -1, lerp(0.3, -2.95, armsUp), 0, 0.42, -0.35);
          R(o, B.spine, -0.12 * armsUp + 0.15 * crouch, 0, 0);
          R(o, B.head, -0.35 * armsUp, 0, 0);
          o[CH.mouth] = 1.2;
        } else if (t < 1.9) {
          // bailecito: molinillo con las manos y cadera de lado a lado
          const u = t - 0.7;
          const b = u * 4.2;
          const sway = Math.sin(b * PI * 0.5);
          o[CH.hx] += sway * 0.06;
          o[CH.hy] -= 0.03 * Math.abs(Math.sin(b * PI));
          R(o, B.hips, 0, sway * 0.15, -sway * 0.1);
          legs(o, 0.1, 0, 0, -0.1, 0, 0);
          const r = u * 16;
          armIK(o, 1, 0.04 + Math.cos(r) * 0.07, 0.2 + Math.sin(r) * 0.07, 0.3, 1, -1, 0);
          armIK(o, -1, -0.04 + Math.cos(r + PI) * 0.07, 0.2 + Math.sin(r + PI) * 0.07, 0.3, -1, -1, 0);
          R(o, B.spine, 0.05, -sway * 0.2, sway * 0.12);
          R(o, B.head, 0.1 * Math.abs(Math.sin(b * PI)), sway * 0.3, -sway * 0.15);
        } else if (t < 2.6) {
          // vuelta completa con los brazos abiertos
          const u = smooth((t - 1.9) / 0.7);
          R(o, B.hips, 0, u * TAU, 0);
          legs(o, 0.05, 0, 0.12 * Math.sin(u * PI), -0.05, 0, 0);
          arm(o, 1, -0.2, 0, 1.45, -0.15);
          arm(o, -1, -0.2, 0, 1.45, -0.15);
          R(o, B.spine, -0.08, 0, 0);
          R(o, B.head, -0.2, 0, 0);
        } else {
          // pose final: pulgar arriba y mano en la cadera
          const u = smooth((t - 2.6) / 0.15);
          R(o, B.hips, 0, 0, 0.08 * u);
          o[CH.hx] += 0.03 * u;
          this.legsFromCurrent(o);
          arm(o, -1, lerp(-0.2, -1.35, u), 0, lerp(1.45, 0.05, u), lerp(-0.15, -1.4, u), 0, 0, 0);
          arm(o, 1, lerp(-0.2, 0.25, u), 0, lerp(1.45, 0.55, u), lerp(-0.15, -1.9, u), 0, 0, 0);
          R(o, B.spine, -0.05, 0.15 * u, -0.08 * u);
          R(o, B.head, -0.1, -0.15 * u, 0.15 * u);
          o[CH.eye] = 0.65; // guiño de satisfacción
        }
        break;
      }
      case 'shrug': {
        // ¿y yo qué sé?
        const u = t < 0.25 ? smooth(t / 0.25) : 1 - smooth((t - dur + 0.4) / 0.35);
        arm(o, 1, -0.2 * u, 0, 0.1 + 0.45 * u, -0.2 - 1.3 * u, 0, -0.9 * u, 0);
        arm(o, -1, -0.2 * u, 0, 0.1 + 0.45 * u, -0.2 - 1.3 * u, 0, -0.9 * u, 0);
        AR(o, B.spine, -0.05 * u, 0, 0);
        R(o, B.head, 0.05 * u, 0, 0.28 * u);
        o[CH.mouth] = -0.35;
        o[CH.mouthW] = 1.2;
        o[CH.brow] = 0.9 * u;
        o[CH.angry] = -0.6 * u;
        break;
      }
      case 'wave': {
        const u = smooth(t / 0.25);
        arm(o, -1, lerp(0, -2.55, u), 0, lerp(0.07, 0.55, u), -0.5 + Math.sin(t * 13) * 0.45 * u);
        R(o, B.head, -0.1, 0.1, 0.12 * u);
        this.happyFace(o, 0.8);
        break;
      }
      case 'watch': {
        // mira el reloj, le da golpecitos, se lo acerca a la oreja y resopla
        const raise = smooth(t / 0.4);
        const ear = t > 1.7 && t < 2.35 ? smooth((t - 1.7) / 0.2) * (1 - smooth((t - 2.15) / 0.2)) : 0;
        const tap = t > 1.0 && t < 1.65 ? Math.max(0, Math.sin((t - 1.0) * 28)) : 0;
        armIK(o, 1, lerp(0.2, 0.04, raise) + ear * 0.12, lerp(-0.2, 0.22, raise) + ear * 0.3, lerp(0.05, 0.3, raise) - ear * 0.2, 1, -1, -0.3);
        if (t > 0.8 && t < 1.8) {
          const k = smooth((t - 0.8) / 0.2) * (1 - smooth((t - 1.6) / 0.2));
          const a = this.tmpB;
          a.set(o);
          armIK(a, -1, 0.02, 0.28 + tap * 0.03, 0.33, -1, -1, 0);
          lerpBones(o, a, ARMS, k);
        }
        R(o, B.head, lerp(0, 0.5, raise) - ear * 0.3, lerp(0, 0.35, raise) + ear * 0.2, ear * 0.3);
        AR(o, B.spine, 0.05 * raise, 0.1 * raise, 0);
        // pie impaciente
        if (t > 2.35) {
          const k = smooth((t - 2.35) / 0.2);
          AR(o, B.footR, -0.35 * Math.max(0, Math.sin(T * 14)) * k, 0, 0);
          o[CH.mouth] = -0.3;
          o[CH.angry] = 0.35;
        } else {
          o[CH.brow] = 0.5 * raise;
          o[CH.mouth] = 0.1;
        }
        break;
      }
      case 'yawn': {
        // se estira con los brazos arriba, boca enorme y ojos cerrados; luego se tapa la boca
        const up = t < 1.3 ? smooth(t / 0.5) : 1 - smooth((t - 1.3) / 0.4);
        const k = smooth((t - 1.4) / 0.3) * (1 - smooth((t - dur + 0.45) / 0.3));
        arm(o, 1, lerp(o[B.armL * 3], -2.9, up), 0, lerp(0.07, 0.55, up), lerp(-0.2, -0.9, up));
        arm(o, -1, lerp(o[B.armR * 3], -2.9, up), 0, lerp(0.07, 0.55, up), lerp(-0.2, -0.9, up));
        if (k > 0) {
          const a = this.tmpB;
          a.set(o);
          armIK(a, -1, -0.04, 0.43, 0.21, -0.4, -1, 0.5);
          lerpBones(o, a, ARMS, k);
        }
        AR(o, B.spine, -0.2 * up, 0, 0);
        R(o, B.head, -0.45 * up + 0.1 * k, 0, 0.1 * up);
        o[CH.hy] += 0.02 * up;
        this.legsFromCurrent(o);
        const open = t < 1.5 ? smooth(t / 0.4) : 1 - smooth((t - 1.5) / 0.6);
        o[CH.mouth] = lerp(0, 1.3, open);
        o[CH.mouthW] = lerp(1, 0.75, open);
        o[CH.eye] = lerp(1, 0.08, open);
        o[CH.brow] = 0.6 * open;
        break;
      }
      case 'scratch': {
        // ¿dónde iba yo? se rasca la cabeza
        const u = smooth(t / 0.35);
        const sc = Math.sin(T * 26) * 0.025 * u;
        armIK(o, -1, lerp(-0.25, -0.1, u), lerp(-0.2, 0.68, u) + sc, lerp(0, 0.03, u), -1, 0.3, 0.5, 0.4, 0, 0);
        R(o, B.head, 0.05, -0.15 * u, -0.2 * u);
        AR(o, B.spine, 0, 0, 0.06 * u);
        o[CH.eye] = 0.75;
        o[CH.mouth] = -0.2;
        o[CH.mouthW] = 0.6;
        o[CH.angry] = -0.45;
        o[CH.brow] = 0.3;
        break;
      }
      case 'arms': {
        // brazos cruzados y golpecitos con el pie
        const u = smooth(t / 0.35);
        const a = this.tmpB;
        a.set(o);
        armIK(a, 1, -0.12, 0.13, 0.2, 1, -0.4, 0.3);
        armIK(a, -1, 0.12, 0.17, 0.23, -1, -0.4, 0.3);
        lerpBones(o, a, ARMS, u);
        AR(o, B.spine, -0.05 * u, 0, 0);
        R(o, B.head, -0.05, Math.sin(T * 0.9) * 0.35 * u, 0.06);
        AR(o, B.footR, -0.35 * Math.max(0, Math.sin(T * 13)) * smooth((t - 0.6) / 0.2), 0, 0);
        o[CH.angry] = 0.4;
        o[CH.mouth] = -0.35;
        break;
      }
      case 'point': {
        // ¡¡MIRA ESO!! señala con el brazo estirado y se lleva la otra mano a la cabeza
        const u = smooth(t / 0.2);
        const jab = Math.sin(T * 17) * 0.06 * u;
        arm(o, -1, lerp(o[B.armR * 3], -1.55, u) + jab, 0, lerp(0.07, -0.05, u), -0.04, -0.25 * u, 0, 0);
        const a = this.tmpB;
        a.set(o);
        armIK(a, 1, 0.12, 0.66, 0.04, 1, 0.3, 0.5, 0.4, 0, 0);
        lerpBones(o, a, LEFT_ARM, u);
        AR(o, B.spine, 0.12 * u, -0.12 * u, 0);
        R(o, B.head, -0.12 * u, -0.08, 0);
        this.scaredFace(o, u);
        o[CH.mouth] = 1.1 + Math.sin(T * 20) * 0.15;
        break;
      }
      case 'film': {
        // lo graba todo con el móvil en alto (en horizontal), sin perderse detalle
        const u = smooth(t / 0.3);
        const sway = Math.sin(T * 1.7) * 0.025;
        const a = this.tmpB;
        a.set(o);
        armIK(a, -1, -0.27 + sway, 0.72, 0.3, -1, -0.5, 0);
        phoneFacing(a, true);
        lerpBones(o, a, R_ARM, u);
        o[B.phone * 3] = a[B.phone * 3];
        o[B.phone * 3 + 1] = a[B.phone * 3 + 1];
        o[B.phone * 3 + 2] = a[B.phone * 3 + 2];
        o[CH.phone] = u;
        R(o, B.head, -0.12 * u, sway * 2 - 0.1 * u, 0);
        o[CH.mouth] = 0.45;
        o[CH.mouthW] = 0.7;
        o[CH.eye] = 1.25;
        o[CH.brow] = 0.8;
        break;
      }
      case 'fist': {
        // enfadado: agita el puño junto a la cabeza
        const u = smooth(t / 0.2);
        const sh = Math.sin(T * 16);
        const a = this.tmpB;
        a.set(o);
        armIK(a, -1, -0.35, 0.55 + sh * 0.03, 0.25 + sh * 0.07, -0.5, -1, 0.2, -0.3, 0, 0);
        lerpBones(o, a, R_ARM, u);
        AR(o, B.spine, 0.06 * u, 0.1 * u, 0);
        R(o, B.head, -0.05 + sh * 0.04 * u, 0.1 * u, 0);
        o[CH.angry] = 1;
        o[CH.mouth] = 0.75 + Math.sin(T * 11) * 0.2;
        o[CH.mouthW] = 0.9;
        o[CH.brow] = -0.2;
        break;
      }
      case 'flail': {
        // ¡socorro! huye con los brazos en alto
        const u = smooth(t / 0.2);
        arm(o, 1, lerp(o[B.armL * 3], -2.75 + Math.sin(T * 17) * 0.4, u), 0, 0.35 + Math.sin(T * 13) * 0.25, -0.3);
        arm(o, -1, lerp(o[B.armR * 3], -2.75 + Math.sin(T * 17 + 2.2) * 0.4, u), 0, 0.35 + Math.sin(T * 13 + 1.1) * 0.25, -0.3);
        AR(o, B.spine, -0.12 * u, 0, 0);
        R(o, B.head, -0.25 * u, Math.sin(T * 5) * 0.3, 0);
        this.scaredFace(o, u);
        break;
      }
      case 'cover': {
        // tiros: se tapa la cabeza con las manos y corre agachado
        const u = smooth(t / 0.15);
        const a = this.tmpB;
        a.set(o);
        AR(a, B.spine, 0.35, 0, 0);
        armIK(a, 1, 0.12, 0.67, 0.03, 0.6, 0.2, 1);
        armIK(a, -1, -0.12, 0.67, 0.03, -0.6, 0.2, 1);
        R(a, B.head, 0.25, 0, 0);
        lerpBones(o, a, UPPER, u);
        o[CH.hy] -= 0.06 * u;
        this.legsFromCurrent(o);
        this.scaredFace(o, u);
        o[CH.eye] = lerp(1, 0.25, u);
        break;
      }
      case 'lookback': {
        // corre mirando hacia atrás (¿me sigue?)
        const u = smooth(t / 0.3);
        const k = u * (0.6 + 0.4 * Math.sin(T * 2.3));
        AR(o, B.spine, -0.05 * k, 0.55 * k, 0);
        R(o, B.neck, 0, 0.4 * k, 0);
        R(o, B.head, -0.1, 0.55 * k, 0);
        this.scaredFace(o, u);
        break;
      }
    }
  }

  private happyFace(o: Float32Array, k: number) {
    o[CH.mouth] = lerp(o[CH.mouth], 1.0, k);
    o[CH.mouthW] = lerp(o[CH.mouthW], 1.35, k);
    o[CH.brow] = lerp(o[CH.brow], 0.7, k);
    o[CH.angry] = lerp(o[CH.angry], -0.35, k);
    o[CH.eye] = lerp(o[CH.eye], 1.15, k);
  }
  private scaredFace(o: Float32Array, k: number) {
    o[CH.mouth] = lerp(o[CH.mouth], 1.15, k);
    o[CH.mouthW] = lerp(o[CH.mouthW], 0.7, k);
    o[CH.brow] = lerp(o[CH.brow], 1, k);
    o[CH.angry] = lerp(o[CH.angry], -0.9, k);
    o[CH.eye] = lerp(o[CH.eye], 1.35, k);
  }

  // ─────────── vehículos y asientos ───────────
  private poseDrive(o: Float32Array) {
    o.set(this.kfDrive);
    this.face(o);
    const t = this.t;
    const steer = wave(t * 0.6, this.seed) * 0.3;
    AR(o, B.spine, Math.sin(t * 1.7) * 0.012, 0, -steer * 0.06);
    wheelHands(o, steer, this.bodyScale);
    AR(o, B.head, 0, wave(t * 0.3, this.seed + 3) * 0.25 + steer * 0.4, 0);
  }

  private poseRide(o: Float32Array) {
    neutral(o);
    this.face(o);
    o[CH.hy] = seatHip(RIDE_LAYOUT.seatY, this.bodyScale);
    o[CH.hz] = -0.02;
    R(o, B.hips, 0.2, 0, 0);
    // pies en el suelo del vehículo (RIDE_LAYOUT.feet), rodillas abiertas
    const F = RIDE_LAYOUT.feet, k = 1 / this.bodyScale;
    legs(o, F.halfWidth * k - HIP_X, F.z * k, F.y * k, -(F.halfWidth * k - HIP_X), F.z * k, F.y * k);
    AR(o, B.thighL, 0, 0, 0.12);
    AR(o, B.thighR, 0, 0, -0.12);
    const t = this.t;
    const yaw = wave(t * 0.5, this.seed) * 0.08;
    R(o, B.spine, 0.18 + Math.sin(t * 2) * 0.01, 0, -yaw * 0.5);
    R(o, B.head, -0.35, wave(t * 0.3, this.seed) * 0.2, 0);
    barHands(o, yaw, this.bodyScale);
  }

  private poseSit(o: Float32Array) {
    neutral(o);
    this.face(o);
    const t = this.t;
    // trasero en SIT_LAYOUT.seatY (sea cual sea la altura) y pies apoyados en el suelo
    o[CH.hy] = seatHip(SIT_LAYOUT.seatY, this.bodyScale);
    o[CH.hz] = -0.05;
    R(o, B.hips, -0.06, 0, 0);
    const crossed = (this.seed >> 3) % 2 === 0;
    const tap = Math.max(0, Math.sin(t * 5.5)) * 0.03 * ((this.seed >> 5) % 2);
    legs(o, 0.03, 0.4, tap, -0.03, 0.38, 0);
    if (crossed) {
      // pierna derecha cruzada por encima
      R(o, B.thighR, -1.62, 0, 0.3);
      R(o, B.shinR, 1.2, 0, 0);
      R(o, B.footR, 0.3 + Math.sin(t * 2.2) * 0.12, 0, -0.2);
      arm(o, 1, -0.5, 0, 0.12, -0.7);
      arm(o, -1, -0.55, 0, 0.0, -0.95);
    } else {
      arm(o, 1, -0.42, 0, 0.12, -0.8);
      arm(o, -1, -0.42, 0, 0.12, -0.8);
    }
    R(o, B.spine, 0.04 + Math.sin(t * 1.6) * 0.02 + this.gait.hunch * 0.6, 0, 0);
    R(o, B.head, -0.03, wave(t * 0.35, this.seed) * 0.45, 0);
  }

  // ─────────── baile ───────────
  private poseDance(o: Float32Array) {
    neutral(o);
    this.face(o);
    const t = this.t;
    const b = t * (124 / 60) + (this.seed % 17) * 0.13; // pulsos
    const beat = Math.abs(Math.sin(PI * b));
    o[CH.mouth] = 0.6 + beat * 0.3;
    o[CH.angry] = -0.2;
    o[CH.eye] = 1.05;
    let fxL = 0.05, fxR = -0.05, fzL = 0, fzR = 0, lyL = 0, lyR = 0;
    switch (this.danceStyle) {
      case 0: {
        // brazos arriba
        o[CH.hy] = 0.87 + HIPJ - 0.07 * beat;
        R(o, B.hips, 0, 0, 0.08 * Math.sin(PI * b));
        arm(o, 1, -2.75 + 0.35 * Math.sin(PI * b), 0, 0.35, -0.35);
        arm(o, -1, -2.75 - 0.35 * Math.sin(PI * b), 0, 0.35, -0.35);
        R(o, B.spine, -0.05, 0, -0.1 * Math.sin(PI * b));
        R(o, B.head, 0.18 * beat - 0.1, 0, 0.1 * Math.sin(PI * b));
        fxL = 0.08; fxR = -0.08;
        break;
      }
      case 1: {
        // el robot: posturas que cambian de golpe
        const step = Math.floor(b * 2);
        const sf = (b * 2) % 1;
        const snap = Math.min(1, sf * 7);
        const sd = this.seed;
        o[CH.hy] = 0.86 + HIPJ - 0.03 * (1 - snap);
        arm(o, 1, -0.3 + robotV(step, 1, snap, sd, 0.6) - 0.3, 0, 1.35, -1.57 + robotV(step, 2, snap, sd, 1.2) * (step % 2 ? 1 : -1) * 0.6);
        arm(o, -1, -0.3 + robotV(step, 3, snap, sd, 0.6) - 0.3, 0, 1.35, -1.57 + robotV(step, 4, snap, sd, 1.2) * (step % 2 ? -1 : 1) * 0.6);
        R(o, B.spine, 0, (robotV(step, 5, snap, sd, 1) - 0.5) * 0.6, 0);
        R(o, B.head, 0, (robotV(step, 6, snap, sd, 1) - 0.5) * 1.1, 0);
        o[CH.mouth] = -0.3;
        o[CH.eye] = 1;
        break;
      }
      case 2: {
        // paso lateral con palmas
        const sway = Math.sin(PI * b * 0.5);
        o[CH.hx] = sway * 0.1;
        o[CH.hy] = 0.86 + HIPJ - 0.04 * beat;
        R(o, B.hips, 0, 0, -sway * 0.08);
        fxL = 0.12; fxR = -0.12;
        const tap = Math.max(0, Math.sin(PI * b));
        if (Math.floor(b) % 2 === 0) lyL = 0.08 * tap; else lyR = 0.08 * tap;
        const clap = Math.pow(Math.abs(Math.cos(PI * b)), 6);
        arm(o, 1, -1.1 - clap * 0.2, 0, lerp(0.35, -0.5, clap), -0.9);
        arm(o, -1, -1.1 - clap * 0.2, 0, lerp(0.35, -0.5, clap), -0.9);
        R(o, B.spine, 0.05, sway * 0.2, sway * 0.12);
        R(o, B.head, 0.1 * beat, sway * 0.3, sway * 0.1);
        break;
      }
      case 3: {
        // fiebre del sábado: dedo arriba, dedo abajo
        const up = Math.sin(PI * b * 0.5) > 0;
        const k = smooth((Math.abs(Math.sin(PI * b * 0.5))) * 1.5);
        o[CH.hy] = 0.86 + HIPJ - 0.05 * beat;
        R(o, B.hips, 0, 0.15 * Math.sin(PI * b), 0.1 * Math.sin(PI * b));
        if (up) arm(o, -1, lerp(-1.2, -2.6, k), 0, lerp(0.2, 0.55, k), -0.1);
        else arm(o, -1, lerp(-1.2, -0.6, k), 0, lerp(0.2, -0.45, k), -0.1);
        arm(o, 1, 0.25, 0, 0.55, -1.5);
        R(o, B.spine, -0.05, 0, (up ? 0.12 : -0.1) * k);
        R(o, B.head, up ? -0.3 * k : 0.25 * k, 0.2, 0);
        fxL = 0.1; fxR = -0.1;
        break;
      }
      case 4: {
        // el pollo
        const f = Math.abs(Math.sin(PI * b * 2));
        o[CH.hy] = 0.78 + HIPJ - 0.05 * beat;
        R(o, B.hips, 0.2, 0, 0);
        arm(o, 1, 0.3, 0, 0.35 + 0.55 * f, -2.3);
        arm(o, -1, 0.3, 0, 0.35 + 0.55 * f, -2.3);
        R(o, B.spine, 0.2, 0, 0);
        R(o, B.neck, 0.3 * Math.sin(PI * b * 2), 0, 0);
        R(o, B.head, -0.3, 0, 0);
        fxL = 0.1; fxR = -0.1;
        fzL = 0.05; fzR = 0.05;
        if (Math.floor(b) % 2 === 0) lyL = 0.06 * beat; else lyR = 0.06 * beat;
        o[CH.mouthW] = 0.6;
        o[CH.mouth] = 0.9;
        break;
      }
      default: {
        // twist
        const tw = Math.sin(PI * b);
        o[CH.hy] = 0.8 + HIPJ - 0.04 * beat;
        R(o, B.hips, 0.05, tw * 0.45, 0);
        R(o, B.spine, 0.1, -tw * 0.75, 0);
        arm(o, 1, -0.4 - tw * 0.4, 0, 0.45, -1.4);
        arm(o, -1, -0.4 + tw * 0.4, 0, 0.45, -1.4);
        R(o, B.head, 0.1, tw * 0.3, 0);
        fxL = 0.1; fxR = -0.1;
        break;
      }
    }
    legs(o, fxL, fzL, lyL, fxR, fzR, lyR);
  }

  // ─────────── golpes y suelo ───────────
  private poseKnocked(o: Float32Array, grounded: boolean) {
    const t = this.t;
    if (!grounded) {
      neutral(o);
      o[CH.hy] = HIP_Y;
      R(o, B.hips, -0.9 + Math.sin(t * 7) * 0.25, 0, Math.sin(t * 5) * 0.2);
      R(o, B.spine, -0.2, 0, 0);
      R(o, B.head, -0.3, 0, 0);
      arm(o, 1, -2.2 + Math.sin(t * 13) * 0.8, 0, 1.0 + Math.sin(t * 9) * 0.4, -0.3 - Math.sin(t * 11) * 0.3);
      arm(o, -1, -2.0 + Math.sin(t * 12 + 2) * 0.8, 0, 1.0 + Math.sin(t * 8 + 1) * 0.4, -0.3 - Math.sin(t * 10) * 0.3);
      R(o, B.thighL, -0.6 + Math.sin(t * 11) * 0.6, 0, 0.25);
      R(o, B.shinL, 0.8 + Math.sin(t * 11 + 1) * 0.5, 0, 0);
      R(o, B.thighR, -0.6 - Math.sin(t * 10) * 0.6, 0, -0.25);
      R(o, B.shinR, 0.8 - Math.sin(t * 10 + 1) * 0.5, 0, 0);
      o[CH.mouth] = 1.2;
      o[CH.mouthW] = 0.75;
      o[CH.brow] = 1;
      o[CH.angry] = -0.8;
      o[CH.eye] = 1.3;
      return;
    }
    o.set(KF_LYING);
    const since = this.blendT; // tiempo desde que tocó el suelo
    const flop = Math.exp(-since * 4) * Math.sin(since * 18) * 0.45;
    AR(o, B.armL, flop, 0, flop * 0.5);
    AR(o, B.armR, -flop, 0, -flop * 0.5);
    AR(o, B.thighL, flop * 0.3, 0, 0);
    AR(o, B.thighR, -flop * 0.3, 0, 0);
    AR(o, B.head, 0, Math.sin(t * 1.3) * 0.3, 0);
    o[CH.eye] = 0.5;
    o[CH.mouth] = 0.35;
    o[CH.angry] = -0.5;
    o[CH.stars] = 1;
  }

  private poseDead(o: Float32Array) {
    o.set(KF_LYING);
    arm(o, 1, 0.25, 0, 1.45, -0.35);
    arm(o, -1, 0.3, 0, 1.3, -0.5);
    R(o, B.thighL, -1.05, 0, 0.12);
    R(o, B.shinL, 1.7, 0, 0);
    R(o, B.footL, -0.55, 0.3, 0);
    R(o, B.thighR, -0.1, 0, -0.35);
    R(o, B.shinR, 0.2, 0, 0);
    R(o, B.footR, 0.3, -0.6, 0);
    R(o, B.neck, 0.3, 0, 0);
    R(o, B.head, 0.12, 0.5, 0);
    // pataleo cómico al principio
    const pt = this.poseT;
    if (pt > 0.5 && pt < 1.6) {
      const tw = Math.sin(pt * 30) * Math.exp(-(pt - 0.5) * 2.5) * 0.25;
      AR(o, B.footR, tw, 0, 0);
      AR(o, B.shinL, tw * 0.5, 0, 0);
    }
    o[CH.dead] = 1;
    o[CH.mouth] = 0.3;
    o[CH.mouthW] = 0.9;
    o[CH.brow] = 0.4;
    o[CH.angry] = -0.3;
  }

  /** Sacado del coche de un tirón: sale volando pataleando y cae de culo, cabreado. */
  private posePulled(o: Float32Array) {
    const t = this.t;
    neutral(o);
    // en el aire (0-0,35 s): echado hacia atrás, pataleando
    const u = clamp01(this.poseT / 0.35);
    o[CH.hy] = 0.86 + HIPJ + 0.14 * Math.sin(PI * u);
    o[CH.hz] = 0.04;
    R(o, B.hips, -0.55, 0, Math.sin(t * 6) * 0.1);
    legs(o, 0.05, 0.3 + Math.sin(t * 13) * 0.14, 0.12 + Math.max(0, Math.sin(t * 13)) * 0.12, -0.05, 0.2 - Math.sin(t * 13) * 0.14, 0.12 + Math.max(0, -Math.sin(t * 13)) * 0.12);
    R(o, B.spine, -0.25, 0, 0);
    R(o, B.head, 0.15, Math.sin(t * 5) * 0.3, 0);
    arm(o, 1, -1.9 + Math.sin(t * 14) * 0.6, 0, 0.5 + Math.sin(t * 11) * 0.3, -0.3);
    arm(o, -1, -1.8 + Math.sin(t * 13 + 1) * 0.6, 0, 0.5 + Math.sin(t * 10 + 2) * 0.3, -0.3);
    o[CH.mouth] = 1.2;
    o[CH.mouthW] = 0.75;
    o[CH.brow] = 1;
    o[CH.angry] = -0.9;
    o[CH.eye] = 1.35;
    // de culo en el suelo: patalea y agita los puños
    const k = smooth((this.poseT - 0.3) / 0.12);
    if (k > 0) {
      const a = this.tmpB;
      a.set(KF_SITUP);
      const kick = Math.sin(t * 16);
      AR(a, B.thighL, -0.35 * Math.max(0, kick), 0, 0);
      AR(a, B.shinL, -0.4 * Math.max(0, kick), 0, 0);
      AR(a, B.thighR, -0.35 * Math.max(0, -kick), 0, 0);
      AR(a, B.shinR, -0.4 * Math.max(0, -kick), 0, 0);
      arm(a, 1, -1.9 + Math.sin(t * 15) * 0.25, 0, 0.35, -1.3);
      arm(a, -1, -1.9 + Math.sin(t * 15 + 1.5) * 0.25, 0, 0.35, -1.3);
      R(a, B.spine, 0.35, 0, 0);
      R(a, B.head, -0.2, Math.sin(t * 4) * 0.2, 0);
      a[CH.angry] = 1;
      a[CH.mouth] = 0.8 + Math.sin(t * 12) * 0.2;
      a[CH.mouthW] = 0.9;
      a[CH.brow] = -0.2;
      a[CH.eye] = 1.1;
      lerpInto(o, o, a, k);
    }
  }

  private poseTaped(o: Float32Array) {
    const t = this.t;
    o.set(KF_LYING);
    const w = Math.sin(t * 5);
    AR(o, B.hips, 0, 0, w * 0.16);
    arm(o, 1, 0.12, 0, 0.1, -0.1 + Math.sin(t * 9) * 0.15);
    arm(o, -1, 0.12, 0, 0.1, -0.1 + Math.sin(t * 8) * 0.15);
    R(o, B.spine, 0, 0, -w * 0.1);
    // levanta la cabeza para mirar la cinta (x positivo = hacia el pecho = arriba)
    R(o, B.neck, 0.2 + Math.max(0, Math.sin(t * 2.3)) * 0.45, 0, 0);
    R(o, B.head, 0.12, Math.sin(t * 3) * 0.3, 0);
    R(o, B.thighL, -0.1 + Math.sin(t * 7) * 0.03, 0, 0.03);
    R(o, B.thighR, -0.1 + Math.sin(t * 7 + PI) * 0.03, 0, -0.03);
    R(o, B.footL, 0.25 + Math.sin(t * 11) * 0.15, 0.2, 0);
    R(o, B.footR, 0.25 + Math.sin(t * 11 + 1) * 0.15, -0.2, 0);
    o[CH.tape] = 1;
    o[CH.mouth] = 0.25 + Math.max(0, Math.sin(t * 4)) * 0.4;
    o[CH.mouthW] = 0.6;
    o[CH.angry] = 0.9;
    o[CH.eye] = 1.1;
  }
}
