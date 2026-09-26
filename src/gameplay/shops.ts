// Tiendas: taller y concesionario (Polígono), armería (Polígono) y ropa (Centro).
// Y el garaje: tus vehículos comprados, que se piden desde el móvil.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Interaction } from './interact';
import type { Economy } from './economy';
import type { ShopUI, ShopSection, ShopItem } from '../ui/shop';
import type { Vehicle } from '../vehicles/vehicle';
import { VEHICLES, type VehicleKind } from '../vehicles/types';
import { WEAPONS, WEAPON_ORDER } from '../combat/weapons';
import type { Profile } from '../ui/menus';
import { repaint } from '../ai/police';
import type { CharacterLook } from '../core/contracts';

export interface OwnedVehicle {
  id: number;
  kind: VehicleKind;
  color: string;
  upgrades: Vehicle['upgrades'];
  /** Vehículo en el mundo ahora mismo (si lo hay). */
  live?: Vehicle | null;
}

const UPGRADES: { key: keyof Vehicle['upgrades']; name: string; icon: string; max: number; base: number; desc: string }[] = [
  { key: 'engine', name: 'Motor', icon: '⚙️', max: 3, base: 600, desc: 'Más aceleración y velocidad punta.' },
  { key: 'brakes', name: 'Frenos', icon: '🛑', max: 3, base: 350, desc: 'Frena antes. Muy útil con paquetes FRÁGIL.' },
  { key: 'armor', name: 'Blindaje', icon: '🛡️', max: 3, base: 800, desc: 'Aguanta más golpes y balas.' },
  { key: 'tires', name: 'Neumáticos', icon: '🛞', max: 3, base: 300, desc: 'Más agarre en las curvas.' },
  { key: 'trunk', name: 'Maletero grande', icon: '📦', max: 2, base: 700, desc: '+2 paquetes de capacidad por nivel.' },
  { key: 'nitro', name: 'Nitro', icon: '🔥', max: 2, base: 900, desc: 'Turbo más bestia (Shift).' },
];

const PAINTS = ['#ffd23f', '#e63946', '#2ec4b6', '#ff4f81', '#1d3557', '#06d6a0', '#ff7b54', '#6d597a', '#f1faee', '#111111'];

interface ClothItem {
  id: string;
  icon: string;
  name: string;
  desc: string;
  price: number;
  slot: 'uniforme' | 'gorra' | 'gafas' | 'cadena' | 'zapatillas' | 'chandal';
  apply: (l: CharacterLook, on: boolean) => void;
  fame?: number;
}

const CLOTHES: ClothItem[] = [
  { id: 'uni-amarillo', icon: '🟨', name: 'Uniforme clásico', desc: 'El de toda la vida. Amarillo reparto.', price: 0, slot: 'uniforme', apply: (l) => { l.shirt = '#ffd23f'; l.pants = '#1d3557'; } },
  { id: 'uni-rosa', icon: '🩷', name: 'Uniforme rosa chicle', desc: 'Para repartir con alegría.', price: 150, slot: 'uniforme', apply: (l) => { l.shirt = '#ff4f81'; l.pants = '#1b1030'; } },
  { id: 'uni-turquesa', icon: '🟦', name: 'Uniforme turquesa', desc: 'Frescor mediterráneo.', price: 150, slot: 'uniforme', apply: (l) => { l.shirt = '#2ec4b6'; l.pants = '#264653'; } },
  { id: 'uni-negro', icon: '⬛', name: 'Uniforme negro élite', desc: 'Repartidor de noche. Misterioso.', price: 400, slot: 'uniforme', apply: (l) => { l.shirt = '#222230'; l.pants = '#111111'; }, fame: 2 },
  { id: 'uni-dorado', icon: '🥇', name: 'Uniforme dorado', desc: 'Para el repartidor del año.', price: 2500, slot: 'uniforme', apply: (l) => { l.shirt = '#d4af37'; l.pants = '#f1faee'; }, fame: 5 },
  { id: 'gorra-rosa', icon: '🧢', name: 'Gorra rosa', desc: 'La de la casa.', price: 0, slot: 'gorra', apply: (l, on) => { l.cap = on; l.capColor = '#ff4f81'; } },
  { id: 'gorra-negra', icon: '🧢', name: 'Gorra negra', desc: 'Discreta.', price: 60, slot: 'gorra', apply: (l, on) => { l.cap = on; l.capColor = '#1b1030'; } },
  { id: 'gorra-oro', icon: '👑', name: 'Gorra dorada', desc: 'No es una corona. Casi.', price: 800, slot: 'gorra', apply: (l, on) => { l.cap = on; l.capColor = '#d4af37'; }, fame: 3 },
  { id: 'gafas', icon: '🕶️', name: 'Gafas de sol', desc: 'Para no ver las quejas.', price: 120, slot: 'gafas', apply: (l, on) => { l.glasses = on; } },
  { id: 'cadena', icon: '📿', name: 'Cadena dorada', desc: 'Pesa más que un paquete PESADO.', price: 1200, slot: 'cadena', apply: (l, on) => { l.chain = on; }, fame: 2 },
  { id: 'zapas-blancas', icon: '👟', name: 'Zapatillas blancas', desc: 'Impolutas. De momento.', price: 90, slot: 'zapatillas', apply: (l) => { l.shoes = '#f5f5f5'; } },
  { id: 'zapas-fluor', icon: '👟', name: 'Zapatillas flúor', desc: 'Se ven desde la Colina.', price: 180, slot: 'zapatillas', apply: (l) => { l.shoes = '#b6ff3b'; } },
  { id: 'zapas-rojas', icon: '👠', name: 'Zapatillas rojas', desc: 'Corren más (no).', price: 180, slot: 'zapatillas', apply: (l) => { l.shoes = '#e63946'; } },
  { id: 'chandal-lujo', icon: '🧥', name: 'Chándal de lujo', desc: 'Terciopelo morado. Elegancia de polígono.', price: 950, slot: 'chandal', apply: (l, on) => { l.jacket = on ? '#6c3bd1' : null; }, fame: 2 },
  { id: 'chandal-blanco', icon: '🥼', name: 'Chándal blanco', desc: 'Para no mancharlo nunca.', price: 1500, slot: 'chandal', apply: (l, on) => { l.jacket = on ? '#f1faee' : null; }, fame: 3 },
  { id: 'chaqueta-cuero', icon: '🧥', name: 'Chaqueta de cuero', desc: 'Rebelde con reembolso.', price: 1800, slot: 'chandal', apply: (l, on) => { l.jacket = on ? '#3a2418' : null; }, fame: 4 },
];

let nextOwned = 1;

export class Shops implements System {
  name = 'shops';
  readonly owned: OwnedVehicle[] = [];
  readonly clothesOwned = new Set<string>(['uni-amarillo', 'gorra-rosa']);
  readonly equipped: Record<string, string | null> = { uniforme: 'uni-amarillo', gorra: 'gorra-rosa', gafas: null, cadena: null, zapatillas: null, chandal: null };
  profile: Profile | null = null;
  private deliveryTimer = -1;
  private pendingDelivery: OwnedVehicle | null = null;

  constructor(private game: Game) {
    game.mod.shops = this;
    const it = game.mod.interaction as Interaction;
    it.addPoi('garage', 'Entrar al taller y concesionario', () => this.openGarage(), 4, 4);
    it.addPoi('gunshop', 'Entrar en la armería', () => this.openGunshop(), 3.5, 4);
    it.addPoi('clothes', 'Entrar en Moda Paquetona', () => this.openClothes(), 3.5, 4);
    // app del garaje en el móvil
    game.mod.phone?.extraApps.push({ id: 'garaje', icon: '🚐', name: 'Garaje', color: '#ff7b54', open: (body: HTMLDivElement) => this.phoneGarage(body) });
  }

  private get eco(): Economy {
    return this.game.mod.economy;
  }
  private get ui(): ShopUI {
    return this.game.mod.shopUI;
  }
  private get fameLvl(): number {
    return this.eco?.fameLevel ?? 1;
  }

  /** Registra un vehículo como tuyo (la furgoneta inicial, compras). */
  addOwned(kind: VehicleKind, color: string, live: Vehicle | null = null, upgrades?: Vehicle['upgrades']): OwnedVehicle {
    const o: OwnedVehicle = { id: nextOwned++, kind, color, upgrades: upgrades ?? { engine: 0, brakes: 0, armor: 0, tires: 0, trunk: 0, nitro: 0 }, live };
    if (live) {
      live.owned = true;
      live.transient = false;
      live.upgrades = o.upgrades;
      (live as any).ownedRef = o;
    }
    this.owned.push(o);
    return o;
  }

  /** El vehículo tuyo con el que estás trabajando (el que conduces o el último que usaste cerca). */
  private workVehicle(): Vehicle | null {
    const vm = this.game.mod.vehicles;
    if (vm.current) return vm.current;
    const p = this.game.mod.player.position;
    let best: Vehicle | null = null;
    let bd = 30;
    for (const v of vm.list as Vehicle[]) {
      if (v.destroyed || v.lastDriven < 0) continue;
      const d = v.getPosition(new THREE.Vector3()).distanceTo(p);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  // ─────────── Taller y concesionario ───────────

  openGarage() {
    const g = this.game;
    this.ui.open({
      title: 'Talleres Chapa y Pintura Manolo',
      subtitle: 'Coches, motos y apaños. "Si suena raro, es que funciona."',
      color: '#ff7b54',
      icon: '🔧',
      sections: () => {
        const secs: ShopSection[] = [];
        const shop: [VehicleKind, number][] = [['scooter', 1], ['compact', 1], ['taxi', 2], ['suv', 3], ['truck', 3], ['sports', 5]];
        secs.push({
          title: 'Concesionario',
          items: shop.map(([k, lvl]) => {
            const s = VEHICLES[k];
            const n = this.owned.filter((o) => o.kind === k).length;
            return {
              id: k, icon: k === 'scooter' ? '🛵' : k === 'sports' ? '🏎️' : k === 'truck' ? '🚚' : k === 'suv' ? '🚙' : k === 'taxi' ? '🚕' : '🚗',
              name: s.name, desc: `${s.capacity} paquetes · ${Math.round(s.maxSpeed * 3.6)} km/h${s.heavy ? ' · admite PESADOS' : ''}${n ? ` · tienes ${n}` : ''}`,
              price: s.price ?? 5000, locked: this.fameLvl < lvl ? `Fama ${lvl}` : undefined,
              buy: () => {
                if (!this.eco.spend(s.price ?? 5000, 'vehículo')) return false;
                const o = this.addOwned(k, s.colors[0]);
                this.deliverTo(o, g.world.pois.find((p) => p.kind === 'garage')?.parking ?? g.mod.player.position);
                g.events.emit('toast', { text: `¡${s.name} comprado! Te espera en la puerta. También lo puedes pedir desde el móvil.`, color: '#ff7b54', time: 3 });
                this.eco.addFame(10, 'compra vehículo');
                return true;
              },
            } as ShopItem;
          }),
        });
        const v = this.workVehicle();
        if (v && v.owned) {
          const o: OwnedVehicle | undefined = (v as any).ownedRef;
          secs.push({
            title: `Mejoras para tu ${v.spec.name.toLowerCase()}`,
            items: UPGRADES.map((u) => {
              const lvl = v.upgrades[u.key];
              const price = u.base * (lvl + 1);
              return {
                id: u.key, icon: u.icon, name: `${u.name} ${'★'.repeat(lvl)}${'☆'.repeat(u.max - lvl)}`, desc: u.desc,
                price: lvl >= u.max ? 0 : price, label: lvl >= u.max ? 'Al máximo' : 'Mejorar', disabled: lvl >= u.max,
                buy: () => {
                  if (!this.eco.spend(price, 'mejora')) return false;
                  v.upgrades[u.key]++;
                  if (o) o.upgrades = v.upgrades;
                  if (u.key === 'armor') v.health = v.spec.health * (1 + v.upgrades.armor * 0.3);
                  return true;
                },
              } as ShopItem;
            }),
          });
          secs.push({
            title: 'Reparar y pintar',
            items: [
              {
                id: 'reparar', icon: '🧰', name: 'Reparación completa', desc: 'Chapa, humo y abolladuras fuera.',
                price: Math.round((1 - v.health / v.spec.health) * 400), label: 'Reparar', disabled: v.health >= v.spec.health,
                buy: () => {
                  const price = Math.round((1 - v.health / v.spec.health) * 400);
                  if (!this.eco.spend(price, 'reparación')) return false;
                  v.health = v.spec.health;
                  v.onFire = false;
                  return true;
                },
              },
              ...PAINTS.map((c) => ({
                id: 'p' + c, icon: `<span style="display:inline-block;width:34px;height:34px;border-radius:50%;background:${c};border:3px solid #1b1030"></span>`,
                name: 'Pintura', desc: 'Capa nueva al momento.', price: 250, label: v.color === c ? 'Puesto' : 'Pintar', disabled: v.color === c,
                buy: () => {
                  if (!this.eco.spend(250, 'pintura')) return false;
                  repaint(v, c);
                  if (o) o.color = c;
                  return true;
                },
              } as ShopItem)),
            ],
          });
        } else {
          secs.push({ title: 'Mejoras', items: [{ id: 'nada', icon: '🅿️', name: 'Trae uno de tus vehículos', desc: 'Aparca aquí la furgoneta (o cualquier vehículo tuyo) para mejorarla.', price: 0, label: '—', disabled: true, buy: () => false }] });
        }
        return secs;
      },
    });
  }

  // ─────────── Armería ───────────

  openGunshop() {
    const g = this.game;
    const combat = g.mod.combat;
    this.ui.open({
      title: 'Armería El Gatillo Alegre',
      subtitle: '"Aquí no preguntamos. Bueno, sí: ¿efectivo o banco?"',
      color: '#e63946',
      icon: '🔫',
      sections: () => {
        const weapons = WEAPON_ORDER.filter((w) => w !== 'fists').map((w) => {
          const d = WEAPONS[w];
          const has = combat.owned.has(w);
          const lock = d.crazy ? 2 : w === 'rifle' ? 3 : 1;
          return {
            id: w, icon: d.icon, name: d.name, desc: d.desc, price: has ? d.ammoPrice : d.price,
            label: has ? `+${d.clip || 1} munición` : 'Comprar', owned: has,
            locked: !has && this.fameLvl < lock ? `Fama ${lock}` : undefined,
            buy: () => {
              if (has) {
                if (!this.eco.spend(d.ammoPrice, 'munición')) return false;
                combat.ammo[w].reserve += Math.max(1, d.clip) * (d.mode === 'grenade' ? 3 : 2);
              } else {
                if (!this.eco.spend(d.price, 'arma')) return false;
                combat.give(w);
              }
              return true;
            },
          } as ShopItem;
        });
        const p = g.mod.player;
        return [
          { title: 'Armas', items: weapons },
          {
            title: 'Protección',
            items: [
              {
                id: 'chaleco', icon: '🦺', name: 'Chaleco antibalas', desc: 'Absorbe buena parte del daño. Se gasta.', price: 300,
                label: p.armor >= 100 ? 'Lleno' : 'Comprar', disabled: p.armor >= 100,
                buy: () => {
                  if (!this.eco.spend(300, 'chaleco')) return false;
                  p.armor = 100;
                  return true;
                },
              },
              {
                id: 'botiquin', icon: '🩹', name: 'Botiquín', desc: 'Vida al máximo. Tiritas de colores incluidas.', price: 120,
                label: p.health >= p.maxHealth ? 'Lleno' : 'Comprar', disabled: p.health >= p.maxHealth,
                buy: () => {
                  if (!this.eco.spend(120, 'botiquín')) return false;
                  p.health = p.maxHealth;
                  return true;
                },
              },
            ],
          },
        ];
      },
    });
  }

  // ─────────── Ropa ───────────

  openClothes() {
    const g = this.game;
    this.ui.open({
      title: 'Moda Paquetona',
      subtitle: '"Viste como el paquete que quieres entregar."',
      color: '#ff4f81',
      icon: '👕',
      sections: () => {
        const slots: [ClothItem['slot'], string][] = [['uniforme', 'Uniformes'], ['gorra', 'Gorras'], ['gafas', 'Gafas'], ['cadena', 'Joyas'], ['zapatillas', 'Zapatillas'], ['chandal', 'Chándal y chaquetas']];
        return slots.map(([slot, title]) => ({
          title,
          items: CLOTHES.filter((c) => c.slot === slot).map((c) => {
            const has = this.clothesOwned.has(c.id);
            const on = this.equipped[slot] === c.id;
            return {
              id: c.id, icon: c.icon, name: c.name, desc: c.desc, price: has ? 0 : c.price, owned: has, equipped: on,
              label: has ? (on ? 'Quitar' : 'Ponérmelo') : 'Comprar',
              locked: !has && c.fame && this.fameLvl < c.fame ? `Fama ${c.fame}` : undefined,
              buy: () => {
                if (!has) {
                  if (!this.eco.spend(c.price, 'ropa')) return false;
                  this.clothesOwned.add(c.id);
                  this.eco.addFame(Math.round(c.price / 100), 'ropa');
                }
                if (on && (slot === 'gafas' || slot === 'cadena' || slot === 'chandal' || slot === 'gorra')) this.equipped[slot] = null;
                else this.equipped[slot] = c.id;
                this.applyClothes();
                return true;
              },
            } as ShopItem;
          }),
        }));
      },
    });
    void g;
  }

  /** Aplica la ropa equipada al aspecto del jugador. */
  applyClothes() {
    const prof = this.profile;
    const p = this.game.mod.player;
    if (!prof || !p?.rig) return;
    const l: CharacterLook = { ...prof.look };
    // quitar accesorios y volver a ponerlos según lo equipado
    l.glasses = false;
    l.chain = false;
    l.jacket = null;
    if (!this.equipped.gorra) l.cap = false;
    for (const slot of Object.keys(this.equipped)) {
      const id = this.equipped[slot];
      const c = CLOTHES.find((x) => x.id === id);
      if (c) c.apply(l, true);
    }
    p.rig.setLook(l);
  }

  // ─────────── Garaje (móvil) ───────────

  private phoneGarage(body: HTMLDivElement) {
    body.innerHTML = '';
    if (!this.owned.length) {
      body.innerHTML = '<div class="cr-tarjeta">No tienes vehículos. El concesionario está en el Polígono.</div>';
      return;
    }
    for (const o of this.owned) {
      const card = document.createElement('div');
      card.className = 'cr-tarjeta';
      const s = VEHICLES[o.kind];
      const alive = o.live && !o.live.destroyed;
      card.innerHTML = `<h3>${s.name.toUpperCase()}</h3><div style="font:700 13px system-ui">${alive ? 'Está por la isla' : o.live?.destroyed ? 'Hecho chatarra: el seguro te trae otro' : 'En el garaje'}</div>`;
      const b = document.createElement('button');
      b.className = 'cr-boton';
      b.textContent = '📍 Traémelo aquí';
      b.onclick = () => {
        this.requestDelivery(o);
        this.game.mod.phone?.toggle(false);
      };
      card.appendChild(b);
      body.appendChild(card);
    }
  }

  requestDelivery(o: OwnedVehicle) {
    this.pendingDelivery = o;
    this.deliveryTimer = 4;
    this.game.mod.messages?.receive('garaje', 'Garaje Contra Reembolso', '🚐', `Marchando: tu ${VEHICLES[o.kind].name.toLowerCase()} llega en un momento a la calle más cercana.`);
  }

  /** Pone un vehículo tuyo en el mundo (quitando el anterior si existía). */
  deliverTo(o: OwnedVehicle, pos: THREE.Vector3, heading?: number) {
    const vm = this.game.mod.vehicles;
    if (o.live && !o.live.destroyed && o.live !== vm.current) vm.remove(o.live);
    const v = vm.spawn(o.kind, pos, heading ?? 0, o.color);
    v.owned = true;
    v.transient = false;
    v.upgrades = o.upgrades;
    v.lastDriven = this.game.time.elapsed;
    (v as any).ownedRef = o;
    o.live = v;
    return v;
  }

  update(dt: number) {
    if (this.deliveryTimer > 0) {
      this.deliveryTimer -= dt;
      if (this.deliveryTimer <= 0 && this.pendingDelivery) {
        const g = this.game;
        const roads = g.mod.traffic?.roads;
        const p = g.mod.player.position;
        let pos = p.clone().add(new THREE.Vector3(3, 0, 3));
        let heading = 0;
        if (roads) {
          const ne = roads.nearestEdge(p, true);
          if (ne) {
            const e = roads.g.edges[ne.edge];
            pos = roads.lanePoint(ne.edge, 1, ne.t, e.width / 4, new THREE.Vector3());
            heading = roads.heading(ne.edge, 1);
          }
        }
        this.deliverTo(this.pendingDelivery, pos, heading);
        g.events.emit('toast', { text: 'Tu vehículo te espera en la calle 🚐', color: '#ff7b54' });
        this.pendingDelivery = null;
      }
    }
  }
}
