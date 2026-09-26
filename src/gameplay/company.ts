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

export class Company implements System {
  name = 'company';
  level = 0;
  staff: Employee[] = [];
  fleet = 0; // furgonetas de la flota (además de la tuya)
  luxuries = new Set<string>();
  private nextId = 1;
  private rescue: { emp: Employee; pos: THREE.Vector3; timer: number; enemies: any[] } | null = null;
  private decor: THREE.Object3D[] = [];
  private office: Poi | undefined;

  constructor(private game: Game) {
    game.mod.company = this;
    this.office = game.world.pois.find((p) => p.kind === 'office');
    const it = game.mod.interaction as Interaction;
    // la oficina: gestionar la empresa (el cajero y la recogida de paquetes tienen prioridad)
    it.addPoi('office', 'Gestionar tu empresa (tablón, personal, flota)', () => this.open(), 3.2, 1);
    game.events.on('newday', () => this.payday());
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
              id: 'contratar', icon: '🤝', name: 'Contratar repartidor', desc: 'Reparte por su cuenta y te deja dinero cada día de juego en el banco.',
              price: 600, label: 'Contratar', disabled: this.staff.length >= max || this.staff.length >= this.fleet,
              locked: this.staff.length >= this.fleet ? 'Compra otra furgoneta' : undefined,
              buy: () => {
                if (!this.eco.spend(600, 'contrato')) return false;
                this.hire();
                return true;
              },
            },
            {
              id: 'flota', icon: '🚐', name: 'Furgoneta para la flota', desc: 'Amarilla, con el logo. Aparece aparcada delante de la oficina.',
              price: 3500, label: 'Comprar', disabled: this.fleet >= OFFICE_LEVELS[OFFICE_LEVELS.length - 1].maxStaff,
              buy: () => {
                if (!this.eco.spend(3500, 'flota')) return false;
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

  hire(): Employee {
    const i = this.nextId++;
    const e: Employee = { id: i, name: NAMES[(i - 1) % NAMES.length], avatar: AVATARS[(i - 1) % AVATARS.length], skill: 0.8 + rnd.next() * 0.5, earnedToday: 0, robbed: false };
    this.staff.push(e);
    this.game.mod.messages?.receive('staff-' + e.id, e.name, e.avatar, '¡Gracias por el curro, jefe! Mañana te traigo los primeros euros. 💪');
    return e;
  }

  /** Cada día de juego: los repartidores ingresan lo ganado. */
  private payday() {
    if (!this.staff.length) return;
    let total = 0;
    const lines: string[] = [];
    for (const e of this.staff) {
      const earn = e.robbed ? 0 : Math.round((180 + rnd.next() * 120) * e.skill * (1 + this.level * 0.15));
      total += earn;
      lines.push(`${e.avatar} ${e.name}: ${e.robbed ? 'le robaron 😢' : fmt(earn)}`);
      e.earnedToday = 0;
      e.robbed = false;
    }
    this.eco.bank += total;
    this.game.events.emit('money', { cash: this.eco.cash, bank: this.eco.bank, delta: 0, reason: 'banco' });
    this.game.mod.messages?.receive('empresa', 'Contra Reembolso S.L.', '🏢', `Resumen del día: ${fmt(total)} ingresados en el banco.\n${lines.join('\n')}`);
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
      g.hud.markers = g.hud.markers.filter((m) => !(m as any).rescue);
      g.hud.markers.push({ x: r.pos.x, z: r.pos.z, icon: '🆘', color: '#ff4f81', label: `Ayuda a ${r.emp.name}`, rescue: true } as any);
      const p = g.mod.player;
      if (!r.enemies.length && p.position.distanceTo(r.pos) < 60) r.enemies = g.mod.gang?.ambush(r.pos, 3) ?? [];
      const beaten = r.enemies.length > 0 && r.enemies.every((n: any) => !n.alive || n.removed);
      if (beaten) {
        g.mod.messages?.receive('staff-' + r.emp.id, r.emp.name, r.emp.avatar, '¡Gracias, jefe! ¡Eres un crack! Mañana te traigo el doble. Bueno, lo normal. 🙏');
        this.eco.addFame(15, 'rescate');
        this.eco.addCash(100, 'propina empleado');
        g.hud.markers = g.hud.markers.filter((m) => !(m as any).rescue);
        this.rescue = null;
      } else if (r.timer <= 0) {
        r.emp.robbed = true;
        g.mod.messages?.receive('staff-' + r.emp.id, r.emp.name, r.emp.avatar, 'Se lo han llevado todo, jefe. Hoy no hay caja. 😢');
        g.hud.markers = g.hud.markers.filter((m) => !(m as any).rescue);
        this.rescue = null;
      }
    }
  }
}
