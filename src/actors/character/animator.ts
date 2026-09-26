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
/** Gira el hueso del móvil para que la pantalla (+X) mire a la cara y el lado largo (+Y) vaya hacia delante. */
function phoneFacing(o: Float32Array) {
  // orientación de la mano derecha en el espacio del pecho
  _eu.set(o[B.armR * 3], o[B.armR * 3 + 1], o[B.armR * 3 + 2], 'XYZ');
  _qp.setFromEuler(_eu);
  _eu.set(o[B.foreR * 3], o[B.foreR * 3 + 1], o[B.foreR * 3 + 2], 'XYZ');
  _qp.multiply(_qp2.setFromEuler(_eu));
  _eu.set(o[B.handR * 3], o[B.handR * 3 + 1], o[B.handR * 3 + 2], 'XYZ');
  _qp.multiply(_qp2.setFromEuler(_eu));
  // orientación deseada en el espacio del pecho
  _px.set(0.1, 0.85, -0.5).normalize();
  _py.set(0, 0.45, 0.9);
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
const KF_DRIVE = new Float32Array(NCH);
const KF_DUCK = new Float32Array(NCH);
const KF_LEGIN = new Float32Array(NCH);
const KF_REACH = new Float32Array(NCH);
const KF_GRAB = new Float32Array(NCH);
const KF_PULL = new Float32Array(NCH);
(function buildKeyframes() {
  standPose(KF_STAND);
  lyingPose(KF_LYING);
  drivePose(KF_DRIVE, 1);

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
})();

// secuencias (constantes: sin reservar memoria por frame)
const SEQ_GETUP = [KF_LYING, KF_SITUP, KF_CROUCH, KF_STAND];
const T_GETUP = [0, 0.35, 0.68, 1.0];
const T_ENTER = [0, 0.3, 0.65, 1.0];
const SEQ_PULL = [KF_REACH, KF_GRAB, KF_PULL, KF_PULL, KF_REACH];
const T_PULL = [0, 0.3, 0.7, 1.05, 1.3];

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
    this.danceStyle = seed % 6;
    this.phase = (seed % 1000) / 1000;
    this.t = (seed % 997) * 0.37;
    this.blinkT = 1 + (seed % 7) * 0.4;
    standPose(this.cur);
    this.setScale(1);
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
      if (pose !== this.pose) this.poseT = 0;
      this.from.set(this.cur);
      this.blendT = 0;
      this.blendDur = BLEND[pose] ?? 0.25;
      this.pose = pose;
      this.sub = sub;
    } else this.poseT += dt;

    const speed = Math.max(0, p.speed || 0);
    this.speedS += (speed - this.speedS) * Math.min(1, dt * 9);
    const wob = p.wobble !== undefined && Number.isFinite(p.wobble) ? clamp01(p.wobble) : 0;
    this.wobbleS += (wob - this.wobbleS) * Math.min(1, dt * 3);
    const canAim = pose === 'normal' || pose === 'drive' || pose === 'ride';
    const aimTarget = p.aiming && canAim ? 1 : 0;
    this.aimW += (aimTarget - this.aimW) * Math.min(1, dt * 14);
    if (this.aimW < 0.001) this.aimW = 0;
    const pitchIn = p.aimPitch;
    this.aimPitch += ((pitchIn !== undefined && Number.isFinite(pitchIn) ? pitchIn : 0) - this.aimPitch) * Math.min(1, dt * 20);
    if (p.weapon) this.weapon = p.weapon;
    if (p.shot) this.recoil = 1;
    else this.recoil = Math.max(0, this.recoil - dt / (this.weapon === 'throw' ? 0.45 : 0.14));

    const vy = p.vy !== undefined && Number.isFinite(p.vy) ? p.vy : 0;
    this.vy = vy;
    const air = pose === 'normal' && !grounded && (this.airTime > 0.1 || vy > 1.5) ? 1 : 0;
    this.airW += (air - this.airW) * Math.min(1, dt * (air ? 10 : 18));

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
        const tt = this.poseT % 1.3;
        keyframes(o, SEQ_PULL, T_PULL, tt);
        if (tt > 0.6 && tt < 1.1) {
          const sh = Math.sin(this.t * 40) * 0.04;
          AR(o, B.armL, sh, 0, 0);
          AR(o, B.armR, -sh, 0, 0);
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

    // capa de apuntado (tronco y brazos)
    if (this.aimW > 0) this.aimLayer(o, pose);
    if (this.recoil > 0) this.recoilLayer(o);

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
    const run = clamp01((v - 2.2) / 3.3);
    const mw = smooth(this.speedS / 0.7);
    let C: number;
    if (v <= 2) C = 1.25 * Math.sqrt(Math.max(0.3, v / 2));
    else if (v <= 6) C = 1.25 + 1.25 * ((v - 2) / 4);
    else C = 2.5 * Math.pow(v / 6, 0.6);
    C *= g.stride;
    // el root avanza en metros del mundo y el cuerpo va escalado: el paso también
    this.phase = (this.phase + (v * dt) / (C * this.bodyScale)) % 1;
    const ph = this.phase;
    const s = lerp(0.58, 0.36, run);
    const S = C * s;
    const lift = lerp(0.1, 0.3, run) + wob * 0.09;

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

    // cadera
    const bobW = -0.028 * (0.5 + 0.5 * Math.cos(TAU * 2 * (ph - 0.04)));
    const bobR = 0.045 * Math.cos(TAU * 2 * (ph - 0.43));
    const idleH = 0.885 + Math.sin(t * 1.7) * 0.004;
    const moveH = lerp(0.845, 0.8, run) + lerp(bobW, bobR, run) * g.bounce;
    let H = lerp(idleH, moveH, mw);
    // aterrizaje: flexión rápida
    if (this.landT < 1) {
      const u = this.landT;
      const f = u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75;
      H -= 0.15 * this.landAmt * f;
      AR(o, B.spine, 0.25 * this.landAmt * f, 0, 0);
      AR(o, B.head, -0.15 * this.landAmt * f, 0, 0);
    }
    H -= wob * (0.03 + 0.02 * Math.sin(t * 2.3));
    const idle = 1 - mw;
    const shift = Math.sin(t * 0.45 + this.seed) * 0.012 * idle;
    o[CH.hx] = shift + wob * 0.09 * Math.sin(t * 1.4);
    o[CH.hy] = H + HIPJ;
    o[CH.hz] = 0;
    R(
      o, B.hips,
      0.1 * run * mw,
      -0.11 * nL * mw * (1 + g.swagger * 0.8),
      (0.04 * Math.sin(TAU * ph) * (1 - run) * mw + shift * 1.5) * (1 + g.swagger) + wob * 0.14 * Math.sin(t * 1.7),
    );

    // pies (al pararse vuelven a su sitio). Al apuntar parado: pie izquierdo adelantado.
    const st = this.aimW * idle;
    const splay = wob * 0.08;
    this.fxL = splay + st * 0.03;
    this.fzL = zL * mw + st * 0.13;
    this.fyL = yL * mw;
    this.fxR = -splay - st * 0.02;
    this.fzR = zR * mw - st * 0.1;
    this.fyR = yR * mw;
    legs(o, this.fxL, this.fzL, this.fyL, this.fxR, this.fzR, this.fyR);
    // puntera caída al levantar el pie
    AR(o, B.footL, this.swingL * 0.35 * mw, 0, 0);
    AR(o, B.footR, this.swingR * 0.35 * mw, 0, 0);

    // brazos (contrarios a las piernas)
    const amp = lerp(0.42, 0.95, run) * mw * g.swing;
    const out = 0.07 + 0.1 * run + g.armOut + wob * 0.45;
    const breathe = Math.sin(t * 1.7) * 0.02 * idle;
    const flap = wob * 0.55 * Math.sin(t * 3.1);
    const aL = -amp * nR, aR = -amp * nL;
    arm(o, 1, aL + flap, 0, out + breathe, -(0.14 + 1.3 * run * mw + Math.max(0, -aL) * 0.45));
    arm(o, -1, aR - flap, 0, out + breathe, -(0.14 + 1.3 * run * mw + Math.max(0, -aR) * 0.45));

    // tronco y cabeza
    const lean = lerp(0.03, 0.28, run) * mw + g.hunch;
    R(o, B.spine, lean + breathe * 0.8 + wob * 0.14 * Math.sin(t * 0.9), 0.2 * nL * amp, -shift * 1.2 + wob * 0.28 * Math.sin(t * 1.3));
    const look = wave(t * 0.35, this.seed) * 0.45 * idle;
    R(o, B.head, -lean * 0.75 + Math.sin(t * 0.6 + this.seed) * 0.04 * idle, look - 0.12 * nL * amp, wob * 0.35 * Math.sin(t * 1.7 + 1));
  }

  // ─────────── salto y caída ───────────
  private airPose(o: Float32Array, vy: number) {
    const k = clamp01(-vy / 6);
    const t = this.t;
    neutral(o);
    this.face(o);
    // recogido (subiendo)
    const tuckA = 1 - k;
    R(o, B.thighL, lerp(-1.15, -0.4 + Math.sin(t * 11) * 0.5, k), 0, 0.08);
    R(o, B.shinL, lerp(1.55, 0.7 + Math.sin(t * 11 + 1) * 0.4, k), 0, 0);
    R(o, B.thighR, lerp(-0.5, -0.4 - Math.sin(t * 11) * 0.5, k), 0, -0.08);
    R(o, B.shinR, lerp(1.0, 0.7 - Math.sin(t * 11 + 1) * 0.4, k), 0, 0);
    R(o, B.footL, 0.3, 0, 0);
    R(o, B.footR, 0.3, 0, 0);
    arm(o, 1, lerp(-0.8, -2.6 + Math.sin(t * 15) * 0.35, k), 0, lerp(0.75, 0.55 + Math.sin(t * 12) * 0.25, k), lerp(-0.6, -0.35, k));
    arm(o, -1, lerp(-0.3, -2.6 + Math.sin(t * 15 + 2) * 0.35, k), 0, lerp(0.9, 0.55 + Math.sin(t * 12 + 1) * 0.25, k), lerp(-0.5, -0.35, k));
    R(o, B.spine, lerp(0.12, -0.15, k), 0, 0);
    R(o, B.head, lerp(-0.1, -0.2, k), 0, 0);
    o[CH.mouth] = lerp(0.3, 1.1, k) * (0.5 + 0.5 * tuckA + k * 0.5);
    o[CH.mouthW] = lerp(1, 0.7, k);
    o[CH.brow] = k;
    o[CH.eye] = lerp(1, 1.3, k);
    o[CH.angry] = lerp(this.baseAngry, -0.7, k);
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
    switch (this.weapon) {
      case 'rifle':
        AR(o, B.spine, -0.08 * k * aw, 0.06 * k * aw, 0);
        AR(o, B.armR, -0.1 * k * aw, 0, 0);
        AR(o, B.armL, -0.1 * k * aw, 0, 0);
        AR(o, B.head, -0.05 * k * aw, 0, 0);
        break;
      case 'heavy':
        AR(o, B.spine, -0.07 * k * aw, 0, 0);
        AR(o, B.armR, (-0.15 + Math.sin(this.t * 70) * 0.06) * k * aw, 0, 0);
        AR(o, B.armL, -0.12 * k * aw, 0, 0);
        break;
      case 'throw':
        break;
      default:
        AR(o, B.armR, -0.38 * k * aw, 0, 0);
        AR(o, B.foreR, -0.15 * k * aw, 0, 0);
        AR(o, B.armL, -0.3 * k * aw * this.aimW, 0, 0);
        AR(o, B.spine, -0.05 * k * aw, 0, 0);
        break;
    }
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

  private posePulled(o: Float32Array) {
    const t = this.t;
    neutral(o);
    o[CH.hy] = 0.86 + HIPJ;
    o[CH.hz] = 0.04;
    R(o, B.hips, -0.25, 0, Math.sin(t * 6) * 0.08);
    legs(o, 0.05, 0.22 + Math.sin(t * 8) * 0.12, Math.max(0, Math.sin(t * 8)) * 0.1, -0.05, 0.12 - Math.sin(t * 8) * 0.12, Math.max(0, -Math.sin(t * 8)) * 0.1);
    R(o, B.spine, -0.2, 0, 0);
    R(o, B.head, 0.1, Math.sin(t * 5) * 0.3, 0);
    arm(o, 1, -1.6 + Math.sin(t * 9) * 0.55, 0, 0.3 + Math.sin(t * 7) * 0.3, -0.3);
    arm(o, -1, -1.5 + Math.sin(t * 8 + 1) * 0.55, 0, 0.3 + Math.sin(t * 6 + 2) * 0.3, -0.3);
    o[CH.mouth] = 1.1;
    o[CH.mouthW] = 0.75;
    o[CH.brow] = 1;
    o[CH.angry] = -0.9;
    o[CH.eye] = 1.3;
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
