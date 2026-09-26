// Tu empresa de reparto: ampliar la oficina (se ve el cambio), contratar repartidores que ganan dinero
// cada día de juego (y a veces los asalta la banda), comprar furgonetas para la flota y lujos de oficina.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Interaction } from './interact';
import type { Economy } from './economy';
import { fmt } from './economy';
import type { ShopUI, ShopItem } from '../ui/shop';
import type { Poi } from '../core/contracts';
import { GeoBuilder, vertexColorMaterial } from '../core/geo';
import { fx as rnd } from '../core/rng';
import { DAY_LENGTH_SECONDS } from '../core/game';

/**
 * Lo que gana un repartidor en un día de juego (20 minutos reales) con rendimiento 100 % y la
 * oficina sin ampliar: ~340 € (≈1.000 € por hora real). Cada nivel de oficina suma un 15 %.
 * Contratar (600 €) + su furgoneta (3.500 €) se paga sola en unas 4 horas de juego: es una meta
 * larga, no un atajo. Lo ganan poco a poco y lo ingresan al acabar el día (dormir no multiplica nada).
 */
const DAY_EARN = 340;
const HIRE_PRICE = 600;
const FLEET_VAN_PRICE = 3500;

export interface Employee {
  id: number;
  name: string;
  avatar: string;
  skill: number; // 0.8..1.3 (cuánto gana)
  earnedToday: number;
  robbed: boolean;
}

const NAMES = ['Juanjo "Turbo"', 'Loli Pedales', 'Toni Tres Paquetes', 'Rocío Rayo', 'El Chino (que es de Cuenca)', 'Maripaz Motos', 'Braulio Brújula', 'Yolanda Sin Frenos', 'Kike Caja', 'Fermín Furgón', 'Sonia Sprint', 'Paco Precinto'];
const AVATARS = ['🧑‍🦱', '👩‍🦰', '🧔', '👩', '🧑', '👨‍🦲', '👱', '👩‍🦱', '🧑‍🦰', '👴', '👧', '🧓'];

export const OFFICE_LEVELS = [
  { name: 'Cuartucho con goteras', price: 0, maxStaff: 1 },
  { name: 'Oficina decente', price: 3000, maxStaff: 2 },
  { name: 'Centro logístico', price: 9000, maxStaff: 4 },
  { name: 'Imperio del Cartón', price: 25000, maxStaff: 6 },
];

export const LUXURIES = [
  { id: 'cafe', icon: '☕', name: 'Máquina de café', price: 400, fame: 10, desc: 'Café de verdad. Bueno, de máquina.' },
  { id: 'sillon', icon: '🪑', name: 'Sillón de jefe', price: 1200, fame: 20, desc: 'Gira. Reclina. Impone.' },
  { id: 'acuario', icon: '🐠', name: 'Acuario', price: 2500, fame: 30, desc: 'Con un pez que se llama Reembolso.' },
  { id: 'cuadro', icon: '🖼️', name: 'Cuadro tuyo gigante', price: 4000, fame: 45, desc: 'Al óleo. Tamaño fachada.' },
  { id: 'billar', icon: '🎱', name: 'Mesa de billar', price: 6000, fame: 60, desc: 'Para las reuniones importantes.' },
];

/** Quita los marcadores con esa marca sin crear una lista nueva. */
function dropMarkers(list: any[], flag: string) {
  let w = 0;
  for (let i = 0; i < list.length; i++) if (!list[i][flag]) list[w++] = list[i];
  list.length = w;
}

export class Company implements System {
  name = 'company';
  level = 0;
  staff: Employee[] = [];
  fleet = 0; // furgonetas de la flota (además de la tuya)
  luxuries = new Set<string>();
  private nextId = 1;
  private rescue: { emp: Employee; pos: THREE.Vector3; timer: number; enemies: any[]; marker?: any; armed?: boolean } | null = null;
  private decor: THREE.Object3D[] = [];
  private office: Poi | undefined;

  constructor(private game: Game) {
    game.mod.company = this;
    this.office = game.world.pois.find((p) => p.kind === 'office');
    const it = game.mod.interaction as Interaction;
    // la oficina: gestionar la empresa (el cajero y la recogida de paquetes tienen prioridad).
    // Desde la fase 6 la oficina tiene interior y la empresa se gestiona dentro, en el tablón: en la
    // puerta solo queda «Entrar en la oficina». (game.mod.fase se fija después de crear este módulo,
    // por eso se mira al usarlo y no aquí.)
    it.addPoi((p) => p.kind === 'office' && (this.game.mod.fase ?? 9) < 6, 'Gestionar tu empresa (tablón, personal, flota)', () => this.open(), 3.2, 1);
    game.events.on('newday', () => this.payday());
    game.events.on('player:respawn', () => {
      if (this.rescue) { this.rescue.enemies = []; this.rescue.armed = false; }
    });
    this.refreshDecor();
  }

  private get eco(): Economy {
    return this.game.mod.economy;
  }
  private get ui(): ShopUI {
    return this.game.mod.shopUI;
  }

  open() {
    this.ui.open({
      title: 'Contra Reembolso S.L.',
      subtitle: `${OFFICE_LEVELS[this.level].name} · ${this.staff.length} repartidor${this.staff.length === 1 ? '' : 'es'} · ${this.fleet} furgoneta${this.fleet === 1 ? '' : 's'} en la flota`,
      color: '#ffd23f',
      icon: '🏢',
      sections: () => {
        const story = this.game.mod.story?.boardItems?.() as ShopItem[] | undefined;
        const secs = [];
        if (story?.length) secs.push({ title: 'Tablón de encargos grandes', items: story });
        const nextLvl = OFFICE_LEVELS[this.level + 1];
        secs.push({
          title: 'Ampliar la oficina',
          items: [
            nextLvl
              ? {
                  id: 'ampliar', icon: '🏗️', name: nextLvl.name, desc: `Hasta ${nextLvl.maxStaff} repartidores. Se nota por fuera: cartel, estanterías, furgonetas aparcadas.`,
                  price: nextLvl.price, label: 'Ampliar',
                  buy: () => {
                    if (!this.eco.spend(nextLvl.price, 'oficina')) return false;
                    this.level++;
                    this.eco.addFame(40, 'ampliar oficina');
                    this.refreshDecor();
                    this.game.events.emit('toast', { text: `¡Oficina ampliada: ${nextLvl.name}!`, color: '#ffd23f', time: 3 });
                    return true;
                  },
                }
              : { id: 'max', icon: '👑', name: 'Imperio del Cartón', desc: 'No se puede ampliar más. Eres el rey del reparto.', price: 0, label: '—', disabled: true, buy: () => false },
          ],
        });
        const max = OFFICE_LEVELS[this.level].maxStaff;
        secs.push({
          title: `Personal (${this.staff.length}/${max}) · cada uno necesita una furgoneta de la flota`,
          items: [
            {
              id: 'contratar', icon: '🤝', name: 'Contratar repartidor', desc: `Reparte por su cuenta: unos ${fmt(this.dayEarn(1))} por día de juego, que ingresa en tu banco al acabar el día.`,
              price: HIRE_PRICE, label: 'Contratar', disabled: this.staff.length >= max || this.staff.length >= this.fleet,
              locked: this.staff.length >= this.fleet ? 'Compra otra furgoneta' : this.staff.length >= max ? 'Amplía la oficina' : undefined,
              buy: () => {
                if (!this.eco.spend(HIRE_PRICE, 'contrato')) return false;
                this.hire();
                return true;
              },
            },
            {
              id: 'flota', icon: '🚐', name: 'Furgoneta para la flota', desc: 'Amarilla, con el logo. Aparece aparcada delante de la oficina.',
              price: FLEET_VAN_PRICE, label: 'Comprar', disabled: this.fleet >= OFFICE_LEVELS[OFFICE_LEVELS.length - 1].maxStaff,
              buy: () => {
                if (!this.eco.spend(FLEET_VAN_PRICE, 'flota')) return false;
                this.fleet++;
                this.refreshDecor();
                return true;
              },
            },
            ...this.staff.map((e) => ({
              id: 'emp' + e.id, icon: e.avatar, name: e.name, desc: `Rendimiento ${Math.round(e.skill * 100)} %. Hoy lleva ${fmt(e.earnedToday)}.`,
              price: 0, label: 'Despedir',
              buy: () => {
                this.staff = this.staff.filter((x) => x !== e);
                this.game.mod.messages?.receive('staff-' + e.id, e.name, e.avatar, 'Pues vale. Me voy a Los Devueltos, que pagan en cartón pero pagan. 😤');
                return true;
              },
            } as ShopItem)),
          ],
        });
        secs.push({
          title: 'Lujos de oficina (suben la FAMA)',
          items: LUXURIES.map((l) => ({
            id: l.id, icon: l.icon, name: l.name, desc: l.desc, price: this.luxuries.has(l.id) ? 0 : l.price,
            owned: this.luxuries.has(l.id), label: this.luxuries.has(l.id) ? 'Tuyo' : 'Comprar', disabled: this.luxuries.has(l.id),
            buy: () => {
              if (!this.eco.spend(l.price, 'lujo')) return false;
              this.luxuries.add(l.id);
              this.eco.addFame(l.fame, 'lujo oficina');
              this.refreshDecor();
              return true;
            },
          } as ShopItem)),
        });
        return secs;
      },
    });
  }

  /** Lo que gana en un día de juego un repartidor con ese rendimiento, según el nivel de la oficina. */
  private dayEarn(skill: number): number {
    return DAY_EARN * skill * (1 + this.level * 0.15);
  }

  hire(): Employee {
    // tras cargar partida, que no se repitan números (y nombres) de empleados
    for (const e of this.staff) this.nextId = Math.max(this.nextId, e.id + 1);
    const i = this.nextId++;
    const e: Employee = { id: i, name: NAMES[(i - 1) % NAMES.length], avatar: AVATARS[(i - 1) % AVATARS.length], skill: 0.8 + rnd.next() * 0.5, earnedToday: 0, robbed: false };
    this.staff.push(e);
    this.game.mod.messages?.receive('staff-' + e.id, e.name, e.avatar, '¡Gracias por el curro, jefe! Mañana te traigo los primeros euros. 💪');
    return e;
  }

  /** Cada día de juego: los repartidores ingresan lo que han ido ganando. */
  private payday() {
    if (!this.staff.length) return;
    let total = 0;
    const lines: string[] = [];
    // si el día apenas ha durado (dormir justo después de cobrar), no hay resumen que dar
    if (this.staff.every((e) => !e.robbed && e.earnedToday < 1)) return;
    for (const e of this.staff) {
      const earn = e.robbed ? 0 : Math.round(e.earnedToday);
      total += earn;
      lines.push(`${e.avatar} ${e.name}: ${e.robbed ? 'le robaron 😢' : fmt(earn)}`);
      e.earnedToday = 0;
      e.robbed = false;
    }
    if (total > 0) this.eco.addBank(total, 'empresa');
    this.game.mod.messages?.receive('empresa', 'Contra Reembolso S.L.', '🏢', `Resumen del día: ${fmt(total)} ingresados en el banco.\n${lines.join('\n')}`);
  }

  /** Vuelve a pintar lo que se ve de la empresa (tras cargar partida). */
  refresh() {
    this.refreshDecor();
  }

  private refreshDecor() {
    const g = this.game;
    for (const o of this.decor) g.scene.remove(o);
    this.decor = [];
    const office = this.office;
    if (!office) return;
    const f = office.facing;
    const fwd = new THREE.Vector3(Math.sin(f), 0, Math.cos(f));
    const right = new THREE.Vector3(Math.cos(f), 0, -Math.sin(f));
    const place = (obj: THREE.Object3D, side: number, out: number, up = 0) => {
      const p = office.door.clone().addScaledVector(right, side).addScaledVector(fwd, out);
      p.y = g.world.heightAt(p.x, p.z) + up;
      obj.position.copy(p);
      obj.rotation.y = f;
      g.scene.add(obj);
      this.decor.push(obj);
    };
    // nivel 1+: cartel luminoso
    if (this.level >= 1) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 128;
      const x = c.getContext('2d')!;
      x.fillStyle = '#1b1030';
      x.fillRect(0, 0, 512, 128);
      x.fillStyle = '#ffd23f';
      x.font = '900 64px system-ui';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(this.level >= 3 ? '★ IMPERIO C.R. ★' : 'CONTRA REEMBOLSO', 256, 66);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      place(sign, 0, -0.4, 5.2);
    }
    // nivel 2+: estanterías con paquetes fuera
    if (this.level >= 2) {
      const b = new GeoBuilder();
      for (let s = 0; s < 3; s++) {
        b.box(2.2, 0.08, 0.6, '#8a5a33', 0, 0.4 + s * 0.7, 0);
        for (let k = 0; k < 4; k++) b.box(0.4, 0.35, 0.4, ['#c8915a', '#b07b48', '#d9a870'][(k + s) % 3], -0.8 + k * 0.52, 0.62 + s * 0.7, 0);
      }
      b.box(0.08, 2.2, 0.6, '#6b4226', -1.1, 1.1, 0);
      b.box(0.08, 2.2, 0.6, '#6b4226', 1.1, 1.1, 0);
      const m = new THREE.Mesh(b.build(), vertexColorMaterial);
      m.castShadow = true;
      place(m, 4.5, 0.6);
    }
    // cuadro gigante tuyo en la fachada
    if (this.luxuries.has('cuadro')) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 320;
      const x = c.getContext('2d')!;
      x.fillStyle = '#d4af37';
      x.fillRect(0, 0, 256, 320);
      x.fillStyle = '#ffecd2';
      x.fillRect(16, 16, 224, 288);
      x.fillStyle = '#e0ac69';
      x.beginPath();
      x.arc(128, 130, 60, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#ff4f81';
      x.fillRect(64, 60, 128, 34);
      x.fillStyle = '#1b1030';
      x.fillRect(100, 120, 14, 14);
      x.fillRect(142, 120, 14, 14);
      x.fillRect(104, 160, 48, 8);
      x.fillStyle = '#ffd23f';
      x.fillRect(48, 200, 160, 100);
      x.fillStyle = '#1b1030';
      x.font = '900 22px system-ui';
      x.textAlign = 'center';
      x.fillText('EL JEFE', 128, 262);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3), new THREE.MeshLambertMaterial({ map: tex }));
      place(pic, -4.2, -0.35, 2.4);
    }
    // furgonetas de la flota aparcadas
    const vm = g.mod.vehicles;
    if (vm) {
      const parked = ((this as any).fleetVans ?? []) as any[];
      for (const v of parked) if (!v.destroyed && v !== vm.current) vm.remove(v);
      const vans: any[] = [];
      for (let i = 0; i < Math.min(this.fleet, 4); i++) {
        const p = office.door.clone().addScaledVector(fwd, 9).addScaledVector(right, -9 + i * 4.5);
        p.y = g.world.heightAt(p.x, p.z);
        const v = vm.spawn('van', p, f + Math.PI / 2, '#ffd23f');
        v.transient = false;
        (v as any).fleet = true;
        vans.push(v);
      }
      (this as any).fleetVans = vans;
    }
  }

  update(dt: number) {
    const g = this.game;
    // los repartidores van ganando a lo largo del día (con alguna variación)
    for (const e of this.staff) {
      if (!e.robbed) e.earnedToday += (this.dayEarn(e.skill) / DAY_LENGTH_SECONDS) * dt * (0.8 + rnd.next() * 0.4);
    }
    // repartidores que piden ayuda de vez en cuando
    if (!this.rescue && this.staff.length && rnd.next() < dt / 400) {
      const e = this.staff[Math.floor(rnd.next() * this.staff.length)];
      const spots = g.world.deliverySpots;
      const s = spots[Math.floor(rnd.next() * spots.length)];
      this.rescue = { emp: e, pos: s.door.clone(), timer: 180, enemies: [] };
      g.mod.messages?.receive('staff-' + e.id, e.name, e.avatar, `¡JEFE! ¡Los Devueltos me han rodeado en ${s.label}! ¡Ven rápido o me quitan todo lo de hoy! 😱`);
    }
    const r = this.rescue;
    if (r) {
      r.timer -= dt;
      dropMarkers(g.hud.markers, 'rescue');
      r.marker ??= { x: r.pos.x, z: r.pos.z, icon: '🆘', color: '#ff4f81', label: `Ayuda a ${r.emp.name}`, rescue: true };
      g.hud.markers.push(r.marker);
      const p = g.mod.player;
      // tras reaparecer, la emboscada no vuelve a salir hasta que te alejes y vuelvas (sin bucles de muertes)
      const dp = p.position.distanceTo(r.pos);
      if (dp > 90) r.armed = true;
      if (!r.enemies.length && r.armed !== false && dp < 60) r.enemies = g.mod.gang?.ambush(r.pos, 3) ?? [];
      // si se han borrado por distancia sin morir, volverán a salir cuando vuelvas
      if (r.enemies.length && r.enemies.some((n: any) => n.removed && n.state !== 'dead')) r.enemies = [];
      const beaten = r.enemies.length > 0 && r.enemies.every((n: any) => n.state === 'dead' || (n.killable && n.health <= 0));
      if (beaten) {
        g.mod.messages?.receive('staff-' + r.emp.id, r.emp.name, r.emp.avatar, '¡Gracias, jefe! ¡Eres un crack! Mañana te traigo el doble. Bueno, lo normal. 🙏');
        this.eco.addFame(15, 'rescate');
        this.eco.addCash(100, 'propina empleado');
        dropMarkers(g.hud.markers, 'rescue');
        this.rescue = null;
      } else if (r.timer <= 0) {
        // los que esperaban al acecho se van (no se quedan apostados junto a la puerta)
        for (const n of r.enemies) if (!n.removed && n.alive && !n.brain?.aggro && n.brain) { n.brain.lurk = false; n.brain.bored = true; n.brain.calmUntil = g.time.elapsed + 30; }
        r.emp.robbed = true;
        r.emp.earnedToday = 0;
        g.mod.messages?.receive('staff-' + r.emp.id, r.emp.name, r.emp.avatar, 'Se lo han llevado todo, jefe. Hoy no hay caja. 😢');
        dropMarkers(g.hud.markers, 'rescue');
        this.rescue = null;
      }
    }
  }
}
