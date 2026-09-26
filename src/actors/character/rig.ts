// El personaje: UN SkinnedMesh (un solo draw call) con esqueleto y animación procedural.
import * as THREE from 'three';
import type { AttachSlot, CharacterAnimParams, CharacterLook, CharacterRig } from '../../core/contracts';
import { B, BONE_DEFS, HEIGHT } from './skeleton';
import { buildCharacterGeometry } from './model';
import { Animator, CH } from './animator';
import type { CharacterLookExtra } from './looks';

let sharedMaterial: THREE.MeshLambertMaterial | null = null;
/** Material compartido por TODOS los personajes (colores por vértice, sombreado plano). */
export function characterMaterial(): THREE.MeshLambertMaterial {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    sharedMaterial.name = 'personajes';
  }
  return sharedMaterial;
}

// huesos que rotan con los canales de la pose (el resto se escala o se mueve aparte)
const ROT_BONES = [
  B.hips, B.spine, B.neck, B.head, B.armL, B.foreL, B.handL, B.armR, B.foreR, B.handR, B.phone,
  B.thighL, B.shinL, B.footL, B.thighR, B.shinR, B.footR,
];
const EPS = 0.0001;
const SOCKET_DEFAULT = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0);

let seedCounter = 7;

export class Character implements CharacterRig {
  readonly root = new THREE.Group();
  /** Escala según la altura del look. */
  readonly body = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: THREE.Bone[] = [];
  readonly sockets: Record<AttachSlot, THREE.Object3D>;
  readonly anim: Animator;
  look: CharacterLook;
  heightMeters = HEIGHT;
  /** Triángulos de la geometría actual. */
  triangles = 0;
  private skeleton: THREE.Skeleton;

  constructor(look: CharacterLook) {
    this.root.name = 'personaje';
    for (const [name, parent, x, y, z] of BONE_DEFS) {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x, y, z);
      this.bones.push(b);
      if (parent >= 0) this.bones[parent].add(b);
    }
    const built = buildCharacterGeometry(look as CharacterLookExtra);
    this.triangles = built.triangles;
    this.mesh = new THREE.SkinnedMesh(built.geometry, characterMaterial());
    this.mesh.name = 'personaje-malla';
    this.mesh.add(this.bones[B.hips]);
    this.mesh.add(this.bones[B.ground]);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.mesh.bind(this.skeleton); // en reposo y en el origen
    // esfera generosa fija (cubre tumbado, brazos arriba...) para el recorte por cámara
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.65);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.body.add(this.mesh);
    this.root.add(this.body);

    const sock = (bone: number, x: number, y: number, z: number, name: string) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.set(x, y, z);
      this.bones[bone].add(o);
      return o;
    };
    this.sockets = {
      handR: sock(B.handR, 0, -0.065, 0.005, 'enganche-manoD'),
      handL: sock(B.handL, 0, -0.065, 0.005, 'enganche-manoI'),
      head: sock(B.head, 0, built.headTop + 0.005, 0, 'enganche-cabeza'),
      back: sock(B.spine, 0, 0.2, -(built.chestZ + 0.01), 'enganche-espalda'),
      chest: sock(B.spine, 0, 0.2, built.chestZ + 0.01, 'enganche-pecho'),
    };
    this.sockets.handR.quaternion.copy(SOCKET_DEFAULT);
    this.sockets.handL.quaternion.copy(SOCKET_DEFAULT);

    const lx = look as CharacterLookExtra;
    const seed = lx.seed ?? (seedCounter = (seedCounter * 16807 + 11) % 2147483647);
    this.anim = new Animator(seed >>> 0, lx.kind, look.emblem);
    this.look = look;
    this.applyScale();
    this.apply();
  }

  private applyScale() {
    const h = this.look.height ?? 1;
    this.body.scale.setScalar(h);
    this.heightMeters = HEIGHT * h;
    this.anim.setScale(h);
  }

  setLook(look: CharacterLook) {
    const built = buildCharacterGeometry(look as CharacterLookExtra);
    const old = this.mesh.geometry;
    this.mesh.geometry = built.geometry;
    old.dispose();
    this.triangles = built.triangles;
    this.sockets.back.position.z = -(built.chestZ + 0.01);
    this.sockets.chest.position.z = built.chestZ + 0.01;
    this.sockets.head.position.y = built.headTop + 0.005;
    this.look = look;
    this.anim.configure((look as CharacterLookExtra).kind, look.emblem);
    this.applyScale();
  }

  update(dt: number, p: CharacterAnimParams) {
    this.anim.update(dt, p);
    this.apply();
  }

  /** Copia la pose calculada a los huesos. */
  private apply() {
    const c = this.anim.cur;
    const bones = this.bones;
    for (let k = 0; k < ROT_BONES.length; k++) {
      const i = ROT_BONES[k];
      bones[i].rotation.set(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]);
    }
    bones[B.hips].position.set(c[CH.hx], c[CH.hy], c[CH.hz]);
    // cara
    const dead = Math.min(1, Math.max(0, c[CH.dead]));
    const alive = 1 - dead;
    const eye = Math.max(0.05, c[CH.eye]);
    bones[B.eyes].scale.set(
      Math.max(EPS, alive * (1 + (eye - 1) * 0.4)),
      Math.max(EPS, alive * eye * this.anim.blink),
      Math.max(EPS, alive),
    );
    bones[B.eyesX].scale.setScalar(Math.max(EPS, dead));
    bones[B.mouth].scale.set(Math.max(0.3, c[CH.mouthW]), Math.max(0.15, 1 + c[CH.mouth] * 1.6), 1);
    const angry = c[CH.angry];
    const by = 0.19 + c[CH.brow] * 0.022 - Math.max(0, angry) * 0.008;
    bones[B.browL].rotation.z = angry * 0.38;
    bones[B.browR].rotation.z = -angry * 0.38;
    bones[B.browL].position.y = by;
    bones[B.browR].position.y = by;
    // accesorios de pose
    const stars = bones[B.stars];
    stars.scale.setScalar(Math.max(EPS, c[CH.stars]));
    stars.rotation.y = this.anim.t * 3.5;
    bones[B.phone].scale.setScalar(Math.max(EPS, c[CH.phone]));
    bones[B.ground].scale.setScalar(Math.max(EPS, c[CH.tape]));

    // el arma de la mano derecha apunta hacia delante (con la inclinación del apuntado)
    const sR = this.sockets.handR;
    const aw = this.anim.aimW;
    if (aw > 0) {
      _q.copy(bones[B.hips].quaternion)
        .multiply(bones[B.spine].quaternion)
        .multiply(bones[B.armR].quaternion)
        .multiply(bones[B.foreR].quaternion)
        .multiply(bones[B.handR].quaternion);
      _qa.setFromAxisAngle(_X, -this.anim.aimPitch);
      _qb.copy(_q).invert().multiply(_qa);
      sR.quaternion.copy(SOCKET_DEFAULT).slerp(_qb, aw);
    } else sR.quaternion.copy(SOCKET_DEFAULT);
  }

  attach(slot: AttachSlot, obj: THREE.Object3D) {
    this.sockets[slot].add(obj);
  }

  detach(obj: THREE.Object3D) {
    const p = obj.parent;
    if (p && (Object.values(this.sockets) as THREE.Object3D[]).includes(p)) p.remove(obj);
  }

  handWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.sockets.handR.getWorldPosition(target);
  }

  dispose() {
    this.root.removeFromParent();
    this.mesh.geometry.dispose();
    this.skeleton.dispose();
  }
}
