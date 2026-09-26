// Club Reembolso VIP (El Centro): pista con baldosas que laten, DJ, barra, zona VIP con reservados tras
// el cordón dorado, bola de espejos, focos, neones, humo y música de club generada en directo.
// Se compra MESA VIP (1.500 €, una por noche) y BOTELLAS DE CHAMPÁN (300 €, solo con mesa): ¡FIESTA!
// Punto de entrada: installClub(game). Necesita game.mod.interiors (y usa, si existen: shopUI, economy,
// audio, bubbles, particles, cameraRig, dayNight, save).
import * as THREE from 'three';
import type { Game } from '../../../core/game';
import type { Interiors, InteriorContext, InteriorInstance } from '../index';
import type { ShopItem, ShopSection } from '../../../ui/shop';
import {
  BAR, BOOTHS, MY_BOOTH, BOOTH, VIP, SPAWN, SPAWN_HEADING, EXIT, PORTERO_SPOT, DJ_SPOT, WAITRESS_SPOT, BPM,
  onDanceFloor, nightKey, boothBackSeat,
} from './layout';
import { buildRoom, drawBoothSign, type RoomParts } from './room';
import { ClubFx } from './fx';
import { Crowd, DANCE_NAMES } from './crowd';
import { ClubMusic } from './music';

export const CLUB_PRICES = { table: 1500, bottle: 300, round: 400 };
export const CLUB_FAME = { table: 60, bottle: 25, dance: 2, round: 10 };
const MAX_BOTTLES = 8;

const TABLE_TOASTS = [
  '🛋️ ¡MESA VIP! El portero te ha llamado «jefe». Te lo has creído.',
  '🛋️ ¡Reservado tuyo! Ahora eres oficialmente alguien. Más o menos.',
  '🛋️ ¡MESA VIP! Terciopelo, cordón dorado y ni un paquete a la vista.',
];
const BOTTLE_TOASTS = [
  '🍾 ¡Champán con bengala! Medio club te está grabando.',
  '🍾 ¡POP! El corcho ha salido volando. Nadie herido. Por poco.',
  '🍾 Otra botella. Tu gestor llora en silencio.',
  '🍾 El DJ dice tu nombre por el micro. Lo dice mal, pero lo dice.',
  '🍾 ¡Bengala encendida! El detector de humo ha pedido la baja.',
];
const DJ_TABLE = ['¡UN APLAUSO PARA LA MESA VIP! 👏', '¡Esa mesa la paga el rey del cartón! 👑'];
const DJ_BOTTLE = ['¡Champán para la mesa del jefe! 🍾', '¡Que suba esa botellaaa!', '¡Esto es champán y lo demás son tonterías!', '¡Más bengalas, que no se ve!'];
const DJ_ROUND = ['¡Invita el de la barra! ¡Olé!', '¡Ronda para la pista! ¡Ese repartidor sí que sabe!'];
const DJ_DANCE = ['¡Mirad a ese repartidor cómo se mueve!', '¡Eso sí que es entregar… ARTE!', '¡Dale, dale, contra reembolso!'];
const DJ_WELCOME = ['¡Bienvenido al Club Reembolso! ¡Aquí no se devuelve nada!', '¡Ha llegado el repartidor! ¡Que suene esa bocina!', '¡Buenas noches, Puerto Paquete! ¡Manos arribaaa!'];
const DJ_AMBIENT = [
  '¡Las manos arribaaa! 🙌',
  '¡Esto es CONTRA REEMBOLSO: pagas cuando bailas!',
  '¡Un saludo a los de la paquetería!',
  '¡El que no bote es de Los Devueltos!',
  '¡Si has perdido un paquete, está en la pista!',
  '¡Pedid champán, que el DJ también come!',
];
const DJ_REQUESTS = [
  '¿Reguetón? Aquí solo house, colega.',
  'Anotado. Te la pongo en 2031.',
  '¿«Paquito el chocolatero»? ...Vale, luego. Si nadie mira.',
  'Esta ya está sonando. Es TODA la misma canción, amigo.',
  'Te la pongo si me traes un paquete sin abollar.',
];
const PHOTO_TOASTS = [
  '📸 ¡Foto subida a Postureogram! 3 «me gusta». Uno es tu madre.',
  '📸 ¡Flash! Sales con los ojos cerrados, pero con mucho estilo.',
  '📸 Foto de perfil nueva: «Repartidor de día, leyenda de noche».',
  '📸 ¡Clic! El photocall dice que eres su mejor cliente (se lo dice a todos).',
];
const BARMAN_LINES = ['¿Qué te pongo? Aquí no se fía, ¿eh?', 'El champán, solo en mesa VIP. Normas de la casa.', 'Tu cara me suena… ¿tú no me trajiste una tostadora?'];
const PORTERO_NO = ['Sin mesa VIP no pasas, colega.', 'Esto es zona VIP. V-I-P. ¿Te suena?', 'Lista VIP… No sales. Paga una mesa y sales.'];
const WAITRESS_LINES = ['¿Otra botellita, jefe? Viene con bengala.', 'Enseguida se la traigo. Aparten, que quema.', 'El champán frío y la cuenta caliente, como debe ser.'];
const PORTERO_YES = ['Adelante, jefe.', 'Su mesa le espera, señor repartidor.', 'Pase, pase. Cuidado con el cordón.'];
const LED_NORMAL = '★ CLUB REEMBOLSO VIP ★ AQUÍ SIEMPRE SON LAS 3 DE LA MAÑANA ★ SE ADMITE PAGO CONTRA REEMBOLSO ★ ';
const LED_TABLE = '★ ¡MESA VIP PARA EL REPARTIDOR MÁS RÁPIDO DEL PUERTO! ★ ¡QUE SUENE ESA BOCINA! ★ ';
const LED_BOTTLE = '🍾 ¡CHAMPÁN EN LA MESA DEL JEFE! ★ ¡BENGALAS ARRIBA! ★ ¡NADIE SE VA A CASA! ★ ';

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** Estado del club que se guarda en la partida. */
export class ClubState {
  vipNight = -9999;
  bottlesNight = -9999;
  bottles = 0;
  danceNight = -9999;
  roundNight = -9999;
  photoNight = -9999;
  dances = 0;
  totalTables = 0;
  totalBottles = 0;

  constructor(private game: Game) {}

  get night(): number {
    return nightKey(this.game.clock.day, this.game.clock.hour);
  }
  get hasTable(): boolean {
    return this.vipNight === this.night;
  }
  get bottlesTonight(): number {
    return this.bottlesNight === this.night ? this.bottles : 0;
  }
  get roundTonight(): boolean {
    return this.roundNight === this.night;
  }

  save() {
    const { vipNight, bottlesNight, bottles, danceNight, roundNight, photoNight, dances, totalTables, totalBottles } = this;
    return { vipNight, bottlesNight, bottles, danceNight, roundNight, photoNight, dances, totalTables, totalBottles };
  }
  load(d: any) {
    if (!d || typeof d !== 'object') return;
    for (const k of ['vipNight', 'bottlesNight', 'bottles', 'danceNight', 'roundNight', 'photoNight', 'dances', 'totalTables', 'totalBottles'] as const) {
      if (typeof d[k] === 'number') this[k] = d[k];
    }
  }
}

/** Dónde se pide: en la barra, al portero o a la camarera desde tu mesa VIP. */
export type ShopSpot = 'barra' | 'portero' | 'mesa';

/** Lo que el club deja en game.mod.club (para pruebas, el móvil, logros...). */
export interface ClubApi {
  state: ClubState;
  readonly inside: boolean;
  /** Abre el menú de compras (como si pulsaras E en la barra, junto al portero o en tu mesa). */
  openShop(where?: ShopSpot): void;
  buyTable(): boolean;
  buyBottle(): boolean;
  /** Para pruebas: lanza la fiesta sin pagar. */
  party(kind?: 'mesa' | 'botella'): void;
  /** Para pruebas: pone el estado (mesa, botellas) sin efectos. */
  debugSet(o: { table?: boolean; bottles?: number }): void;
  dance(): void;
  sit(): void;
  instance: ClubInterior | null;
}

// ───────────────────────── El interior ─────────────────────────

export class ClubInterior implements InteriorInstance {
  spawn = SPAWN.clone();
  heading = SPAWN_HEADING;
  exit = EXIT.clone();
  inside = false;

  readonly room: RoomParts;
  readonly fx: ClubFx;
  readonly crowd: Crowd;
  readonly music: ClubMusic;
  private game: Game;
  private root: THREE.Group;
  private origin: THREE.Vector3;
  private partyTimer = 0;
  private fallbackBeat = 0;
  private ledTimer = 0;
  private myPose: 'dance' | 'sit' | null = null;
  private ropeOpen = false;
  private ropeAnim = 0; // 0 cerrado .. 1 abierto
  private lastNight = -1;
  private cooldowns = { portero: 0, barman: 0, djDance: 0, djAmbient: 0 };
  private musicRetry = 0;
  private cinematicTimer = 0;
  private afterCinematic: (() => void) | null = null;
  private lampGroup: THREE.Object3D | null = null;
  private fade: HTMLDivElement;
  private flash: HTMLDivElement;
  private playerLocal = new THREE.Vector3();
  private playerLocal2 = new THREE.Vector3();
  /** Botellas pagadas que la camarera aún no ha dejado en la mesa. */
  private pending = 0;
  /** Bengala de la botella que lleva la camarera (sigue a su mano). */
  private carry: { p: THREE.Vector3; t: number } | null = null;
  private tipLocal = new THREE.Vector3(0, 0.42, 0);

  constructor(ctx: InteriorContext, readonly state: ClubState) {
    this.game = ctx.game;
    this.root = ctx.root;
    this.origin = ctx.origin.clone();
    this.room = buildRoom(ctx);
    this.fx = new ClubFx(ctx.root, this.room);
    this.crowd = new Crowd(ctx.game, ctx.root, this.origin);
    this.music = new ClubMusic(() => this.game.mod.audio);
    this.fade = document.createElement('div');
    this.fade.style.cssText = 'position:fixed;inset:0;background:#1b1030;opacity:0;pointer-events:none;transition:opacity .28s;z-index:44';
    this.game.ui.appendChild(this.fade);
    this.flash = document.createElement('div');
    this.flash.style.cssText = 'position:fixed;inset:0;background:#ffffff;opacity:0;pointer-events:none;z-index:44';
    this.game.ui.appendChild(this.flash);
    this.applyState(true);
  }

  private get player(): any {
    return this.game.mod.player;
  }

  toWorld(local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(local).add(this.origin);
  }

  get myTable(): THREE.Vector3 {
    return new THREE.Vector3(BOOTH.tableX, VIP.h, BOOTHS[MY_BOOTH]);
  }

  // ───── Entrar y salir ─────

  onEnter() {
    this.inside = true;
    this.root.visible = true;
    this.fx.setActive(true);
    this.applyState(true);
    this.lampGroup = this.game.scene.getObjectByName('luces-farolas') ?? null;
    if (this.lampGroup) this.lampGroup.visible = false;
    this.musicRetry = 0;
    this.music.start();
    this.fx.setLedText(LED_NORMAL);
    this.cooldowns.portero = 2;
    this.cooldowns.barman = 2;
    this.cooldowns.djAmbient = 40 + Math.random() * 20;
    window.setTimeout(() => {
      if (this.inside) this.djSay(pick(DJ_WELCOME));
    }, 1400);
  }

  onExit() {
    this.inside = false;
    this.crowd.finishDeliveries();
    if (this.carry) this.carry.t = 0;
    this.carry = null;
    this.music.stop();
    this.fx.clearTransient();
    this.fx.setActive(false);
    this.root.visible = false;
    if (this.lampGroup) this.lampGroup.visible = true;
    const p = this.player;
    if (p && this.myPose && (p.pose === 'dance' || p.pose === 'sit')) {
      p.pose = 'normal';
      p.poseTimer = 0;
    }
    this.myPose = null;
    if (this.cinematicTimer > 0) {
      this.cinematicTimer = 0;
      this.afterCinematic = null;
      this.game.mod.cameraRig?.stopCinematic?.();
    }
  }

  // ───── Estado (mesa, botellas, cordón) ─────

  applyState(force = false, instantRope = force) {
    const st = this.state;
    const night = st.night;
    if (!force && night === this.lastNight) return;
    this.lastNight = night;
    const has = st.hasTable;
    // si se acaba la noche con el jugador dentro de la zona VIP, el cordón se queda abierto hasta que baje
    const inVip = this.inside && this.localPlayer().x > VIP.x0 - 0.2 && this.localPlayer().z < VIP.z1 + 0.2;
    this.setRope(has || (inVip && this.ropeOpen), instantRope);
    this.room.boothSign.redraw((g, w, h) => drawBoothSign(g, w, h, has));
    this.room.boothSignMat.opacity = has ? 1 : 0.55;
    this.showBottles(st.bottlesTonight - this.pending);
  }

  private setRope(open: boolean, instant = false) {
    this.ropeOpen = open;
    this.room.gapCollider.setEnabled(!open);
    if (instant) this.ropeAnim = open ? 1 : 0;
  }

  private showBottles(n: number): number {
    const b = this.room.bottles;
    const slots = this.room.bottleSlots;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < Math.min(n, slots.length); i++) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7);
      m.compose(slots[i], q, new THREE.Vector3(1, 1, 1));
      b.setMatrixAt(i, m);
    }
    b.count = Math.max(0, Math.min(n, slots.length));
    b.instanceMatrix.needsUpdate = true;
    return b.count;
  }

  private localPlayer(): THREE.Vector3 {
    const p = this.player;
    if (!p) return this.playerLocal.set(0, -100, 0);
    return this.playerLocal.copy(p.position).sub(this.origin);
  }

  // ───── Interacción (E) ─────

  interact(local: THREE.Vector3): { text: string; run: () => void } | null {
    const st = this.state;
    const d2 = (a: THREE.Vector3) => Math.hypot(local.x - a.x, local.z - a.z);
    if (d2(PORTERO_SPOT) < 2.3 && local.y < 0.5) {
      return { text: st.hasTable ? 'Hablar con el portero' : 'Hablar con el portero (mesa VIP)', run: () => this.openShop('portero') };
    }
    if (local.x > BAR.x1 - 0.2 && local.x < BAR.x1 + 2 && local.z > BAR.z0 - 0.4 && local.z < BAR.z1 + 0.4 && local.y < 0.5) {
      return { text: 'Pedir en la barra (mesa VIP y champán)', run: () => this.openShop('barra') };
    }
    if (st.hasTable && local.y > 0.35) {
      // sentado en tu mesa (o junto a la camarera) se pide el champán sin bajar a la barra
      if (this.myPose === 'sit' || d2(WAITRESS_SPOT) < 1.6) {
        return { text: 'Pedir champán a la camarera', run: () => this.openShop('mesa') };
      }
      if (d2(this.myTable) < 2.3) return { text: 'Sentarte en tu reservado', run: () => this.sitDown(false) };
    }
    if (local.z < -6.6 && Math.abs(local.x) < 2.6 && local.y < 0.4) {
      return { text: 'Pedirle una canción al DJ', run: () => this.askDj() };
    }
    if (onDanceFloor(local.x, local.z) && local.y < 0.4) {
      return { text: this.myPose === 'dance' ? 'Cambiar de paso' : 'Bailar', run: () => this.dance() };
    }
    if (local.x > 9.6 && local.x < 14.6 && local.z > 8.0 && local.y < 0.5) {
      return { text: 'Hacerte una foto en el photocall', run: () => this.photo() };
    }
    if (local.x < -10.6 && local.z > 8.2 && local.z < 9.9 && local.y < 0.5) {
      return { text: 'Dejar algo en la paquetería', run: () => this.coatCheck() };
    }
    return null;
  }

  /** Photocall: pose, flash y foto para las redes (inventadas). */
  photo() {
    const g = this.game;
    const p = this.player;
    if (p) {
      p.heading = Math.PI; // de cara a la sala, de espaldas al photocall
      p.pose = 'dance';
      p.poseTimer = 2.2;
      this.myPose = 'dance';
      this.setPlayerDance(0);
      const cam = g.mod.cameraRig;
      if (cam) {
        cam.yaw = Math.PI - 0.3;
        cam.pitch = -0.1;
      }
    }
    window.setTimeout(() => {
      this.flash.style.transition = 'none';
      this.flash.style.opacity = '0.85';
      window.setTimeout(() => {
        this.flash.style.transition = 'opacity .45s';
        this.flash.style.opacity = '0';
      }, 60);
      g.mod.audio?.play('click', { volume: 1, pitch: 1.6 });
      this.fx.strobe(0.7);
      g.events.emit('toast', { text: pick(PHOTO_TOASTS), color: '#19e6d2', time: 3.2 });
      const st = this.state;
      if (st.photoNight !== st.night) {
        st.photoNight = st.night;
        g.mod.economy?.addFame(1, 'photocall');
      }
    }, 650);
  }

  askDj() {
    const g = this.game;
    this.djSay(pick(DJ_REQUESTS), 3.6);
    g.events.emit('toast', { text: '🎧 Le has pedido una canción al DJ. Te ha mirado raro.', color: '#b44dff', time: 2.6 });
  }

  coatCheck() {
    const g = this.game;
    const n = 1000 + Math.floor(Math.random() * 9000);
    g.events.emit('toast', { text: `🧥 Dejas la chaqueta en la paquetería. Ticket nº ${n}. «Contra reembolso, como todo», te dicen.`, color: '#19e6d2', time: 3.4 });
    g.mod.audio?.play('bell');
  }

  openShop(where: ShopSpot = 'barra') {
    const g = this.game;
    const ui = g.mod.shopUI;
    if (!ui) {
      g.events.emit('toast', { text: 'La barra está cerrada por inventario 🙃', color: '#ff4f81' });
      return;
    }
    const c = this.crowd;
    const speaker = where === 'portero' ? c.portero : where === 'mesa' ? c.waitress : c.barman;
    const line = where === 'portero'
      ? (this.state.hasTable ? pick(PORTERO_YES) : pick(PORTERO_NO))
      : where === 'mesa' ? pick(WAITRESS_LINES) : pick(BARMAN_LINES);
    const who = where === 'portero' ? 'Toni, el portero' : where === 'mesa' ? 'Vane, la camarera VIP' : 'Paco, el camarero';
    ui.open({
      title: 'Club Reembolso VIP',
      subtitle: `«${line}» — ${who}`,
      color: '#ff5fa2',
      icon: where === 'portero' ? '🕴️' : '🍾',
      sections: () => this.shopSections(),
    });
    g.mod.bubbles?.say(this.crowd.worldPos(speaker), line, 3);
  }

  private shopSections(): ShopSection[] {
    const st = this.state;
    const has = st.hasTable;
    const nb = st.bottlesTonight;
    const table: ShopItem = {
      id: 'mesa', icon: '🛋️', name: 'Mesa VIP',
      desc: has
        ? `Esta noche el reservado es tuyo. Llevas ${nb} botella${nb === 1 ? '' : 's'}.`
        : `Reservado de terciopelo tras el cordón dorado. El portero te llamará «jefe». Una por noche. +${CLUB_FAME.table} FAMA`,
      price: has ? 0 : CLUB_PRICES.table,
      owned: has,
      label: has ? 'Ya es tuya' : 'Reservar',
      disabled: has,
      buy: () => this.buyTable(),
    };
    const bottle: ShopItem = {
      id: 'champan', icon: '🍾', name: 'Botella de champán',
      desc: nb >= MAX_BOTTLES
        ? 'No queda champán frío esta noche. Has vaciado la cámara, campeón.'
        : `Llega con bengala y todo el club se entera. +${CLUB_FAME.bottle} FAMA`,
      price: CLUB_PRICES.bottle,
      label: '¡Que la traigan!',
      locked: has ? undefined : 'Solo con mesa VIP',
      disabled: nb >= MAX_BOTTLES,
      buy: () => this.buyBottle(),
    };
    const round: ShopItem = {
      id: 'ronda', icon: '🥤', name: 'Ronda para toda la pista',
      desc: st.roundTonight ? 'Ya invitaste esta noche. Te siguen queriendo (un poco).' : `Refrescos para todo el mundo. Te quieren. Por lo menos un rato. +${CLUB_FAME.round} FAMA`,
      price: st.roundTonight ? 0 : CLUB_PRICES.round,
      owned: st.roundTonight,
      label: st.roundTonight ? 'Ya invitaste' : 'Invitar',
      disabled: st.roundTonight,
      buy: () => this.buyRound(),
    };
    return [
      { title: 'Zona VIP · una mesa por noche · el champán, solo con mesa', items: [table, bottle] },
      { title: 'Para quedar bien', items: [round] },
    ];
  }

  // ───── Compras ─────

  buyTable(): boolean {
    const g = this.game;
    const st = this.state;
    if (st.hasTable) return false;
    const eco = g.mod.economy;
    if (!eco?.spend(CLUB_PRICES.table, 'mesa VIP')) return false;
    st.vipNight = st.night;
    if (st.bottlesNight !== st.night) {
      st.bottlesNight = st.night;
      st.bottles = 0;
    }
    st.totalTables++;
    eco.addFame(CLUB_FAME.table, 'mesa VIP');
    g.mod.shopUI?.close();
    g.events.emit('club:mesa' as any, { night: st.night } as any);
    this.celebrateTable();
    return true;
  }

  buyBottle(): boolean {
    const g = this.game;
    const st = this.state;
    if (!st.hasTable) {
      g.events.emit('toast', { text: 'El champán solo se sirve en mesa VIP, jefe.', color: '#ff4f81' });
      return false;
    }
    if (st.bottlesTonight >= MAX_BOTTLES) return false;
    const eco = g.mod.economy;
    if (!eco?.spend(CLUB_PRICES.bottle, 'champán')) return false;
    if (st.bottlesNight !== st.night) {
      st.bottlesNight = st.night;
      st.bottles = 0;
    }
    st.bottles++;
    st.totalBottles++;
    eco.addFame(CLUB_FAME.bottle, 'champán');
    g.mod.shopUI?.close();
    g.events.emit('club:botella' as any, { night: st.night, count: st.bottles } as any);
    this.celebrateBottle();
    return true;
  }

  buyRound(): boolean {
    const g = this.game;
    const st = this.state;
    if (st.roundTonight) return false;
    const eco = g.mod.economy;
    if (!eco?.spend(CLUB_PRICES.round, 'ronda')) return false;
    st.roundNight = st.night;
    eco.addFame(CLUB_FAME.round, 'ronda');
    g.mod.shopUI?.close();
    this.startParty(10, 4);
    this.crowd.cheer(new THREE.Vector3(0, 0, -2), 30, 4);
    g.mod.audio?.play('cheer');
    this.djSay(pick(DJ_ROUND));
    g.events.emit('toast', { text: `🥤 ¡Ronda para toda la pista! Te quieren. Por ahora. +${CLUB_FAME.round} FAMA`, color: '#19e6d2', time: 3.5 });
    return true;
  }

  // ───── ¡Fiesta! ─────

  private startParty(seconds: number, bars: number) {
    this.partyTimer = Math.max(this.partyTimer, seconds);
    this.music.party(bars);
    this.fx.strobe(1);
  }

  /** Mesa comprada: se abre el cordón, te sientas en tu reservado y la sala se viene arriba. */
  celebrateTable() {
    const g = this.game;
    this.setRope(true);
    this.applyState(true, false);
    if (!this.inside) {
      // comprada desde fuera (p. ej. desde el móvil): nada de teletransportes ni planos de cine
      g.events.emit('toast', { text: `🛋️ Mesa VIP reservada en el Club Reembolso para esta noche. +${CLUB_FAME.table} FAMA`, color: '#ffd23f', time: 4 });
      return;
    }
    g.mod.bubbles?.say(this.crowd.worldPos(this.crowd.portero), pick(PORTERO_YES), 3);
    this.fadeCut(() => {
      this.sitDown(true);
      const table = this.myTable;
      this.startParty(22, 8);
      this.fx.confettiRain(9);
      this.fx.confettiBurst(table.clone().setY(table.y + 0.7), 80, 5);
      this.fx.co2();
      this.music.co2();
      this.crowd.cheer(table, 16, 6);
      g.mod.audio?.play('cheer');
      g.mod.particles?.emit?.('confetti', this.toWorld(table.clone().setY(table.y + 1.2)), { count: 40 });
      this.showLed(LED_TABLE, 30);
      this.djSay(pick(DJ_TABLE));
      g.events.emit('toast', { text: `${pick(TABLE_TOASTS)} +${CLUB_FAME.table} FAMA`, color: '#ffd23f', time: 4 });
      // plano de cine: la cámara se acerca al reservado
      this.cinematic(new THREE.Vector3(4.8, 4.2, 1.6), new THREE.Vector3(10.2, 2.7, -0.4), table.clone().setY(table.y + 0.9), 3.4);
    });
  }

  /** Botella: aparece en tu mesa con bengala, confeti, bocina y aplausos. */
  celebrateBottle() {
    const g = this.game;
    if (!this.inside) {
      this.showBottles(this.state.bottlesTonight - this.pending);
      g.events.emit('toast', { text: `🍾 Botella reservada: te espera en tu mesa del Club Reembolso. +${CLUB_FAME.bottle} FAMA`, color: '#ffd23f', time: 3.5 });
      return;
    }
    // la camarera sale de la cava con la botella en alto y la bengala encendida
    const first = !this.crowd.delivering;
    this.pending++;
    this.crowd.deliver(() => this.bottleArrives());
    const tip = this.myTable.clone().setY(this.myTable.y + 0.9);
    this.fx.confettiRain(4);
    this.startParty(15, 4);
    this.crowd.cheer(this.myTable, 12, 5);
    g.mod.audio?.play('cheer', { volume: 0.8 });
    g.mod.particles?.emit?.('confetti', this.toWorld(tip), { count: 24 });
    this.showLed(LED_BOTTLE, 20);
    this.djSay(pick(DJ_BOTTLE));
    g.events.emit('toast', { text: `${pick(BOTTLE_TOASTS)} +${CLUB_FAME.bottle} FAMA`, color: '#ffd23f', time: 3.5 });
    // si no estás sentado, te pones a bailar donde estés
    const p = this.player;
    if (p && this.myPose !== 'sit') {
      p.pose = 'dance';
      p.poseTimer = 7;
      this.myPose = 'dance';
      this.setPlayerDance(Math.floor(Math.random() * 6));
    }
    if (first) this.cinematic(new THREE.Vector3(9.9, 2.7, -1.0), new THREE.Vector3(10.4, 2.3, -0.3), new THREE.Vector3(11.6, 1.3, 2.4), 3.4);
  }

  /** La camarera deja la botella en tu mesa: ¡pop!, confeti y la bengala sigue ardiendo en la mesa. */
  private bottleArrives() {
    const g = this.game;
    this.pending = Math.max(0, this.pending - 1);
    const n = this.showBottles(this.state.bottlesTonight - this.pending);
    const slot = this.room.bottleSlots[Math.max(0, n - 1)];
    const tip = slot.clone().setY(slot.y + 0.4);
    if (this.carry) {
      this.carry.p.copy(tip);
      this.carry.t = 4.5;
      this.carry = null;
    } else this.fx.sparkler(tip, 4.5);
    this.fx.confettiBurst(tip, 45, 4);
    if (this.inside) {
      g.mod.audio?.play('pop');
      g.mod.particles?.emit?.('confetti', this.toWorld(tip), { count: 20 });
      this.crowd.cheer(this.myTable, 8, 2.5);
    }
  }

  /** Te sientas en tu reservado (con fundido si vienes de lejos). */
  sitDown(instant: boolean) {
    const p = this.player;
    if (!p || !this.inside) return;
    const seat = boothBackSeat(BOOTHS[MY_BOOTH], 0.15);
    const doIt = () => {
      if (!this.inside || p.state !== 'foot') return; // por si has salido durante el fundido
      p.teleport(this.toWorld(seat), -Math.PI / 2);
      p.velocity?.set?.(0, 0, 0);
      p.pose = 'sit';
      p.poseTimer = 600;
      this.myPose = 'sit';
      // cámara de frente y un poco de lado para verte en tu trono de terciopelo
      const cam = this.game.mod.cameraRig;
      if (cam) {
        cam.yaw = -1.92;
        cam.pitch = -0.3;
      }
    };
    if (instant) doIt();
    else this.fadeCut(doIt);
  }

  /** Bailar en la pista (cada vez un paso distinto). */
  dance() {
    const g = this.game;
    const p = this.player;
    if (!p || !this.inside) return;
    const st = this.state;
    const style = st.dances % 6;
    st.dances++;
    p.pose = 'dance';
    p.poseTimer = 8;
    this.myPose = 'dance';
    this.setPlayerDance(style);
    let text = `💃 ¡Te marcas ${DANCE_NAMES[style]}!`;
    if (st.danceNight !== st.night) {
      st.danceNight = st.night;
      g.mod.economy?.addFame(CLUB_FAME.dance, 'bailar');
      text += ` +${CLUB_FAME.dance} FAMA`;
    }
    g.events.emit('toast', { text, color: '#ff5fa2', time: 2.5 });
    this.crowd.cheer(this.localPlayer().clone(), 3.6, 3);
    if (this.cooldowns.djDance <= 0) {
      this.cooldowns.djDance = 25;
      this.djSay(pick(DJ_DANCE));
    }
  }

  private setPlayerDance(style: number) {
    const anim = this.player?.rig?.anim;
    if (anim && typeof anim.danceStyle === 'number') anim.danceStyle = style;
  }

  private djSay(text: string, seconds = 3.2) {
    this.game.mod.bubbles?.say(this.toWorld(DJ_SPOT), text, seconds);
  }

  private showLed(text: string, seconds: number) {
    this.fx.setLedText(text);
    this.ledTimer = seconds;
  }

  /** Corte rápido a negro (para teletransportar al jugador al reservado sin que se note). */
  private fadeCut(mid: () => void) {
    this.fade.style.opacity = '1';
    window.setTimeout(() => {
      try {
        mid();
      } finally {
        window.setTimeout(() => (this.fade.style.opacity = '0'), 90);
      }
    }, 300);
  }

  private cinematic(from: THREE.Vector3, to: THREE.Vector3, look: THREE.Vector3, seconds: number, after?: () => void) {
    const cam = this.game.mod.cameraRig;
    if (!cam?.playCinematic) return;
    cam.playCinematic(this.toWorld(from), this.toWorld(to), this.toWorld(look), seconds);
    this.cinematicTimer = seconds + 0.5;
    this.afterCinematic = after ?? null;
  }

  // ───── Cada frame ─────

  update(dt: number, inside: boolean) {
    if (!inside) {
      // el cordón termina su animación aunque no mires
      return;
    }
    const g = this.game;
    this.applyState();

    // música (si el audio aún no existía al entrar, se reintenta)
    if (!this.music.running) {
      this.musicRetry -= dt;
      if (this.musicRetry <= 0) {
        this.musicRetry = 1;
        this.music.start();
      }
    }
    let beat = this.music.beat();
    if (beat === null) {
      this.fallbackBeat += (dt * BPM) / 60;
      beat = this.fallbackBeat;
    } else this.fallbackBeat = beat;
    const bar = Math.floor(beat / 4);
    const breakdown = ClubMusic.isBreak(bar);
    const kick = breakdown ? 0 : Math.exp(-(beat - Math.floor(beat)) * 6);

    // fiesta
    if (this.partyTimer > 0) this.partyTimer = Math.max(0, this.partyTimer - dt);
    const party = Math.min(1, this.partyTimer / 3);

    // cordón del hueco: se descuelga y se aparta (y se vuelve a cerrar si se acabó tu noche y ya has bajado)
    if (this.ropeOpen && !this.state.hasTable) {
      const lp = this.localPlayer();
      if (!(lp.x > VIP.x0 - 1.3 && lp.z < VIP.z1 + 0.5)) this.setRope(false);
    }
    const target = this.ropeOpen ? 1 : 0;
    this.ropeAnim += Math.sign(target - this.ropeAnim) * Math.min(Math.abs(target - this.ropeAnim), dt * 1.4);
    const e = this.ropeAnim * this.ropeAnim * (3 - 2 * this.ropeAnim);
    this.room.gapRope.rotation.y = -e * (Math.PI - 0.25);
    this.room.gapRope.rotation.z = Math.sin(e * Math.PI) * 0.25;

    // jugador: si se mueve, deja de bailar / se levanta
    const p = this.player;
    const local = this.localPlayer();
    if (p && this.myPose) {
      const moving = Math.hypot(p.velocity?.x ?? 0, p.velocity?.z ?? 0) > 0.7;
      if (p.pose !== this.myPose) this.myPose = null;
      else if (moving || p.state !== 'foot') {
        p.pose = 'normal';
        p.poseTimer = 0;
        this.myPose = null;
      }
    }

    // frases del portero y del camarero al acercarte
    this.cooldowns.portero -= dt;
    this.cooldowns.barman -= dt;
    this.cooldowns.djDance -= dt;
    this.cooldowns.djAmbient -= dt;
    if (this.cooldowns.djAmbient <= 0) {
      this.cooldowns.djAmbient = 45 + Math.random() * 30;
      this.djSay(pick(DJ_AMBIENT));
    }
    const bub = g.mod.bubbles;
    if (bub && p) {
      if (this.cooldowns.portero <= 0 && Math.hypot(local.x - PORTERO_SPOT.x, local.z - PORTERO_SPOT.z) < 3.2) {
        this.cooldowns.portero = 14;
        bub.say(this.crowd.worldPos(this.crowd.portero), this.state.hasTable ? pick(PORTERO_YES) : pick(PORTERO_NO), 2.6);
      }
      if (this.cooldowns.barman <= 0 && local.x < BAR.x1 + 1.8 && local.z > BAR.z0 && local.z < BAR.z1 && local.y < 0.5) {
        this.cooldowns.barman = 24;
        bub.say(this.crowd.worldPos(this.crowd.barman), pick(BARMAN_LINES), 2.8);
      }
    }

    // bengala de la botella que va en la mano de la camarera
    const hb = this.crowd.handBottle;
    if (hb.visible) {
      hb.updateWorldMatrix(true, false);
      const tip = hb.localToWorld(this.playerLocal2.copy(this.tipLocal)).sub(this.origin);
      if (!this.carry) this.carry = this.fx.sparkler(tip, 30);
      this.carry.p.copy(tip);
    }

    // pantalla LED: vuelve a su texto
    if (this.ledTimer > 0) {
      this.ledTimer -= dt;
      if (this.ledTimer <= 0) this.fx.setLedText(LED_NORMAL);
    }

    // plano de cine
    if (this.cinematicTimer > 0) {
      this.cinematicTimer -= dt;
      if (this.cinematicTimer <= 0) {
        const cam = g.mod.cameraRig;
        cam?.stopCinematic?.();
        this.afterCinematic?.();
        this.afterCinematic = null;
      }
    }

    this.fx.update(dt, {
      beat, kick, bar, section: bar % 32, breakdown, party, time: g.time.elapsed, player: p ? local : null,
    });
    this.crowd.update(dt, beat, party, p ? local : null);
  }

  /** Para pruebas: forzar la fiesta sin pagar. */
  debugParty(kind: 'mesa' | 'botella') {
    if (kind === 'mesa') {
      if (!this.state.hasTable) this.state.vipNight = this.state.night;
      this.celebrateTable();
    } else {
      const st = this.state;
      if (!st.hasTable) st.vipNight = st.night;
      if (st.bottlesNight !== st.night) {
        st.bottlesNight = st.night;
        st.bottles = 0;
      }
      st.bottles = Math.min(MAX_BOTTLES, st.bottles + 1);
      this.celebrateBottle();
    }
  }
}

// ───────────────────────── Instalación ─────────────────────────

/** Luz de club mientras estás dentro: sin sol, cielo morado tenue y exposición fija. */
function installLighting(game: Game, isInside: () => boolean) {
  const hemiSky = new THREE.Color('#5b43a8');
  const hemiGround = new THREE.Color('#3a1030');
  const amb = new THREE.Color('#3b2a66');
  const fogC = new THREE.Color('#140c20');
  const scene = game.scene as any;
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (...args: unknown[]) {
    prev?.apply(this, args);
    if (!isInside()) return;
    const dn = game.mod.dayNight;
    if (dn) {
      dn.sun.intensity = 0;
      dn.sun.shadow.autoUpdate = false;
      dn.hemi.color.copy(hemiSky);
      dn.hemi.groundColor.copy(hemiGround);
      dn.hemi.intensity = 1.55;
      dn.ambient.color.copy(amb);
      dn.ambient.intensity = 0.7;
    }
    game.renderer.toneMappingExposure = 1.1;
    const fog = game.scene.fog as THREE.Fog | null;
    if (fog) fog.color.copy(fogC);
  };
}

export function installClub(game: Game): void {
  const interiors = game.mod.interiors as Interiors | undefined;
  if (!interiors) {
    console.warn('[club] No hay sistema de interiores (game.mod.interiors): el club no se instala.');
    return;
  }
  const state = new ClubState(game);
  let inst: ClubInterior | null = null;

  interiors.register({
    id: 'club',
    name: 'Club Reembolso VIP',
    doorText: 'Entrar en el Club Reembolso VIP',
    poi: (p) => p.kind === 'club',
    build: (ctx) => {
      inst = new ClubInterior(ctx, state);
      return inst;
    },
  });
  installLighting(game, () => !!inst?.inside);

  // guardado (si el sistema de guardado ya existe; si no, se intenta más tarde)
  let registered = false;
  const tryRegister = () => {
    if (registered || !game.mod.save?.register) return;
    registered = true;
    game.mod.save.register({ key: 'club', save: () => state.save(), load: (d: any) => state.load(d) });
  };
  tryRegister();

  // en los menús (pausa, tienda) la música suena amortiguada
  let muffled = false;
  game.addSystem({
    name: 'club',
    update: () => {
      tryRegister();
      if (muffled) {
        muffled = false;
        inst?.music.setMuffled(false);
      }
    },
    pausedUpdate: () => {
      if (!muffled && inst?.inside && !game.mod.shopUI?.isOpen) {
        muffled = true;
        inst.music.setMuffled(true);
      }
    },
  });

  const api: ClubApi = {
    state,
    get inside() {
      return !!inst?.inside;
    },
    get instance() {
      return inst;
    },
    openShop: (where = 'barra') => inst?.openShop(where),
    buyTable: () => inst?.buyTable() ?? false,
    buyBottle: () => inst?.buyBottle() ?? false,
    party: (kind = 'mesa') => inst?.debugParty(kind),
    debugSet: (o) => {
      if (o.table !== undefined) state.vipNight = o.table ? state.night : -9999;
      if (o.bottles !== undefined) {
        state.bottlesNight = state.night;
        state.bottles = Math.max(0, Math.min(MAX_BOTTLES, o.bottles));
      }
      inst?.applyState(true);
    },
    dance: () => inst?.dance(),
    sit: () => inst?.sitDown(true),
  };
  game.mod.club = api;
}

