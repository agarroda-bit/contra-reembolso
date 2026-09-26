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

/**
 * Cotilleos: mensajes graciosos de la gente de la isla que llegan de vez en cuando (sin encargo).
 * [id del chat, nombre, avatar, texto]
 */
const GOSSIP: [string, string, string, string][] = [
  ['mama', 'Mamá', '👩‍🦳', '¿Has comido? Te he dejado un táper en el buzón. Si está abierto, es que ha pasado el vecino.'],
  ['mama', 'Mamá', '👩‍🦳', 'Hijo, ¿esto del reparto es un trabajo de verdad? Tu tía Maruja dice que tú eres «emprendedor». Yo no sé qué es eso.'],
  ['mama', 'Mamá', '👩‍🦳', 'Ponte chaqueta, que en la furgoneta hay corriente. Y no corras. Y llámame. Y come.'],
  ['vecinos', 'Grupo de vecinos 🏘️', '🏘️', 'URGENTE: alguien ha aparcado una furgoneta amarilla encima de mis petunias. Sé quién eres.'],
  ['vecinos', 'Grupo de vecinos 🏘️', '🏘️', 'Se ha perdido un gato naranja que responde al nombre de «Mandarino». No responde, en realidad. Es un gato.'],
  ['vecinos', 'Grupo de vecinos 🏘️', '🏘️', 'Recordatorio: la reunión de la comunidad es el jueves. Traed sillas. Y paciencia.'],
  ['spam', 'PREMIOS YA 🎁', '🎁', '¡¡Enhorabuena!! Has ganado un crucero por el Mediterráneo. Para reclamarlo, rema.'],
  ['spam', 'PREMIOS YA 🎁', '🎁', 'Tu paquete no se ha podido entregar. Pulsa aquí para… ah, no, que el repartidor eres tú.'],
  ['jefe', 'El Jefe', '👨‍💼', 'Recuerda: el cliente siempre tiene razón. Salvo cuando no. Que es casi siempre.'],
  ['jefe', 'El Jefe', '👨‍💼', 'He visto la furgoneta. ¿Eso del lateral es una abolladura o un nuevo modelo aerodinámico?'],
  ['radio-macuto', 'Radio Macuto', '📻', 'Última hora: se busca al dueño de una cabra que está haciendo la compra en el súper. Lleva lista.'],
  ['radio-macuto', 'Radio Macuto', '📻', 'El tiempo para hoy: sol, calor y un 80 % de probabilidad de que alguien pite en la rotonda.'],
  ['seguros', 'Seguros El Golpe', '🚗', '¿Un choque? ¡Qué suerte! Contrata hoy y te regalamos un parachoques de cartón.'],
  ['devueltos', 'Los Devueltos', '↩️', 'Bonita furgoneta. Sería una pena que alguien la devolviera… al remitente. 😈'],
  ['devueltos', 'Los Devueltos', '↩️', 'Te hemos visto repartir. Qué estilo más feo. Pero rápido, eso sí. Grrr.'],
  ['carrera', 'El Niño Nitro', '🏎️', 'Ayer te vi conducir. Mi abuela aparca mejor. Y mi abuela no tiene carné.'],
  ['cliente-puri', 'Doña Puri', '👵', 'Hijo, ¿cómo se ponen los dibujitos estos? 🥔🥔 ¿Por qué me salen patatas?'],
  ['banco', 'Banco Hucha 🐷', '🐷', 'Le informamos de que su saldo es… mejor no le informamos. Que tenga un buen día.'],
  ['horoscopo', 'Horóscopo Paquetero', '🔮', 'Hoy los astros dicen: no aceptes paquetes que hagan tic-tac. Número de la suerte: contra reembolso.'],
  ['cliente-fiorella', 'Fiorella (pastelería)', '🎂', '¡Oferta! 2x1 en cruasanes. El segundo es de ayer, pero tiene mucha personalidad.'],
  ['cliente-hacker', 'Lucía_404', '💻', 'te he hackeado el móvil. es broma. o no. ¿por qué tienes 40 fotos de furgonetas?'],
  ['cliente-capitan', 'Capitán Merluza', '⚓', '¡Arrr! Mi loro ha aprendido a decir «reembolso». Ahora no para. Ayuda.'],
];

export class Messages {
  readonly chats = new Map<string, Chat>();
  version = 0; // cambia con cada mensaje (para redibujar)
  /** Cotilleos que ya han salido (no se repiten hasta que salgan todos). */
  private gossipUsed = new Set<number>();

  constructor(private game: Game) {
    game.mod.messages = this;
  }

  /** Un mensaje gracioso de alguien de la isla (lo llama cada pocos minutos el sistema de sucesos). */
  gossip() {
    if (this.gossipUsed.size >= GOSSIP.length) this.gossipUsed.clear();
    const free: number[] = [];
    for (let i = 0; i < GOSSIP.length; i++) if (!this.gossipUsed.has(i)) free.push(i);
    const i = free[Math.floor(Math.random() * free.length)];
    this.gossipUsed.add(i);
    const [id, name, avatar, text] = GOSSIP[i];
    // si ya hay conversación con ese contacto (un cliente), se usa su nombre de siempre
    const c = this.chats.get(id);
    this.receive(id, c?.name ?? name, c?.avatar ?? avatar, text);
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
