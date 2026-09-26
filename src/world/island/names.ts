// Nombres inventados (y con guasa) para tiendas, anuncios, chalets y empresas. Ninguna marca real.
import { FONT_SERIF, FONT_IMPACT, FONT_SCRIPT, FONT_FUN } from './signs';

export interface ShopDef {
  name: string;
  sub?: string;
  bg: string;
  fg: string;
  font?: string;
  awning?: [string, string];
}

export const SHOPS: ShopDef[] = [
  { name: 'Pizzería Mamma Mía Qué Caro', sub: 'Pizza al peso... del oro', bg: '#c0392b', fg: '#fff6e0', font: FONT_SCRIPT, awning: ['#c0392b', '#f7f4ec'] },
  { name: 'Seguros El Golpe', sub: 'Te cubrimos (a veces)', bg: '#1f4e8c', fg: '#ffffff' },
  { name: 'Gimnasio Músculo Feliz', sub: 'Sudar también es gratis', bg: '#111111', fg: '#ffd23f', font: FONT_IMPACT },
  { name: 'Ferretería El Tornillo Suelto', bg: '#e0a01b', fg: '#2a1e0a' },
  { name: 'Peluquería Pelos Locos', sub: 'Cortes con susto incluido', bg: '#e05aa0', fg: '#ffffff', font: FONT_SCRIPT },
  { name: 'Churrería La Porra Feliz', bg: '#f2c14e', fg: '#6a2c0a', awning: ['#f2a93b', '#f7f4ec'] },
  { name: 'Frutería La Pera Limonera', bg: '#3f9a5a', fg: '#fffbe0', awning: ['#3f9a5a', '#f7f4ec'] },
  { name: 'Panadería Pan Comido', sub: 'Horno de leña y de prisa', bg: '#8a5a3a', fg: '#fff1d6', font: FONT_SERIF },
  { name: 'Farmacia La Aspirina Alegre', bg: '#1e9e5a', fg: '#ffffff' },
  { name: 'Bazar Todo a Cien (Euros)', bg: '#d6312b', fg: '#ffe14a', font: FONT_IMPACT },
  { name: 'Zapatería Pies Para Qué Os Quiero', bg: '#5b3a8a', fg: '#ffffff' },
  { name: 'Óptica Ver Pa Creer', bg: '#ffffff', fg: '#1f4e8c' },
  { name: 'Carnicería El Chuletón Veloz', bg: '#a52a2a', fg: '#ffffff', awning: ['#a52a2a', '#f7f4ec'] },
  { name: 'Pescadería El Boquerón Mosqueado', bg: '#2f7fcf', fg: '#ffffff', awning: ['#2f7fcf', '#f7f4ec'] },
  { name: 'Heladería Polo Norte', sub: 'Frío que te cagas', bg: '#8fd3f0', fg: '#1b3a6b', font: FONT_FUN, awning: ['#f58ab0', '#f7f4ec'] },
  { name: 'Kebab El Sultán del Barrio', bg: '#f2a93b', fg: '#6b1a0a' },
  { name: 'Lavandería La Mancha Rebelde', bg: '#56c1e8', fg: '#0d2a4a' },
  { name: 'Floristería La Maceta Loca', bg: '#f58ab0', fg: '#ffffff', font: FONT_SCRIPT, awning: ['#3f9a5a', '#f7f4ec'] },
  { name: 'Librería El Marcapáginas', bg: '#2a4a3a', fg: '#f3e2b8', font: FONT_SERIF },
  { name: 'Móviles Sin Cobertura', sub: 'Reparamos pantallas y disgustos', bg: '#222a38', fg: '#56e0c8' },
  { name: 'Academia Yes Very Well', sub: 'Inglés para torpes', bg: '#ffffff', fg: '#c0392b' },
  { name: 'Autoescuela El Volantazo', bg: '#ffd23f', fg: '#1b1b1b', font: FONT_IMPACT },
  { name: 'Mercería El Hilo Perdido', bg: '#f3e2b8', fg: '#7a1f2b', font: FONT_SERIF },
  { name: 'Joyería El Brillo Dudoso', bg: '#1b1b1b', fg: '#e8c25a', font: FONT_SERIF },
  { name: 'Tatuajes Tinta y Llanto', bg: '#141414', fg: '#e8394d', font: FONT_IMPACT },
  { name: 'Gestoría El Papeleo Eterno', bg: '#6c7a89', fg: '#ffffff' },
  { name: 'Inmobiliaria Pisos de Papel', sub: 'Vistas al patio de luces', bg: '#ffffff', fg: '#2f6f3a' },
  { name: 'Clínica Dental Muela Feliz', bg: '#e8f6ff', fg: '#1f6fa8' },
  { name: 'Veterinaria Guau Miau', bg: '#f28c28', fg: '#ffffff', font: FONT_FUN },
  { name: 'Chuches La Caries', bg: '#ff6fb5', fg: '#fff45a', font: FONT_FUN, awning: ['#ff6fb5', '#fff45a'] },
  { name: 'Supermercado El Carrito Loco', bg: '#e8394d', fg: '#ffffff', font: FONT_IMPACT },
  { name: 'Videoclub Rebobina', sub: 'Todavía existimos', bg: '#1b2a6b', fg: '#ffd23f', font: FONT_IMPACT },
  { name: 'Relojería La Hora Loca', sub: 'Siempre llegamos tarde', bg: '#2a1e14', fg: '#e8c25a', font: FONT_SERIF },
  { name: 'Colchones El Ronquido', bg: '#4a6fb5', fg: '#ffffff' },
  { name: 'Droguería El Estropajo', bg: '#9fd9b9', fg: '#1d4a33' },
  { name: 'Quiosco El Cotilleo', bg: '#c0392b', fg: '#ffffff' },
  { name: 'Bodega El Tapón Rebelde', bg: '#5a1f2b', fg: '#f3e2b8', font: FONT_SERIF },
  { name: 'Estudio de Yoga Respira Hondo', bg: '#c9b6e8', fg: '#3a2a5a', font: FONT_FUN },
  { name: 'Cafetería El Descafeinado', bg: '#6b4a32', fg: '#fff1d6', font: FONT_SCRIPT },
  { name: 'Tienda de Disfraces El Ridículo', bg: '#7c4dbb', fg: '#ffd23f', font: FONT_FUN },
];

export const BAR_NAMES = [
  { name: 'Bar Casa Paco', sub: 'Tapas, cañas y chismes' },
  { name: 'Taberna El Botijo Alegre', sub: 'Vermú de grifo desde 1987' },
  { name: 'Bar El Descanso del Repartidor', sub: 'Aparca donde puedas' },
  { name: 'Bodeguilla La Resaca', sub: 'Mañana más' },
];

export const ADS: { title: string; sub: string; bg: string; fg: string; accent: string; icon: string }[] = [
  { title: 'Seguros El Golpe', sub: '¿Un choque? ¡Qué suerte, cliente!', bg: '#1f4e8c', fg: '#ffffff', accent: '#ffd23f', icon: 'coche' },
  { title: 'Pizzería Mamma Mía Qué Caro', sub: 'Pizza familiar: hipoteca aparte', bg: '#c0392b', fg: '#fff6e0', accent: '#3f9a5a', icon: 'pizza' },
  { title: 'Gimnasio Músculo Feliz', sub: 'Primer mes: sufres gratis', bg: '#111111', fg: '#ffd23f', accent: '#e8394d', icon: 'pesa' },
  { title: 'Radio Paquete FM', sub: '104.5 · La radio que se entrega', bg: '#7c4dbb', fg: '#ffffff', accent: '#ff6fb5', icon: 'radio' },
  { title: 'Autoescuela El Volantazo', sub: 'Aprobado o te devolvemos el susto', bg: '#ffd23f', fg: '#1b1b1b', accent: '#e8394d', icon: 'volante' },
  { title: 'Abogados Pleito y Asociados', sub: 'Si hay golpe, hay pasta', bg: '#2a2a2a', fg: '#e8c25a', accent: '#e8c25a', icon: 'balanza' },
  { title: 'Crema Solar Vuelta y Vuelta', sub: 'Para quedarte al punto', bg: '#f2a93b', fg: '#6b1a0a', accent: '#ffffff', icon: 'sol' },
  { title: 'Grúas El Enganche', sub: 'Mal aparcado = bien cobrado', bg: '#e8a01b', fg: '#1b1b1b', accent: '#1b1b1b', icon: 'grua' },
  { title: 'Helados Polo Norte', sub: 'Frío de verdad, no como tu ex', bg: '#8fd3f0', fg: '#1b3a6b', accent: '#f58ab0', icon: 'helado' },
  { title: 'Colchones El Ronquido', sub: 'Dormirás como un tronco (con serrín)', bg: '#4a6fb5', fg: '#ffffff', accent: '#ffd23f', icon: 'luna' },
  { title: 'Contra Reembolso', sub: 'Si no pagas, no hay paquete', bg: '#ffd23f', fg: '#1b1030', accent: '#e8394d', icon: 'caja' },
  { title: 'Refrescos Burbuja Loca', sub: 'Eructos garantizados', bg: '#e8394d', fg: '#ffffff', accent: '#56c1e8', icon: 'lata' },
];

export const CHALET_NAMES = [
  'Villa Mimosa', 'Villa Pepa', 'Villa Tranquila', 'Villa Chismes', 'Villa Paquita', 'Casa Buganvilla', 'Villa Resaca',
  'Villa Hipoteca', 'Villa Casi Vistas al Mar', 'Villa Siesta', 'Villa Mari Loli', 'Villa Pompón', 'Villa Tupper',
  'Villa Cotilla', 'Villa Mojito', 'Villa Aquí Mando Yo', 'Villa No Molestar', 'Villa Rulos', 'Villa Chanclas',
  'Villa Remanso', 'Villa Botijo', 'Villa Me Lo Merezco', 'Villa Jubilación', 'Villa Gazpacho', 'Villa Flamenca',
  'Villa Loro', 'Villa Tortilla', 'Villa Olé', 'Villa Sin Hipoteca', 'Villa Pijama', 'Villa Croqueta', 'Villa Cuñado',
  'Villa Lotería', 'Villa Chiringuito', 'Villa Abanico', 'Villa Bata', 'Villa Pantuflas', 'Villa Merengue',
  'Villa Sobremesa', 'Villa Persiana', 'Villa Ventilador', 'Villa Butano', 'Villa Palmito', 'Villa Pachanga',
  'Villa Fiesta', 'Villa Envidia', 'Villa Barbacoa', 'Villa Petanca', 'Villa Maruja', 'Villa Jacuzzi',
  'Villa Churumbel', 'Villa Arrocito', 'Villa Chaparrón', 'Villa Veraneo', 'Villa Chupito', 'Villa Canapé',
];

export const NAVE_COMPANIES: { name: string; sub: string; bg: string; fg: string }[] = [
  { name: 'PALÉS PACO', sub: 'Palés nuevos, usados y rotos', bg: '#1f4e8c', fg: '#ffffff' },
  { name: 'CARRETILLAS MANOLI', sub: 'Elevamos tu negocio (un metro)', bg: '#e8a01b', fg: '#1b1b1b' },
  { name: 'CONGELADOS EL PINGÜINO', sub: 'Frío industrial', bg: '#56c1e8', fg: '#0d2a4a' },
  { name: 'MADERAS EL TABLÓN', sub: 'Serrería y bricolaje', bg: '#8a5a3a', fg: '#fff1d6' },
  { name: 'RECAMBIOS LA TUERCA', sub: 'Tenemos la pieza que te falta', bg: '#c0392b', fg: '#ffffff' },
  { name: 'TRANSPORTES LENTITUD', sub: 'Llegamos. Algún día.', bg: '#3f7d4a', fg: '#ffffff' },
  { name: 'CARTONAJES LA CAJA FELIZ', sub: 'Cajas para tus cajas', bg: '#c9a46a', fg: '#3a2a14' },
  { name: 'PLÁSTICOS BURBUJA', sub: 'Plástico de burbujas para explotar', bg: '#ffffff', fg: '#2f7fcf' },
  { name: 'HIERROS OXIDADO E HIJOS', sub: 'Chatarra con solera', bg: '#6c4a3a', fg: '#f3e2b8' },
  { name: 'NEUMÁTICOS EL PINCHAZO', sub: 'Cambio de ruedas en 5 minutos (o 50)', bg: '#1b1b1b', fg: '#ffd23f' },
  { name: 'ENVASES EL TAPÓN', sub: 'Tapamos lo que haga falta', bg: '#7c4dbb', fg: '#ffffff' },
  { name: 'ALMACENES EL TRASTERO', sub: 'Guardamos lo que tu suegra no quiere', bg: '#e8394d', fg: '#ffffff' },
];

export const PLAZA_NAME = 'Plaza del Reembolso';
