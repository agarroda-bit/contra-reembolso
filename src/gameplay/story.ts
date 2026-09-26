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
  intro: string;
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
function pressedE(g: Game) {
  return g.input.enabled && g.input.pressed('interact');
}
function poi(g: Game, kind: Poi['kind']): Poi {
  return g.world.pois.find((p) => p.kind === kind) ?? g.world.pois[0];
}
function spotIn(g: Game, district: DeliverySpot['district'], avoid?: THREE.Vector3, minDist = 0): DeliverySpot {
  const list = g.world.deliverySpots.filter((d) => d.district === district && (!avoid || d.door.distanceTo(avoid) > minDist));
  return (list.length ? list : g.world.deliverySpots)[Math.floor(rng.next() * (list.length || g.world.deliverySpots.length))];
}
function msg(g: Game, from: { id: string; name: string; avatar: string }, text: string) {
  g.mod.messages?.receive(from.id, from.name, from.avatar, text);
}
function hint(g: Game, text: string | null) {
  const it = g.mod.interaction;
  if (it) it.override = text;
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
      id: 'reloj', num: 1, title: 'El reloj de la señora Puri', icon: '⌚', fame: 2, reward: 1500, fameReward: 60,
      pitch: 'Un reloj de oro de 50.000 € para una señora de la Colina. Los Devueltos lo saben. Todo el mundo lo sabe.',
      intro: 'Chaval, esto es serio: la señora Puri de la Colina ha comprado un reloj de oro de 50.000 €. Recógelo en la joyería del Centro y llévaselo sin un rasguño. Y ojo, que Los Devueltos se han enterado. No sé cómo. Yo no he sido.',
      outro: '¡Reloj entregado! La señora Puri dice que es el repartidor más guapo que ha visto. Y eso que ve fatal. Toma tu parte.',
      failText: 'El reloj ha acabado en manos (moradas) equivocadas.',
      steps: [
        {
          objective: 'Recoge el reloj en la joyería del Centro (E en la puerta)',
          target: (c) => c.data.shop.door,
          enter: (c) => {
            const shops = c.g.world.pois.filter((p) => p.kind === 'shop');
            c.data.shop = shops.find((p) => p.district === 'centro') ?? shops[0] ?? poi(c.g, 'clothes');
            c.data.dest = spotIn(c.g, 'colina');
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
            setTimeout(() => c.g.mod.gang?.startChase(), 12000);
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
      id: 'mudanza', num: 2, title: 'Mudanza exprés', icon: '🛋️', fame: 3, reward: 1400, fameReward: 70,
      pitch: 'Kevin se muda. Otra vez. Tres minutos para llevarle los muebles sin romper nada. Necesitas la furgoneta.',
      intro: 'Kevin se muda y quiere que se lo hagas tú, con la furgoneta. Tiene un sofá, una lámpara de lava, un espejo y una estatua de un flamenco. Tres minutos, sin romper NADA. Él ya está en la casa nueva. De momento.',
      outro: 'Mudanza hecha. Kevin dice que ya se está pensando la siguiente. Cóbrale el doble.',
      failText: 'La mudanza ha salido regular. Tirando a mal.',
      steps: [
        {
          objective: 'Ve con la furgoneta a casa de Kevin (Barrio Viejo) a cargar los muebles',
          target: (c) => c.data.from.door,
          enter: (c) => {
            c.data.from = spotIn(c.g, 'viejo');
            c.data.to = spotIn(c.g, 'puerto', c.data.from.door, 150);
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
      id: 'tictac', num: 3, title: 'El paquete que hace tic-tac', icon: '⏰', fame: 4, reward: 2200, fameReward: 90,
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
          objective: '¡ES UNA BOMBA! Llévala al final del muelle y tírala al mar (E)',
          target: (c) => c.data.pier,
          timer: (c) => c.data.bomb,
          enter: (c) => {
            msg(c.g, { id: 'oculto', name: 'Número oculto', avatar: '🕶️' }, 'Jejeje. El casino me debe dinero. Disfruta del despertador. 💣');
            msg(c.g, BOSS, '¡CHAVAL, QUE ES UNA BOMBA! ¡Al mar con ella, al final del muelle del Puerto! ¡CORRE!');
            c.g.events.emit('toast', { text: '💣 ¡ES UNA BOMBA!', color: '#ff4f81', time: 3 });
            // punto del muelle: el sitio de tierra del Puerto más cercano al agua
            const office = poi(c.g, 'office');
            let best = office.door.clone();
            let bestZ = -Infinity;
            for (const s of c.g.world.deliverySpots.concat(c.g.world.collectibles.map((p) => ({ door: p } as any)))) {
              const d = (s as any).door as THREE.Vector3;
              if (c.g.world.districtAt(d.x, d.z) === 'puerto' && d.z > bestZ) {
                bestZ = d.z;
                best = d.clone();
              }
            }
            c.data.pier = best;
          },
          update: (c, dt) => {
            c.data.bomb -= dt;
            if (Math.floor(c.data.bomb) !== Math.floor(c.data.bomb + dt)) c.g.mod.audio?.play('click', { volume: 0.6, pitch: c.data.bomb < 20 ? 1.8 : 1.2 });
            if (c.data.bomb <= 0) return 'fail';
            if (onFootNear(c.g, c.data.pier, 5)) {
              hint(c.g, 'E — ¡Tirar la bomba al mar!');
              if (pressedE(c.g)) {
                hint(c.g, null);
                const p = c.data.pier.clone();
                p.z += 12;
                p.y = 0;
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
      id: 'guarida', num: 4, title: 'Asalto a la guarida', icon: '💀', fame: 5, reward: 3500, fameReward: 120,
      pitch: 'Los Devueltos han robado los paquetes de TODA la isla. Hay que entrar en su guarida y recuperarlos.',
      intro: 'Esto ya es personal: Los Devueltos han robado los paquetes de toda la isla y los tienen en su guarida del Polígono. Entra, abre su almacén y tráete los paquetes a la oficina. Lleva algo más que buenas intenciones.',
      outro: '¡Los paquetes de toda la isla, de vuelta! Media isla te quiere. La otra media está cabreada, pero es la que viste de morado.',
      failText: 'Los paquetes siguen en manos moradas.',
      steps: [
        {
          objective: 'Asalta la guarida de Los Devueltos (Polígono): derriba a los guardias',
          target: () => null,
          enter: (c) => {
            const h = poi(c.g, 'hideout');
            c.data.h = h;
            c.data.guards = c.g.mod.gang?.ambush(h.door, 7) ?? [];
            // uno con lanzapaquetes
            const extra = c.g.mod.gang?.spawnMember(h.door.clone().add(new THREE.Vector3(3, 0, 3)), 'launcher', true);
            if (extra) c.data.guards.push(extra);
          },
          update: (c) => {
            const alive = (c.data.guards as Npc[]).filter((n) => n.alive && !n.removed).length;
            c.data.left = alive;
            if (alive === 0 && near(c.g, c.data.h.door, 60)) return 'next';
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
          target: () => null,
          enter: (c) => {
            c.g.mod.police?.setWanted(2);
            c.g.mod.gang?.startChase();
            setTimeout(() => c.g.mod.gang?.startChase(), 15000);
            msg(c.g, { id: 'devueltos', name: 'Los Devueltos', avatar: '↩️' }, '¡¡¡NUESTROS PAQUETES!!! ¡A por él! ¡Y alguien que llame a El Devolución!');
          },
          update: (c) => {
            const o = poi(c.g, 'office');
            (c as any).tgt = o.door;
            if (near(c.g, o.door, 12)) return 'done';
          },
        },
      ],
    },
    {
      id: 'jefe', num: 5, title: 'El Devolución', icon: '👑', fame: 6, reward: 10000, fameReward: 300,
      pitch: 'El jefe de Los Devueltos en persona, con su camión blindado. Última entrega: la suya.',
      intro: 'Ha llegado el día, chaval. El Devolución, el jefe de Los Devueltos, anda por la isla en su camión blindado devolviendo todo lo que pilla. Hay que pararle. Dale caña al camión hasta que se pare y luego… lo que tenga que ser. Suerte. Te la vas a necesitar.',
      outro: '¡LO HAS CONSEGUIDO! El Devolución ha sido devuelto al remitente. Puerto Paquete es libre. Bueno, libre y con muchos paquetes por repartir. ¡A trabajar, campeón!',
      failText: 'El Devolución sigue devolviendo cosas por ahí.',
      steps: [
        {
          objective: (c) => `Para el camión blindado de El Devolución · blindaje ${Math.round((c.data.truck?.health / c.data.truck?.spec.health) * 100 || 100)} %`,
          target: (c) => (c.data.truck && !c.data.truck.destroyed ? c.data.truck.getPosition(new THREE.Vector3()) : null),
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
            const hp = truck.health / truck.spec.health;
            // conduce por la isla de punta a punta
            const roads = c.g.mod.traffic?.roads;
            const tp = truck.getPosition(new THREE.Vector3());
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
            if (c.data.phase === 1 && hp < 0.6) {
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
            if (hp < 0.25 || truck.destroyed) return 'next';
          },
        },
        {
          objective: (c) => `¡Derriba a El Devolución! · ${Math.max(0, Math.round(c.data.boss?.health ?? 0))} de vida`,
          target: (c) => (c.data.boss ? c.data.boss.position : null),
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
            if (!boss.alive || boss.removed) return 'done';
          },
        },
      ],
      cleanup: (c) => {
        if (c.g.mod.gang) c.g.mod.gang.calm = false;
      },
    },
  ];
}

import { WEAPONS } from '../combat/weapons';
function require_fragile() {
  return { ...WEAPONS.fragile, damage: 70 };
}

// ─────────── el sistema ───────────

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
  }

  get running() {
    return !!this.active;
  }

  /** Tarjetas del tablón (las pinta la tienda de la oficina). */
  boardItems(): ShopItem[] {
    const lvl = this.game.mod.economy?.fameLevel ?? 1;
    return this.missions.map((m, i) => {
      const done = this.completed.has(m.id);
      const prevDone = i === 0 || this.completed.has(this.missions[i - 1].id);
      const lockedFame = lvl < m.fame;
      return {
        id: m.id, icon: m.icon, name: `${m.num}. ${m.title}`, desc: m.pitch, price: 0,
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
    msg(this.game, BOSS, m.intro);
    this.game.events.emit('toast', { text: `${m.icon} ${m.title}`, color: '#d4af37', time: 3.2 });
    this.game.mod.audio?.play('bell');
    m.steps[0].enter?.(ctx);
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
    hud.markers = hud.markers.filter((x) => !(x as any).story);
    if (hud.waypoint && (hud.waypoint as any).story) hud.waypoint = null;
  }

  private complete() {
    const a = this.active!;
    const g = this.game;
    const bonus = a.ctx.data.bonus ?? 0;
    this.completed.add(a.m.id);
    this.finishCleanup();
    g.mod.economy?.addCash(a.m.reward + bonus, 'misión');
    g.mod.economy?.addFame(a.m.fameReward, 'misión');
    g.mod.audio?.play('success');
    g.mod.particles?.emit('confetti', g.mod.player.position.clone().setY(g.mod.player.position.y + 2), { count: 60, speed: 1.3 });
    g.events.emit('toast', { text: `¡MISIÓN CUMPLIDA! +${fmt(a.m.reward + bonus)}`, color: '#d4af37', time: 3.5 });
    msg(g, BOSS, a.m.outro);
    g.events.emit('story:done' as any, { id: a.m.id } as any);
    g.mod.save?.save();
    if (a.m.id === 'jefe') setTimeout(() => this.rollCredits(), 2500);
  }

  update(dt: number) {
    const a = this.active;
    const hud = this.game.hud;
    hud.markers = hud.markers.filter((x) => !(x as any).story);
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
    hud.jobs = [{ id: 'story', title: `${a.m.icon} ${obj}`, timeLeft: timer, integrity: c.data.integrity !== undefined && a.m.id !== 'tictac' ? Math.max(0, c.data.integrity) : null, color: '#d4af37' }, ...hud.jobs.filter((j) => j.id !== 'story')];
    const tgt = step.target ? step.target(c) : (c as any).tgt ?? null;
    if (tgt) {
      hud.waypoint = { x: tgt.x, z: tgt.z, label: a.m.title, color: '#d4af37', auto: true, story: true } as any;
      hud.markers.push({ x: tgt.x, z: tgt.z, icon: a.m.icon, color: '#d4af37', label: a.m.title, story: true } as any);
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
