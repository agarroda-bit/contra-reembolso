// El mar: plano grande con olas, color por profundidad, boyas que se mecen y muros invisibles.
import * as THREE from 'three';
import type { Game } from '../../core/game';
import { G } from '../../core/physics';
import { HALF } from './shape';
import { makeWaterMaterial, WorldUniforms } from './materials';
import { GeoBuilder } from './geo';

export interface Sea {
  mesh: THREE.Mesh;
  update(elapsed: number): void;
}

export function buildSea(game: Game, u: WorldUniforms, heightAt: (x: number, z: number) => number, solidMat: THREE.Material): Sea {
  // textura de profundidad (256x256 sobre la rejilla del terreno)
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -HALF + ((i + 0.5) / N) * HALF * 2, z = -HALF + ((j + 0.5) / N) * HALF * 2;
      const d = Math.max(0, Math.min(12, -heightAt(x, z)));
      const v = Math.round((d / 12) * 255);
      const k = (j * N + i) * 4;
      data[k] = v;
      data[k + 1] = v;
      data[k + 2] = v;
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  // rejilla: densa (8 m) cerca de la isla y cada vez más gruesa hasta el horizonte
  const geo = seaGrid();
  const mat = makeWaterMaterial(u, tex, HALF);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'mar';
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  game.scene.add(mesh);

  // suelo de seguridad bajo todo y muros invisibles mar adentro
  game.physics.addStaticBox(0, -14, 0, 700, 1, 700, 0, G.GROUND);
  const W = 336, T = 2, Hh = 40;
  game.physics.addStaticBox(W, 10, 0, T, Hh, W + T, 0, G.STATIC);
  game.physics.addStaticBox(-W, 10, 0, T, Hh, W + T, 0, G.STATIC);
  game.physics.addStaticBox(0, 10, W, W + T, Hh, T, 0, G.STATIC);
  game.physics.addStaticBox(0, 10, -W, W + T, Hh, T, 0, G.STATIC);

  // boyas en un cuadrado redondeado un poco antes de los muros
  const buoyGeo = new GeoBuilder();
  buoyGeo.cyl(0, -0.6, 0, 0.55, 0.55, 1.1, 6, '#e8412c', true, false);
  buoyGeo.cyl(0, 0.5, 0, 0.5, 0.12, 0.9, 6, '#f4f1ea', false, false);
  buoyGeo.cyl(0, 1.4, 0, 0.12, 0.12, 0.6, 4, '#333333', false, false);
  buoyGeo.box(0, 2.05, 0, 0.3, 0.3, 0.3, '#ffd23f', 0, [1, 0.8, 0.2, 0.15]);
  const bg = buoyGeo.toGeometry();
  const buoyPos: THREE.Vector3[] = [];
  const Rb = 326;
  const per = 8 * Rb;
  const count = Math.round(per / 26);
  for (let i = 0; i < count; i++) {
    const s = (i / count) * per;
    const side = Math.floor(s / (2 * Rb)), t = (s % (2 * Rb)) - Rb;
    let x = 0, z = 0;
    if (side === 0) (x = t), (z = -Rb);
    else if (side === 1) (x = Rb), (z = t);
    else if (side === 2) (x = -t), (z = Rb);
    else (x = -Rb), (z = -t);
    buoyPos.push(new THREE.Vector3(x, 0, z));
  }
  const buoys = new THREE.InstancedMesh(bg, solidMat, buoyPos.length);
  buoys.name = 'boyas';
  buoys.castShadow = false;
  buoys.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const place = (t: number) => {
    for (let i = 0; i < buoyPos.length; i++) {
      const b = buoyPos[i];
      const ph = i * 1.7;
      p.set(b.x, Math.sin(t * 1.3 + ph) * 0.2 - 0.05, b.z);
      e.set(Math.sin(t * 1.1 + ph) * 0.12, 0, Math.cos(t * 0.9 + ph) * 0.12);
      q.setFromEuler(e);
      buoys.setMatrixAt(i, m.compose(p, q, one));
    }
    buoys.instanceMatrix.needsUpdate = true;
  };
  place(0);
  game.scene.add(buoys);

  let acc = 0;
  return {
    mesh,
    update(elapsed: number) {
      acc++;
      if (acc % 2 === 0) place(elapsed);
    },
  };
}

function seaGrid(): THREE.BufferGeometry {
  const outer = [-5000, -3000, -1800, -1200, -800, -560];
  const coords: number[] = [...outer];
  for (let v = -400; v <= 400; v += 12.5) coords.push(v);
  for (let i = outer.length - 1; i >= 0; i--) coords.push(-outer[i]);
  const n = coords.length;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 3;
      pos[k] = coords[i];
      pos[k + 1] = 0;
      pos[k + 2] = coords[j];
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const nor = new Float32Array(n * n * 3);
  for (let i = 0; i < n * n; i++) nor[i * 3 + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
