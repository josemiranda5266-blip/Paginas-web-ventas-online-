/**
 * Application Constants
 */

export const APP_NAME = 'Paginas Web Ventas Online';
export const APP_TAGLINE = 'Plataforma SaaS de Comercio Electrónico Multi-Tenant';

export const ORDER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDIENTE: { label: 'Pendiente', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  CONFIRMADO: { label: 'Confirmado', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  PREPARANDO: { label: 'En Preparación', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  ENVIADO: { label: 'Enviado', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  ENTREGADO: { label: 'Entregado', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  CANCELADO: { label: 'Cancelado', color: 'bg-rose-100 text-rose-800 border-rose-300' },
};

export const STORE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVO: { label: 'Activo', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  PENDIENTE: { label: 'Pendiente', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  SUSPENDIDO: { label: 'Suspendido', color: 'bg-rose-100 text-rose-800 border-rose-300' },
};
