// Panel de tienda genérico (taller, armería, ropa, oficina, club...). Menú bonito con tarjetas.
import type { Game } from '../core/game';
import { fmt } from '../gameplay/economy';
import { PAD, PadEdges, padNavigate, padFocusCss } from './pad';

export interface ShopItem {
  id: string;
  icon: string;
  name: string;
  desc?: string;
  price: number;
  /** Texto del botón (por defecto "Comprar"). */
  label?: string;
  owned?: boolean;
  equipped?: boolean;
  disabled?: boolean;
  /** Motivo si está bloqueado ("Fama 3"). */
  locked?: string;
  /** Devuelve true si la compra/acción se ha hecho. */
  buy: () => boolean | void;
}

export interface ShopSection {
  title: string;
  items: ShopItem[];
}

export interface ShopDef {
  title: string;
  subtitle: string;
  color: string; // color de cabecera
  icon: string;
  sections: () => ShopSection[]; // se recalcula tras cada compra
  onClose?: () => void;
}

const CSS = `
.cr-tienda{position:fixed;inset:0;z-index:55;display:flex;align-items:center;justify-content:center;background:rgba(27,16,48,.6);pointer-events:auto;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.cr-tienda .caja{width:min(980px,calc(100vw - 32px));max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:#fff7e6;border:4px solid #1b1030;border-radius:28px;box-shadow:12px 12px 0 rgba(27,16,48,.75);overflow:hidden;animation:cr-entra .25s cubic-bezier(.2,1.4,.4,1)}
@keyframes cr-entra{from{transform:scale(.85) rotate(-2deg);opacity:0}to{transform:none;opacity:1}}
.cr-tienda .cab{display:flex;align-items:center;gap:14px;padding:16px 22px;border-bottom:4px solid #1b1030;color:#1b1030}
.cr-tienda .cab .ic{font-size:42px}
.cr-tienda .cab h2{margin:0;font:900 30px system-ui;letter-spacing:-.5px}
.cr-tienda .cab p{margin:2px 0 0;font:700 14px system-ui;opacity:.75}
.cr-tienda .cab .dinero{margin-left:auto;text-align:right;font:900 18px system-ui;background:#1b1030;color:#ffd23f;border-radius:14px;padding:8px 14px}
.cr-tienda .cab .dinero small{display:block;font:700 11px system-ui;color:#fff;opacity:.7}
.cr-tienda .cerrar{border:3px solid #1b1030;border-radius:12px;background:#ff4f81;color:#fff;font:900 18px system-ui;width:44px;height:44px;cursor:pointer;margin-left:10px}
.cr-tienda .lista{overflow-y:auto;padding:10px 22px 22px}
.cr-tienda h3{font:900 18px system-ui;margin:16px 0 8px;color:#1b1030;text-transform:uppercase;letter-spacing:.5px}
.cr-tienda .rejilla{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.cr-tienda .item{background:#fff;border:3px solid #1b1030;border-radius:18px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow:4px 4px 0 rgba(27,16,48,.35);color:#1b1030}
.cr-tienda .item .ic{font-size:36px}
.cr-tienda .item b{font:900 16px system-ui}
.cr-tienda .item p{margin:0;font:600 12.5px/1.3 system-ui;opacity:.75;flex:1}
.cr-tienda .item .pie{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px}
.cr-tienda .item .precio{font:900 16px system-ui}
.cr-tienda .item button{border:3px solid #1b1030;border-radius:12px;background:#ffd23f;font:900 14px system-ui;padding:7px 12px;cursor:pointer;box-shadow:2px 2px 0 #1b1030;color:#1b1030}
.cr-tienda .item button:hover{background:#ff7b54}
.cr-tienda .item button:disabled{opacity:.45;cursor:default;box-shadow:none;background:#eee}
.cr-tienda .item.tuyo{background:#e7fff5}
.cr-tienda .item.puesto{outline:4px solid #2ec4b6}
.cr-tienda .item .cabeza{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}
.cr-tienda .insignia{font:900 11.5px system-ui;letter-spacing:.04em;text-transform:uppercase;padding:4px 8px;border-radius:99px;border:2px solid #1b1030;background:#2ec4b6;color:#1b1030;white-space:nowrap}
.cr-tienda .insignia.puesto{background:#ffd23f}
.cr-tienda .item button:focus-visible,.cr-tienda .cerrar:focus-visible{outline:4px solid #ff4f81;outline-offset:2px}
.cr-tienda .pista{font:700 13px system-ui;opacity:.7;padding:8px 22px 12px;border-top:2px dashed rgba(27,16,48,.15)}
${padFocusCss()}
`;

let styled = false;

export class ShopUI {
  private el: HTMLDivElement | null = null;
  private def: ShopDef | null = null;
  private pad = new PadEdges();
  private raf = 0;
  /** Mando con la tienda abierta: cruceta elige, A compra, B sale (Start no: abriría la pausa). */
  private padLoop = () => {
    if (!this.el) return;
    const edges = this.pad.poll();
    if (edges & PAD.B) this.close();
    else if (edges) padNavigate(this.el, edges);
    if (this.el) this.raf = requestAnimationFrame(this.padLoop);
  };
  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Escape' || e.code === 'KeyE') {
      e.stopPropagation();
      this.close();
    }
  };

  constructor(private game: Game) {
    game.mod.shopUI = this;
    if (!styled) {
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
      styled = true;
    }
  }

  get isOpen() {
    return !!this.el;
  }

  open(def: ShopDef) {
    const g = this.game;
    this.close();
    this.def = def;
    g.paused = true;
    (g as any).menuOpen = true;
    g.input.enabled = false;
    g.input.releaseAll();
    g.input.exitPointerLock();
    this.el = document.createElement('div');
    this.el.className = 'cr-tienda';
    g.ui.appendChild(this.el);
    setTimeout(() => window.addEventListener('keydown', this.keyHandler, true), 50);
    this.pad.reset();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.padLoop);
    this.render();
    g.mod.audio?.play('door');
  }

  close() {
    if (!this.el) return;
    const g = this.game;
    this.el.remove();
    this.el = null;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.keyHandler, true);
    g.paused = false;
    (g as any).menuOpen = false;
    g.input.enabled = true;
    const d = this.def;
    this.def = null;
    d?.onClose?.();
  }

  render() {
    const def = this.def;
    const el = this.el;
    if (!def || !el) return;
    const eco = this.game.mod.economy;
    const scroll = el.querySelector('.lista')?.scrollTop ?? 0;
    // tras comprar se redibuja todo: el foco (teclado o mando) vuelve al mismo botón
    const focused = document.activeElement;
    const focusIdx = focused instanceof HTMLButtonElement && el.contains(focused) ? [...el.querySelectorAll('button')].indexOf(focused) : -1;
    const padFocus = focusIdx >= 0 && focused!.classList.contains('cr-foco');
    el.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'caja';
    const cab = document.createElement('div');
    cab.className = 'cab';
    cab.style.background = def.color;
    cab.innerHTML = `<div class="ic">${def.icon}</div><div><h2></h2><p></p></div>
      <div class="dinero">${fmt(eco?.cash ?? 0)}<small>efectivo · banco ${fmt(eco?.bank ?? 0)}</small></div>`;
    (cab.querySelector('h2') as HTMLElement).textContent = def.title;
    (cab.querySelector('p') as HTMLElement).textContent = def.subtitle;
    const x = document.createElement('button');
    x.className = 'cerrar';
    x.textContent = '✕';
    x.onclick = () => this.close();
    cab.appendChild(x);
    box.appendChild(cab);
    const list = document.createElement('div');
    list.className = 'lista';
    for (const sec of def.sections()) {
      const h = document.createElement('h3');
      h.textContent = sec.title;
      list.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'rejilla';
      for (const it of sec.items) {
        const card = document.createElement('div');
        card.className = 'item' + (it.owned ? ' tuyo' : '') + (it.equipped ? ' puesto' : '');
        // lo que ya es tuyo o llevas puesto se dice con texto, no solo con el color de la tarjeta
        const badge = it.equipped ? '<span class="insignia puesto">★ Puesto</span>' : it.owned ? '<span class="insignia">✔ Tuyo</span>' : '';
        card.innerHTML = `<div class="cabeza"><div class="ic">${it.icon}</div>${badge}</div><b></b><p></p><div class="pie"><span class="precio"></span></div>`;
        (card.querySelector('b') as HTMLElement).textContent = it.name;
        (card.querySelector('p') as HTMLElement).textContent = it.desc ?? '';
        (card.querySelector('.precio') as HTMLElement).textContent = it.locked ? '🔒 ' + it.locked : it.price > 0 ? fmt(it.price) : it.owned ? 'Tuyo' : 'Gratis';
        const btn = document.createElement('button');
        btn.textContent = it.label ?? (it.owned ? 'Tuyo' : 'Comprar');
        btn.disabled = !!it.disabled || !!it.locked;
        btn.onclick = () => {
          const ok = it.buy();
          if (ok !== false) this.game.mod.audio?.play(it.price > 0 ? 'cash' : 'click');
          this.render();
        };
        card.querySelector('.pie')!.appendChild(btn);
        grid.appendChild(card);
      }
      list.appendChild(grid);
    }
    box.appendChild(list);
    const pista = document.createElement('div');
    pista.className = 'pista';
    pista.textContent = 'Se paga primero con el efectivo y, si no llega, con el banco. Esc o E para salir (con mando, B).';
    box.appendChild(pista);
    el.appendChild(box);
    list.scrollTop = scroll;
    if (focusIdx >= 0) {
      const again = el.querySelectorAll('button')[focusIdx];
      if (again) {
        again.focus({ preventScroll: true });
        if (padFocus) again.classList.add('cr-foco');
      }
    }
  }
}
