import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

async function start() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.1, 10));
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 4, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), body);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('app')!.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ff9e6d');
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(3, 3, 5);
  camera.lookAt(0, 1, 0);
  scene.add(new THREE.HemisphereLight('#fff2d0', '#5a3a7a', 1.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.5);
  sun.position.set(5, 8, 3);
  scene.add(sun);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#ffd23f', flatShading: true }),
  );
  scene.add(cube);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20), new THREE.MeshStandardMaterial({ color: '#2ec4b6' }));
  floor.position.y = -0.1;
  scene.add(floor);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let frames = 0;
  renderer.setAnimationLoop(() => {
    world.step();
    const p = body.translation();
    cube.position.set(p.x, p.y, p.z);
    cube.rotation.y += 0.02;
    renderer.render(scene, camera);
    frames++;
    (window as any).__game = { ready: true, frames, cubeY: p.y };
  });
}

start().catch((e) => {
  console.error(e);
  document.getElementById('info')!.textContent = 'Error: ' + e;
});
