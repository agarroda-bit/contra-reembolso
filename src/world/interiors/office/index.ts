// LA OFICINA de reparto (El Puerto): mostrador con Toñi (la de la oficina), estanterías con paquetes,
// el TABLÓN DE ENCARGOS (abre la gestión de la empresa), la mesa del jefe y el cartel.
// Cambia con el nivel de la empresa (0: cuartucho con goteras … 3: Imperio del Cartón) y enseña los
// lujos comprados: máquina de café, sillón de jefe, acuario, cuadro tuyo gigante y mesa de billar.
import * as THREE from 'three';
import type { Game } from '../../../core/game';
import { GeoBuilder, vertexColorMaterial } from '../../../core/geo';
import { G } from '../../../core/physics';
import { Rng, fx as rnd } from '../../../core/rng';
import type { Interiors, InteriorContext, InteriorDef, InteriorInstance } from '../index';
import { makeCharacter, randomLook } from '../../../actors/character';
import type { Character } from '../../../actors/character';
import {
  canvasTexture, texPlane, glowMaterial, haloTexture, meshOf, toast, pick, say, Seats, Popper, nearestSpot, FishTank,
  playerLook, lookKey, outlinedText, marbleTexture, neonTexture, addGoldFrame, type Spot,
} from '../attic/kit';
import { portraitTexture, modelGeometry } from '../attic/luxuries';

// Medidas (metros, locales: x este, z sur, suelo en y = 0)
const W = 20, D = 14, H = 4.0;
const V = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);

const P = {
  exit: V(10, 13.2),
  spawn: V(10, 10.9),
  board: V(10, 0.05, 1.75),
  employee: V(15.3, 8.35),
  counterFront: V(15.3, 10.2),
  desk: V(16.2, 3.4),
  chair: V(16.2, 2.35),
  aquarium: V(19.25, 6.3),
  coffee: V(19.35, 12.0),
  portrait: V(4.3, 13.93, 2.1),
  pool: V(7.2, 9.6),
  buckets: [V(5.6, 5.4), V(13.4, 6.2)],
};

const TONI_LINES: string[][] = [
  [
    'Jefe, la gotera ya tiene nombre: se llama Paca.',
    'Aquí, currando. ¿No se nota?',
    'Ha llamado un cliente. Bueno, ha llamado a la puerta. Y se ha ido.',
    'Si ampliamos la oficina, ¿me pones una silla? Una. Con patas.',
  ],
  [
    '¡Qué bien huele a pintura! O a pegamento. No sé.',
    'Tenemos planta. Se llama Reembolso. No la riegues, que se ahoga.',
    'Hoy solo se han perdido dos paquetes. Récord.',
  ],
  [
    'Jefe, la cinta transportadora va más rápido que yo. Eso no puede ser.',
    'Hoy hemos enviado 300 paquetes. Y tres han llegado.',
    'El cartel luminoso se ve desde el Polígono. Los Devueltos están que trinan.',
  ],
  [
    '¡Jefe! Nos han nominado a Empresa del Año. Bueno, nos he nominado yo.',
    'He ordenado tus trofeos por brillo. Y las furgonetas por colores.',
    'Imperio del Cartón. Suena a telenovela. Me encanta.',
  ],
];
const TONI_ANY = [
  '¿Encargos? En el tablón. ¿Café? En la máquina. ¿Sueldo? Ja.',
  'Mira, el móvil me tiene muy ocupada. Pero dime.',
  'Si vienen Los Devueltos, yo no he visto nada.',
  'Ha venido una abuela a pagar en céntimos. Sigue contando. Está en el baño.',
];
const STAFF_LINES = [
  'Jefe, hoy he entregado 14 paquetes. Bueno, 13 y medio.',
  '¿Subida de sueldo? Era broma. ¿O no?',
  'Los Devueltos me miraron raro. Yo les miré más raro.',
  'La furgoneta hace un ruido nuevo. Suena a dinero.',
  'Estoy en mi descanso. Llevo en él desde el martes.',
  'Un cliente me ha pagado con un vale de descuento. De otra tienda.',
];
const COFFEE = [
  'Sabe a cartón mojado. Perfecto.',
  'Café tan fuerte que el paquete se entrega solo.',
  'Te tiemblan hasta las pestañas.',
  'Descafeinado no queda. Nunca quedó.',
  'La máquina hace un ruido raro. Tú también.',
];
const POOL_END = [
  'Una dentro y otra en el café de Toñi. Casi perfecto.',
  'Tiro de campeón. Bueno, de subcampeón. De participante.',
  'Toñi dice que ha sido suerte. Toñi tiene envidia.',
];
const FISH = [
  'Das de comer a los peces. Uno se llama Reembolso. El otro, Devolución.',
  'El pez paquete te mira raro. Quizá sabe algo.',
  'Los peces nadan en círculos. Como tus repartidores.',
];
const PORTRAIT = [
  'Qué mirada. Qué mentón. Qué gorra. Obra maestra.',
  'Toñi le ha puesto bigote con rotulador. Se quita. Creo.',
  'El pintor cobró por metro cuadrado. Se nota.',
];

/** Estado de la empresa que pinta la oficina (company.ts). */
function companyState(game: Game): { level: number; lux: Set<string> } {
  const c = game.mod.company;
  const level = Math.max(0, Math.min(3, Number(c?.level ?? 0) | 0));
  const lux = (c?.luxuries as Set<string> | undefined) ?? new Set<string>();
  return { level, lux };
}

// ─────────────────────────────── texturas ───────────────────────────────

function linoTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g, w, h) => {
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? '#9aa38d' : '#b7b79c';
      g.fillRect(i * s, j * s, s, s);
    }
    // manchas y baldosas levantadas
    for (let k = 0; k < 30; k++) {
      g.fillStyle = `rgba(60,50,30,${0.05 + Math.random() * 0.12})`;
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 6 + Math.random() * 22, 4 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(40,30,20,0.35)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.moveTo(Math.random() * w, Math.random() * h);
      g.lineTo(Math.random() * w, Math.random() * h);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Mancha de humedad irregular (transparente) para las paredes del cuartucho. */
function stainTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 60;
      const x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r * 0.8;
      const rr = 30 + Math.random() * 50;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(110,90,50,0.35)');
      gr.addColorStop(0.7, 'rgba(110,90,50,0.18)');
      gr.addColorStop(1, 'rgba(110,90,50,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
    }
    // cerco más oscuro
    g.strokeStyle = 'rgba(90,70,35,0.35)';
    g.lineWidth = 3;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) {
      const r = 80 + Math.sin(a * 5) * 14 + Math.sin(a * 3 + 1) * 10;
      const x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r * 0.8;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  });
}

function posterTexture(title: string, lines: string[], bg: string, fg: string, w = 256, h = 340): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 34px system-ui, sans-serif';
    g.fillText(title, w / 2, 48);
    g.font = '700 21px system-ui, sans-serif';
    lines.forEach((l, i) => g.fillText(l, w / 2, 110 + i * 32));
  });
}

function woodTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g, w, h) => {
    const rows = 8, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 64;
      for (let x = -off; x < w; x += 128) {
        const c = ['#c89a64', '#b98a55', '#d4a672', '#bf8f5b'][(r + Math.floor(x / 128) + 4) % 4];
        g.fillStyle = c;
        g.fillRect(x, r * rh, 128, rh);
        g.fillStyle = 'rgba(80,50,20,0.25)';
        g.fillRect(x, r * rh, 2, rh);
        for (let k = 0; k < 3; k++) {
          g.fillStyle = 'rgba(90,60,30,0.12)';
          g.fillRect(x + 8, r * rh + 5 + k * 9, 110, 2);
        }
      }
      g.fillStyle = 'rgba(60,35,15,0.35)';
      g.fillRect(0, r * rh, w, 1.5);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function boardTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 460, (g, w, h) => {
    // corcho
    g.fillStyle = '#c99a5e';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 60},${55 + Math.random() * 40},${20 + Math.random() * 20},0.35)`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    // cabecera
    g.fillStyle = '#1b1030';
    g.fillRect(0, 0, w, 80);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 60px system-ui, sans-serif';
    outlinedText(g, 'TABLÓN DE ENCARGOS', w / 2, 42, '#ffd23f', '#1b1030', 2);
    const notes: [string, string, string][] = [
      ['#fff27a', 'SE BUSCA', 'repartidor que no\nrompa vajillas'],
      ['#ff9ec7', 'URGENTE', 'El reloj de la\nseñora Puri'],
      ['#9ef0ff', 'MUDANZA EXPRÉS', 'Sofá, piano y\nun loro. 3 min.'],
      ['#b6ff9e', 'OJO', 'Paquete que hace\ntic-tac. No agitar.'],
      ['#ffd0a0', 'SE BUSCA', 'EL DEVOLUCIÓN\nRecompensa: mucha'],
      ['#ffffff', 'AVISO', 'Los Devueltos NO\nson clientes'],
    ];
    notes.forEach(([bg, title, body], i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 70 + col * 320 + (i % 2) * 20, y = 96 + row * 180;
      g.save();
      g.translate(x + 120, y + 78);
      g.rotate(((i * 37) % 11 - 5) * 0.012);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-114, -70, 240, 152);
      g.fillStyle = bg;
      g.fillRect(-120, -76, 240, 152);
      g.fillStyle = '#e63946';
      g.beginPath();
      g.arc(0, -64, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1b1030';
      g.font = '900 30px system-ui, sans-serif';
      g.fillText(title, 0, -28, 222);
      g.font = "700 25px 'Comic Sans MS', 'Chalkboard SE', system-ui, sans-serif";
      body.split('\n').forEach((l, k) => g.fillText(l, 0, 12 + k * 32, 222));
      g.restore();
    });
  });
}

function signTexture(level: number): THREE.CanvasTexture {
  return canvasTexture(1024, 200, (g, w, h) => {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (level === 0) {
      // cartón escrito a rotulador
      g.fillStyle = '#c8915a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 8; i++) g.fillRect(0, i * 26, w, 3);
      g.fillStyle = '#1b1030';
      g.font = "900 96px 'Comic Sans MS', 'Chalkboard SE', system-ui, sans-serif";
      g.save();
      g.translate(w / 2, h / 2 + 6);
      g.rotate(-0.03);
      g.fillText('CONTRA REMBOLSO', 0, 0, w - 80);
      g.restore();
      g.strokeStyle = '#e63946';
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(520, 40);
      g.lineTo(560, 22);
      g.stroke();
      g.fillStyle = '#e63946';
      g.font = "900 48px 'Comic Sans MS', system-ui";
      g.fillText('E', 548, 24);
    } else {
      // lona impresa
      g.fillStyle = '#ffd23f';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1b1030';
      g.fillRect(0, h - 26, w, 26);
      g.font = '900 104px system-ui, sans-serif';
      g.fillText('CONTRA REEMBOLSO', w / 2, h / 2 - 8, w - 70);
      g.fillStyle = '#ffd23f';
      g.font = '800 20px system-ui';
      g.fillText('PAQUETERÍA · PAGAS CUANDO LLEGA (SI LLEGA)', w / 2, h - 13);
    }
  });
}

// ─────────────────────────────── construcción ───────────────────────────────

interface OfficeScene extends InteriorInstance {
  refresh(pop: boolean): void;
}

function buildOffice(ctx: InteriorContext): OfficeScene {
  const game = ctx.game;
  const root = ctx.root;
  const O = ctx.origin;
  const phys = game.physics;
  const toWorld = (l: THREE.Vector3) => l.clone().add(O);
  const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY = 0) =>
    phys.addStaticBox(O.x + cx, O.y + cy, O.z + cz, hx, hy, hz, rotY, G.STATIC);
  const lam = vertexColorMaterial;
  const glowVC = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

  // grupos que cambian con el nivel
  const lv = {
    only0: new THREE.Group(),
    from1: new THREE.Group(),
    only12: new THREE.Group(),
    from2: new THREE.Group(),
    from3: new THREE.Group(),
    only1: new THREE.Group(),
  };
  for (const g of Object.values(lv)) root.add(g);
  const lvColliders: { min: number; max: number; c: { setEnabled(on: boolean): void } }[] = [];

  // ── colisores de la sala ──
  box(W / 2, -0.25, D / 2, W / 2 + 0.5, 0.25, D / 2 + 0.5);
  box(W / 2, H + 0.25, D / 2, W / 2 + 0.5, 0.25, D / 2 + 0.5);
  box(-0.15, H / 2, D / 2, 0.15, H / 2, D / 2 + 0.3);
  box(W + 0.15, H / 2, D / 2, 0.15, H / 2, D / 2 + 0.3);
  box(W / 2, H / 2, -0.15, W / 2 + 0.3, H / 2, 0.15);
  box(W / 2, H / 2, D + 0.15, W / 2 + 0.3, H / 2, 0.15);

  // ── suelos (uno por aspecto) ──
  const floorGeo = new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2);
  const lino = linoTexture();
  lino.repeat.set(W / 2.4, D / 2.4);
  const wood = woodTexture();
  wood.repeat.set(W / 3, D / 3);
  const marble = marbleTexture();
  marble.repeat.set(W / 3, D / 3);
  const mkFloor = (tex: THREE.Texture, parent: THREE.Group, shiny = false) => {
    const m = new THREE.Mesh(floorGeo, shiny ? new THREE.MeshPhongMaterial({ map: tex, shininess: 40, specular: '#3a3530' }) : new THREE.MeshLambertMaterial({ map: tex }));
    m.position.set(W / 2, 0, D / 2);
    m.receiveShadow = true;
    parent.add(m);
  };
  mkFloor(lino, lv.only0);
  mkFloor(wood, lv.only12);
  mkFloor(marble, lv.from3, true);

  // ── paredes: la pared sur tiene puerta de cristal y ventanas altas ──
  const walls = (color: string, stripe: string | null, base: string, dirty: boolean, crown: string): THREE.Object3D => {
    const b = new GeoBuilder();
    b.box(W + 0.6, H, 0.3, color, W / 2, H / 2, -0.15); // norte
    b.box(0.3, H, D, color, -0.15, H / 2, D / 2); // oeste
    b.box(0.3, H, D, color, W + 0.15, H / 2, D / 2); // este
    // sur, con huecos: puerta x 9..11 (hasta 2,6 m) y ventanas x 2,5..6,5 y 13,5..17,5 (2,4..3,4 m)
    const sz = D + 0.15;
    b.box(9, 2.4, 0.3, color, 4.5, 1.2, sz);
    b.box(9, 2.4, 0.3, color, 15.5, 1.2, sz);
    b.box(W + 0.6, 0.6, 0.3, color, W / 2, 3.7, sz);
    b.box(2.5, 1.0, 0.3, color, 1.25, 2.9, sz);
    b.box(2.5, 1.0, 0.3, color, 7.75, 2.9, sz);
    b.box(2.5, 1.0, 0.3, color, 12.25, 2.9, sz);
    b.box(2.5, 1.0, 0.3, color, 18.75, 2.9, sz);
    b.box(2, 1.0, 0.3, color, 10, 2.9, sz);
    b.box(2, 0.2, 0.3, color, 10, 2.5, sz);
    // rodapié y franja
    b.box(W, 0.12, 0.04, base, W / 2, 0.06, 0.02);
    b.box(0.04, 0.12, D, base, 0.02, 0.06, D / 2);
    b.box(0.04, 0.12, D, base, W - 0.02, 0.06, D / 2);
    if (stripe) {
      b.box(W, 0.22, 0.03, stripe, W / 2, 1.1, 0.02);
      b.box(0.03, 0.22, D, stripe, 0.02, 1.1, D / 2);
      b.box(0.03, 0.22, D, stripe, W - 0.02, 1.1, D / 2);
      b.box(9, 0.22, 0.03, stripe, 4.5, 1.1, D - 0.02);
      b.box(9, 0.22, 0.03, stripe, 15.5, 1.1, D - 0.02);
    }
    if (dirty) {
      // la mancha del techo sobre cada cubo
      b.box(1.1, 0.8, 0.02, '#e9e1cf', 12.6, 2.3, 0.04); // yeso levantado
      // (las manchas del techo sobre los cubos son calcas con la textura de humedad, más abajo)
    }
    const g = new THREE.Group();
    g.add(meshOf(b, lam, true, true));
    // moldura bajo el techo: sin recibir sombra, tapa el borde dentado de la sombra del techo
    const m = new GeoBuilder();
    m.box(W, 0.3, 0.07, crown, W / 2, H - 0.15, 0.035);
    m.box(W, 0.3, 0.07, crown, W / 2, H - 0.15, D - 0.035);
    m.box(0.07, 0.3, D, crown, 0.035, H - 0.15, D / 2);
    m.box(0.07, 0.3, D, crown, W - 0.035, H - 0.15, D / 2);
    g.add(meshOf(m, lam, false, false));
    return g;
  };
  lv.only0.add(walls('#d9cdb2', null, '#8a7a5a', true, '#c9bc9c'));
  lv.from1.add(walls('#fff3d6', '#ffd23f', '#1b1030', false, '#fffaf0'));
  // techos (con algo de luz propia para que no salgan marrones)
  const ceilGeo = new THREE.BoxGeometry(W + 0.6, 0.3, D + 0.6);
  const ceil0 = new THREE.MeshLambertMaterial({ color: '#d8d0bc', emissive: '#6e6552', emissiveIntensity: 1 });
  const ceil1 = new THREE.MeshLambertMaterial({ color: '#fbf7ee', emissive: '#8f8a80', emissiveIntensity: 1 });
  for (const [mat, grp] of [[ceil0, lv.only0], [ceil1, lv.from1]] as [THREE.Material, THREE.Group][]) {
    const c = new THREE.Mesh(ceilGeo, mat);
    c.position.set(W / 2, H + 0.15, D / 2);
    c.castShadow = true;
    grp.add(c);
  }

  // cristales de puerta y ventanas + la calle de fuera
  const glassMat = new THREE.MeshBasicMaterial({ color: '#d8f2ff', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
  for (const [x, y, w, h] of [[10, 1.25, 1.98, 2.5], [4.5, 2.9, 4, 1], [15.5, 2.9, 4, 1]] as [number, number, number, number][]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
    g.position.set(x, y, D + 0.02);
    g.renderOrder = 3;
    root.add(g);
  }
  const fr = new GeoBuilder();
  fr.box(0.1, 2.6, 0.2, '#2b2d42', 9, 1.3, D + 0.02);
  fr.box(0.1, 2.6, 0.2, '#2b2d42', 11, 1.3, D + 0.02);
  fr.box(0.08, 2.5, 0.12, '#2b2d42', 10, 1.25, D + 0.02);
  fr.box(0.3, 0.05, 0.05, '#c9ccd1', 9.7, 1.1, D - 0.06);
  fr.box(0.3, 0.05, 0.05, '#c9ccd1', 10.3, 1.1, D - 0.06);
  for (const x of [4.5, 15.5]) {
    fr.box(4.1, 0.08, 0.16, '#2b2d42', x, 2.4, D + 0.02);
    fr.box(4.1, 0.08, 0.16, '#2b2d42', x, 3.4, D + 0.02);
    fr.box(0.06, 1.0, 0.1, '#2b2d42', x, 2.9, D + 0.02);
  }
  // la calle: acera, calzada, fachadas de enfrente y una farola
  const st = new GeoBuilder();
  st.box(W + 30, 0.2, 4, '#c9c1b3', W / 2, -0.1, D + 2.3);
  st.box(W + 30, 0.2, 10, '#5b5870', W / 2, -0.25, D + 9.3);
  for (let k = 0; k < 8; k++) st.box(1.6, 0.02, 0.2, '#fff6d8', -2 + k * 4, -0.14, D + 9.3);
  const fac = ['#f4c7a1', '#c9d6df', '#fff1c1', '#ffd6e0', '#d8efe0'];
  for (let k = 0; k < 6; k++) {
    const x = -6 + k * 6.4;
    const hh = 9 + (k % 3) * 3;
    st.box(6.2, hh, 2, fac[k % fac.length], x, hh / 2 - 0.3, D + 15.5);
    for (let f = 0; f < 3; f++) for (let c = 0; c < 2; c++) st.box(1.2, 1.4, 0.1, '#34425e', x - 1.4 + c * 2.8, 2.2 + f * 3, D + 14.45);
  }
  st.box(0.14, 4.2, 0.14, '#2b2d42', 5, 2.0, D + 3.6);
  st.box(1.0, 0.14, 0.14, '#2b2d42', 5.4, 4.1, D + 3.6);
  root.add(meshOf(st, lam, false, true));
  const vanGeo = modelGeometry('van', '#ffd23f');
  if (vanGeo) {
    const van = new THREE.Mesh(vanGeo, lam);
    const bb = vanGeo.boundingBox!;
    van.position.set(14.5, -0.15 - bb.min.y, D + 6.2);
    van.rotation.y = Math.PI / 2;
    van.castShadow = true;
    root.add(van);
  }
  root.add(meshOf(fr, lam, false, true));

  // ── muebles fijos: mostrador y mesa ──
  const f = new GeoBuilder();
  // mostrador (con la empresa en amarillo)
  f.box(5.4, 1.1, 0.7, '#ffd23f', 15.3, 0.55, 9.4);
  f.box(5.6, 0.08, 0.9, '#1b1030', 15.3, 1.14, 9.35);
  f.box(5.42, 0.16, 0.02, '#1b1030', 15.3, 0.75, 9.76);
  f.box(0.7, 1.1, 1.5, '#ffd23f', 12.95, 0.55, 8.4);
  f.box(0.9, 0.08, 1.7, '#1b1030', 12.95, 1.14, 8.4);
  // cosas encima: timbre, datáfono de cartón, paquetes
  f.cyl(0.08, 0.1, 0.06, 10, '#c9ccd1', 14.1, 1.21, 9.45);
  f.sphere(0.04, '#c9ccd1', 14.1, 1.26, 9.45, 0);
  f.box(0.5, 0.36, 0.4, '#c8915a', 16.9, 1.36, 9.3);
  f.box(0.51, 0.06, 0.41, '#e3d3a8', 16.9, 1.36, 9.3);
  f.box(0.35, 0.25, 0.3, '#b07b48', 17.4, 1.3, 9.35, 0, 0.3, 0);
  box(15.3, 0.55, 9.4, 2.7, 0.55, 0.35);
  box(12.95, 0.55, 8.4, 0.35, 0.55, 0.75);
  root.add(meshOf(f, lam, true, true));
  box(P.desk.x, 0.4, P.desk.z, 1.25, 0.4, 0.6);

  // ── Tablón de encargos ──
  const board = new THREE.Group();
  const bf = new GeoBuilder();
  bf.box(5.3, 2.5, 0.1, '#6b4226', 0, 0, -0.02);
  bf.box(5.3, 0.1, 0.24, '#6b4226', 0, -1.27, 0.06);
  board.add(meshOf(bf, lam, false, true));
  const cork = texPlane(5.0, 2.25, boardTexture());
  cork.position.z = 0.04;
  board.add(cork);
  const boardGlow = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 4.6), glowMaterial(haloTexture(), '#ffd23f', 0.25));
  boardGlow.position.z = 0.01;
  board.add(boardGlow);
  board.position.set(P.board.x, P.board.y, 0.08);
  root.add(board);

  // ── Cartel CONTRA REEMBOLSO (cartón / lona / neón) ──
  const s0 = texPlane(4.2, 0.82, signTexture(0));
  s0.position.set(10, 3.5, 0.1); // por delante de la moldura
  s0.rotation.z = 0.035;
  lv.only0.add(s0);
  const s1 = texPlane(4.4, 0.86, signTexture(1));
  s1.position.set(10, 3.5, 0.1);
  lv.only1.add(s1); // en el nivel 2 lo sustituye el neón
  const neonBack = new GeoBuilder();
  neonBack.box(6.8, 0.98, 0.08, '#1b1030', 10, 3.5, 0.05);
  lv.from2.add(meshOf(neonBack, lam, false, false));
  const s2 = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 0.9), glowMaterial(neonTexture(['CONTRA REEMBOLSO'], '#ffd23f', 1400, 200, '900 112px system-ui, sans-serif'), '#ffffff', 1));
  s2.position.set(10, 3.5, 0.11);
  lv.from2.add(s2);
  // bombillas de feria alrededor (nivel 3): pares e impares se turnan
  const bulbsA = new GeoBuilder(), bulbsB = new GeoBuilder();
  let bi = 0;
  const addBulb = (x: number, y: number) => ((bi++ % 2) ? bulbsA : bulbsB).sphere(0.07, '#fff3b0', x, y, 0.14, 1);
  for (let k = 0; k <= 16; k++) {
    addBulb(6.6 + k * 0.425, 3.95);
    addBulb(6.6 + k * 0.425, 3.05);
  }
  for (let k = 1; k < 3; k++) {
    addBulb(6.6, 3.05 + k * 0.3);
    addBulb(13.4, 3.05 + k * 0.3);
  }
  const bulbMatA = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const bulbMatB = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  lv.from3.add(new THREE.Mesh(bulbsA.build(), bulbMatA), new THREE.Mesh(bulbsB.build(), bulbMatB));
  const stars = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), glowMaterial(neonTexture(['★'], '#ff4f81', 256, 256, '900 200px system-ui'), '#ffffff', 1));
  stars.position.set(5.95, 3.5, 0.12);
  const stars2 = stars.clone();
  stars2.position.x = 14.05;
  lv.from3.add(stars, stars2);

  // ── Estanterías con paquetes (más cuanto más nivel) ──
  const shelfZ = [1.7, 4.1, 6.5, 8.9, 11.3];
  const shelfMin = [1, 1, 2, 2, 3];
  const boxCols = ['#c8915a', '#b07b48', '#d9a870', '#e3b77e', '#a8703f'];
  shelfZ.forEach((z, i) => {
    const b = new GeoBuilder();
    const hh = shelfMin[i] >= 3 ? 3.1 : 2.4;
    const levels = hh > 3 ? 5 : 4;
    const metal = shelfMin[i] >= 3 ? '#d4af37' : '#5d6b7a';
    for (const dz of [-1.08, 1.08]) b.box(0.08, hh, 0.08, metal, 0.55, hh / 2, z + dz), b.box(0.08, hh, 0.08, metal, 0.08, hh / 2, z + dz);
    for (let l = 0; l < levels; l++) {
      const y = 0.15 + l * (hh - 0.2) / (levels - 1);
      b.box(0.62, 0.05, 2.24, '#8a6d4a', 0.32, y, z);
      if (l === levels - 1) continue;
      let zz = z - 1.0;
      while (zz < z + 0.9) {
        const w = 0.28 + rnd.next() * 0.3;
        const h2 = 0.22 + rnd.next() * 0.26;
        if (zz + w > z + 1.02) break;
        const c = boxCols[Math.floor(rnd.next() * boxCols.length)];
        b.box(0.44, h2, w - 0.03, c, 0.32, y + 0.025 + h2 / 2, zz + w / 2, 0, (rnd.next() - 0.5) * 0.15, 0);
        if (rnd.next() < 0.5) b.box(0.45, 0.04, w - 0.02, '#e3d3a8', 0.32, y + 0.025 + h2 / 2, zz + w / 2);
        if (rnd.next() < 0.2) b.box(0.02, 0.08, 0.14, '#e63946', 0.55, y + 0.03 + h2 * 0.6, zz + w / 2);
        zz += w;
      }
    }
    const m = meshOf(b, lam, true, true);
    (shelfMin[i] >= 3 ? lv.from3 : shelfMin[i] >= 2 ? lv.from2 : lv.from1).add(m);
    lvColliders.push({ min: shelfMin[i], max: 3, c: box(0.32, hh / 2, z, 0.34, hh / 2, 1.12) });
  });
  // nivel 0: una estantería torcida medio vacía y cajas por el suelo
  {
    const b = new GeoBuilder();
    for (const dz of [-1.0, 1.0]) b.box(0.07, 1.9, 0.07, '#6f6a60', 0.5, 0.95, 2.4 + dz, 0, 0, 0.06), b.box(0.07, 1.9, 0.07, '#6f6a60', 0.1, 0.95, 2.4 + dz, 0, 0, 0.06);
    for (let l = 0; l < 3; l++) b.box(0.6, 0.04, 2.1, '#7d6c4c', 0.33 + l * 0.04, 0.2 + l * 0.8, 2.4, 0, 0, l === 1 ? -0.12 : 0.02);
    b.box(0.4, 0.3, 0.4, '#c8915a', 0.35, 0.37, 1.9);
    b.box(0.4, 0.26, 0.5, '#b07b48', 0.38, 1.1, 2.7, 0, 0.2, -0.12);
    // cajas por el suelo y dos cajas-silla
    b.box(0.6, 0.5, 0.6, '#c8915a', 1.2, 0.25, 5.2, 0, 0.3, 0);
    b.box(0.5, 0.4, 0.5, '#b07b48', 1.3, 0.7, 5.1, 0, -0.2, 0);
    b.box(0.7, 0.45, 0.5, '#d9a870', 2.2, 0.225, 6.4, 0, 0.6, 0);
    lv.only0.add(meshOf(b, lam, true, true));
    lvColliders.push({ min: 0, max: 0, c: box(0.32, 0.95, 2.4, 0.34, 0.95, 1.05) });
  }

  // ── Mesa del jefe (plegable con silla de plástico / mesa buena con silla de oficina) ──
  {
    const b = new GeoBuilder();
    const { x, z } = P.desk;
    b.box(2.2, 0.05, 1.0, '#e8e8e0', x, 0.74, z);
    for (const sx of [-1, 1]) b.box(0.04, 0.74, 0.9, '#8a8f99', x + sx * 0.95, 0.37, z, 0, 0, sx * 0.3);
    b.box(0.5, 0.02, 0.35, '#ffffff', x - 0.3, 0.78, z, 0, 0.3, 0);
    b.cyl(0.05, 0.04, 0.12, 8, '#ffffff', x + 0.6, 0.83, z);
    lv.only0.add(meshOf(b, lam, true, true));
  }
  // silla de plástico (aparte: si compras el sillón de jefe, desaparece)
  const plasticChair = (() => {
    const b = new GeoBuilder();
    const x = P.chair.x, cz = P.chair.z;
    b.box(0.46, 0.05, 0.44, '#f2f2ea', x, 0.45, cz);
    b.box(0.46, 0.45, 0.05, '#f2f2ea', x, 0.7, cz - 0.22, 0.1, 0, 0);
    for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) b.box(0.035, 0.45, 0.035, '#f2f2ea', x + dx, 0.22, cz + dz);
    const m = meshOf(b, lam, true, true);
    lv.only0.add(m);
    return m;
  })();
  // siempre hay una silla detrás de la mesa (de plástico, de oficina o el sillón): colisor fijo
  box(P.chair.x, 0.5, P.chair.z - 0.05, 0.36, 0.5, 0.36);
  {
    const b = new GeoBuilder();
    const { x, z } = P.desk;
    b.box(2.5, 0.08, 1.2, '#6b4226', x, 0.78, z);
    b.box(0.08, 0.74, 1.1, '#5a3620', x - 1.18, 0.37, z);
    b.box(0.08, 0.74, 1.1, '#5a3620', x + 1.18, 0.37, z);
    b.box(2.3, 0.6, 0.05, '#5a3620', x, 0.45, z + 0.5);
    // pantalla, teclado y la taza de "EL JEFE"
    b.box(0.8, 0.5, 0.05, '#1b1030', x - 0.1, 1.14, z - 0.35);
    b.box(0.1, 0.18, 0.08, '#1b1030', x - 0.1, 0.9, z - 0.35);
    b.box(0.6, 0.02, 0.2, '#2b2d42', x - 0.1, 0.83, z);
    b.cyl(0.05, 0.05, 0.1, 10, '#ffd23f', x + 0.8, 0.87, z);
    b.box(0.3, 0.12, 0.22, '#c8915a', x - 0.9, 0.88, z - 0.2);
    lv.from1.add(meshOf(b, lam, true, true));
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.42), new THREE.MeshBasicMaterial({ map: canvasTexture(128, 76, (g, w, h) => {
      g.fillStyle = '#12307a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd23f';
      g.fillRect(8, 50, 12, 18);
      g.fillRect(26, 38, 12, 30);
      g.fillRect(44, 28, 12, 40);
      g.fillRect(62, 14, 12, 54);
      g.fillStyle = '#ffffff';
      g.font = '800 11px system-ui';
      g.fillText('VENTAS ↑', 80, 20);
    }), toneMapped: false }));
    sc.position.set(x - 0.1, 1.14, z - 0.32);
    sc.rotation.y = Math.PI;
    lv.from1.add(sc);
  }
  // silla de oficina normal (si no hay sillón de jefe)
  const officeChair = (() => {
    const b = new GeoBuilder();
    const { x } = P.chair;
    const z = P.chair.z;
    b.box(0.55, 0.1, 0.52, '#2b2d42', x, 0.48, z);
    b.box(0.52, 0.62, 0.08, '#2b2d42', x, 0.85, z - 0.26);
    b.cyl(0.04, 0.04, 0.42, 6, '#8a8f99', x, 0.24, z);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      b.box(0.3, 0.04, 0.05, '#8a8f99', x + Math.cos(a) * 0.15, 0.04, z + Math.sin(a) * 0.15, 0, -a, 0);
    }
    return meshOf(b, lam, true, true);
  })();
  lv.from1.add(officeChair);

  // ── Nivel 0: cubos con goteras y bombilla pelada ──
  const drips: { mesh: THREE.Mesh; t: number; x: number; z: number }[] = [];
  {
    const b = new GeoBuilder();
    P.buckets.forEach((bk, i) => {
      const c = i ? '#e63946' : '#3a86ff';
      b.cyl(0.26, 0.2, 0.36, 12, c, bk.x, 0.18, bk.z);
      b.cyl(0.22, 0.22, 0.02, 12, '#6fc3e8', bk.x, 0.3, bk.z);
      b.add(new THREE.TorusGeometry(0.2, 0.012, 4, 12, Math.PI), '#8a8f99', bk.x, 0.36, bk.z, 0, 0, 0);
    });
    lv.only0.add(meshOf(b, lam, true, true));
    for (const bk of P.buckets) lvColliders.push({ min: 0, max: 0, c: box(bk.x, 0.3, bk.z, 0.24, 0.3, 0.24) });
    const dropGeo = new THREE.SphereGeometry(0.035, 6, 5);
    const dropMat = new THREE.MeshBasicMaterial({ color: '#9fdcff' });
    P.buckets.forEach((bk, i) => {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.scale.set(1, 1.6, 1);
      lv.only0.add(m);
      drips.push({ mesh: m, t: i * 0.7, x: bk.x, z: bk.z });
    });
  }
  const bulb = new THREE.Group();
  {
    const b = new GeoBuilder();
    b.cyl(0.008, 0.008, 1.1, 4, '#1b1030', 0, -0.55, 0);
    b.cyl(0.04, 0.04, 0.08, 8, '#8a8f99', 0, -1.12, 0);
    bulb.add(meshOf(b, lam, false, false));
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff0b8', toneMapped: false }));
    g.position.y = -1.2;
    bulb.add(g);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffe3a0', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.position.y = -1.2;
    halo.scale.setScalar(1.3);
    bulb.add(halo);
    bulb.position.set(10, H, 6.8);
    lv.only0.add(bulb);
  }
  // ventana tapada con cartón y celo (nivel 0)
  {
    const b = new GeoBuilder();
    b.box(1.9, 0.95, 0.03, '#c8915a', 16.5, 2.9, D - 0.05, 0, 0, 0.02);
    b.box(0.7, 0.08, 0.035, '#e3d3a8', 16.0, 3.2, D - 0.06, 0, 0, 0.6);
    b.box(0.7, 0.08, 0.035, '#e3d3a8', 17.0, 2.6, D - 0.06, 0, 0, -0.5);
    lv.only0.add(meshOf(b, lam, false, false));
  }

  // ── Nivel 1+: fluorescentes, planta, fuente de agua ──
  {
    const g = new GeoBuilder();
    for (const [x, z] of [[4, 4], [10, 5], [16, 4], [4, 10], [10, 10], [16, 10]]) g.box(1.4, 0.05, 0.4, '#f6fbff', x, H - 0.03, z);
    lv.from1.add(new THREE.Mesh(g.build(), glowVC));
    const b = new GeoBuilder();
    for (const [x, z] of [[4, 4], [10, 5], [16, 4], [4, 10], [10, 10], [16, 10]]) b.box(1.5, 0.06, 0.5, '#c9ccd1', x, H - 0.01, z);
    // planta
    b.cyl(0.3, 0.24, 0.55, 10, '#ff7b54', 19.3, 0.275, 0.9);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.sphere(0.3, '#3fb85f', 19.3 + Math.cos(a) * 0.22, 0.9 + (k % 2) * 0.3, 0.9 + Math.sin(a) * 0.22, 0, 1, 0.4, 1.3);
    }
    // fuente de agua
    b.box(0.4, 1.0, 0.4, '#f2f2ea', 0.8, 0.5, 13.3);
    b.cyl(0.17, 0.17, 0.45, 10, '#7fd0ff', 0.8, 1.25, 13.3);
    lv.from1.add(meshOf(b, lam, true, true));
    lvColliders.push({ min: 1, max: 3, c: box(0.8, 0.7, 13.3, 0.25, 0.7, 0.25) });
    lvColliders.push({ min: 1, max: 3, c: box(19.3, 0.5, 0.9, 0.35, 0.5, 0.35) });
  }

  // ── Nivel 2+: cinta transportadora y pizarra con gráfica ──
  const beltTex = canvasTexture(64, 256, (g, w, h) => {
    g.fillStyle = '#2b2d42';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d4058';
    for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 12);
  });
  beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
  beltTex.repeat.set(1, 3);
  const beltBoxes: THREE.Mesh[] = [];
  {
    const b = new GeoBuilder();
    b.box(0.9, 0.12, 5.6, '#ffd23f', 3.0, 0.72, 4.2);
    for (const dz of [-2.6, -0.9, 0.9, 2.6]) for (const dx of [-0.4, 0.4]) b.box(0.06, 0.7, 0.06, '#5d6b7a', 3.0 + dx, 0.35, 4.2 + dz);
    // tolva al final
    b.taperBox(1.0, 0.7, 1.0, '#5d6b7a', 3.0, 0.1, 7.3, -0.15, -0.15, -0.15);
    lv.from2.add(meshOf(b, lam, true, true));
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 5.5).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: beltTex }));
    top.position.set(3.0, 0.785, 4.2);
    lv.from2.add(top);
    const bg = new GeoBuilder();
    bg.box(0.5, 0.36, 0.44, '#c8915a', 0, 0.18, 0);
    bg.box(0.51, 0.06, 0.45, '#e3d3a8', 0, 0.2, 0);
    const bgeo = bg.build();
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(bgeo, lam);
      m.castShadow = true;
      m.position.set(3.0, 0.79, 1.6 + k * 1.1);
      beltBoxes.push(m);
      lv.from2.add(m);
    }
    lvColliders.push({ min: 2, max: 3, c: box(3.0, 0.5, 4.2, 0.48, 0.5, 2.85) });
    const wb = texPlane(3.2, 1.6, canvasTexture(320, 160, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#1b1030';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(20, 20);
      g.lineTo(20, 140);
      g.lineTo(300, 140);
      g.stroke();
      g.strokeStyle = '#2ec4b6';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(24, 130);
      g.lineTo(90, 110);
      g.lineTo(140, 118);
      g.lineTo(200, 70);
      g.lineTo(290, 18);
      g.stroke();
      g.fillStyle = '#e63946';
      g.font = "800 18px 'Comic Sans MS', system-ui";
      g.fillText('¡¡NOS FORRAMOS!!', 110, 40);
      g.fillStyle = '#1b1030';
      g.font = "700 12px 'Comic Sans MS', system-ui";
      g.fillText('(paquetes que llegan)', 40, 156);
    }));
    wb.position.set(3.4, 2.3, 0.05);
    lv.from2.add(wb);
    const wbf = new GeoBuilder();
    wbf.box(3.35, 1.75, 0.05, '#c9ccd1', 3.4, 2.3, 0.02);
    wbf.box(3.2, 0.06, 0.12, '#c9ccd1', 3.4, 1.47, 0.08);
    lv.from2.add(meshOf(wbf, lam, false, true));
  }

  // ── Nivel 3: alfombra roja, trofeos, furgonetas en miniatura, empleado del mes ──
  {
    const b = new GeoBuilder();
    b.box(1.6, 0.012, 12.2, '#c8102e', 10, 0.006, 7.35);
    b.box(0.08, 0.014, 12.2, '#d4af37', 9.18, 0.007, 7.35);
    b.box(0.08, 0.014, 12.2, '#d4af37', 10.82, 0.007, 7.35);
    // balda de trofeos detrás del jefe
    b.box(4.6, 0.06, 0.4, '#d4af37', 16.2, 2.05, 0.22);
    for (let k = 0; k < 6; k++) {
      const x = 14.2 + k * 0.8;
      const s = 0.7 + (k % 3) * 0.2;
      b.cyl(0.12 * s, 0.08 * s, 0.1, 8, '#1b1030', x, 2.13, 0.22);
      b.cyl(0.03 * s, 0.03 * s, 0.18 * s, 6, '#d4af37', x, 2.26, 0.22);
      b.cyl(0.18 * s, 0.07 * s, 0.26 * s, 10, '#ffd23f', x, 2.4 + 0.1 * s, 0.22);
      b.add(new THREE.TorusGeometry(0.08 * s, 0.018, 4, 8), '#ffd23f', x - 0.18 * s, 2.44 + 0.1 * s, 0.22, 0, 0, Math.PI / 2);
      b.add(new THREE.TorusGeometry(0.08 * s, 0.018, 4, 8), '#ffd23f', x + 0.18 * s, 2.44 + 0.1 * s, 0.22, 0, 0, Math.PI / 2);
    }
    // vitrina con la flota en miniatura (junto a la puerta)
    b.box(4.4, 0.9, 0.7, '#1b1030', 15.4, 0.45, 13.35);
    b.box(4.46, 0.05, 0.76, '#d4af37', 15.4, 0.92, 13.35);
    b.box(4.4, 0.04, 0.7, '#d4af37', 15.4, 1.72, 13.35);
    for (const x of [13.2, 17.6]) b.box(0.05, 0.8, 0.7, '#d4af37', x, 1.32, 13.35);
    lv.from3.add(meshOf(b, lam, true, true));
    lvColliders.push({ min: 3, max: 3, c: box(15.4, 0.6, 13.35, 2.25, 0.6, 0.38) });
    const vg = modelGeometry('van', '#ffd23f');
    if (vg) {
      const bb = vg.boundingBox!;
      const size = bb.getSize(new THREE.Vector3());
      const sc = 0.95 / size.z;
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Mesh(vg, lam);
        m.scale.setScalar(sc);
        m.position.set(13.8 + k * 1.1, 0.95 - bb.min.y * sc, 13.35);
        m.rotation.y = Math.PI / 2 + 0.35;
        lv.from3.add(m);
      }
    }
    const glass = new THREE.Mesh(new THREE.BoxGeometry(4.38, 0.76, 0.68), new THREE.MeshBasicMaterial({ color: '#cdefff', transparent: true, opacity: 0.12, depthWrite: false }));
    glass.position.set(15.4, 1.32, 13.35);
    lv.from3.add(glass);
    // empleado del mes: tú (otra vez)
    const emp = texPlane(0.9, 1.15, canvasTexture(160, 204, (g, w, h) => {
      g.fillStyle = '#ffd23f';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1b1030';
      g.font = '900 17px system-ui';
      g.textAlign = 'center';
      g.fillText('EMPLEADO', w / 2, 22);
      g.fillText('DEL MES', w / 2, 42);
      g.fillStyle = '#ffffff';
      g.fillRect(30, 54, 100, 100);
      g.font = '64px system-ui';
      g.fillText('😎', w / 2, 130);
      g.fillStyle = '#1b1030';
      g.font = '800 15px system-ui';
      g.fillText('TÚ (OTRA VEZ)', w / 2, 180);
    }));
    emp.position.set(13.5, 2.2, 0.06);
    lv.from3.add(emp);
    const ef = new GeoBuilder();
    addGoldFrame(ef, 0.9, 1.15, 13.5, 2.2, 0.03, 0, 0.07);
    lv.from3.add(meshOf(ef, lam, false, true));
  }

  // ── Nivel 0: humedades, trastos, sofá roto y carteles viejos ──
  {
    const stain = stainTexture();
    const stainMat = new THREE.MeshLambertMaterial({ map: stain, transparent: true, depthWrite: false });
    const decal = (w: number, h: number, x: number, y: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), stainMat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      lv.only0.add(m);
    };
    decal(2.4, 1.8, 0.04, 3.1, 4.2, Math.PI / 2);
    decal(1.6, 1.2, 0.04, 0.6, 8.6, Math.PI / 2);
    decal(2.0, 1.6, W - 0.04, 2.9, 10.2, -Math.PI / 2);
    decal(2.6, 1.5, 4.2, 3.2, 0.04, 0);
    decal(1.4, 1.0, 15.5, 0.55, 0.04, 0);
    decal(1.8, 1.4, 17.2, 3.2, D - 0.04, Math.PI);
    // manchas del techo justo encima de cada cubo (de ahí sale la gotera)
    P.buckets.forEach((bk, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2 + i * 0.4, 1.9 + i * 0.3), stainMat);
      m.rotation.x = Math.PI / 2;
      m.rotation.z = i * 1.3;
      m.position.set(bk.x, H - 0.015, bk.z);
      lv.only0.add(m);
    });
    const b = new GeoBuilder();
    // sofá viejo con un muelle fuera
    const sx = 3.0, sz = 11.4;
    b.box(0.95, 0.45, 2.2, '#7a5236', sx, 0.225, sz);
    b.box(0.3, 0.95, 2.2, '#6b4228', sx - 0.4, 0.475, sz);
    b.box(0.95, 0.65, 0.25, '#6b4228', sx, 0.325, sz - 1.1);
    b.box(0.95, 0.65, 0.25, '#6b4228', sx, 0.325, sz + 1.1);
    b.box(0.7, 0.14, 0.95, '#8a6242', sx + 0.1, 0.5, sz - 0.5, 0, 0, -0.05);
    b.box(0.7, 0.12, 0.95, '#8a6242', sx + 0.1, 0.49, sz + 0.5);
    b.box(0.3, 0.02, 0.35, '#e9dcc0', sx + 0.15, 0.58, sz + 0.55, 0, 0.4, 0);
    b.add(new THREE.TorusGeometry(0.06, 0.012, 4, 10), '#8a8f99', sx + 0.2, 0.62, sz - 0.5, 0, 0, 0, 1, 1.8, 1);
    // pizzas encima de la mesa plegable
    for (let k = 0; k < 3; k++) b.box(0.42, 0.05, 0.42, k === 1 ? '#e63946' : '#fafafa', P.desk.x + 0.55, 0.795 + k * 0.05, P.desk.z + 0.1, 0, k * 0.2, 0);
    // ventilador de pie
    b.cyl(0.25, 0.28, 0.05, 10, '#dcdcdc', 19.0, 0.025, 3.2);
    b.cyl(0.03, 0.03, 1.2, 6, '#dcdcdc', 19.0, 0.62, 3.2);
    b.cyl(0.3, 0.3, 0.12, 12, '#bfe0ff', 18.95, 1.3, 3.2, 0, 0, Math.PI / 2);
    // fregona en el cubo rojo
    const bk = P.buckets[1];
    b.cyl(0.02, 0.02, 1.4, 5, '#c8915a', bk.x + 0.25, 0.75, bk.z, 0, 0, -0.3);
    b.sphere(0.14, '#e9e1cf', bk.x + 0.02, 0.2, bk.z, 0, 1, 0.7, 1);
    // torres de cajas en las esquinas
    const tower = (x: number, z: number, n: number) => {
      for (let k = 0; k < n; k++) b.box(0.6 - k * 0.05, 0.45, 0.55, ['#c8915a', '#b07b48', '#d9a870'][k % 3], x + (k % 2) * 0.06, 0.225 + k * 0.45, z, 0, k * 0.25, 0);
    };
    tower(18.9, 13.2, 3);
    tower(1.1, 7.6, 2);
    tower(7.8, 0.7, 4);
    for (const [x, z, h] of [[18.9, 13.2, 1.35], [1.1, 7.6, 0.9], [7.8, 0.7, 1.8], [1.25, 5.15, 0.9], [2.2, 6.4, 0.6]] as [number, number, number][]) {
      lvColliders.push({ min: 0, max: 0, c: box(x, h / 2, z, 0.34, h / 2, 0.32) });
    }
    // silla rota tirada
    b.box(0.44, 0.05, 0.42, '#f2f2ea', 7.4, 0.24, 12.2, Math.PI / 2 - 0.2, 0.4, 0);
    b.box(0.44, 0.44, 0.05, '#f2f2ea', 7.6, 0.03, 12.0, 0, 0.4, 0);
    lv.only0.add(meshOf(b, lam, true, true));
    lvColliders.push({ min: 0, max: 0, c: box(sx - 0.05, 0.45, sz, 0.5, 0.45, 1.25) });
    // carteles viejos: calendario y "se busca"
    const cal = texPlane(0.8, 1.0, posterTexture('1998', ['FERRETERÍA', 'PACO', '', 'enero'], '#fff7e6', '#e63946', 200, 250));
    cal.position.set(14.2, 2.1, 0.04);
    cal.rotation.z = -0.05;
    lv.only0.add(cal);
    const wanted = texPlane(0.9, 1.2, posterTexture('SE BUSCA', ['REPARTIDOR', 'sin miedo', 'a las abuelas', '', 'Razón: aquí'], '#f4e3b0', '#1b1030'));
    wanted.position.set(0.04, 1.8, 6.1);
    wanted.rotation.set(0, Math.PI / 2, 0.06);
    lv.only0.add(wanted);
  }

  // ── Cartel colgado sobre el mostrador (siempre) ──
  {
    const sign = texPlane(2.6, 0.55, canvasTexture(512, 108, (g, w, h) => {
      g.fillStyle = '#1b1030';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd23f';
      g.font = '900 50px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('📦 RECOGIDA', w / 2, h / 2 + 2);
    }));
    sign.position.set(15.3, 2.85, 9.4);
    root.add(sign);
    const back = sign.clone();
    back.rotation.y = Math.PI;
    back.position.z -= 0.01;
    root.add(back);
    const b = new GeoBuilder();
    b.box(0.015, 0.9, 0.015, '#1b1030', 14.3, 3.55, 9.4);
    b.box(0.015, 0.9, 0.015, '#1b1030', 16.3, 3.55, 9.4);
    root.add(meshOf(b, lam, false, false));
  }

  // ── Nivel 1+: carteles motivadores y alfombra con el logo ──
  {
    const pst = texPlane(0.98, 1.3, posterTexture('ÉXITO', ['El cliente siempre', 'tiene razón.', 'Y un paquete.', '', '★ ★ ★'], '#2ec4b6', '#ffffff'));
    pst.position.set(6.0, 2.4, 0.04);
    lv.from1.add(pst);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 36).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#1b1030';
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 14, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1b1030';
      g.font = '900 96px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('CR', w / 2, h / 2 - 6);
      g.font = '800 22px system-ui';
      g.fillText('DESDE AYER', w / 2, h / 2 + 62);
    }) }));
    rug.position.set(13.2, 0.006, 4.6);
    rug.rotation.y = 0.3;
    rug.receiveShadow = true;
    lv.from1.add(rug);
  }

  // ── Nivel 2+: palés con paquetes retractilados y zona de carga pintada ──
  {
    const b = new GeoBuilder();
    for (const [x, z, n] of [[6.1, 1.2, 3], [6.1, 3.1, 2]] as [number, number, number][]) {
      for (let k = 0; k < 3; k++) b.box(1.2, 0.05, 0.14, '#b98a55', x, 0.05 + 0.1, z - 0.4 + k * 0.4);
      b.box(1.2, 0.1, 1.0, '#a8754a', x, 0.05, z);
      for (let l = 0; l < n; l++) b.box(1.1, 0.45, 0.95, ['#c8915a', '#d9a870', '#b07b48'][l % 3], x, 0.4 + l * 0.46, z);
    }
    // transpaleta amarilla
    b.box(0.5, 0.08, 1.2, '#ffd23f', 7.4, 0.08, 2.4);
    b.box(0.3, 0.3, 0.3, '#ffd23f', 7.4, 0.25, 3.0);
    b.cyl(0.02, 0.02, 1.0, 5, '#1b1030', 7.4, 0.8, 3.2, 0.3, 0, 0);
    lv.from2.add(meshOf(b, lam, true, true));
    lvColliders.push({ min: 2, max: 3, c: box(6.1, 0.7, 2.15, 0.62, 0.7, 1.5) });
    // marca amarilla y negra en el suelo alrededor de la cinta
    const f2 = new GeoBuilder();
    for (let k = 0; k < 16; k++) f2.box(0.12, 0.01, 0.45, k % 2 ? '#1b1030' : '#ffd23f', 2.0, 0.006, 1.2 + k * 0.42);
    for (let k = 0; k < 16; k++) f2.box(0.12, 0.01, 0.45, k % 2 ? '#1b1030' : '#ffd23f', 4.0, 0.006, 1.2 + k * 0.42);
    lv.from2.add(meshOf(f2, lam, false, true));
  }

  // ── Nivel 3: friso de madera oscura con remate dorado ──
  {
    const b = new GeoBuilder();
    const wood = '#4a2a18', gold = '#d4af37';
    b.box(W, 1.1, 0.04, wood, W / 2, 0.55, 0.03);
    b.box(W, 0.06, 0.07, gold, W / 2, 1.12, 0.05);
    b.box(0.04, 1.1, D, wood, 0.03, 0.55, D / 2);
    b.box(0.07, 0.06, D, gold, 0.05, 1.12, D / 2);
    b.box(0.04, 1.1, D, wood, W - 0.03, 0.55, D / 2);
    b.box(0.07, 0.06, D, gold, W - 0.05, 1.12, D / 2);
    b.box(9, 1.1, 0.04, wood, 4.5, 0.55, D - 0.03);
    b.box(9, 0.06, 0.07, gold, 4.5, 1.12, D - 0.05);
    b.box(9, 1.1, 0.04, wood, 15.5, 0.55, D - 0.03);
    b.box(9, 0.06, 0.07, gold, 15.5, 1.12, D - 0.05);
    for (let x = 1; x < W; x += 2) b.box(0.05, 0.9, 0.05, '#6b4226', x, 0.55, 0.06);
    lv.from3.add(meshOf(b, lam, false, true));
  }

  // ── Toñi, la de la oficina (siempre con el móvil) ──
  const toni: Character = makeCharacter({ ...randomLook(new Rng('toni-oficina'), 'repartidor'), hair: 'moño', hairColor: '#8e3e1f', cap: false });
  toni.root.position.set(P.employee.x, 0, P.employee.z);
  toni.root.rotation.y = 0;
  root.add(toni.root);
  box(P.employee.x, 0.9, P.employee.z, 0.3, 0.9, 0.3); // no se la atraviesa
  const toniTarget = { position: toWorld(P.employee) };

  // ── Tus repartidores (company.staff), de charla por la oficina ──
  interface StaffSlot { x: number; z: number; heading: number; pose: 'normal' | 'phone' | 'sit'; y?: number }
  const staffSlot = (i: number, lvl: number, lx: Set<string>): StaffSlot => {
    if (i === 0) return lx.has('cafe') ? { x: 18.4, z: 10.9, heading: 0.76, pose: 'normal' } : { x: 18.2, z: 11.6, heading: -Math.PI / 2, pose: 'phone' };
    if (i === 1) return lx.has('billar') ? { x: 9.2, z: 9.0, heading: -Math.PI / 2 - 0.4, pose: 'normal' } : { x: 1.6, z: 6.5, heading: -Math.PI / 2, pose: 'phone' };
    return lvl === 0 ? { x: 3.25, z: 11.4, heading: Math.PI / 2, pose: 'sit' } : { x: 3.4, z: 1.3, heading: Math.PI, pose: 'normal' };
  };
  const staffChars: { ch: Character; id: number; name: string; slot: StaffSlot; target: { position: THREE.Vector3 } }[] = [];
  // un colisor por repartidor (se mueve a su sitio y se apaga si no hay nadie)
  const staffCols = [0, 1, 2].map(() => {
    const c = phys.addStaticCylinder(O.x, O.y + 0.9, O.z, 0.9, 0.3, G.STATIC);
    c.setEnabled(false);
    return c;
  });
  let staffKey = '';
  const refreshStaff = () => {
    const c = game.mod.company;
    const list = ((c?.staff as { id: number; name: string }[] | undefined) ?? []).slice(0, 3);
    const st = companyState(game);
    const key = list.map((e) => e.id).join(',') + '|' + st.level + '|' + [...st.lux].sort().join(',');
    if (key === staffKey) return;
    staffKey = key;
    for (const s of staffChars) {
      root.remove(s.ch.root);
      s.ch.dispose();
    }
    staffChars.length = 0;
    for (const c of staffCols) c.setEnabled(false);
    list.forEach((e, i) => {
      const ch = makeCharacter(randomLook(new Rng('repartidor-' + e.id), 'repartidor'));
      const slot = staffSlot(i, st.level, st.lux);
      ch.root.position.set(slot.x, 0, slot.z);
      ch.root.rotation.y = slot.heading;
      root.add(ch.root);
      staffChars.push({ ch, id: e.id, name: e.name, slot, target: { position: toWorld(V(slot.x, slot.z)) } });
      // el que está sentado en el sofá viejo ya tiene el colisor del sofá
      if (slot.pose !== 'sit') {
        staffCols[i].setTranslation({ x: O.x + slot.x, y: O.y + 0.9, z: O.z + slot.z });
        staffCols[i].setEnabled(true);
      }
    });
  };

  // ── Lujos ──
  const lux: Record<string, THREE.Object3D> = {};
  const luxColliders: Record<string, { setEnabled(on: boolean): void }[]> = {};
  const luxConfetti: Record<string, THREE.Vector3> = {};

  // máquina de café
  {
    const g = new THREE.Group();
    const b = new GeoBuilder();
    b.box(0.7, 0.95, 0.9, '#6b4226', 0, 0.475, 0);
    b.box(0.74, 0.05, 0.94, '#1b1030', 0, 0.97, 0);
    b.box(0.55, 0.75, 0.5, '#e63946', 0.05, 1.37, 0);
    b.box(0.5, 0.2, 0.46, '#1b1030', 0.05, 1.82, 0);
    b.box(0.05, 0.22, 0.3, '#1b1030', -0.24, 1.25, 0);
    b.cyl(0.06, 0.05, 0.1, 8, '#ffffff', -0.2, 1.05, 0);
    b.cyl(0.06, 0.05, 0.1, 8, '#ffffff', -0.2, 1.05, 0.3);
    b.box(0.02, 0.12, 0.12, '#ffd23f', -0.23, 1.55, -0.12);
    g.add(meshOf(b, lam, true, true));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), new THREE.MeshBasicMaterial({ color: '#39ff14', toneMapped: false }));
    led.position.set(-0.24, 1.6, 0.12);
    g.add(led);
    const lbl = texPlane(0.4, 0.16, canvasTexture(128, 52, (x, w, h) => {
      x.fillStyle = '#1b1030';
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#ffd23f';
      x.font = '900 26px system-ui';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('CAFÉ', w / 2, h / 2);
    }), true);
    lbl.position.set(-0.235, 1.82, 0);
    lbl.rotation.y = -Math.PI / 2;
    g.add(lbl);
    g.position.set(P.coffee.x, 0, P.coffee.z);
    root.add(g);
    lux.cafe = g;
    luxColliders.cafe = [box(P.coffee.x, 0.5, P.coffee.z, 0.36, 0.5, 0.46)];
    luxConfetti.cafe = V(P.coffee.x, P.coffee.z, 2);
  }
  // sillón de jefe (de cuero, con respaldo altísimo y remaches dorados)
  {
    const g = new THREE.Group();
    const b = new GeoBuilder();
    const brown = '#7a1e1e', dark = '#5c1414', gold = '#d4af37';
    b.box(0.95, 0.24, 0.85, brown, 0, 0.5, 0);
    b.box(0.85, 0.12, 0.7, '#8e2a2a', 0, 0.66, 0.04);
    // respaldo de orejas, más ancho arriba
    b.taperBox(1.15, 1.25, 0.26, dark, 0, 1.24, -0.46, 0, 0, -0.12);
    b.box(0.22, 0.55, 0.36, dark, -0.58, 1.45, -0.3, 0, 0.35, 0);
    b.box(0.22, 0.55, 0.36, dark, 0.58, 1.45, -0.3, 0, -0.35, 0);
    b.box(0.8, 0.9, 0.1, '#8e2a2a', 0, 1.15, -0.31);
    // brazos con remate dorado
    b.box(0.2, 0.34, 0.85, brown, -0.56, 0.78, 0);
    b.box(0.2, 0.34, 0.85, brown, 0.56, 0.78, 0);
    b.sphere(0.1, gold, -0.56, 0.98, 0.42, 1);
    b.sphere(0.1, gold, 0.56, 0.98, 0.42, 1);
    b.box(1.2, 0.12, 0.3, gold, 0, 1.9, -0.44);
    b.sphere(0.13, gold, 0, 2.04, -0.44, 1);
    for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) b.sphere(0.03, gold, -0.3 + j * 0.3, 0.95 + k * 0.3, -0.3, 0);
    b.cyl(0.05, 0.05, 0.4, 6, '#8a8f99', 0, 0.2, 0);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      b.box(0.36, 0.05, 0.06, gold, Math.cos(a) * 0.18, 0.03, Math.sin(a) * 0.18, 0, -a, 0);
    }
    g.add(meshOf(b, lam, true, true));
    g.position.set(P.chair.x, 0, P.chair.z);
    root.add(g);
    lux.sillon = g;
    luxColliders.sillon = [];
    luxConfetti.sillon = V(P.chair.x, P.chair.z, 2.2);
  }
  // acuario en la pared este
  const tank = new FishTank({ w: 3.0, h: 1.3, d: 0.7, fish: 11, boxFish: true, ornament: 'chest' });
  {
    const g = new THREE.Group();
    const b = new GeoBuilder();
    b.box(3.2, 0.85, 0.85, '#1b1030', 0, 0.425, 0);
    b.box(3.26, 0.05, 0.9, '#d4af37', 0, 0.87, 0);
    b.box(3.26, 0.1, 0.9, '#d4af37', 0, 2.22, 0);
    g.add(meshOf(b, lam, true, true));
    tank.group.position.y = 0.88;
    g.add(tank.group);
    g.position.set(P.aquarium.x, 0, P.aquarium.z);
    g.rotation.y = -Math.PI / 2;
    root.add(g);
    lux.acuario = g;
    luxColliders.acuario = [box(P.aquarium.x, 1.1, P.aquarium.z, 0.45, 1.1, 1.62)];
    luxConfetti.acuario = V(P.aquarium.x - 0.5, P.aquarium.z, 2.4);
  }
  // cuadro tuyo gigante (pared sur)
  const portraitGroup = new THREE.Group();
  let portraitKey = '';
  const portraitMat = new THREE.MeshLambertMaterial();
  {
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), portraitMat);
    pic.position.z = 0.03;
    portraitGroup.add(pic);
    const b = new GeoBuilder();
    addGoldFrame(b, 2.4, 3.0, 0, 0, 0, 0, 0.2);
    portraitGroup.add(meshOf(b, lam, false, true));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.4), glowMaterial(haloTexture(), '#ffe6b0', 0.3));
    glow.position.z = 0.05;
    portraitGroup.add(glow);
    portraitGroup.position.copy(P.portrait);
    portraitGroup.rotation.y = Math.PI;
    root.add(portraitGroup);
    lux.cuadro = portraitGroup;
    luxColliders.cuadro = [];
    luxConfetti.cuadro = V(P.portrait.x, 12.8, 2.5);
  }
  const refreshPortrait = () => {
    const look = playerLook(game);
    const k = lookKey(look);
    if (k === portraitKey) return;
    portraitKey = k;
    portraitMat.map?.dispose();
    portraitMat.map = portraitTexture(look, 'EL JEFE');
    portraitMat.needsUpdate = true;
  };
  // mesa de billar con bolas de verdad (física 2D sencilla)
  const pool = buildPool();
  pool.group.position.set(P.pool.x, 0, P.pool.z);
  root.add(pool.group);
  lux.billar = pool.group;
  luxColliders.billar = [box(P.pool.x, 0.45, P.pool.z, 1.45, 0.45, 0.85)];
  luxConfetti.billar = V(P.pool.x, P.pool.z, 1.6);

  // ── Luces (solo mientras estás dentro) ──
  const L1 = new THREE.PointLight('#fff1d8', 18, 16, 1.4);
  L1.position.set(13.5, H - 0.5, 9);
  const L2 = new THREE.PointLight('#fff1d8', 18, 16, 1.4);
  L2.position.set(7, H - 0.5, 4.5);
  const amb = new THREE.AmbientLight('#ffe2c0', 0.25);
  root.add(L1, L2, amb);

  // ── Refresco según el estado de la empresa ──
  const popper = new Popper(game);
  const seats = new Seats(game);
  let level = -1;
  const owned = new Set<string>();
  let lastSig = '';
  const refresh = (pop: boolean) => {
    const st = companyState(game);
    const sig = st.level + '|' + [...st.lux].sort().join(',');
    lastSig = sig;
    const up = pop && level >= 0 && st.level > level;
    level = st.level;
    lv.only0.visible = level === 0;
    lv.from1.visible = level >= 1;
    lv.only12.visible = level === 1 || level === 2;
    lv.from2.visible = level >= 2;
    lv.from3.visible = level >= 3;
    lv.only1.visible = level === 1;
    for (const c of lvColliders) c.c.setEnabled(level >= c.min && level <= c.max);
    if (up) {
      for (let k = 0; k < 5; k++) game.mod.particles?.emit('confetti', toWorld(V(3 + k * 3.5, 6 + (k % 2) * 3, H - 0.5)), { count: 20, speed: 0.6 });
      game.mod.audio?.play('success', { volume: 0.6 });
    }
    for (const id of ['cafe', 'sillon', 'acuario', 'cuadro', 'billar']) {
      const has = st.lux.has(id);
      const obj = lux[id];
      if (has && !owned.has(id) && pop) popper.pop(obj, toWorld(luxConfetti[id]));
      else obj.visible = has;
      if (!has && obj.userData.baseScale) obj.scale.copy(obj.userData.baseScale);
      for (const c of luxColliders[id]) c.setEnabled(has);
      if (has) owned.add(id);
      else owned.delete(id);
    }
    officeChair.visible = level >= 1 && !st.lux.has('sillon');
    plasticChair.visible = !st.lux.has('sillon');
    // luces según el nivel: bombilla amarilla que parpadea / fluorescente / dorado
    const col = level === 0 ? '#ffd28a' : level === 3 ? '#ffe2b0' : '#fff4e6';
    L1.color.set(col);
    L2.color.set(col);
    if (lux.cuadro.visible) refreshPortrait();
  };

  // ── Puntos de interacción ──
  const spots: Spot[] = [
    {
      pos: V(10, 1.3), r: 2.4, text: 'Gestionar tu empresa (tablón, personal, flota)',
      run: () => {
        const c = game.mod.company;
        if (c?.open) c.open();
        else toast(game, 'El tablón está vacío. Los encargos grandes llegarán pronto.', '#ffd23f', 3);
      },
    },
    {
      pos: P.counterFront, r: 1.5, text: 'Hablar con Toñi (la de la oficina)',
      run: () => {
        const lines = [...TONI_LINES[Math.max(0, level)], ...TONI_ANY];
        say(game, toniTarget, pick(lines), 3.6);
        game.mod.audio?.say?.(toniTarget.position, 6, 1.35, 0.5);
      },
    },
    {
      pos: V(P.coffee.x - 0.9, P.coffee.z), r: 1.3, on: () => owned.has('cafe'), text: 'Tomar café',
      run: () => {
        const p = game.mod.player;
        if (p) p.stamina = Math.min(100, p.stamina + 20);
        game.mod.particles?.emit('smoke', toWorld(V(P.coffee.x - 0.2, P.coffee.z, 1.2)), { count: 5, scale: 0.35, speed: 0.2 });
        game.mod.audio?.play('pop', { volume: 0.4, pitch: 0.6 });
        toast(game, '☕ ' + pick(COFFEE) + ' +20 de aguante', '#ffd23f', 3);
      },
    },
    {
      pos: V(P.chair.x - 1.0, P.chair.z), r: 1.2, on: () => owned.has('sillon') && !seats.busy, text: 'Sentarse en el sillón de jefe',
      run: () => {
        seats.sit(toWorld(V(P.chair.x, P.chair.z + 0.08)), 0, toWorld(V(P.chair.x - 1.65, P.chair.z - 0.15)), { hint: 'E o WASD — Levantarse del sillón' });
        toast(game, 'Te sientas. Te sientes importante. Porque lo eres.', '#ffd23f', 2.6);
      },
    },
    {
      pos: V(P.aquarium.x - 1.0, P.aquarium.z), r: 1.4, on: () => owned.has('acuario'), text: 'Dar de comer a los peces',
      run: () => {
        tank.feed();
        toast(game, '🐟 ' + pick(FISH), '#35d0ff', 3);
      },
    },
    { pos: V(P.portrait.x, 12.6), r: 1.6, on: () => owned.has('cuadro'), text: 'Admirar tu retrato', run: () => toast(game, '🖼️ ' + pick(PORTRAIT), '#ffd23f', 3) },
    {
      pos: V(P.pool.x, P.pool.z), r: 2.1, on: () => owned.has('billar'), text: () => (pool.busy ? 'Esperar a que paren las bolas' : 'Echar una partida de billar'),
      run: () => {
        if (pool.busy) return;
        pool.breakShot((n, black) => {
          const msg = black
            ? '¡Metes la negra en el saque! Pierdes, pero con muchísimo estilo.'
            : n === 0
              ? 'Ni una dentro. Toñi se ríe por lo bajo.'
              : n >= 3
                ? `¡${n} bolas dentro en el saque! Toñi dice que ha sido suerte. Envidia.`
                : pick(POOL_END);
          toast(game, '🎱 ' + msg, '#ffffff', 3.2);
        });
        game.mod.audio?.play('punch', { volume: 0.5, pitch: 1.8 });
      },
    },
    ...[0, 1, 2].map((i): Spot => {
      const pos = new THREE.Vector3();
      return {
        pos, r: 1.5,
        on: () => {
          const sc = staffChars[i];
          if (!sc) return false;
          pos.set(sc.slot.x, 0, sc.slot.z);
          return true;
        },
        text: () => `Hablar con ${staffChars[i]?.name ?? 'tu repartidor'}`,
        run: () => {
          const sc = staffChars[i];
          if (!sc) return;
          say(game, sc.target, pick(STAFF_LINES), 3.4);
          game.mod.audio?.say?.(sc.target.position, 5, 0.9 + i * 0.2, 0.5);
        },
      };
    }),
    ...P.buckets.map((bk) => ({
      pos: bk, r: 0.9, on: () => level === 0, text: 'Vaciar el cubo',
      run: () => {
        game.mod.audio?.play('splash', { volume: 0.4 });
        toast(game, 'Vacías el cubo por la ventana. Abajo alguien grita. Ups.', '#9fdcff', 3);
      },
    })),
  ];

  let t = 0;
  let flick = 0;
  let sigT = 0;
  let welcomed = false;
  const inst: OfficeScene = {
    spawn: P.spawn.clone(),
    heading: Math.PI,
    exit: P.exit.clone(),
    refresh,
    interact: (local) => nearestSpot(spots, local),
    onEnter() {
      root.visible = true;
      refresh(false);
      refreshPortrait();
      refreshStaff();
      if (!welcomed) {
        welcomed = true;
        const lvl = companyState(game).level;
        toast(game, lvl === 0 ? 'Tu oficina. Bueno, «oficina». Mejórala desde el TABLÓN.' : 'La oficina. El TABLÓN de la pared es tu centro de mando.', '#ffd23f', 3.2);
      }
    },
    onExit() {
      if (seats.busy) seats.stand();
      root.visible = false;
    },
    update(dt, inside) {
      if (!inside) return;
      t += dt;
      // si cambia la empresa estando dentro (tablón), se ve al momento
      sigT -= dt;
      if (sigT <= 0) {
        sigT = 0.25;
        const st = companyState(game);
        const sig = st.level + '|' + [...st.lux].sort().join(',');
        if (sig !== lastSig) refresh(true);
        refreshStaff();
        // si te cambias de ropa (o te pones un disfraz), el retrato también
        if (lux.cuadro.visible) refreshPortrait();
      }
      popper.update(dt);
      seats.update(dt);
      toni.update(dt, { speed: 0, grounded: true, pose: 'phone' });
      for (const sc of staffChars) sc.ch.update(dt, { speed: 0, grounded: true, pose: sc.slot.pose });
      if (owned.has('acuario')) tank.update(dt);
      if (owned.has('billar')) pool.update(dt, game);
      // luces
      const night = game.night;
      amb.intensity = 0.18 + 0.28 * night;
      let k = (level === 0 ? 0.7 : 1) * (0.7 + 0.3 * night);
      if (level === 0) {
        // la bombilla parpadea de vez en cuando
        flick -= dt;
        if (flick < -3 - rnd.next() * 4) flick = 0.25;
        if (flick > 0) k *= Math.sin(t * 60) > 0 ? 1 : 0.25;
        bulb.rotation.z = Math.sin(t * 1.3) * 0.05;
        bulb.rotation.x = Math.sin(t * 0.9) * 0.04;
        for (const d of drips) {
          d.t += dt;
          const period = 1.6;
          const ph = d.t % period;
          const fall = Math.max(0, ph - 0.6); // cuelga un poco antes de caer
          const y = H - 0.05 - 0.5 * 24 * fall * fall;
          if (y <= 0.32) {
            d.mesh.visible = false;
            if (!d.mesh.userData.splashed) {
              d.mesh.userData.splashed = true;
              game.mod.particles?.emit('glass', toWorld(V(d.x, d.z, 0.34)), { count: 4, scale: 0.55, speed: 0.3, color: ['#9fdcff', '#dff6ff'] });
            }
          } else {
            d.mesh.visible = true;
            d.mesh.userData.splashed = false;
            d.mesh.position.set(d.x, y, d.z);
          }
        }
      }
      L1.intensity = 18 * k;
      L2.intensity = 18 * k;
      if (level >= 2) {
        beltTex.offset.y -= dt * 0.35;
        for (const bx of beltBoxes) {
          bx.position.z += dt * 0.55;
          if (bx.position.z > 7.1) bx.position.z = 1.4;
          bx.visible = bx.position.z < 7.0;
        }
      }
      if (level >= 3) {
        const on = Math.floor(t * 3) % 2 === 0;
        bulbMatA.color.setScalar(on ? 1 : 0.35);
        bulbMatB.color.setScalar(on ? 0.35 : 1);
      }
      boardGlow.visible = true;
      (boardGlow.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(t * 2.5) * 0.08;
    },
  };
  refresh(false);
  return inst;
}

// ─────────────────────────────── billar ───────────────────────────────

const BALL_COLORS = ['#ffffff', '#ffd23f', '#1d4ed8', '#e63946', '#6c3bd1', '#ff7b1a', '#2a9d8f', '#8a1c1c', '#111111', '#ffd23f', '#1d4ed8', '#e63946', '#6c3bd1', '#ff7b1a', '#2a9d8f', '#8a1c1c'];
const PX = 1.18, PZ = 0.6, BR = 0.055; // medio largo, medio ancho del tapete y radio de bola
const POCKETS = [[-PX, -PZ], [0, -PZ - 0.02], [PX, -PZ], [-PX, PZ], [0, PZ + 0.02], [PX, PZ]];

function buildPool() {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  b.box(2.8, 0.12, 1.6, '#5a2a18', 0, 0.78, 0);
  b.box(2.5, 0.02, 1.3, '#1f8a4c', 0, 0.845, 0);
  // bandas
  b.box(2.8, 0.1, 0.16, '#6b3a1e', 0, 0.9, -0.72);
  b.box(2.8, 0.1, 0.16, '#6b3a1e', 0, 0.9, 0.72);
  b.box(0.16, 0.1, 1.6, '#6b3a1e', -1.32, 0.9, 0);
  b.box(0.16, 0.1, 1.6, '#6b3a1e', 1.32, 0.9, 0);
  for (const [x, z] of POCKETS) b.cyl(0.075, 0.075, 0.03, 10, '#0b0b0b', x, 0.86, z);
  for (const [x, z] of [[-1.2, -0.62], [1.2, -0.62], [-1.2, 0.62], [1.2, 0.62]]) b.box(0.18, 0.72, 0.18, '#4a2212', x, 0.36, z);
  // taco apoyado
  b.cyl(0.015, 0.025, 1.45, 6, '#e3c08a', 1.5, 0.72, 0.9, 0, 0, 0.35);
  // lámpara de billar
  b.box(1.6, 0.18, 0.4, '#1f6b3a', 0, 2.4, 0);
  b.box(0.02, 1.5, 0.02, '#1b1030', 0, 3.25, 0);
  group.add(meshOf(b, vertexColorMaterial, true, true));
  const lampGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.35).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff4c8', toneMapped: false }));
  lampGlow.position.y = 2.3;
  group.add(lampGlow);
  const balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(BR, 1), new THREE.MeshPhongMaterial({ shininess: 90, flatShading: true }), 16);
  const c = new THREE.Color();
  for (let i = 0; i < 16; i++) balls.setColorAt(i, c.set(BALL_COLORS[i]));
  balls.castShadow = true;
  balls.frustumCulled = false;
  group.add(balls);
  const pos = new Float32Array(32);
  const vel = new Float32Array(32);
  const sunk = new Uint8Array(16);
  const sinkT = new Float32Array(16);
  let moving = false;
  let doneCb: ((n: number, black: boolean) => void) | null = null;
  let timer = 0;
  let clickCd = 0;
  const rack = () => {
    pos[0] = -0.7;
    pos[1] = 0;
    let i = 1;
    for (let row = 0; row < 5; row++) for (let k = 0; k <= row; k++) {
      pos[i * 2] = 0.45 + row * BR * 1.8;
      pos[i * 2 + 1] = (k - row / 2) * BR * 2.05;
      i++;
    }
    vel.fill(0);
    sunk.fill(0);
    sinkT.fill(0);
  };
  const dm = new THREE.Object3D();
  const sync = () => {
    for (let i = 0; i < 16; i++) {
      const s = sunk[i] ? Math.max(0.001, 1 - sinkT[i] * 4) : 1;
      dm.position.set(pos[i * 2], 0.855 + BR - (sunk[i] ? sinkT[i] * 0.2 : 0), pos[i * 2 + 1]);
      dm.scale.setScalar(s);
      dm.updateMatrix();
      balls.setMatrixAt(i, dm.matrix);
    }
    balls.instanceMatrix.needsUpdate = true;
  };
  rack();
  sync();
  return {
    group,
    get busy() {
      return moving;
    },
    breakShot(onDone: (sunkCount: number, black: boolean) => void) {
      if (sunk.some((x) => x) || timer > 0) rack();
      vel[0] = 7 + rnd.next() * 1.5;
      vel[1] = (rnd.next() - 0.5) * 0.3;
      moving = true;
      doneCb = onDone;
      timer = 0.001;
    },
    update(dt: number, game: Game) {
      if (!moving) return;
      timer += dt;
      clickCd -= dt;
      const steps = 4;
      const h = Math.min(dt, 0.05) / steps;
      let energy = 0;
      for (let s = 0; s < steps; s++) {
        for (let i = 0; i < 16; i++) {
          if (sunk[i]) continue;
          const ix = i * 2;
          pos[ix] += vel[ix] * h;
          pos[ix + 1] += vel[ix + 1] * h;
          const sp = Math.hypot(vel[ix], vel[ix + 1]);
          const dec = Math.max(0, sp - (0.35 + sp * 0.6) * h);
          if (sp > 0) {
            vel[ix] *= dec / sp;
            vel[ix + 1] *= dec / sp;
          }
          // troneras
          for (const [px, pz] of POCKETS) {
            if (Math.hypot(pos[ix] - px, pos[ix + 1] - pz) < 0.085) {
              sunk[i] = 1;
              vel[ix] = vel[ix + 1] = 0;
              pos[ix] = px;
              pos[ix + 1] = pz;
              game.mod.audio?.play('drop', { volume: 0.35, pitch: 1.4 });
            }
          }
          if (sunk[i]) continue;
          // bandas
          if (pos[ix] < -PX + BR) (pos[ix] = -PX + BR), (vel[ix] = Math.abs(vel[ix]) * 0.8);
          if (pos[ix] > PX - BR) (pos[ix] = PX - BR), (vel[ix] = -Math.abs(vel[ix]) * 0.8);
          if (pos[ix + 1] < -PZ + BR) (pos[ix + 1] = -PZ + BR), (vel[ix + 1] = Math.abs(vel[ix + 1]) * 0.8);
          if (pos[ix + 1] > PZ - BR) (pos[ix + 1] = PZ - BR), (vel[ix + 1] = -Math.abs(vel[ix + 1]) * 0.8);
        }
        // choques entre bolas (elásticos, masas iguales)
        for (let i = 0; i < 16; i++) {
          if (sunk[i]) continue;
          for (let j = i + 1; j < 16; j++) {
            if (sunk[j]) continue;
            const dx = pos[j * 2] - pos[i * 2], dz = pos[j * 2 + 1] - pos[i * 2 + 1];
            const d = Math.hypot(dx, dz);
            if (d < BR * 2 && d > 1e-6) {
              const nx = dx / d, nz = dz / d;
              const overlap = BR * 2 - d;
              pos[i * 2] -= nx * overlap / 2;
              pos[i * 2 + 1] -= nz * overlap / 2;
              pos[j * 2] += nx * overlap / 2;
              pos[j * 2 + 1] += nz * overlap / 2;
              const rv = (vel[j * 2] - vel[i * 2]) * nx + (vel[j * 2 + 1] - vel[i * 2 + 1]) * nz;
              if (rv < 0) {
                const imp = -rv * 0.95;
                vel[i * 2] -= imp * nx;
                vel[i * 2 + 1] -= imp * nz;
                vel[j * 2] += imp * nx;
                vel[j * 2 + 1] += imp * nz;
                if (clickCd <= 0 && -rv > 0.3) {
                  clickCd = 0.05;
                  game.mod.audio?.play('click', { volume: Math.min(0.6, -rv * 0.2), pitch: 0.9 + rnd.next() * 0.3 });
                }
              }
            }
          }
        }
      }
      for (let i = 0; i < 16; i++) {
        if (sunk[i]) sinkT[i] += dt;
        else energy += Math.abs(vel[i * 2]) + Math.abs(vel[i * 2 + 1]);
      }
      sync();
      if ((energy < 0.02 && timer > 0.5) || timer > 12) {
        moving = false;
        vel.fill(0);
        let n = 0;
        for (let i = 1; i < 16; i++) n += sunk[i];
        const black = !!sunk[8];
        // la blanca, si se ha colado, vuelve a su sitio
        if (sunk[0]) {
          sunk[0] = 0;
          sinkT[0] = 0;
          pos[0] = -0.7;
          pos[1] = 0;
          sync();
        }
        const cb = doneCb;
        doneCb = null;
        cb?.(n, black);
      }
    },
  };
}

// ─────────────────────────────── instalación ───────────────────────────────

/** Registra la oficina de reparto como interior (puerta del POI 'office'). */
export function installOfficeInterior(game: Game): void {
  const def: InteriorDef = {
    id: 'office',
    name: 'la oficina',
    poi: (p) => p.kind === 'office',
    doorText: 'Entrar en la oficina',
    build: (ctx) => {
      const sc = buildOffice(ctx);
      game.mod.officeInterior = sc;
      return sc;
    },
  };
  let done = false;
  const tryRegister = () => {
    if (done) return;
    const ints = game.mod.interiors as Interiors | undefined;
    if (!ints) return;
    ints.register(def);
    done = true;
  };
  tryRegister();
  if (!done) game.addSystem({ name: 'office-install', update: () => tryRegister() });
}
