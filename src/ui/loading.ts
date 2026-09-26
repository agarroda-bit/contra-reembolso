// Pantalla de carga con consejos graciosos.
const TIPS = [
  'Consejo: el cliente siempre tiene razón. Salvo cuando no la tiene, que es casi siempre.',
  'Consejo: un paquete FRÁGIL no se lleva por las escaleras de la Colina a 120 km/h. O sí, pero luego no te quejes.',
  'Consejo: el efectivo que llevas encima no está en el banco. Parece obvio. Los Devueltos cuentan con que se te olvide.',
  'Consejo: si la abuela paga en céntimos, espera. Contar también es un arte.',
  'Consejo: «déjaselo al vecino» es la frase más peligrosa de Puerto Paquete.',
  'Consejo: el taller de pintura del Polígono quita la búsqueda. La policía de aquí se fía mucho de los colores.',
  'Consejo: la furgoneta aguanta de todo. Tu espalda no tanto.',
  'Consejo: robar un coche delante de un policía está feo. Y además sube la búsqueda.',
  'Consejo: si un cliente dice que él no ha pedido nada, espera diez segundos.',
  'Consejo: la cinta de embalar sirve para cerrar cajas y para cerrar discusiones.',
  'Consejo: el perro del cliente en pijama no muerde. Mucho.',
  'Consejo: los paquetes SOSPECHOSOS pagan el triple por algo.',
];

export class LoadingScreen {
  private el = document.getElementById('carga')!;
  private bar = this.el.querySelector('.barra i') as HTMLElement;
  private tip = this.el.querySelector('.consejo') as HTMLElement;
  private status = this.el.querySelector('.estado') as HTMLElement;
  private timer: number;

  constructor() {
    let i = Math.floor(Math.random() * TIPS.length);
    this.tip.textContent = TIPS[i];
    this.timer = window.setInterval(() => {
      i = (i + 1) % TIPS.length;
      this.tip.textContent = TIPS[i];
    }, 4000);
  }

  progress(fraction: number, text?: string) {
    this.bar.style.width = `${Math.round(Math.max(0.05, Math.min(1, fraction)) * 100)}%`;
    if (text) this.status.textContent = text;
  }

  /** Deja que el navegador pinte la barra antes de seguir con trabajo pesado. */
  async step(fraction: number, text: string) {
    this.progress(fraction, text);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  }

  hide() {
    clearInterval(this.timer);
    this.el.style.opacity = '0';
    setTimeout(() => this.el.remove(), 700);
  }

  error(msg: string) {
    clearInterval(this.timer);
    this.tip.textContent = '¡Vaya! Algo ha fallado al cargar: ' + msg;
    this.status.textContent = 'Recarga la página. Si sigue fallando, prueba con Chrome.';
  }
}
