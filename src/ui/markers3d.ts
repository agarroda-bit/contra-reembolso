// Marcadores en el mundo: columnas de luz de colores en los destinos (recoger, entregar, misiones, botín)
// y una flecha que flota encima. Se leen de game.hud.markers y game.hud.waypoint.
import * as THREE from 'three';
import type { Game, System } from '../core/game';

const MAX = 10;

function makeColumnMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color('#ffd23f') }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
      void main(){ float a = (1.0 - vUv.y) * (0.55 + 0.15 * sin(uTime * 3.0 + vUv.y * 12.0));
        a *= smoothstep(0.0, 0.08, vUv.y); gl_FragColor = vec4(uColor * 1.4, a * 0.7); }`,
  });
}

interface Slot {
  group: THREE.Group;
  column: THREE.Mesh;
  arrow: THREE.Mesh;
  ring: THREE.Mesh;
  mat: THREE.ShaderMaterial;
}

export class Markers3D implements System {
  name = 'markers3d';
  private slots: Slot[] = [];

  constructor(private game: Game) {
    game.mod.markers3d = this;
    const colGeo = new THREE.CylinderGeometry(1.1, 1.1, 14, 20, 1, true);
    colGeo.translate(0, 7, 0);
    const arrowGeo = new THREE.ConeGeometry(0.55, 1.1, 4);
    arrowGeo.rotateX(Math.PI);
    const ringGeo = new THREE.RingGeometry(1.0, 1.25, 28);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX; i++) {
      const mat = makeColumnMaterial();
      const g = new THREE.Group();
      const column = new THREE.Mesh(colGeo, mat);
      column.renderOrder = 5;
      const arrowMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', toneMapped: false });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
      ring.position.y = 0.06;
      g.add(column, arrow, ring);
      g.visible = false;
      game.scene.add(g);
      this.slots.push({ group: g, column, arrow, ring, mat });
    }
  }

  update() {
    const g = this.game;
    const hud = g.hud;
    const cam = g.camera.position;
    const t = g.time.elapsed;
    const list: { x: number; z: number; color?: string }[] = [];
    if (hud.waypoint) list.push(hud.waypoint);
    for (const m of hud.markers) {
      if (list.length >= MAX) break;
      if ((m as any).threat) continue;
      if (hud.waypoint && Math.abs(m.x - hud.waypoint.x) < 1 && Math.abs(m.z - hud.waypoint.z) < 1) continue;
      list.push(m);
    }
    for (let i = 0; i < MAX; i++) {
      const s = this.slots[i];
      const m = list[i];
      if (!m || !g.world) {
        s.group.visible = false;
        continue;
      }
      const y = g.world.heightAt(m.x, m.z);
      const d = Math.hypot(m.x - cam.x, m.z - cam.z);
      s.group.visible = d < 260;
      if (!s.group.visible) continue;
      s.group.position.set(m.x, y, m.z);
      const c = m.color ?? '#ffd23f';
      s.mat.uniforms.uColor.value.set(c);
      s.mat.uniforms.uTime.value = t;
      (s.arrow.material as THREE.MeshBasicMaterial).color.set(c);
      (s.ring.material as THREE.MeshBasicMaterial).color.set(c);
      s.arrow.position.y = 3 + Math.sin(t * 3 + i) * 0.35;
      s.arrow.rotation.y = t * 2;
      // de cerca, la columna se encoge para no molestar (y desaparece si estás encima)
      const pp = g.mod.player?.position;
      const dp = pp ? Math.hypot(m.x - pp.x, m.z - pp.z) : 99;
      const k = THREE.MathUtils.clamp((dp - 3) / 25, 0, 1);
      s.column.visible = k > 0.02;
      s.column.scale.set(1, Math.max(0.05, k), 1);
      s.arrow.visible = dp > 1.5;
      s.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    }
  }
}
