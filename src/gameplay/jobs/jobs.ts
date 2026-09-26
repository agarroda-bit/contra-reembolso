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

const TYPE_INFO: Record<PackageType, { label: string; mult: number; color: string; timeK: number }> = {
  normal: { label: 'Normal', mult: 1, color: '#ffd23f', timeK: 1 },
  fragil: { label: 'FRÁGIL', mult: 1.6, color: '#ff4f81', timeK: 1.15 },
  urgente: { label: 'URGENTE', mult: 1.7, color: '#ff7b54', timeK: 0.55 },
  sospechoso: { label: 'SOSPECHOSO', mult: 3, color: '#6c3bd1', timeK: 1.1 },
  pesado: { label: 'PESADO', mult: 1.5, color: '#2ec4b6', timeK: 1.2 },
};
export { TYPE_INFO };

const JOB_COLORS = ['#ffd23f', '#2ec4b6', '#ff4f81', '#ff7b54', '#06d6a0', '#9b5de5'];
const tmpV = new THREE.Vector3();

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
  /** Encargos automáticos activados (el tutorial los enciende). */
  autoOffers = true;
  completed = 0;
  /** Contador de cada manía para no repetir demasiado. */
  private lastClients: string[] = [];

  constructor(private game: Game) {
    game.mod.jobs = this;
    game.events.on('vehicle:impact' as any, (e: any) => this.onImpact(e.vehicle as Vehicle, e.dv as number));
    game.events.on('vehicle:landed' as any, (e: any) => this.onLanded(e.vehicle as Vehicle, e.air as number));
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
    do {
      c = CLIENTS[Math.floor(this.rng.next() * CLIENTS.length)];
    } while (this.lastClients.includes(c.id) && guard++ < 10);
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
      if (client.id === 'fiorella') type = 'fragil';
      if (client.id === 'misterio') type = 'sospechoso';
      if (client.id === 'gimnasio') type = 'pesado';
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
    // tiempo: ir a recoger + llevarlo, a unos 6 m/s de media, con margen
    const toPickup = this.game.mod.player ? this.game.mod.player.position.distanceTo(pickup.door) : 100;
    const time = opts.time ?? Math.round((50 + (toPickup + dist) / 6) * info.timeK);
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
    this.offers.push(offer);
    const extra = `\n📦 ${info.label} · 💶 ${pay} € · ⏱ ${Math.round(time)} s · Recoger en ${pickup.name}`;
    this.msgs?.receive('cliente-' + client.id, client.name, client.avatar, message + extra, [
      { label: 'Aceptar', style: 'si', run: () => this.accept(offer.id), valid: () => this.offers.includes(offer) },
      { label: 'Paso', style: 'no', run: () => this.decline(offer.id), valid: () => this.offers.includes(offer) },
    ]);
    return offer;
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
    const job: ActiveJob = {
      offer: o, state: 'pickup', integrity: 100, timeLeft: o.time, where: 'none', vehicleId: null,
      color: JOB_COLORS[(o.id - 1) % JOB_COLORS.length],
    };
    this.active.push(job);
    this.msgs?.reply('cliente-' + o.client.id, rnd.next() < 0.5 ? '¡Voy para allá! 📦' : 'Hecho. Contra reembolso, ¿eh?');
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
    this.msgs?.reply('cliente-' + o.client.id, 'Lo siento, hoy no puedo 🙏');
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

  private onLanded(v: Vehicle, air: number) {
    for (const j of this.carriedIn(v)) this.damage(j, air * (j.offer.type === 'fragil' ? 30 : 7));
  }

  private damage(j: ActiveJob, loss: number) {
    if (loss <= 0.5) return;
    const before = j.integrity;
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

  private updateVehiclePackages() {
    for (const v of (this.game.mod.vehicles?.list ?? []) as Vehicle[]) v.packages = this.carriedIn(v).length;
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

  /** Se caen paquetes de un vehículo (embestidas): quedan en el suelo para recogerlos. */
  dropFrom(v: Vehicle, count = 1) {
    const jobs = this.carriedIn(v).slice(0, count);
    for (const j of jobs) {
      j.state = 'pickup';
      j.where = 'none';
      j.vehicleId = null;
      const pos = v.getPosition(new THREE.Vector3());
      pos.x += (rnd.next() - 0.5) * 4;
      pos.z += (rnd.next() - 0.5) * 4;
      pos.y = this.game.world.heightAt(pos.x, pos.z);
      this.damage(j, 15);
      this.game.mod.pickups?.spawn('package', pos, 1, 45, () => {
        if (j.state !== 'pickup') return;
        const pv = this.nearbyVehicle(this.game.mod.player.position);
        j.state = 'carry';
        j.where = pv ? 'vehicle' : 'hands';
        j.vehicleId = pv?.id ?? null;
        this.clearDrop(j);
        this.updateVehiclePackages();
        this.game.events.emit('toast', { text: '¡Paquete recuperado!', color: '#ffd23f' });
      });
      (j as any).droppedAt = this.game.time.elapsed;
      (j as any).dropPos = pos.clone();
      (j as any).dropExpires = this.game.time.elapsed + 45;
    }
    if (jobs.length) {
      this.game.events.emit('toast', { text: `¡Se te ha caído ${jobs.length > 1 ? jobs.length + ' paquetes' : 'un paquete'}! Recógelo rápido`, color: '#ff4f81' });
      this.updateVehiclePackages();
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
        this.msgs?.receive('cliente-' + o.client.id, o.client.name, o.client.avatar, 'Da igual, ya se lo pido a otro. 🙄', undefined, false);
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
        this.msgs?.receive('cliente-' + j.offer.client.id, j.offer.client.name, j.offer.client.avatar, 'He cancelado el pedido. Una estrella. 😤');
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
    this.updateDog(dt);
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
    this.scene = null;
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
  }

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
          if (input.pressed('interact')) {
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
          this.say('Sergio no está. Dice que me lo des a mí, que soy el vecino 😇', 3);
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
          if (input.pressed('interact')) {
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
          if (input.pressed('interact')) this.finish(s.data.offer / j.offer.pay, 'regateo');
          else if (input.pressed('radioPrev')) {
            this.say('¡Qué duro eres! Toma, todo. Y no vuelvas.', 2.5);
            this.finish(1, '');
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
    this.game.mod.bubbles?.say(s.npc ?? j.offer.dest.door, line[Math.floor(rnd.next() * line.length)], 3.5);
    this.eco?.addCash(pay, 'cobro');
    if (tip) setTimeout(() => this.eco?.addCash(tip, 'propina'), 600);
    j.state = 'done';
    this.completed++;
    const eco = this.eco;
    if (eco) {
      eco.stats.deliveries++;
      if (perfect) eco.stats.perfect++;
      if (tip) eco.stats.tips += tip;
      eco.addFame(perfect ? 12 : broken || late ? 2 : 6, 'entrega');
    }
    g.mod.particles?.emit('money', g.mod.player.position.clone().setY(g.mod.player.position.y + 1.5), { count: 10 });
    const title = perfect ? '¡ENTREGA PERFECTA!' : broken ? 'Entrega… regular' : late ? 'Entrega con retraso' : '¡Entregado!';
    g.events.emit('toast', { text: `${title}  +${pay} €${tip ? ` (+${tip} € de propina)` : ''}`, color: perfect ? '#ffd23f' : broken ? '#ff4f81' : '#2ec4b6', time: 3 });
    g.events.emit('job:done' as any, { job: j, pay, tip, perfect } as any);
    this.msgs?.receive('cliente-' + c.id, c.name, c.avatar, broken ? 'Te dejo una estrella por la puntualidad. Las otras cuatro, no. 😒' : perfect ? '⭐⭐⭐⭐⭐ ¡Repetiré!' : '⭐⭐⭐ Bien, sin más.', undefined, false);
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
    j.offer = { ...j.offer, dest: nd, pay: Math.round(j.offer.pay * 1.2) };
    j.timeLeft = Math.max(j.timeLeft, 0) + 40;
    const c = j.offer.client;
    this.msgs?.receive('cliente-' + c.id, c.name, c.avatar, `Uy, que me he ido a casa de mi primo 😅 Ahora estoy en ${nd.label}. Te subo a ${j.offer.pay} € por las molestias.`);
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

  private updateHud() {
    const g = this.game;
    const hud = g.hud;
    hud.jobs = this.active
      .filter((j) => j.state === 'pickup' || j.state === 'carry')
      .map((j) => ({
        id: String(j.offer.id),
        title: `${TYPE_INFO[j.offer.type].label !== 'Normal' ? TYPE_INFO[j.offer.type].label + ' · ' : ''}${j.state === 'pickup' ? 'Recoger: ' + j.offer.pickupName : j.offer.client.name + ' · ' + j.offer.dest.label}`,
        timeLeft: j.timeLeft,
        integrity: j.state === 'carry' ? j.integrity : null,
        color: j.color,
      }));
    // marcadores del minimapa (los de encargos se reescriben cada frame; los demás sistemas añaden los suyos después)
    hud.markers = hud.markers.filter((m) => !(m as any).job);
    for (const j of this.active) {
      if (j.state !== 'pickup' && j.state !== 'carry') continue;
      const t = this.targetOf(j);
      hud.markers.push({ x: t.x, z: t.z, icon: j.state === 'pickup' ? '📦' : '🏠', color: j.color, label: j.state === 'pickup' ? j.offer.pickupName : j.offer.dest.label, job: true } as any);
    }
    // GPS al encargo más urgente (si el jugador no ha puesto uno a mano)
    const urgent = this.active.filter((j) => j.state === 'pickup' || j.state === 'carry').sort((a, b) => a.timeLeft - b.timeLeft)[0];
    const manual = hud.waypoint && !(hud.waypoint as any).auto;
    if (!manual) {
      if (urgent) {
        const t = this.targetOf(urgent);
        hud.waypoint = { x: t.x, z: t.z, label: urgent.state === 'pickup' ? 'Recoger' : 'Entregar', color: urgent.color, auto: true } as any;
      } else if (hud.waypoint) hud.waypoint = null;
    }
  }
}
