// El móvil (Tab): PaqueChat (mensajes y encargos), Banco, Fama, Garaje y Mapa.
// Mientras está abierto el tiempo va a cámara lenta y el ratón queda libre para tocar.
import type { Game, System } from '../core/game';
import type { Messages, Chat } from '../gameplay/messages';
import { fmt, FAME_LEVELS } from '../gameplay/economy';
import { PAD, PadEdges, padNavigate, padFocusCss } from './pad';

type Screen = 'home' | 'chats' | 'chat' | 'bank' | 'fame' | 'garage' | 'help';

const CSS = `
.cr-movil{box-sizing:border-box;position:fixed;right:28px;bottom:24px;width:340px;height:min(620px,calc(100vh - 128px));min-height:420px;z-index:30;
  background:#1b1030;border-radius:42px;padding:14px;box-shadow:0 0 0 4px #2b1d4a,10px 12px 0 rgba(0,0,0,.35);
  transform:translateY(110%) rotate(4deg);transition:transform .32s cubic-bezier(.2,1.3,.4,1);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;pointer-events:auto}
.cr-movil.abierto{transform:translateY(0) rotate(-2deg)}
.cr-pantalla{position:relative;width:100%;height:100%;border-radius:30px;overflow:hidden;background:linear-gradient(160deg,#ffecd2,#fcb69f 45%,#ff7b54);display:flex;flex-direction:column;color:#1b1030}
.cr-barra{display:flex;justify-content:space-between;align-items:center;padding:10px 20px 6px;font:800 13px system-ui;color:#1b1030}
.cr-notch{position:absolute;top:8px;left:50%;width:92px;height:22px;margin-left:-46px;background:#1b1030;border-radius:14px}
.cr-cab{display:flex;align-items:center;gap:10px;padding:8px 14px 10px;font:900 20px system-ui;color:#1b1030}
.cr-cab button{border:0;background:#1b1030;color:#ffd23f;border-radius:12px;font:900 16px system-ui;padding:6px 10px;cursor:pointer}
.cr-cuerpo{flex:1;overflow-y:auto;padding:4px 12px 14px}
.cr-apps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px 10px;padding:18px 8px}
.cr-app{display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;border:0;background:none;color:#1b1030;font:800 13px system-ui;position:relative}
.cr-app i{font-style:normal;width:64px;height:64px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:32px;
  box-shadow:3px 4px 0 rgba(27,16,48,.35);border:3px solid #1b1030}
.cr-app b{position:absolute;top:-6px;right:6px;background:#ff2d55;color:#fff;border-radius:12px;min-width:22px;height:22px;font:900 13px/22px system-ui;border:2px solid #1b1030}
.cr-chatitem{display:flex;gap:10px;align-items:center;background:rgba(255,255,255,.85);border-radius:16px;padding:9px 10px;margin:8px 0;cursor:pointer;border:2px solid #1b1030}
.cr-chatitem .av{font-size:28px;width:40px;text-align:center}
.cr-chatitem .tx{flex:1;min-width:0}
.cr-chatitem .tx div{font:900 14px system-ui}
.cr-chatitem .tx span{display:block;font:500 13px system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.75}
.cr-chatitem b{background:#ff2d55;color:#fff;border-radius:10px;padding:1px 7px;font:900 12px system-ui}
.cr-msg{max-width:84%;margin:8px 0;padding:9px 12px;border-radius:16px;font:600 14px/1.3 system-ui;white-space:pre-wrap;border:2px solid #1b1030;box-shadow:2px 3px 0 rgba(27,16,48,.25)}
.cr-msg.suyo{background:#ffffff;border-bottom-left-radius:4px}
.cr-msg.mio{background:#2ec4b6;margin-left:auto;border-bottom-right-radius:4px;color:#1b1030}
.cr-msg small{display:block;opacity:.6;font:700 11px system-ui;margin-top:3px;text-align:right}
.cr-acciones{display:flex;gap:8px;margin-top:8px}
.cr-acciones button{flex:1;border:2px solid #1b1030;border-radius:12px;font:900 14px system-ui;padding:8px;cursor:pointer;box-shadow:2px 3px 0 #1b1030}
.cr-acciones .si{background:#ffd23f}.cr-acciones .no{background:#ffd1dc}
.cr-acciones button:disabled{opacity:.4;box-shadow:none;cursor:default}
.cr-tarjeta{background:rgba(255,255,255,.88);border:3px solid #1b1030;border-radius:18px;padding:14px;margin:10px 0;box-shadow:3px 4px 0 rgba(27,16,48,.3)}
.cr-tarjeta h3{margin:0 0 6px;font:900 15px system-ui;opacity:.7}
.cr-tarjeta .gordo{font:900 34px system-ui}
.cr-barrafama{height:14px;border-radius:8px;background:#1b1030;overflow:hidden;margin-top:8px}
.cr-barrafama i{display:block;height:100%;background:linear-gradient(90deg,#ffd23f,#ff4f81)}
.cr-pie{padding:6px 8px 10px;text-align:center;font:700 12px system-ui;opacity:.7}
.cr-boton{display:block;width:100%;border:2px solid #1b1030;border-radius:14px;background:#ffd23f;font:900 15px system-ui;padding:10px;margin:8px 0;cursor:pointer;box-shadow:2px 3px 0 #1b1030;color:#1b1030}
${padFocusCss()}
`;

export class Phone implements System {
  name = 'phone';
  open = false;
  private root: HTMLDivElement;
  private body!: HTMLDivElement;
  private title!: HTMLDivElement;
  private back!: HTMLButtonElement;
  private clock!: HTMLSpanElement;
  private screen: Screen = 'home';
  private chatId: string | null = null;
  private drawnVersion = -1;
  private pad = new PadEdges();
  private toggledAt = -1;
  /** Apps extra que añaden otros módulos (garaje, radio...). */
  readonly extraApps: { id: string; icon: string; name: string; color: string; open: (body: HTMLDivElement) => void }[] = [];

  constructor(private game: Game) {
    game.mod.phone = this;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.root = document.createElement('div');
    this.root.className = 'cr-movil';
    this.root.innerHTML = `<div class="cr-pantalla"><div class="cr-notch"></div>
      <div class="cr-barra"><span class="reloj">09:00</span><span>📶 🔋</span></div>
      <div class="cr-cab"><button class="atras">‹</button><div class="titulo">Pomelo</div></div>
      <div class="cr-cuerpo"></div>
      <div class="cr-pie">Tab o Esc para cerrar</div></div>`;
    game.ui.appendChild(this.root);
    this.body = this.root.querySelector('.cr-cuerpo')!;
    this.title = this.root.querySelector('.titulo')!;
    this.back = this.root.querySelector('.atras')!;
    this.clock = this.root.querySelector('.reloj')!;
    this.back.onclick = () => this.goBack();
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Enter') this.quickAction(0);
      if (e.code === 'Backspace') this.quickAction(1);
      if (e.code === 'Escape') {
        // Esc solo cierra el móvil: que no abra además la pausa (el menú escucha después)
        e.stopImmediatePropagation();
        this.toggle(false);
      }
    });
  }

  /** Mando con el móvil abierto: A acepta, X rechaza, B vuelve atrás (y cierra en el inicio). */
  private pollPad() {
    const edges = this.pad.poll();
    if (!edges) return;
    if (edges & PAD.A) {
      // si con la cruceta has elegido un botón del móvil, A lo pulsa; si no, acepta el encargo
      const f = document.activeElement;
      if (f instanceof HTMLButtonElement && this.root.contains(f)) f.click();
      else this.quickAction(0);
    } else if (edges & PAD.X) this.quickAction(1);
    else if (edges & PAD.B) this.goBack();
    else if (edges & (PAD.DOWN | PAD.LEFT | PAD.RIGHT)) padNavigate(this.root, edges);
  }

  private get msgs(): Messages {
    return this.game.mod.messages;
  }

  toggle(force?: boolean) {
    const g = this.game;
    const want = force ?? !this.open;
    if (want === this.open) return;
    // no abrir con otros menús
    if (want && (g.paused || (g as any).menuOpen)) return;
    this.open = want;
    this.root.classList.toggle('abierto', want);
    if (want) {
      g.input.exitPointerLock();
      g.input.releaseAll();
      g.input.enabled = false;
      g.timeScaleMods.set('movil', 0.3);
      this.pad.reset();
      // abrir directamente la conversación con algo pendiente
      const pending = this.msgs?.latestActionable();
      if (pending) this.show('chat', pending.chat.id);
      else if ((this.msgs?.unread ?? 0) > 0) this.show('chats');
      else this.show('home');
      g.mod.audio?.play('click');
    } else {
      g.input.enabled = true;
      g.timeScaleMods.delete('movil');
      // que ningún botón del móvil se quede con el foco (Enter o Espacio lo pulsarían luego)
      const f = document.activeElement;
      if (f instanceof HTMLElement && this.root.contains(f)) f.blur();
    }
  }

  private goBack() {
    if (this.screen === 'chat') this.show('chats');
    else if (this.screen !== 'home') this.show('home');
    else this.toggle(false);
  }

  show(s: Screen, chatId?: string) {
    this.screen = s;
    if (chatId) this.chatId = chatId;
    this.drawnVersion = -1;
    this.render();
  }

  /** Enter/Retroceso: aceptar o rechazar la oferta visible más reciente. */
  private quickAction(i: number) {
    const pending = this.msgs?.latestActionable();
    if (!pending) return;
    const a = pending.msg.actions?.[i];
    if (a && (!a.valid || a.valid())) {
      pending.msg.used = true;
      a.run();
      this.drawnVersion = -1;
      this.render();
    }
  }

  private render() {
    const m = this.msgs;
    if (!m) return;
    this.back.style.visibility = this.screen === 'home' ? 'hidden' : 'visible';
    const b = this.body;
    b.innerHTML = '';
    switch (this.screen) {
      case 'home': {
        this.title.textContent = 'Pomelo 🍊';
        const apps = document.createElement('div');
        apps.className = 'cr-apps';
        const add = (icon: string, name: string, color: string, fn: () => void, badge = 0) => {
          const a = document.createElement('button');
          a.className = 'cr-app';
          a.innerHTML = `<i style="background:${color}">${icon}</i>${name}${badge ? `<b>${badge}</b>` : ''}`;
          a.onclick = fn;
          apps.appendChild(a);
        };
        add('💬', 'PaqueChat', '#2ec4b6', () => this.show('chats'), m.unread);
        add('🗺️', 'Mapa', '#ffd23f', () => {
          this.toggle(false);
          this.game.mod.hud?.openMap?.();
        });
        add('🏦', 'Banco', '#06d6a0', () => this.show('bank'));
        add('⭐', 'Fama', '#ff4f81', () => this.show('fame'));
        for (const x of this.extraApps) add(x.icon, x.name, x.color, () => {
          this.screen = 'garage';
          this.title.textContent = x.name;
          this.back.style.visibility = 'visible';
          this.body.innerHTML = '';
          x.open(this.body);
        });
        add('❓', 'Ayuda', '#9b5de5', () => this.show('help'));
        b.appendChild(apps);
        break;
      }
      case 'chats': {
        this.title.textContent = 'PaqueChat';
        const list = m.sorted();
        if (!list.length) b.innerHTML = '<div class="cr-tarjeta">Nadie te escribe. De momento.</div>';
        for (const c of list) b.appendChild(this.chatItem(c));
        break;
      }
      case 'chat': {
        const c = this.chatId ? m.chats.get(this.chatId) : null;
        if (!c) return this.show('chats');
        this.title.textContent = `${c.avatar} ${c.name}`;
        m.markRead(c.id);
        for (const msg of c.messages) {
          const el = document.createElement('div');
          el.className = 'cr-msg ' + (msg.mine ? 'mio' : 'suyo');
          el.textContent = msg.text;
          const t = document.createElement('small');
          t.textContent = msg.time;
          el.appendChild(t);
          if (msg.actions?.length) {
            const acts = document.createElement('div');
            acts.className = 'cr-acciones';
            for (const a of msg.actions) {
              const btn = document.createElement('button');
              btn.className = a.style ?? 'si';
              btn.textContent = a.label;
              const ok = !msg.used && (!a.valid || a.valid());
              btn.disabled = !ok;
              btn.onclick = () => {
                if (msg.used) return;
                msg.used = true;
                a.run();
                this.drawnVersion = -1;
                this.render();
              };
              acts.appendChild(btn);
            }
            el.appendChild(acts);
          }
          b.appendChild(el);
        }
        b.scrollTop = b.scrollHeight;
        break;
      }
      case 'bank': {
        this.title.textContent = 'Banco Hucha 🐷';
        const eco = this.game.mod.economy;
        b.innerHTML = `<div class="cr-tarjeta"><h3>EN EL BANCO</h3><div class="gordo">${fmt(eco?.bank ?? 0)}</div></div>
          <div class="cr-tarjeta"><h3>EFECTIVO ENCIMA</h3><div class="gordo">${fmt(eco?.cash ?? 0)}</div>
          <p style="font:600 13px system-ui;margin:8px 0 0">El efectivo se pierde si te matan o te pillan. Ingrésalo en un cajero 🏧 (oficina, Centro y otro más).</p></div>
          <div class="cr-tarjeta"><h3>ESTE MES</h3><div style="font:700 14px/1.6 system-ui">Ganado: ${fmt(eco?.stats.earned ?? 0)}<br>Gastado: ${fmt(eco?.stats.spent ?? 0)}<br>Perdido: ${fmt(eco?.stats.lost ?? 0)}<br>Entregas: ${eco?.stats.deliveries ?? 0} (${eco?.stats.perfect ?? 0} perfectas)</div></div>`;
        break;
      }
      case 'fame': {
        this.title.textContent = 'Fama ⭐';
        const eco = this.game.mod.economy;
        const f = eco?.fame ?? 0;
        const lvl = eco?.fameLevel ?? 1;
        const cur = FAME_LEVELS[lvl - 1] ?? 0;
        const next = FAME_LEVELS[lvl] ?? cur + 1;
        const pct = Math.min(100, ((f - cur) / Math.max(1, next - cur)) * 100);
        b.innerHTML = `<div class="cr-tarjeta"><h3>NIVEL</h3><div class="gordo">${lvl}</div><div class="cr-barrafama"><i style="width:${pct}%"></i></div>
          <p style="font:700 13px system-ui">${Math.round(f)} / ${next} puntos</p></div>
          <div class="cr-tarjeta" style="font:600 13px/1.5 system-ui">La fama sube con entregas perfectas, lujos y mesas VIP.<br>Más fama = encargos mejor pagados, paquetes SOSPECHOSOS, vehículos nuevos y la historia del tablón de la oficina.</div>`;
        break;
      }
      case 'help': {
        this.title.textContent = 'Ayuda';
        const photo = this.game.mod.photo ? ' · K modo foto' : '';
        b.innerHTML = `<div class="cr-tarjeta" style="font:600 13.5px/1.55 system-ui">
          <b>Cómo va esto</b><br>1. Te llegan encargos aquí. Acepta con el botón (o Enter).<br>2. Recoge el paquete donde diga (📦 en el mapa).<br>
          3. Llévalo sin romperlo a la casa (🏠) y pulsa E en la puerta.<br>4. Cobras en efectivo: ingrésalo en un cajero 🏧 antes de que te lo quiten.<br>
          5. Los encargos grandes, en el tablón de la oficina.</div>
          <div class="cr-tarjeta" style="font:600 13.5px/1.55 system-ui"><b>Teclas</b><br>WASD mover · Ratón mirar · Shift correr/turbo · Espacio saltar/freno de mano · F subir/bajar/robar · E interactuar · Clic disparar · Clic derecho apuntar · R recargar · 1-5 armas · M mapa · H claxon · Q/E radio${photo} · Esc pausa<br><br>
          <b>Con mando</b><br>A aceptar · X rechazar · B atrás. Todos los controles, en Pausa → Controles.</div>`;
        break;
      }
      default:
        break;
    }
    this.drawnVersion = m.version;
  }

  private chatItem(c: Chat): HTMLElement {
    const el = document.createElement('div');
    el.className = 'cr-chatitem';
    const last = c.messages[c.messages.length - 1];
    el.innerHTML = `<div class="av">${c.avatar}</div><div class="tx"><div></div><span></span></div>${c.unread ? `<b>${c.unread}</b>` : ''}`;
    (el.querySelector('.tx div') as HTMLElement).textContent = c.name;
    (el.querySelector('.tx span') as HTMLElement).textContent = last ? (last.mine ? 'Tú: ' : '') + last.text : '';
    el.onclick = () => this.show('chat', c.id);
    return el;
  }

  private tick() {
    const g = this.game;
    // con mando, al abrir se sueltan las acciones y la cruceta aún pulsada vuelve a contar como
    // pulsación: sin este margen el móvil se abriría y se cerraría en el mismo instante
    if (g.input.pressed('phone') && !(g as any).menuOpen && g.time.real - this.toggledAt > 0.3) {
      this.toggledAt = g.time.real;
      this.toggle();
    }
    if (!this.open) return;
    this.pollPad();
    const h = g.clock.hour;
    this.clock.textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    // redibujar si hay mensajes nuevos (o cada segundo para ofertas que caducan)
    if (this.msgs && (this.msgs.version !== this.drawnVersion || g.time.frame % 60 === 0) && (this.screen === 'chats' || this.screen === 'chat' || this.screen === 'home')) this.render();
  }

  update() {
    this.tick();
  }
  pausedUpdate() {
    if (this.open) this.toggle(false);
  }
}
