// Sucesos por la isla: ladrón de bolsos, camión que pierde paquetes, carrera callejera, boda sin tarta,
// gallina fugitiva, turista que quiere ver el faro y atraco de Los Devueltos a una tienda.
// Salen cada pocos minutos (nunca en misiones, interiores, tutorial ni con la policía detrás) y se
// anuncian por el móvil o con un grito. Al acabar se avisa con 'event:done' { kind, ok } (logros, reto del día).
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Poi } from '../core/contracts';
import type { Npc } from '../actors/npc';
import type { Vehicle } from '../vehicles/vehicle';
import type { CarBrain } from '../ai/traffic';
import type { Roads } from '../ai/roads';
import type { CombatBrain } from '../ai/combatant';
import { randomLookFor } from '../actors/looks';
import { Rng, fx as rnd } from '../core/rng';
import { GeoBuilder, vertexColorMaterial } from '../core/geo';
import { SOLID, G } from '../core/physics';
import { CLIENTS } from './jobs/clients';

/** Un tramo de la ruta de la carrera: una calle recorrida en un sentido. */
type Leg = { edge: number; dir: 1 | -1 };

export type EventKind = 'thief' | 'truck' | 'race' | 'boda' | 'gallina' | 'turista' | 'atraco';

/** La gallina fugitiva: una malla de tres piezas (cuerpo y dos alas que aletean). */
interface Hen {
  root: THREE.Group;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  pos: THREE.Vector3;
  heading: number;
  /** Altura sobre el suelo y velocidad vertical (saltitos con aleteo). */
  y: number;
  vy: number;
  /** Segundos de persecución de cerca: se cansa y va más despacio. */
  tired: number;
  jumpCd: number;
  wanderT: number;
  wander: number;
  /** Giro para esquivar paredes (se recalcula cada poco). */
  avoid: number;
  avoidT: number;
  cluckT: number;
  speed: number;
}

type Ev =
  | { kind: 'thief'; thief: Npc; victim: Npc; bag: boolean; gotBag?: boolean; t: number }
  | { kind: 'truck'; truck: Vehicle; drops: number; found: number; reported?: boolean; t: number; next: number }
  | {
      kind: 'race';
      rival: Vehicle;
      checkpoints: THREE.Vector3[];
      idx: number;
      rivalIdx: number;
      t: number;
      started: boolean;
      accepted: boolean;
      /** Calles que recorre el rival, en orden (sin callejones). */
      legs: Leg[];
      /** Tramo en el que acaba cada punto de control. */
      cpLeg: number[];
      /** Tramo por el que va el rival. */
      leg: number;
      /** Velocidad de crucero del rival cuando arranca. */
      cruise: number;
      /** Segundos sin avanzar (para recolocarlo si se atasca). */
      stuckT: number;
      anchor: THREE.Vector3;
    }
  | {
      kind: 'boda';
      stage: 'offer' | 'pickup' | 'carry' | 'party';
      t: number;
      /** Segundos que quedan (y los que había) para llevar la tarta. */
      left: number;
      limit: number;
      shop: Poi;
      plaza: THREE.Vector3;
      plazaFacing: number;
      /** Estado de la tarta, 0..100. */
      cake: number;
      guests: Npc[];
      partyT: number;
      pay: number;
      /** Última vez que la tarta avisó de un golpe (para no repetir el aviso). */
      warnT: number;
    }
  | { kind: 'gallina'; stage: 'loose' | 'caught'; t: number; left: number; hen: Hen; owner: Npc; home: THREE.Vector3; warnedCar: boolean }
  | {
      kind: 'turista';
      stage: 'wait' | 'ride';
      t: number;
      left: number;
      limit: number;
      npc: Npc;
      dest: THREE.Vector3;
      ride: Vehicle | null;
      /** Lo tranquila que va (100 = encantada; baja con golpes y saltos). */
      comfort: number;
      talkT: number;
      yelpT: number;
      waved: boolean;
      /** Segundos que el jugador lleva lejos del coche con la turista dentro. */
      lostT: number;
      walkWarn: number;
    }
  | { kind: 'atraco'; t: number; left: number; shop: Poi; robbers: Npc[]; owner: Npc; alive: number; engaged: boolean; title: string };

const rng = new Rng('eventos');
const tmpV = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
/** Metros de ruta de una carrera y distancia mínima entre puntos de control. */
const RACE_LEN = 650;
const RACE_CP_GAP = 110;
/** Segundos sin avanzar para recolocar al rival en su calle. */
const RACE_STUCK = 4.5;
/** Al acabar la carrera el rival se va tranquilo (m/s) y desaparece pasados unos segundos, ya lejos. */
const LEAVE_SPEED = 9;
const LEAVE_MIN_T = 6;
const LEAVE_MAX_T = 30;
const LEAVE_DIST = 45;
/** Pie del faro (en el césped, al principio del espigón): ahí se baja la turista. */
const FARO = new THREE.Vector3(196, 0, 250);
const FARO_TIP = new THREE.Vector3(196, 0, 262);

// ─────────── Frases ───────────

const TOURIST_TALK = [
  '¿Eso es una rotonda? ¡En mi país no dan tantas vueltas!',
  '¡Mira, una gaviota! Ah, no, es una bolsa.',
  '¿Aquí los semáforos son de adorno?',
  'Mi guía dice que Puerto Paquete es «tranquilo». Mi guía es muy optimista.',
  '¡Qué olor a churros! ¿Es la isla o eres tú?',
  '¡Foto! ¡Foto! Vale, ya. Ha salido movida. Como todo aquí.',
  '¿Cómo se dice «más despacio»? ¿«Olé»?',
  'En mi país los repartidores no llevan turistas. Qué atraso.',
  '¿Siempre pita tanto la gente? ¿Es un saludo?',
];
const TOURIST_YELP = [
  '¡AAAH! ¿Aquí los coches se saludan así?',
  '¡Mi cámara! ¡Mis gafas! ¡Mi dignidad!',
  '¡Eso era un buzón! ¡Era un buzón muy bonito!',
  '¡Uy! Lo pondré en la reseña. Con muchas exclamaciones.',
  '¡Cuidado! ¡Que yo solo he pagado el viaje, no el susto!',
];
const TOURIST_AIR = ['¡Estamos volando! ¡Como en las postales!', '¡En mi país esto es ilegal! ¡Y aquí, supongo, también!', '¡Wiiii! Bueno, digo… ¡socorro!'];
const HEN_CLUCKS = ['¡Cloc!', '¡Cloc, cloc!', '¡COCOCÓ!', '¡Clooooc!', '¡Pío! Digo… ¡cloc!'];

/** Los sucesos, para la app «Sucesos» del móvil (los que aún no te han pasado salen como «???»). */
const EVENT_INFO: { kind: EventKind; icon: string; name: string; desc: string }[] = [
  { kind: 'thief', icon: '👜', name: 'Ladrón de bolsos', desc: 'Tíralo al suelo y devuélvele el bolso a la señora.' },
  { kind: 'truck', icon: '🚚', name: 'Furgón que pierde paquetes', desc: 'Ve recogiendo lo que se le cae. Nadie lo va a reclamar. Creo.' },
  { kind: 'race', icon: '🏁', name: 'Carrera callejera', desc: 'El Niño Nitro te reta: 500 € si ganas, 200 si pierdes.' },
  { kind: 'boda', icon: '🎂', name: 'Boda sin tarta', desc: 'Lleva la tarta a la plaza a tiempo y sin romperla. Es de nata.' },
  { kind: 'gallina', icon: '🐔', name: 'La gallina fugitiva', desc: 'Atrápala a pie (se cansa si la persigues) y devuélvesela a su dueño.' },
  { kind: 'turista', icon: '🗺️', name: 'La turista despistada', desc: 'Recógela en coche y llévala al faro sin darle muchos sustos.' },
  { kind: 'atraco', icon: '🚨', name: 'Atraco de Los Devueltos', desc: 'Derriba a los atracadores antes de que se escapen con la caja.' },
];

/** Busca un cliente del móvil por su id (Paquita la de las bodas, Ingrid la turista...). */
function client(id: string) {
  return CLIENTS.find((c) => c.id === id);
}

// ─────────── Mallas (hechas una vez y compartidas) ───────────

let cakeGeo: THREE.BufferGeometry | null = null;
/** Tarta nupcial de tres pisos con los novios encima. */
function makeCake(): THREE.Mesh {
  if (!cakeGeo) {
    const b = new GeoBuilder();
    b.cyl(0.36, 0.36, 0.03, 12, '#e8e8f0', 0, 0.015, 0);
    b.cyl(0.3, 0.3, 0.16, 12, '#fff4f8', 0, 0.11, 0);
    b.cyl(0.305, 0.305, 0.035, 12, '#ff9ecf', 0, 0.07, 0);
    b.cyl(0.22, 0.22, 0.14, 12, '#ffe3ef', 0, 0.26, 0);
    b.cyl(0.225, 0.225, 0.03, 12, '#ff9ecf', 0, 0.22, 0);
    b.cyl(0.14, 0.14, 0.12, 12, '#fff4f8', 0, 0.39, 0);
    // novios de azúcar
    b.box(0.05, 0.1, 0.04, '#1b1b2a', -0.04, 0.5, 0);
    b.box(0.05, 0.1, 0.04, '#ffffff', 0.04, 0.5, 0);
    b.box(0.04, 0.04, 0.04, '#f1c27d', -0.04, 0.57, 0);
    b.box(0.04, 0.04, 0.04, '#f1c27d', 0.04, 0.57, 0);
    // guindas
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.box(0.04, 0.04, 0.04, '#e63946', Math.cos(a) * 0.25, 0.2, Math.sin(a) * 0.25);
    }
    cakeGeo = b.build();
  }
  const m = new THREE.Mesh(cakeGeo, vertexColorMaterial);
  m.castShadow = true;
  return m;
}

let tableGeo: THREE.BufferGeometry | null = null;
/** Mesita con mantel para la tarta de la boda. */
function makeTable(): THREE.Mesh {
  if (!tableGeo) {
    const b = new GeoBuilder();
    b.box(1.2, 0.06, 0.9, '#ffffff', 0, 0.78, 0);
    b.box(1.16, 0.7, 0.86, '#fdf2f7', 0, 0.4, 0);
    b.box(1.18, 0.1, 0.88, '#ff9ecf', 0, 0.62, 0);
    tableGeo = b.build();
  }
  const m = new THREE.Mesh(tableGeo, vertexColorMaterial);
  m.castShadow = true;
  return m;
}

/** La gallina es grandota (de dibujos): así se ve bien de lejos. */
const HEN_SCALE = 1.55;
let henBodyGeo: THREE.BufferGeometry | null = null;
let henWingGeo: THREE.BufferGeometry | null = null;
function makeHen(): { root: THREE.Group; wingL: THREE.Mesh; wingR: THREE.Mesh } {
  if (!henBodyGeo || !henWingGeo) {
    const b = new GeoBuilder();
    b.box(0.34, 0.3, 0.44, '#fbf7ee', 0, 0.36, 0);
    b.box(0.26, 0.22, 0.12, '#fbf7ee', 0, 0.5, -0.24, -0.5, 0, 0); // cola
    b.box(0.16, 0.14, 0.06, '#e9e1cf', 0, 0.62, -0.3, -0.8, 0, 0);
    b.box(0.18, 0.2, 0.18, '#fbf7ee', 0, 0.6, 0.2); // cabeza
    b.box(0.05, 0.1, 0.16, '#e63946', 0, 0.75, 0.19); // cresta
    b.box(0.08, 0.06, 0.1, '#ff9f1c', 0, 0.59, 0.33); // pico
    b.box(0.04, 0.07, 0.04, '#e63946', 0, 0.52, 0.3); // barbilla
    b.box(0.03, 0.04, 0.04, '#1b1030', 0.092, 0.64, 0.25);
    b.box(0.03, 0.04, 0.04, '#1b1030', -0.092, 0.64, 0.25);
    for (const s of [-1, 1]) {
      b.box(0.04, 0.22, 0.04, '#ff9f1c', s * 0.08, 0.11, 0);
      b.box(0.1, 0.03, 0.14, '#ff9f1c', s * 0.08, 0.015, 0.03);
    }
    henBodyGeo = b.build();
    const w = new GeoBuilder();
    // ala con el eje arriba (para que aletee desde el hombro)
    w.box(0.06, 0.22, 0.3, '#efe7d6', 0, -0.11, 0);
    w.box(0.065, 0.06, 0.2, '#d9cfb8', 0, -0.2, -0.05);
    henWingGeo = w.build();
  }
  const root = new THREE.Group();
  const body = new THREE.Mesh(henBodyGeo, vertexColorMaterial);
  body.castShadow = true;
  const wingL = new THREE.Mesh(henWingGeo, vertexColorMaterial);
  const wingR = new THREE.Mesh(henWingGeo, vertexColorMaterial);
  wingL.position.set(0.19, 0.48, 0);
  wingR.position.set(-0.19, 0.48, 0);
  root.add(body, wingL, wingR);
  root.scale.setScalar(HEN_SCALE);
  return { root, wingL, wingR };
}

let sackGeo: THREE.BufferGeometry | null = null;
/** Saco del botín (lo lleva a la espalda uno de los atracadores). */
function makeSack(): THREE.Mesh {
  if (!sackGeo) {
    const b = new GeoBuilder();
    b.box(0.42, 0.46, 0.28, '#9c6b3c', 0, -0.05, -0.2);
    b.box(0.3, 0.12, 0.2, '#8a5a2e', 0, 0.22, -0.2);
    b.box(0.14, 0.14, 0.02, '#ffd23f', 0, -0.02, -0.345);
    sackGeo = b.build();
  }
  const m = new THREE.Mesh(sackGeo, vertexColorMaterial);
  m.castShadow = true;
  return m;
}

export class RandomEvents implements System {
  name = 'randomEvents';
  private ev: Ev | null = null;
  private timer = 150;
  /** Último suceso (para no repetir el mismo dos veces seguidas). */
  private last: EventKind | null = null;
  /** Cotilleos del móvil (mensajes graciosos sin encargo): cada pocos minutos. */
  private gossipT = 200;
  /** Rivales de carreras ya acabadas: se van despacio por su carril hasta desaparecer. */
  private leaving: { v: Vehicle; t: number }[] = [];
  /** Personajes y cosas que se quedan un rato tras un suceso (los novios bailando, la gallina...). */
  private lingering: { npc: Npc | null; obj: THREE.Object3D | null; t: number; max: number }[] = [];
  enabled = true;
  /** Tarjeta del suceso en la lista de encargos del HUD (se reutiliza). */
  private readonly card = { id: 'evento', title: '', timeLeft: null as number | null, integrity: null as number | null, color: '#ffd23f' };
  private readonly markPool: { x: number; z: number; icon: string; color: string; label: string; small: boolean; event: true }[] = [];
  private markN = 0;
  private readonly wp = { x: 0, z: 0, label: '', color: '', auto: true };
  /** Tarta en las manos del jugador (a pie). */
  private cakeHeld: THREE.Mesh | null = null;
  /** Cuántos sucesos de cada tipo te han pasado y cuántos has resuelto (se guarda). */
  readonly stats: Partial<Record<EventKind, { seen: number; ok: number }>> = {};

  constructor(private game: Game) {
    game.mod.randomEvents = this;
    const ev = game.events;
    ev.on('vehicle:impact' as any, (e: any) => this.onImpact(e.vehicle, e.dv));
    ev.on('vehicle:landed' as any, (e: any) => this.onLanded(e.vehicle, typeof e.fall === 'number' ? e.fall : (e.air ?? 0) * 5, e.air ?? 0));
    ev.on('player:hurt', (e) => this.onPlayerHurt(e.amount));
    ev.on('player:jump' as any, () => this.onPlayerJump());
    ev.on('player:died', () => this.abort());
    ev.on('player:busted' as any, () => this.abort());
    ev.on('interior:enter' as any, () => this.abort());
    ev.on('event:done' as any, (e: any) => {
      const st = (this.stats[e.kind as EventKind] ??= { seen: 0, ok: 0 });
      st.seen++;
      if (e.ok) st.ok++;
    });
    game.mod.phone?.extraApps.push({ id: 'sucesos', icon: '📰', name: 'Sucesos', color: '#ff7b54', open: (body: HTMLDivElement) => this.render(body) });
    game.mod.save?.register({
      key: 'sucesos',
      save: () => this.stats,
      load: (d: any) => {
        for (const info of EVENT_INFO) {
          const x = d?.[info.kind];
          if (x && typeof x.seen === 'number') this.stats[info.kind] = { seen: x.seen, ok: x.ok ?? 0 };
        }
      },
    });
  }

  /** App «Sucesos» del móvil: lo que puede pasar por la isla y cuántos has resuelto. */
  private render(body: HTMLDivElement) {
    let seen = 0, ok = 0;
    for (const info of EVENT_INFO) {
      seen += this.stats[info.kind]?.seen ?? 0;
      ok += this.stats[info.kind]?.ok ?? 0;
    }
    body.innerHTML = `<div class="cr-tarjeta"><h3>SUCESOS DE PUERTO PAQUETE</h3><div class="gordo">${ok}<small style="font:900 16px system-ui;opacity:.6"> resueltos</small></div>
      <p style="font:600 12.5px/1.45 system-ui;margin:6px 0 0">Cada pocos minutos pasa algo por la isla. Te enteras por el móvil o porque alguien grita. ¡Ayuda y cobra! (${seen} vividos)</p></div>`;
    for (const info of EVENT_INFO) {
      const st = this.stats[info.kind];
      const known = !!st && st.seen > 0;
      const d = document.createElement('div');
      d.className = 'cr-tarjeta';
      d.style.cssText = `display:flex;gap:10px;align-items:center;padding:10px 12px;margin:8px 0;${known ? '' : 'opacity:.6;border-style:dashed'}`;
      d.innerHTML = `<div style="font-size:28px;width:34px;text-align:center">${known ? info.icon : '❔'}</div>
        <div style="flex:1;min-width:0"><b style="display:block;font:900 13.5px system-ui"></b><span style="display:block;font:600 11.5px/1.3 system-ui;opacity:.8"></span></div>
        <div style="font:900 12px system-ui;text-align:right;white-space:nowrap">${known ? `✅ ${st!.ok}<br><span style="opacity:.6">de ${st!.seen}</span>` : ''}</div>`;
      (d.querySelector('b') as HTMLElement).textContent = known ? info.name : '???';
      (d.querySelector('span') as HTMLElement).textContent = known ? info.desc : 'Aún no te ha pasado. Date una vuelta por la isla.';
      body.appendChild(d);
    }
  }

  private get roads(): Roads {
    return this.game.mod.traffic.roads;
  }

  private busy(): boolean {
    const g = this.game;
    // el tutorial solo cuenta si está en marcha (al continuar una partida a medias se queda en el paso 0 para siempre)
    const tuto = g.mod.tutorial;
    const inTutorial = !!tuto && !tuto.done && tuto.step > 0;
    return !!(g.mod.story?.running || g.mod.interiors?.inside || (g.mod.police?.wanted ?? 0) > 0 || inTutorial || g.mod.photo?.active);
  }

  /** Dónde está el jugador de verdad (su vehículo si conduce). */
  private playerPos(out: THREE.Vector3): THREE.Vector3 {
    const cur = this.game.mod.vehicles?.current as Vehicle | null;
    if (cur && this.game.mod.player.state === 'vehicle') return cur.getPosition(out);
    return out.copy(this.game.mod.player.position);
  }

  update(dt: number) {
    const g = this.game;
    if (!this.enabled || !g.world || !g.mod.player) return;
    this.clearMarks();
    if (this.leaving.length) this.tickLeaving(dt);
    if (this.lingering.length) this.tickLingering(dt);
    // cotilleos: mensajes graciosos de la isla (la madre, el grupo de vecinos, publicidad...)
    this.gossipT -= dt;
    if (this.gossipT <= 0) {
      this.gossipT = 230 + rnd.next() * 170;
      if (!this.ev && !this.busy()) g.mod.messages?.gossip?.();
    }
    if (!this.ev) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 130 + rnd.next() * 130;
        if (!this.busy()) this.start();
      }
      return;
    }
    this.tick(dt);
  }

  /** Empieza un suceso (uno concreto o uno al azar que encaje con lo que hace el jugador). */
  start(kind?: EventKind): boolean {
    if (this.ev || !this.game.mod.traffic?.roads) return false;
    const order = kind ? [kind] : this.candidates();
    for (const k of order) {
      if (this.begin(k)) {
        this.last = k;
        return true;
      }
    }
    return false;
  }

  /** Sucesos posibles, sorteados según vaya a pie o en coche (sin repetir el último). */
  private candidates(): EventKind[] {
    const inCar = this.game.mod.player.state === 'vehicle';
    const w: [EventKind, number][] = inCar
      ? [['race', 2], ['truck', 1], ['turista', 2.2], ['boda', 1.6], ['atraco', 1.2], ['gallina', 0.5]]
      : [['thief', 2], ['truck', 0.6], ['gallina', 2], ['boda', 1.6], ['atraco', 1.4]];
    const pool = w.filter(([k]) => k !== this.last);
    const out: EventKind[] = [];
    while (pool.length) {
      let sum = 0;
      for (const [, x] of pool) sum += x;
      let r = rnd.next() * sum;
      let i = 0;
      for (; i < pool.length - 1; i++) {
        r -= pool[i][1];
        if (r <= 0) break;
      }
      out.push(pool[i][0]);
      pool.splice(i, 1);
    }
    return out;
  }

  private begin(k: EventKind): boolean {
    switch (k) {
      case 'thief':
        return this.startThief();
      case 'truck':
        return this.startTruck();
      case 'race':
        return this.startRace();
      case 'boda':
        return this.startBoda();
      case 'gallina':
        return this.startGallina();
      case 'turista':
        return this.startTurista();
      case 'atraco':
        return this.startAtraco();
    }
  }

  // ─────────── HUD: marcadores, GPS y tarjeta ───────────

  private clearMarks() {
    const mk = this.game.hud.markers as any[];
    let w = 0;
    for (let i = 0; i < mk.length; i++) if (!mk[i].event) mk[w++] = mk[i];
    mk.length = w;
    this.markN = 0;
  }

  /** Marcador en el minimapa y en el mundo. small = algo que se mueve (solo la flecha encima, sin columna de luz). */
  private mark(x: number, z: number, icon: string, color: string, label = '', small = false) {
    let m = this.markPool[this.markN];
    if (!m) this.markPool.push((m = { x: 0, z: 0, icon: '', color: '', label: '', small: false, event: true }));
    this.markN++;
    m.small = small;
    m.x = x;
    m.z = z;
    m.icon = icon;
    m.color = color;
    m.label = label;
    this.game.hud.markers.push(m);
  }

  /** GPS al suceso, si no hay encargos (mandan los encargos) ni un destino puesto a mano. */
  private gps(x: number, z: number, label: string, color: string) {
    const h = this.game.hud;
    if (h.waypoint && h.waypoint !== this.wp) return;
    const w = this.wp;
    w.x = x;
    w.z = z;
    w.label = label;
    w.color = color;
    h.waypoint = w;
  }

  /** Tarjeta en la lista de encargos del HUD (con cuenta atrás y, si hace falta, barra). */
  private showCard(title: string, timeLeft: number | null, integrity: number | null, color: string) {
    const c = this.card;
    c.title = title;
    c.timeLeft = timeLeft;
    c.integrity = integrity;
    c.color = color;
    const list = this.game.hud.jobs;
    if (!list.includes(c)) list.push(c);
  }

  private say(target: { position: THREE.Vector3 } | THREE.Vector3, text: string, seconds = 3, voice = 1) {
    this.game.mod.bubbles?.say(target, text, seconds);
    const pos = (target as any).position ?? target;
    this.game.mod.audio?.say(pos, 4 + Math.floor(rnd.next() * 4), voice, 0.7);
  }

  private linger(npc: Npc | null, obj: THREE.Object3D | null, max: number) {
    this.lingering.push({ npc, obj, t: 0, max });
  }

  private tickLingering(dt: number) {
    const pp = this.game.mod.player.position;
    for (let i = this.lingering.length - 1; i >= 0; i--) {
      const l = this.lingering[i];
      l.t += dt;
      const pos = l.npc ? l.npc.position : l.obj?.position;
      const far = !pos || pos.distanceToSquared(pp) > 75 * 75;
      if (l.t > l.max || (l.t > 3 && far) || l.npc?.removed) {
        if (l.npc && !l.npc.removed) this.game.mod.npcs?.remove(l.npc);
        l.obj?.parent?.remove(l.obj);
        this.lingering.splice(i, 1);
      }
    }
  }

  /** Un sitio en la acera a min-max metros del jugador. */
  private sidewalkSpot(min: number, max: number, out: THREE.Vector3): THREE.Vector3 | null {
    const roads = this.roads;
    const edges = roads.edgesInRing(this.game.mod.player.position, min, max, false);
    for (let k = 0; k < 8 && edges.length; k++) {
      const e = roads.g.edges[edges[Math.floor(rnd.next() * edges.length)]];
      const side = rnd.next() < 0.5 ? 1 : -1;
      roads.lanePoint(e.id, 1, 0.25 + rnd.next() * 0.5, side * (e.width / 2 + 1.3), out);
      // (en la acera: fuera de los edificios seguro; sin mirar techos, que los toldos y balcones cuentan como tales)
      if (!this.game.world.isLand(out.x, out.z)) continue;
      out.y = this.game.world.heightAt(out.x, out.z);
      return out;
    }
    return null;
  }

  /** ¿Se puede estar en este punto? En tierra y sin techo encima (fuera de los edificios). Ajusta la altura. */
  private freeSpot(p: THREE.Vector3): boolean {
    const w = this.game.world;
    if (!w.isLand(p.x, p.z)) return false;
    p.y = w.heightAt(p.x, p.z);
    return !this.game.physics.raycast(tmpQ.set(p.x, p.y + 21, p.z), DOWN, 19.5, G.STATIC);
  }

  // ─────────── Golpes (tarta, turista) ───────────

  private onImpact(v: Vehicle, dv: number) {
    const ev = this.ev;
    if (!ev) return;
    const cur = this.game.mod.vehicles?.current;
    if (ev.kind === 'boda' && ev.stage === 'carry' && v === cur) this.hurtCake(ev, Math.max(0, dv - 2.5) * 9);
    else if (ev.kind === 'turista' && ev.stage === 'ride' && v === ev.ride && dv > 3.5) {
      ev.comfort = Math.max(0, ev.comfort - (dv - 3.5) * 5);
      if (ev.yelpT <= 0) {
        ev.yelpT = 3;
        this.say(ev.npc, TOURIST_YELP[Math.floor(rnd.next() * TOURIST_YELP.length)], 2.5, 1.35);
      }
    }
  }

  private onLanded(v: Vehicle, fall: number, air: number) {
    const ev = this.ev;
    if (!ev) return;
    const cur = this.game.mod.vehicles?.current;
    if (ev.kind === 'boda' && ev.stage === 'carry' && v === cur) this.hurtCake(ev, Math.max(0, fall - 4) * 4);
    else if (ev.kind === 'turista' && ev.stage === 'ride' && v === ev.ride) {
      ev.comfort = Math.max(0, ev.comfort - Math.max(0, fall - 4) * 3);
      if (air > 0.6 && ev.yelpT <= 0) {
        ev.yelpT = 3;
        this.say(ev.npc, TOURIST_AIR[Math.floor(rnd.next() * TOURIST_AIR.length)], 2.5, 1.35);
      }
    }
  }

  private onPlayerHurt(amount: number) {
    const ev = this.ev;
    if (ev?.kind === 'boda' && ev.stage === 'carry' && this.game.mod.player.state === 'foot') this.hurtCake(ev, amount * 0.6);
  }

  private onPlayerJump() {
    const ev = this.ev;
    if (ev?.kind === 'boda' && ev.stage === 'carry' && this.game.mod.player.state === 'foot') {
      this.hurtCake(ev, 6);
      this.game.mod.bubbles?.say(this.game.mod.player, '¡Que es de nata! ¡No saltes!', 1.4);
    }
  }

  private hurtCake(ev: Extract<Ev, { kind: 'boda' }>, loss: number) {
    if (loss < 0.5) return;
    const before = ev.cake;
    ev.cake = Math.max(0, ev.cake - loss);
    const g = this.game;
    if (before >= 60 && ev.cake < 60) g.events.emit('toast', { text: '🎂 ¡La tarta se está torciendo! Conduce fino', color: '#ff9ecf', time: 2 });
    if (before > 0 && ev.cake <= 0) {
      g.events.emit('toast', { text: '🎂💥 La tarta es ya un puré. Llévala igual, algo es algo', color: '#ff4f81', time: 2.5 });
      g.mod.audio?.play('glass', { volume: 0.5 });
    }
  }

  // ─────────── Acabar ───────────

  /** Corta el suceso en marcha sin premio (muerte, arresto, entrar en un interior). */
  abort() {
    if (this.ev) this.end(false);
  }

  private end(ok = false) {
    const g = this.game;
    const ev = this.ev;
    this.ev = null;
    this.clearMarks();
    if (g.hud.waypoint === this.wp) g.hud.waypoint = null;
    this.dropCake();
    if (!ev) return;
    switch (ev.kind) {
      case 'thief':
        this.linger(ev.thief, null, 4);
        this.linger(ev.victim, null, 4);
        break;
      case 'race': {
        // el rival no se queda con el acelerador pisado: frena y se va despacio por su carril
        // (antes salía disparado sin control y se estampaba)
        const r = ev.rival;
        const rb = (r as any).brain as CarBrain | undefined;
        if (rb) {
          rb.mode = 'lane';
          rb.cruise = LEAVE_SPEED;
          rb.reverse = 0;
        }
        r.controls.throttle = 0;
        r.controls.steer = 0;
        r.controls.boost = false;
        this.leaving.push({ v: r, t: 0 });
        break;
      }
      case 'boda':
        for (const n of ev.guests) this.linger(n, null, ok ? 30 : 8);
        break;
      case 'gallina': {
        const h = ev.hen;
        // si la llevaba en brazos, al suelo
        if (h.root.parent && h.root.parent !== g.scene) {
          g.mod.player.rig?.detach(h.root);
          h.root.parent?.remove(h.root);
          h.root.position.copy(g.mod.player.position).add(tmpP.set(0.9, 0, 0.9));
          h.root.rotation.set(0, 0, 0);
          h.root.scale.setScalar(HEN_SCALE);
          g.scene.add(h.root);
        }
        this.linger(null, h.root, ok ? 12 : 6);
        this.linger(ev.owner, null, 10);
        break;
      }
      case 'turista':
        if (ev.npc.vehicle) ev.npc.leaveVehicle();
        this.linger(ev.npc, null, 20);
        break;
      case 'atraco': {
        this.linger(ev.owner, null, 15);
        if (!ok) this.robbersFlee(ev.robbers);
        break;
      }
      default:
        break;
    }
    if (!(ev as any).reported) g.events.emit('event:done' as any, { kind: ev.kind, ok } as any);
  }

  // ─────────── Ladrón de bolsos ───────────

  private startThief(): boolean {
    const g = this.game;
    const roads = this.roads;
    const p = g.mod.player;
    const edges = roads.edgesInRing(p.position, 18, 45, false);
    if (!edges.length) return false;
    const e = roads.g.edges[edges[Math.floor(rnd.next() * edges.length)]];
    const pos = roads.lanePoint(e.id, 1, 0.5, e.width / 2 + 1.3, new THREE.Vector3());
    const victim = g.mod.npcs.spawn('civil', randomLookFor(rng, 'abuela'), pos.clone());
    const thief = g.mod.npcs.spawn('civil', randomLookFor(rng, 'civil'), pos.clone().add(new THREE.Vector3(1.5, 0, 0)));
    victim.transient = thief.transient = false;
    thief.hostile = true;
    thief.killable = false;
    thief.runSpeed = 6.2;
    thief.health = thief.maxHealth = 40;
    const away = pos.clone().add(new THREE.Vector3((rnd.next() - 0.5) * 120, 0, (rnd.next() - 0.5) * 120));
    thief.goTo(away, true);
    victim.customPose = 'hands_up';
    victim.setState('custom');
    g.mod.bubbles?.say(victim, '¡AL LADRÓN! ¡Mi bolso! ¡Que alguien le pare!', 3.5);
    g.mod.audio?.say(victim.position, 6, 1.4, 0.8);
    g.events.emit('toast', { text: '👜 ¡Un ladrón de bolsos! Tíralo al suelo para recuperarlo', color: '#ff7b54', time: 3 });
    this.ev = { kind: 'thief', thief, victim, bag: true, t: 0 };
    return true;
  }

  private tickThief(ev: Extract<Ev, { kind: 'thief' }>) {
    const g = this.game;
    const p = g.mod.player;
    const th = ev.thief;
    if (ev.bag) {
      this.mark(th.position.x, th.position.z, '👜', '#ff7b54', 'Ladrón', true);
      if (th.busy && th.state !== 'flee') {
        // derribado: suelta el bolso
        ev.bag = false;
        const pos = th.position.clone();
        g.mod.bubbles?.say(th, '¡Vale, vale! ¡Toma tu bolso!', 2);
        g.mod.pickups?.spawn('package', pos, 1, 60, () => {
          ev.gotBag = true;
          g.events.emit('toast', { text: 'Bolso recuperado: devuélveselo a la señora', color: '#ff7b54' });
        });
        th.hostile = false;
        th.setState('flee');
      } else if (!th.target) {
        th.goTo(th.position.clone().add(new THREE.Vector3((rnd.next() - 0.5) * 60, 0, (rnd.next() - 0.5) * 60)), true);
      }
      if (ev.t > 70 || th.position.distanceTo(p.position) > 150) {
        g.mod.bubbles?.say(ev.victim, 'Nada, que se ha escapado… Mi bolso de la suerte…', 3);
        this.end(false);
      }
    } else if (ev.gotBag) {
      const v = ev.victim;
      this.mark(v.position.x, v.position.z, '👵', '#ff7b54', 'Señora');
      this.gps(v.position.x, v.position.z, 'Señora', '#ff7b54');
      if (p.state === 'foot' && p.position.distanceTo(v.position) < 2.5) {
        g.mod.bubbles?.say(v, '¡Ay, hijo, qué majo! Toma, para un café. O para diez.', 3.5);
        g.mod.economy?.addCash(150, 'recompensa');
        g.mod.economy?.addFame(20, 'buena acción');
        g.mod.audio?.play('success');
        this.end(true);
      }
    } else if (ev.t > 100) this.end(false);
  }

  // ─────────── Furgón que pierde paquetes ───────────

  private startTruck(): boolean {
    const g = this.game;
    const edges = this.roads.edgesInRing(g.mod.player.position, 40, 90, true);
    if (!edges.length) return false;
    const eid = edges[Math.floor(rnd.next() * edges.length)];
    const truck = g.mod.traffic.spawnCar(eid, 1, 0.3, 'truck');
    if (!truck) return false;
    truck.transient = false;
    g.mod.messages?.receive('radio-macuto', 'Radio Macuto', '📻', 'Aviso: un furgón de reparto va perdiendo paquetes por el barrio. Quien los encuentre, que se los quede. O que los devuelva. Tú sabrás.');
    this.ev = { kind: 'truck', truck, drops: 0, found: 0, t: 0, next: 2 };
    return true;
  }

  private tickTruck(ev: Extract<Ev, { kind: 'truck' }>, dt: number) {
    const g = this.game;
    const tr = ev.truck;
    ev.next -= dt;
    if (!tr.destroyed && !tr.disposed) {
      const tp = tr.getPosition(tmpV);
      this.mark(tp.x, tp.z, '🚚', '#ffd23f', 'Furgón');
    }
    if (ev.next <= 0 && ev.drops < 4 && !tr.destroyed) {
      ev.next = 3 + rnd.next() * 2;
      ev.drops++;
      const back = tr.localToWorld(new THREE.Vector3(0, 0, -tr.spec.half.z - 1), new THREE.Vector3());
      back.y = g.world.heightAt(back.x, back.z);
      g.mod.particles?.emit('cardboard', back, { count: 5 });
      g.mod.audio?.play('drop', { pos: back });
      g.mod.pickups?.spawn('package', back, 1, 90, () => {
        g.mod.economy?.addCash(60, 'paquete encontrado');
        g.events.emit('toast', { text: '📦 Paquete encontrado: +60 € (nadie lo reclamará… probablemente)', color: '#ffd23f' });
        // el primer paquete encontrado ya cuenta como suceso resuelto (aunque el furgón se haya ido)
        if (ev.found++ === 0) {
          ev.reported = true;
          g.events.emit('event:done' as any, { kind: 'truck', ok: true } as any);
        }
      });
    }
    if (ev.t > 30) this.end(false);
  }

  // ─────────── Carrera callejera ───────────

  private startRace(): boolean {
    const g = this.game;
    const roads = this.roads;
    // carrera: rival deportivo en la calle más cercana, en su carril y mirando hacia la ruta
    const cur = g.mod.vehicles.current as Vehicle | null;
    if (!cur || g.mod.player.state !== 'vehicle') return false;
    const cpos = cur.getPosition(new THREE.Vector3());
    const ne = roads.nearestEdge(cpos, true);
    if (!ne) return false;
    const e = roads.g.edges[ne.edge];
    // arranca hacia donde mira el jugador; si por ahí la ruta sale muy corta (fondo de saco), al revés
    const ahead: 1 | -1 = Math.cos(cur.heading - roads.heading(ne.edge, 1)) >= 0 ? 1 : -1;
    const tOf = (d: 1 | -1) => (d === 1 ? ne.t : 1 - ne.t);
    let dir = ahead;
    let legs = this.raceRoute(ne.edge, dir, ne.t);
    if (this.routeLen(legs, tOf(dir)) < 300) {
      const bdir = -ahead as 1 | -1;
      const back = this.raceRoute(ne.edge, bdir, ne.t);
      if (this.routeLen(back, tOf(bdir)) > this.routeLen(legs, tOf(dir))) {
        dir = bdir;
        legs = back;
      }
    }
    const tDir = tOf(dir);
    // puntos de control: al final de un tramo cada ~110 m de ruta (máximo 5); el último, la meta
    const cps: THREE.Vector3[] = [];
    const cpLeg: number[] = [];
    let acc = roads.length(ne.edge) * (1 - tDir);
    for (let i = 0; i < legs.length; i++) {
      if (i > 0) acc += roads.length(legs[i].edge);
      const last = i === legs.length - 1;
      if (acc < RACE_CP_GAP && !last) continue;
      const end = this.legEnd(legs[i]);
      // una meta pegada al punto anterior: mejor que la meta sea esta y quitar el anterior
      if (last && acc < 50 && cps.length) {
        cps.pop();
        cpLeg.pop();
      }
      cps.push(end.clone());
      cpLeg.push(i);
      acc = 0;
      if (cps.length >= 5) {
        legs.length = i + 1;
        break;
      }
    }
    if (cps.length < 2) return false;
    // sitio de salida: en su carril, al lado del jugador si cabe o un poco por delante/detrás (nunca encima)
    const len = roads.length(ne.edge) || 1;
    let pos: THREE.Vector3 | null = null;
    let tStart = tDir;
    for (const dm of [0, 10, -10, 18, -18, 28]) {
      const tt = tDir + dm / len;
      if (tt < 0.03 || tt > 0.97) continue;
      const cand = roads.lanePoint(ne.edge, dir, tt, e.width / 4, new THREE.Vector3());
      if (cand.distanceTo(cpos) < 5.5 || g.mod.vehicles.nearest(cand, 4)) continue;
      pos = cand;
      tStart = tt;
      break;
    }
    if (!pos) return false;
    const rival = g.mod.vehicles.spawn('sports', pos, roads.heading(ne.edge, dir), '#e63946');
    rival.transient = false;
    const driver = g.mod.npcs.spawn('driver', randomLookFor(rng, 'fiestero'), pos);
    driver.enterVehicle(rival);
    // conduce como el tráfico (carril, esquinas, frenar ante obstáculos) pero siguiendo la ruta de la carrera;
    // va algo más despacio que el vehículo del jugador a tope, para que se le pueda ganar conduciendo bien
    const cruise = THREE.MathUtils.clamp(cur.spec.maxSpeed * 0.6, 13, 20);
    (rival as any).brain = {
      edge: ne.edge, dir, t: tStart, next: legs[1] ? { ...legs[1] } : null,
      cruise: 0, blocked: 0, stuck: 0, reverse: 0, honked: 0, mode: 'lane',
    } as CarBrain;
    this.ev = {
      kind: 'race', rival, checkpoints: cps, idx: 0, rivalIdx: 0, t: 0, started: false, accepted: false,
      legs, cpLeg, leg: 0, cruise, stuckT: 0, anchor: pos.clone(),
    };
    g.mod.bubbles?.say(driver, '¿Una carrerita, repartidor? ¡Al que llegue primero, 500 pavos!', 4);
    g.mod.messages?.receive('carrera', 'El Niño Nitro', '🏎️', '¿Te atreves? Carrera hasta el último punto. Si ganas, 500 €. Si pierdes, me das 200.', [
      { label: '¡Vamos!', style: 'si', run: () => this.acceptRace(), valid: () => this.ev?.kind === 'race' && !this.ev.accepted },
      { label: 'Paso', style: 'no', run: () => this.end(false), valid: () => this.ev?.kind === 'race' && !this.ev.accepted },
    ]);
    return true;
  }

  /**
   * Ruta de la carrera desde una calle en un sentido: se encadenan calles (sin callejones, que son
   * estrechos) sin volver a pasar por un cruce si se puede, hasta unos 650 m.
   */
  private raceRoute(edge: number, dir: 1 | -1, t: number): Leg[] {
    const R = this.roads;
    const Gr = R.g;
    const legs: Leg[] = [{ edge, dir }];
    const e0 = Gr.edges[edge];
    const visited = new Set<number>([e0.a, e0.b]);
    let total = R.length(edge) * (dir === 1 ? 1 - t : t);
    while (total < RACE_LEN && legs.length < 16) {
      const last = legs[legs.length - 1];
      const le = Gr.edges[last.edge];
      const node = last.dir === 1 ? le.b : le.a;
      const opts = (Gr.adjacency[node] ?? []).filter((id) => id !== last.edge && !Gr.edges[id].alley);
      const fresh = opts.filter((id) => !visited.has(Gr.edges[id].a === node ? Gr.edges[id].b : Gr.edges[id].a));
      const from = fresh.length ? fresh : opts;
      if (!from.length) break;
      const id = from[Math.floor(rnd.next() * from.length)];
      const ne = Gr.edges[id];
      const ndir: 1 | -1 = ne.a === node ? 1 : -1;
      visited.add(ndir === 1 ? ne.b : ne.a);
      legs.push({ edge: id, dir: ndir });
      total += R.length(id);
    }
    return legs;
  }

  /** Metros de una ruta (del primer tramo solo lo que queda desde la fracción t0). */
  private routeLen(legs: Leg[], t0: number): number {
    const R = this.roads;
    let d = R.length(legs[0].edge) * (1 - t0);
    for (let i = 1; i < legs.length; i++) d += R.length(legs[i].edge);
    return d;
  }

  /** Cruce en el que acaba un tramo. */
  private legEnd(l: Leg): THREE.Vector3 {
    const R = this.roads;
    const e = R.g.edges[l.edge];
    return R.g.nodes[l.dir === 1 ? e.b : e.a].pos;
  }

  /**
   * El rival lleva un rato sin avanzar (empotrado, encajado contra el jugador…): se le recoloca unos
   * metros más adelante en su carril de la ruta, mirando hacia donde tiene que ir.
   */
  private unstickRival(ev: Extract<Ev, { kind: 'race' }>) {
    const R: Roads | undefined = this.game.mod.traffic?.roads;
    const rv = ev.rival;
    const rb = (rv as any).brain as CarBrain | undefined;
    if (!R || !rb) return;
    rv.getPosition(tmpV);
    let k = ev.leg;
    let leg = ev.legs[k];
    let [a, b] = R.ends(R.g.edges[leg.edge], leg.dir);
    let L = R.length(leg.edge) || 1;
    let tt = ((tmpV.x - a.x) * (b.x - a.x) + (tmpV.z - a.z) * (b.z - a.z)) / (L * L) + 8 / L;
    const vm = this.game.mod.vehicles;
    for (let tries = 0; tries < 6; tries++) {
      if (tt > 0.92 && ev.legs[k + 1]) {
        k++;
        leg = ev.legs[k];
        [a, b] = R.ends(R.g.edges[leg.edge], leg.dir);
        L = R.length(leg.edge) || 1;
        tt = Math.min(0.5, 6 / L);
      }
      tt = THREE.MathUtils.clamp(tt, 0.05, 0.95);
      R.lanePoint(leg.edge, leg.dir, tt, R.g.edges[leg.edge].width / 4, tmpP);
      // que no caiga encima de otro coche ni del jugador
      if (!vm.nearest(tmpP, 3.5, (x: Vehicle) => x !== rv) && tmpP.distanceTo(this.game.mod.player.position) > 3.5) break;
      tt += 8 / L;
    }
    rv.place(tmpP, R.heading(leg.edge, leg.dir));
    rb.edge = leg.edge;
    rb.dir = leg.dir;
    rb.t = tt;
    rb.next = ev.legs[k + 1] ? { ...ev.legs[k + 1] } : null;
    rb.reverse = rb.stuck = rb.blocked = 0;
    rb.bypass = rb.jam = rb.tries = 0;
    ev.leg = k;
    ev.anchor.copy(tmpP);
    ev.stuckT = 0;
    this.game.mod.particles?.emit('smoke', tmpP, { count: 6 });
  }

  private acceptRace() {
    const ev = this.ev;
    if (!ev || ev.kind !== 'race') return;
    ev.accepted = true;
    ev.t = 0;
    ev.stuckT = 0;
    ev.rival.getPosition(ev.anchor);
    const rb = (ev.rival as any).brain as CarBrain | undefined;
    if (rb) rb.cruise = ev.cruise;
    this.game.events.emit('toast', { text: '🏁 3… 2… 1… ¡YA!', color: '#ffd23f', time: 2 });
    this.game.mod.audio?.play('bell');
  }

  /** Rivales que se van: conducen como el tráfico y desaparecen cuando ya están lejos. */
  private tickLeaving(dt: number) {
    const g = this.game;
    const vm = g.mod.vehicles;
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i];
      const v = l.v;
      l.t += dt;
      const mine = v === vm?.current;
      const d = v.driver && v.driver.kind === 'npc' ? v.driver.npc : null;
      const far = v.disposed || v.getPosition(tmpV).distanceTo(g.mod.player.position) > LEAVE_DIST;
      if (v.disposed || mine || (l.t > LEAVE_MIN_T && far) || l.t > LEAVE_MAX_T) {
        // si el jugador se lo ha quitado, el coche es suyo: solo se deja de conducir
        if (!mine && !v.disposed) {
          if (d) g.mod.npcs?.remove(d);
          vm?.remove(v);
        }
        this.leaving.splice(i, 1);
      } else if (d && !v.destroyed) g.mod.traffic?.drive(v, dt);
    }
  }

  private tickRace(ev: Extract<Ev, { kind: 'race' }>, dt: number) {
    const g = this.game;
    const cur = g.mod.vehicles.current as Vehicle | null;
    const cp = ev.checkpoints;
    if (ev.idx < cp.length) this.mark(cp[ev.idx].x, cp[ev.idx].z, '🏁', '#ffd23f', 'Carrera');
    const rv = ev.rival;
    const rb = (rv as any).brain as CarBrain | undefined;
    if (!ev.accepted) {
      if (rb) rb.cruise = 0;
      rv.controls.throttle = 0;
      rv.controls.handbrake = true;
      if (ev.t > 25) this.end(false);
      return;
    }
    // rival: conduce por su carril y en cada cruce sigue la ruta de la carrera
    if (rb && rv.driver?.kind === 'npc' && !rv.destroyed) {
      rb.mode = 'lane';
      const legs = ev.legs;
      for (let k = ev.leg; k < legs.length; k++) {
        if (legs[k].edge === rb.edge && legs[k].dir === rb.dir) {
          ev.leg = k;
          break;
        }
      }
      const nx = legs[ev.leg + 1];
      if (nx && (!rb.next || rb.next.edge !== nx.edge || rb.next.dir !== nx.dir)) rb.next = { edge: nx.edge, dir: nx.dir };
      // puntos superados: los de tramos ya pasados, o el del tramo actual al llegar a él
      const rp = rv.getPosition(tmpV);
      while (ev.rivalIdx < cp.length && (ev.cpLeg[ev.rivalIdx] < ev.leg || (ev.cpLeg[ev.rivalIdx] === ev.leg && rp.distanceTo(cp[ev.rivalIdx]) < 12))) ev.rivalIdx++;
      // atascado (contra una pared, encajado con el jugador…): tras unos segundos se le recoloca en su calle
      if (rp.distanceTo(ev.anchor) > 4) {
        ev.anchor.copy(rp);
        ev.stuckT = 0;
      } else if ((ev.stuckT += dt) > RACE_STUCK) this.unstickRival(ev);
      g.mod.traffic?.drive(rv, dt);
    }
    // jugador
    if (cur && ev.idx < cp.length && cur.getPosition(tmpV).distanceTo(cp[ev.idx]) < 14) {
      ev.idx++;
      g.mod.audio?.play('coin');
    }
    if (ev.idx >= cp.length) {
      g.events.emit('toast', { text: '🏆 ¡Has ganado la carrera! +500 €', color: '#ffd23f', time: 3 });
      g.mod.economy?.addCash(500, 'carrera');
      g.mod.economy?.addFame(30, 'carrera');
      g.mod.audio?.play('cheer');
      this.end(true);
    } else if (ev.rivalIdx >= cp.length) {
      g.events.emit('toast', { text: '😤 Ha ganado El Niño Nitro. −200 €', color: '#ff4f81', time: 3 });
      g.mod.economy?.spend(Math.min(200, (g.mod.economy?.cash ?? 0) + (g.mod.economy?.bank ?? 0)), 'carrera');
      this.end(false);
    } else if (ev.t > 150) this.end(false);
  }

  // ─────────── Boda en la plaza: ¡falta la tarta! ───────────

  private startBoda(): boolean {
    const g = this.game;
    const plaza = g.world.pois.find((x) => x.kind === 'fountain');
    if (!plaza) return false;
    const from = this.playerPos(new THREE.Vector3());
    if (from.distanceTo(plaza.door) > 330) return false;
    // la pastelería: una tienda o un bar a 25-240 m del jugador y lejos de la plaza (que haya viaje)
    const cands = g.world.pois.filter((x) => (x.kind === 'shop' || x.kind === 'bar') && x.door.distanceTo(from) > 25 && x.door.distanceTo(from) < 240 && x.door.distanceTo(plaza.door) > 60);
    if (!cands.length) return false;
    cands.sort((a, b) => a.door.distanceTo(from) - b.door.distanceTo(from));
    const shop = cands[Math.floor(rnd.next() * Math.min(2, cands.length))];
    const jobs = g.mod.jobs;
    const rd = (a: THREE.Vector3, b: THREE.Vector3) => (jobs?.roadDist ? jobs.roadDist(a, b) : a.distanceTo(b) * 1.35);
    const inCar = g.mod.player.state === 'vehicle';
    const road = rd(from, shop.door) + rd(shop.door, plaza.door);
    const limit = Math.max(60, Math.ceil((25 + road / (inCar ? 8.5 : 6)) / 5) * 5);
    const lvl = g.mod.economy?.fameLevel ?? 1;
    const pay = Math.round((260 + 30 * (lvl - 1)) / 10) * 10;
    const c = client('bodas');
    this.ev = {
      kind: 'boda', stage: 'offer', t: 0, left: limit, limit, shop, plaza: plaza.door.clone(), plazaFacing: plaza.facing,
      cake: 100, guests: [], partyT: 0, pay, warnT: 0,
    };
    const msg = `¡EMERGENCIA NUPCIAL! 💍 Boda en la plaza de la fuente y el pastelero ha dejado la tarta en ${shop.name} (no preguntes). Tráemela en ${limit} s o los novios se casan con un paquete de galletas. Te pago ${pay} €. ¡Es de nata: ojo con los baches! 🎂`;
    g.mod.messages?.receive('cliente-bodas', c?.name ?? 'Paquita (organiza bodas)', c?.avatar ?? '💍', msg, [
      { label: '¡Voy volando!', style: 'si', run: () => this.acceptBoda(), valid: () => this.ev?.kind === 'boda' && this.ev.stage === 'offer' },
      { label: 'Paso', style: 'no', run: () => this.end(false), valid: () => this.ev?.kind === 'boda' && this.ev.stage === 'offer' },
    ]);
    return true;
  }

  private acceptBoda() {
    const ev = this.ev;
    if (!ev || ev.kind !== 'boda' || ev.stage !== 'offer') return;
    ev.stage = 'pickup';
    this.game.mod.messages?.reply('cliente-bodas', '¡Voy volando! Bueno, en lo que tenga 🎂');
    this.game.events.emit('toast', { text: `🎂 ¡A por la tarta! Está en ${ev.shop.name}`, color: '#ff9ecf', time: 2.5 });
    this.game.mod.audio?.play('bell');
  }

  /** La tarta en las manos (a pie) o dentro del vehículo (no se ve). */
  private holdCake(on: boolean) {
    const p = this.game.mod.player;
    if (on && !this.cakeHeld && p.rig) {
      this.cakeHeld = makeCake();
      this.cakeHeld.position.set(0, -0.15, 0.32);
      this.cakeHeld.scale.setScalar(0.9);
      p.rig.attach('chest', this.cakeHeld);
    } else if (!on) this.dropCake();
  }

  private dropCake() {
    const m = this.cakeHeld;
    if (!m) return;
    this.game.mod.player.rig?.detach(m);
    m.parent?.remove(m);
    this.cakeHeld = null;
  }

  /** Los novios y los invitados, alrededor de la fuente. */
  private spawnWedding(ev: Extract<Ev, { kind: 'boda' }>) {
    const g = this.game;
    const f = ev.plazaFacing;
    const fx = Math.sin(f), fz = Math.cos(f);
    const rx = Math.cos(f), rz = -Math.sin(f);
    const base = ev.plaza;
    const spots: [number, number, 'novia' | 'novio' | 'invitado'][] = [
      [2.2, -0.7, 'novia'], [2.2, 0.7, 'novio'], [4.2, -2.4, 'invitado'], [4.6, 0, 'invitado'], [4.2, 2.4, 'invitado'], [3, 3.6, 'invitado'],
    ];
    for (const [ahead, side, who] of spots) {
      const pos = new THREE.Vector3(base.x + fx * ahead + rx * side, 0, base.z + fz * ahead + rz * side);
      if (!this.freeSpot(pos)) pos.set(base.x + rx * side, 0, base.z + rz * side);
      pos.y = g.world.heightAt(pos.x, pos.z);
      const look = randomLookFor(rng, who === 'invitado' ? (rnd.next() < 0.5 ? 'rico' : 'fiestero') : 'civil');
      if (who === 'novia') {
        look.shirt = '#ffffff';
        look.pants = '#ffffff';
        look.shoes = '#f4f4f4';
        look.hair = 'moño';
        look.cap = false;
        look.jacket = null;
      } else if (who === 'novio') {
        look.shirt = '#ffffff';
        look.jacket = '#1b1b2a';
        look.pants = '#1b1b2a';
        look.shoes = '#111111';
        look.cap = false;
      } else look.cap = false;
      const n = g.mod.npcs.spawn('civil', look, pos, f + Math.PI);
      n.transient = false;
      n.customPose = who === 'invitado' ? 'phone' : 'normal';
      n.setState('custom');
      n.face(g.mod.player.position);
      ev.guests.push(n);
    }
  }

  private tickBoda(ev: Extract<Ev, { kind: 'boda' }>, dt: number) {
    const g = this.game;
    const p = g.mod.player;
    const inCar = p.state === 'vehicle';
    const pp = this.playerPos(tmpV);
    if (ev.stage === 'offer') {
      if (ev.t > 30) {
        g.mod.messages?.receive('cliente-bodas', client('bodas')?.name ?? 'Paquita', '💍', 'Da igual, ya se lo he pedido a otro. Bueno, a nadie. Galletas. 🍪', undefined, false);
        this.end(false);
      }
      return;
    }
    if (ev.stage === 'party') {
      ev.partyT += dt;
      // (a alguno lo habrá atropellado el propio repartidor al llegar: en cuanto se levanta, a bailar)
      for (const n of ev.guests) if (!n.busy && n.state !== 'dance' && !n.removed) n.setState('dance');
      // fiesta: confeti a ratos y los novios bailando
      if (Math.floor(ev.partyT * 2) !== Math.floor((ev.partyT - dt) * 2) && ev.partyT < 5) {
        const c = tmpP.copy(ev.plaza).setY(ev.plaza.y + 2);
        g.mod.particles?.emit('confetti', c, { count: 14, speed: 1.2 });
      }
      if (ev.partyT > 7) this.end(true);
      return;
    }
    ev.left -= dt;
    if (ev.left <= 0) {
      g.events.emit('toast', { text: '⌛ Los novios se han casado con un paquete de galletas. 🍪', color: '#ff4f81', time: 3 });
      g.mod.messages?.receive('cliente-bodas', client('bodas')?.name ?? 'Paquita', '💍', 'Se han casado sin tarta. Han brindado con galletas mojadas. Ha sido precioso y horrible a la vez. 😭', undefined, false);
      for (const n of ev.guests) {
        n.customPose = 'normal';
        n.setState('idle');
      }
      g.mod.audio?.play('fail', { volume: 0.6 });
      this.end(false);
      return;
    }
    if (ev.stage === 'pickup') {
      const d = ev.shop.door;
      this.mark(d.x, d.z, '🎂', '#ff9ecf', 'Tarta');
      this.gps(d.x, d.z, 'Tarta', '#ff9ecf');
      this.showCard(`🎂 Tarta de boda · recoger en ${ev.shop.name}`, ev.left, null, '#ff9ecf');
      if (pp.distanceTo(d) < (inCar ? 9 : 3.5)) {
        ev.stage = 'carry';
        this.say(d, '¡Cuidado, que es de tres pisos y de nata! ¡Ni un bache!', 3, 1.2);
        g.mod.audio?.play('pickup');
        g.events.emit('toast', { text: '🎂 ¡Tarta cargada! Llévala a la plaza de la fuente sin romperla', color: '#ff9ecf', time: 2.5 });
      }
      return;
    }
    // llevándola
    const pl = ev.plaza;
    this.holdCake(!inCar);
    this.mark(pl.x, pl.z, '💍', '#ff9ecf', 'Boda');
    this.gps(pl.x, pl.z, 'Boda', '#ff9ecf');
    this.showCard('🎂 Tarta nupcial · a la plaza de la fuente', ev.left, ev.cake, '#ff9ecf');
    if (!ev.guests.length && pp.distanceTo(pl) < 110) this.spawnWedding(ev);
    if (pp.distanceTo(pl) < (inCar ? 14 : 5.5)) this.celebrate(ev);
  }

  private celebrate(ev: Extract<Ev, { kind: 'boda' }>) {
    const g = this.game;
    this.dropCake();
    if (!ev.guests.length) this.spawnWedding(ev);
    ev.stage = 'party';
    ev.partyT = 0;
    // la tarta, en una mesita delante de los novios (torcida si ha sufrido)
    const table = makeTable();
    const f = ev.plazaFacing;
    table.position.set(ev.plaza.x + Math.sin(f) * 3.6, 0, ev.plaza.z + Math.cos(f) * 3.6);
    table.position.y = g.world.heightAt(table.position.x, table.position.z);
    table.rotation.y = f;
    const cake = makeCake();
    cake.position.set(0, 0.81, 0);
    cake.scale.setScalar(1.7);
    cake.rotation.z = ev.cake < 40 ? 0.35 : ev.cake < 90 ? 0.12 : 0;
    table.add(cake);
    g.scene.add(table);
    this.linger(null, table, 30);
    for (const n of ev.guests) {
      if (n.busy) continue;
      n.setState('dance');
      n.face(table.position);
    }
    const k = ev.cake >= 90 ? 1 : ev.cake >= 40 ? 0.45 + ev.cake / 200 : 0.3;
    const fast = ev.left / ev.limit > 0.3;
    const pay = Math.max(20, Math.round((ev.pay * k * (fast ? 1.15 : 1)) / 5) * 5);
    const bride = ev.guests[0];
    const line = ev.cake >= 90
      ? '¡Es perfecta! ¡Vivan los novios! ¡Y viva el repartidor!'
      : ev.cake >= 40
        ? 'Está un poco torcida. Como el novio. ¡Da igual, a comer!'
        : 'Es… un puré de tarta. Nos la comemos con pajita. ¡Vivan los novios!';
    if (bride) this.say(bride, line, 4, 1.3);
    g.mod.economy?.addCash(pay, 'boda');
    g.mod.economy?.addFame(ev.cake >= 40 ? 25 : 8, 'boda');
    g.mod.audio?.play('cheer');
    g.mod.audio?.play('bell');
    g.mod.particles?.emit('confetti', tmpP.copy(ev.plaza).setY(ev.plaza.y + 2), { count: 30, speed: 1.4 });
    g.events.emit('toast', { text: `💍 ¡Boda salvada! +${pay} €${fast && ev.cake >= 90 ? ' (con propina por rápido)' : ''}`, color: '#ff9ecf', time: 3 });
    g.mod.messages?.receive('cliente-bodas', client('bodas')?.name ?? 'Paquita', '💍', ev.cake >= 90 ? '¡Has salvado la boda! Los novios quieren ponerle tu nombre a su primer hijo. O a su primer perro. 🥂' : 'Ha llegado… algo. Los novios dicen que es arte moderno. Gracias igualmente. 🥂', undefined, false);
  }

  // ─────────── La gallina fugitiva ───────────

  private startGallina(): boolean {
    const g = this.game;
    const home = this.sidewalkSpot(14, 32, new THREE.Vector3());
    if (!home) return false;
    const look = randomLookFor(rng, 'civil');
    look.shirt = '#2a9d8f';
    look.cap = true;
    look.capColor = '#f4e285';
    const owner = g.mod.npcs.spawn('civil', look, home.clone());
    owner.transient = false;
    owner.voice = 0.75;
    owner.customPose = 'hands_up';
    owner.setState('custom');
    owner.face(g.mod.player.position);
    const m = makeHen();
    const pos = home.clone().add(new THREE.Vector3(1.4, 0, 0.6));
    m.root.position.copy(pos);
    g.scene.add(m.root);
    const hen: Hen = {
      ...m, pos: pos.clone(), heading: rnd.next() * Math.PI * 2, y: 0, vy: 3.5, tired: 0, jumpCd: 1.5,
      wanderT: 0, wander: rnd.next() * 6.28, avoid: 0, avoidT: 0, cluckT: 0.5, speed: 0,
    };
    this.ev = { kind: 'gallina', stage: 'loose', t: 0, left: 100, hen, owner, home: home.clone(), warnedCar: false };
    this.say(owner, '¡LA TURULETA! ¡Que se me escapa la gallina! ¡100 € al que me la traiga!', 4, 0.75);
    g.events.emit('toast', { text: '🐔 ¡Gallina a la fuga! Atrápala a pie y devuélvesela a su dueño', color: '#f4a261', time: 3 });
    g.mod.particles?.emit('confetti', pos.clone().setY(pos.y + 0.6), { count: 6, speed: 0.6 });
    return true;
  }

  private cluck(h: Hen, text?: string) {
    this.game.mod.bubbles?.say(h.pos, text ?? HEN_CLUCKS[Math.floor(rnd.next() * HEN_CLUCKS.length)], 1.1);
    this.game.mod.audio?.say(h.pos, 2, 1.9, 0.55);
  }

  private tickGallina(ev: Extract<Ev, { kind: 'gallina' }>, dt: number) {
    const g = this.game;
    const p = g.mod.player;
    const h = ev.hen;
    const o = ev.owner;
    ev.left -= dt;
    if (ev.stage === 'caught') {
      // en brazos: aletea de vez en cuando y protesta
      h.cluckT -= dt;
      const flap = h.cluckT < 0.4 ? Math.sin(ev.t * 32) : 0;
      h.wingL.rotation.z = -0.15 - Math.max(0, flap) * 1.1;
      h.wingR.rotation.z = 0.15 + Math.max(0, flap) * 1.1;
      if (h.cluckT <= 0) {
        h.cluckT = 2.5 + rnd.next() * 2.5;
        this.game.mod.bubbles?.say(p, HEN_CLUCKS[Math.floor(rnd.next() * HEN_CLUCKS.length)], 1);
        g.mod.audio?.say(p.position, 2, 1.9, 0.5);
      }
      this.mark(o.position.x, o.position.z, '👨‍🌾', '#f4a261', 'Dueño');
      this.gps(o.position.x, o.position.z, 'Dueño', '#f4a261');
      this.showCard('🐔 Devuelve a la Turuleta a su dueño', Math.max(0, ev.left), null, '#f4a261');
      if (p.state === 'foot' && p.position.distanceTo(o.position) < 2.8) {
        // ¡entregada!
        p.rig?.detach(h.root);
        h.root.parent?.remove(h.root);
        h.root.position.copy(o.position).add(tmpP.set(0.8, 0, 0.8));
        h.root.rotation.set(0, rnd.next() * 6, 0);
        h.root.scale.setScalar(HEN_SCALE);
        h.wingL.rotation.z = -0.15;
        h.wingR.rotation.z = 0.15;
        g.scene.add(h.root);
        o.customPose = 'normal';
        o.setState('idle');
        o.face(p.position);
        this.say(o, '¡Turuleta, mi reina! Toma tu recompensa y una docena de huevos. Bueno, los huevos cuando los ponga.', 4, 0.75);
        const pay = ev.left > 50 ? 130 : 100;
        g.mod.economy?.addCash(pay, 'gallina');
        g.mod.economy?.addFame(15, 'gallina');
        g.mod.audio?.play('success');
        g.events.emit('toast', { text: `🐔 ¡Gallina devuelta! +${pay} €`, color: '#f4a261', time: 2.5 });
        this.end(true);
        return;
      }
      if (ev.left < -60) this.end(false);
      return;
    }
    // suelta: huye del jugador (y de los coches), se cansa si la persigues de cerca
    const pp = this.playerPos(tmpV);
    const dx = h.pos.x - pp.x, dz = h.pos.z - pp.z;
    const d = Math.hypot(dx, dz);
    let want = h.wander;
    let speed = 1.1;
    if (d < 11) {
      want = Math.atan2(dx, dz) + Math.sin(ev.t * 2.3 + h.wander) * 0.8;
      if (d < 5) h.tired += dt;
      speed = Math.max(3.4, 6.8 - h.tired * 0.3);
      if (d < 2.6 && h.jumpCd <= 0 && h.y <= 0 && rnd.next() < 0.45) {
        h.vy = 4.2;
        h.jumpCd = 2.2;
        this.cluck(h);
        g.mod.particles?.emit('confetti', tmpP.copy(h.pos).setY(h.pos.y + 0.6), { count: 4, speed: 0.5, scale: 0.6 });
      }
    } else {
      h.tired = Math.max(0, h.tired - dt * 0.4);
      h.wanderT -= dt;
      if (h.wanderT <= 0) {
        h.wanderT = 1.5 + rnd.next() * 2.5;
        h.wander = rnd.next() * Math.PI * 2;
      }
    }
    // los coches no la pillan: salta y se aparta
    const car = g.mod.vehicles?.nearest(h.pos, 4.5, (v: Vehicle) => Math.abs(v.speed) > 2 && !v.destroyed);
    if (car) {
      const cp = car.getPosition(tmpP);
      want = Math.atan2(h.pos.x - cp.x, h.pos.z - cp.z);
      speed = Math.max(speed, 6);
      if (h.y <= 0 && h.jumpCd <= 0) {
        h.vy = 5;
        h.jumpCd = 1.2;
        this.cluck(h, '¡COCOCÓ!');
      }
    }
    if (p.state === 'vehicle' && d < 5 && !ev.warnedCar) {
      ev.warnedCar = true;
      g.events.emit('toast', { text: '🐔 Bájate del coche: las gallinas se cogen a mano (y sin atropellarlas)', color: '#f4a261', time: 3 });
    }
    // paredes: mira delante cada poco y gira hacia donde haya hueco
    h.avoidT -= dt;
    if (h.avoidT <= 0 && speed > 0.5) {
      h.avoidT = 0.15;
      h.avoid = 0;
      const o0 = tmpP.copy(h.pos).setY(h.pos.y + h.y + 0.45);
      for (const turn of [0, 0.9, -0.9, 1.8, -1.8, Math.PI]) {
        const a = want + turn;
        tmpQ.set(Math.sin(a), 0, Math.cos(a));
        const nx = h.pos.x + tmpQ.x * 1.4, nz = h.pos.z + tmpQ.z * 1.4;
        if (!g.world.isLand(nx, nz)) continue;
        if (g.physics.raycast(o0, tmpQ, 1.2, SOLID | G.VEHICLE)) continue;
        h.avoid = turn;
        break;
      }
    }
    want += h.avoid;
    let dh = want - h.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    h.heading += dh * Math.min(1, dt * 9);
    h.speed += (speed - h.speed) * Math.min(1, dt * 6);
    const nx = h.pos.x + Math.sin(h.heading) * h.speed * dt;
    const nz = h.pos.z + Math.cos(h.heading) * h.speed * dt;
    if (g.world.isLand(nx, nz)) {
      h.pos.x = nx;
      h.pos.z = nz;
    } else h.wander = h.heading + Math.PI;
    h.jumpCd -= dt;
    if (h.y > 0 || h.vy > 0) {
      h.vy -= 13 * dt;
      h.y = Math.max(0, h.y + h.vy * dt);
      if (h.y <= 0) h.vy = 0;
    }
    h.pos.y = g.world.heightAt(h.pos.x, h.pos.z);
    const bob = h.speed > 2 && h.y <= 0 ? Math.abs(Math.sin(ev.t * 16)) * 0.07 : 0;
    h.root.position.set(h.pos.x, h.pos.y + h.y + bob, h.pos.z);
    h.root.rotation.y = h.heading;
    // cabeceo: picotea parada y se inclina corriendo
    h.root.rotation.x = h.speed > 2 ? 0.18 : Math.max(0, Math.sin(ev.t * 5)) * 0.35;
    const flapping = h.y > 0 || h.speed > 4.5;
    const fl = flapping ? Math.abs(Math.sin(ev.t * (h.y > 0 ? 34 : 22))) : 0;
    h.wingL.rotation.z = -0.1 - fl * 1.2;
    h.wingR.rotation.z = 0.1 + fl * 1.2;
    h.cluckT -= dt;
    if (h.cluckT <= 0) {
      h.cluckT = 2 + rnd.next() * 3;
      if (d < 30) this.cluck(h);
    }
    this.mark(h.pos.x, h.pos.z, '🐔', '#f4a261', 'Gallina', true);
    this.showCard('🐔 Atrapa a la gallina (a pie)', Math.max(0, ev.left), null, '#f4a261');
    // ¡pillada!
    if (p.state === 'foot' && d < 1.3 && h.y < 0.7) {
      ev.stage = 'caught';
      ev.left = Math.max(ev.left, 0) + 40;
      // se le sube a la cabeza (así se ve desde la cámara, y es más digno para ella)
      h.root.parent?.remove(h.root);
      h.root.position.set(0, -0.02, -0.04);
      h.root.rotation.set(0, 0, 0);
      h.root.scale.setScalar(0.8);
      p.rig?.attach('head', h.root);
      h.cluckT = 0.2;
      this.game.mod.bubbles?.say(p, '¡Te pillé, Turuleta! ¡Quieta ahí arriba!', 1.8);
      g.mod.audio?.play('pickup');
      g.mod.particles?.emit('confetti', tmpP.copy(p.position).setY(p.position.y + 1.2), { count: 8, speed: 0.6 });
      g.events.emit('toast', { text: '🐔 ¡La tienes! (en la cabeza). Llévasela a su dueño', color: '#f4a261', time: 2.2 });
      return;
    }
    if (ev.left <= 0 || d > 90) {
      this.say(o, '¡La Turuleta se ha ido al monte! Volverá cuando tenga hambre…', 3.5, 0.75);
      g.mod.audio?.play('fail', { volume: 0.5 });
      this.end(false);
    }
  }

  // ─────────── La turista que quiere ver el faro ───────────

  private startTurista(): boolean {
    const g = this.game;
    const cur = g.mod.vehicles?.current as Vehicle | null;
    if (!cur || g.mod.player.state !== 'vehicle') return false;
    const dest = FARO.clone();
    dest.y = g.world.heightAt(dest.x, dest.z);
    if (cur.getPosition(tmpV).distanceTo(dest) < 150) return false;
    const spot = this.sidewalkSpot(30, 70, new THREE.Vector3());
    if (!spot) return false;
    const look = randomLookFor(rng, 'civil');
    look.shirt = '#ff6fb5';
    look.pants = '#fff1c9';
    look.cap = true;
    look.capColor = '#ffd23f';
    look.glasses = true;
    look.hair = 'coleta';
    const npc = g.mod.npcs.spawn('civil', look, spot);
    npc.transient = false;
    npc.voice = 1.35;
    npc.customPose = 'phone';
    npc.setState('custom');
    const c = client('turista');
    this.ev = {
      kind: 'turista', stage: 'wait', t: 0, left: 75, limit: 0, npc, dest, ride: null, comfort: 100,
      talkT: 7, yelpT: 0, waved: false, lostT: 0, walkWarn: 0,
    };
    g.mod.messages?.receive('cliente-turista', c?.name ?? 'Ingrid (turista despistada)', c?.avatar ?? '🗺️',
      '¡Hola! Me he perdido (otra vez) 🗺️ ¿Me llevas al faro? Quiero verlo antes de que salga mi crucero. ¡Pago bien! Estoy aquí cerca: soy la del gorro amarillo 👒');
    return true;
  }

  private tickTurista(ev: Extract<Ev, { kind: 'turista' }>, dt: number) {
    const g = this.game;
    const p = g.mod.player;
    const n = ev.npc;
    const cur = g.mod.vehicles?.current as Vehicle | null;
    ev.left -= dt;
    ev.yelpT -= dt;
    if (n.removed) return this.end(false);
    if (ev.stage === 'wait') {
      this.mark(n.position.x, n.position.z, '🗺️', '#ff6fb5', 'Turista');
      this.gps(n.position.x, n.position.z, 'Turista', '#ff6fb5');
      this.showCard('🗺️ Recoge a la turista (en coche)', Math.max(0, ev.left), null, '#ff6fb5');
      const pp = this.playerPos(tmpV);
      const d = pp.distanceTo(n.position);
      if (!n.busy && d < 40) n.face(pp);
      if (!ev.waved && d < 28) {
        ev.waved = true;
        n.customPose = 'hands_up';
        n.setState('custom');
        this.say(n, '¡TAXI! ¡Taxi! Bueno, furgoneta. ¡Me vale!', 3, 1.35);
      }
      ev.walkWarn -= dt;
      if (p.state === 'foot' && p.position.distanceTo(n.position) < 3 && ev.walkWarn <= 0) {
        ev.walkWarn = 6;
        this.say(n, '¿Andando? ¡El faro está lejísimos! Trae un coche, porfa.', 3, 1.35);
      }
      if (cur && p.state === 'vehicle' && d < 8 && Math.abs(cur.speed) < 4 && !n.busy) {
        n.rideAlong(cur);
        ev.ride = cur;
        ev.stage = 'ride';
        const jobs = g.mod.jobs;
        const road = jobs?.roadDist ? jobs.roadDist(pp, ev.dest) : pp.distanceTo(ev.dest) * 1.35;
        ev.limit = Math.max(55, Math.ceil((30 + road / 7.5) / 5) * 5);
        ev.left = ev.limit;
        ev.talkT = 5;
        g.mod.audio?.play('door');
        this.say(n, '¡Al faro! Y no corras mucho. Bueno, corre un poco, que sale mi barco.', 3.5, 1.35);
        g.events.emit('toast', { text: `🗼 Lleva a Ingrid al faro (${ev.limit} s). ¡Y sin sustos!`, color: '#ff6fb5', time: 2.5 });
        return;
      }
      if (ev.left <= 0) {
        n.customPose = 'normal';
        n.setState('idle');
        this.say(n, 'Nada, cojo el autobús. O una cabra.', 3, 1.35);
        this.end(false);
      }
      return;
    }
    // de camino al faro
    const ride = ev.ride!;
    const dest = ev.dest;
    this.mark(dest.x, dest.z, '🗼', '#ff6fb5', 'Faro');
    this.gps(dest.x, dest.z, 'Faro', '#ff6fb5');
    this.showCard('🗼 Ingrid al faro · 😊 comodidad', Math.max(0, ev.left), ev.comfort, '#ff6fb5');
    if (ride.destroyed || n.vehicle !== ride) {
      if (n.vehicle) n.leaveVehicle();
      this.say(n, '¡Me bajo aquí! ¡Estás loco! ¡Lo pondré en la reseña!', 3.5, 1.35);
      g.mod.audio?.play('fail', { volume: 0.5 });
      this.end(false);
      return;
    }
    const rp = ride.getPosition(tmpP);
    // el jugador se ha bajado y se va: ella espera un poco y luego se harta
    if (cur !== ride && p.position.distanceTo(rp) > 25) {
      if (ev.lostT === 0) this.say(n, '¿Hola? ¿Vuelves? ¡No me dejes aquí con el motor!', 3, 1.35);
      ev.lostT += dt;
      if (ev.lostT > 20) {
        n.leaveVehicle();
        this.say(n, 'Me has abandonado en un coche ajeno. Me voy andando. Adiós.', 3.5, 1.35);
        this.end(false);
        return;
      }
    } else ev.lostT = 0;
    ev.talkT -= dt;
    if (ev.talkT <= 0) {
      ev.talkT = 8 + rnd.next() * 6;
      if (ev.yelpT <= 0) this.say(n, TOURIST_TALK[Math.floor(rnd.next() * TOURIST_TALK.length)], 3.2, 1.35);
    }
    if (rp.distanceTo(dest) < 14) {
      n.leaveVehicle();
      n.goTo(FARO_TIP.clone().setY(dest.y), false);
      const lvl = g.mod.economy?.fameLevel ?? 1;
      const k = 0.55 + (0.45 * ev.comfort) / 100;
      const fast = ev.left / ev.limit > 0.3;
      const pay = Math.max(40, Math.round((220 * k * (fast ? 1.15 : 1) * (1 + (lvl - 1) * 0.08)) / 5) * 5);
      const line = ev.comfort > 75 ? '¡El faro! ¡Es precioso! ¡Y a rayas! Toma, y quédate con el cambio.' : ev.comfort > 35 ? '¡El faro! Qué bonito… Cuando se me pase el mareo lo disfruto. Toma.' : 'Estoy viva. Creo. Toma el dinero y no me mires, que estoy verde.';
      this.say(n, line, 4, 1.35);
      g.mod.economy?.addCash(pay, 'turista');
      g.mod.economy?.addFame(ev.comfort > 75 ? 20 : 12, 'turista');
      g.mod.audio?.play('cash');
      g.events.emit('toast', { text: `🗼 ¡Turista entregada en el faro! +${pay} €`, color: '#ff6fb5', time: 2.5 });
      this.end(true);
      return;
    }
    if (ev.left <= 0) {
      this.say(n, 'Mi crucero ya ha salido… Bueno, me quedo a vivir aquí. Bájame, anda.', 3.5, 1.35);
      g.mod.audio?.play('fail', { volume: 0.5 });
      this.end(false);
    }
  }

  // ─────────── Atraco de Los Devueltos a una tienda ───────────

  private startAtraco(): boolean {
    const g = this.game;
    const gang = g.mod.gang;
    if (!gang?.spawnMember) return false;
    const pp = this.playerPos(new THREE.Vector3());
    const hide: THREE.Vector3 | undefined = gang.hideout?.door;
    const cands = g.world.pois.filter((x) => (x.kind === 'shop' || x.kind === 'bar' || x.kind === 'clothes') && x.door.distanceTo(pp) > 45 && x.door.distanceTo(pp) < 230 && (!hide || x.door.distanceTo(hide) > 120));
    if (!cands.length) return false;
    const shop = cands[Math.floor(rnd.next() * cands.length)];
    const f = shop.facing;
    const fx = Math.sin(f), fz = Math.cos(f);
    const rx = Math.cos(f), rz = -Math.sin(f);
    const owner = g.mod.npcs.spawn('civil', randomLookFor(rng, 'civil'), shop.door.clone(), f);
    owner.transient = false;
    owner.customPose = 'hands_up';
    owner.setState('custom');
    const lvl = g.mod.economy?.fameLevel ?? 1;
    const count = lvl >= 3 ? 3 : 2;
    const robbers: Npc[] = [];
    for (let i = 0; i < count; i++) {
      const pos = new THREE.Vector3(shop.door.x + fx * (2.2 + i * 1.2) + rx * (i - (count - 1) / 2) * 2.2, 0, shop.door.z + fz * (2.2 + i * 1.2) + rz * (i - (count - 1) / 2) * 2.2);
      if (!this.freeSpot(pos)) pos.copy(shop.door).add(tmpP.set(fx * 2, 0, fz * 2));
      const m: Npc = gang.spawnMember(pos, undefined, false);
      const b = m.brain as CombatBrain;
      b.home = pos.clone();
      b.holdAt = pos.clone();
      m.face(shop.door);
      robbers.push(m);
    }
    // uno lleva el saco con la caja: si cae, suelta el dinero
    const bagger = robbers[0];
    bagger.rig.attach('back', makeSack());
    const prevDeath = bagger.onDeath;
    bagger.onDeath = (npc) => {
      prevDeath?.(npc);
      g.mod.pickups?.spawn('cash', npc.position.clone(), 80 + Math.floor(rnd.next() * 70), 60);
    };
    this.ev = { kind: 'atraco', t: 0, left: 150, shop, robbers, owner, alive: count, engaged: false, title: '' };
    g.mod.messages?.receive('atraco-' + shop.id, shop.name, '🚨', `¡SOCORRO! Los Devueltos están atracando ${shop.name}. Se quieren llevar la caja… ¡y los caramelos! Repartidor, haz algo, que te lo pagamos 🙏`);
    g.events.emit('toast', { text: `🚨 ¡Atraco en ${shop.name}! Frústralo`, color: '#6c3bd1', time: 3 });
    return true;
  }

  private robbersFlee(list: Npc[]) {
    const now = this.game.time.elapsed;
    for (const m of list) {
      if (!m.alive || m.removed) continue;
      const b = m.brain as CombatBrain | undefined;
      if (!b) continue;
      b.aggro = false;
      b.bored = true;
      b.home = null;
      b.holdAt = null;
      b.mode = 'idle';
      b.calmUntil = now + 60;
      m.aiming = false;
      m.stop();
    }
  }

  private tickAtraco(ev: Extract<Ev, { kind: 'atraco' }>, dt: number) {
    const g = this.game;
    ev.left -= dt;
    let alive = 0;
    let first: Npc | null = null;
    for (const m of ev.robbers) {
      if (m.alive && !m.removed) {
        alive++;
        first ??= m;
      }
    }
    if (alive !== ev.alive || !ev.title) {
      ev.alive = alive;
      ev.title = `🚨 Atraco en ${ev.shop.name} · quedan ${alive}`;
    }
    const d = ev.shop.door;
    this.mark(d.x, d.z, '🚨', '#6c3bd1', 'Atraco');
    this.gps(d.x, d.z, 'Atraco', '#6c3bd1');
    this.showCard(ev.title, Math.max(0, ev.left), null, '#6c3bd1');
    if (first && ev.t > 0.6 && ev.t - dt <= 0.6) this.say(first, '¡Todo el dinero en el saco! ¡Y los caramelos también!', 3.5, 0.8);
    const pp = this.playerPos(tmpV);
    if (first && !ev.engaged && pp.distanceTo(d) < 40) {
      ev.engaged = true;
      this.say(first, '¡El repartidor! ¡Que no se lleve la caja! Bueno, que no se la lleve de vuelta.', 3.5, 0.8);
    }
    if (!alive) {
      const o = ev.owner;
      o.customPose = 'normal';
      o.setState('idle');
      o.face(g.mod.player.position);
      const lvl = g.mod.economy?.fameLevel ?? 1;
      const pay = 250 + 50 * (lvl - 1);
      this.say(o, '¡Gracias, héroe! Toma, de la caja. Y un chicle de fresa, que no se diga.', 4, 1);
      g.mod.economy?.addCash(pay, 'atraco');
      g.mod.economy?.addFame(30, 'atraco');
      g.mod.audio?.play('cheer');
      g.events.emit('toast', { text: `🛡️ ¡Atraco frustrado! +${pay} €`, color: '#6c3bd1', time: 3 });
      g.mod.messages?.receive('atraco-' + ev.shop.id, ev.shop.name, '🚨', 'Te debemos una. Tienes caramelos gratis de por vida. Bueno, de por semana. 🍬', undefined, false);
      this.end(true);
      return;
    }
    if (ev.left <= 0) {
      this.say(ev.owner, '¡Se han llevado la caja! ¡Y los caramelos! ¡Los de fresa!', 3.5, 1);
      g.events.emit('toast', { text: '💨 Los Devueltos se han escapado con la caja', color: '#ff4f81', time: 2.5 });
      this.end(false);
    }
  }

  // ─────────── Bucle ───────────

  private tick(dt: number) {
    const ev = this.ev!;
    ev.t += dt;
    switch (ev.kind) {
      case 'thief':
        return this.tickThief(ev);
      case 'truck':
        return this.tickTruck(ev, dt);
      case 'race':
        return this.tickRace(ev, dt);
      case 'boda':
        return this.tickBoda(ev, dt);
      case 'gallina':
        return this.tickGallina(ev, dt);
      case 'turista':
        return this.tickTurista(ev, dt);
      case 'atraco':
        return this.tickAtraco(ev, dt);
    }
  }
}
