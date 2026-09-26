// La historia del tablón de la oficina: cinco encargos grandes con guion y humor, y el jefe final
// "El Devolución" en su camión blindado. Después del final, el mundo libre sigue.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Poi, DeliverySpot } from '../core/contracts';
import type { ShopItem } from '../ui/shop';
import type { Vehicle } from '../vehicles/vehicle';
import type { Npc } from '../actors/npc';
import type { CarBrain } from '../ai/traffic';
import { makeCombatBrain, armNpc, type CombatBrain } from '../ai/combatant';
import { randomLookFor } from '../actors/looks';
import { Rng, fx as rnd } from '../core/rng';
import { fmt } from './economy';

type StepResult = void | 'next' | 'fail' | 'done';

interface Ctx {
  g: Game;
  t: number; // segundos en el paso actual
  total: number; // segundos en la misión
  data: Record<string, any>;
  story: Story;
}

interface Step {
  objective: string | ((c: Ctx) => string);
  timer?: (c: Ctx) => number | null; // segundos restantes a mostrar
  target?: (c: Ctx) => THREE.Vector3 | null; // GPS
  enter?: (c: Ctx) => void;
  update: (c: Ctx, dt: number) => StepResult;
}

interface Mission {
  id: string;
  num: number;
  title: string;
  icon: string;
  fame: number; // nivel de fama necesario
  pitch: string; // descripción en el tablón
  reward: number;
  fameReward: number;
  /** Mensaje del jefe al empezar (se manda después de preparar el primer paso). */
  intro: string | ((c: Ctx) => string);
  outro: string;
  steps: Step[];
  cleanup?: (c: Ctx) => void;
  failText?: string;
}

const BOSS = { id: 'jefe', name: 'Don Remigio (el jefe)', avatar: '🧔' };
const tmpV = new THREE.Vector3();
const rng = new Rng('historia');

// ─────────── utilidades para las misiones ───────────

function playerPos(g: Game, out = new THREE.Vector3()): THREE.Vector3 {
  const v = g.mod.vehicles?.current;
  return v ? v.getPosition(out) : out.copy(g.mod.player.position);
}
function near(g: Game, p: THREE.Vector3, r: number) {
  return playerPos(g, tmpV).distanceTo(p) < r;
}
function onFootNear(g: Game, p: THREE.Vector3, r: number) {
  const pl = g.mod.player;
  return pl.state === 'foot' && pl.position.distanceTo(p) < r;
}
/** ¿Ha pulsado E? La gasta, para que la misma pulsación no entre además en la oficina o la tienda de al lado. */
function pressedE(g: Game) {
  if (!g.input.enabled || !g.input.pressed('interact')) return false;
  (g.input as any).justDown?.delete?.('interact');
  return true;
}
function poi(g: Game, kind: Poi['kind']): Poi {
  return g.world.pois.find((p) => p.kind === kind) ?? g.world.pois[0];
}
/** ¿Hay calle a menos de `max` metros de la puerta? (para misiones que piden aparcar la furgoneta al lado). */
function nearRoad(g: Game, d: DeliverySpot, max = 16): boolean {
  const roads = g.mod.traffic?.roads;
  if (!roads) return true;
  const ne = roads.nearestEdge(d.door, true);
  return !!ne && ne.dist < max;
}
/** Un sitio del barrio al que se llega con la furgoneta, a una distancia razonable de `from`. */
function vanSpotIn(g: Game, district: DeliverySpot['district'], from?: THREE.Vector3, minDist = 0, maxDist = Infinity): DeliverySpot {
  const all = g.world.deliverySpots.filter((d) => d.district === district && nearRoad(g, d));
  const ok = from ? all.filter((d) => { const k = d.door.distanceTo(from); return k > minDist && k < maxDist; }) : all;
  const list = ok.length ? ok : all.length ? all : g.world.deliverySpots;
  return list[Math.floor(rng.next() * list.length)];
}
/** Punto de mar a unos metros de `p` (para tirar la bomba). */
function seaPointNear(g: Game, p: THREE.Vector3, dist = 10): THREE.Vector3 {
  for (let r = dist; r <= dist * 3; r += dist) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      if (!g.world.isLand(x, z)) return new THREE.Vector3(x, g.world.seaLevel, z);
    }
  }
  return new THREE.Vector3(p.x, g.world.seaLevel, p.z + dist);
}
/** Miembros de la banda vivos a menos de `r` metros de `p`. */
function gangNear(g: Game, p: THREE.Vector3, r: number): number {
  let n = 0;
  for (const m of (g.mod.gang?.members ?? []) as Npc[]) if (m.alive && !m.removed && m.position.distanceTo(p) < r) n++;
  return n;
}
/** «Supermercado El Carrito Loco» → «el Supermercado El Carrito Loco» (para que las frases suenen bien). */
function withArticle(name: string): string {
  if (/^(Supermercado|Videoclub|Bar|Casino|Club|Taller|Estanco)\b/.test(name)) return 'el ' + name;
  if (/^(Panadería|Óptica|Armería|Tienda|Oficina|Taberna|Joyería|Frutería)\b/.test(name)) return 'la ' + name;
  return name;
}
function msg(g: Game, from: { id: string; name: string; avatar: string }, text: string) {
  g.mod.messages?.receive(from.id, from.name, from.avatar, text);
}
let storyHintActive = false;
/** Pista de la misión: solo borra la que puso ella (no pisa las de las entregas). */
function hint(g: Game, text: string | null) {
  const it = g.mod.interaction;
  if (!it) return;
  if (text) {
    it.override = text;
    storyHintActive = true;
  } else if (storyHintActive) {
    it.override = null;
    storyHintActive = false;
  }
}
function spawnBoss(g: Game, pos: THREE.Vector3): Npc {
  const look = randomLookFor(rng, 'devuelto');
  look.build = 1.35;
  look.height = 1.15;
  look.glasses = true;
  look.chain = true;
  look.jacket = '#4a2a8a';
  look.capColor = '#d4af37';
  const n = g.mod.npcs.spawn('jefe', look, pos, 0);
  n.hostile = true;
  n.killable = true;
  n.transient = false;
  n.health = n.maxHealth = 650;
  const b = makeCombatBrain('gang', 'launcher');
  b.aggro = true;
  n.brain = b;
  armNpc(n, 'launcher');
  g.mod.gang?.members.push(n);
  return n;
}

// ─────────── las cinco misiones ───────────

function missions(): Mission[] {
  return [
    {
      id: 'reloj', num: 1, title: 'El reloj de la señora Puri', icon: '⌚', fame: 2, reward: 1500, fameReward: 100,
      pitch: 'Un reloj de oro de 50.000 € para una señora de la Colina. Los Devueltos lo saben. Todo el mundo lo sabe.',
      intro: (c) =>
        `Recoge un reloj de oro de 50.000 € en ${withArticle(c.data.shop.name)} (Centro: la joyería está de obras y lo guardan allí, entre los yogures) y llévaselo a la señora Puri, en la Colina, sin un rasguño. Ojo, que Los Devueltos se han enterado. Yo no he sido.`,
      outro: '¡Reloj entregado! La señora Puri dice que es el repartidor más guapo que ha visto. Y eso que ve fatal. Toma tu parte.',
      failText: 'El reloj ha acabado en manos (moradas) equivocadas.',
      steps: [
        {
          objective: (c) => `Recoge el reloj en ${withArticle(c.data.shop.name)} (E en la puerta)`,
          target: (c) => c.data.shop.door,
          enter: (c) => {
            const shops = c.g.world.pois.filter((p) => p.kind === 'shop');
            c.data.shop = shops.find((p) => p.id === 'shop-super') ?? shops.find((p) => p.district === 'centro') ?? shops[0] ?? poi(c.g, 'clothes');
            c.data.dest = vanSpotIn(c.g, 'colina');
          },
          update: (c) => {
            if (onFootNear(c.g, c.data.shop.door, 3)) {
              hint(c.g, 'E — Recoger el reloj de oro');
              if (pressedE(c.g)) {
                hint(c.g, null);
                c.g.mod.audio?.play('pickup');
                return 'next';
              }
            } else hint(c.g, null);
          },
        },
        {
          objective: (c) => `Lleva el reloj a ${c.data.dest.label} (Colina) sin romperlo`,
          target: (c) => c.data.dest.door,
          timer: (c) => 240 - c.t,
          enter: (c) => {
            c.data.integrity = 100;
            c.data.off = c.g.events.on('vehicle:impact' as any, (e: any) => {
              if (e.vehicle === c.g.mod.vehicles?.current) c.data.integrity -= Math.max(0, e.dv - 5) * 4;
            });
            c.g.mod.gang?.startChase();
            setTimeout(() => c.story.running && c.g.mod.gang?.startChase(), 12000);
            msg(c.g, { id: 'devueltos', name: 'Los Devueltos', avatar: '↩️' }, 'Bonito reloj, repartidor. ¿Nos dices la hora? 😈');
          },
          update: (c) => {
            if (c.t > 240) return 'fail';
            if (c.data.integrity <= 0) {
              c.data.failText = 'El reloj ha quedado hecho un cuadro. Ya no da ni la hora.';
              return 'fail';
            }
            if (!c.data.ambush && near(c.g, c.data.dest.door, 90)) {
              c.data.ambush = true;
              c.g.mod.gang?.ambush(c.data.dest.door, 3, 'pistol');
            }
            if (onFootNear(c.g, c.data.dest.door, 3.2)) {
              hint(c.g, 'E — Entregar el reloj');
              if (pressedE(c.g)) {
                hint(c.g, null);
                c.g.mod.bubbles?.say(c.data.dest.door, '¡Ay, qué reloj más precioso! ¿Y esto qué hora dice? Da igual, ¡es de oro!', 4);
                return 'done';
              }
            } else hint(c.g, null);
          },
        },
      ],
      cleanup: (c) => c.data.off?.(),
    },
    {
      id: 'mudanza', num: 2, title: 'Mudanza exprés', icon: '🛋️', fame: 3, reward: 1800, fameReward: 150,
      pitch: 'Kevin se muda. Otra vez. Tres minutos para llevarle los muebles sin romper nada. Necesitas la furgoneta.',
      intro: 'Kevin se muda y quiere que se lo hagas tú, con la furgoneta. Tiene un sofá, una lámpara de lava, un espejo y una estatua de un flamenco. Tres minutos, sin romper NADA. Él ya está en la casa nueva. De momento.',
      outro: 'Mudanza hecha. Kevin dice que ya se está pensando la siguiente. Cóbrale el doble.',
      failText: 'La mudanza ha salido regular. Tirando a mal.',
      steps: [
        {
          objective: (c) => `Ve con la furgoneta a casa de Kevin (${c.data.from.label}, Barrio Viejo) y pulsa E en su puerta`,
          target: (c) => c.data.from.door,
          enter: (c) => {
            c.data.from = vanSpotIn(c.g, 'viejo');
            c.data.to = vanSpotIn(c.g, 'puerto', c.data.from.door, 150, 380);
          },
          update: (c) => {
            const pl = c.g.mod.player;
            if (pl.position.distanceTo(c.data.from.door) < 4 && pl.state === 'foot') {
              const vm = c.g.mod.vehicles;
              const van = (vm.list as Vehicle[]).find((v) => (v.spec.kind === 'van' || v.spec.kind === 'truck') && v.getPosition(tmpV).distanceTo(c.data.from.door) < 18);
              hint(c.g, van ? 'E — Cargar los muebles en la furgoneta' : 'Trae la furgoneta (o un furgón) más cerca');
              if (van && pressedE(c.g)) {
                hint(c.g, null);
                c.data.van = van;
                c.g.mod.audio?.play('wood');
                return 'next';
              }
            } else hint(c.g, null);
          },
        },
        {
          objective: (c) => `Lleva la mudanza a ${c.data.to.label} (Puerto) · muebles al ${Math.max(0, Math.round(c.data.integrity))} %`,
          target: (c) => c.data.to.door,
          timer: (c) => 180 - c.t,
          enter: (c) => {
            c.data.integrity = 100;
            c.data.van.packages = 5;
            c.data.off = c.g.events.on('vehicle:impact' as any, (e: any) => {
              if (e.vehicle === c.data.van) {
                c.data.integrity -= Math.max(0, e.dv - 3.5) * 6;
                if (e.dv > 7) c.g.mod.bubbles?.say(c.g.mod.player, ['¡El flamenco!', '¡Crac! Eso era el espejo…', 'La lámpara de lava ya no es de lava'][Math.floor(rnd.next() * 3)], 1.8);
              }
            });
            c.data.off2 = c.g.events.on('vehicle:landed' as any, (e: any) => {
              if (e.vehicle === c.data.van) c.data.integrity -= e.air * 25;
            });
          },
          update: (c) => {
            if (c.t > 180) {
              c.data.failText = 'Se acabó el tiempo. Kevin ha dormido en el suelo.';
              return 'fail';
            }
            if (c.data.van.disposed || c.data.van.destroyed) {
              c.data.failText = 'La furgoneta con la mudanza ha quedado para chatarra.';
              return 'fail';
            }
            if (c.data.integrity <= 20) {
              c.data.failText = 'Los muebles han llegado en formato «hágalo usted mismo».';
              return 'fail';
            }
            if (c.data.van.getPosition(tmpV).distanceTo(c.data.to.door) < 20 && c.g.mod.player.state === 'foot' && c.g.mod.player.position.distanceTo(c.data.to.door) < 4) {
              hint(c.g, 'E — Descargar la mudanza');
              if (pressedE(c.g)) {
                hint(c.g, null);
                c.data.bonus = Math.round(c.data.integrity * 5);
                return 'done';
              }
            } else hint(c.g, null);
          },
        },
      ],
      cleanup: (c) => {
        c.data.off?.();
        c.data.off2?.();
        if (c.data.van) c.data.van.packages = 0;
      },
    },
    {
      id: 'tictac', num: 3, title: 'El paquete que hace tic-tac', icon: '⏰', fame: 4, reward: 2500, fameReward: 200,
      pitch: 'Un cliente anónimo quiere que lleves «un despertador» al casino. Paga muy bien. Demasiado bien.',
      intro: 'Me ha llamado un número oculto: quiere que lleves un despertador al casino. Paga el triple. Yo no haría preguntas. Bueno, yo sí haría preguntas, pero tú no.',
      outro: 'El Ayuntamiento te da una medalla y un cheque por salvar el casino. El concejal Pérez dice que va a inaugurar una rotonda con tu nombre. Algún día.',
      failText: 'BUM. El despertador ha despertado a toda la isla.',
      steps: [
        {
          objective: 'Recoge el «despertador» en la oficina (E en la puerta)',
          target: (c) => poi(c.g, 'office').door,
          update: (c) => {
            if (onFootNear(c.g, poi(c.g, 'office').door, 3.2)) {
              hint(c.g, 'E — Recoger el despertador');
              if (pressedE(c.g)) {
                hint(c.g, null);
                return 'next';
              }
            } else hint(c.g, null);
          },
        },
        {
          objective: 'Lleva el despertador al casino del Centro',
          target: (c) => poi(c.g, 'casino').door,
          timer: (c) => c.data.bomb,
          enter: (c) => {
            c.data.bomb = 170;
            c.data.off = c.g.events.on('vehicle:impact' as any, (e: any) => {
              if (e.vehicle === c.g.mod.vehicles?.current && e.dv > 9) {
                c.data.bomb -= 8;
                c.g.events.emit('toast', { text: '¡Cuidado! El tic-tac va más rápido', color: '#ff4f81', time: 1.4 });
              }
            });
          },
          update: (c, dt) => {
            c.data.bomb -= dt;
            if (Math.floor(c.data.bomb) !== Math.floor(c.data.bomb + dt)) c.g.mod.audio?.play('click', { volume: 0.5, pitch: c.data.bomb < 30 ? 1.6 : 1 });
            if (c.data.bomb <= 0) return 'fail';
            // a medio camino se descubre el pastel
            if (c.t > 25 || near(c.g, poi(c.g, 'casino').door, 120)) return 'next';
          },
        },
        {
          objective: '¡ES UNA BOMBA! Llévala al final del muelle de pescadores y tírala al mar (E)',
          target: (c) => c.data.pier,
          timer: (c) => c.data.bomb,
          enter: (c) => {
            msg(c.g, { id: 'oculto', name: 'Número oculto', avatar: '🕶️' }, 'Jejeje. El casino me debe dinero. Disfruta del despertador. 💣');
            msg(c.g, BOSS, '¡CHAVAL, QUE ES UNA BOMBA! ¡Al mar con ella, al final del muelle de pescadores del Puerto! ¡CORRE!');
            c.g.events.emit('toast', { text: '💣 ¡ES UNA BOMBA!', color: '#ff4f81', time: 3 });
            // el final del muelle de pescadores (si no existe, el punto del Puerto más metido en el mar)
            const w = c.g.world;
            const pescadores = w.deliverySpots.find((d) => d.id === 'muelle-pescadores');
            let best = poi(c.g, 'office').door.clone();
            if (pescadores) best = pescadores.door.clone();
            else {
              let bestZ = -Infinity;
              for (const d of w.deliverySpots) {
                if (d.district === 'puerto' && d.door.z > bestZ) {
                  bestZ = d.door.z;
                  best = d.door.clone();
                }
              }
            }
            c.data.pier = best;
            c.data.splash = seaPointNear(c.g, best, 8);
          },
          update: (c, dt) => {
            c.data.bomb -= dt;
            if (Math.floor(c.data.bomb) !== Math.floor(c.data.bomb + dt)) c.g.mod.audio?.play('click', { volume: 0.6, pitch: c.data.bomb < 20 ? 1.8 : 1.2 });
            if (c.data.bomb <= 0) return 'fail';
            if (onFootNear(c.g, c.data.pier, 5)) {
              hint(c.g, 'E — ¡Tirar la bomba al mar!');
              if (pressedE(c.g)) {
                hint(c.g, null);
                const p = c.data.splash.clone();
                setTimeout(() => {
                  c.g.mod.particles?.emit('splash', p, { count: 40, scale: 3, speed: 2 });
                  c.g.mod.particles?.explosion(p, true);
                  c.g.events.emit('explosion', { pos: p, radius: 3, big: true });
                  c.g.slowMo(1.2, 0.3);
                }, 900);
                c.g.mod.audio?.play('whoosh');
                return 'done';
              }
            } else hint(c.g, null);
          },
        },
      ],
      cleanup: (c) => {
        c.data.off?.();
        if (c.data.bomb !== undefined && c.data.bomb <= 0) {
          const p = playerPos(c.g);
          c.g.mod.combat?.explode(p, 9, 150, null, true);
        }
      },
    },
    {
      id: 'guarida', num: 4, title: 'Asalto a la guarida', icon: '💀', fame: 5, reward: 3500, fameReward: 250,
      pitch: 'Los Devueltos han robado los paquetes de TODA la isla. Hay que entrar en su guarida y recuperarlos.',
      intro: 'Esto ya es personal: Los Devueltos han robado los paquetes de toda la isla y los tienen en su guarida del Polígono. Entra, abre su almacén y tráete los paquetes a la oficina. Lleva algo más que buenas intenciones.',
      outro: '¡Los paquetes de toda la isla, de vuelta! Media isla te quiere. La otra media está cabreada, pero es la que viste de morado.',
      failText: 'Los paquetes siguen en manos moradas.',
      steps: [
        {
          objective: (c) =>
            c.data.spawned ? `Derriba a los guardias de la guarida · quedan ${c.data.left ?? '?'}` : 'Ve a la guarida de Los Devueltos (Polígono) y derriba a los guardias',
          target: (c) => c.data.h.door,
          enter: (c) => {
            c.data.h = poi(c.g, 'hideout');
            c.data.spawned = false;
          },
          update: (c) => {
            const h = c.data.h as Poi;
            // los guardias salen cuando llegas (si salieran desde la oficina, la banda los borraría por estar lejos)
            if (!c.data.spawned && near(c.g, h.door, 150)) {
              c.data.spawned = true;
              c.data.guards = c.g.mod.gang?.ambush(h.door, 2) ?? [];
              const extra = c.g.mod.gang?.spawnMember(h.door.clone().add(new THREE.Vector3(3, 0, 3)), 'launcher', true);
              if (extra) c.data.guards.push(extra);
            }
            if (!c.data.spawned) return;
            // si te alejas mucho, desaparecen: vuelven a salir cuando vuelvas
            const guards = c.data.guards as Npc[];
            if (guards.length && guards.every((n) => n.removed) && guards.some((n) => n.health > 0) && !near(c.g, h.door, 150)) {
              c.data.spawned = false;
              return;
            }
            // cuentan todos los de la banda que queden alrededor (los suyos y los guardias de siempre)
            c.data.left = gangNear(c.g, h.door, 45);
            if (c.data.left === 0 && near(c.g, h.door, 60)) return 'next';
          },
        },
        {
          objective: 'Abre el almacén (E en la puerta de la guarida)',
          target: (c) => c.data.h.door,
          update: (c) => {
            if (onFootNear(c.g, c.data.h.door, 4)) {
              hint(c.g, 'E — Abrir el almacén de Los Devueltos');
              if (pressedE(c.g)) {
                hint(c.g, null);
                c.g.mod.particles?.emit('cardboard', c.data.h.door, { count: 40, speed: 1.5 });
                c.g.mod.audio?.play('success');
                return 'next';
              }
            } else hint(c.g, null);
          },
        },
        {
          objective: 'Vuelve a la oficina con los paquetes. ¡Te persiguen!',
          target: (c) => poi(c.g, 'office').door,
          enter: (c) => {
            c.g.mod.police?.setWanted(2);
            c.g.mod.gang?.startChase();
            setTimeout(() => c.story.running && c.g.mod.gang?.startChase(), 15000);
            msg(c.g, { id: 'devueltos', name: 'Los Devueltos', avatar: '↩️' }, '¡¡¡NUESTROS PAQUETES!!! ¡A por él! ¡Y alguien que llame a El Devolución!');
          },
          update: (c) => {
            if (near(c.g, poi(c.g, 'office').door, 12)) return 'done';
          },
        },
      ],
    },
    {
      id: 'jefe', num: 5, title: 'El Devolución', icon: '👑', fame: 6, reward: 10000, fameReward: 400,
      pitch: 'El jefe de Los Devueltos en persona, con su camión blindado. Última entrega: la suya. Lleva munición de sobra.',
      intro: 'Ha llegado el día, chaval. El Devolución, el jefe de Los Devueltos, anda por la isla en su camión blindado. Dale caña al camión (tiros, embestidas o paquetes FRÁGIL) hasta que se pare, y luego… lo que tenga que ser. Lleva munición de sobra.',
      outro: '¡LO HAS CONSEGUIDO! El Devolución ha sido devuelto al remitente. Puerto Paquete es libre. Bueno, libre y con muchos paquetes por repartir. ¡A trabajar, campeón!',
      failText: 'El Devolución sigue devolviendo cosas por ahí.',
      steps: [
        {
          objective: (c) => `Para el camión blindado de El Devolución · blindaje ${armorPct(c.data.truck)} %`,
          target: (c) => (c.data.truck && !c.data.truck.destroyed ? c.data.tp : null),
          enter: (c) => {
            const h = poi(c.g, 'hideout');
            const roads = c.g.mod.traffic?.roads;
            let pos = h.parking?.clone() ?? h.door.clone().add(new THREE.Vector3(8, 0, 8));
            if (roads) {
              const ne = roads.nearestEdge(h.door, true);
              if (ne) pos = roads.lanePoint(ne.edge, 1, ne.t, 0, new THREE.Vector3());
            }
            const truck: Vehicle = c.g.mod.vehicles.spawn('armored', pos, 0);
            truck.transient = false;
            truck.sirenOn = false;
            const driver = spawnBoss(c.g, pos.clone());
            driver.enterVehicle(truck);
            c.data.truck = truck;
            c.data.tp = pos.clone();
            c.data.boss = driver;
            (truck as any).brain = { edge: 0, dir: 1, t: 0, next: null, cruise: 18, blocked: 0, stuck: 0, reverse: 0, honked: 0, mode: 'chase', chaseTarget: new THREE.Vector3() } as CarBrain;
            c.data.route = [];
            c.data.phase = 1;
            c.data.dropTimer = 6;
            c.g.mod.cameraRig?.playCinematic(pos.clone().add(new THREE.Vector3(14, 6, 14)), pos.clone().add(new THREE.Vector3(8, 3, 8)), pos, 3);
            setTimeout(() => c.g.mod.cameraRig?.stopCinematic(), 3000);
            c.g.mod.bubbles?.say(driver, '¡NADA LLEGA! ¡TODO VUELVE! ¡JAJAJA!', 3);
            msg(c.g, { id: 'devueltos', name: 'El Devolución', avatar: '👑' }, 'Así que tú eres el repartidor que me devuelve las cosas. Qué ironía. Te voy a DEVOLVER a tu casa. En cajas.');
            c.g.mod.gang && (c.g.mod.gang.calm = true);
          },
          update: (c, dt) => {
            const truck: Vehicle = c.data.truck;
            const armor = armorPct(truck);
            // conduce por la isla de punta a punta
            const roads = c.g.mod.traffic?.roads;
            const tp = truck.getPosition(c.data.tp);
            if (roads && (!c.data.route.length || c.data.route[0].distanceTo(tp) < 12)) {
              if (c.data.route.length) c.data.route.shift();
              if (!c.data.route.length) {
                const nodes = roads.g.nodes;
                const far = nodes[Math.floor(rnd.next() * nodes.length)].pos;
                c.data.route = roads.route(tp, far);
              }
            }
            const brain = (truck as any).brain as CarBrain;
            if (c.data.route[0]) brain.chaseTarget!.copy(c.data.route[0]);
            brain.cruise = c.data.phase >= 2 ? 22 : 17;
            if (!truck.destroyed && truck.driver) c.g.mod.traffic?.drive(truck, dt);
            // fase 2: llama a sus furgonetas y suelta paquetes FRÁGIL
            if (c.data.phase === 1 && armor < 50) {
              c.data.phase = 2;
              c.g.mod.gang && (c.g.mod.gang.calm = false);
              c.g.mod.gang?.startChase();
              c.g.mod.gang?.startChase();
              c.g.mod.bubbles?.say(c.data.boss, '¡Furgonetas! ¡A por él!', 2.5);
              c.g.events.emit('toast', { text: '¡El Devolución llama a sus furgonetas!', color: '#6c3bd1' });
            }
            if (c.data.phase >= 2) {
              c.data.dropTimer -= dt;
              if (c.data.dropTimer <= 0) {
                c.data.dropTimer = 4;
                const back = truck.localToWorld(new THREE.Vector3(0, 0.5, -truck.spec.half.z - 1.2), new THREE.Vector3());
                const combat = c.g.mod.combat;
                if (combat) {
                  const def = { ...require_fragile() };
                  combat.fire({ kind: 'npc', npc: c.data.boss, exclude: truck.body }, def, back, back.clone().add(new THREE.Vector3(0, -1, 0)), 0);
                }
              }
            }
            if (armor <= 0 || truck.destroyed) return 'next';
          },
        },
        {
          objective: (c) => `¡Derriba a El Devolución! · ${Math.max(0, Math.round(c.data.boss?.health ?? 0))} de vida`,
          target: (c) => (c.data.boss && !c.data.boss.removed ? c.data.boss.position : c.data.tp),
          enter: (c) => {
            const truck: Vehicle = c.data.truck;
            (truck as any).brain = undefined;
            truck.controls.throttle = 0;
            truck.controls.handbrake = true;
            const boss: Npc = c.data.boss;
            if (boss.vehicle) boss.leaveVehicle();
            (boss.brain as CombatBrain).aggro = true;
            c.g.mod.bubbles?.say(boss, '¿Así me tratas el camión? ¡Ahora verás lo que es un paquete FRÁGIL!', 3.5);
            c.g.slowMo(1.2, 0.35);
            c.data.minions = c.g.mod.gang?.ambush(boss.position, 4) ?? [];
          },
          update: (c) => {
            const boss: Npc = c.data.boss;
            if (boss.health <= 0) return 'done';
            if (boss.removed) {
              // se ha borrado por estar lejos (no ha caído): vuelve a salir junto al camión cuando te acerques
              if (near(c.g, c.data.tp, 120)) {
                const nb = spawnBoss(c.g, c.data.tp.clone().add(new THREE.Vector3(3, 0, 3)));
                nb.health = Math.max(80, boss.health);
                c.data.boss = nb;
                c.g.mod.bubbles?.say(nb, '¿Creías que me había ido? ¡Las devoluciones no caducan!', 3);
              }
            } else if (!boss.vehicle) c.data.tp.copy(boss.position);
          },
        },
      ],
      cleanup: (c) => {
        if (c.g.mod.gang) c.g.mod.gang.calm = false;
        const boss = c.data.boss; const truck = c.data.truck;
        if (boss && boss.alive) { c.g.mod.npcs?.remove(boss); if (truck && !truck.disposed && truck !== c.g.mod.vehicles?.current) c.g.mod.vehicles.remove(truck); }
      },
    },
  ];
}

import { WEAPONS } from '../combat/weapons';

/** El camión se para al bajar al 45 % de su vida: el «blindaje» que se ve va de 100 a 0 hasta ahí. */
const TRUCK_STOP = 0.45;
function armorPct(truck: Vehicle | undefined): number {
  if (!truck) return 100;
  const hp = truck.health / truck.spec.health;
  return Math.max(0, Math.min(100, Math.round(((hp - TRUCK_STOP) / (1 - TRUCK_STOP)) * 100)));
}

function require_fragile() {
  return { ...WEAPONS.fragile, damage: 70 };
}

// ─────────── el sistema ───────────

/** Repetir una misión ya hecha paga el 40 % del dinero y el 25 % de la fama. */
const REPEAT_MONEY = 0.4;
const REPEAT_FAME = 0.25;

/** Quita del minimapa los marcadores de la historia (sin crear una lista nueva cada frame). */
function removeStoryMarkers(list: { story?: boolean }[] | any[]) {
  let w = 0;
  for (let i = 0; i < list.length; i++) if (!(list[i] as any).story) list[w++] = list[i];
  list.length = w;
}

export class Story implements System {
  name = 'story';
  readonly missions = missions();
  readonly completed = new Set<string>();
  private active: { m: Mission; step: number; ctx: Ctx } | null = null;
  private credits: HTMLDivElement | null = null;

  constructor(private game: Game) {
    game.mod.story = this;
    game.events.on('player:died', () => this.active && this.fail('Te han devuelto a ti.'));
    game.events.on('player:busted' as any, () => this.active && this.fail('Te ha pillado la policía.'));
    // al subir de fama, si se abre una misión nueva, el jefe avisa
    game.events.on('fame:level' as any, (e: any) => {
      const m = this.nextMission();
      if (!m || this.active || m.fame !== e.level) return;
      this.announced = m.id;
      msg(game, BOSS, `¡Ya tienes fama ${e.level}, chaval! Tengo un encargo gordo para ti: «${m.title}». Está en el tablón de la oficina (E en la puerta).`);
      game.events.emit('toast', { text: `${m.icon} Nueva misión en el tablón de la oficina`, color: '#d4af37', time: 3 });
    });
  }

  get running() {
    return !!this.active;
  }

  /** Misión de la historia contra Los Devueltos en marcha (la policía no viene por los tiros). */
  get gangMission(): boolean {
    const id = this.active?.m.id;
    return id === 'reloj' || id === 'guarida' || id === 'jefe';
  }

  /** Premio de una misión (repetirla paga menos: si no, el jefe final sería un cajero automático). */
  reward(m: Mission): { money: number; fame: number } {
    const again = this.completed.has(m.id);
    return { money: again ? Math.round((m.reward * REPEAT_MONEY) / 50) * 50 : m.reward, fame: again ? Math.round(m.fameReward * REPEAT_FAME) : m.fameReward };
  }

  /** La siguiente misión por hacer (o null si ya están todas). */
  private nextMission(): Mission | null {
    return this.missions.find((m) => !this.completed.has(m.id)) ?? null;
  }

  /** Tarjetas del tablón (las pinta la tienda de la oficina). */
  boardItems(): ShopItem[] {
    const lvl = this.game.mod.economy?.fameLevel ?? 1;
    return this.missions.map((m, i) => {
      const done = this.completed.has(m.id);
      const prevDone = i === 0 || this.completed.has(this.missions[i - 1].id);
      const lockedFame = lvl < m.fame;
      const r = this.reward(m);
      return {
        id: m.id, icon: m.icon, name: `${m.num}. ${m.title}`, desc: `${m.pitch} Premio: ${fmt(r.money)} y ⭐ +${r.fame}${done ? ' (repetida)' : ''}.`, price: 0,
        owned: done, label: done ? 'Repetir' : 'Aceptar', disabled: !!this.active,
        locked: !prevDone ? 'Termina la anterior' : lockedFame ? `Fama ${m.fame}` : undefined,
        buy: () => {
          this.game.mod.shopUI?.close();
          this.start(m.id);
          return true;
        },
      } as ShopItem;
    });
  }

  start(id: string) {
    const m = this.missions.find((x) => x.id === id);
    if (!m || this.active) return;
    const ctx: Ctx = { g: this.game, t: 0, total: 0, data: {}, story: this };
    this.active = { m, step: 0, ctx };
    m.steps[0].enter?.(ctx);
    msg(this.game, BOSS, typeof m.intro === 'function' ? m.intro(ctx) : m.intro);
    this.game.events.emit('toast', { text: `${m.icon} ${m.title}`, color: '#d4af37', time: 3.2 });
    this.game.mod.audio?.play('bell');
  }

  private fail(reason?: string) {
    const a = this.active;
    if (!a) return;
    const text = reason ?? a.ctx.data.failText ?? a.m.failText ?? 'Misión fallida.';
    this.finishCleanup();
    this.game.events.emit('toast', { text: `MISIÓN FALLIDA · ${text}`, color: '#ff4f81', time: 3.5 });
    msg(this.game, BOSS, `Bueno, chaval… ${text} Puedes volver a intentarlo desde el tablón de la oficina.`);
    this.game.mod.audio?.play('fail');
  }

  private finishCleanup() {
    const a = this.active;
    if (!a) return;
    try {
      a.m.cleanup?.(a.ctx);
    } catch (e) {
      console.warn(e);
    }
    hint(this.game, null);
    this.active = null;
    const hud = this.game.hud;
    removeStoryMarkers(hud.markers);
    if (hud.waypoint && (hud.waypoint as any).story) hud.waypoint = null;
  }

  private complete() {
    const a = this.active!;
    const g = this.game;
    const bonus = a.ctx.data.bonus ?? 0;
    const r = this.reward(a.m);
    const first = !this.completed.has(a.m.id);
    this.completed.add(a.m.id);
    this.finishCleanup();
    msg(g, BOSS, a.m.outro);
    this.announced = '';
    g.mod.economy?.addCash(r.money + bonus, 'misión');
    g.mod.economy?.addFame(r.fame, 'misión');
    g.mod.audio?.play('success');
    g.mod.particles?.emit('confetti', g.mod.player.position.clone().setY(g.mod.player.position.y + 2), { count: 60, speed: 1.3 });
    g.events.emit('toast', { text: `¡MISIÓN CUMPLIDA! +${fmt(r.money + bonus)}  ·  ⭐ +${r.fame}`, color: '#d4af37', time: 3.5 });
    // qué viene ahora (si subir de fama no lo ha anunciado ya)
    const next = this.nextMission();
    if (first && next && a.m.id !== 'jefe' && this.announced !== next.id) {
      const lvl = g.mod.economy?.fameLevel ?? 1;
      setTimeout(() => {
        if (lvl >= next.fame) msg(g, BOSS, `Y ya tengo el siguiente: «${next.title}». Cuando quieras, en el tablón de la oficina.`);
        else msg(g, BOSS, `El siguiente encargo gordo («${next.title}») es para gente con fama ${next.fame}. Tú vas por la ${lvl}: haz entregas, mejor si son perfectas, y date algún lujo.`);
      }, 4000);
    }
    g.events.emit('story:done' as any, { id: a.m.id } as any);
    g.mod.save?.save();
    if (a.m.id === 'jefe') setTimeout(() => this.rollCredits(), 2500);
  }

  private readonly hudJob = { id: 'story', title: '', timeLeft: null as number | null, integrity: null as number | null, color: '#d4af37' };
  private readonly marker = { x: 0, z: 0, icon: '', color: '#d4af37', label: '', story: true };
  private readonly wp = { x: 0, z: 0, label: '', color: '#d4af37', auto: true, story: true };
  /** Última misión anunciada al subir de fama (para no repetir el aviso). */
  private announced = '';

  update(dt: number) {
    const a = this.active;
    const hud = this.game.hud;
    removeStoryMarkers(hud.markers);
    if (!a) return;
    const c = a.ctx;
    c.t += dt;
    c.total += dt;
    const step = a.m.steps[a.step];
    let r: StepResult;
    try {
      r = step.update(c, dt);
    } catch (e) {
      console.error('Error en la misión', e);
      r = 'fail';
    }
    if (r === 'fail') return this.fail();
    if (r === 'done') return this.complete();
    if (r === 'next') {
      a.step++;
      c.t = 0;
      if (a.step >= a.m.steps.length) return this.complete();
      a.m.steps[a.step].enter?.(c);
      this.game.mod.audio?.play('pop');
      return;
    }
    // interfaz: objetivo en la lista de encargos y GPS
    const obj = typeof step.objective === 'function' ? step.objective(c) : step.objective;
    const timer = step.timer ? step.timer(c) : null;
    const hj = this.hudJob;
    hj.title = `${a.m.icon} ${obj}`;
    hj.timeLeft = timer;
    hj.integrity = c.data.integrity !== undefined && a.m.id !== 'tictac' ? Math.max(0, c.data.integrity) : null;
    const k = hud.jobs.indexOf(hj);
    if (k > 0) hud.jobs.splice(k, 1);
    if (k !== 0) hud.jobs.unshift(hj);
    const tgt = step.target ? step.target(c) : null;
    if (tgt) {
      // la misión manda sobre el GPS de los encargos normales (salvo que el jugador haya puesto uno a mano)
      const cur = hud.waypoint as any;
      if (!cur || cur.auto) {
        const wp = this.wp;
        wp.x = tgt.x;
        wp.z = tgt.z;
        wp.label = a.m.title;
        hud.waypoint = wp;
      }
      const mk = this.marker;
      mk.x = tgt.x;
      mk.z = tgt.z;
      mk.icon = a.m.icon;
      mk.label = a.m.title;
      hud.markers.push(mk);
    }
  }

  // ─────────── créditos ───────────

  rollCredits() {
    const g = this.game;
    if (this.credits) return;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(27,16,48,.92);overflow:hidden;pointer-events:auto;font-family:system-ui,-apple-system,sans-serif;color:#fff;text-align:center';
    const lines = [
      ['CONTRA REEMBOLSO', 'h'],
      ['Una historia de cartón, cinta y efectivo', 's'],
      ['', ''],
      ['Repartidor principal', 't'], [g.mod.menus?.profileName ?? 'Tú, campeón', 'n'],
      ['Jefe gruñón', 't'], ['Don Remigio', 'n'],
      ['Villano con camión', 't'], ['El Devolución', 'n'],
      ['Villanos de relleno', 't'], ['Los Devueltos (todos, pero todos)', 'n'],
      ['Abuela que cuenta céntimos', 't'], ['Doña Puri', 'n'],
      ['Perro sin permiso', 't'], ['Pancho', 'n'],
      ['Influencer', 't'], ['Yenni ✨ (3 millones de seguidores, 2 reales)', 'n'],
      ['Cliente que no pidió nada', 't'], ['Anselmo', 'n'],
      ['Departamento de física', 't'], ['Una furgoneta que no debería volar', 'n'],
      ['Ningún paquete FRÁGIL fue tratado con cuidado durante el rodaje', 's'],
      ['Ningún repartidor real fue devuelto', 's'],
      ['', ''],
      ['Gracias por jugar', 'h'],
      ['El mundo sigue abierto: quedan paquetes por repartir.', 's'],
    ];
    const inner = document.createElement('div');
    inner.style.cssText = 'position:absolute;left:0;right:0;top:100%;padding:0 16px';
    inner.innerHTML = lines
      .map(([t, k]) =>
        k === 'h' ? `<div style="font:900 clamp(40px,7vw,80px) system-ui;color:#ffd23f;text-shadow:5px 5px 0 #c2185b;margin:40px 0">${t}</div>`
        : k === 't' ? `<div style="font:700 16px system-ui;opacity:.6;margin-top:26px;text-transform:uppercase;letter-spacing:2px">${t}</div>`
        : k === 'n' ? `<div style="font:900 28px system-ui">${t}</div>`
        : k === 's' ? `<div style="font:700 20px system-ui;margin:18px 0;color:#2ec4b6">${t}</div>` : '<div style="height:60px"></div>',
      )
      .join('');
    el.appendChild(inner);
    const skip = document.createElement('button');
    skip.textContent = 'Seguir jugando →';
    skip.style.cssText = 'position:absolute;right:20px;bottom:20px;font:900 18px system-ui;border:3px solid #1b1030;border-radius:14px;background:#ffd23f;padding:10px 18px;cursor:pointer';
    el.appendChild(skip);
    g.ui.appendChild(el);
    this.credits = el;
    g.paused = true;
    g.input.enabled = false;
    g.input.exitPointerLock();
    let y = 0;
    const start = performance.now();
    const close = () => {
      el.remove();
      this.credits = null;
      g.paused = false;
      g.input.enabled = true;
    };
    skip.onclick = close;
    const tick = () => {
      if (!this.credits) return;
      y = ((performance.now() - start) / 1000) * 60;
      inner.style.transform = `translateY(${-y}px)`;
      if (y > inner.offsetHeight + window.innerHeight) return close();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    g.mod.audio?.play('cheer');
  }
}
