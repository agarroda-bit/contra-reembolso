// Mensajes que aparecen y se van: notificaciones del móvil, toasts, cartel del barrio y dinero que salta.
import { esc, formatMoney } from './format';

const NOTIF_MAX = 3;
const NOTIF_TIME = 5000;
const TOAST_TIME = 2500;
/** Lo que dura el cartel del barrio (debe coincidir con la animación hud-barrio de hud.css). */
const DISTRICT_TIME = 2600;
/** Un barrio no se vuelve a anunciar si se anunció hace menos de esto (bordes entre barrios). */
const DISTRICT_REPEAT_MS = 30000;

interface Toast { text: string; color?: string; time?: number }

export class Notifications {
  readonly notifList: HTMLElement;
  readonly toastBox: HTMLElement;
  readonly districtBox: HTMLElement;
  readonly moneyBox: HTMLElement;

  private toastQueue: Toast[] = [];
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;
  private districtTimer = 0;
  private districtUntil = 0;
  private districtShown = new Map<string, number>();
  /** Límite inferior (px) para la pila de notificaciones: lo fija el HUD (encima del arma/vehículo). */
  bottomLimit: () => number = () => window.innerHeight - 20;
  appName = 'Paquetín';
  private count = 0;
  /** Temporizadores pendientes (para limpiarlos en dispose). */
  private timers = new Set<number>();

  constructor() {
    this.notifList = div('hud-notifs');
    this.toastBox = div('hud-toasts');
    this.districtBox = div('hud-barrio');
    this.moneyBox = div('hud-dinero-saltos');
  }

  // ───────────── Notificaciones del móvil ─────────────
  notify(p: { title: string; text: string; icon?: string; from?: string }) {
    // color de la sombra fijo por tarjeta (rosa, turquesa, amarillo...), no cambia al apilar
    const card = div('hud-notif hud-notif--c' + (this.count++ % 3));
    const icon = p.icon || '💬';
    card.innerHTML = `
      <div class="hud-notif__icono"><span class="cr-emoji">${esc(icon)}</span></div>
      <div class="hud-notif__cuerpo">
        <div class="hud-notif__cabecera"><span class="hud-notif__app">${esc(this.appName)}</span>${p.from ? `<span class="hud-notif__de">${esc(p.from)}</span>` : ''}<span class="hud-notif__hora">ahora</span></div>
        <div class="hud-notif__titulo">${esc(p.title)}</div>
        ${p.text ? `<div class="hud-notif__texto">${esc(p.text)}</div>` : ''}
      </div>`;
    // la más nueva arriba
    this.notifList.prepend(card);
    const live = [...this.notifList.children].filter((c) => !c.classList.contains('hud-notif--sale')) as HTMLElement[];
    for (let i = NOTIF_MAX; i < live.length; i++) this.dismiss(live[i]);
    this.fit(live);
    this.later(() => this.dismiss(card), NOTIF_TIME);
  }

  /**
   * Si la pila no cabe encima del panel de abajo a la derecha (arma/vehículo), primero se
   * encogen las antiguas (solo cabecera y título) y, si aun así no caben, se van.
   * Todo en px de pantalla (getBoundingClientRect): vale también con el zoom de pantallas pequeñas.
   */
  private fit(live: HTMLElement[]) {
    const n = Math.min(NOTIF_MAX, live.length);
    const list = this.notifList;
    list.classList.remove('hud-notifs--compacta');
    const limit = this.bottomLimit();
    const top = list.getBoundingClientRect().top;
    if (top + 1 >= limit || n < 2) return;
    const overflow = () => live[n - 1].getBoundingClientRect().bottom > limit;
    if (!overflow()) return;
    list.classList.add('hud-notifs--compacta');
    for (let i = 1; i < n; i++) {
      if (live[i].getBoundingClientRect().bottom > limit) {
        for (let k = i; k < n; k++) this.dismiss(live[k]);
        break;
      }
    }
  }

  private dismiss(card: HTMLElement) {
    if (card.classList.contains('hud-notif--sale')) return;
    card.classList.add('hud-notif--sale');
    this.later(() => card.remove(), 420);
  }

  // ───────────── Toast grande ─────────────
  toast(p: Toast) {
    this.toastQueue.push(p);
    if (this.toastQueue.length > 4) this.toastQueue.splice(0, this.toastQueue.length - 4);
    if (!this.toastEl) this.nextToast();
    else {
      // hay uno en pantalla: que se vaya pronto para dejar paso
      window.clearTimeout(this.toastTimer);
      this.toastTimer = window.setTimeout(() => this.endToast(), 650);
    }
  }

  private nextToast() {
    const p = this.toastQueue.shift();
    if (!p) return;
    // los textos largos, más pequeños (y los muy largos, sin mayúsculas: se leen mejor)
    const len = p.text.length;
    const el = div('hud-toast' + (len > 48 ? ' hud-toast--largo hud-toast--frase' : len > 26 ? ' hud-toast--largo' : ''));
    el.innerHTML = `<span class="hud-toast__texto">${esc(p.text)}</span>`;
    if (p.color) el.style.setProperty('--toast-color', p.color);
    this.toastBox.appendChild(el);
    this.toastEl = el;
    const ms = Math.max(600, toastMs(p.time));
    this.toastTimer = window.setTimeout(() => this.endToast(), this.toastQueue.length ? Math.min(ms, 1100) : ms);
  }

  private endToast() {
    const el = this.toastEl;
    if (!el) return;
    this.toastEl = null;
    el.classList.add('hud-toast--sale');
    this.later(() => el.remove(), 300);
    this.later(() => this.nextToast(), 120);
  }

  /** setTimeout que se puede cancelar en dispose. */
  private later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  /** Cancela temporizadores y vacía los mensajes. */
  dispose() {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    window.clearTimeout(this.toastTimer);
    window.clearTimeout(this.districtTimer);
    this.toastQueue.length = 0;
    this.toastEl = null;
    for (const el of [this.notifList, this.toastBox, this.districtBox, this.moneyBox]) el.textContent = '';
  }

  // ───────────── Cartel del barrio (título de película, arriba al centro) ─────────────
  /** Devuelve false si no se ha enseñado (ese barrio ya se anunció hace poco). */
  district(name: string, color: string): boolean {
    const now = performance.now();
    const last = this.districtShown.get(name);
    if (last !== undefined && now - last < DISTRICT_REPEAT_MS) return false;
    this.districtShown.set(name, now);
    window.clearTimeout(this.districtTimer);
    this.districtBox.innerHTML = `
      <div class="hud-barrio__cartel">
        <div class="hud-barrio__arriba">Puerto Paquete</div>
        <div class="hud-barrio__nombre">${esc(name)}</div>
        <div class="hud-barrio__linea"></div>
      </div>`;
    (this.districtBox.firstElementChild as HTMLElement).style.setProperty('--barrio-color', color);
    this.districtUntil = now + DISTRICT_TIME;
    this.districtTimer = window.setTimeout(() => this.clearDistrict(), DISTRICT_TIME);
    return true;
  }

  /** Quita el cartel del barrio ya (al entrar o salir de un interior, al abrir el mapa...). */
  clearDistrict() {
    window.clearTimeout(this.districtTimer);
    this.districtUntil = 0;
    this.districtBox.textContent = '';
  }

  /** true mientras se ve el cartel del barrio. */
  districtVisible(): boolean {
    return performance.now() < this.districtUntil;
  }

  // ───────────── Dinero que salta ─────────────
  money(delta: number, reason?: string) {
    if (!delta) return;
    const el = div('hud-salto ' + (delta > 0 ? 'hud-salto--mas' : 'hud-salto--menos'));
    el.innerHTML = `<span class="hud-salto__cifra">${formatMoney(delta, true)}</span>${reason ? `<span class="hud-salto__motivo">${esc(reason)}</span>` : ''}`;
    this.moneyBox.appendChild(el);
    while (this.moneyBox.childElementCount > 4) this.moneyBox.firstElementChild!.remove();
    this.later(() => el.remove(), 1900);
  }
}

/**
 * Duración del toast en ms. El contrato no dice la unidad de `time`: lo normal son segundos
 * (2.5), pero si alguien pasa milisegundos (2500) también vale. Más de 60 = milisegundos.
 */
function toastMs(time: number | undefined): number {
  if (time == null || !Number.isFinite(time) || time <= 0) return TOAST_TIME;
  return Math.min(15000, time > 60 ? time : time * 1000);
}

function div(cls: string) {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}
