// Los lujos del ático: cada uno es un grupo que aparece (con rebote) al comprarlo.
import * as THREE from 'three';
import type { CharacterLook } from '../../../core/contracts';
import { GeoBuilder, vertexColorMaterial } from '../../../core/geo';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fx as rnd } from '../../../core/rng';
import { makeCharacter } from '../../../actors/character';
import { makeVehicleMesh } from '../../../vehicles/meshes';
import { VEHICLES, type VehicleKind } from '../../../vehicles/types';
import {
  canvasTexture, texPlane, neonTexture, glowMaterial, haloTexture, beamMaterial, bakeObject, meshOf, FishTank,
  paintPortrait, addGoldFrame, outlinedText,
} from './kit';

export interface AtticItemDef {
  id: string;
  icon: string;
  name: string;
  price: number;
  desc: string;
  art?: boolean;
}

export const ATTIC_ITEMS: AtticItemDef[] = [
  { id: 'sofa', icon: '🛋️', name: 'Sofá gigante', price: 2000, desc: 'Terciopelo rosa, forma de U y sitio para toda tu banda (que no tienes).' },
  { id: 'tele', icon: '📺', name: 'Tele enorme', price: 3000, desc: 'Tres metros y medio de tele. Se ve desde el faro.' },
  { id: 'jacuzzi', icon: '🛁', name: 'Jacuzzi', price: 6000, desc: 'Burbujas, lucecitas y vistas al mar. Cura el dolor de furgoneta.' },
  { id: 'acuario', icon: '🐠', name: 'Acuario', price: 4000, desc: 'Peces tropicales y un pez paquete. Nadie sabe de dónde salió.' },
  { id: 'estatua', icon: '🏆', name: 'Estatua dorada tuya', price: 8000, desc: 'Tú, en oro macizo (de chapa). Gira sola, como tu cabeza.' },
  { id: 'neon', icon: '💡', name: 'Luces de neón', price: 2500, desc: 'Rosa y turquesa. Incluye modo fiesta. Los vecinos, encantados.' },
  { id: 'garaje', icon: '🏎️', name: 'Colección de coches', price: 5000, desc: 'Maquetas de todos tus vehículos en el garaje, con focos de museo.' },
  { id: 'cuadro1', icon: '😱', name: '«El grito del cliente»', price: 1500, desc: 'Expresionismo puro: un cliente que abre un paquete FRÁGIL.', art: true },
  { id: 'cuadro2', icon: '📦', name: '«Bodegón con cajas»', price: 1500, desc: 'Tres cajas, una manzana y muchísima profundidad artística.', art: true },
  { id: 'cuadro3', icon: '🙂', name: '«La Paquetonda»', price: 1500, desc: 'Sonríe como si supiera dónde está tu paquete.', art: true },
];

const lambert = vertexColorMaterial;
const shiny = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 70, specular: '#6b5a3a' });
const basicVC = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

// ─────────────────────────────── sofá ───────────────────────────────

/** Sofá en U de terciopelo rosa. Centro del respaldo en (0, 0, 0); mira hacia -Z. */
export function buildSofa(): THREE.Group {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  const vel = '#e0457b', velD = '#b8325f', gold = '#d4af37';
  // respaldo largo
  b.box(6.2, 1.15, 0.55, velD, 0, 0.58, 0.28);
  b.box(6.0, 0.45, 1.15, vel, 0, 0.225, -0.55);
  // cojines del asiento
  for (let i = 0; i < 4; i++) b.box(1.34, 0.18, 1.0, '#f06292', -2.1 + i * 1.4, 0.54, -0.6);
  // brazos de la U (laterales con asiento)
  for (const s of [-1, 1]) {
    b.box(1.15, 0.45, 2.6, vel, s * 2.55, 0.225, -2.4);
    b.box(0.5, 1.0, 3.8, velD, s * 3.35, 0.5, -1.6);
    b.box(1.0, 0.18, 2.4, '#f06292', s * 2.55, 0.54, -2.45);
    b.box(0.56, 0.16, 3.86, gold, s * 3.35, 1.02, -1.6);
  }
  b.box(6.26, 0.14, 0.6, gold, 0, 1.17, 0.28);
  // patas doradas
  for (const x of [-3.3, 3.3]) for (const z of [0.45, -3.4]) b.cyl(0.07, 0.05, 0.12, 6, gold, x, 0.06, z);
  // cojines de adorno: leopardo, oro y corazones
  const pil = (x: number, z: number, c: string, ry: number) => b.box(0.7, 0.62, 0.2, c, x, 0.88, z, -0.25, ry, 0);
  pil(-2.3, -0.05, '#d9a441', 0.15);
  pil(-0.7, -0.05, '#1b1030', -0.1);
  pil(0.8, -0.05, '#ffd23f', 0.12);
  pil(2.3, -0.05, '#d9a441', -0.15);
  b.sphere(0.34, '#ff1744', -1.5, 0.9, -0.1, 1, 1, 0.9, 0.45);
  b.sphere(0.34, '#ff1744', 1.6, 0.9, -0.1, 1, 1, 0.9, 0.45);
  g.add(meshOf(b, lambert));
  return g;
}

// ─────────────────────────────── tele ───────────────────────────────

const CHANNELS = ['TELEPAQUETE 24H', 'TELETIENDA', 'FÚTBOL', 'DOCUMENTAL', 'EL TIEMPO'];
const HEADLINES = [
  'LOS DEVUELTOS DEVUELVEN ALGO POR PRIMERA VEZ',
  'EL PRECIO DEL CARTÓN, POR LAS NUBES',
  'UNA ABUELA PAGA 40 € EN CÉNTIMOS: TRES HORAS',
  'SE BUSCA AL DUEÑO DE UNA FURGONETA CON MUCHAS MULTAS',
  'EL ALCALDE PIDE UN PAQUETE Y SE LO DEJAN AL VECINO',
  'RÉCORD: UN REPARTIDOR LLEGA A LA HORA',
];

export interface TvCtl {
  group: THREE.Group;
  update(dt: number): void;
  next(): string;
}

/** Tele enorme de 3,6 m con canales que se mueven (canvas que se repinta a 10 fps). Mira hacia +Z. */
export function buildTV(): TvCtl {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  b.box(3.9, 2.25, 0.14, '#111118', 0, 0, 0);
  b.box(3.95, 0.05, 0.16, '#d4af37', 0, -1.13, 0.01);
  // barra de sonido y mueble bajo
  b.box(2.4, 0.16, 0.22, '#1b1030', 0, -1.35, 0.12);
  b.box(4.4, 0.5, 0.55, '#ffffff', 0, -1.65 - 0.02, 0.2);
  b.box(4.46, 0.06, 0.6, '#d4af37', 0, -1.38, 0.2);
  g.add(meshOf(b, lambert));
  const W = 512, H = 288;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.08), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.z = 0.075;
  g.add(screen);
  // resplandor de la pantalla en la pared
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.6), glowMaterial(haloTexture(), '#5aa9ff', 0.22));
  glow.position.z = 0.02;
  g.add(glow);

  let ch = 0, t = 0, acc = 1, noise = 0;
  const draw = () => {
    const x = ctx;
    x.save();
    if (noise > 0) {
      const img = x.createImageData(W / 4, H / 4);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      x.imageSmoothingEnabled = false;
      x.drawImage(c, 0, 0, W / 4, H / 4, 0, 0, W, H);
      x.restore();
      tex.needsUpdate = true;
      return;
    }
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    if (ch === 0) {
      // noticias
      const gr = x.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#12307a');
      gr.addColorStop(1, '#3a86ff');
      x.fillStyle = gr;
      x.fillRect(0, 0, W, H);
      x.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 6; i++) x.fillRect(((i * 97 + t * 20) % (W + 60)) - 60, 30 + i * 22, 50, 8);
      // presentadora
      x.fillStyle = '#6c3bd1';
      x.fillRect(300, 150, 150, 140);
      x.fillStyle = '#f4cfb6';
      x.beginPath();
      x.arc(375, 118, 38, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#2e1f16';
      x.beginPath();
      x.arc(375, 104, 40, Math.PI, 0);
      x.fill();
      x.fillRect(335, 100, 16, 70);
      x.fillRect(399, 100, 16, 70);
      x.fillStyle = '#1b1030';
      x.fillRect(360, 112, 7, 7);
      x.fillRect(384, 112, 7, 7);
      const talk = Math.abs(Math.sin(t * 11)) * 7;
      x.fillRect(366, 134, 18, 3 + talk);
      // mesa
      x.fillStyle = '#ffd23f';
      x.fillRect(260, 196, 240, 58);
      x.fillStyle = '#1b1030';
      x.font = '900 28px system-ui';
      x.fillText('TP24', 380, 226);
      // titular
      x.fillStyle = '#e63946';
      x.fillRect(0, 22, 250, 40);
      x.fillStyle = '#fff';
      x.font = '900 24px system-ui';
      x.fillText('ÚLTIMA HORA', 125, 43);
      x.fillStyle = '#ffffff';
      x.font = '900 17px system-ui';
      const hl = HEADLINES[Math.floor(t / 6) % HEADLINES.length];
      wrap(x, hl, 125, 100, 230, 22);
      // rótulo que pasa
      x.fillStyle = '#ffd23f';
      x.fillRect(0, H - 34, W, 34);
      x.fillStyle = '#1b1030';
      x.font = '800 18px system-ui';
      x.textAlign = 'left';
      const ticker = HEADLINES.join('   •   ') + '   •   ';
      const tw = x.measureText(ticker).width;
      const off = (t * 70) % tw;
      x.fillText(ticker, -off, H - 16);
      x.fillText(ticker, tw - off, H - 16);
    } else if (ch === 1) {
      // teletienda
      x.fillStyle = Math.floor(t * 2) % 2 ? '#ff4f81' : '#ffd23f';
      x.fillRect(0, 0, W, H);
      x.save();
      x.translate(150, 150);
      x.rotate(Math.sin(t * 2) * 0.3);
      x.fillStyle = '#c8915a';
      x.fillRect(-70, -60, 140, 120);
      x.fillStyle = '#e3d3a8';
      x.fillRect(-70, -10, 140, 20);
      x.fillStyle = '#1b1030';
      x.font = '900 18px system-ui';
      x.fillText('PAQUETÓMETRO', 0, -35);
      x.fillText('3000', 0, 40);
      x.restore();
      x.font = '900 40px system-ui';
      outlinedText(x, '¡LLAME YA!', 370, 70, '#ffffff', '#1b1030', 8);
      const pulse = 1 + Math.sin(t * 8) * 0.08;
      x.save();
      x.translate(370, 160);
      x.scale(pulse, pulse);
      x.font = '900 64px system-ui';
      outlinedText(x, '19,99 €', 0, 0, '#e63946', '#ffffff', 10);
      x.restore();
      x.font = '800 18px system-ui';
      x.fillStyle = '#1b1030';
      x.fillText('Mide si un paquete está entero.', 370, 225);
      x.fillText('(No lo está.)', 370, 250);
    } else if (ch === 2) {
      // fútbol
      x.fillStyle = '#2e9e4f';
      x.fillRect(0, 0, W, H);
      x.fillStyle = '#34ad57';
      for (let i = 0; i < 8; i += 2) x.fillRect(i * 64, 0, 64, H);
      x.strokeStyle = '#ffffff';
      x.lineWidth = 4;
      x.strokeRect(20, 40, W - 40, H - 60);
      x.beginPath();
      x.moveTo(W / 2, 40);
      x.lineTo(W / 2, H - 20);
      x.stroke();
      x.beginPath();
      x.arc(W / 2, (H + 20) / 2, 40, 0, Math.PI * 2);
      x.stroke();
      const bx = W / 2 + Math.sin(t * 0.9) * 180, by = 150 + Math.sin(t * 1.7) * 70;
      for (let i = 0; i < 10; i++) {
        const px = bx + Math.sin(t * (0.7 + i * 0.13) + i) * (60 + i * 8);
        const py = by + Math.cos(t * (0.8 + i * 0.11) + i * 2) * (40 + i * 4);
        x.fillStyle = i < 5 ? '#ffd23f' : '#6c3bd1';
        x.beginPath();
        x.arc(px, py, 9, 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(bx, by, 6, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#1b1030';
      x.fillRect(0, 0, W, 34);
      x.fillStyle = '#fff';
      x.font = '900 20px system-ui';
      x.fillText('PUERTO PAQUETE 2 - 1 POLÍGONO F.C.   ' + String(Math.floor(60 + t / 2) % 90).padStart(2, '0') + "'", W / 2, 18);
    } else if (ch === 3) {
      // documental
      const gr = x.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#ff9c58');
      gr.addColorStop(0.6, '#ffd8a0');
      gr.addColorStop(0.61, '#7fb069');
      gr.addColorStop(1, '#4f8a3c');
      x.fillStyle = gr;
      x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff3b0';
      x.beginPath();
      x.arc(400, 120, 36, 0, Math.PI * 2);
      x.fill();
      const px = ((t * 60) % (W + 160)) - 80;
      const hop = Math.abs(Math.sin(t * 5)) * 40;
      x.fillStyle = '#c8915a';
      x.fillRect(px - 40, 200 - hop - 60, 80, 60);
      x.fillStyle = '#e3d3a8';
      x.fillRect(px - 40, 200 - hop - 36, 80, 12);
      x.fillStyle = '#fff';
      x.fillRect(px + 8, 200 - hop - 52, 14, 14);
      x.fillStyle = '#111';
      x.fillRect(px + 14, 200 - hop - 48, 6, 6);
      x.fillStyle = 'rgba(0,0,0,0.55)';
      x.fillRect(40, H - 48, W - 80, 36);
      x.fillStyle = '#fff';
      x.font = 'italic 700 17px system-ui';
      x.fillText('«La caja de cartón, en libertad, salta para impresionar a la hembra.»', W / 2, H - 30);
      x.font = '900 22px system-ui';
      outlinedText(x, 'LA VIDA SECRETA DEL CARTÓN', W / 2, 26, '#ffffff', '#1b1030', 6);
    } else {
      // el tiempo
      x.fillStyle = '#5ad0ff';
      x.fillRect(0, 0, W, H);
      x.fillStyle = '#2f8fd0';
      x.fillRect(0, 170, W, H);
      x.fillStyle = '#f6de96';
      x.beginPath();
      x.ellipse(W / 2, 170, 180, 70, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#9cc46a';
      x.beginPath();
      x.ellipse(W / 2, 168, 160, 58, 0, 0, Math.PI * 2);
      x.fill();
      const icon = (ix: number, iy: number, sun: boolean) => {
        if (sun) {
          x.fillStyle = '#ffd23f';
          x.beginPath();
          x.arc(ix, iy, 20 + Math.sin(t * 3) * 2, 0, Math.PI * 2);
          x.fill();
        } else {
          x.fillStyle = '#c8915a';
          x.fillRect(ix - 18, iy - 14, 36, 28);
        }
      };
      icon(180, 150, true);
      icon(300, 175, false);
      icon(350, 140, true);
      x.font = '900 26px system-ui';
      outlinedText(x, 'MAÑANA: 34º Y CHUBASCOS DE PAQUETES', W / 2, 40, '#ffffff', '#1b1030', 7);
      x.font = '800 18px system-ui';
      x.fillStyle = '#1b1030';
      x.fillText('Probabilidad de que llegue tu pedido: 12 %', W / 2, H - 22);
    }
    // logo del canal
    x.textAlign = 'right';
    x.font = '900 14px system-ui';
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.fillText(CHANNELS[ch], W - 10, 12);
    x.restore();
    tex.needsUpdate = true;
  };
  draw();
  return {
    group: g,
    update(dt: number) {
      t += dt;
      noise = Math.max(0, noise - dt);
      acc += dt;
      if (acc >= 0.1) {
        acc = 0;
        draw();
      }
    },
    next() {
      ch = (ch + 1) % CHANNELS.length;
      noise = 0.35;
      acc = 1;
      return CHANNELS[ch];
    },
  };
}

function wrap(x: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (x.measureText(test).width > maxW && line) {
      x.fillText(line, cx, yy);
      line = w;
      yy += lh;
    } else line = test;
  }
  if (line) x.fillText(line, cx, yy);
}

// ─────────────────────────────── jacuzzi ───────────────────────────────

const jacuzziVS = /* glsl */ `
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const jacuzziFS = /* glsl */ `
uniform float uTime;
varying vec2 vP;
void main(){
  vec2 p = vP;
  float r = length(p);
  float t = uTime;
  float n = sin(p.x*5.0 + t*2.6 + sin(p.y*4.0 - t))*0.5 + sin(p.y*6.0 - t*2.2 + sin(p.x*3.0 + t))*0.5;
  n += sin(r*16.0 - t*6.0) * 0.35 * (1.0 - r / 1.5);
  vec3 deep = vec3(0.0, 0.33, 0.52);
  vec3 lite = vec3(0.30, 0.85, 0.95);
  vec3 col = mix(deep, lite, 0.5 + 0.5 * n);
  // espuma de las burbujas
  float f = sin(p.x*13.0 + t*5.0) * sin(p.y*12.0 - t*4.3) + sin((p.x+p.y)*17.0 + t*7.0) * 0.6;
  col = mix(col, vec3(0.95), smoothstep(0.95, 1.5, f) * 0.7);
  col += vec3(0.1, 0.5, 0.6) * smoothstep(1.1, 1.5, r);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface JacuzziCtl {
  group: THREE.Group;
  update(dt: number): void;
}

/** Jacuzzi redondo de mosaico dorado con agua animada y burbujas. Centro del suelo en (0, 0, 0). */
export function buildJacuzzi(): JacuzziCtl {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  const prof = [
    new THREE.Vector2(1.5, 0.02), new THREE.Vector2(1.96, 0.0), new THREE.Vector2(1.96, 0.42), new THREE.Vector2(1.9, 0.47),
    new THREE.Vector2(1.52, 0.47), new THREE.Vector2(1.47, 0.42), new THREE.Vector2(1.47, 0.05),
  ];
  b.add(new THREE.LatheGeometry(prof, 28), '#d4af37');
  // mosaico turquesa por dentro (fondo)
  b.cyl(1.47, 1.47, 0.04, 28, '#27c1d9', 0, 0.02, 0);
  // escalón y luces
  b.box(0.9, 0.2, 0.5, '#f1ece6', 0, 0.1, 2.2);
  g.add(meshOf(b, shiny));
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1.48, 40),
    new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: jacuzziVS, fragmentShader: jacuzziFS }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.37;
  g.add(water);
  // halo de las luces del agua
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), glowMaterial(haloTexture(), '#35d0ff', 0.25));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.012;
  g.add(halo);
  // burbujas
  const N = 36;
  const bub = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#f2fdff', transparent: true, opacity: 0.8 }), N);
  bub.frustumCulled = false;
  const st: { x: number; z: number; age: number; life: number; s: number }[] = [];
  const reset = (o: { x: number; z: number; age: number; life: number; s: number }) => {
    const a = rnd.next() * Math.PI * 2, r = Math.sqrt(rnd.next()) * 1.3;
    o.x = Math.cos(a) * r;
    o.z = Math.sin(a) * r;
    o.age = 0;
    o.life = 0.6 + rnd.next() * 1.2;
    o.s = 0.03 + rnd.next() * 0.05;
  };
  for (let i = 0; i < N; i++) {
    const o = { x: 0, z: 0, age: 0, life: 1, s: 0.05 };
    reset(o);
    o.age = rnd.next() * o.life;
    st.push(o);
  }
  g.add(bub);
  const dm = new THREE.Object3D();
  let t = 0;
  return {
    group: g,
    update(dt: number) {
      t += dt;
      (water.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      for (let i = 0; i < N; i++) {
        const o = st[i];
        o.age += dt;
        if (o.age > o.life) reset(o);
        const k = o.age / o.life;
        dm.position.set(o.x + Math.sin(t * 5 + i) * 0.03, 0.37 + Math.sin(k * Math.PI) * 0.05, o.z);
        dm.scale.setScalar(o.s * (k < 0.8 ? 1 : 1 + (k - 0.8) * 5));
        dm.updateMatrix();
        bub.setMatrixAt(i, dm.matrix);
      }
      bub.instanceMatrix.needsUpdate = true;
      halo.material.opacity = 0.2 + Math.sin(t * 2) * 0.05;
    },
  };
}

// ─────────────────────────────── acuario (separador) ───────────────────────────────

/** Acuario-separador: 4,6 m de largo sobre un mueble dorado. Largo en X local. */
export function buildAquarium(): { group: THREE.Group; tank: FishTank } {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  b.box(4.8, 0.6, 0.95, '#1b1030', 0, 0.3, 0);
  b.box(4.86, 0.06, 1.0, '#d4af37', 0, 0.62, 0);
  b.box(4.86, 0.12, 1.0, '#d4af37', 0, 2.5, 0);
  for (const x of [-2.41, 2.41]) b.box(0.06, 1.9, 1.0, '#d4af37', x, 1.56, 0);
  g.add(meshOf(b, shiny));
  const tank = new FishTank({ w: 4.7, h: 1.85, d: 0.88, fish: 16, boxFish: true, ornament: 'van' });
  tank.group.position.y = 0.63;
  g.add(tank.group);
  return { group: g, tank };
}

// ─────────────────────────────── estatua dorada ───────────────────────────────

let goldMat: THREE.MeshPhongMaterial | null = null;

/** Tú, en oro, con la pose de «fiebre del sábado» sobre la peana. Origen = suelo de la peana. */
export function buildStatue(look: CharacterLook): { group: THREE.Group; dispose(): void } {
  const g = new THREE.Group();
  const gold: CharacterLook & { seed: number } = {
    skin: '#e8b83a', hair: look.hair, hairColor: '#c9962a', shirt: '#f2c94c', pants: '#d4a52c', shoes: '#b8860b',
    cap: look.cap, capColor: '#e0ae2e', glasses: look.glasses, chain: look.chain, jacket: look.jacket ? '#e3b53d' : null,
    build: look.build, height: 1.35, emblem: null, seed: 3,
  };
  const ch = makeCharacter(gold);
  if (!goldMat) goldMat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 90, specular: '#fff0b8', emissive: '#2a1a00' });
  ch.mesh.material = goldMat;
  // posar: la animación de baile nº 3 en el momento del dedo arriba
  for (let i = 0; i < 14; i++) ch.update(0.08, { speed: 0, grounded: true, pose: 'dance' });
  ch.root.position.y = 1.05;
  g.add(ch.root);
  return { group: g, dispose: () => ch.dispose() };
}

// ─────────────────────────────── cuadros ───────────────────────────────

function paintScream(g: CanvasRenderingContext2D, w: number, h: number) {
  // cielo en remolinos
  for (let i = 0; i < 18; i++) {
    g.strokeStyle = ['#ff7b1a', '#ffb347', '#e63946', '#ffd23f'][i % 4];
    g.lineWidth = 10;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = 12 + i * 7 + Math.sin(x * 0.04 + i) * 10;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.fillStyle = '#1d3557';
  g.fillRect(0, h * 0.55, w, h * 0.45);
  for (let i = 0; i < 10; i++) {
    g.strokeStyle = ['#457b9d', '#2a4a8a', '#6a8fd0'][i % 3];
    g.lineWidth = 7;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = h * 0.58 + i * 8 + Math.sin(x * 0.05 + i * 2) * 5;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // puente
  g.strokeStyle = '#8a5a33';
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(w * 0.95, h * 0.45);
  g.stroke();
  // el cliente gritando
  const cx = w * 0.42, cy = h * 0.62;
  g.fillStyle = '#1b1030';
  g.beginPath();
  g.moveTo(cx - 26, h);
  g.quadraticCurveTo(cx - 30, cy + 40, cx - 14, cy + 20);
  g.lineTo(cx + 14, cy + 20);
  g.quadraticCurveTo(cx + 30, cy + 40, cx + 26, h);
  g.fill();
  g.fillStyle = '#e8e0b0';
  g.beginPath();
  g.ellipse(cx, cy - 6, 20, 30, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1b1030';
  g.beginPath();
  g.ellipse(cx - 7, cy - 12, 4, 7, 0, 0, Math.PI * 2);
  g.ellipse(cx + 7, cy - 12, 4, 7, 0, 0, Math.PI * 2);
  g.ellipse(cx, cy + 10, 5, 10, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e8e0b0';
  g.fillRect(cx - 30, cy - 20, 10, 30);
  g.fillRect(cx + 20, cy - 20, 10, 30);
  // el paquete roto
  g.fillStyle = '#c8915a';
  g.save();
  g.translate(cx + 60, h - 30);
  g.rotate(0.3);
  g.fillRect(-22, -16, 44, 32);
  g.fillStyle = '#e63946';
  g.font = '900 11px system-ui';
  g.textAlign = 'center';
  g.fillText('FRÁGIL', 0, 4);
  g.restore();
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) g.fillRect(cx + 80 + i * 9, h - 16 - (i % 2) * 6, 7, 5);
}

function paintStillLife(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = '#5b3a29';
  g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(w * 0.45, h * 0.4, 10, w * 0.45, h * 0.4, w * 0.7);
  gr.addColorStop(0, 'rgba(255,220,160,0.55)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  // mesa con mantel
  g.fillStyle = '#f1faee';
  g.fillRect(0, h * 0.68, w, h * 0.32);
  g.fillStyle = '#d8e2dc';
  for (let i = 0; i < 8; i++) g.fillRect(i * 34, h * 0.68, 12, h * 0.32);
  // cajas
  const box = (x: number, y: number, bw: number, bh: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, bw, bh);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x + bw * 0.7, y, bw * 0.3, bh);
    g.fillStyle = '#e3d3a8';
    g.fillRect(x, y + bh * 0.4, bw, bh * 0.14);
  };
  box(w * 0.1, h * 0.38, 90, 72, '#c8915a');
  box(w * 0.18, h * 0.16, 64, 56, '#b07b48');
  box(w * 0.55, h * 0.46, 70, 60, '#d9a870');
  // frutero con manzana y plátano
  g.fillStyle = '#e63946';
  g.beginPath();
  g.arc(w * 0.84, h * 0.62, 18, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.ellipse(w * 0.72, h * 0.66, 28, 9, -0.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a9d8f';
  g.fillRect(w * 0.84 - 2, h * 0.62 - 26, 4, 10);
  // botella
  g.fillStyle = '#1f6b3a';
  g.fillRect(w * 0.43, h * 0.3, 22, 70);
  g.fillRect(w * 0.43 + 7, h * 0.2, 8, 26);
}

function paintMona(g: CanvasRenderingContext2D, w: number, h: number) {
  // paisaje brumoso de fondo
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#8fb3a0');
  gr.addColorStop(0.5, '#c9b27a');
  gr.addColorStop(1, '#6b5a3a');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(80,110,90,0.5)';
  g.beginPath();
  g.moveTo(0, h * 0.5);
  g.quadraticCurveTo(w * 0.25, h * 0.3, w * 0.5, h * 0.48);
  g.quadraticCurveTo(w * 0.8, h * 0.62, w, h * 0.42);
  g.lineTo(w, h);
  g.lineTo(0, h);
  g.fill();
  const cx = w * 0.5;
  // cuerpo (vestido oscuro)
  g.fillStyle = '#3a2a1a';
  g.beginPath();
  g.ellipse(cx, h * 0.98, w * 0.34, h * 0.42, 0, Math.PI, 0);
  g.fill();
  // pelo
  g.fillStyle = '#2b1b0f';
  g.beginPath();
  g.ellipse(cx, h * 0.4, w * 0.19, h * 0.28, 0, 0, Math.PI * 2);
  g.fill();
  // cara
  g.fillStyle = '#e8c79a';
  g.beginPath();
  g.ellipse(cx, h * 0.38, w * 0.12, h * 0.17, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2b1b0f';
  g.fillRect(cx - w * 0.06, h * 0.34, w * 0.035, h * 0.018);
  g.fillRect(cx + w * 0.025, h * 0.34, w * 0.035, h * 0.018);
  // la sonrisa misteriosa
  g.strokeStyle = '#7a3a2a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - w * 0.04, h * 0.45);
  g.quadraticCurveTo(cx, h * 0.47, cx + w * 0.045, h * 0.44);
  g.stroke();
  // manos sobre... un paquete
  g.fillStyle = '#c8915a';
  g.fillRect(cx - w * 0.14, h * 0.7, w * 0.28, h * 0.16);
  g.fillStyle = '#e3d3a8';
  g.fillRect(cx - w * 0.14, h * 0.76, w * 0.28, h * 0.03);
  g.fillStyle = '#e8c79a';
  g.beginPath();
  g.ellipse(cx - w * 0.08, h * 0.72, w * 0.06, h * 0.03, 0.2, 0, Math.PI * 2);
  g.ellipse(cx + w * 0.08, h * 0.73, w * 0.06, h * 0.03, -0.2, 0, Math.PI * 2);
  g.fill();
}

/** Cuadro enmarcado (mira hacia +Z). */
export function buildPainting(id: string): THREE.Group {
  const g = new THREE.Group();
  const w = 2.1, h = id === 'cuadro3' ? 2.4 : 1.6;
  const tex = canvasTexture(id === 'cuadro3' ? 256 : 320, id === 'cuadro3' ? 292 : 244, (c, cw, ch) => {
    if (id === 'cuadro1') paintScream(c, cw, ch);
    else if (id === 'cuadro2') paintStillLife(c, cw, ch);
    else paintMona(c, cw, ch);
  });
  const pic = texPlane(id === 'cuadro3' ? 1.7 : w, h, tex);
  pic.position.z = 0.03;
  g.add(pic);
  const b = new GeoBuilder();
  addGoldFrame(b, id === 'cuadro3' ? 1.7 : w, h, 0, 0, 0, 0, 0.14);
  // focos de galería encima
  b.box(0.3, 0.08, 0.35, '#1b1030', 0, h / 2 + 0.45, 0.2);
  b.box(0.08, 0.08, 0.3, '#1b1030', 0, h / 2 + 0.38, 0.35);
  g.add(meshOf(b, shiny, false, true));
  // luz de galería (halo aditivo)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.7, h * 1.5), glowMaterial(haloTexture(), '#ffe6b0', 0.28));
  glow.position.set(0, 0.2, 0.05);
  g.add(glow);
  return g;
}

/** Retrato tuyo (lo usa también la oficina). */
export function portraitTexture(look: CharacterLook, title = 'EL JEFE'): THREE.CanvasTexture {
  return canvasTexture(256, 320, (g, w, h) => paintPortrait(g, w, h, look, title));
}

// ─────────────────────────────── neones ───────────────────────────────

export interface NeonCtl {
  group: THREE.Group;
  strips: THREE.MeshBasicMaterial[];
  signs: THREE.MeshBasicMaterial[];
  update(dt: number, party: boolean): void;
}

/**
 * Tiras de neón por el techo (rosa y turquesa) y dos letreros. W×D = tamaño de la sala, H = techo.
 */
export function buildNeon(W: number, D: number, H: number): NeonCtl {
  const g = new THREE.Group();
  const pink = new THREE.MeshBasicMaterial({ color: '#ff2e88', toneMapped: false });
  const cyan = new THREE.MeshBasicMaterial({ color: '#00e5ff', toneMapped: false });
  const y = H - 0.18;
  const pinkG: THREE.BufferGeometry[] = [];
  const cyanG: THREE.BufferGeometry[] = [];
  const strip = (arr: THREE.BufferGeometry[], w: number, d: number, x: number, z: number) =>
    arr.push(new THREE.BoxGeometry(w, 0.06, d).translate(x, y, z));
  strip(pinkG, W - 0.6, 0.06, W / 2, 0.3);
  strip(pinkG, W - 0.6, 0.06, W / 2, D - 0.3);
  strip(cyanG, 0.06, D - 0.6, 0.3, D / 2);
  strip(cyanG, 0.06, D - 0.6, W - 0.3, D / 2);
  // segunda línea más baja
  strip(cyanG, W - 0.8, 0.05, W / 2, 0.42);
  strip(pinkG, 0.05, D - 0.8, 0.42, D / 2);
  const mk = (arr: THREE.BufferGeometry[], m: THREE.Material) => {
    const merged = new THREE.Mesh(mergeBoxes(arr), m);
    g.add(merged);
  };
  mk(pinkG, pink);
  mk(cyanG, cyan);
  // letreros
  const s1Mat = glowMaterial(neonTexture(['DULCES SUEÑOS,', 'JEFE'], '#ff2e88'), '#ffffff', 1);
  const s1 = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), s1Mat);
  s1.name = 'neon-dormir';
  g.add(s1);
  const s2Mat = glowMaterial(neonTexture(['EL REY DEL', 'REEMBOLSO'], '#00e5ff'), '#ffffff', 1);
  const s2 = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), s2Mat);
  s2.name = 'neon-rey';
  g.add(s2);
  let t = 0;
  const pinkBase = new THREE.Color('#ff2e88'), cyanBase = new THREE.Color('#00e5ff');
  return {
    group: g,
    strips: [pink, cyan],
    signs: [s1Mat, s2Mat],
    update(dt: number, party: boolean) {
      t += dt;
      if (party) {
        pink.color.setHSL((t * 0.35) % 1, 1, 0.55);
        cyan.color.setHSL((t * 0.35 + 0.5) % 1, 1, 0.55);
        const blink = Math.sin(t * 16) > -0.3 ? 1 : 0.2;
        s1Mat.opacity = blink;
        s2Mat.opacity = Math.sin(t * 16 + 1.5) > -0.3 ? 1 : 0.2;
      } else {
        pink.color.copy(pinkBase);
        cyan.color.copy(cyanBase);
        // parpadeo de neón viejo de vez en cuando
        const flick = Math.sin(t * 37) > 0.97 ? 0.35 : 1;
        s1Mat.opacity = 0.95 + Math.sin(t * 3) * 0.05;
        s2Mat.opacity = flick;
      }
    },
  };
}

function mergeBoxes(arr: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = arr.map((g) => {
    const n = g.toNonIndexed();
    n.deleteAttribute('uv');
    g.dispose();
    return n;
  });
  const b = new GeoBuilder();
  for (const p of parts) b.add(p, '#ffffff');
  return b.build();
}

// ─────────────────────────────── colección de coches ───────────────────────────────

export interface OwnedLike {
  kind: string;
  color: string;
}

const SAMPLE_CARS: OwnedLike[] = [
  { kind: 'van', color: '#ffd23f' },
  { kind: 'scooter', color: '#ff4f81' },
  { kind: 'sports', color: '#e63946' },
  { kind: 'taxi', color: '#ffd23f' },
  { kind: 'suv', color: '#2a9d8f' },
  { kind: 'golf', color: '#f1faee' },
];

const modelCache = new Map<string, THREE.BufferGeometry>();

/** Maqueta de un vehículo del juego fusionada en una sola geometría (cacheada). */
export function modelGeometry(kind: string, color: string): THREE.BufferGeometry | null {
  const key = kind + color;
  let g = modelCache.get(key);
  if (g) return g;
  const spec = (VEHICLES as Record<string, (typeof VEHICLES)[VehicleKind]>)[kind];
  if (!spec) return null;
  let vm: ReturnType<typeof makeVehicleMesh>;
  try {
    vm = makeVehicleMesh(spec, color);
  } catch {
    return null;
  }
  const baked = bakeObject(vm.group);
  // la maqueta ya está fusionada: fuera lo que era solo de este coche
  vm.bodyGeo.dispose();
  vm.lights.geometry.dispose();
  vm.siren?.geometry.dispose();
  vm.group.traverse((o) => {
    const m = o as THREE.Mesh;
    const mat = m.isMesh ? (m.material as THREE.MeshLambertMaterial) : null;
    if (mat?.map) {
      mat.map.dispose();
      mat.dispose();
      m.geometry.dispose();
    }
  });
  if (!baked) return null;
  modelCache.set(key, baked);
  return baked;
}

export interface GarageCtl {
  group: THREE.Group;
  /** Rehace las maquetas si ha cambiado la lista de vehículos. */
  setCars(list: OwnedLike[] | null | undefined): void;
  update(dt: number): void;
}

/**
 * Colección de maquetas: seis peanas con focos. Origen = esquina del garaje; ancho en X, fondo en Z.
 * Posiciones de las peanas en `slots`.
 */
export function buildGarage(slots: THREE.Vector3[]): GarageCtl {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  const beamGeos: THREE.BufferGeometry[] = [];
  const beamMat = beamMaterial('#fff4d0', 0.16);
  for (const s of slots) {
    b.cyl(0.62, 0.7, 0.95, 16, '#1b1030', s.x, 0.475, s.z);
    b.cyl(0.66, 0.66, 0.06, 16, '#d4af37', s.x, 0.98, s.z);
    b.cyl(0.72, 0.72, 0.05, 16, '#d4af37', s.x, 0.025, s.z);
    // foco del techo
    b.cyl(0.14, 0.2, 0.3, 8, '#222228', s.x, 4.4, s.z);
    beamGeos.push(new THREE.ConeGeometry(0.75, 3.35, 16, 1, true).translate(s.x, 1.0 + 3.35 / 2, s.z));
  }
  g.add(meshOf(b, lambert));
  // todos los haces en una sola malla
  const beams = new THREE.Mesh(mergeGeometries(beamGeos, false)!, beamMat);
  for (const bg of beamGeos) bg.dispose();
  g.add(beams);
  const models: THREE.Mesh[] = [];
  const modelsGroup = new THREE.Group();
  g.add(modelsGroup);
  let key = '';
  let t = 0;
  return {
    group: g,
    setCars(list) {
      const cars = (list && list.length ? list : SAMPLE_CARS).slice(0, slots.length);
      const k = cars.map((c) => c.kind + c.color).join(',');
      if (k === key) return;
      key = k;
      for (const m of models) modelsGroup.remove(m);
      models.length = 0;
      cars.forEach((c, i) => {
        const geo = modelGeometry(c.kind, c.color);
        if (!geo) return;
        const m = new THREE.Mesh(geo, lambert);
        const bb = geo.boundingBox!;
        const size = bb.getSize(new THREE.Vector3());
        const sc = Math.min(0.34, 1.35 / Math.max(size.x, size.z));
        m.scale.setScalar(sc);
        m.position.set(slots[i].x, 1.01 - bb.min.y * sc, slots[i].z);
        m.rotation.y = i * 0.9;
        m.castShadow = true;
        models.push(m);
        modelsGroup.add(m);
      });
    },
    update(dt) {
      t += dt;
      for (let i = 0; i < models.length; i++) models[i].rotation.y += dt * 0.35;
    },
  };
}

export { basicVC };
