// Armas, botiquines y chalecos tirados por la isla (estilo videojuego de acción). Reaparecen al rato.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { DistrictId } from '../core/contracts';
import type { WeaponId } from '../combat/weapons';
import { WEAPONS } from '../combat/weapons';
import { makeGunMesh } from '../combat/gunModels';

interface Spot {
  pos: THREE.Vector3;
  weapon?: WeaponId;
  kind: 'weapon' | 'health' | 'armor';
  taken: number; // tiempo en que se cogió (-1 = disponible)
  mesh: THREE.Object3D | null;
}

const BY_DISTRICT: Record<DistrictId, WeaponId> = {
  puerto: 'launcher',
  centro: 'tape',
  viejo: 'smg',
  poligono: 'shotgun',
  colina: 'rifle',
};

const RESPAWN = 180;

export class WeaponSpawns implements System {
  name = 'weaponSpawns';
  private spots: Spot[] = [];
  private ringGeo = new THREE.TorusGeometry(0.55, 0.06, 6, 20).rotateX(Math.PI / 2);

  constructor(private game: Game, fase: number) {
    const w = game.world;
    const crazyLater: WeaponId[] = fase >= 6 ? [] : ['fragile', 'stamp'];
    for (const d of w.districts) {
      const spots = w.deliverySpots.filter((s) => s.district === d.id);
      if (!spots.length) continue;
      // un arma por barrio, en el punto de entrega más cercano al centro del barrio
      spots.sort((a, b) => Math.hypot(a.door.x - d.center.x, a.door.z - d.center.z) - Math.hypot(b.door.x - d.center.x, b.door.z - d.center.z));
      const weapon = BY_DISTRICT[d.id];
      if (!crazyLater.includes(weapon)) this.add({ pos: this.offset(spots[0].door, spots[0].facing), weapon, kind: 'weapon', taken: -1, mesh: null });
      if (spots[3]) this.add({ pos: this.offset(spots[3].door, spots[3].facing), kind: 'health', taken: -1, mesh: null });
    }
    const gun = w.pois.find((p) => p.kind === 'gunshop');
    if (gun) this.add({ pos: this.offset(gun.door, gun.facing, 3), kind: 'armor', taken: -1, mesh: null });
    const health = w.pois.find((p) => p.kind === 'health');
    if (health) this.add({ pos: this.offset(health.door, health.facing, 3), kind: 'health', taken: -1, mesh: null });
    // en la fase 6 aparecen el paquete FRÁGIL y la pistola de sellos
    if (fase >= 6) {
      const club = w.pois.find((p) => p.kind === 'junkyard');
      const bar = w.pois.find((p) => p.kind === 'bar');
      if (club) this.add({ pos: this.offset(club.door, club.facing, 3), weapon: 'fragile', kind: 'weapon', taken: -1, mesh: null });
      if (bar) this.add({ pos: this.offset(bar.door, bar.facing, -3), weapon: 'stamp', kind: 'weapon', taken: -1, mesh: null });
    }
  }

  /** Un poco apartado de la puerta, sobre la acera. */
  private offset(door: THREE.Vector3, facing: number, side = 2.2): THREE.Vector3 {
    const p = door.clone().add(new THREE.Vector3(Math.cos(facing) * side, 0, -Math.sin(facing) * side));
    p.y = this.game.world.heightAt(p.x, p.z);
    return p;
  }

  private add(s: Spot) {
    this.spots.push(s);
    this.show(s);
  }

  private show(s: Spot) {
    const g = new THREE.Group();
    if (s.kind === 'weapon' && s.weapon) {
      const m = makeGunMesh(s.weapon);
      if (m) {
        m.scale.setScalar(1.8);
        m.rotation.y = Math.PI / 2;
        g.add(m);
      }
    } else {
      const c = s.kind === 'health' ? '#ffffff' : '#1d3557';
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.25), new THREE.MeshLambertMaterial({ color: c }));
      g.add(box);
      if (s.kind === 'health') {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.26), new THREE.MeshBasicMaterial({ color: '#e63946' }));
        const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.26), new THREE.MeshBasicMaterial({ color: '#e63946' }));
        g.add(cross, cross2);
      }
    }
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: s.kind === 'weapon' ? '#ffd23f' : s.kind === 'health' ? '#06d6a0' : '#2ec4ff', toneMapped: false }));
    ring.position.y = -0.55;
    g.add(ring);
    g.position.copy(s.pos).setY(s.pos.y + 0.8);
    this.game.scene.add(g);
    s.mesh = g;
  }

  update(dt: number) {
    const g = this.game;
    const p = g.mod.player;
    if (!p) return;
    const t = g.time.elapsed;
    for (const s of this.spots) {
      if (s.taken >= 0) {
        if (t - s.taken > RESPAWN && p.position.distanceTo(s.pos) > 40) {
          s.taken = -1;
          this.show(s);
        }
        continue;
      }
      if (s.mesh) {
        s.mesh.rotation.y += dt * 1.5;
        s.mesh.position.y = s.pos.y + 0.8 + Math.sin(t * 2.5) * 0.12;
      }
      if (p.state !== 'foot' || p.position.distanceTo(s.pos) > 1.4) continue;
      // recoger
      const combat = g.mod.combat;
      if (s.kind === 'weapon' && s.weapon && combat) {
        const had = combat.owned.has(s.weapon);
        combat.give(s.weapon);
        g.events.emit('toast', { text: had ? `+ munición de ${WEAPONS[s.weapon].name}` : `¡${WEAPONS[s.weapon].icon} ${WEAPONS[s.weapon].name}! (tecla ${WEAPONS[s.weapon].slot})`, color: '#ffd23f', time: 2.2 });
        g.mod.audio?.play('reload');
      } else if (s.kind === 'health') {
        if (p.health >= p.maxHealth) continue;
        p.heal(50);
        g.events.emit('toast', { text: '+50 de vida', color: '#06d6a0', time: 1.3 });
        g.mod.audio?.play('pickup');
      } else if (s.kind === 'armor') {
        if (p.armor >= 100) continue;
        p.armor = 100;
        g.events.emit('toast', { text: 'Chaleco al 100 %', color: '#2ec4ff', time: 1.3 });
        g.mod.audio?.play('pickup');
      }
      s.taken = t;
      if (s.mesh) g.scene.remove(s.mesh);
      s.mesh = null;
    }
  }

  /** Marcadores para el mapa grande (armas disponibles). */
  markers() {
    return this.spots.filter((s) => s.taken < 0 && s.kind === 'weapon').map((s) => ({ x: s.pos.x, z: s.pos.z, icon: WEAPONS[s.weapon!].icon }));
  }
}
