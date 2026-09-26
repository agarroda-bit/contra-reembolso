// Pensamientos profundísimos que flotan por la pantalla mientras dura el efecto.
// Letras de colores que ondulan y cambian de color en ola (animaciones CSS: nada de JS por frame).

export const FRASES: readonly string[] = [
  '¿Y si los paquetes nos entregan a nosotros?',
  'Esa farola me está juzgando.',
  'Tengo hambre de… todo.',
  '¿El cartón tiene sentimientos?',
  'Los Devueltos… qué nombre tan bonito…',
  'Si reparto un paquete vacío, ¿he repartido aire?',
  'Las ruedas son círculos. CÍRCULOS, tío.',
  'Creo que la furgoneta me quiere.',
  '¿Por qué «contra» reembolso? Yo no estoy en contra de nadie.',
  'Ese perro sabe algo.',
  '¿Y si el mar es un charco que se ha venido arriba?',
  'Necesito una empanadilla. Es urgente.',
  'Las palomas lo controlan todo. TODO.',
  '¿Quién le reparte los paquetes al repartidor?',
  'Qué bien huele el asfalto hoy.',
  'El cliente siempre tiene razón… pero ¿qué es la razón?',
  'Voy a abrazar un semáforo. Por la paz.',
  'El dinero es papel, el papel es árbol… soy rico en árboles.',
  '¿Las cajas se sienten solas en el almacén?',
  'Mi jefe es un señor dentro de un móvil. ¿Existe?',
  '¿Y si las motos son caballos con ruedas?',
  'Todo es un paquete si lo miras con cariño.',
  'Esa nube tiene cara de cobrador.',
  'Recalculando… mi vida.',
  'Las gaviotas saben dónde vivo.',
  'Si corro muy rápido, ¿llego ayer?',
  'Ese coche me ha guiñado un faro.',
  'Acabo de darme cuenta de que tengo codos.',
  'La fuente de la plaza conoce mis secretos.',
  'Quiero ser rotonda: que todo gire a mi alrededor.',
  'Soy una tortilla de patatas en un mundo de pizzas.',
  '¿El precinto precinta o es precintado? Profundo.',
  'Hola, mano. Qué bien te veo.',
  'Si me pongo el casco al revés, ¿voy marcha atrás?',
  'El albarán me ha mirado raro.',
  '¿Los peces reciben paquetes? Qué vida más triste.',
  'Nota mental: los bolardos también son personas.',
  'Me siento ligero como un paquete de pipas.',
  '¿Y si Puerto Paquete es un paquete que nadie ha venido a recoger?',
  'El Devolución también fue un niño. Un niño con albarán.',
  'La abuela de los céntimos tenía razón en todo.',
  'Me voy a pedir una pizza contra reembolso. Y me la traigo yo.',
  'Si piso las rayas del paso de cebra, pierdo. Así funciona esto.',
  'Oye, ¿y si la policía solo quiere un abrazo? …No. No quiere.',
];

const INICIO = ['Uy… esto sube.', 'Oye… ¿y esta música de dónde sale?', 'Vale. Vale. Vale. Todo bien.'];
const FINAL = ['Creo que se me está pasando…', 'Vuelvo a la realidad. Qué pereza.', 'Uf… ¿cuánto rato llevo mirando esa farola?'];

const CSS = `
.hb-capa{position:fixed;inset:0;pointer-events:none;z-index:20;overflow:hidden}
.hb-capa.hb-quieta{visibility:hidden}
.hb-capa.hb-quieta *{animation-play-state:paused!important}
.hb-frase{position:absolute;width:min(700px,72vw);margin-left:calc(min(700px,72vw) / -2);text-align:center;
  font:900 clamp(24px,2.9vw,42px)/1.18 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:.5px;
  transform:rotate(var(--rot));animation:hb-entra .7s cubic-bezier(.2,1.5,.4,1) both,hb-sale .9s ease-in var(--fuera) forwards}
.hb-flota{animation:hb-flota 5.5s ease-in-out forwards}
.hb-pal{display:inline-block;white-space:nowrap}
.hb-letra{display:inline-block;color:#ffd23f;animation:hb-ola 1.3s ease-in-out infinite,hb-color 2.4s linear infinite;
  animation-delay:calc(var(--i) * -0.09s),calc(var(--i) * -0.12s + var(--c0));
  text-shadow:3px 3px 0 #1b1030,-2px -2px 0 #1b1030,2px -2px 0 #1b1030,-2px 2px 0 #1b1030,0 3px 0 #1b1030,0 -2px 0 #1b1030}
@keyframes hb-entra{0%{opacity:0;transform:scale(.2) rotate(calc(var(--rot) * -3))}100%{opacity:1;transform:scale(1) rotate(var(--rot))}}
@keyframes hb-sale{to{opacity:0;transform:scale(1.35) rotate(calc(var(--rot) * 2));filter:blur(3px)}}
@keyframes hb-flota{0%{transform:translate(0,0)}50%{transform:translate(12px,-14px)}100%{transform:translate(-8px,-30px)}}
@keyframes hb-ola{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-7px) rotate(-5deg)}75%{transform:translateY(5px) rotate(4deg)}}
@keyframes hb-color{0%,100%{color:#ffd23f}17%{color:#ff7b54}33%{color:#ff4f81}50%{color:#b18cff}67%{color:#2ec4b6}83%{color:#06d6a0}}
`;

let cssDone = false;

export class Thoughts {
  private layer: HTMLDivElement | null = null;
  private bag: string[] = [];
  private timer = 0;
  private endSaid = false;
  private hidden = false;
  private slot = 0; // 0 = franja de arriba, 1 = franja de abajo
  /** Cuántas frases se han mostrado (para pruebas). */
  shown = 0;
  private shownNow = 0; // frases de este colocón
  /** Se llama con el texto cada vez que aparece una frase (para el sonido). */
  onSpawn: ((text: string) => void) | null = null;

  constructor(private readonly ui: HTMLElement) {}

  private pendingStart = false;

  /** Empieza un colocón nuevo: primera frase enseguida. */
  begin() {
    this.timer = 1.8;
    this.endSaid = false;
    this.pendingStart = true;
    this.shownNow = 0;
  }

  /** Se ha alargado el efecto: si ya se había despedido, vuelven los pensamientos. */
  extend() {
    if (!this.endSaid) return;
    this.endSaid = false;
    this.timer = 2.5;
  }

  /** realDt: segundos reales; remaining: segundos que quedan; fall: duración de la bajada. */
  update(realDt: number, level: number, remaining: number, fall: number) {
    // frase de despedida al empezar a bajar
    if (!this.endSaid && remaining > 0 && remaining < fall - 0.5 && this.shownNow > 0) {
      this.endSaid = true;
      this.timer = 1e9; // ya no salen más
      this.spawn(pick(FINAL));
      return;
    }
    this.timer -= realDt;
    if (this.timer > 0 || level < 0.3) return;
    this.timer = 6 + Math.random() * 4;
    this.spawn(this.pendingStart ? pick(INICIO) : this.next());
    this.pendingStart = false;
  }

  /** Oculta las frases (p. ej. con el juego en pausa). Se congelan donde estaban, sin reiniciar
   *  las animaciones (con display:none volverían a entrar desde cero al quitar la pausa). */
  setHidden(h: boolean) {
    if (h === this.hidden) return;
    this.hidden = h;
    this.layer?.classList.toggle('hb-quieta', h);
  }

  private next(): string {
    if (!this.bag.length) {
      this.bag = FRASES.slice();
      // barajar para no repetir hasta agotarlas
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop()!;
  }

  private ensureLayer(): HTMLDivElement {
    if (!cssDone) {
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
      cssDone = true;
    }
    if (!this.layer) {
      this.layer = document.createElement('div');
      this.layer.className = 'hb-capa';
      this.layer.style.pointerEvents = 'none';
      this.layer.classList.toggle('hb-quieta', this.hidden);
    }
    // por si alguien ha vaciado la interfaz entre medias
    if (!this.layer.isConnected) this.ui.appendChild(this.layer);
    return this.layer;
  }

  /** Muestra una frase ya (también sirve para pruebas). */
  spawn(text: string) {
    const layer = this.ensureLayer();
    // no amontonar: como mucho dos a la vez
    while (layer.childElementCount >= 2) layer.firstElementChild!.remove();
    const el = document.createElement('div');
    el.className = 'hb-frase';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', text);
    const life = 4.6;
    el.style.setProperty('--rot', `${(Math.random() * 8 - 4).toFixed(1)}deg`);
    el.style.setProperty('--fuera', `${life}s`);
    // arriba o abajo del centro (el centro es para la retícula); si ya hay una frase, a la otra franja
    this.slot = layer.childElementCount > 0 ? 1 - this.slot : Math.random() < 0.75 ? 0 : 1;
    const top = this.slot === 0 ? 15 + Math.random() * 10 : 66 + Math.random() * 6;
    el.style.top = `${top.toFixed(1)}%`;
    el.style.left = `${(44 + Math.random() * 12).toFixed(1)}%`;
    el.style.setProperty('--c0', `${(-Math.random() * 2.4).toFixed(2)}s`);
    const flota = document.createElement('div');
    flota.className = 'hb-flota';
    flota.setAttribute('aria-hidden', 'true'); // letra a letra no se lee bien: se lee la frase entera
    let i = 0;
    const words = text.split(' ');
    words.forEach((word, wi) => {
      const w = document.createElement('span');
      w.className = 'hb-pal';
      for (const ch of word) {
        const s = document.createElement('span');
        s.className = 'hb-letra';
        s.textContent = ch;
        s.style.setProperty('--i', String(i));
        w.appendChild(s);
        i++;
      }
      flota.appendChild(w);
      if (wi < words.length - 1) flota.appendChild(document.createTextNode(' '));
    });
    el.appendChild(flota);
    el.addEventListener('animationend', (e) => {
      if (e.target === el && e.animationName === 'hb-sale') el.remove();
    });
    layer.appendChild(el);
    this.shown++;
    this.shownNow++;
    this.onSpawn?.(text);
  }

  /** Quita todo (fin del efecto). */
  clear() {
    this.timer = 0;
    this.endSaid = false;
    this.pendingStart = false;
    if (this.layer) this.layer.replaceChildren();
  }
}

function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}
