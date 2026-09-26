// Modo foto (tecla K): congela el juego, esconde la interfaz y deja mover la cámara alrededor
// del repartidor. Se puede cambiar la hora del día, poner pose y guardar la foto.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { CharacterPose } from '../core/contracts';

const POSES: [CharacterPose, string][] = [
  ['normal', 'Normal'], ['dance', 'Bailando'], ['hands_up', 'Manos arriba'], ['phone', 'Con el móvil'], ['sit', 'Sentado'], ['stunned', 'Mareado'],
];

export class PhotoMode implements System {
  name = 'photoMode';
  active = false;
  private panel: HTMLDivElement;
  private yaw = 0;
  private pitch = 0.15;
  private dist = 5;
  private drag = false;
  private target = new THREE.Vector3();
  private poseIdx = 0;
  private hudWas = true;
  private hourWas = 12;

  constructor(private game: Game) {
    game.mod.photo = this;
    this.panel = document.createElement('div');
    this.panel.style.cssText =
      'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:58;display:none;gap:8px;align-items:center;pointer-events:auto;' +
      'background:rgba(27,16,48,.88);border:3px solid #ffd23f;border-radius:18px;padding:10px 14px;font:800 15px system-ui;color:#fff;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px)';
    game.ui.appendChild(this.panel);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyK' && !(game as any).menuOpen && !game.mod.phone?.open) {
        if (this.active) this.exit();
        else if (!game.paused && game.mod.player?.state !== 'dead') this.enter();
      } else if (this.active && e.code === 'Escape') {
        e.stopPropagation();
        this.exit();
      }
    }, true);
    const cv = game.renderer.domElement;
    cv.addEventListener('mousedown', () => this.active && (this.drag = true));
    window.addEventListener('mouseup', () => (this.drag = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.active || !this.drag) return;
      this.yaw -= e.movementX * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.pitch + e.movementY * 0.004, -0.2, 1.3);
    });
    window.addEventListener('wheel', (e) => {
      if (!this.active) return;
      this.dist = THREE.MathUtils.clamp(this.dist + Math.sign(e.deltaY) * 0.6, 1.5, 25);
    }, { passive: true });
  }

  private button(text: string, fn: () => void) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'font:800 15px system-ui;border:2px solid #1b1030;border-radius:10px;background:#ffd23f;color:#1b1030;padding:7px 11px;cursor:pointer';
    b.onclick = (e) => {
      e.stopPropagation();
      fn();
    };
    this.panel.appendChild(b);
    return b;
  }

  enter() {
    const g = this.game;
    this.active = true;
    this.poseIdx = 0; // al salir se vuelve a la pose normal
    g.paused = true;
    g.input.exitPointerLock();
    this.hudWas = g.hud.visible;
    g.hud.visible = false;
    this.hourWas = g.clock.hour;
    const p = g.mod.player;
    this.target.copy(p.state === 'vehicle' && g.mod.vehicles?.current ? g.mod.vehicles.current.getPosition(new THREE.Vector3()) : p.position);
    this.target.y += 1.1;
    this.yaw = (g.mod.cameraRig?.yaw ?? 0);
    this.panel.innerHTML = '<span>📸 MODO FOTO · arrastra para girar, rueda para acercar</span>';
    // los botones dicen lo que hay puesto (hora y pose), no solo lo que hacen
    const hourLabel = () => `🌅 Hora: ${String(Math.floor(g.clock.hour)).padStart(2, '0')}:${String(Math.floor((g.clock.hour % 1) * 60)).padStart(2, '0')}`;
    const hourBtn = this.button(hourLabel(), () => {
      const hours = [8, 12, 17, 19.5, 20.5, 23];
      const i = hours.findIndex((h) => h > g.clock.hour + 0.1);
      g.clock.hour = hours[i < 0 ? 0 : i];
      g.mod.dayNight?.setHour?.(g.clock.hour);
      // un paso de actualización del cielo sin mover el juego
      for (const s of g.systems) if (s.name === 'dayNight') s.update?.(0.0001);
      hourBtn.textContent = hourLabel();
    });
    const poseLabel = () => `🕺 Pose: ${POSES[this.poseIdx][1]}`;
    const poseBtn = this.button(poseLabel(), () => {
      this.poseIdx = (this.poseIdx + 1) % POSES.length;
      const pl = g.mod.player;
      pl.pose = POSES[this.poseIdx][0];
      pl.rig?.update(0.5, { speed: 0, grounded: true, pose: pl.pose });
      poseBtn.textContent = poseLabel();
    });
    this.button('💾 Guardar foto', () => this.snap());
    this.button('✕ Salir (K o Esc)', () => this.exit());
    this.panel.style.display = 'flex';
    g.events.emit('photo:enter' as any, {} as any);
  }

  exit() {
    const g = this.game;
    this.active = false;
    this.panel.style.display = 'none';
    g.paused = false;
    g.hud.visible = this.hudWas;
    const pl = g.mod.player;
    if (pl && pl.state === 'foot') pl.pose = 'normal';
  }

  private snap() {
    const g = this.game;
    this.panel.style.visibility = 'hidden';
    g.renderer.render(g.scene, g.camera);
    try {
      const url = g.renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `contra-reembolso-${Date.now()}.png`;
      a.click();
      g.events.emit('photo:taken' as any, {} as any);
    } catch {
      /* navegador sin permiso */
    }
    this.panel.style.visibility = 'visible';
    g.mod.audio?.play('pop');
  }

  pausedUpdate(realDt: number) {
    if (!this.active) return;
    const g = this.game;
    const cam = g.camera;
    const cp = Math.cos(this.pitch);
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    cam.lookAt(this.target);
    // animación de la pose (el juego está en pausa, pero el muñeco se mueve)
    const pl = g.mod.player;
    if (pl?.rig && pl.state === 'foot') pl.rig.update(realDt, { speed: 0, grounded: true, pose: pl.pose });
  }
}
