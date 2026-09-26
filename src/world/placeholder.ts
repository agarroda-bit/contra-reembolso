// Mundo provisional (suelo plano) para probar módulos sueltos antes de tener la isla.
import * as THREE from 'three';
import type { Game } from '../core/game';
import type { WorldData } from '../core/contracts';
import { G } from '../core/physics';

export function buildPlaceholderWorld(game: Game): WorldData {
  const size = 200;
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(size, 1, size),
    new THREE.MeshLambertMaterial({ color: '#7fb069' }),
  );
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  game.scene.add(ground);
  game.physics.addStaticBox(0, -0.5, 0, size / 2, 0.5, size / 2, 0, G.GROUND);
  // unas cajas para probar colisiones y cámara
  const mat = new THREE.MeshLambertMaterial({ color: '#f4a259' });
  for (let i = 0; i < 12; i++) {
    const w = 4 + (i % 3) * 3, h = 3 + (i % 4) * 4, d = 5;
    const x = Math.cos(i) * 30, z = Math.sin(i * 1.7) * 30;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z);
    m.castShadow = m.receiveShadow = true;
    game.scene.add(m);
    game.physics.addStaticBox(x, h / 2, z, w / 2, h / 2, d / 2);
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 200;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#7fb069';
  g.fillRect(0, 0, 200, 200);
  return {
    size,
    seaLevel: -5,
    districts: [{ id: 'puerto', name: 'El Puerto', color: '#2ec4b6', center: { x: 0, z: 0 } }],
    heightAt: () => 0,
    districtAt: () => 'puerto',
    isRoad: () => false,
    isLand: (x, z) => Math.abs(x) < size / 2 && Math.abs(z) < size / 2,
    pois: [],
    roads: { nodes: [], edges: [], adjacency: [] },
    deliverySpots: [],
    parkingSpots: [],
    collectibles: [],
    lampPositions: [],
    playerSpawn: { pos: new THREE.Vector3(0, 1, 10), heading: Math.PI },
    ramps: [],
    breakableSpots: [],
    specialVehicleSpots: [],
    mapCanvas: canvas,
    mapPixelSize: 1,
    setNight: () => {},
    update: () => {},
  };
}
