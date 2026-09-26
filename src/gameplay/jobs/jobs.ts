// Encargos contra reembolso: ofertas por el móvil, recoger, llevar sin romper, entregar y cobrar en efectivo.
import * as THREE from 'three';
import type { Game, System } from '../../core/game';
import type { DeliverySpot, Poi } from '../../core/contracts';
import type { ActiveJob, ClientProfile, JobOffer, PackageType } from './types';
import { CLIENTS } from './clients';
import type { Messages } from '../messages';
import type { Economy } from '../economy';
import type { Vehicle } from '../../vehicles/vehicle';
import type { Npc } from '../../actors/npc';
import { randomLookFor } from '../../actors/looks';
import { Rng, fx as rnd } from '../../core/rng';
import { GeoBuilder, vertexColorMaterial } from '../../core/geo';
import { SOLID } from '../../core/physics';

// timeK: cuánto tiempo dan respecto a uno normal. URGENTE va justo (un buen conductor llega con
// margen para propina; uno tranquilo, si no se entretiene); FRÁGIL obliga a ir despacio; SOSPECHOSO
// incluye la pelea con la emboscada.
const TYPE_INFO: Record<PackageType, { label: string; mult: number; color: string; timeK: number }> = {
  normal: { label: 'Normal', mult: 1, color: '#ffd23f', timeK: 1 },
  fragil: { label: 'FRÁGIL', mult: 1.6, color: '#ff4f81', timeK: 1.2 },
  urgente: { label: 'URGENTE', mult: 1.7, color: '#ff7b54', timeK: 0.7 },
  sospechoso: { label: 'SOSPECHOSO', mult: 3, color: '#6c3bd1', timeK: 1.35 },
  pesado: { label: 'PESADO', mult: 1.5, color: '#2ec4b6', timeK: 1.2 },
};
export { TYPE_INFO };

/**
 * Tiempo de un encargo = paradas (bajar, recoger, aparcar, entregar) + camino por calle a un ritmo
 * tranquilo con la furgoneta. Medido en la isla: por calle se recorre ~1,3 veces la línea recta,
 * y un conductor normal va a ~8 m/s de media (curvas, tráfico, algún golpe). Con 6,5 m/s de
 * referencia sobra un 25 % para equivocarse; la propina (entrega perfecta) pide llegar con un
 * cuarto del tiempo aún en el reloj.
 */
const JOB_STOP_TIME = 35;
const JOB_SPEED = 6.5;

/** Puntos de fama por entrega. */
const FAME_PERFECT = 15;
const FAME_OK = 8;
const FAME_BAD = 3;

/** ¿Ha pulsado E? Si es así, la gasta para que no haga además otra cosa en el mismo frame (entrar en una tienda...). */
function takeE(g: Game): boolean {
  if (!g.input.enabled || !g.input.pressed('interact')) return false;
  (g.input as any).justDown?.delete?.('interact');
  return true;
}

/** Palabras que van delante del nombre ("Doña Puri", "Tío Ramón"): con ellas se cogen dos palabras. */
const NAME_TITLES = new Set(['Doña', 'Don', 'Tío', 'Tía', 'Sor', 'Chef', 'Capitán', 'Profesor', 'Maese', 'El', 'La', 'Los', 'Las']);

/** Nombre corto del cliente para las frases ("Loli (siempre en el bar)" → "Loli", "Tío Ramón (pescador)" → "Tío Ramón"). */
function shortName(name: string): string {
  const base = name.split(/[(«"]/)[0].trim() || name;
  if (base.length <= 16) return base;
  const words = base.split(/\s+/);
  return NAME_TITLES.has(words[0]) && words[1] ? words[0] + ' ' + words[1] : words[0];
}

/** Frases genéricas del chat (para que no se repita siempre la misma). */
const LINES = {
  accept: ['¡Voy para allá! 📦', 'Hecho. Contra reembolso, ¿eh?', 'Marchando 🚐', 'Dame un momento, que estoy aparcando fatal.', 'Voy volando. Bueno, en furgoneta.', 'Apuntado. Ve preparando el dinero, que llego enseguida 💶', 'Hecho. Si me pierdo, sigue el olor a embrague 🚐'],
  decline: ['Lo siento, hoy no puedo 🙏', 'Uf, me pilla fatal. ¡Otra vez será!', 'Paso, que voy hasta arriba de cajas 📦', 'Hoy no, que la furgoneta está sensible 🚐', 'Imposible, tengo la agenda llena. De paquetes.'],
  expire: ['Da igual, ya se lo pido a otro. 🙄', 'Me has dejado en visto. Qué feo. 🙄', 'Nada, se lo pido a la competencia. Van de morado, ¿sabes? 🙄', 'Vale, pues nada. Iré andando. Descalzo. Bajo la lluvia. 🙄'],
  cancel: ['He cancelado el pedido. Una estrella. 😤', 'Pedido cancelado. Voy a comprarlo en persona, como en los noventa. 😤', 'Cancelado. Y lo pienso contar en el grupo de vecinos. 😤', 'Cancelado. Mi abuela lo habría traído antes. En autobús. 😤'],
  perfect: ['⭐⭐⭐⭐⭐ ¡Repetiré!', '⭐⭐⭐⭐⭐ Rápido y entero. Un milagro.', '⭐⭐⭐⭐⭐ Te recomendaré a mi cuñado. Y eso que no le quiero.', '⭐⭐⭐⭐⭐ Si pudiera, le pondría seis estrellas. Pero la aplicación no me deja.', '⭐⭐⭐⭐⭐ Ha llegado antes de pedirlo. O casi.'],
  ok: ['⭐⭐⭐ Bien, sin más.', '⭐⭐⭐ Correcto. Como un bocadillo de pan solo.', '⭐⭐⭐⭐ Casi perfecto. Casi.', '⭐⭐⭐ Aprobado raspado. Como yo en el carné.'],
  late: ['⭐⭐ Llegó. Tarde, pero llegó. ⌛', '⭐⭐ He tenido tiempo de hacerme un cocido esperando. ⌛', '⭐⭐ Me han salido canas esperando. Dos. ⌛'],
  broken: ['⭐ Me ha llegado un puzle. 😒', '⭐ La caja ha sufrido más que yo un lunes. 😒', '⭐ Una estrella por traerlo. Las otras cuatro se han roto por el camino. 😒', '⭐ La caja parece un acordeón. Y sin música. 😒'],
};

/** Adivinanzas de Don Enigmo (populares): respuesta buena y una tontería. */
const RIDDLES = [
  { q: 'Tengo agujas y no sé coser, tengo números y no sé leer. ¿Qué soy?', a: 'Un reloj', b: 'Un erizo contable' },
  { q: 'Blanca por dentro, verde por fuera. Si quieres que te lo diga, espera.', a: 'La pera', b: 'Un pepino con abrigo' },
  { q: 'Oro parece, plata no es. ¿Qué es?', a: 'El plátano', b: 'Un lingote blandito' },
  { q: '¿Qué pesa más, un kilo de paquetes o un kilo de plumas?', a: 'Pesan lo mismo', b: 'Los paquetes, que los llevo yo' },
  { q: 'Vuelo sin alas, silbo sin boca y nadie me ve. ¿Qué soy?', a: 'El viento', b: 'Mi furgoneta' },
  { q: 'Tiene dientes y no come, tiene barba y no es hombre.', a: 'El ajo', b: 'Un peine con barba' },
];

/** Chistes de Chiqui (malísimos, a propósito). */
const JOKES = [
  { q: 'Van dos paquetes por la calle y se cae el del medio…', a: '…Espera, que me he liado. Eran tres. ¡Ba-dum-tss!' },
  { q: 'Doctor, doctor, ¡me siento como un paquete!', a: '—Pues firme aquí, aquí y aquí. ¡Ba-dum-tss!' },
  { q: '¿Cuál es el colmo de un repartidor?', a: '¡Que le devuelvan hasta los saludos! ¡Ba-dum-tss!' },
  { q: '¿Por qué el repartidor sube con una escalera?', a: '¡Porque le dijeron que era una entrega de otro nivel! ¡Ba-dum-tss!' },
  { q: 'Me he comprado un GPS para la furgoneta…', a: '…y ahora me pierdo con mucha más precisión. ¡Ba-dum-tss!' },
  { q: '¿Sabes por qué Los Devueltos van de morado?', a: '¡Porque de verde ya iban los envidiosos! ¡Ba-dum-tss!' },
];

/** Melones de la Tía Fuensanta: cada uno cura un poco al pasar por encima. */
const MELON_HEAL = 25;
let melonGeoCache: THREE.BufferGeometry | null = null;
function melonGeo(): THREE.BufferGeometry {
  if (melonGeoCache) return melonGeoCache;
  const b = new GeoBuilder();
  b.cyl(0.2, 0.2, 0.34, 8, '#7cb342', 0, 0.2, 0, 0, 0, Math.PI / 2);
  b.cyl(0.12, 0.2, 0.06, 8, '#7cb342', 0.2, 0.2, 0, 0, 0, -Math.PI / 2);
  b.cyl(0.12, 0.2, 0.06, 8, '#7cb342', -0.2, 0.2, 0, 0, 0, Math.PI / 2);
  b.cyl(0.205, 0.205, 0.05, 8, '#33691e', 0.08, 0.2, 0, 0, 0, Math.PI / 2);
  b.cyl(0.205, 0.205, 0.05, 8, '#33691e', -0.08, 0.2, 0, 0, 0, Math.PI / 2);
  b.box(0.03, 0.06, 0.03, '#5d4037', 0.26, 0.2, 0);
  return (melonGeoCache = b.build());
}
function pick(list: string[]): string {
  return list[Math.floor(rnd.next() * list.length)];
}

const REDIRECTS = [
  'Uy, que me he ido a casa de mi primo 😅',
  'Cambio de planes: nos hemos movido 🎉',
  'Perdona, me había equivocado de calle. Bueno, de barrio 🙈',
  'Es que me he ido a por churros 🍩',
  'Me he acordado de que tenía dentista. Ya que vienes… 🦷',
  'Mi perro ha decidido ir al parque y yo voy detrás 🐕',
  'He visto una oferta de sandías y no he podido resistirme 🍉',
];

const JOB_COLORS = ['#ffd23f', '#2ec4b6', '#ff4f81', '#ff7b54', '#06d6a0', '#9b5de5'];
const tmpV = new THREE.Vector3();
const tmpO = new THREE.Vector3();
const tmpD = new THREE.Vector3();

/** Caja de cartón que sale volando cuando se cae un paquete (la misma pinta que la del suelo). */
let dropGeoCache: THREE.BufferGeometry | null = null;
function dropGeo(): THREE.BufferGeometry {
  if (dropGeoCache) return dropGeoCache;
  const b = new GeoBuilder();
  b.box(0.5, 0.4, 0.5, '#c8915a', 0, 0, 0);
  b.box(0.51, 0.08, 0.51, '#8f6238', 0, 0.05, 0);
  b.box(0.08, 0.41, 0.51, '#8f6238', 0, 0, 0);
  return (dropGeoCache = b.build());
}

interface Scene {
  job: ActiveJob;
  npc: Npc | null;
  t: number;
  step: number;
  data: any;
}

export class Jobs implements System {
  name = 'jobs';
  readonly offers: JobOffer[] = [];
  readonly active: ActiveJob[] = [];
  private nextId = 1;
  private offerTimer = 6;
  private rng = new Rng('encargos');
  private clientNpcs = new Map<ActiveJob, Npc>();
  private scene: Scene | null = null;
  private boxMesh: THREE.Mesh | null = null;
  private dog: { mesh: THREE.Group; t: number; pos: THREE.Vector3 } | null = null;
  /** Melones de la huerta en el suelo (curan al cogerlos). */
  private melons: { mesh: THREE.Mesh; t: number }[] = [];
  /** Encargos automáticos activados (el tutorial los enciende). */
  autoOffers = true;
  completed = 0;
  /** Contador de cada manía para no repetir demasiado. */
  private lastClients: string[] = [];

  constructor(private game: Game) {
    game.mod.jobs = this;
    game.events.on('vehicle:impact' as any, (e: any) => this.onImpact(e.vehicle as Vehicle, e.dv as number));
    // fall = velocidad de caída al tocar suelo (si algún aterrizaje no la trae, se estima por el tiempo en el aire)
    game.events.on('vehicle:landed' as any, (e: any) => this.onLanded(e.vehicle as Vehicle, typeof e.fall === 'number' ? e.fall : (e.air ?? 0) * 5));
    game.events.on('player:died', () => this.abortScene());
    game.events.on('player:busted' as any, () => this.abortScene());
    game.events.on('player:hurt', (e) => {
      for (const j of this.active) if (j.state === 'carry' && j.where === 'hands') this.damage(j, e.amount * 0.6);
    });
  }

  private get msgs(): Messages {
    return this.game.mod.messages;
  }
  private get eco(): Economy {
    return this.game.mod.economy;
  }

  // ─────────── Ofertas ───────────

  private pickClient(): ClientProfile {
    let c: ClientProfile;
    let guard = 0;
    // el del paquete SOSPECHOSO (emboscada) no aparece hasta fama 2: los primeros minutos, tranquilos
    const early = (this.eco?.fameLevel ?? 1) < 2;
    do {
      c = CLIENTS[Math.floor(this.rng.next() * CLIENTS.length)];
    } while ((this.lastClients.includes(c.id) || (early && c.prefers === 'sospechoso')) && guard++ < 20);
    this.lastClients.push(c.id);
    if (this.lastClients.length > 4) this.lastClients.shift();
    return c;
  }

  private pickupPois(): Poi[] {
    const w = this.game.world;
    return w.pois.filter((p) => p.kind === 'office' || p.kind === 'shop');
  }

  /** Genera una oferta nueva y la manda al móvil. */
  createOffer(opts: Partial<{ client: ClientProfile; type: PackageType; dest: DeliverySpot; pickup: Poi; pay: number; time: number }> = {}): JobOffer | null {
    const w = this.game.world;
    if (!w.deliverySpots.length) return null;
    const client = opts.client ?? this.pickClient();
    const fameLvl = this.eco?.fameLevel ?? 1;
    // tipo de paquete: los raros aparecen con más fama
    let type: PackageType = opts.type ?? 'normal';
    if (!opts.type) {
      const r = this.rng.next();
      if (r < 0.14) type = 'fragil';
      else if (r < 0.28) type = 'urgente';
      else if (r < 0.36 && fameLvl >= 2) type = 'sospechoso';
      else if (r < 0.46) type = 'pesado';
      if (client.prefers) type = client.prefers;
    }
    const pickups = this.pickupPois();
    const pickup = opts.pickup ?? (this.rng.next() < 0.55 ? pickups.find((p) => p.kind === 'office') ?? pickups[0] : pickups[Math.floor(this.rng.next() * pickups.length)]);
    if (!pickup) return null;
    let spots = w.deliverySpots;
    if (client.districts?.length) {
      const f = spots.filter((s) => client.districts!.includes(s.district));
      if (f.length) spots = f;
    }
    // no demasiado cerca de la recogida
    const far = spots.filter((s) => s.door.distanceTo(pickup.door) > 70);
    const dest = opts.dest ?? (far.length ? far : spots)[Math.floor(this.rng.next() * (far.length ? far : spots).length)];
    const dist = dest.door.distanceTo(pickup.door);
    const info = TYPE_INFO[type];
    const districtK = dest.district === 'colina' ? 1.5 : dest.district === 'poligono' ? 1.2 : 1;
    const pay = opts.pay ?? Math.round((25 + dist * 0.28) * info.mult * districtK * (1 + (fameLvl - 1) * 0.12) / 5) * 5;
    // tiempo: ir a recoger + llevarlo, por calle (ver fairTime)
    const from = this.playerSpot() ?? pickup.door;
    const time = opts.time ?? this.fairTime(from, pickup.door, dest.door, type);
    const item = client.items[Math.floor(this.rng.next() * client.items.length)];
    const ask = client.ask[Math.floor(this.rng.next() * client.ask.length)];
    const mm = Math.floor(time / 60), ss = time % 60;
    const message = ask
      .replace('{item}', item)
      .replace('{precio}', `${pay} €`)
      .replace('{tiempo}', mm > 0 ? `${mm} min ${ss ? ss + ' s' : ''}`.trim() : `${ss} s`)
      .replace('{calle}', dest.label);
    const offer: JobOffer = {
      id: this.nextId++, client, item, type, pickupId: pickup.id, pickupPos: pickup.door.clone(), pickupName: pickup.name,
      dest, pay, time, message, expires: this.game.time.elapsed + 110,
    };
    // el encargo que manda el tutorial (Doña Puri, con cliente y pago fijados): paquete casi irrompible
    const tuto = this.game.mod.tutorial;
    if (opts.client?.id === 'puri' && opts.pay !== undefined && tuto && !tuto.done && tuto.step > 0) offer.tutorial = true;
    this.offers.push(offer);
    const extra = `\n📦 ${info.label} · 💶 ${pay} € · ⏱ ${Math.round(time)} s · Recoger en ${pickup.name}`;
    this.msgs?.receive('cliente-' + client.id, client.name, client.avatar, message + extra, [
      { label: 'Aceptar', style: 'si', run: () => this.accept(offer.id), valid: () => this.offers.includes(offer) },
      { label: 'Paso', style: 'no', run: () => this.decline(offer.id), valid: () => this.offers.includes(offer) },
    ]);
    return offer;
  }

  /** Adelanta la siguiente oferta automática (p. ej. al acabar el tutorial). */
  nextOfferIn(seconds: number) {
    this.offerTimer = Math.min(this.offerTimer, seconds);
  }

  accept(id: number): boolean {
    const i = this.offers.findIndex((o) => o.id === id);
    if (i < 0) return false;
    const o = this.offers[i];
    if (this.active.filter((j) => j.state !== 'done' && j.state !== 'failed').length >= 6) {
      this.game.events.emit('toast', { text: 'Ya llevas 6 encargos. No eres un pulpo.', color: '#ff4f81' });
      return false;
    }
    this.offers.splice(i, 1);
    // si ha tardado en aceptar y se ha alejado, el reloj se ajusta (nunca a menos de lo prometido)
    const from = this.playerSpot();
    if (from) {
      const fresh = this.fairTime(from, o.pickupPos, o.dest.door, o.type);
      if (fresh > o.time) o.time = fresh;
    }
    const job: ActiveJob = {
      offer: o, state: 'pickup', integrity: 100, timeLeft: o.time, where: 'none', vehicleId: null,
      color: JOB_COLORS[(o.id - 1) % JOB_COLORS.length],
    };
    this.active.push(job);
    this.msgs?.reply('cliente-' + o.client.id, pick(LINES.accept));
    this.game.mod.audio?.play('success', { volume: 0.5 });
    this.game.events.emit('job:accepted' as any, { job } as any);
    this.game.events.emit('toast', { text: `Encargo aceptado: recoge en ${o.pickupName}`, color: job.color, time: 2.2 });
    return true;
  }

  decline(id: number) {
    const i = this.offers.findIndex((o) => o.id === id);
    if (i < 0) return;
    const o = this.offers[i];
    this.offers.splice(i, 1);
    this.msgs?.reply('cliente-' + o.client.id, pick(LINES.decline));
  }

  // ─────────── Distancias y tiempos ───────────

  /**
   * Desde dónde se cuenta el camino del jugador. Dentro del ático, la oficina o el club el jugador
   * está en realidad lejísimos de la isla (los interiores se montan aparte), así que se cuenta desde
   * la puerta de fuera por la que ha entrado.
   */
  private playerSpot(): THREE.Vector3 | null {
    const g = this.game;
    const p = g.mod.player;
    if (!p) return null;
    const it = g.mod.interiors;
    if (it?.inside && it.current) {
      const poi = g.world.pois.find(it.current.def.poi);
      if (poi) return poi.door;
    }
    return p.position;
  }

  /** Metros por calle entre dos puntos (ruta de la red de calles; sin red, línea recta con recargo). */
  roadDist(a: THREE.Vector3, b: THREE.Vector3): number {
    const straight = a.distanceTo(b);
    const roads = this.game.mod.traffic?.roads;
    if (!roads || straight < 25) return straight * 1.35;
    let pts: THREE.Vector3[] = [];
    try {
      pts = roads.route(a, b);
    } catch {
      pts = [];
    }
    if (!pts.length) return straight * 1.35 + 30;
    let d = a.distanceTo(pts[0]);
    for (let i = 1; i < pts.length; i++) d += pts[i].distanceTo(pts[i - 1]);
    d += pts[pts.length - 1].distanceTo(b);
    return Math.max(straight, d);
  }

  /** Segundos justos para ir de `from` a recoger en `pickup` y entregar en `dest`. */
  fairTime(from: THREE.Vector3, pickup: THREE.Vector3, dest: THREE.Vector3, type: PackageType): number {
    const road = this.roadDist(from, pickup) + this.roadDist(pickup, dest);
    return Math.round((JOB_STOP_TIME + road / JOB_SPEED) * TYPE_INFO[type].timeK);
  }

  // ─────────── Integridad ───────────

  private carriedIn(v: Vehicle): ActiveJob[] {
    return this.active.filter((j) => j.state === 'carry' && j.where === 'vehicle' && j.vehicleId === v.id);
  }

  private onImpact(v: Vehicle, dv: number) {
    for (const j of this.carriedIn(v)) {
      const t = j.offer.type;
      const loss = t === 'fragil' ? Math.max(0, dv - 2) * 11 : t === 'pesado' ? Math.max(0, dv - 6) * 2 : Math.max(0, dv - 4.5) * 3.2;
      this.damage(j, loss);
    }
  }

  /**
   * Aterrizaje: el golpe depende de la velocidad de caída al tocar el suelo (m/s), no del tiempo en
   * el aire (con la gravedad suave de los saltos, 1,5 s en el aire no es un golpe de 1,5 s). Medido
   * con rampas de verdad: la furgoneta cae a ~7 m/s (FRÁGIL −9 %) y un deportivo que vuela 1,5 s, a
   * ~11 m/s (FRÁGIL −23 %). Los demás paquetes, casi nada (−3 % y −8 %).
   */
  private onLanded(v: Vehicle, fall: number) {
    const hit = Math.max(0, fall - 4.5);
    if (!hit) return;
    for (const j of this.carriedIn(v)) this.damage(j, hit * (j.offer.type === 'fragil' ? 3.5 : 1.2));
  }

  private damage(j: ActiveJob, loss: number) {
    if (loss <= 0.5) return;
    const before = j.integrity;
    // primera entrega del tutorial: los golpes se notan un poco (para que se entienda el aviso),
    // pero la caja no baja del 90 % y se cobra entera
    if (j.offer.tutorial) {
      j.integrity = Math.max(Math.min(before, 90), before - loss * 0.3);
      return;
    }
    j.integrity = Math.max(0, j.integrity - loss);
    if (before >= 60 && j.integrity < 60) this.game.events.emit('toast', { text: `¡El paquete de ${j.offer.client.name} está sufriendo!`, color: '#ff4f81', time: 1.8 });
    if (before > 0 && j.integrity <= 0) {
      this.game.events.emit('toast', { text: '💥 Paquete destrozado. Al cliente no le va a gustar.', color: '#ff4f81', time: 2.4 });
      this.game.mod.audio?.play('glass', { volume: 0.6 });
    }
  }

  // ─────────── Recoger y entregar ───────────

  /** Vehículo del jugador cercano (el que conduce o el último usado a menos de 25 m). */
  private nearbyVehicle(pos: THREE.Vector3): Vehicle | null {
    const vm = this.game.mod.vehicles;
    if (!vm) return null;
    if (vm.current) return vm.current;
    let best: Vehicle | null = null;
    let bestT = -Infinity;
    for (const v of vm.list as Vehicle[]) {
      if (v.destroyed || v.lastDriven < 0) continue;
      if (v.getPosition(tmpV).distanceTo(pos) > 25) continue;
      if (v.lastDriven > bestT) {
        bestT = v.lastDriven;
        best = v;
      }
    }
    return best;
  }

  private capacityOf(v: Vehicle): number {
    return v.spec.capacity + v.upgrades.trunk * 2;
  }

  /** Intenta recoger en la puerta de un POI. Devuelve true si ha hecho algo. */
  tryPickup(poiId: string): boolean {
    const waiting = this.active.filter((j) => j.state === 'pickup' && j.offer.pickupId === poiId);
    if (!waiting.length) return false;
    const p = this.game.mod.player;
    const v = this.nearbyVehicle(p.position);
    let loaded = 0;
    for (const j of waiting) {
      const heavy = j.offer.type === 'pesado';
      if (v) {
        const used = this.carriedIn(v).length;
        if (used >= this.capacityOf(v)) {
          this.game.events.emit('toast', { text: `No cabe más en ${v.spec.name.toLowerCase()} (${this.capacityOf(v)} paquetes)`, color: '#ff4f81' });
          break;
        }
        if (heavy && !v.spec.heavy) {
          this.game.events.emit('toast', { text: 'Este paquete es PESADO: solo cabe en la furgoneta o el furgón', color: '#2ec4b6' });
          continue;
        }
        j.where = 'vehicle';
        j.vehicleId = v.id;
        v.packages = this.carriedIn(v).length + 1;
      } else {
        if (heavy) {
          this.game.events.emit('toast', { text: 'Esto pesa como un piano. Trae la furgoneta.', color: '#2ec4b6' });
          continue;
        }
        if (this.active.some((x) => x.state === 'carry' && x.where === 'hands')) {
          this.game.events.emit('toast', { text: 'A pie solo puedes llevar un paquete. Trae un vehículo.', color: '#ff4f81' });
          break;
        }
        j.where = 'hands';
      }
      j.state = 'carry';
      loaded++;
    }
    if (loaded) {
      this.game.mod.audio?.play('pickup');
      this.game.events.emit('toast', { text: `📦 ${loaded} paquete${loaded > 1 ? 's' : ''} cargado${loaded > 1 ? 's' : ''}`, color: '#ffd23f' });
      this.game.events.emit('job:pickup' as any, { count: loaded } as any);
      this.updateVehiclePackages();
    }
    return loaded > 0;
  }

  /** Vehículos que llevan (o llevaban) paquetes de encargos: solo se tocan esos. */
  private pkgVehicles = new Set<Vehicle>();

  /** Cuenta los paquetes de cada vehículo (cada frame, sin crear listas: solo recorre los encargos). */
  private updateVehiclePackages() {
    const list = this.game.mod.vehicles?.list as Vehicle[] | undefined;
    if (!list) return;
    for (const v of this.pkgVehicles) v.packages = 0;
    this.pkgVehicles.clear();
    for (const j of this.active) {
      if (j.state !== 'carry' || j.where !== 'vehicle' || j.vehicleId == null) continue;
      let v: Vehicle | null = null;
      for (let i = 0; i < list.length; i++) if (list[i].id === j.vehicleId) { v = list[i]; break; }
      if (!v) continue;
      if (!this.pkgVehicles.has(v)) {
        v.packages = 0;
        this.pkgVehicles.add(v);
      }
      v.packages++;
    }
  }

  /** Pierde todos los paquetes que lleva (muerte). Devuelve cuántos. */
  loseAll(): number {
    let n = 0;
    for (const j of this.active) {
      if (j.state === 'carry') {
        j.state = 'failed';
        n++;
      }
    }
    this.cleanup();
    return n;
  }

  /**
   * Se caen paquetes de un vehículo (embestidas, atracos): salen volando por detrás y caen a 4-6 m
   * de la trasera, con un botecito; al tocar el suelo se pueden recoger (así no se recogen solos al
   * instante por seguir el vehículo encima).
   */
  dropFrom(v: Vehicle, count = 1) {
    const jobs = this.carriedIn(v).slice(0, count);
    if (!jobs.length) return;
    const g = this.game;
    const center = v.getPosition(new THREE.Vector3());
    const h = v.heading;
    const rear = v.spec.half.z;
    // hacia atrás; si hay una pared detrás, en diagonal o hacia un lado (lo que esté libre)
    const dirs: [number, number][] = [[0, -1], [0.7, -0.7], [-0.7, -0.7], [1, 0], [-1, 0]];
    let bx = -Math.sin(h), bz = -Math.cos(h);
    let room = rear + 6;
    let best = -1;
    for (const [sx, sz] of dirs) {
      // (sx, sz) en ejes del coche: x = izquierda, z = delante
      const dx = Math.cos(h) * sx + Math.sin(h) * sz;
      const dz = -Math.sin(h) * sx + Math.cos(h) * sz;
      const hit = g.physics.raycast(tmpO.set(center.x, center.y + 0.4, center.z), tmpD.set(dx, 0, dz), rear + 6.5, SOLID, v.body);
      const free = hit ? hit.distance - 0.6 : rear + 6.5;
      if (free > best) {
        best = free;
        bx = dx;
        bz = dz;
        room = free;
      }
      if (free >= rear + 4.5) break;
    }
    const rx = -bz, rz = bx; // perpendicular, para repartir si caen varios
    const from = v.localToWorld(tmpO.set(0, 0.2, -rear), new THREE.Vector3());
    jobs.forEach((j, i) => {
      j.state = 'pickup';
      j.where = 'none';
      j.vehicleId = null;
      const back = Math.max(1, Math.min(room, rear + 4 + rnd.next() * 2));
      const side = (i - (jobs.length - 1) / 2) * 1.6 + (rnd.next() - 0.5) * 1.2;
      const to = new THREE.Vector3(center.x + bx * back + rx * side, 0, center.z + bz * back + rz * side);
      to.y = g.world.heightAt(to.x, to.z);
      this.damage(j, 15);
      const mesh = new THREE.Mesh(dropGeo(), vertexColorMaterial);
      mesh.castShadow = true;
      mesh.position.copy(from);
      g.scene.add(mesh);
      this.flying.push({ mesh, from: from.clone(), to, t: 0, dur: 0.75 + rnd.next() * 0.15, j });
      (j as any).droppedAt = g.time.elapsed;
      (j as any).dropPos = to;
      (j as any).dropExpires = g.time.elapsed + 45;
    });
    g.mod.particles?.emit('cardboard', from, { count: 4 });
    const many = jobs.length > 1;
    this.game.events.emit('toast', { text: many ? `¡Se te han caído ${jobs.length} paquetes! Recógelos rápido` : '¡Se te ha caído un paquete! Recógelo rápido', color: '#ff4f81' });
    this.updateVehiclePackages();
  }

  /** Paquetes caídos que aún van por el aire. */
  private readonly flying: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; j: ActiveJob }[] = [];

  /** Vuelo de los paquetes caídos: arco hacia fuera y un botecito; al tocar el suelo quedan para recogerlos. */
  private updateFlying(dt: number) {
    const g = this.game;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const m = f.mesh;
      // avanza rápido al principio y frena al final (como algo que cae y rueda un poco)
      m.position.lerpVectors(f.from, f.to, 1 - (1 - k) * (1 - k));
      // arco principal (75 % del tiempo) y un bote pequeño
      const hop = k < 0.75 ? Math.sin((k / 0.75) * Math.PI) * 1.2 : Math.sin(((k - 0.75) / 0.25) * Math.PI) * 0.3;
      m.position.y += hop + 0.25;
      m.rotation.x += dt * 8 * (1 - k);
      m.rotation.y += dt * 5;
      if (k < 1) continue;
      g.scene.remove(m);
      this.flying.splice(i, 1);
      g.mod.particles?.emit('dust', f.to, { count: 4 });
      g.mod.audio?.play('drop', { pos: f.to, volume: 0.6 });
      const j = f.j;
      // mientras volaba se ha podido cancelar el encargo
      if (j.state !== 'pickup' || (j as any).dropPos !== f.to) continue;
      g.mod.pickups?.spawn('package', f.to, 1, Math.max(5, (j as any).dropExpires - g.time.elapsed), () => {
        if (j.state !== 'pickup') return;
        const pv = this.nearbyVehicle(g.mod.player.position);
        j.state = 'carry';
        j.where = pv ? 'vehicle' : 'hands';
        j.vehicleId = pv?.id ?? null;
        this.clearDrop(j);
        this.updateVehiclePackages();
        g.events.emit('toast', { text: '¡Paquete recuperado!', color: '#ffd23f' });
      });
    }
  }

  private clearDrop(j: ActiveJob) {
    delete (j as any).droppedAt;
    delete (j as any).dropPos;
    delete (j as any).dropExpires;
  }

  private cleanup() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const j = this.active[i];
      if (j.state === 'done' || j.state === 'failed') {
        const npc = this.clientNpcs.get(j);
        if (npc && !npc.removed && this.scene?.npc !== npc) this.game.mod.npcs?.remove(npc);
        this.clientNpcs.delete(j);
        this.active.splice(i, 1);
      }
    }
    this.updateVehiclePackages();
  }

  /** Destino actual de un encargo. */
  targetOf(j: ActiveJob): THREE.Vector3 {
    if (j.state === 'pickup') return (j as any).dropPos ?? j.offer.pickupPos;
    return j.offer.dest.door;
  }

  // ─────────── Bucle ───────────

  update(dt: number) {
    const g = this.game;
    if (!g.world) return;
    const p = g.mod.player;

    // nuevas ofertas
    if (this.autoOffers) {
      this.offerTimer -= dt;
      if (this.offerTimer <= 0) {
        this.offerTimer = 22 + rnd.next() * 28;
        if (this.offers.length < 3) this.createOffer();
      }
    }
    // caducan
    for (let i = this.offers.length - 1; i >= 0; i--) {
      if (g.time.elapsed > this.offers[i].expires) {
        const o = this.offers[i];
        this.offers.splice(i, 1);
        this.msgs?.receive('cliente-' + o.client.id, o.client.name, o.client.avatar, pick(LINES.expire), undefined, false);
      }
    }

    // tiempo de los encargos
    for (const j of this.active) {
      if (j.state === 'done' || j.state === 'failed') continue;
      if (this.scene?.job === j) continue;
      // el paquete del suelo ha desaparecido: se puede volver a recoger en la tienda
      if ((j as any).dropExpires !== undefined && g.time.elapsed > (j as any).dropExpires && j.state === 'pickup') {
        this.clearDrop(j);
        this.game.events.emit('toast', { text: `El paquete de ${j.offer.client.name} ha vuelto a ${j.offer.pickupName}`, color: '#ffd23f' });
      }
      j.timeLeft -= dt;
      if (j.timeLeft < -60) {
        j.state = 'failed';
        this.eco?.addFame(-3);
        this.msgs?.receive('cliente-' + j.offer.client.id, j.offer.client.name, j.offer.client.avatar, pick(LINES.cancel));
        g.mod.audio?.play('fail', { volume: 0.5 });
      }
      // cliente que cambia de dirección al llegar
      if (j.state === 'carry' && j.offer.client.quirk === 'cambia_direccion' && !j.redirected && p.position.distanceTo(j.offer.dest.door) < 60) {
        this.redirect(j);
      }
      // SOSPECHOSO: emboscada cerca del destino
      if (j.state === 'carry' && j.offer.type === 'sospechoso' && !(j as any).ambushed && p.position.distanceTo(j.offer.dest.door) < 55) {
        (j as any).ambushed = true;
        g.mod.gang?.ambush(j.offer.dest.door, 3 + Math.min(3, Math.floor((this.eco?.fameLevel ?? 1) / 2)));
      }
    }
    this.cleanup();

    // clientes esperando en la puerta
    for (const j of this.active) {
      if (j.state !== 'carry') continue;
      const near = p.position.distanceTo(j.offer.dest.door) < 32;
      const existing = this.clientNpcs.get(j);
      if (near && !existing && g.mod.npcs) {
        const d = j.offer.dest;
        const pos = d.door.clone().add(new THREE.Vector3(-Math.sin(d.facing) * 0.8, 0, -Math.cos(d.facing) * 0.8));
        const look = randomLookFor(this.rng, j.offer.client.look);
        if (j.offer.client.quirk === 'pijama_perro') {
          look.shirt = '#9ecbff';
          look.pants = '#9ecbff';
          look.shoes = '#ff9ecf';
        }
        const npc = g.mod.npcs.spawn('cliente', look, pos, d.facing);
        npc.transient = false;
        npc.voice = j.offer.client.voice;
        npc.customPose = j.offer.client.quirk === 'influencer' ? 'phone' : 'normal';
        npc.setState('custom');
        this.clientNpcs.set(j, npc);
      } else if (!near && existing && this.scene?.npc !== existing && p.position.distanceTo(j.offer.dest.door) > 60) {
        g.mod.npcs.remove(existing);
        this.clientNpcs.delete(j);
      }
    }

    this.updateScene(dt);
    this.updateFlying(dt);
    this.updateDog(dt);
    if (this.melons.length) this.updateMelons(dt);
    this.updateCarryVisual();
    this.updateHud();
  }

  /** Interacción con E: la llama el sistema de interacción. Devuelve la pista o null. */
  interactHint(): { text: string; run: () => void } | null {
    const p = this.game.mod.player;
    if (p.state !== 'foot' || this.scene) return null;
    // recoger
    for (const poi of this.pickupPois()) {
      if (p.position.distanceTo(poi.door) < 3.2 && this.active.some((j) => j.state === 'pickup' && j.offer.pickupId === poi.id && !(j as any).droppedAt)) {
        return { text: 'Recoger paquetes', run: () => this.tryPickup(poi.id) };
      }
    }
    // entregar
    for (const j of this.active) {
      if (j.state !== 'carry') continue;
      if (p.position.distanceTo(j.offer.dest.door) < 3.4) {
        if (j.where === 'vehicle') {
          const v = (this.game.mod.vehicles?.list as Vehicle[]).find((x) => x.id === j.vehicleId);
          if (!v || v.getPosition(tmpV).distanceTo(p.position) > 40) return { text: 'El paquete está en el vehículo (acércalo)', run: () => {} };
        }
        return { text: `Entregar a ${j.offer.client.name}`, run: () => this.startDelivery(j) };
      }
    }
    return null;
  }

  // ─────────── Escena de entrega ───────────

  /** Corta la escena de entrega sin cobrar (muerte, arresto, te has ido). */
  private abortScene() {
    if (!this.scene) return;
    const s = this.scene;
    this.scene = null;
    // el gemelo de los Tomás no se queda plantado en la acera para siempre
    if (s.data.twin) this.twinLeaves(s.data.twin, s.job);
    if (s.job.offer.client.quirk === 'baile') {
      const p = this.game.mod.player;
      if (p.pose === 'dance') p.poseTimer = Math.min(p.poseTimer, 0.05);
    }
    this.setHint(null);
  }

  private setHint(text: string | null) {
    const it = this.game.mod.interaction;
    if (it) it.override = text;
    else this.game.hud.hint = text;
  }

  private say(text: string, seconds = 2.6) {
    const s = this.scene;
    if (!s) return;
    const target = s.npc ?? s.job.offer.dest.door;
    this.game.mod.bubbles?.say(target, text, seconds);
    this.game.mod.audio?.say(s.npc?.position ?? s.job.offer.dest.door, 4 + Math.floor(rnd.next() * 4), s.job.offer.client.voice, 0.6);
    this.lastSayAt = this.game.time.real;
    this.lastSayFor = seconds;
  }
  /** Última frase de la escena (para que la despedida del cliente no la tape al momento). */
  private lastSayAt = -99;
  private lastSayFor = 0;

  private startDelivery(j: ActiveJob) {
    const npc = this.clientNpcs.get(j) ?? null;
    this.scene = { job: j, npc, t: 0, step: 0, data: {} };
    const p = this.game.mod.player;
    if (npc) {
      npc.face(p.position);
      p.heading = Math.atan2(npc.position.x - p.position.x, npc.position.z - p.position.z);
    }
    j.where = 'hands';
    this.game.events.emit('job:deliver-start' as any, { job: j } as any);
  }

  private updateScene(dt: number) {
    const s = this.scene;
    if (!s) return;
    const g = this.game;
    const p = g.mod.player;
    s.t += dt;
    const j = s.job;
    const quirk = j.offer.client.quirk;
    const input = g.input;
    if (j.state !== 'carry' || p.state === 'dead') return this.abortScene();
    if (s.step > 0 && quirk !== 'abuela_centimos' && p.position.distanceTo(j.offer.dest.door) > 8) return this.abortScene();
    // si el jugador se va, se acaba la escena (y se pierde la entrega en algunos casos)
    if (p.position.distanceTo(j.offer.dest.door) > 8 && s.step > 0) {
      if (quirk === 'abuela_centimos' && s.step === 1) {
        this.say('¡Oye! ¡Que no he terminado de contar!');
        this.finish(0.0, 'abandonado');
        return;
      }
    }
    switch (quirk) {
      case 'abuela_centimos': {
        if (s.step === 0) {
          this.say('Ay, hijo, espera que lo tengo en suelto…', 3);
          s.step = 1;
          s.data.next = 2.5;
          s.data.count = 0;
          this.setHint('E — «Quédese con el cambio» (cobras menos)');
        } else if (s.step === 1) {
          s.data.next -= dt;
          if (takeE(g)) {
            this.say('¡Qué majo! Toma, lo que llevo contado.');
            this.finish(0.7, 'prisa');
            return;
          }
          if (s.data.next <= 0) {
            s.data.next = 1.6;
            s.data.count += 17 + Math.floor(rnd.next() * 30);
            const lines = [`…${s.data.count}, ${s.data.count + 1} céntimos…`, '¿Por dónde iba? Ah, sí…', `…y ${s.data.count}… esta es de peseta, no vale…`, 'Espera que me pongo las gafas…'];
            this.say(lines[Math.floor(rnd.next() * lines.length)], 1.5);
            g.mod.audio?.play('coin', { pos: j.offer.dest.door, volume: 0.4 });
          }
          if (s.t > 16) {
            this.say('¡Justo! Ni un céntimo más. Ni menos.');
            this.finish(1.15, 'paciencia');
          }
        }
        break;
      }
      case 'no_he_pedido': {
        if (s.step === 0) {
          this.say('¿Esto? Yo no he pedido nada.', 3);
          s.step = 1;
        } else if (s.step === 1 && s.t > 3.5) {
          this.say('…', 2);
          s.step = 2;
        } else if (s.step === 2 && s.t > 6.5) {
          this.say('Ah, espera. Sí. Sí que lo pedí.', 2.5);
          s.step = 3;
        } else if (s.step === 3 && s.t > 8.5) {
          this.finish(1, '');
        }
        break;
      }
      case 'vecino_banda': {
        if (s.step === 0) {
          this.say(`${shortName(j.offer.client.name)} no está. Dice que me lo des a mí, que soy el vecino 😇`, 3);
          s.step = 1;
        } else if (s.step === 1 && s.t > 3) {
          // el vecino es de la banda
          this.say('¡Gracias por el paquete, pringao! ↩️', 2.5);
          const gang = g.mod.gang;
          const thief = s.npc;
          if (thief) {
            thief.hostile = true;
            thief.killable = true;
            thief.role = 'devuelto';
            thief.setState('flee');
            const away = thief.position.clone().add(new THREE.Vector3(rnd.next() * 40 - 20, 0, rnd.next() * 40 - 20));
            thief.goTo(away, true);
            thief.onDeath = () => {
              // suelta el paquete
              j.state = 'pickup';
              (j as any).dropPos = thief.position.clone();
              g.mod.pickups?.spawn('package', thief.position.clone(), 1, 60, () => {
                this.clearDrop(j);
                j.state = 'carry';
                j.where = 'hands';
                j.offer.client = { ...j.offer.client, quirk: 'none', happy: ['¡Mi paquete! El vecino es un sinvergüenza. Toma, y un extra por las molestias.'] };
                this.clientNpcs.delete(j);
                g.events.emit('toast', { text: 'Paquete recuperado: vuelve a la puerta', color: '#ffd23f' });
              });
            };
            thief.health = thief.maxHealth = 40;
          }
          gang?.ambush(j.offer.dest.door, 2, 'pistol');
          j.state = 'pickup';
          (j as any).droppedAt = g.time.elapsed;
          if (thief) (j as any).dropPos = thief.position; // el GPS sigue al ladrón
          g.events.emit('toast', { text: '¡El vecino era de Los Devueltos! Derríbale para recuperar el paquete', color: '#6c3bd1', time: 3 });
          this.clientNpcs.delete(j);
          this.scene = null;
        }
        break;
      }
      case 'regatea': {
        if (s.step === 0) {
          s.data.offer = Math.round(j.offer.pay * 0.55);
          this.say(`${j.offer.pay} €… ¿Qué tal ${s.data.offer} € y amigos?`, 4);
          s.step = 1;
          this.setHint(`E — Aceptar ${s.data.offer} €   ·   Q — ¡Ni hablar!`);
        } else if (s.step === 1) {
          if (takeE(g)) {
            this.finish(s.data.offer / j.offer.pay, 'regateo');
          } else if (input.pressed('radioPrev')) {
            if (rnd.next() < 0.55) {
              this.say('Vale, vale, qué carácter. Lo que pone.', 2.5);
              s.step = 2;
              s.data.k = 1;
            } else {
              s.data.offer = Math.round(j.offer.pay * 0.8);
              this.say(`Última oferta: ${s.data.offer} €. O eso o te devuelvo el paquete.`, 3);
              this.setHint(`E — Aceptar ${s.data.offer} €   ·   Q — Insistir`);
              s.step = 3;
            }
          }
        } else if (s.step === 2 && s.t > 0) {
          this.finish(s.data.k ?? 1, '');
        } else if (s.step === 3) {
          if (takeE(g)) this.finish(s.data.offer / j.offer.pay, 'regateo');
          else if (input.pressed('radioPrev')) {
            this.say('¡Qué duro eres! Toma, todo. Y no vuelvas.', 2.5);
            this.finish(1, '');
          }
        }
        break;
      }
      case 'firmas': {
        if (s.step === 0) {
          s.data.n = 0;
          s.data.need = 3 + Math.floor(rnd.next() * 2);
          s.data.idle = 0;
          this.say('Antes de pagar, firme aquí, por favor. 🖊️', 3);
          this.setHint(`E — Firmar (1/${s.data.need})`);
          s.step = 1;
        } else if (s.step === 1) {
          s.data.idle += dt;
          if (takeE(g)) {
            s.data.n++;
            s.data.idle = 0;
            g.mod.audio?.play('click', { volume: 0.5 });
            if (s.data.n >= s.data.need) {
              this.say('Todo en regla. Tenga, y un extra por la paciencia.', 3);
              this.finish(1.12, 'firmas');
              return;
            }
            const lines = ['Y aquí.', 'Aquí también. Con la otra mano.', 'Ahora rubrique. No, eso es un garabato.', 'Y la fecha. En números romanos.', 'Iniciales. Todas.'];
            this.say(lines[(s.data.n - 1) % lines.length], 2);
            this.setHint(`E — Firmar (${s.data.n + 1}/${s.data.need})`);
          } else if (s.data.idle > 20) {
            this.say('¿Firma o no firma? Que tengo gente esperando. Tome, y la próxima vez traiga boli.', 3);
            this.finish(0.85, '');
            return;
          }
        }
        break;
      }
      case 'pijama_perro': {
        if (s.step === 0) {
          this.say('¡Perdona las pintas! Pancho, quieto… ¡PANCHO NO!', 3);
          this.spawnDog(j.offer.dest.door);
          s.step = 1;
        } else if (s.t > 2) this.finish(1, '');
        break;
      }
      case 'influencer': {
        if (s.step === 0) {
          this.say('¡Saluda a mis seguidores! 📸✨', 2.5);
          g.mod.particles?.emit('stars', s.npc?.position.clone().setY((s.npc?.position.y ?? 0) + 1.6) ?? j.offer.dest.door, { count: 12 });
          g.mod.particles?.flash(j.offer.dest.door.clone().setY(j.offer.dest.door.y + 1.6), '#ffffff', 25, 0.12, 6);
          s.step = 1;
        } else if (s.t > 2.6) {
          this.eco?.addFame(12, 'influencer');
          this.finish(1, 'viral');
        }
        break;
      }
      case 'acertijo': {
        if (s.step === 0) {
          const r = RIDDLES[Math.floor(rnd.next() * RIDDLES.length)];
          // la buena sale con E o con Q al azar
          s.data.r = r;
          s.data.good = rnd.next() < 0.5 ? 0 : 1;
          s.data.idle = 0;
          const opts = s.data.good === 0 ? [r.a, r.b] : [r.b, r.a];
          this.say(`Antes de pagar, un acertijo: ${r.q}`, 6);
          this.setHint(`E — ${opts[0]}   ·   Q — ${opts[1]}`);
          s.step = 1;
        } else if (s.step === 1) {
          s.data.idle += dt;
          const pick = takeE(g) ? 0 : input.pressed('radioPrev') ? 1 : -1;
          if (pick === s.data.good) {
            this.say('¡Correcto! Eres más listo de lo que pareces. Que tampoco era difícil. Toma, con premio.', 3.5);
            g.mod.audio?.play('success', { volume: 0.5 });
            this.finish(1.2, 'acertijo');
          } else if (pick >= 0) {
            this.say(`¡Error! Era «${s.data.r.a}». Pero pago igual, que soy un caballero.`, 3.5);
            this.finish(1, 'acertijo-mal');
          } else if (s.data.idle > 20) {
            this.say(`¿Te rindes? Era «${s.data.r.a}». Toma, anda.`, 3);
            this.finish(1, '');
          }
        }
        break;
      }
      case 'gemelos': {
        if (s.step === 0) {
          // sale el hermano, igualito, al lado
          const npc = s.npc;
          const d = j.offer.dest;
          const rx = Math.cos(d.facing), rz = -Math.sin(d.facing);
          const base = npc ? npc.position : d.door;
          const twin = g.mod.npcs?.spawn('cliente', { ...(npc?.rig.look ?? randomLookFor(this.rng, 'civil')) }, base.clone().add(tmpV.set(rx * 1.8, 0, rz * 1.8)), d.facing);
          if (twin) {
            twin.transient = false;
            twin.voice = j.offer.client.voice;
            twin.customPose = 'normal';
            twin.setState('custom');
            twin.face(p.position);
          }
          s.data.twin = twin;
          s.data.idle = 0;
          // ¿cuál está a la izquierda del jugador? (mirando hacia ellos)
          const h = p.heading;
          const rightX = -Math.cos(h), rightZ = Math.sin(h);
          const side = (n: Npc | null) => (n ? (n.position.x - p.position.x) * rightX + (n.position.z - p.position.z) * rightZ : 0);
          s.data.left = twin && npc && side(twin) < side(npc) ? twin : npc;
          s.data.right = s.data.left === twin ? npc : twin;
          // el que lo ha pedido, al azar
          s.data.good = rnd.next() < 0.5 ? 0 : 1;
          this.say('¿Quién de los dos lo ha pedido? 😏', 3);
          if (twin) g.mod.bubbles?.say(twin, 'Eso, ¿quién?', 3);
          this.setHint('E — El de la izquierda   ·   Q — El de la derecha');
          s.step = 1;
        } else if (s.step === 1) {
          s.data.idle += dt;
          const pick = takeE(g) ? 0 : input.pressed('radioPrev') ? 1 : -1;
          const chosen: Npc | null = pick === 0 ? s.data.left : s.data.right;
          if (pick >= 0) {
            const ok = pick === s.data.good;
            if (chosen) {
              g.mod.bubbles?.say(chosen, ok ? '¡Yo! ¡Bien visto! Toma, con propina. Mi hermano no da propinas.' : '¡Que era mi hermano! Bueno, da igual: paga él. Menos, eso sí.', 3.5);
              // (la despedida del cliente espera a que se lea esto)
              this.lastSayAt = g.time.real;
              this.lastSayFor = 3.5;
            }
            this.finish(ok ? 1.15 : 0.9, ok ? 'gemelos' : 'gemelos-mal');
          } else if (s.data.idle > 20) {
            this.say('Da igual, pagamos a medias. Como siempre.', 3);
            this.finish(1, '');
          }
          if (!this.scene) this.twinLeaves(s.data.twin, j);
        }
        break;
      }
      case 'timido': {
        if (s.step === 0) {
          this.say('Ay… ¿te puedes alejar un poco? Es que me da vergüenza… 🫣', 3.5);
          this.setHint('Aléjate unos pasos de la puerta (sin irte del todo)');
          s.data.wait = 0;
          s.data.away = 0;
          s.step = 1;
        } else if (s.step === 1) {
          s.data.wait += dt;
          const d = p.position.distanceTo(j.offer.dest.door);
          s.data.away = d > 3.8 ? s.data.away + dt : 0;
          if (s.data.away > 1.2) {
            this.say('G-gracias… lo cojo yo… no mires… Toma, y perdona.', 3.5);
            this.finish(1.1, 'timido');
          } else if (s.data.wait > 16) {
            this.say('Vale… lo cojo… pero no me mires… (se tapa la cara)', 3);
            this.finish(1, '');
          }
        }
        break;
      }
      case 'en_especie': {
        if (s.step === 0) {
          this.say('No tengo suelto, sobrino. ¿Te pago una parte en melones? Curan todo. 🍈', 4);
          this.setHint('E — Vale, melones (menos dinero, curan)   ·   Q — Mejor en euros');
          s.data.idle = 0;
          s.step = 1;
        } else if (s.step === 1) {
          s.data.idle += dt;
          if (takeE(g)) {
            this.say('¡Así me gusta! Toma: tres melones y un poquito de dinero.', 3.5);
            this.spawnMelons(j.offer.dest, 3);
            this.finish(0.65, 'melones');
          } else if (input.pressed('radioPrev') || s.data.idle > 15) {
            this.say('Vale, vale… en euros. Qué poco te gusta la fruta.', 3);
            this.finish(1, '');
          }
        }
        break;
      }
      case 'desconfiado': {
        if (s.step === 0) {
          this.say('Déjame ver… (agita la caja) … ¿Tú has agitado esto?', 3.5);
          g.mod.audio?.play('drop', { pos: j.offer.dest.door, volume: 0.5 });
          this.setHint('E — «No, qué va»   ·   Q — «Un poquito…»');
          s.data.idle = 0;
          s.step = 1;
        } else if (s.step === 1) {
          s.data.idle += dt;
          const intact = j.integrity >= 95;
          if (takeE(g)) {
            if (intact) {
              this.say('Mmm… suena entero. Te creo. Por esta vez.', 3);
              this.finish(1.1, 'confianza');
            } else {
              this.say('¡Suena a trocitos! ¡Mentiroso! Te pago menos, por trolero.', 3.5);
              this.finish(0.8, 'mentira');
            }
          } else if (input.pressed('radioPrev')) {
            this.say('Aprecio la sinceridad. Eso no abunda. Toma, y un extra.', 3);
            this.eco?.addFame(5, 'sinceridad');
            this.finish(intact ? 1.15 : 1, 'sinceridad');
          } else if (s.data.idle > 18) {
            this.say('El que calla, otorga. Hmm. Toma.', 3);
            this.finish(0.95, '');
          }
        }
        break;
      }
      case 'baile': {
        // minijuego: tres pasos; hay que pulsar E justo cuando grita «¡AHORA!»
        if (s.step === 0) {
          this.say('¡En mi casa se cobra bailando! Pulsa E cuando te diga «¡AHORA!» 💃', 3.5);
          s.npc?.setState('dance');
          p.pose = 'dance';
          p.poseTimer = 14;
          s.data.beat = 0;
          s.data.hits = 0;
          s.data.next = 3;
          s.data.win = -1;
          this.setHint('E — ¡Paso de baile! (cuando diga «¡AHORA!»)');
          s.step = 1;
        } else if (s.step === 1) {
          if (s.data.win > 0) {
            s.data.win -= dt;
            if (takeE(g)) {
              s.data.hits++;
              s.data.win = -1;
              s.data.next = 1.1 + rnd.next() * 1.1;
              this.say(['¡Eso es!', '¡Olé esas caderas!', '¡Qué arte, repartidor!'][s.data.hits - 1] ?? '¡Bien!', 0.9);
              g.mod.audio?.play('coin', { volume: 0.6 });
              g.mod.particles?.emit('stars', tmpV.copy(p.position).setY(p.position.y + 1.8), { count: 5 });
            } else if (s.data.win <= 0) {
              s.data.win = -1;
              s.data.next = 1.1 + rnd.next() * 1.1;
              this.say('¡Tarde! ¡Más ritmo!', 0.9);
            }
          } else {
            if (takeE(g)) this.say('¡Todavía no! ¡Espera!', 0.7);
            s.data.next -= dt;
            if (s.data.next <= 0) {
              if (s.data.beat >= 3) {
                p.poseTimer = Math.min(p.poseTimer, 0.05);
                const hits = s.data.hits;
                if (hits >= 3) {
                  this.say('¡Tienes dos pies derechos! ¡Te apunto a la clase avanzada! Toma, con propina.', 3.5);
                  this.eco?.addFame(10, 'baile');
                  g.mod.audio?.play('cheer', { volume: 0.7 });
                  this.finish(1.3, 'baile-perfecto');
                } else if (hits > 0) {
                  this.say('No está mal. Para ser repartidor. Toma.', 3);
                  this.finish(1.1, 'baile');
                } else {
                  this.say('Tienes dos pies izquierdos… y ninguno baila. Toma, anda.', 3);
                  this.finish(1, 'baile');
                }
                return;
              }
              s.data.beat++;
              s.data.win = 0.8;
              this.say('💃 ¡AHORA!', 0.8);
              g.mod.audio?.play('bell', { volume: 0.5 });
            }
          }
        }
        break;
      }
      case 'moneda': {
        if (s.step === 0) {
          this.say('¿Doble o nada? Bueno, doble o mitad. ¿Cara o cruz? 🪙', 3.5);
          this.setHint('E — Cara   ·   Q — Cruz   ·   (si no dices nada, cobro normal)');
          s.data.idle = 0;
          s.step = 1;
        } else if (s.step === 1) {
          s.data.idle += dt;
          const pick = takeE(g) ? 0 : input.pressed('radioPrev') ? 1 : -1;
          if (pick >= 0) {
            s.data.pick = pick;
            s.data.res = rnd.next() < 0.5 ? 0 : 1;
            s.data.t = 0;
            s.step = 2;
            this.setHint(null);
            this.say('🪙 (tira la moneda) … … …', 1.8);
            g.mod.audio?.play('coin');
          } else if (s.data.idle > 10) {
            this.say('¿No apuestas? Qué soso. Toma lo tuyo.', 2.5);
            this.finish(1, '');
          }
        } else if (s.step === 2) {
          s.data.t += dt;
          if (s.data.t > 1.9) {
            const side = s.data.res === 0 ? 'CARA' : 'CRUZ';
            if (s.data.pick === s.data.res) {
              this.say(`¡${side}! Has ganado. Toma el doble. Bueno, casi.`, 3);
              g.mod.audio?.play('cheer', { volume: 0.6 });
              this.finish(1.6, 'moneda-gana');
            } else {
              this.say(`¡${side}! Pierdes. La mitad y gracias. La casa siempre gana.`, 3);
              g.mod.audio?.play('boo', { volume: 0.5 });
              this.finish(0.6, 'moneda-pierde');
            }
          }
        }
        break;
      }
      case 'chistes': {
        if (s.step === 0) {
          const jk = JOKES[Math.floor(rnd.next() * JOKES.length)];
          s.data.jk = jk;
          s.data.t = 0;
          this.say(jk.q, 3);
          s.step = 1;
        } else if (s.step === 1) {
          s.data.t += dt;
          if (s.data.t > 2.6) {
            this.say(s.data.jk.a, 4);
            this.setHint('E — Reírse 😂   ·   Q — «No lo pillo»');
            s.data.idle = 0;
            s.step = 2;
          }
        } else if (s.step === 2) {
          s.data.idle += dt;
          if (takeE(g)) {
            g.mod.bubbles?.say(p, '¡JAJAJAJA!', 1.6);
            this.say('¡Por fin alguien con gusto! Toma, con propina.', 3);
            this.finish(1.15, 'risa');
          } else if (input.pressed('radioPrev')) {
            this.say('Pues es que… lo de… ya sabes… Bueno, da igual. Toma.', 3.5);
            this.finish(1, 'sin-gracia');
          } else if (s.data.idle > 10) {
            this.say('(silencio incómodo) … Toma, anda.', 2.5);
            this.finish(1, '');
          }
        }
        break;
      }
      default:
        if (s.step === 0) {
          s.step = 1;
          if (s.t >= 0) this.finish(1, '');
        }
    }
  }

  /** Cierra la entrega: cobra según integridad, tiempo y manía. k = multiplicador del pago. */
  private finish(k: number, why: string) {
    const s = this.scene!;
    const j = s.job;
    const g = this.game;
    this.scene = null;
    this.setHint(null);
    if (why === 'abandonado') {
      j.state = 'failed';
      return;
    }
    const c = j.offer.client;
    const late = j.timeLeft < 0;
    const broken = j.integrity < 40;
    let pay = j.offer.pay * k;
    if (late) pay *= 0.5;
    pay *= j.integrity >= 90 ? 1 : 0.3 + (j.integrity / 100) * 0.7;
    let tip = 0;
    const perfect = !late && j.integrity >= 95 && j.timeLeft > j.offer.time * 0.25;
    if (perfect) tip = Math.round(j.offer.pay * (0.1 + rnd.next() * 0.2));
    pay = Math.max(1, Math.round(pay));
    const line = broken ? c.broken : late ? c.late : c.happy;
    const bye = line[Math.floor(rnd.next() * line.length)];
    const who = s.npc ?? j.offer.dest.door;
    // si la escena acaba de decir algo («¡Correcto!», «¡Cara!»...), la despedida sale después y no lo tapa
    const wait = g.time.real - this.lastSayAt < 0.3 ? Math.min(3.5, this.lastSayFor) : 0;
    if (wait > 0) setTimeout(() => this.game.mod.bubbles?.say(who, bye, 3), wait * 1000);
    else this.game.mod.bubbles?.say(who, bye, 3.5);
    this.eco?.addCash(pay, 'cobro');
    if (tip) setTimeout(() => this.eco?.addCash(tip, 'propina'), 600);
    j.state = 'done';
    this.completed++;
    const eco = this.eco;
    if (eco) {
      eco.stats.deliveries++;
      if (perfect) eco.stats.perfect++;
      if (tip) eco.stats.tips += tip;
    }
    const famePts = perfect ? FAME_PERFECT : broken || late ? FAME_BAD : FAME_OK;
    eco?.addFame(famePts, 'entrega');
    g.mod.particles?.emit('money', g.mod.player.position.clone().setY(g.mod.player.position.y + 1.5), { count: 10 });
    const title = perfect ? '¡ENTREGA PERFECTA!' : broken ? 'Entrega… regular' : late ? 'Entrega con retraso' : '¡Entregado!';
    g.events.emit('toast', { text: `${title}  +${pay} €${tip ? ` (+${tip} € de propina)` : ''}  ·  ⭐ +${famePts}`, color: perfect ? '#ffd23f' : broken ? '#ff4f81' : '#2ec4b6', time: 3 });
    // why: cómo acabó la escena ('paciencia' = esperó a que la abuela contara todo, 'regateo', 'prisa'…)
    g.events.emit('job:done' as any, { job: j, pay, tip, perfect, why } as any);
    this.msgs?.receive('cliente-' + c.id, c.name, c.avatar, pick(broken ? LINES.broken : perfect ? LINES.perfect : late ? LINES.late : LINES.ok), undefined, false);
    // el cliente se mete en casa
    const npc = s.npc;
    if (npc) {
      setTimeout(() => {
        if (!npc.removed) {
          npc.setState('walk');
          npc.goTo(j.offer.dest.door.clone().add(new THREE.Vector3(-Math.sin(j.offer.dest.facing) * 3, 0, -Math.cos(j.offer.dest.facing) * 3)));
          setTimeout(() => !npc.removed && g.mod.npcs?.remove(npc), 2500);
        }
      }, 3000);
      this.clientNpcs.delete(j);
    }
  }

  private redirect(j: ActiveJob) {
    const w = this.game.world;
    const opts = w.deliverySpots.filter((d) => {
      const dd = d.door.distanceTo(j.offer.dest.door);
      return dd > 70 && dd < 200;
    });
    if (!opts.length) return;
    const nd = opts[Math.floor(rnd.next() * opts.length)];
    j.redirected = true;
    const old = this.clientNpcs.get(j);
    if (old) {
      this.game.mod.npcs?.remove(old);
      this.clientNpcs.delete(j);
    }
    const extra = Math.round((10 + this.roadDist(j.offer.dest.door, nd.door) / JOB_SPEED) * TYPE_INFO[j.offer.type].timeK);
    j.offer = { ...j.offer, dest: nd, pay: Math.round(j.offer.pay * 1.2), time: j.offer.time + extra };
    j.timeLeft = Math.max(j.timeLeft, 0) + extra;
    const c = j.offer.client;
    const why = REDIRECTS[Math.floor(rnd.next() * REDIRECTS.length)];
    this.msgs?.receive('cliente-' + c.id, c.name, c.avatar, `${why} Ahora estoy en ${nd.label}. Te subo a ${j.offer.pay} € por las molestias.`);
    this.game.events.emit('toast', { text: `📍 ${shortName(c.name)} ha cambiado de sitio: +${extra} s`, color: j.color, time: 2.5 });
  }

  // ─────────── Melones y gemelos ───────────

  /** Deja melones en el suelo delante de la puerta. */
  private spawnMelons(d: DeliverySpot, n: number) {
    const g = this.game;
    const fx = Math.sin(d.facing), fz = Math.cos(d.facing);
    // en fila a un lado de la puerta (no debajo del jugador, que está delante)
    const sgn = rnd.next() < 0.5 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(melonGeo(), vertexColorMaterial);
      m.castShadow = true;
      const side = sgn * (1.7 + i * 1.15);
      m.position.set(d.door.x + fx * 0.9 + fz * side, 0, d.door.z + fz * 0.9 - fx * side);
      m.position.y = g.world.heightAt(m.position.x, m.position.z);
      m.rotation.y = rnd.next() * Math.PI;
      g.scene.add(m);
      this.melons.push({ mesh: m, t: 0 });
    }
  }

  private updateMelons(dt: number) {
    const g = this.game;
    const p = g.mod.player;
    for (let i = this.melons.length - 1; i >= 0; i--) {
      const m = this.melons[i];
      m.t += dt;
      const pos = m.mesh.position;
      const take = m.t > 1.2 && p.state === 'foot' && Math.abs(p.position.x - pos.x) < 1 && Math.abs(p.position.z - pos.z) < 1;
      if (take) {
        p.health = Math.min(p.maxHealth, p.health + MELON_HEAL);
        g.mod.audio?.play('pickup', { volume: 0.6 });
        g.mod.particles?.emit('fruit', tmpV.copy(pos).setY(pos.y + 0.3), { count: 6 });
        g.mod.bubbles?.number?.(pos, `🍈 +${MELON_HEAL}`, '#7cb342');
      }
      if (take || m.t > 90) {
        g.scene.remove(m.mesh);
        this.melons.splice(i, 1);
      }
    }
  }

  /** El gemelo se mete en casa detrás del otro. */
  private twinLeaves(twin: Npc | null | undefined, j: ActiveJob) {
    if (!twin || twin.removed) return;
    const g = this.game;
    setTimeout(() => {
      if (twin.removed) return;
      twin.setState('walk');
      twin.goTo(j.offer.dest.door.clone().add(new THREE.Vector3(-Math.sin(j.offer.dest.facing) * 3, 0, -Math.cos(j.offer.dest.facing) * 3)));
      setTimeout(() => !twin.removed && g.mod.npcs?.remove(twin), 2500);
    }, 3000);
  }

  // ─────────── Perro ───────────

  private spawnDog(at: THREE.Vector3) {
    const b = new GeoBuilder();
    b.box(0.35, 0.3, 0.7, '#c8915a', 0, 0.45, 0);
    b.box(0.3, 0.3, 0.32, '#c8915a', 0, 0.68, 0.42);
    b.box(0.16, 0.12, 0.16, '#2b1b0f', 0, 0.64, 0.62);
    b.box(0.08, 0.16, 0.06, '#8f6238', 0.12, 0.88, 0.38);
    b.box(0.08, 0.16, 0.06, '#8f6238', -0.12, 0.88, 0.38);
    for (const [x, z] of [[0.12, 0.25], [-0.12, 0.25], [0.12, -0.25], [-0.12, -0.25]]) b.box(0.1, 0.32, 0.1, '#b07b48', x, 0.16, z);
    b.box(0.06, 0.06, 0.3, '#c8915a', 0, 0.6, -0.45, 0.6, 0, 0);
    const mesh = new THREE.Group();
    const m = new THREE.Mesh(b.build(), vertexColorMaterial);
    m.castShadow = true;
    mesh.add(m);
    mesh.position.copy(at);
    this.game.scene.add(mesh);
    this.dog = { mesh, t: 0, pos: at.clone() };
  }

  private updateDog(dt: number) {
    const d = this.dog;
    if (!d) return;
    const g = this.game;
    const p = g.mod.player;
    d.t += dt;
    const to = tmpV.copy(p.position).sub(d.pos).setY(0);
    const dist = to.length();
    const speed = d.t < 11 ? 6.5 : -4;
    if (dist > 0.8 || speed < 0) {
      to.normalize();
      d.pos.addScaledVector(to, speed * dt);
    } else if (d.t < 11 && p.state === 'foot' && rnd.next() < dt * 2) {
      p.push.copy(to.normalize()).multiplyScalar(3).setY(1);
      g.mod.bubbles?.say(p, '¡Suelta, Pancho!', 1.2);
    }
    d.pos.y = g.world.heightAt(d.pos.x, d.pos.z) + Math.abs(Math.sin(d.t * 14)) * 0.12;
    d.mesh.position.copy(d.pos);
    d.mesh.rotation.y = Math.atan2(to.x, to.z) + (speed < 0 ? Math.PI : 0);
    if (Math.floor(d.t * 1.5) !== Math.floor((d.t - dt) * 1.5) && d.t < 11) g.mod.audio?.play('dog', { pos: d.pos });
    if (d.t > 16) {
      g.scene.remove(d.mesh);
      this.dog = null;
    }
  }

  // ─────────── Visual y HUD ───────────

  private updateCarryVisual() {
    const p = this.game.mod.player;
    const carrying = p.state === 'foot' && this.active.some((j) => j.state === 'carry' && j.where === 'hands');
    if (carrying && !this.boxMesh && p.rig) {
      this.boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.4), new THREE.MeshLambertMaterial({ color: '#c8915a' }));
      this.boxMesh.position.set(0, 0, 0.25);
      p.rig.attach('chest', this.boxMesh);
    } else if (!carrying && this.boxMesh) {
      p.rig?.detach(this.boxMesh);
      this.boxMesh.parent?.remove(this.boxMesh);
      this.boxMesh = null;
    }
  }

  // Lo que se pinta en el HUD se reutiliza de un frame a otro (antes se creaban listas y objetos nuevos cada frame).
  private readonly hudList: { id: string; title: string; timeLeft: number | null; integrity: number | null; color?: string }[] = [];
  private readonly hudViews = new Map<ActiveJob, { entry: { id: string; title: string; timeLeft: number | null; integrity: number | null; color?: string }; key: string; marker: any }>();
  private readonly waypoint = { x: 0, z: 0, label: '', color: '', auto: true };

  private updateHud() {
    const g = this.game;
    const hud = g.hud;
    const list = this.hudList;
    list.length = 0;
    // marcadores del minimapa: fuera los de encargos (sin crear lista nueva); los demás sistemas añaden los suyos después
    const mk = hud.markers as any[];
    let w = 0;
    for (let i = 0; i < mk.length; i++) if (!mk[i].job) mk[w++] = mk[i];
    mk.length = w;
    let urgent: ActiveJob | null = null;
    for (const j of this.active) {
      if (j.state !== 'pickup' && j.state !== 'carry') continue;
      let v = this.hudViews.get(j);
      if (!v) {
        v = { entry: { id: String(j.offer.id), title: '', timeLeft: 0, integrity: null, color: j.color }, key: '', marker: { x: 0, z: 0, icon: '', color: j.color, label: '', job: true } };
        this.hudViews.set(j, v);
      }
      // el título solo se rehace si cambia el estado o el destino
      const dropped = j.state === 'pickup' && !!(j as any).dropPos;
      const key = j.state + j.offer.dest.id + (dropped ? '*' : '');
      if (v.key !== key) {
        v.key = key;
        const label = TYPE_INFO[j.offer.type].label;
        // paquete caído o robado: se recoge donde esté, no en la tienda
        // con el nombre del cliente: dos recogidas en el mismo sitio no se confunden
        const who = shortName(j.offer.client.name);
        const pick = dropped ? `¡Recupera el paquete de ${who}!` : `${who} · recoger en ${j.offer.pickupName}`;
        v.entry.title = `${label !== 'Normal' ? label + ' · ' : ''}${j.state === 'pickup' ? pick : j.offer.client.name + ' · ' + j.offer.dest.label}`;
        v.marker.icon = j.state === 'pickup' ? '📦' : '🏠';
        v.marker.label = j.state === 'pickup' ? (dropped ? 'Paquete perdido' : j.offer.pickupName) : j.offer.dest.label;
      }
      v.entry.timeLeft = j.timeLeft;
      v.entry.integrity = j.state === 'carry' ? j.integrity : null;
      list.push(v.entry);
      const t = this.targetOf(j);
      v.marker.x = t.x;
      v.marker.z = t.z;
      mk.push(v.marker);
      if (!urgent || j.timeLeft < urgent.timeLeft) urgent = j;
    }
    // los encargos ya terminados dejan de tener vista
    if (this.hudViews.size > list.length) for (const j of this.hudViews.keys()) if (!this.active.includes(j) || (j.state !== 'pickup' && j.state !== 'carry')) this.hudViews.delete(j);
    hud.jobs = list;
    // GPS al encargo más urgente (si el jugador no ha puesto uno a mano)
    const manual = hud.waypoint && !(hud.waypoint as any).auto;
    if (!manual) {
      if (urgent) {
        const t = this.targetOf(urgent);
        const wp = this.waypoint;
        wp.x = t.x;
        wp.z = t.z;
        wp.label = urgent.state === 'pickup' ? 'Recoger' : 'Entregar';
        wp.color = urgent.color;
        hud.waypoint = wp;
      } else if (hud.waypoint) hud.waypoint = null;
    }
  }
}
