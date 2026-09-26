// Materiales compartidos del mundo. Pocos y reutilizados: así hay pocas llamadas de dibujo.
import * as THREE from 'three';

export interface WorldUniforms {
  uNight: { value: number };
  uTime: { value: number };
}

export function createUniforms(): WorldUniforms {
  return { uNight: { value: 0 }, uTime: { value: 0 } };
}

/**
 * Lambert con colores por vértice y un atributo aEmit (rgb + nivel) que brilla de noche.
 * - 'solid': aEmit.w = brillo de día (0..1). De noche sube a 1. Si w >= 2 son bombillas que parpadean.
 * - 'windows': aEmit.w = umbral aleatorio: la ventana se enciende cuando uNight lo supera (poco a poco al anochecer).
 */
export function makeLitMaterial(u: WorldUniforms, mode: 'solid' | 'windows'): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = u.uNight;
    sh.uniforms.uTime = u.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aEmit;\nvarying vec4 vEmit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = aEmit;');
    const code =
      mode === 'windows'
        ? `
      float litW = step(vEmit.w, uNight * 0.7) * smoothstep(0.08, 0.4, uNight);
      totalEmissiveRadiance += vEmit.rgb * litW * 1.25;
      diffuseColor.rgb *= 1.0 - 0.7 * litW;`
        : `
      float lv = vEmit.w;
      float kE = lv > 1.5
        ? (0.3 + 0.7 * step(0.5, fract(uTime * 1.7 + (lv - 2.0)))) * mix(0.55, 1.4, uNight)
        : mix(lv, 1.0, uNight);
      totalEmissiveRadiance += vEmit.rgb * kE;`;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform float uTime;\nvarying vec4 vEmit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + code);
  };
  m.customProgramCacheKey = () => 'cr-lit-' + mode;
  return m;
}

/** Suelo: terreno + calles + aceras (solo recibe sombras). */
export function makeGroundMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

/**
 * Mar: Phong con color según profundidad (textura), espuma en la orilla, olas por vértice
 * y reflejos que se mueven.
 */
export function makeWaterMaterial(u: WorldUniforms, depthTex: THREE.Texture, half: number): THREE.MeshPhongMaterial {
  const m = new THREE.MeshPhongMaterial({
    color: '#ffffff',
    specular: '#9fc9df',
    shininess: 60,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = u.uTime;
    sh.uniforms.uNight = u.uNight;
    sh.uniforms.uDepth = { value: depthTex };
    sh.uniforms.uHalf = { value: half };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying vec3 vWPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
        float wv = sin(wp0.x * 0.09 + uTime * 1.1) * 0.12 + sin(wp0.z * 0.07 - uTime * 0.8) * 0.1
                 + sin((wp0.x + wp0.z) * 0.21 + uTime * 1.9) * 0.04;
        transformed.y += wv;
        vWPos = wp0.xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uNight;
        uniform sampler2D uDepth;
        uniform float uHalf;
        varying vec3 vWPos;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 duv = (vWPos.xz + uHalf) / (2.0 * uHalf);
        float inside = step(0.0, duv.x) * step(duv.x, 1.0) * step(0.0, duv.y) * step(duv.y, 1.0);
        float depth = mix(12.0, texture2D(uDepth, clamp(duv, 0.0, 1.0)).r * 12.0, inside);
        vec3 shallow = vec3(0.10, 0.62, 0.60);
        vec3 mid = vec3(0.02, 0.36, 0.55);
        vec3 deep = vec3(0.01, 0.16, 0.38);
        vec3 wc = mix(shallow, mid, smoothstep(0.3, 3.5, depth));
        wc = mix(wc, deep, smoothstep(3.5, 11.0, depth));
        float ripple = sin(vWPos.x * 0.35 + uTime * 1.3) * sin(vWPos.z * 0.29 - uTime * 1.1);
        float foamLine = smoothstep(1.1, 0.15, depth + ripple * 0.18 + sin(uTime * 1.4 + vWPos.x * 0.05 + vWPos.z * 0.04) * 0.25);
        float foamDots = step(0.72, fract(sin(dot(floor(vWPos.xz * 1.5), vec2(12.9898, 78.233))) * 43758.5453)) * smoothstep(2.2, 0.8, depth) * (1.0 - smoothstep(40.0, 120.0, distance(vWPos, cameraPosition)));
        wc = mix(wc, vec3(0.93, 0.97, 1.0), clamp(foamLine * 0.9 + foamDots * 0.35, 0.0, 1.0));
        diffuseColor.rgb = wc;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float t = uTime;
          vec2 p = vWPos.xz;
          float camD = distance(vWPos, cameraPosition);
          float f1 = 1.0 - smoothstep(60.0, 260.0, camD);
          float f2 = 1.0 - smoothstep(25.0, 110.0, camD);
          float dx = cos(p.x * 0.31 + t * 1.2) * 0.06 * (0.35 + 0.65 * f1) + (cos((p.x + p.y) * 0.73 + t * 2.1) * 0.035 + cos(p.x * 1.7 - t * 2.9) * 0.015) * f2;
          float dz = cos(p.y * 0.27 - t * 1.0) * 0.06 * (0.35 + 0.65 * f1) + (cos((p.x - p.y) * 0.61 + t * 1.7) * 0.035 + cos(p.y * 1.9 + t * 2.3) * 0.015) * f2;
          vec3 nW = normalize(vec3(dx, 1.0, dz));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'cr-water';
  return m;
}

/** Textura de degradado radial para los charcos de luz de las farolas. */
export function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Material aditivo para haces de luz: se desvanece hacia la punta (uv.y) y por los bordes. */
export function makeBeamMaterial(color: string): THREE.ShaderMaterial & { opacity: number } {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      varying float vFres;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vec3 v = normalize(cameraPosition - wp.xyz);
        vFres = abs(dot(n, v));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vFres;
      void main() {
        float a = uOpacity * pow(vUv.y, 1.6) * smoothstep(0.0, 0.6, vFres);
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }) as THREE.ShaderMaterial & { opacity: number };
  Object.defineProperty(m, 'opacity', {
    get: () => m.uniforms.uOpacity.value,
    set: (v: number) => (m.uniforms.uOpacity.value = v),
  });
  return m;
}
