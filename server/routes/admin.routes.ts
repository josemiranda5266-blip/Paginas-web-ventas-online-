/**
 * SuperAdmin Routes
 * Gestión global de comercios, suspensión/activación, planes de suscripción y auditoría.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.ts';
import { Store, StoreStatus } from '../../src/types/index.ts';

export const adminRouter = Router();

// Todas las rutas de admin requieren SuperAdmin autenticado
adminRouter.use(requireAuth, requireSuperAdmin);

// Métricas globales de la plataforma SaaS
adminRouter.get('/stats', (_req: Request, res: Response): void => {
  const totalStores = db.stores.length;
  const activeStores = db.stores.filter((s) => s.status === 'ACTIVO').length;
  const suspendedStores = db.stores.filter((s) => s.status === 'SUSPENDIDO').length;
  const totalOrders = db.orders.length;
  const totalSales = db.orders
    .filter((o) => o.status !== 'CANCELADO')
    .reduce((acc, o) => acc + o.total, 0);

  res.json({
    success: true,
    data: {
      totalStores,
      activeStores,
      suspendedStores,
      totalOrders,
      totalSales,
      totalProducts: db.products.length,
      totalUsers: db.users.length,
    },
  });
});

// Listar todos los comercios
adminRouter.get('/stores', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: db.stores.map((s) => {
      const storeProducts = db.products.filter((p) => p.storeId === s.id).length;
      const storeOrders = db.orders.filter((o) => o.storeId === s.id).length;
      const adminUser = db.users.find((u) => u.storeId === s.id && u.role === 'ADMIN_COMERCIO');

      return {
        ...s,
        productsCount: storeProducts,
        ordersCount: storeOrders,
        adminEmail: adminUser ? adminUser.email : null,
      };
    }),
  });
});

// Crear nuevo comercio (Tenant Provisioning)
adminRouter.post('/stores', (req: Request, res: Response): void => {
  const { name, slug, email, phone, adminName, adminEmail, primaryColor } = req.body;

  if (!name || !slug || !email || !adminEmail) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Nombre, slug, email y email de administrador son requeridos.' },
    });
    return;
  }

  const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
  if (db.stores.some((s) => s.slug === cleanSlug)) {
    res.status(400).json({
      success: false,
      error: { code: 'SLUG_ALREADY_EXISTS', message: 'El slug ya se encuentra en uso por otra tienda.' },
    });
    return;
  }

  const storeId = `store-${cleanSlug}`;
  const newStore: Store = {
    id: storeId,
    slug: cleanSlug,
    name,
    description: '',
    logo: '',
    banner: '',
    phone: phone || '',
    email,
    address: '',
    schedule: '',
    primaryColor: primaryColor || '#2563eb',
    secondaryColor: '#1e293b',
    status: 'ACTIVO',
    mercadoPagoConnected: false,
    settings: {
      shippingCost: 0,
      freeShippingMinAmount: 0,
      minOrderAmount: 0,
      allowPickup: true,
      allowDelivery: true,
      acceptCashOnDelivery: true,
      acceptBankTransfer: true,
      bankDetails: {
        bankName: '',
        accountHolder: '',
        accountNumber: '',
        cbuCvu: '',
        alias: '',
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.stores.push(newStore);

  // Crear usuario administrador del comercio
  const newUser = {
    id: `user-admin-${Date.now()}`,
    email: adminEmail.toLowerCase().trim(),
    name: adminName || `Admin ${name}`,
    role: 'ADMIN_COMERCIO' as const,
    storeId: storeId,
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);

  // Crear suscripción SaaS inicial con tarifa fija y 0% de comisión
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
  db.subscriptions.push({
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
  });

  // Registrar auditoría
  db.auditLogs.push({
    id: `log-${Date.now()}`,
    storeId,
    userId: req.user?.id,
    action: 'TENANT_PROVISIONED',
    entity: 'Store',
    entityId: storeId,
    details: { name, slug: cleanSlug, adminEmail },
    createdAt: new Date().toISOString(),
  });

  res.status(201).json({
    success: true,
    data: {
      store: newStore,
      adminUser: newUser,
    },
  });
});

// Cambiar estado de comercio (ACTIVO / SUSPENDIDO / PENDIENTE)
adminRouter.patch('/stores/:storeId/status', (req: Request, res: Response): void => {
  const { storeId } = req.params;
  const { status } = req.body;

  const validStatuses: StoreStatus[] = ['PENDIENTE', 'ACTIVO', 'SUSPENDIDO'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Estado de comercio inválido.' },
    });
    return;
  }

  const storeIndex = db.stores.findIndex((s) => s.id === storeId);
  if (storeIndex === -1) {
    res.status(404).json({
      success: false,
      error: { code: 'STORE_NOT_FOUND', message: 'Comercio no encontrado.' },
    });
    return;
  }

  const previousStatus = db.stores[storeIndex].status;
  db.stores[storeIndex].status = status;
  db.stores[storeIndex].updatedAt = new Date().toISOString();

  // Registrar auditoría
  db.auditLogs.push({
    id: `log-${Date.now()}`,
    storeId,
    userId: req.user?.id,
    action: 'STORE_STATUS_CHANGE',
    entity: 'Store',
    entityId: storeId,
    details: { previousStatus, newStatus: status },
    createdAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    data: db.stores[storeIndex],
  });
});

// Listar todas las suscripciones de la plataforma SaaS (SuperAdmin)
adminRouter.get('/subscriptions', (_req: Request, res: Response): void => {
  const subscriptionsWithStore = db.subscriptions.map((sub) => {
    const store = db.stores.find((s) => s.id === sub.storeId);
    return {
      ...sub,
      storeName: store ? store.name : sub.storeId,
      storeSlug: store ? store.slug : '',
      storeStatus: store ? store.status : 'DESCONOCIDO',
    };
  });

  const mrr = db.subscriptions
    .filter((s) => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + s.amount, 0);

  res.json({
    success: true,
    data: {
      subscriptions: subscriptionsWithStore,
      mrr,
      totalSubscribers: db.subscriptions.filter((s) => s.status === 'ACTIVE').length,
    },
  });
});

// Actualizar tarifa o estado de suscripción de un comercio
adminRouter.patch('/subscriptions/:storeId', (req: Request, res: Response): void => {
  const { storeId } = req.params;
  const { amount, planName, status } = req.body;

  let sub = db.subscriptions.find((s) => s.storeId === storeId);
  if (!sub) {
    res.status(404).json({ success: false, error: { code: 'SUB_NOT_FOUND', message: 'Suscripción no encontrada.' } });
    return;
  }

  if (amount !== undefined) sub.amount = Number(amount);
  if (planName) sub.planName = planName;
  if (status) sub.status = status;
  sub.updatedAt = new Date().toISOString();

  db.auditLogs.push({
    id: `log-${Date.now()}`,
    storeId,
    userId: req.user?.id,
    action: 'SUBSCRIPTION_UPDATE',
    entity: 'Subscription',
    entityId: sub.id,
    details: { amount, planName, status },
    createdAt: new Date().toISOString(),
  });

  res.json({ success: true, data: sub });
});

// Listar registro de auditoría de la plataforma
adminRouter.get('/audit-logs', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: db.auditLogs.slice(-100).reverse(), // Últimos 100 eventos
  });
});

// Ejecutar suite completa de tests automatizados (25 pruebas)
adminRouter.post('/run-tests', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { runAllTests } = await import('../tests/suite.ts');
    const summary = await runAllTests();
    res.json({
      success: true,
      data: summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error ejecutando tests';
    res.status(500).json({ success: false, error: { code: 'TEST_RUNNER_ERROR', message } });
  }
});

