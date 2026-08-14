/**
 * Store & Tenant Routes
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { requireAuth } from '../middleware/auth.ts';
import { enforceTenantIsolation } from '../middleware/tenant.ts';

export const storeRouter = Router();

// Obtener listado de todas las tiendas activas (público o directorio)
storeRouter.get('/', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: db.stores.map((s) => ({
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
});

// Obtener tienda pública completa por slug (incluyendo productos y categorías activos)
storeRouter.get('/by-slug/:slug', (req: Request, res: Response): void => {
  const { slug } = req.params;
  const store = db.stores.find((s) => s.slug === slug);

  if (!store) {
    res.status(404).json({
      success: false,
      error: { code: 'STORE_NOT_FOUND', message: 'La tienda solicitada no existe.' },
    });
    return;
  }

  // Filtrar categorías y productos de esta tienda únicamente (Aislamiento de catálogo)
  const categories = db.categories.filter((c) => c.storeId === store.id && c.active);
  const products = db.products.filter((p) => p.storeId === store.id && p.active);

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
        mercadoPagoConnected: store.mercadoPagoConnected,
      },
      categories,
      products,
    },
  });
});

// Actualizar configuración de la tienda (Admin del comercio o SuperAdmin)
storeRouter.put('/:storeId/settings', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId } = req.params;
  const storeIndex = db.stores.findIndex((s) => s.id === storeId);

  if (storeIndex === -1) {
    res.status(404).json({
      success: false,
      error: { code: 'STORE_NOT_FOUND', message: 'Comercio no encontrado.' },
    });
    return;
  }

  const { name, description, phone, email, address, schedule, primaryColor, secondaryColor, settings } = req.body;

  const current = db.stores[storeIndex];
  db.stores[storeIndex] = {
    ...current,
    name: name ?? current.name,
    description: description ?? current.description,
    phone: phone ?? current.phone,
    email: email ?? current.email,
    address: address ?? current.address,
    schedule: schedule ?? current.schedule,
    primaryColor: primaryColor ?? current.primaryColor,
    secondaryColor: secondaryColor ?? current.secondaryColor,
    settings: {
      ...current.settings!,
      ...(settings || {}),
    },
    updatedAt: new Date().toISOString(),
  };

  res.json({
    success: true,
    data: db.stores[storeIndex],
  });
});

// Obtener detalles de la suscripción SaaS del comercio (0% comisión en ventas)
storeRouter.get('/:storeId/subscription', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId } = req.params;
  let sub = db.subscriptions.find((s) => s.storeId === storeId);

  if (!sub) {
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    sub = {
      id: `sub-${storeId}`,
      storeId,
      planName: 'Plan Comercio Pro (Fijo)',
      amount: 15000,
      currency: 'ARS',
      status: 'ACTIVE',
      interval: 'MONTHLY',
      commissionRate: 0.0,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: thirtyDaysLater.toISOString(),
      cancelAtPeriodEnd: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.subscriptions.push(sub);
  }

  res.json({
    success: true,
    data: sub,
  });
});

// Obtener estadísticas métricas del comercio (para el panel del administrador del comercio)
storeRouter.get('/:storeId/stats', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId } = req.params;

  const storeOrders = db.orders.filter((o) => o.storeId === storeId);
  const storeProducts = db.products.filter((p) => p.storeId === storeId);
  const totalSales = storeOrders
    .filter((o) => o.status !== 'CANCELADO')
    .reduce((sum, o) => sum + o.total, 0);

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
});

