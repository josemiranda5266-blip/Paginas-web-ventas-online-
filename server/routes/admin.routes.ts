/**
 * Admin Routes (SuperAdmin & Platform Management)
 * - Gestión global de tiendas (crear, suspender, activar)
 * - Gestión de suscripciones SaaS (0% de comisión en ventas)
 * - Registros de auditoría (Audit Logs)
 * - Métricas globales de la plataforma
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.ts';

export const adminRouter = Router();

// Todas las rutas de admin requieren autenticación de SUPERADMIN
adminRouter.use(requireAuth, requireSuperAdmin);

// Obtener estadísticas métricas globales de la plataforma SaaS
adminRouter.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stores = await db.listStores();
    const users = await db.listUsers();
    const subscriptions = await db.listSubscriptions();
    const auditLogs = await db.listAuditLogs(10);

    const activeStores = stores.filter((s) => s.status === 'ACTIVO').length;
    const suspendedStores = stores.filter((s) => s.status === 'SUSPENDIDO').length;

    let totalGlobalSales = 0;
    let totalGlobalOrders = 0;

    for (const store of stores) {
      const storeOrders = await db.findOrdersByStore(store.id);
      totalGlobalOrders += storeOrders.length;
      totalGlobalSales += storeOrders
        .filter((o) => o.status !== 'CANCELADO')
        .reduce((sum, o) => sum + Number(o.total), 0);
    }

    res.json({
      success: true,
      data: {
        totalStores: stores.length,
        activeStores,
        suspendedStores,
        totalUsers: users.length,
        totalOrders: totalGlobalOrders,
        totalSales: totalGlobalSales,
        subscriptionsCount: subscriptions.length,
        recentAuditsCount: auditLogs.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error obteniendo estadísticas globales';
    res.status(500).json({ success: false, error: { code: 'ADMIN_STATS_ERROR', message } });
  }
});

// Listar todas las tiendas de la plataforma
adminRouter.get('/stores', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stores = await db.listStores();
    res.json({
      success: true,
      data: stores.map((s) => ({
        ...s,
        productsCount: s._count?.products || 0,
        ordersCount: s._count?.orders || 0,
        mercadoPagoConnected: Boolean(s.mercadoPago?.active),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error listando tiendas';
    res.status(500).json({ success: false, error: { code: 'ADMIN_STORES_ERROR', message } });
  }
});

// Crear nuevo comercio / tenant en la plataforma
adminRouter.post('/stores', async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug, name, description, email, phone, address, primaryColor, secondaryColor, settings } = req.body;

    if (!slug || !name || !email) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Slug, nombre y email del comercio son obligatorios.' },
      });
      return;
    }

    const existing = await db.findStoreBySlug(slug);
    if (existing) {
      res.status(400).json({
        success: false,
        error: { code: 'SLUG_ALREADY_EXISTS', message: 'El identificador (slug) ya está en uso por otro comercio.' },
      });
      return;
    }

    const newStore = await db.createStore({
      slug,
      name,
      description,
      email,
      phone,
      address,
      primaryColor,
      secondaryColor,
      settings,
    });

    await db.logAudit({
      userId: req.user?.id,
      storeId: newStore.id,
      action: 'STORE_CREATE_ADMIN',
      entity: 'Store',
      entityId: newStore.id,
      details: { name: newStore.name, slug: newStore.slug },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: newStore });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error creando comercio';
    res.status(500).json({ success: false, error: { code: 'STORE_CREATE_ERROR', message } });
  }
});

// Actualizar estado de la tienda (Activar / Suspender)
adminRouter.patch('/stores/:storeId/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const { status } = req.body;

    if (status !== 'ACTIVO' && status !== 'SUSPENDIDO') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Estado inválido. Debe ser ACTIVO o SUSPENDIDO.' },
      });
      return;
    }

    const updated = await db.updateStore(storeId, { status });

    await db.logAudit({
      userId: req.user?.id,
      storeId,
      action: 'STORE_STATUS_CHANGE',
      entity: 'Store',
      entityId: storeId,
      details: { newStatus: status },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error actualizando estado de tienda';
    res.status(404).json({ success: false, error: { code: 'STORE_NOT_FOUND', message } });
  }
});

// Listar suscripciones SaaS de todos los comercios
adminRouter.get('/subscriptions', async (_req: Request, res: Response): Promise<void> => {
  try {
    const subs = await db.listSubscriptions();
    res.json({ success: true, data: subs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error listando suscripciones';
    res.status(500).json({ success: false, error: { code: 'SUBS_LIST_ERROR', message } });
  }
});

// Actualizar suscripción SaaS de un comercio
adminRouter.put('/subscriptions/:storeId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const { planName, amount, status } = req.body;

    const updated = await db.updateSubscription(storeId, {
      planName,
      amount: amount !== undefined ? Number(amount) : undefined,
      status,
    });

    await db.logAudit({
      userId: req.user?.id,
      storeId,
      action: 'SUBSCRIPTION_UPDATE',
      entity: 'Subscription',
      entityId: storeId,
      details: { planName, amount, status },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error actualizando suscripción';
    res.status(500).json({ success: false, error: { code: 'SUBS_UPDATE_ERROR', message } });
  }
});

// Listar registros de auditoría del sistema
adminRouter.get('/audit-logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const logs = await db.listAuditLogs(limit);
    res.json({ success: true, data: logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error listando auditoría';
    res.status(500).json({ success: false, error: { code: 'AUDIT_LIST_ERROR', message } });
  }
});

// Listar todos los usuarios de la plataforma
adminRouter.get('/users', async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await db.listUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error listando usuarios';
    res.status(500).json({ success: false, error: { code: 'USERS_LIST_ERROR', message } });
  }
});
