// EL ÁTICO de La Colina: tu casa. Se compra en la puerta (25.000 €), se decora con lujos desde la
// tablet de la entrada (aparecen en su sitio con un "¡tachán!") y en la cama se duerme hasta el día
// siguiente (cura y guarda). Dentro: ventanales con vistas al pueblo y al mar, suelo de mármol,
// cama redonda gigante, cocina americana, piano de cola blanco, telescopio y zona de garaje.
import * as THREE from 'three';
import type { Game } from '../../../core/game';
import type { Poi } from '../../../core/contracts';
import { GeoBuilder, vertexColorMaterial } from '../../../core/geo';
import { G } from '../../../core/physics';
import type { Interiors, InteriorContext, InteriorDef, InteriorInstance } from '../index';
import type { ShopItem } from '../../../ui/shop';
import { fmt } from '../../../gameplay/economy';
import {
  canvasTexture, texPlane, glowMaterial, haloTexture, meshOf, toast, pick, Fader, Seats, Popper, nearestSpot,
  playerLook, lookKey, outlinedText, marbleTexture, type Spot,
} from './kit';
import {
  ATTIC_ITEMS, buildSofa, buildTV, buildJacuzzi, buildAquarium, buildStatue, buildPainting, buildNeon, buildGarage,
  type TvCtl, type JacuzziCtl, type NeonCtl, type GarageCtl, type OwnedLike,
} from './luxuries';
import type { FishTank } from './kit';
import { buildAtticView, type AtticView } from './view';
import { PartyMusic } from './music';

export { ATTIC_ITEMS } from './luxuries';

export interface AtticState {
  owned: boolean;
  items: string[];
}

export const ATTIC_PRICE = 25000;
export const ATTIC_FAME = 150;

/** Fama de cada lujo: proporcional al precio (1 punto por cada 100 €). */
export function itemFame(price: number): number {
  return Math.round(price / 100);
}

// Medidas de la casa (metros, coordenadas locales: x este, z sur; suelo en y = 0)
const W = 24, D = 18, H = 4.6;
const V = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);

const P = {
  exit: V(23.2, 9),
  spawn: V(20.4, 9),
  panel: V(22.3, 6.1),
  bed: V(8.75, 5.1),
  fridge: V(23.1, 1.4),
  telescope: V(1.35, 9.4),
  piano: V(3.0, 2.9),
  sofa: V(8.75, 14.0),
  sofaSeat: V(8.75, 13.3),
  sofaStand: V(8.75, 12.15),
  tv: V(8.75, 8.08, 1.92),
  jacuzzi: V(3.4, 14.6),
  aquarium: V(16.35, 15.1),
  statue: V(17.6, 9),
  paintings: { cuadro1: V(8.0, 17.93, 2.35), cuadro2: V(11.2, 17.93, 2.35), cuadro3: V(14.25, 17.93, 2.35) } as Record<string, THREE.Vector3>,
  garage: [V(18.7, 14.0), V(20.7, 14.0), V(22.7, 14.0), V(18.7, 16.6), V(20.7, 16.6), V(22.7, 16.6)],
  partySwitch: V(23.85, 11.3, 1.35),
};

const DREAMS = [
  'Sueñas que un paquete te persigue por el puerto…',
  'Sueñas que la abuela Puri te paga en billetes. Qué pesadilla tan rara.',
  'Sueñas con una furgoneta que aparca sola. Y bien.',
  'Sueñas que Los Devueltos te devuelven la cartera. Con intereses.',
  'Sueñas que eres un paquete FRÁGIL. Y te han tirado por la ventana.',
  'Sueñas que el cliente estaba en casa a la primera.',
];
const FRIDGE = [
  'Un yogur caducado, salsa de soja y una lechuga con ansiedad. +10 de vida.',
  'Champán, caviar… y tu táper de lentejas de hace un mes. +10 de vida.',
  'Te comes un flan de pie, con la puerta abierta, como un campeón. +10 de vida.',
  'Hielo, hielo y más hielo. Muy de rico. Chupas uno. +10 de vida.',
];
const TELESCOPE = [
  'Ves a Los Devueltos intentando aparcar la furgoneta. Llevan veinte minutos.',
  'Ves a una abuela contando céntimos en el puerto. Te suena de algo.',
  'Ves tu furgoneta a lo lejos. Tiene una multa. Qué raro.',
  'Ves un barco que se llama «Contra Reembolso II». Tuyo no es. De momento.',
  'El vecino de enfrente te mira con otro telescopio. Incómodo.',
  'Ves el faro. El faro te ve a ti. Tablas.',
];
const STATUE = [
  'Qué porte. Qué brillo. Qué humildad.',
  'La estatua sale más guapa que tú. Normal: es de oro.',
  'Placa: «AL MEJOR REPARTIDOR DE LA HISTORIA (DE ESTA CASA)».',
  'Le das brillo con la manga. Ahora se ve tu huella. Perfecto.',
];
const FISH = [
  'Les echas de comer. El pez paquete se lleva la mitad.',
  'Los peces te miran como a un dios. Un dios con pienso.',
  'Un pez te hace una pedorreta. Crees.',
];
const GARAGE = [
  'Tus maquetas, relucientes. Ninguna tiene multas. Todavía.',
  'Soplas el polvo de la furgoneta en miniatura. Te emocionas un poco.',
  'Una colección digna de museo. De museo de barrio, pero museo.',
];

// ─────────────────────────────── el objeto Ático ───────────────────────────────

export class Attic {
  owned = false;
  readonly items = new Set<string>();
  /** El escenario construido (solo existe tras entrar la primera vez). */
  scene: AtticScene | null = null;
  sleeping = false;
  private fader: Fader;

  constructor(private game: Game) {
    game.mod.attic = this;
    this.fader = new Fader(game);
  }

  getState(): AtticState {
    return { owned: this.owned, items: [...this.items] };
  }

  setState(s: Partial<AtticState> | null | undefined) {
    this.owned = !!s?.owned;
    this.items.clear();
    for (const id of s?.items ?? []) if (ATTIC_ITEMS.some((i) => i.id === id)) this.items.add(id);
    this.scene?.apply(false);
  }

  has(id: string) {
    return this.items.has(id);
  }

  private get eco() {
    return this.game.mod.economy;
  }

  /** La pista de la puerta mientras no es tuyo: «Ático en venta: 25.000 €» y E para comprarlo. */
  doorOffer(): { text: string; run: () => void } | null {
    if (this.owned) return null;
    const g = this.game;
    const p = g.mod.player;
    if (!p || p.state !== 'foot' || g.mod.interiors?.inside || !g.world) return null;
    const poi = g.world.pois.find((q: Poi) => q.kind === 'attic');
    if (!poi) return null;
    if (p.position.distanceTo(poi.door) < 3 && Math.abs(p.position.y - poi.door.y) < 3) {
      return { text: `Ático en venta: ${fmt(ATTIC_PRICE)}`, run: () => this.openBuy() };
    }
    return null;
  }

  openBuy() {
    const ui = this.game.mod.shopUI;
    if (!ui) {
      toast(this.game, `Ático en venta: ${fmt(ATTIC_PRICE)}`);
      return;
    }
    ui.open({
      title: 'Ático Vistas al Mar',
      subtitle: 'Inmobiliaria Ladrillazo · Última planta de La Colina, con terraza y vistas al puerto',
      color: '#ffd23f',
      icon: '🏠',
      sections: () => [
        {
          title: 'En venta',
          items: [
            {
              id: 'atico', icon: '🌅', name: 'Ático de lujo en La Colina',
              desc: `200 m², terraza, suelo de mármol, cama redonda y ascensor dorado. Vecinos ricos y cotillas incluidos. +${ATTIC_FAME} de FAMA.`,
              price: this.owned ? 0 : ATTIC_PRICE, owned: this.owned, label: this.owned ? 'Tuyo' : 'Comprar', disabled: this.owned,
              buy: () => this.buy(),
            },
          ],
        },
        {
          title: 'La letra pequeña',
          items: [
            { id: 'letra1', icon: '📜', name: 'Gastos de comunidad', desc: 'Cero euros. El portero te hace la ola cada vez que entras.', price: 0, label: '—', disabled: true, buy: () => false },
            { id: 'letra2', icon: '🐟', name: 'Mascotas', desc: 'Se permiten peces. Los peces no vienen incluidos (se compran dentro).', price: 0, label: '—', disabled: true, buy: () => false },
            { id: 'letra3', icon: '🛋️', name: 'Se entrega vacío', desc: 'Los muebles de lujo se compran en la tablet de la entrada. Pagas tú, obviamente.', price: 0, label: '—', disabled: true, buy: () => false },
          ],
        },
      ],
    });
  }

  /** Comprar el ático. */
  buy(): boolean {
    const g = this.game;
    if (this.owned) return false;
    const eco = this.eco;
    if (!eco || !eco.spend(ATTIC_PRICE, 'ático')) return false;
    this.owned = true;
    eco.addFame(ATTIC_FAME, 'ático');
    toast(g, '¡El ático es tuyo! Pulsa E en la puerta para entrar', '#ffd23f', 3.5);
    g.events.emit('notify', {
      from: 'Inmobiliaria Ladrillazo', icon: '🏠', title: 'Ático vendido',
      text: 'Enhorabuena por su compra. Las vistas no incluyen a los vecinos. Las llaves están debajo del felpudo (el que pone «HOLA, JEFE»).',
    });
    g.events.emit('attic:bought' as any, {} as any);
    g.mod.audio?.play('success');
    g.mod.save?.save(true);
    return true;
  }

  openDecor() {
    const g = this.game;
    const ui = g.mod.shopUI;
    if (!ui) return;
    const card = (d: (typeof ATTIC_ITEMS)[number]): ShopItem => {
      const has = this.items.has(d.id);
      return {
        id: d.id, icon: d.icon, name: d.name, desc: `${d.desc} +${itemFame(d.price)} de FAMA.`,
        price: has ? 0 : d.price, owned: has, label: has ? 'Tuyo' : 'Comprar', disabled: has,
        buy: () => this.buyItem(d.id),
      };
    };
    ui.open({
      title: 'Decoración del ático',
      subtitle: 'Cada capricho sube la FAMA y aparece en su sitio en cuanto cierras la tienda',
      color: '#ff4f81',
      icon: '🛋️',
      sections: () => [
        { title: 'Caprichos de rico', items: ATTIC_ITEMS.filter((i) => !i.art).map(card) },
        { title: 'Arte para el salón (1.500 € cada cuadro)', items: ATTIC_ITEMS.filter((i) => i.art).map(card) },
      ],
    });
  }

  buyItem(id: string): boolean {
    const d = ATTIC_ITEMS.find((i) => i.id === id);
    const eco = this.eco;
    if (!d || this.items.has(id) || !eco) return false;
    if (!eco.spend(d.price, 'decoración')) return false;
    this.items.add(id);
    eco.addFame(itemFame(d.price), 'lujo ático');
    this.scene?.show(id, true);
    toast(this.game, `¡${d.name.replace(/[«»]/g, '')} para tu ático!`, '#ff4f81', 2.4);
    this.game.mod.save?.save(true);
    return true;
  }

  /** Dormir: fundido a negro, a las 8:00 del día siguiente, vida a tope y partida guardada. */
  sleep() {
    const g = this.game;
    const p = g.mod.player;
    if (!p || this.sleeping || p.state !== 'foot') return;
    this.sleeping = true;
    p.state = 'busy';
    p.velocity.set(0, 0, 0);
    g.input.enabled = false;
    g.input.releaseAll();
    this.fader.show('Zzz…', pick(DREAMS));
    g.mod.audio?.play('whoosh', { volume: 0.5 });
    window.setTimeout(() => {
      const c = g.clock;
      // si ya ha pasado la medianoche, el día nuevo ya empezó: te despiertas a las 8 de hoy
      const nextDay = c.hour >= 6;
      if (nextDay) c.day++;
      c.hour = 8;
      g.mod.dayNight?.setHour?.(8);
      if (nextDay) g.events.emit('newday', { day: c.day });
      p.health = p.maxHealth;
      p.stamina = 100;
      // te levantas al lado de la cama
      const sc = this.scene;
      if (sc) {
        p.teleport(sc.toWorld(V(8.75, 2.2)), Math.PI);
      }
      window.setTimeout(() => {
        this.fader.hide();
        if (p.state === 'busy') p.state = 'foot';
        g.input.enabled = true;
        this.sleeping = false;
        toast(g, `¡Buenos días! Día ${c.day}, 08:00. Vida a tope.`, '#ffd23f', 3);
        g.mod.audio?.play('success', { volume: 0.6 });
        g.mod.save?.save(false);
      }, 1700);
    }, 1100);
  }

  /** Para pruebas: ático comprado y todo el lujo puesto. */
  debugAll() {
    this.owned = true;
    for (const i of ATTIC_ITEMS) this.items.add(i.id);
    this.scene?.apply(false);
  }
}

// ─────────────────────────────── texturas de la casa ───────────────────────────────

function leopardTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#e8b04a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 8 + Math.random() * 12;
      g.fillStyle = '#b8742a';
      g.beginPath();
      g.ellipse(x, y, r, r * 0.8, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#2b1b0f';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(x, y, r, Math.random() * 3, Math.random() * 3 + 4);
      g.stroke();
    }
    g.strokeStyle = '#1b1030';
    g.lineWidth = 16;
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 8, 0, Math.PI * 2);
    g.stroke();
  });
}

function garageFloorTexture(showroom: boolean): THREE.CanvasTexture {
  return canvasTexture(512, 424, (g, w, h) => {
    if (showroom) {
      const n = 12;
      const s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < Math.ceil(h / s); j++) {
        g.fillStyle = (i + j) % 2 ? '#1b1030' : '#f4f1e8';
        g.fillRect(i * s, j * s, s, s);
      }
      g.strokeStyle = '#d4af37';
      g.lineWidth = 8;
      g.strokeRect(4, 4, w - 8, h - 8);
    } else {
      g.fillStyle = '#9a9aa2';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) {
        g.fillStyle = `rgba(${60 + Math.random() * 60},${60 + Math.random() * 60},${70 + Math.random() * 60},0.15)`;
        g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      }
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 7;
      for (let i = 1; i < 3; i++) {
        g.beginPath();
        g.moveTo((i * w) / 3, h * 0.3);
        g.lineTo((i * w) / 3, h);
        g.stroke();
      }
      // mancha de aceite
      g.fillStyle = 'rgba(20,16,30,0.55)';
      g.beginPath();
      g.ellipse(w * 0.5, h * 0.7, 40, 24, 0.3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function noteTexture(lines: string[], bg = '#fff27a', w = 256, h = 256): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, 0, w, 26);
    g.fillStyle = '#1b1030';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${Math.round(w / 9)}px 'Comic Sans MS', 'Chalkboard SE', system-ui, sans-serif`;
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (w / 7.5)));
  });
}

function signTexture(title: string, sub: string, bg: string, fg: string): THREE.CanvasTexture {
  return canvasTexture(512, 192, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 8;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = fg;
    g.font = '900 64px system-ui, sans-serif';
    g.fillText(title, w / 2, h * 0.42);
    g.font = '700 26px system-ui, sans-serif';
    g.fillText(sub, w / 2, h * 0.76);
  });
}

// ─────────────────────────────── el escenario ───────────────────────────────

interface ItemParts {
  group: THREE.Object3D | null;
  /** Crece con rebote al aparecer (false para grupos repartidos por la sala). */
  grow: boolean;
  colliders: { setEnabled(on: boolean): void }[];
  placeholder: THREE.Object3D | null;
  confetti: THREE.Vector3;
}

export interface AtticScene extends InteriorInstance {
  apply(pop: boolean): void;
  show(id: string, pop: boolean): void;
  toWorld(l: THREE.Vector3): THREE.Vector3;
  /** Para pruebas: cámara fija mirando a un punto. */
  lookFrom(from: THREE.Vector3, at: THREE.Vector3): void;
  partyOn(): void;
  readonly party: boolean;
}

function buildAtticScene(ctx: InteriorContext, attic: Attic): AtticScene {
  const game = ctx.game;
  const root = ctx.root;
  const O = ctx.origin;
  const phys = game.physics;
  const toWorld = (l: THREE.Vector3) => l.clone().add(O);
  const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY = 0) =>
    phys.addStaticBox(O.x + cx, O.y + cy, O.z + cz, hx, hy, hz, rotY, G.STATIC);
  const cyl = (cx: number, cz: number, hh: number, r: number, y0 = 0) => phys.addStaticCylinder(O.x + cx, O.y + y0 + hh, O.z + cz, hh, r, G.STATIC);

  const lam = vertexColorMaterial;
  const shiny = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 60, specular: '#5a4a30' });
  const glowVC = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

  // ── Colisores fijos: suelo, techo, paredes ──
  box(W / 2, -0.25, D / 2, W / 2 + 0.5, 0.25, D / 2 + 0.5);
  box(W / 2, H + 0.25, D / 2, W / 2 + 0.5, 0.25, D / 2 + 0.5);
  box(-0.15, H / 2, D / 2, 0.15, H / 2, D / 2 + 0.3);
  box(W + 0.15, H / 2, D / 2, 0.15, H / 2, D / 2 + 0.3);
  box(W / 2, H / 2, -0.15, W / 2 + 0.3, H / 2, 0.15);
  box(W / 2, H / 2, D + 0.15, W / 2 + 0.3, H / 2, 0.15);

  // ── Suelo de mármol ──
  const mt = marbleTexture();
  mt.repeat.set(W / 3, D / 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ map: mt, shininess: 40, specular: '#3a3530' }));
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  root.add(floor);

  // ── Paredes, techo, ventanales ──
  const b = new GeoBuilder();
  const wall = '#fbf1e4', gold = '#d4af37', frame = '#23222e';
  // paredes macizas (la cara de dentro es la que se ve)
  b.box(12.3, H, 0.3, wall, 18.15, H / 2, -0.15); // norte (cocina)
  b.box(0.3, H, D + 0.6, wall, W + 0.15, H / 2, D / 2); // este (entrada)
  b.box(18.3, H, 0.3, wall, 15.15, H / 2, D + 0.15); // sur (galería)
  // rodapié y moldura dorados
  b.box(12.0, 0.14, 0.04, gold, 18.0, 0.07, 0.02);
  b.box(0.04, 0.14, D, gold, W - 0.02, 0.07, D / 2);
  b.box(18.0, 0.14, 0.04, gold, 15.0, 0.07, D - 0.02);
  b.box(12.0, 0.1, 0.1, gold, 18.0, H - 0.05, 0.05);
  b.box(0.1, 0.1, D, gold, W - 0.05, H - 0.05, D / 2);
  b.box(18.0, 0.1, 0.1, gold, 15.0, H - 0.05, D - 0.05);
  // ventanales: montantes y marcos (oeste entero, norte hasta x=12, sur hasta x=6)
  for (let z = 0; z <= D + 0.01; z += 3) b.box(0.12, H, 0.12, frame, 0, H / 2, z);
  for (let x = 3; x <= 12.01; x += 3) b.box(0.12, H, 0.12, frame, x, H / 2, 0);
  for (let x = 3; x <= 6.01; x += 3) b.box(0.12, H, 0.12, frame, x, H / 2, D);
  b.box(0.16, 0.14, D, frame, 0, 0.07, D / 2);
  b.box(0.16, 0.2, D, frame, 0, H - 0.1, D / 2);
  b.box(12, 0.14, 0.16, frame, 6, 0.07, 0);
  b.box(12, 0.2, 0.16, frame, 6, H - 0.1, 0);
  b.box(6, 0.14, 0.16, frame, 3, 0.07, D);
  b.box(6, 0.2, 0.16, frame, 3, H - 0.1, D);
  // tabique cama/tele (morado por el lado de la cama, blanco por el de la tele)
  b.box(6.7, H, 0.14, '#6c3bd1', 8.75, H / 2, 7.77);
  b.box(6.7, H, 0.16, '#ffffff', 8.75, H / 2, 7.92);
  b.box(0.12, H, 0.36, gold, 5.4, H / 2, 7.85);
  b.box(0.12, H, 0.36, gold, 12.1, H / 2, 7.85);
  b.box(6.7, 0.1, 0.36, gold, 8.75, H - 0.05, 7.85);
  box(8.75, H / 2, 7.85, 3.35, H / 2, 0.18);
  const shell = meshOf(b, lam, true, true);
  root.add(shell);
  // techo aparte, con un poco de luz propia (si no, de día sale marrón)
  const ceilMat = new THREE.MeshLambertMaterial({ color: '#fffaf3', emissive: '#9a8f84', emissiveIntensity: 0.5 });
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.3, D + 0.6), ceilMat);
  ceiling.position.set(W / 2, H + 0.15, D / 2);
  ceiling.castShadow = true;
  root.add(ceiling);

  // cristales (un solo material transparente)
  const glassMat = new THREE.MeshBasicMaterial({ color: '#cdefff', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const gW = new THREE.Mesh(new THREE.PlaneGeometry(D, H).rotateY(Math.PI / 2), glassMat);
  gW.position.set(0, H / 2, D / 2);
  const gN = new THREE.Mesh(new THREE.PlaneGeometry(12, H), glassMat);
  gN.position.set(6, H / 2, 0);
  const gS = new THREE.Mesh(new THREE.PlaneGeometry(6, H), glassMat);
  gS.position.set(3, H / 2, D);
  for (const m of [gW, gN, gS]) {
    m.renderOrder = 3;
    root.add(m);
  }

  // ── La vista ──
  const view: AtticView = buildAtticView(game, root);

  // ── Muebles fijos ──
  const f = new GeoBuilder();
  const gl = new GeoBuilder(); // cosas que brillan (bombillas, pantallas)
  // cama redonda gigante con cabecero de corazón
  const bx = P.bed.x, bz = P.bed.z;
  f.cyl(2.55, 2.6, 0.15, 32, '#f1ece6', bx, 0.075, bz);
  f.cyl(2.25, 2.25, 0.36, 32, gold, bx, 0.33, bz);
  f.cyl(2.2, 2.2, 0.3, 32, '#ffd1e3', bx, 0.66, bz);
  f.cyl(2.24, 2.24, 0.1, 32, '#ff4f81', bx, 0.83, bz - 0.05);
  f.add(new THREE.TorusGeometry(1.5, 0.05, 6, 32), gold, bx, 0.89, bz - 0.2, Math.PI / 2, 0, 0);
  // almohadas corazón
  for (const [dx, c] of [[-0.9, '#ff1744'], [0, '#ffffff'], [0.9, '#ff1744']] as [number, string][]) {
    f.sphere(0.42, c, bx + dx, 1.08, bz + 1.55, 1, 1, 0.55, 0.35);
  }
  // cabecero corazón acolchado sobre el tabique
  const hz = 7.62;
  f.cyl(1.08, 1.08, 0.24, 20, gold, bx - 0.78, 2.35, hz, Math.PI / 2, 0, 0);
  f.cyl(1.08, 1.08, 0.24, 20, gold, bx + 0.78, 2.35, hz, Math.PI / 2, 0, 0);
  f.box(1.95, 1.95, 0.24, gold, bx, 1.55, hz, 0, 0, Math.PI / 4);
  f.cyl(0.95, 0.95, 0.3, 20, '#c2185b', bx - 0.78, 2.35, hz - 0.04, Math.PI / 2, 0, 0);
  f.cyl(0.95, 0.95, 0.3, 20, '#c2185b', bx + 0.78, 2.35, hz - 0.04, Math.PI / 2, 0, 0);
  f.box(1.72, 1.72, 0.3, '#c2185b', bx, 1.6, hz - 0.04, 0, 0, Math.PI / 4);
  for (let i = 0; i < 6; i++) f.sphere(0.06, gold, bx - 1.2 + i * 0.48, 2.0 + (i % 2) * 0.5, hz - 0.2, 0);
  cyl(bx, bz, 0.4, 2.25);
  // mesitas con lámparas
  for (const x of [5.95, 11.55]) {
    f.box(0.7, 0.55, 0.55, '#ffffff', x, 0.275, 6.9);
    f.box(0.74, 0.04, 0.6, gold, x, 0.57, 6.9);
    f.cyl(0.05, 0.12, 0.35, 8, gold, x, 0.76, 6.9);
    gl.cyl(0.16, 0.26, 0.32, 10, '#ffe6b0', x, 1.08, 6.9);
    box(x, 0.3, 6.9, 0.35, 0.3, 0.28);
  }
  // piano de cola blanco (esquina noroeste)
  const pz = P.piano.z, px = P.piano.x;
  f.box(1.55, 0.35, 2.1, '#ffffff', px, 0.95, pz);
  f.box(1.5, 0.28, 0.8, '#ffffff', px - 0.5, 0.95, pz + 1.2, 0, 0.5, 0);
  f.box(1.45, 0.05, 1.7, '#fafafa', px, 1.5, pz - 0.2, 0.45, 0, 0);
  f.box(1.35, 0.06, 0.24, '#ffffff', px, 0.84, pz - 1.12);
  for (let k = 0; k < 14; k++) f.box(0.085, 0.02, 0.2, '#fefefe', px - 0.6 + k * 0.093, 0.885, pz - 1.14);
  for (let k = 0; k < 10; k++) if (k % 7 !== 2 && k % 7 !== 6) f.box(0.05, 0.03, 0.12, '#111111', px - 0.55 + k * 0.13, 0.9, pz - 1.1);
  for (const [lx, lz] of [[-0.6, -0.8], [0.6, -0.8], [0, 0.9]]) f.cyl(0.06, 0.05, 0.78, 6, '#ffffff', px + lx, 0.39, pz + lz);
  f.box(1.1, 0.45, 0.4, '#ffffff', px, 0.225, pz - 1.7);
  f.cyl(0.02, 0.02, 0.3, 6, gold, px + 0.35, 1.2, pz + 0.3, 0.6, 0, 0);
  box(px, 0.8, pz, 0.8, 0.8, 1.1);
  // telescopio dorado
  const tx = P.telescope.x, tz = P.telescope.z;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    f.cyl(0.02, 0.03, 1.3, 5, '#2b2d42', tx + Math.cos(a) * 0.25, 0.62, tz + Math.sin(a) * 0.25, Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
  }
  f.cyl(0.14, 0.08, 1.25, 10, gold, tx - 0.15, 1.42, tz, 0, 0, 1.15);
  f.cyl(0.155, 0.155, 0.12, 10, '#1b1030', tx - 0.7, 1.68, tz, 0, 0, 1.15);
  f.cyl(0.05, 0.05, 0.2, 8, '#1b1030', tx + 0.45, 1.15, tz, 0, 0, 1.15);
  cyl(tx, tz, 0.7, 0.3);
  // butacas redondas de terciopelo junto al ventanal
  for (const [x, z] of [[2.0, 6.6], [2.3, 11.6]] as [number, number][]) {
    f.cyl(0.5, 0.46, 0.4, 16, '#ff4f81', x, 0.3, z);
    f.cyl(0.46, 0.46, 0.1, 16, '#ff8fb8', x, 0.55, z);
    f.add(new THREE.TorusGeometry(0.46, 0.15, 6, 16, Math.PI * 1.25), '#e0457b', x, 0.62, z, Math.PI / 2, 0, -Math.PI * 0.625);
    f.add(new THREE.TorusGeometry(0.44, 0.13, 6, 14, Math.PI * 0.8), '#e0457b', x, 0.86, z, Math.PI / 2, 0, -Math.PI * 0.4);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.78;
      f.cyl(0.03, 0.02, 0.12, 5, gold, x + Math.cos(a) * 0.35, 0.06, z + Math.sin(a) * 0.35);
    }
    cyl(x, z, 0.5, 0.55);
  }
  // cocina americana (pared norte)
  f.box(9.0, 0.9, 0.7, '#ffffff', 17.9, 0.45, 0.35);
  f.box(9.1, 0.06, 0.76, '#1b1030', 17.9, 0.93, 0.38);
  for (let k = 0; k < 9; k++) f.box(0.35, 0.03, 0.03, gold, 13.9 + k, 0.8, 0.72);
  f.box(0.8, 0.02, 0.5, '#8a8f99', 16.0, 0.965, 0.38);
  f.cyl(0.02, 0.02, 0.35, 6, gold, 16.0, 1.12, 0.12);
  f.box(0.02, 0.02, 0.25, gold, 16.0, 1.29, 0.24);
  f.box(1.2, 0.02, 0.6, '#111118', 19.6, 0.965, 0.38);
  f.box(9.0, 0.9, 0.42, '#ffffff', 17.9, 2.25, 0.21);
  for (let k = 0; k < 10; k++) f.box(0.02, 0.84, 0.02, '#e4dccf', 13.4 + k * 1.0, 2.25, 0.43);
  for (let k = 0; k < 9; k++) f.box(0.3, 0.03, 0.03, gold, 13.9 + k, 1.9, 0.44);
  f.box(9.04, 0.04, 0.44, gold, 17.9, 1.78, 0.22);
  f.taperBox(1.4, 0.6, 0.6, '#c9ccd1', 19.6, 1.55, 0.3, 0.2, 0, 0.35);
  f.box(0.34, 0.9, 0.3, '#c9ccd1', 19.6, 2.25, 0.15);
  gl.box(8.8, 0.03, 0.05, '#ff7ab8', 17.9, 1.79, 0.45);
  box(17.9, 0.5, 0.36, 4.55, 0.5, 0.4);
  // nevera americana
  f.box(1.3, 2.3, 0.82, '#d8dde3', 23.1, 1.15, 0.41);
  f.box(0.02, 2.2, 0.02, '#8a8f99', 23.1, 1.15, 0.83);
  f.box(0.04, 0.8, 0.06, gold, 23.0, 1.3, 0.86);
  f.box(0.04, 0.8, 0.06, gold, 23.2, 1.3, 0.86);
  f.box(0.34, 0.24, 0.02, '#ff4f81', 22.75, 1.7, 0.83);
  box(23.1, 1.15, 0.41, 0.65, 1.15, 0.42);
  // isla con taburetes, frutero y champán
  f.box(4.2, 0.95, 1.2, '#ffffff', 18.2, 0.475, 3.8);
  f.box(4.4, 0.08, 1.36, '#1b1030', 18.2, 0.99, 3.8);
  f.box(4.42, 0.04, 1.38, gold, 18.2, 0.94, 3.8);
  f.cyl(0.26, 0.14, 0.14, 10, gold, 17.4, 1.1, 3.75);
  for (const [dx, c] of [[-0.08, '#e63946'], [0.08, '#ffd23f'], [0, '#7cc243']] as [number, string][]) f.sphere(0.09, c, 17.4 + dx, 1.2, 3.75 + dx, 0);
  f.cyl(0.14, 0.12, 0.26, 10, '#c9ccd1', 19.1, 1.16, 3.85);
  f.cyl(0.045, 0.05, 0.4, 6, '#1f6b3a', 19.12, 1.3, 3.85, 0.3, 0, 0);
  box(18.2, 0.5, 3.8, 2.2, 0.5, 0.68);
  for (const x of [16.9, 18.2, 19.5]) {
    f.cyl(0.24, 0.24, 0.1, 10, '#ff4f81', x, 0.78, 5.0);
    f.cyl(0.03, 0.03, 0.72, 6, gold, x, 0.37, 5.0);
    f.cyl(0.2, 0.22, 0.03, 10, gold, x, 0.015, 5.0);
    cyl(x, 5.0, 0.4, 0.22);
  }
  // lámparas colgantes sobre la isla
  for (const x of [17.1, 18.2, 19.3]) {
    f.cyl(0.01, 0.01, 1.6, 4, '#1b1030', x, H - 0.8, 3.8);
    f.cyl(0.05, 0.25, 0.3, 10, gold, x, H - 1.7, 3.8);
    gl.sphere(0.09, '#fff1c8', x, H - 1.88, 3.8, 1);
  }
  // ascensor dorado (entrada, pared este)
  f.box(0.1, 3.2, 2.9, '#1b1030', W - 0.05, 1.6, 9);
  f.box(0.06, 2.8, 1.08, gold, W - 0.1, 1.4, 8.45);
  f.box(0.06, 2.8, 1.08, gold, W - 0.1, 1.4, 9.55);
  f.box(0.07, 2.8, 0.03, '#8a6d1c', W - 0.11, 1.4, 9.0);
  f.box(0.08, 0.32, 0.18, '#1b1030', W - 0.1, 1.3, 10.75);
  gl.sphere(0.04, '#ffd23f', W - 0.16, 1.36, 10.75, 0);
  gl.sphere(0.04, '#ffd23f', W - 0.16, 1.24, 10.75, 0);
  // felpudo
  const mat = texPlane(1.8, 1.0, canvasTexture(256, 144, (g, w, h) => {
    g.fillStyle = '#6c3bd1';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#ffd23f';
    g.font = '900 38px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('HOLA, JEFE', w / 2, h / 2);
  }));
  mat.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  mat.position.set(22.7, 0.006, 9);
  mat.receiveShadow = true;
  root.add(mat);
  // tablet de decoración
  const pnl = P.panel;
  f.cyl(0.05, 0.05, 1.1, 8, gold, pnl.x, 0.55, pnl.z);
  f.cyl(0.3, 0.34, 0.05, 12, gold, pnl.x, 0.025, pnl.z);
  f.box(0.08, 0.66, 0.95, '#1b1030', pnl.x, 1.3, pnl.z, 0, 0, 0.35);
  cyl(pnl.x, pnl.z, 0.6, 0.3);
  const tabTex = canvasTexture(256, 180, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#ff4f81');
    gr.addColorStop(1, '#6c3bd1');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 30px system-ui';
    outlinedText(g, 'DECORACIÓN', w / 2, 40, '#ffd23f', '#1b1030', 6);
    g.font = '42px system-ui';
    g.fillText('🛋️ 📺 🛁 🐠', w / 2, 100);
    g.font = '800 17px system-ui';
    g.fillStyle = '#ffffff';
    g.fillText('Pulsa E y gasta sin miedo', w / 2, 152);
  });
  const tab = texPlane(0.86, 0.6, tabTex, true);
  tab.position.set(pnl.x - 0.05, 1.31, pnl.z);
  tab.rotation.set(0, -Math.PI / 2, 0);
  tab.rotateX(-0.35);
  root.add(tab);
  const tabGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.5), glowMaterial(haloTexture(), '#ff4f81', 0.35));
  tabGlow.position.set(pnl.x - 0.1, 1.3, pnl.z);
  tabGlow.rotation.y = -Math.PI / 2;
  root.add(tabGlow);
  // peana de la estatua (la estatua se compra)
  const st = P.statue;
  f.cyl(0.72, 0.8, 1.0, 16, '#f1ece6', st.x, 0.5, st.z);
  f.cyl(0.8, 0.8, 0.06, 16, gold, st.x, 1.03, st.z);
  f.cyl(0.86, 0.86, 0.06, 16, gold, st.x, 0.03, st.z);
  cyl(st.x, st.z, 0.55, 0.8);
  // mesa baja del salón (cristal y oro)
  f.box(1.9, 0.05, 0.95, '#bfe9ff', 8.75, 0.42, 11.0);
  f.box(1.7, 0.36, 0.08, gold, 8.75, 0.2, 11.0);
  f.box(0.08, 0.36, 0.8, gold, 8.0, 0.2, 11.0);
  f.box(0.08, 0.36, 0.8, gold, 9.5, 0.2, 11.0);
  f.cyl(0.12, 0.1, 0.18, 8, '#ff4f81', 8.4, 0.54, 11.0);
  f.box(0.5, 0.06, 0.34, '#1b1030', 9.2, 0.47, 10.9, 0, 0.3, 0);
  box(8.75, 0.22, 11.0, 0.95, 0.22, 0.48);
  // plantas en macetas doradas
  for (const [x, z] of [[13.0, 0.7], [6.3, 17.3], [15.6, 11.9], [0.8, 17.2], [23.3, 3.2]]) {
    f.cyl(0.38, 0.28, 0.7, 10, gold, x, 0.35, z);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      f.sphere(0.34, k % 2 ? '#2f9e4f' : '#3fb85f', x + Math.cos(a) * 0.3, 1.0 + (k % 3) * 0.25, z + Math.sin(a) * 0.3, 0, 1, 0.35, 1.4);
    }
    cyl(x, z, 0.5, 0.35);
  }
  // lámpara de araña (salón) y focos del techo
  const ch = { x: 8.75, z: 11.8 };
  f.cyl(0.02, 0.02, 0.6, 4, gold, ch.x, H - 0.3, ch.z);
  f.add(new THREE.TorusGeometry(0.9, 0.05, 6, 24), gold, ch.x, H - 0.9, ch.z, Math.PI / 2, 0, 0);
  f.add(new THREE.TorusGeometry(0.55, 0.04, 6, 20), gold, ch.x, H - 1.25, ch.z, Math.PI / 2, 0, 0);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    gl.add(new THREE.OctahedronGeometry(0.07), '#eaf7ff', ch.x + Math.cos(a) * 0.9, H - 1.08, ch.z + Math.sin(a) * 0.9, 0, 0, 0, 1, 2, 1);
    gl.sphere(0.06, '#fff1c8', ch.x + Math.cos(a) * 0.9, H - 0.82, ch.z + Math.sin(a) * 0.9, 0);
    if (k % 2) gl.add(new THREE.OctahedronGeometry(0.06), '#eaf7ff', ch.x + Math.cos(a) * 0.55, H - 1.4, ch.z + Math.sin(a) * 0.55, 0, 0, 0, 1, 2.2, 1);
  }
  gl.add(new THREE.OctahedronGeometry(0.16), '#eaf7ff', ch.x, H - 1.6, ch.z, 0, 0, 0, 1, 2, 1);
  for (let x = 3; x < W; x += 4) for (let z = 2.5; z < D; z += 4) {
    if (Math.hypot(x - ch.x, z - ch.z) < 2) continue;
    gl.cyl(0.12, 0.12, 0.02, 10, '#fff4dc', x, H - 0.01, z);
  }
  // alfombra de leopardo
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.7, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: leopardTexture() }));
  rug.position.set(8.75, 0.008, 11.8);
  rug.receiveShadow = true;
  root.add(rug);

  const furniture = meshOf(f, shiny, true, true);
  root.add(furniture);
  const glowMesh = new THREE.Mesh(gl.build(), glowVC);
  root.add(glowMesh);
  // halos de las lámparas
  const halos = new THREE.Group();
  for (const [x, y, z, s] of [[5.95, 1.1, 6.9, 1.4], [11.55, 1.1, 6.9, 1.4], [ch.x, H - 1.1, ch.z, 3.4], [17.1, H - 1.9, 3.8, 1], [18.2, H - 1.9, 3.8, 1], [19.3, H - 1.9, 3.8, 1]]) {
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffd9a0', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    h.position.set(x, y, z);
    h.scale.setScalar(s);
    halos.add(h);
  }
  root.add(halos);

  // ── Zona de garaje (suelo, portón y cartel) ──
  const gFloorPlain = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 5.6).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: garageFloorTexture(false) }));
  const gFloorShow = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 5.6).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ map: garageFloorTexture(true), shininess: 70 }));
  for (const m of [gFloorPlain, gFloorShow]) {
    m.position.set(20.6, 0.004, 15.2);
    m.receiveShadow = true;
    root.add(m);
  }
  const gb = new GeoBuilder();
  // portón seccional en la pared este
  for (let k = 0; k < 6; k++) gb.box(0.08, 0.52, 4.2, k % 2 ? '#c9ccd1' : '#b7bcc4', W - 0.04, 0.3 + k * 0.54, 15.3);
  gb.box(0.12, 3.4, 0.2, '#2b2d42', W - 0.06, 1.7, 13.1);
  gb.box(0.12, 3.4, 0.2, '#2b2d42', W - 0.06, 1.7, 17.5);
  gb.box(0.12, 0.2, 4.6, '#2b2d42', W - 0.06, 3.35, 15.3);
  // bandas amarillas y negras en el borde
  for (let k = 0; k < 10; k++) gb.box(0.6, 0.012, 0.2, k % 2 ? '#1b1030' : '#ffd23f', 17.5 + k * 0.62, 0.012, 12.35, 0, 0.5, 0);
  root.add(meshOf(gb, lam, false, true));
  const gSign = texPlane(2.6, 0.97, signTexture('GARAJE', '0 coches · 0 glamour', '#ffd23f', '#1b1030'));
  gSign.position.set(20.7, 2.6, D - 0.02);
  gSign.rotation.y = Math.PI;
  root.add(gSign);
  const coneB = new GeoBuilder();
  coneB.cyl(0.02, 0.2, 0.6, 8, '#ff7b1a', 0, 0.3, 0);
  coneB.box(0.45, 0.04, 0.45, '#ff7b1a', 0, 0.02, 0);
  coneB.cyl(0.12, 0.15, 0.1, 8, '#ffffff', 0, 0.3, 0);
  const cone = meshOf(coneB, lam);
  cone.position.set(21.6, 0, 16.8);
  root.add(cone);

  // ── Carteles de "esto se compra" ──
  const tvNote = texPlane(0.9, 0.9, noteTexture(['AQUÍ VA', 'UNA TELE', 'ENORME', '(3.000 €)']));
  tvNote.position.set(8.75, 1.9, 8.01);
  tvNote.rotation.z = 0.06;
  root.add(tvNote);
  const statuePlaque = texPlane(0.9, 0.34, canvasTexture(256, 96, (g, w, h) => {
    g.fillStyle = '#d4af37';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1030';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 22px system-ui';
    g.fillText('RESERVADO PARA', w / 2, h * 0.32);
    g.fillText('TU ESTATUA DORADA', w / 2, h * 0.7);
  }), false);
  statuePlaque.position.set(st.x + 0.79, 0.62, st.z);
  statuePlaque.rotation.y = Math.PI / 2;
  root.add(statuePlaque);
  const jacNote = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 1.9, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.8 }),
  );
  jacNote.position.set(P.jacuzzi.x, 0.01, P.jacuzzi.z);
  const jacTxt = texPlane(2.4, 0.6, canvasTexture(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffd23f';
    g.font = '900 30px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('AQUÍ, UN JACUZZI', w / 2, h / 2);
  }), false, { transparent: true } as any);
  jacTxt.rotation.x = -Math.PI / 2;
  jacTxt.position.set(0, 0.002, 0);
  jacNote.add(jacTxt);
  root.add(jacNote);

  // ── Lujos ──
  const parts: Record<string, ItemParts> = {};
  const add = (id: string, group: THREE.Object3D | null, colliders: { setEnabled(on: boolean): void }[], placeholder: THREE.Object3D | null, confetti: THREE.Vector3, grow = true) => {
    if (group) root.add(group);
    parts[id] = { group, grow, colliders, placeholder, confetti };
  };

  // sofá
  const sofa = buildSofa();
  sofa.position.copy(P.sofa);
  add('sofa', sofa, [
    box(8.75, 0.58, 14.28, 3.1, 0.58, 0.28), box(8.75, 0.225, 13.45, 3.0, 0.225, 0.58),
    box(8.75 - 3.35, 0.5, 12.4, 0.25, 0.5, 1.9), box(8.75 + 3.35, 0.5, 12.4, 0.25, 0.5, 1.9),
    box(8.75 - 2.55, 0.225, 11.6, 0.58, 0.225, 1.3), box(8.75 + 2.55, 0.225, 11.6, 0.58, 0.225, 1.3),
  ], null, V(8.75, 13, 1.5));

  // tele
  const tv: TvCtl = buildTV();
  tv.group.position.copy(P.tv);
  add('tele', tv.group, [box(8.75, 0.25, 8.33, 2.2, 0.25, 0.3)], tvNote, V(8.75, 8.6, 2.2));

  // jacuzzi (el borde se puede pisar: 45 cm)
  const jac: JacuzziCtl = buildJacuzzi();
  jac.group.position.copy(P.jacuzzi);
  const jCols: { setEnabled(on: boolean): void }[] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    jCols.push(box(P.jacuzzi.x + Math.cos(a) * 1.72, 0.225, P.jacuzzi.z + Math.sin(a) * 1.72, 0.47, 0.225, 0.22, -(a + Math.PI / 2)));
  }
  add('jacuzzi', jac.group, jCols, jacNote, V(P.jacuzzi.x, P.jacuzzi.z, 1));

  // acuario separador
  const aq = buildAquarium();
  aq.group.position.copy(P.aquarium);
  aq.group.rotation.y = Math.PI / 2;
  const tank: FishTank = aq.tank;
  add('acuario', aq.group, [box(P.aquarium.x, 1.3, P.aquarium.z, 0.5, 1.3, 2.45)], null, V(P.aquarium.x, P.aquarium.z, 2.6));

  // estatua (se rehace si cambias de ropa)
  const statueHolder = new THREE.Group();
  statueHolder.position.set(st.x, 0, st.z);
  statueHolder.rotation.y = Math.PI / 2;
  let statueKey = '';
  let statueObj: { group: THREE.Group; dispose(): void } | null = null;
  const refreshStatue = () => {
    const look = playerLook(game);
    const k = lookKey(look);
    if (k === statueKey) return;
    statueKey = k;
    if (statueObj) {
      statueHolder.remove(statueObj.group);
      statueObj.dispose();
    }
    statueObj = buildStatue(look);
    statueHolder.add(statueObj.group);
  };
  refreshStatue();
  add('estatua', statueHolder, [], statuePlaque, V(st.x, st.z, 2.4));

  // cuadros
  for (const id of ['cuadro1', 'cuadro2', 'cuadro3']) {
    const pg = buildPainting(id);
    pg.position.copy(P.paintings[id]);
    pg.rotation.y = Math.PI;
    add(id, pg, [], null, P.paintings[id].clone().setZ(17.2));
  }

  // neones
  const neon: NeonCtl = buildNeon(W, D, H);
  const s1 = neon.group.getObjectByName('neon-dormir')!;
  s1.position.set(8.75, 4.0, 7.68);
  s1.rotation.y = Math.PI;
  const s2 = neon.group.getObjectByName('neon-rey')!;
  s2.position.set(17.9, 3.5, 0.03);
  // botón de fiesta junto a la entrada
  const btnB = new GeoBuilder();
  btnB.box(0.1, 0.5, 0.5, '#1b1030', W - 0.05, P.partySwitch.y, P.partySwitch.z);
  btnB.cyl(0.15, 0.15, 0.08, 16, '#ff2e88', W - 0.12, P.partySwitch.y, P.partySwitch.z, 0, 0, Math.PI / 2);
  const btn = new THREE.Mesh(btnB.build(), glowVC);
  neon.group.add(btn);
  const btnLabel = texPlane(0.9, 0.3, canvasTexture(256, 86, (g, w, h) => {
    g.fillStyle = '#1b1030';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff2e88';
    g.font = '900 34px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('¡FIESTA!', w / 2, h / 2);
  }), true);
  btnLabel.position.set(W - 0.03, P.partySwitch.y + 0.5, P.partySwitch.z);
  btnLabel.rotation.y = -Math.PI / 2;
  neon.group.add(btnLabel);
  add('neon', neon.group, [], null, V(8.75, 8, 3.8), false);
  // bola de discoteca (solo en modo fiesta)
  const disco = new THREE.Group();
  {
    const g = new THREE.IcosahedronGeometry(0.45, 2).toNonIndexed();
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i += 3) {
      const v = 0.45 + Math.random() * 0.55;
      c.setRGB(v, v, v * (0.9 + Math.random() * 0.2));
      if (Math.random() < 0.12) c.setHSL(Math.random(), 1, 0.7);
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ball = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    ball.name = 'bola';
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 4), new THREE.MeshBasicMaterial({ color: '#1b1030' }));
    wire.position.y = 0.6;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffffff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.scale.setScalar(2.4);
    disco.add(ball, wire, halo);
    disco.position.set(13.4, H - 1.0, 11.0);
    disco.visible = false;
    root.add(disco);
  }

  // colección de coches
  const garage: GarageCtl = buildGarage(P.garage);
  const gCols = P.garage.map((s) => {
    const c = cyl(s.x, s.z, 0.5, 0.7);
    return c;
  });
  const gNeon = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), glowMaterial(neonTextureCached(), '#ffffff', 1));
  gNeon.position.set(20.7, 3.5, D - 0.03);
  gNeon.rotation.y = Math.PI;
  garage.group.add(gNeon, gFloorShow);
  const garagePlaceholder = new THREE.Group();
  root.remove(gFloorPlain, gSign, cone);
  garagePlaceholder.add(gFloorPlain, gSign, cone);
  root.add(garagePlaceholder);
  add('garaje', garage.group, gCols, garagePlaceholder, V(20.7, 15.3, 2), false);

  // ── Luces (solo existen mientras estás dentro: el grupo se oculta al salir) ──
  const L1 = new THREE.PointLight('#ffd9a8', 26, 17, 1.4);
  L1.position.set(ch.x, H - 1.2, ch.z);
  const L2 = new THREE.PointLight('#ffe7c4', 22, 15, 1.4);
  L2.position.set(19.8, H - 0.9, 7.2);
  const L3 = new THREE.PointLight('#ffd0a0', 16, 13, 1.4);
  L3.position.set(8.75, H - 1.0, 4.2);
  const amb = new THREE.AmbientLight('#ffc890', 0.2);
  for (const l of [L1, L2, L3]) l.castShadow = false;
  root.add(L1, L2, L3, amb);

  // ── Estado de los lujos ──
  const popper = new Popper(game);
  const seats = new Seats(game);
  const shown = new Set<string>();
  const show = (id: string, pop: boolean) => {
    const p = parts[id];
    if (!p) return;
    const on = attic.has(id);
    if (p.group) {
      if (on && pop && !shown.has(id)) popper.pop(p.group, toWorld(p.confetti), p.grow);
      else {
        p.group.visible = on;
        if (p.group.userData.baseScale) p.group.scale.copy(p.group.userData.baseScale);
      }
    }
    for (const c of p.colliders) c.setEnabled(on);
    if (p.placeholder) p.placeholder.visible = !on;
    if (on) shown.add(id);
    else shown.delete(id);
  };
  const apply = (pop: boolean) => {
    for (const id of Object.keys(parts)) show(id, pop);
  };
  apply(false);

  // ── Puntos de interacción ──
  const P3 = (v: THREE.Vector3) => V(v.x, v.z);
  let party = 0;
  const music = new PartyMusic();
  const startParty = () => {
    party = 24;
    const p = game.mod.player;
    toast(game, '¡FIESTA EN EL ÁTICO! Tú solo, pero con estilo.', '#ff2e88', 2.6);
    music.start(game.mod.audio);
    game.mod.audio?.play('cheer', { volume: 0.5 });
    if (p) seats.sit(p.position.clone(), p.heading, p.position.clone(), { pose: 'dance', hint: 'E o WASD — Dejar de bailar', onStand: () => stopParty() });
  };
  const stopParty = () => {
    if (party <= 0 && !music.playing) return;
    party = 0;
    music.stop();
    if (seats.busy) seats.stand();
  };
  const spots: Spot[] = [
    { pos: P3(P.panel), r: 1.7, text: 'Decorar el ático (tienda de lujos)', run: () => attic.openDecor() },
    { pos: P3(P.bed), r: 3.05, text: 'Dormir hasta mañana (y guardar)', run: () => attic.sleep() },
    {
      pos: P3(P.fridge), r: 1.6, text: 'Abrir la nevera',
      run: () => {
        const p = game.mod.player;
        if (p) p.health = Math.min(p.maxHealth, p.health + 10);
        toast(game, pick(FRIDGE), '#ffffff', 3.2);
        game.mod.audio?.play('pickup', { volume: 0.5 });
      },
    },
    {
      pos: P3(P.telescope), r: 1.5, text: 'Mirar por el telescopio',
      run: () => {
        toast(game, '🔭 ' + pick(TELESCOPE), '#ffffff', 3.6);
        const p = game.mod.player;
        if (p) p.heading = -Math.PI / 2;
        const cam = game.mod.cameraRig;
        if (cam) cam.snapBehind?.(-Math.PI / 2);
      },
    },
    {
      pos: P3(P.piano).add(V(0, -1.9)), r: 1.4, text: 'Tocar el piano',
      run: () => {
        const notes = [1, 1.12, 1.26, 1.33, 1.5, 1.33, 1.26, 1.5, 2];
        notes.forEach((pt, i) => window.setTimeout(() => game.mod.audio?.play('bell', { pitch: pt * 0.8, volume: 0.35 }), i * 170));
        toast(game, '🎹 Tocas «Para Elisa»… en versión reguetón. Los vecinos aplauden (para que pares).', '#ffffff', 3.4);
      },
    },
    { pos: P3(P.sofaSeat).add(V(0, -1.3)), r: 1.4, on: () => attic.has('sofa'), text: 'Sentarse en el sofá',
      run: () => seats.sit(toWorld(P.sofaSeat), Math.PI, toWorld(P.sofaStand), { hint: 'E o WASD — Levantarse del sofá' }) },
    {
      pos: V(8.75, 9.3), r: 1.5, on: () => attic.has('tele'), text: 'Cambiar de canal',
      run: () => {
        const name = tv.next();
        toast(game, `📺 ${name}`, '#5aa9ff', 1.6);
      },
    },
    {
      pos: P3(P.jacuzzi), r: 2.3, on: () => attic.has('jacuzzi'), text: 'Meterse en el jacuzzi',
      run: () => {
        const p = game.mod.player;
        seats.sit(toWorld(V(P.jacuzzi.x + 0.75, P.jacuzzi.z)), -Math.PI / 2, toWorld(V(P.jacuzzi.x + 2.5, P.jacuzzi.z - 0.6)), { hint: 'E o WASD — Salir del jacuzzi' });
        if (p) {
          p.stamina = 100;
          p.health = Math.min(p.maxHealth, p.health + 25);
        }
        game.mod.audio?.play('splash', { volume: 0.6 });
        toast(game, 'Burbujitas. Esto es vida. (+aguante, +vida)', '#35d0ff', 2.8);
      },
    },
    {
      pos: V(15.55, 15.1), r: 1.5, on: () => attic.has('acuario'), text: 'Dar de comer a los peces',
      run: () => {
        tank.feed();
        game.mod.particles?.emit('confetti', toWorld(V(P.aquarium.x, P.aquarium.z, 2.4)), { count: 10, color: ['#c8915a', '#ffd23f'], speed: 0.3 });
        toast(game, '🐟 ' + pick(FISH), '#35d0ff', 3);
      },
    },
    { pos: V(18.9, 9), r: 1.2, on: () => attic.has('estatua'), text: 'Admirar tu estatua', run: () => toast(game, '🏆 ' + pick(STATUE), '#ffd23f', 3) },
    { pos: V(18.9, 9), r: 1.2, on: () => !attic.has('estatua'), text: 'Leer la placa', run: () => toast(game, 'Reservado para tu estatua dorada. Se compra en la tablet de la entrada (8.000 €).', '#ffd23f', 3.4) },
    { pos: V(20.7, 12.9), r: 1.5, on: () => attic.has('garaje'), text: 'Admirar tu colección', run: () => toast(game, '🏎️ ' + pick(GARAGE), '#ffd23f', 3) },
    {
      pos: V(P.partySwitch.x - 0.6, P.partySwitch.z), r: 1.3, on: () => attic.has('neon'), text: () => (party > 0 ? 'Acabar la fiesta' : 'Modo fiesta (luces y música)'),
      run: () => (party > 0 ? stopParty() : startParty()),
    },
  ];

  // ── Niebla: dentro se ve más lejos (para disfrutar de la vista); al salir se deja como estaba ──
  let insideFog = false;
  const setFog = () => {
    const fog = game.scene.fog as THREE.Fog | null;
    if (!fog) return;
    const far = Math.max(150, game.camera.far - 12);
    fog.far = far;
    fog.near = far * 0.42;
  };
  const restoreFog = () => {
    const fog = game.scene.fog as THREE.Fog | null;
    if (!fog) return;
    const q = game.quality;
    fog.near = q.drawDistance * 0.35;
    fog.far = q.drawDistance;
  };

  // ── Animación ──
  const tmp = new THREE.Vector3();
  let bounceCd = 0;
  let confT = 0;
  let t = 0;
  const pinkL = new THREE.Color('#ff3fa0'), warmL = new THREE.Color('#ffd0a0');

  const inst: AtticScene = {
    spawn: P.spawn.clone(),
    heading: -Math.PI / 2,
    exit: P.exit.clone(),
    apply,
    show: (id, pop) => show(id, pop),
    toWorld,
    get party() {
      return party > 0;
    },
    partyOn: () => startParty(),
    lookFrom(from, at) {
      const cam = game.mod.cameraRig;
      cam?.playCinematic(toWorld(from), toWorld(from), toWorld(at), 0.01);
    },
    interact(local) {
      return nearestSpot(spots, local);
    },
    onEnter() {
      root.visible = true;
      insideFog = true;
      setFog();
      refreshStatue();
      garage.setCars((game.mod.shops?.owned as OwnedLike[] | undefined) ?? null);
      apply(false);
    },
    onExit() {
      insideFog = false;
      restoreFog();
      stopParty();
      if (seats.busy) seats.stand();
      root.visible = false;
    },
    update(dt, inside) {
      if (!inside) return;
      t += dt;
      if (insideFog) setFog();
      popper.update(dt);
      seats.update(dt);
      view.update(dt);
      if (attic.has('tele')) tv.update(dt);
      if (attic.has('jacuzzi')) jac.update(dt);
      if (attic.has('acuario')) tank.update(dt);
      if (attic.has('garaje')) garage.update(dt);
      if (attic.has('estatua')) statueHolder.rotation.y += dt * 0.25;
      const hasNeon = attic.has('neon');
      if (hasNeon) neon.update(dt, party > 0);
      // luces: más cálidas y fuertes de noche; rosa si hay neón
      const night = game.night;
      amb.intensity = 0.12 + 0.3 * night;
      ceilMat.emissiveIntensity = 0.55 - 0.3 * night;
      const k = 0.55 + 0.45 * night;
      L1.intensity = 26 * k;
      L2.intensity = 22 * k;
      disco.visible = party > 0;
      if (party > 0) {
        party -= dt;
        disco.rotation.y += dt * 1.6;
        (disco.children[2] as THREE.Sprite).material.color.setHSL((t * 0.5) % 1, 1, 0.7);
        L3.color.setHSL((t * 0.35) % 1, 1, 0.6);
        L3.intensity = 30 + Math.sin(t * 15) * 10;
        L1.intensity *= 0.5 + 0.5 * Math.abs(Math.sin(t * 7.7));
        confT -= dt;
        if (confT <= 0) {
          confT = 0.35;
          game.mod.particles?.emit('confetti', toWorld(V(4 + Math.random() * 14, 2 + Math.random() * 14, H - 1.2)), { count: 12, speed: 0.35, gravity: 1.6, life: 1.6 });
        }
        if (party <= 0) stopParty();
      } else {
        L3.color.copy(hasNeon ? pinkL : warmL);
        L3.intensity = (hasNeon ? 22 : 16) * k;
      }
      // la cama rebota (cama elástica de rico)
      bounceCd -= dt;
      const p = game.mod.player;
      if (p && p.state === 'foot') {
        tmp.copy(p.position).sub(O);
        if (tmp.y > 0.6 && Math.hypot(tmp.x - P.bed.x, tmp.z - P.bed.z) < 2.1 && p.grounded && bounceCd <= 0) {
          p.push.y = 13;
          bounceCd = 0.55;
          game.mod.audio?.play('jump', { pitch: 1.6, volume: 0.6 });
        }
      }
    },
  };
  return inst;
}

let neonGarageTex: THREE.CanvasTexture | null = null;
function neonTextureCached(): THREE.CanvasTexture {
  if (!neonGarageTex) {
    neonGarageTex = canvasTexture(1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '900 120px system-ui, sans-serif';
      for (let pass = 0; pass < 3; pass++) {
        g.shadowColor = '#ffd23f';
        g.shadowBlur = [38, 18, 4][pass];
        g.fillStyle = pass === 2 ? '#fffbe0' : '#ffd23f';
        g.fillText('MI COLECCIÓN', w / 2, h / 2);
      }
    });
  }
  return neonGarageTex;
}

// ─────────────────────────────── instalación ───────────────────────────────

/** Crea el ático, lo registra en los interiores y pone la oferta de compra en la puerta. */
export function installAttic(game: Game): Attic {
  const attic: Attic = game.mod.attic instanceof Attic ? game.mod.attic : new Attic(game);
  const def: InteriorDef = {
    id: 'attic',
    name: 'tu ático',
    poi: (p) => p.kind === 'attic',
    doorText: 'Entrar en tu ático',
    canEnter: () => (attic.owned ? true : `El ático aún no es tuyo: se vende por ${fmt(ATTIC_PRICE)}.`),
    build: (ctx) => {
      const sc = buildAtticScene(ctx, attic);
      attic.scene = sc;
      return sc;
    },
  };
  let done = false;
  const tryRegister = () => {
    if (done) return true;
    const ints = game.mod.interiors as Interiors | undefined;
    const it = game.mod.interaction;
    if (!ints || !it) return false;
    ints.register(def);
    it.add(() => attic.doorOffer(), 9);
    done = true;
    return true;
  };
  if (!tryRegister()) game.addSystem({ name: 'attic-install', update: () => void tryRegister() });
  return attic;
}
