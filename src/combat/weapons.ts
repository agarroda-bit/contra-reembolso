// Armas: normales y locas. Datos de juego (daño, cadencia, cargador...) y precios de la armería.

export type WeaponId =
  | 'fists' | 'pistol' | 'shotgun' | 'smg' | 'rifle'
  | 'launcher' // lanzapaquetes
  | 'tape' // pistola de cinta de embalar
  | 'fragile' // paquete FRÁGIL explosivo (granada)
  | 'stamp'; // pistola de sellos

export type FireMode = 'hitscan' | 'melee' | 'package' | 'tape' | 'grenade' | 'stamp';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  icon: string;
  slot: 1 | 2 | 3 | 4 | 5;
  mode: FireMode;
  damage: number;
  rate: number; // disparos por segundo
  auto: boolean; // mantener pulsado
  clip: number; // 0 = sin cargador (puños)
  reload: number; // segundos
  spread: number; // radianes (dispersión base)
  pellets: number;
  range: number;
  recoil: number; // patada de cámara
  hold: 'none' | 'pistol' | 'rifle' | 'heavy' | 'throw';
  sound: 'shot_pistol' | 'shot_shotgun' | 'shot_smg' | 'shot_rifle' | 'shot_launcher' | 'shot_tape' | 'shot_stamp' | 'punch' | 'whoosh';
  /** Se puede usar desde el vehículo. */
  driveBy: boolean;
  price: number; // precio del arma en la armería
  ammoPrice: number; // precio de un cargador
  startAmmo: number; // munición que trae al comprarla
  desc: string;
  crazy?: boolean;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists: {
    id: 'fists', name: 'Puños', icon: '👊', slot: 1, mode: 'melee', damage: 18, rate: 2.5, auto: false, clip: 0, reload: 0,
    spread: 0, pellets: 1, range: 1.8, recoil: 0, hold: 'none', sound: 'whoosh', driveBy: false, price: 0, ammoPrice: 0, startAmmo: 0,
    desc: 'Gratis y siempre a mano.',
  },
  pistol: {
    id: 'pistol', name: 'Pistola', icon: '🔫', slot: 2, mode: 'hitscan', damage: 30, rate: 4, auto: false, clip: 12, reload: 1.1,
    spread: 0.012, pellets: 1, range: 70, recoil: 0.035, hold: 'pistol', sound: 'shot_pistol', driveBy: true, price: 400, ammoPrice: 40, startAmmo: 48,
    desc: 'Fiable, ligera y se puede usar conduciendo.',
  },
  stamp: {
    id: 'stamp', name: 'Pistola de sellos', icon: '📮', slot: 2, mode: 'stamp', damage: 6, rate: 2.2, auto: false, clip: 20, reload: 1.3,
    spread: 0.06, pellets: 5, range: 30, recoil: 0.02, hold: 'pistol', sound: 'shot_stamp', driveBy: true, price: 1800, ammoPrice: 60, startAmmo: 60,
    desc: 'Ráfagas de sellos urgentes. Aturden a cualquiera. Franqueo incluido.', crazy: true,
  },
  shotgun: {
    id: 'shotgun', name: 'Escopeta', icon: '💥', slot: 3, mode: 'hitscan', damage: 14, rate: 1.1, auto: false, clip: 6, reload: 2.2,
    spread: 0.075, pellets: 8, range: 32, recoil: 0.11, hold: 'rifle', sound: 'shot_shotgun', driveBy: false, price: 1500, ammoPrice: 60, startAmmo: 24,
    desc: 'Para conversaciones cortas y a poca distancia.',
  },
  tape: {
    id: 'tape', name: 'Pistola de cinta de embalar', icon: '🧻', slot: 3, mode: 'tape', damage: 0, rate: 1.4, auto: false, clip: 8, reload: 1.6,
    spread: 0.01, pellets: 1, range: 40, recoil: 0.03, hold: 'pistol', sound: 'shot_tape', driveBy: false, price: 2200, ammoPrice: 70, startAmmo: 24,
    desc: 'Deja a cualquiera pegado al suelo unos segundos. Precintado profesional.', crazy: true,
  },
  smg: {
    id: 'smg', name: 'Subfusil', icon: '🔫', slot: 4, mode: 'hitscan', damage: 15, rate: 11, auto: true, clip: 30, reload: 1.6,
    spread: 0.035, pellets: 1, range: 55, recoil: 0.022, hold: 'rifle', sound: 'shot_smg', driveBy: true, price: 2600, ammoPrice: 80, startAmmo: 120,
    desc: 'Mucho plomo y poca puntería. Ideal desde la ventanilla.',
  },
  rifle: {
    id: 'rifle', name: 'Fusil', icon: '🎯', slot: 4, mode: 'hitscan', damage: 48, rate: 3.2, auto: true, clip: 20, reload: 2,
    spread: 0.006, pellets: 1, range: 120, recoil: 0.06, hold: 'rifle', sound: 'shot_rifle', driveBy: false, price: 5200, ammoPrice: 120, startAmmo: 80,
    desc: 'Preciso y contundente. Para problemas lejanos.',
  },
  launcher: {
    id: 'launcher', name: 'Lanzapaquetes', icon: '📦', slot: 5, mode: 'package', damage: 30, rate: 2, auto: false, clip: 6, reload: 1.8,
    spread: 0.02, pellets: 1, range: 60, recoil: 0.08, hold: 'heavy', sound: 'shot_launcher', driveBy: false, price: 3000, ammoPrice: 90, startAmmo: 30,
    desc: 'Dispara cajas que rebotan y tumban a la gente. Entrega exprés.', crazy: true,
  },
  fragile: {
    id: 'fragile', name: 'Paquete FRÁGIL', icon: '🎁', slot: 5, mode: 'grenade', damage: 120, rate: 0.8, auto: false, clip: 1, reload: 0.9,
    spread: 0, pellets: 1, range: 30, recoil: 0, hold: 'throw', sound: 'whoosh', driveBy: false, price: 2400, ammoPrice: 150, startAmmo: 5,
    desc: 'Una caja con el cartel de FRÁGIL. No es broma. Explota.', crazy: true,
  },
};

export const WEAPON_ORDER: WeaponId[] = ['fists', 'pistol', 'stamp', 'shotgun', 'tape', 'smg', 'rifle', 'launcher', 'fragile'];
