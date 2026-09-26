// Mensajes del móvil: conversaciones por contacto. El móvil (interfaz) solo lee esto y llama a las acciones.
import type { Game } from '../core/game';

export interface ChatAction {
  label: string;
  run: () => void;
  /** Se desactiva cuando ya no vale (oferta caducada...). */
  valid?: () => boolean;
  style?: 'si' | 'no';
}

export interface ChatMessage {
  id: number;
  mine: boolean; // lo escribe el jugador
  text: string;
  time: string; // "21:45"
  actions?: ChatAction[];
  used?: boolean;
}

export interface Chat {
  id: string;
  name: string;
  avatar: string;
  messages: ChatMessage[];
  unread: number;
  last: number; // orden (tiempo real del último mensaje)
}

let nextId = 1;

export class Messages {
  readonly chats = new Map<string, Chat>();
  version = 0; // cambia con cada mensaje (para redibujar)

  constructor(private game: Game) {
    game.mod.messages = this;
  }

  clockText(): string {
    const h = this.game.clock.hour;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  /** Mensaje entrante: aparece como notificación y en su conversación. */
  receive(chatId: string, name: string, avatar: string, text: string, actions?: ChatAction[], notify = true): ChatMessage {
    let c = this.chats.get(chatId);
    if (!c) {
      c = { id: chatId, name, avatar, messages: [], unread: 0, last: 0 };
      this.chats.set(chatId, c);
    }
    const m: ChatMessage = { id: nextId++, mine: false, text, time: this.clockText(), actions };
    c.messages.push(m);
    if (c.messages.length > 40) c.messages.shift();
    c.unread++;
    c.last = performance.now();
    this.version++;
    if (notify) {
      this.game.events.emit('notify', {
        title: name,
        text: text.length > 110 ? text.slice(0, 107) + '…' : text,
        icon: avatar,
        from: actions?.length ? 'Tab para contestar' : 'Mensaje',
      });
    }
    return m;
  }

  /** El jugador contesta (queda escrito en la conversación). */
  reply(chatId: string, text: string) {
    const c = this.chats.get(chatId);
    if (!c) return;
    c.messages.push({ id: nextId++, mine: true, text, time: this.clockText() });
    c.last = performance.now();
    this.version++;
  }

  markRead(chatId: string) {
    const c = this.chats.get(chatId);
    if (c && c.unread) {
      c.unread = 0;
      this.version++;
    }
  }

  get unread(): number {
    let n = 0;
    for (const c of this.chats.values()) n += c.unread;
    return n;
  }

  sorted(): Chat[] {
    return [...this.chats.values()].sort((a, b) => b.last - a.last);
  }

  /** Busca la última acción disponible (para abrir el móvil directamente en esa conversación). */
  latestActionable(): { chat: Chat; msg: ChatMessage } | null {
    for (const c of this.sorted()) {
      const a = this.actionableIn(c);
      if (a) return a;
    }
    return null;
  }

  /** El último mensaje de una conversación que aún se puede contestar (aceptar/rechazar), si hay. */
  actionableIn(c: Chat): { chat: Chat; msg: ChatMessage } | null {
    for (let i = c.messages.length - 1; i >= 0; i--) {
      const m = c.messages[i];
      if (m.actions && !m.used && m.actions.some((a) => !a.valid || a.valid())) return { chat: c, msg: m };
    }
    return null;
  }
}
