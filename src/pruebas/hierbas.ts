// Banco de pruebas del efecto de las hierbas.
// ?nivel=0..1 fuerza la intensidad · ?auto=1 (o ?auto=segundos) empieza solo · ?frase=N saca una frase
// ?forzar=1 con nivel=0 pasa por el pase sin efecto.
// Desde la consola: __bench() (coste del pase en ms), __gpu() (tiempo de GPU por frame),
// __compare() (render normal contra el pase al nivel 0: deben salir casi iguales).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../core/game';
import { installDebug } from '../core/debug';
import { buildPlaceholderWorld } from '../world/placeholder';
import { Player } from '../actors/player';
import { AudioEngine } from '../audio/audio';
import { installHigh, type HighEffect } from '../fx/high';
import { FRASES } from '../fx/high/thoughts';

const CSS = `
.hp-panel{position:fixed;left:14px;top:14px;z-index:40;background:#fff7e6;border:4px solid #1b1030;border-radius:18px;
  box-shadow:6px 6px 0 #1b1030;padding:12px 14px;color:#1b1030;font:800 13px system-ui;width:250px;pointer-events:auto}
.hp-panel h2{margin:0 0 8px;font:900 18px system-ui;color:#6c3bd1}
.hp-panel button{border:3px solid #1b1030;border-radius:12px;font:900 13px system-ui;padding:6px 10px;margin:3px 3px 3px 0;cursor:pointer;box-shadow:2px 3px 0 #1b1030;color:#1b1030}
.hp-panel .si{background:#ffd23f}.hp-panel .mas{background:#2ec4b6}.hp-panel .no{background:#ff4f81;color:#fff}
.hp-panel pre{margin:8px 0 0;font:700 12px/1.45 ui-monospace,monospace;white-space:pre}
.hp-barra{height:12px;border-radius:8px;background:#1b1030;overflow:hidden;margin-top:6px}
.hp-barra i{display:block;height:100%;width:0;background:linear-gradient(90deg,#2ec4b6,#ffd23f,#ff4f81,#6c3bd1)}
`;

function box(game: Game, color: string, w: number, h: number, d: number, x: number, z: number, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, h / 2, z);
  m.rotation.y = rotY;
  m.castShadow = m.receiveShadow = true;
  game.scene.add(m);
  game.physics.addStaticBox(x, h / 2, z, w / 2, h / 2, d / 2, rotY);
  return m;
}

/** Una caja de cartón con su precinto. */
function paquete(game: Game, s: number, x: number, z: number, rotY: number, y = 0) {
  const g = new THREE.Group();
  const carton = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.75, s * 0.9), new THREE.MeshLambertMaterial({ color: '#c8965a' }));
  const cinta = new THREE.Mesh(new THREE.BoxGeometry(s * 0.2, s * 0.76, s * 0.91), new THREE.MeshLambertMaterial({ color: '#e8d9a8' }));
  carton.castShadow = cinta.castShadow = true;
  g.add(carton, cinta);
  g.position.set(x, y + s * 0.375, z);
  g.rotation.y = rotY;
  game.scene.add(g);
}

/** La farola que te juzga. */
function farola(game: Game, x: number, z: number) {
  const mat = new THREE.MeshLambertMaterial({ color: '#2b2b44' });
  const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 8), mat);
  poste.position.set(x, 2.6, z);
  const brazo = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), mat);
  brazo.position.set(x + 0.55, 5.1, z);
  const luz = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff3b0' }));
  luz.position.set(x + 1.1, 4.9, z);
  poste.castShadow = true;
  game.scene.add(poste, brazo, luz);
}

async function main() {
  await RAPIER.init();
  const params = new URLSearchParams(location.search);
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  game.world = buildPlaceholderWorld(game);
  installDebug(game);
  game.scene.background = new THREE.Color('#9fd3ff');
  game.scene.add(new THREE.HemisphereLight('#fff2d0', '#5a3a7a', 1.3));
  const sun = new THREE.DirectionalLight('#ffffff', 1.8);
  sun.position.set(30, 50, 20);
  sun.castShadow = game.quality.shadows;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -30;
  sc.right = sc.top = 30;
  game.scene.add(sun);

  // cajas de colores delante de la cámara (mirando hacia +X, donde el mundo provisional está despejado)
  const colores = ['#ffd23f', '#ff4f81', '#2ec4b6', '#6c3bd1', '#ff7b54', '#06d6a0'];
  colores.forEach((c, i) => box(game, c, 2.4, 2 + (i % 3) * 1.4, 2.4, 15 + (i % 2) * 2.5, 1 + i * 2.6, i * 0.3));
  box(game, '#fff7e6', 1, 7, 12, 21, 7);
  paquete(game, 1, 7.5, 5.2, 0.4);
  paquete(game, 0.8, 8.3, 4.2, -0.3);
  paquete(game, 0.6, 7.8, 4.8, 0.9, 0.75);
  farola(game, 8, 10.5);

  const audio = new AudioEngine(game);
  game.addSystem(audio);
  const player = new Player(game);
  game.addSystem(player);
  player.teleport(new THREE.Vector3(6, 0.2, 7.5), -Math.PI / 2);
  // radio de mentira para comprobar que se le avisa
  const radioLog: number[] = [];
  game.mod.radio = { setDistortion: (v: number) => radioLog.push(+v.toFixed(3)) };

  const high = installHigh(game) as HighEffect;

  // cámara fija (sin CameraRig)
  game.camera.position.set(-4, 4, 8.5);
  game.camera.lookAt(10, 1.6, 7);

  // panel
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const panel = document.createElement('div');
  panel.className = 'hp-panel';
  panel.innerHTML = `<h2>🌀 Hierbas del Barrio Viejo</h2>
    <button class="si">🌿 Fumar (60 s)</button><button class="mas">+20 s</button><button class="no">Parar</button>
    <div class="hp-barra"><i></i></div><pre></pre>`;
  game.ui.appendChild(panel);
  const [bSi, bMas, bNo] = panel.querySelectorAll('button');
  bSi.onclick = () => high.start(60);
  bMas.onclick = () => high.start(20);
  bNo.onclick = () => high.stop();
  const bar = panel.querySelector('.hp-barra i') as HTMLElement;
  const info = panel.querySelector('pre')!;
  game.addSystem({
    name: 'panel-hierbas',
    postUpdate: () => {
      if (game.time.frame % 6) return;
      bar.style.width = `${(high.level * 100).toFixed(0)}%`;
      info.textContent =
        `nivel   ${high.level.toFixed(2)}  ${high.active ? '(activo)' : '(apagado)'}\n` +
        `quedan  ${high.remaining.toFixed(1)} s\n` +
        `tiempo  ×${game.time.scale.toFixed(2)}\n` +
        `wobble  ${player.wobble.toFixed(2)}\n` +
        `fps     ${game.fps.toFixed(0)}`;
    },
  });

  const nivel = params.get('nivel');
  if (nivel !== null) {
    const v = Number(nivel);
    if (v > 0 || params.has('forzar')) high.forceLevel(v);
  }
  if (params.has('auto')) high.start(Number(params.get('auto')) > 1 ? Number(params.get('auto')) : 60);
  if (params.has('frase')) high.thoughts.spawn(FRASES[Number(params.get('frase')) % FRASES.length] ?? FRASES[0]);

  game.start();

  // datos para las pruebas automáticas
  (window as any).__high = high;
  (window as any).__radioLog = radioLog;
  (window as any).__bench = async () => {
    const gl = game.renderer.getContext();
    const px = new Uint8Array(4);
    const run = (n: number) => {
      const t0 = performance.now();
      // muchos frames seguidos y una sola espera al final: mide lo que tarda la GPU por frame
      for (let i = 0; i < n; i++) game.render();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return (performance.now() - t0) / n;
    };
    game.stop();
    const size = game.renderer.getDrawingBufferSize(new THREE.Vector2());
    high.forceLevel(null);
    high.stop();
    run(30);
    const sin = Math.min(run(200), run(200));
    high.forceLevel(1);
    run(30);
    const con = Math.min(run(200), run(200));
    high.forceLevel(null);
    const res = { sinEfectoMs: +sin.toFixed(3), conEfectoMs: +con.toFixed(3), costeMs: +(con - sin).toFixed(3), w: size.x, h: size.y };
    game.start();
    return res;
  };
  // Tiempo de GPU por frame (consultas de tiempo de WebGL2), en frames de verdad con el bucle en marcha
  const gpuTime = (frames: number) =>
    new Promise<number | null>((resolve) => {
      const gl = game.renderer.getContext() as WebGL2RenderingContext;
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext) return resolve(null);
      const inner = game.render;
      const queue: WebGLQuery[] = [];
      const out: number[] = [];
      game.render = () => {
        const q = gl.createQuery()!;
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        inner.call(game);
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        queue.push(q);
        while (queue.length && gl.getQueryParameter(queue[0], gl.QUERY_RESULT_AVAILABLE)) {
          const done = queue.shift()!;
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) out.push(gl.getQueryParameter(done, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(done);
        }
        if (out.length >= frames) {
          game.render = inner;
          out.sort((a, b) => a - b);
          resolve(+out[Math.floor(out.length / 2)].toFixed(3));
        }
      };
    });
  (window as any).__gpu = async () => {
    high.forceLevel(null);
    high.stop();
    const sin = await gpuTime(120);
    high.forceLevel(1);
    const con = await gpuTime(120);
    high.forceLevel(null);
    const size = game.renderer.getDrawingBufferSize(new THREE.Vector2());
    return { gpuSinMs: sin, gpuConMs: con, costeMs: sin !== null && con !== null ? +(con - sin).toFixed(3) : null, w: size.x, h: size.y };
  };
  // Compara el render normal con el pase al nivel 0: deberían salir casi idénticos
  (window as any).__compare = () => {
    const gl = game.renderer.getContext();
    const size = game.renderer.getDrawingBufferSize(new THREE.Vector2());
    const n = size.x * size.y * 4;
    const a = new Uint8Array(n), b = new Uint8Array(n);
    game.stop();
    high.stop();
    game.render();
    gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, a);
    high.forceLevel(0);
    game.render();
    gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, b);
    high.forceLevel(null);
    let max = 0, sum = 0, big = 0;
    for (let i = 0; i < n; i += 4) {
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(a[i + k] - b[i + k]);
        sum += d;
        if (d > max) max = d;
        if (d > 8) big++;
      }
    }
    game.start();
    return { max, media: +(sum / (n * 0.75)).toFixed(3), pixelesMuyDistintos: big };
  };
  (window as any).__ready = true;
}
main();
