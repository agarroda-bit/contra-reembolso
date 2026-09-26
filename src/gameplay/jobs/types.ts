// Tipos de los encargos (paquetes contra reembolso) y de los clientes.
import type * as THREE from 'three';
import type { DistrictId, DeliverySpot } from '../../core/contracts';
import type { LookKind } from '../../actors/looks';

export type PackageType = 'normal' | 'fragil' | 'urgente' | 'sospechoso' | 'pesado';

/** Manías del cliente: cada una es una pequeña escena al entregar. */
export type Quirk =
  | 'none'
  | 'abuela_centimos' // paga en monedas de céntimo y tarda en contarlas
  | 'vecino_banda' // "no estoy, déjaselo al vecino"... y el vecino es de la banda
  | 'cambia_direccion' // cambia la dirección cuando estás llegando
  | 'pijama_perro' // baja en pijama con un perro que te persigue
  | 'no_he_pedido' // dice que no ha pedido nada... y luego sí
  | 'influencer' // te graba mientras entregas
  | 'regatea' // regatea el reembolso
  | 'firmas' // te hace firmar un papel tras otro antes de pagar
  | 'acertijo' // no paga sin que aciertes una adivinanza (propina si aciertas)
  | 'gemelos' // salen dos iguales a la puerta: ¿cuál lo ha pedido?
  | 'timido' // le da vergüenza: tienes que apartarte para que salga a por el paquete
  | 'en_especie' // te ofrece pagar una parte en melones (que curan)
  | 'desconfiado' // agita la caja y te pregunta si la has agitado tú
  | 'baile' // se cobra bailando: pulsa E cuando diga «¡AHORA!»
  | 'moneda' // doble o mitad a cara o cruz
  | 'chistes'; // te cuenta un chiste y espera que te rías

export interface ClientProfile {
  id: string;
  name: string; // nombre visible en el móvil ("Doña Puri")
  avatar: string; // emoji
  look: LookKind;
  quirk: Quirk;
  /** Tipo de paquete que siempre pide (la pastelería, FRÁGIL; el gimnasio, PESADO...). */
  prefers?: PackageType;
  /** Barrios donde suele vivir (si no, cualquiera). */
  districts?: DistrictId[];
  /** Lo que piden (se elige uno). */
  items: string[];
  /** Mensaje de encargo. Variables: {item}, {precio}, {tiempo}, {calle}. */
  ask: string[];
  /** Frases al recibir: perfecto, tarde, roto. */
  happy: string[];
  late: string[];
  broken: string[];
  /** Voz (0.6 grave .. 1.6 aguda). */
  voice: number;
}

export interface JobOffer {
  id: number;
  client: ClientProfile;
  item: string;
  type: PackageType;
  /** Dónde se recoge: la oficina o una tienda. */
  pickupId: string; // id de POI
  pickupPos: THREE.Vector3;
  pickupName: string;
  dest: DeliverySpot;
  pay: number; // reembolso que cobras
  time: number; // segundos de límite
  message: string;
  expires: number; // tiempo de juego en que caduca la oferta
  story?: boolean;
  /** El encargo del tutorial (Doña Puri): el paquete no baja del 90 % (se cobra entero aunque haya golpes). */
  tutorial?: boolean;
}

export type JobState = 'pickup' | 'carry' | 'done' | 'failed';

export interface ActiveJob {
  offer: JobOffer;
  state: JobState;
  integrity: number; // 0..100
  timeLeft: number;
  /** En la furgoneta (vehículo) o en las manos. */
  where: 'none' | 'vehicle' | 'hands';
  vehicleId: number | null;
  color: string;
  /** Destino cambiado por el cliente. */
  redirected?: boolean;
}
