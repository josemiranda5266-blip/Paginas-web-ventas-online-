/**
 * Multi-Tenant Middleware & Isolation Enforcement
 * 
 * Garantiza que:
 * 1. Cada petición identifique el tenant (storeId o slug).
 * 2. Un usuario ADMIN_COMERCIO solo pueda acceder a recursos de SU tienda.
 * 3. Si una tienda está SUSPENDIDA, se bloquee el flujo de checkout.
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';

export function resolveTenant(req: Request, _res: Response, next: NextFunction): void {
  // Extraer storeId o slug de headers o parámetros de ruta
  const headerStoreId = req.headers['x-store-id'] as string;
  const headerSlug = req.headers['x-tenant-slug'] as string;
  const paramSlug = req.params.storeSlug || req.params.slug;
  const paramStoreId = req.params.storeId;

  let storeId = headerStoreId || paramStoreId;

  if (!storeId && (headerSlug || paramSlug)) {
    const slug = headerSlug || paramSlug;
    const store = db.stores.find((s) => s.slug === slug);
    if (store) {
      storeId = store.id;
    }
  }

  // Si el usuario es ADMIN_COMERCIO, su tenant principal es su propio storeId
  if (req.user && req.user.role === 'ADMIN_COMERCIO' && req.user.storeId) {
    storeId = req.user.storeId;
  }

  req.storeId = storeId || undefined;
  next();
}

/**
 * Valida que el usuario tenga autorización para operar sobre el storeId solicitado.
 * Si es SUPERADMIN permite el acceso.
 * Si es ADMIN_COMERCIO, verifica coincidencia estricta con req.user.storeId.
 */
export function enforceTenantIsolation(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida' },
    });
    return;
  }

  // SuperAdmin puede acceder a cualquier tienda
  if (req.user.role === 'SUPERADMIN') {
    next();
    return;
  }

  // Admin de comercio debe coincidir exactamente con el storeId del recurso
  const targetStoreId = req.params.storeId || req.body?.storeId || req.query?.storeId || req.storeId;

  if (req.user.role === 'ADMIN_COMERCIO') {
    if (!req.user.storeId || (targetStoreId && targetStoreId !== req.user.storeId)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'Violación de aislamiento multi-tenant: No tiene permiso para acceder a este comercio.',
        },
      });
      return;
    }
  }

  next();
}

/**
 * Verifica si la tienda está activa antes de procesar operaciones públicas (e.g. checkout).
 */
export function requireActiveStore(req: Request, res: Response, next: NextFunction): void {
  const storeId = req.storeId || req.params.storeId || req.body?.storeId;
  
  if (!storeId) {
    next();
    return;
  }

  const store = db.stores.find((s) => s.id === storeId || s.slug === storeId);
  if (!store) {
    res.status(404).json({
      success: false,
      error: { code: 'STORE_NOT_FOUND', message: 'El comercio solicitado no existe.' },
    });
    return;
  }

  if (store.status === 'SUSPENDIDO') {
    res.status(403).json({
      success: false,
      error: {
        code: 'STORE_SUSPENDED',
        message: 'Esta tienda se encuentra temporalmente suspendida y no acepta pedidos.',
      },
    });
    return;
  }

  next();
}
