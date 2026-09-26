// Mensajes que aparecen y se van: notificaciones del móvil, toasts, cartel del barrio y dinero que salta.
import { esc, formatMoney } from './format';

const NOTIF_MAX = 3;
const NOTIF_TIME = 5000;
const TOAST_TIME = 2500;
const DISTRICT_TIME = 3000;

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
  /** Límite inferior (px) para la pila de notificaciones: lo fija el HUD (encima del arma/vehículo). */
  bottomLimit: () => number = () => window.innerHeight - 20;
  appName = 'Paquetín';
  private count = 0;

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
    // si no caben encima del panel de abajo a la derecha, se van las más antiguas
    // (todo en px de pantalla con getBoundingClientRect: vale también con el zoom de pantallas pequeñas)
    const limit = this.bottomLimit();
    const top = this.notifList.getBoundingClientRect().top;
    const n = Math.min(NOTIF_MAX, live.length);
    for (let i = 1; i < n; i++) {
      if (live[i].getBoundingClientRect().bottom > limit && top + 1 < limit) {
        for (let k = i; k < n; k++) this.dismiss(live[k]);
        break;
      }
    }
    window.setTimeout(() => this.dismiss(card), NOTIF_TIME);
  }

  private dismiss(card: HTMLElement) {
    if (card.classList.contains('hud-notif--sale')) return;
    card.classList.add('hud-notif--sale');
    window.setTimeout(() => card.remove(), 420);
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
    const el = div('hud-toast');
    el.innerHTML = `<span class="hud-toast__texto">${esc(p.text)}</span>`;
    if (p.color) el.style.setProperty('--toast-color', p.color);
    this.toastBox.appendChild(el);
    this.toastEl = el;
    const ms = Math.max(600, p.time != null ? p.time * 1000 : TOAST_TIME);
    this.toastTimer = window.setTimeout(() => this.endToast(), this.toastQueue.length ? Math.min(ms, 1100) : ms);
  }

  private endToast() {
    const el = this.toastEl;
    if (!el) return;
    this.toastEl = null;
    el.classList.add('hud-toast--sale');
    window.setTimeout(() => el.remove(), 300);
    window.setTimeout(() => this.nextToast(), 120);
  }

  // ───────────── Cartel del barrio (título de película) ─────────────
  district(name: string, color: string) {
    window.clearTimeout(this.districtTimer);
    this.districtBox.innerHTML = `
      <div class="hud-barrio__cartel">
        <div class="hud-barrio__arriba">Puerto Paquete</div>
        <div class="hud-barrio__nombre">${esc(name)}</div>
        <div class="hud-barrio__linea"></div>
      </div>`;
    (this.districtBox.firstElementChild as HTMLElement).style.setProperty('--barrio-color', color);
    this.districtTimer = window.setTimeout(() => {
      this.districtBox.innerHTML = '';
    }, DISTRICT_TIME);
  }

  // ───────────── Dinero que salta ─────────────
  money(delta: number, reason?: string) {
    if (!delta) return;
    const el = div('hud-salto ' + (delta > 0 ? 'hud-salto--mas' : 'hud-salto--menos'));
    el.innerHTML = `<span class="hud-salto__cifra">${formatMoney(delta, true)}</span>${reason ? `<span class="hud-salto__motivo">${esc(reason)}</span>` : ''}`;
    this.moneyBox.appendChild(el);
    while (this.moneyBox.childElementCount > 4) this.moneyBox.firstElementChild!.remove();
    window.setTimeout(() => el.remove(), 1900);
  }
}

function div(cls: string) {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}
