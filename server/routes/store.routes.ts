/**
 * Store & Tenant Routes (Multi-Tenant)
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { requireAuth } from '../middleware/auth.ts';
import { enforceTenantIsolation } from '../middleware/tenant.ts';

export const storeRouter = Router();

// Obtener listado de todas las tiendas activas (directorio público)
storeRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stores = await db.listStores();
    res.json({
      success: true,
      data: stores
        .filter((s) => s.status === 'ACTIVO')
        .map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          description: s.description,
          logo: s.logo,
          banner: s.banner,
          primaryColor: s.primaryColor,
          status: s.status,
        })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al listar tiendas';
    res.status(500).json({ success: false, error: { code: 'STORE_FETCH_ERROR', message } });
  }
});

// Obtener tienda pública completa por slug (incluyendo productos y categorías activos)
storeRouter.get('/by-slug/:slug', async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;
    const store = await db.findStoreBySlug(slug);

    if (!store) {
      res.status(404).json({
        success: false,
        error: { code: 'STORE_NOT_FOUND', message: 'La tienda solicitada no existe.' },
      });
      return;
    }

    // Filtrar categorías y productos de esta tienda únicamente (Aislamiento de catálogo)
    const categories = await db.findCategoriesByStore(store.id, { onlyActive: true });
    const products = await db.findProductsByStore(store.id, { onlyActive: true });

    res.json({
      success: true,
      data: {
        store: {
          id: store.id,
          slug: store.slug,
          name: store.name,
          description: store.description,
          logo: store.logo,
          banner: store.banner,
          phone: store.phone,
          email: store.email,
          address: store.address,
          schedule: store.schedule,
          primaryColor: store.primaryColor,
          secondaryColor: store.secondaryColor,
          status: store.status,
          settings: store.settings,
          mercadoPagoConnected: Boolean(store.mercadoPago?.active),
        },
        categories,
        products,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al obtener tienda';
    res.status(500).json({ success: false, error: { code: 'STORE_FETCH_ERROR', message } });
  }
});

// Obtener datos de la tienda por storeId (Admin del comercio o SuperAdmin)
storeRouter.get('/:storeId', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const store = await db.findStoreById(storeId);

    if (!store) {
      res.status(404).json({
        success: false,
        error: { code: 'STORE_NOT_FOUND', message: 'Comercio no encontrado.' },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        ...store,
        mercadoPagoConnected: Boolean(store.mercadoPago?.active),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al obtener comercio';
    res.status(500).json({ success: false, error: { code: 'STORE_FETCH_ERROR', message } });
  }
});

// Actualizar configuración de la tienda (Admin del comercio o SuperAdmin)
storeRouter.put('/:storeId/settings', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const store = await db.findStoreById(storeId);

    if (!store) {
      res.status(404).json({
        success: false,
        error: { code: 'STORE_NOT_FOUND', message: 'Comercio no encontrado.' },
      });
      return;
    }

    const { name, description, phone, email, address, schedule, primaryColor, secondaryColor, settings } = req.body;

    const updated = await db.updateStore(storeId, {
      name,
      description,
      phone,
      email,
      address,
      schedule,
      primaryColor,
      secondaryColor,
      settings,
    });

    // Registrar auditoría
    await db.logAudit({
      storeId,
      userId: req.user?.id,
      action: 'STORE_SETTINGS_UPDATE',
      entity: 'Store',
      entityId: storeId,
      details: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al actualizar configuración';
    res.status(500).json({ success: false, error: { code: 'STORE_UPDATE_ERROR', message } });
  }
});

// Obtener detalles de la suscripción SaaS del comercio (0% comisión en ventas)
storeRouter.get('/:storeId/subscription', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    let sub = await db.getSubscription(storeId);

    if (!sub) {
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

      sub = await db.prisma.subscription.create({
        data: {
          storeId,
          planName: 'Plan Comercio Pro (Fijo)',
          amount: 15000,
          currency: 'ARS',
          status: 'ACTIVE',
          interval: 'MONTHLY',
          commissionRate: 0.0,
          currentPeriodStart: new Date(),
          currentPeriodEnd: thirtyDaysLater,
          cancelAtPeriodEnd: false,
        },
      });
    }

    res.json({
      success: true,
      data: sub,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error consultando suscripción';
    res.status(500).json({ success: false, error: { code: 'SUB_FETCH_ERROR', message } });
  }
});

// Obtener estadísticas métricas del comercio (para el panel del administrador del comercio)
storeRouter.get('/:storeId/stats', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;

    const storeOrders = await db.findOrdersByStore(storeId);
    const storeProducts = await db.findProductsByStore(storeId);
    
    const totalSales = storeOrders
      .filter((o) => o.status !== 'CANCELADO')
      .reduce((sum, o) => sum + Number(o.total), 0);

    const pendingOrders = storeOrders.filter((o) => o.status === 'PENDIENTE').length;
    const confirmedOrders = storeOrders.filter((o) => o.status === 'CONFIRMADO' || o.status === 'PREPARANDO' || o.status === 'ENVIADO').length;
    const lowStockProducts = storeProducts.filter((p) => p.stock <= p.minStock).length;

    res.json({
      success: true,
      data: {
        totalOrders: storeOrders.length,
        totalSales,
        pendingOrders,
        confirmedOrders,
        totalProducts: storeProducts.length,
        lowStockProducts,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error obteniendo métricas del comercio';
    res.status(500).json({ success: false, error: { code: 'STATS_FETCH_ERROR', message } });
  }
});
