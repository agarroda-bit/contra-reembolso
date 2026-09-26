// Pase psicodélico a pantalla completa. La escena se pinta en una textura (sin MSAA) y un solo
// shader la vuelve a pintar ondulada, con los colores girando, el RGB separado, un eco fantasma
// y una viñeta que late.
// Medido en el MacBook Air M4 (1440×900, consultas de tiempo de GPU): este camino cuesta ≈0,3 ms;
// con MSAA en la textura ≈1,5-2,2 ms y copiando la pantalla ≈1,3-2 ms. Con la imagen ondulando
// no se nota la falta de antialiasing.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float uLevel;
uniform float uTime;
uniform float uAspect;
varying vec2 vUv;

// giro de tono alrededor del eje gris (conserva bastante la luminosidad)
vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735027);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

// Muestra la escena igual que la pintaría el render normal: tone mapping + sRGB.
// El fondo (profundidad = 1) no lleva tone mapping, igual que cuando se pinta directo a pantalla.
float gBg;
vec3 sceneAt(vec2 uv) {
  vec3 c = texture2D(tColor, clamp(uv, 0.001, 0.999)).rgb;
  #ifdef TONE_MAPPING
  c = mix(toneMapping(c), c, gBg);
  #endif
  return clamp(linearToOutputTexel(vec4(c, 1.0)).rgb, 0.0, 1.0);
}

void main() {
  float L = uLevel;
  float t = uTime;
  vec2 c = vUv - 0.5;
  vec2 ca = vec2(c.x * uAspect, c.y);
  float r = length(ca);

  // respiración: zoom que entra y sale + un remolino suave que crece hacia los bordes
  float breathe = 1.0 - L * (0.03 + 0.018 * sin(t * 1.3));
  float swirl = L * 0.16 * sin(t * 0.43) * r * r;
  float sw = sin(swirl), cw = cos(swirl);
  vec2 cs = vec2(ca.x * cw - ca.y * sw, ca.x * sw + ca.y * cw);
  vec2 uv = 0.5 + vec2(cs.x / uAspect, cs.y) * breathe;

  // ondas de gelatina
  vec2 w = vec2(
    sin(uv.y * 11.0 + t * 1.9) + 0.6 * sin(uv.y * 27.0 - t * 2.7 + uv.x * 6.0),
    sin(uv.x * 9.0 - t * 1.5) + 0.6 * sin(uv.x * 23.0 + t * 3.1 + uv.y * 5.0)
  );
  uv += w * (0.0042 * L);
  gBg = step(0.9999995, texture2D(tDepth, clamp(uv, 0.001, 0.999)).r);

  // aberración cromática radial (más fuerte en los bordes)
  vec2 dir = c * (0.012 + 0.008 * sin(t * 2.2)) * L;
  vec3 col;
  col.r = sceneAt(uv + dir).r;
  col.g = sceneAt(uv).g;
  col.b = sceneAt(uv - dir).b;

  // eco fantasma: una copia algo más grande que da vueltas, con otro color
  vec2 euv = 0.5 + (uv - 0.5) * (1.0 - 0.05 * L) + vec2(cos(t * 0.8), sin(t * 1.1)) * 0.011 * L;
  vec3 echo = hueRotate(sceneAt(euv), 2.1 + t * 0.9);
  col = mix(col, max(col, echo), 0.4 * L);

  // colores: giro de tono cíclico con bandas de arcoíris; cada luminosidad con su color
  float luma0 = dot(col, vec3(0.299, 0.587, 0.114));
  float hue = t * 0.9 + r * 3.2 + sin(vUv.x * 5.0 + t * 0.7) * 0.8 + luma0 * 3.5;
  vec3 mixed = mix(col, clamp(hueRotate(col, hue), 0.0, 1.0), smoothstep(0.0, 0.7, L) * 0.85);
  // mezclar un color con su versión girada lo apaga (verde + magenta = gris): se le devuelve
  // el color que tenía (con tope, para que donde se anula del todo no salga una raya)
  float g0 = (col.r + col.g + col.b) / 3.0;
  float g1 = (mixed.r + mixed.g + mixed.b) / 3.0;
  float keep = min(3.0, length(col - g0) / max(length(mixed - g1), 1e-4));
  col = clamp(g1 + (mixed - g1) * keep, 0.0, 1.0);

  // saturación a tope y más contraste
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = clamp(mix(vec3(luma), col, 1.0 + 0.85 * L), 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.45 * L);

  // anillos de arcoíris que salen del centro (flojitos, sobre todo por fuera)
  vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (r * 1.3 - t * 0.25) + vec3(0.0, 2.1, 4.2));
  float rings = pow(0.5 + 0.5 * sin(r * 20.0 - t * 4.0), 6.0);
  col += rainbow * rings * 0.09 * L * smoothstep(0.12, 0.6, r);

  // viñeta que late como un corazón, entre morado y rosa
  float beat = pow(0.5 + 0.5 * sin(t * 2.6), 3.0);
  float v = smoothstep(0.38 - 0.1 * beat, 0.98, r);
  vec3 vc = mix(vec3(0.42, 0.23, 0.82), vec3(1.0, 0.31, 0.5), 0.5 + 0.5 * sin(t * 0.8));
  col = mix(col, col * 0.5 + vc * 0.5, v * L * 0.85);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export class PsychePass {
  private rt: THREE.WebGLRenderTarget | null = null;
  private readonly mat: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new THREE.Vector2();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.mat = new THREE.ShaderMaterial({
      name: 'hierbas',
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uLevel: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    // un triángulo gigante que tapa toda la pantalla
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo, this.mat);
    this.quad.frustumCulled = false;
  }

  /** Compila el shader por adelantado (sin bloquear) para que no dé tirón al fumar. */
  precompile() {
    try {
      this.renderer.compileAsync(this.quad, this.cam).catch(() => {});
    } catch {
      /* no pasa nada: se compilará al usarlo */
    }
  }

  /**
   * Pintar la escena en la textura necesita otra versión de los shaders de todos los materiales
   * (sin tone mapping y en lineal). Se compilan en segundo plano antes de engancharse, para que
   * el primer colocón no dé un tirón. Devuelve cuándo están listos.
   */
  warm(scene: THREE.Object3D, camera: THREE.Camera): Promise<unknown> {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    try {
      r.setRenderTarget(this.ensureTarget());
      return r.compileAsync(scene, camera).catch(() => {});
    } catch {
      return Promise.resolve();
    } finally {
      r.setRenderTarget(prev);
    }
  }

  private ensureTarget(): THREE.WebGLRenderTarget {
    const r = this.renderer;
    r.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x));
    const h = Math.max(1, Math.floor(this.size.y));
    if (!this.rt) {
      // HalfFloat: guarda los brillos por encima de 1 para hacer el tone mapping igual que el render normal.
      // Si el navegador no puede, 8 bits en sRGB (sin bandas en las sombras).
      const floatOK = this.renderer.extensions.has('EXT_color_buffer_float');
      this.rt = new THREE.WebGLRenderTarget(w, h, {
        type: floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType,
        colorSpace: floatOK ? THREE.NoColorSpace : THREE.SRGBColorSpace,
        samples: 0,
        depthBuffer: true,
        stencilBuffer: false,
        depthTexture: new THREE.DepthTexture(w, h),
      });
      this.rt.texture.name = 'hierbas.escena';
    } else if (this.rt.width !== w || this.rt.height !== h) {
      this.rt.setSize(w, h);
    }
    return this.rt;
  }

  /** Pinta la escena (con drawScene) en la textura y luego el efecto a pantalla. */
  render(drawScene: () => void, level: number, time: number) {
    const r = this.renderer;
    const rt = this.ensureTarget();
    const prevTarget = r.getRenderTarget();
    r.setRenderTarget(rt);
    drawScene();
    r.setRenderTarget(prevTarget);

    const u = this.mat.uniforms;
    u.tColor.value = rt.texture;
    u.tDepth.value = rt.depthTexture;
    u.uLevel.value = level;
    u.uTime.value = time;
    u.uAspect.value = rt.width / rt.height;
    // borrar antes (aunque el triángulo lo tape todo) es más barato en GPUs como la del Mac:
    // así no tiene que leer la imagen anterior de memoria
    const autoClear = r.autoClear;
    r.autoClear = true;
    r.render(this.quad, this.cam);
    r.autoClear = autoClear;
  }

  /** Suelta la memoria de la textura (cuando se pasa el efecto). */
  release() {
    if (this.rt) {
      this.rt.dispose();
      this.rt = null;
    }
  }

  get allocated() {
    return this.rt !== null;
  }
}
