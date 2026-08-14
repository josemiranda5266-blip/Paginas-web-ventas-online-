/**
 * Multi-Tenant Middleware & Isolation Enforcement
 * 
 * Garantiza que:
 * 1. Cada petición identifique el tenant (storeId o slug).
 * 2. Un usuario ADMIN_COMERCIO solo pueda acceder a recursos de SU tienda.
 * 3. Si un ADMIN_COMERCIO intenta acceder o alterar datos de otro comercio (BOLA/IDOR), se rechaza con 403.
 * 4. Si una tienda está SUSPENDIDA, se bloquea el flujo de checkout público con 403 STORE_SUSPENDED.
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

  // Si el usuario autenticado es ADMIN_COMERCIO, su storeId autorizado prevalece
  if (req.user && req.user.role === 'ADMIN_COMERCIO' && req.user.storeId) {
    storeId = req.user.storeId;
  }

  req.storeId = storeId || undefined;
  next();
}

/**
 * Valida que el usuario tenga autorización para operar sobre el storeId solicitado.
 * - SUPERADMIN: Acceso global permitido.
 * - ADMIN_COMERCIO: Requiere coincidencia estricta entre req.user.storeId y todos los parámetros del request (params, body, query).
 * - CLIENTE: Denegado en rutas protegidas de administración.
 */
export function enforceTenantIsolation(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida para acceder a este recurso.' },
    });
    return;
  }

  // SuperAdmin tiene acceso a toda la plataforma
  if (req.user.role === 'SUPERADMIN') {
    next();
    return;
  }

  // Cliente no puede realizar acciones de administración de comercio
  if (req.user.role === 'CLIENTE') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Los clientes no tienen permisos administrativos.' },
    });
    return;
  }

  // Admin de comercio: Validar aislamiento estricto
  if (req.user.role === 'ADMIN_COMERCIO') {
    const userStoreId = req.user.storeId;
    if (!userStoreId) {
      res.status(403).json({
        success: false,
        error: { code: 'TENANT_NOT_ASSIGNED', message: 'El usuario no tiene una tienda asignada.' },
      });
      return;
    }

    // Verificar en params
    if (req.params.storeId && req.params.storeId !== userStoreId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'Violación de aislamiento multi-tenant: No tiene permiso para acceder a este comercio.',
        },
      });
      return;
    }

    // Verificar en body si se intenta alterar o asignar otro storeId
    if (req.body && req.body.storeId && req.body.storeId !== userStoreId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'Violación de aislamiento multi-tenant: Intento de alteración de storeId en payload.',
        },
      });
      return;
    }

    // Verificar en query si se solicita filtrar por otro storeId
    if (req.query && req.query.storeId && req.query.storeId !== userStoreId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'Violación de aislamiento multi-tenant: Filtro no autorizado para otro comercio.',
        },
      });
      return;
    }

    // Fijar storeId verificado en request
    req.storeId = userStoreId;
  }

  next();
}

/**
 * Verifica si la tienda está activa antes de procesar operaciones públicas (e.g. checkout).
 */
export function requireActiveStore(req: Request, res: Response, next: NextFunction): void {
  const storeId = req.params.storeId || req.storeId || req.body?.storeId;
  
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
