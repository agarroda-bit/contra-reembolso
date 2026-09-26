// Opciones del jugador (se guardan en localStorage).
export type Quality = 'baja' | 'media' | 'alta';

export interface Settings {
  quality: Quality;
  sensitivity: number; // 0.2 .. 3
  invertY: boolean;
  volMaster: number; // 0..1
  volMusic: number;
  volSfx: number;
  fov: number; // 55..90
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'media',
  sensitivity: 1,
  invertY: false,
  volMaster: 0.8,
  volMusic: 0.6,
  volSfx: 0.8,
  fov: 70,
};

export interface QualityPreset {
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  drawDistance: number; // metros hasta la niebla total
  density: number; // multiplicador de tráfico y peatones
  maxLights: number; // luces reales de farola cerca del jugador
}

export const QUALITY: Record<Quality, QualityPreset> = {
  baja: { pixelRatio: 0.75, shadows: false, shadowMapSize: 512, drawDistance: 170, density: 0.5, maxLights: 0 },
  media: { pixelRatio: 1, shadows: true, shadowMapSize: 1024, drawDistance: 240, density: 0.8, maxLights: 2 },
  alta: { pixelRatio: 1.5, shadows: true, shadowMapSize: 2048, drawDistance: 330, density: 1, maxLights: 4 },
};

const KEY = 'contra-reembolso:opciones';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* sin localStorage */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sin localStorage */
  }
}
