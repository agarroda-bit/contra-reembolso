// Tipos compartidos entre el casino y sus juegos.
import type { Game } from '../../core/game';
import type { Cartera, Humor, Juego } from './comun';
import type { SonidoCasino } from './sonido';

/** Lo que el casino ofrece a cada juego. */
export interface CtxCasino {
  game: Game;
  cartera: Cartera;
  sonido: SonidoCasino;
  /** El crupier de la pantalla actual dice algo. */
  decir(texto: string, humor?: Humor): void;
  /** Confeti: cantidad de papelitos (y punto de salida opcional en píxeles de pantalla). */
  confeti(cuantos: number, x?: number, y?: number): void;
  /** Luces de fiesta durante `ms`. */
  fiesta(ms: number): void;
  /** Destello morado (Los Devueltos). */
  susto(): void;
  /** Repinta el dinero de la barra. */
  refrescar(): void;
  /** Cambia las teclas del pie. */
  teclas(html: string): void;
  /** Ir a otra pantalla. */
  ir(p: 'vestibulo' | Juego): void;
  /** Escala actual de la escena (para canvas nítidos). */
  escala(): number;
}

/** Una pantalla del casino (vestíbulo o juego). */
export interface PantallaCasino {
  readonly el: HTMLElement;
  readonly titulo: string;
  /** Hay una jugada en marcha (no se puede salir). */
  ocupado(): boolean;
  /** Lo que dice el crupier si intentas salir a mitad de jugada (opcional). */
  avisoOcupado?(): string;
  /** Tecla pulsada: devuelve true si la ha usado. */
  tecla(e: KeyboardEvent): boolean;
  tick(dt: number): void;
  /** Termina ya la jugada en curso (cierre forzado): paga lo que toque, sin animaciones. */
  resolverYa(): void;
  destruir(): void;
  /** La escena ha cambiado de escala. */
  redimensionar?(escala: number): void;
}
