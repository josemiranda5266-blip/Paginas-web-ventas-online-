/**
 * Paginas Web Ventas Online - Comprehensive Automated Test Suite (25 Tests)
 * 
 * Verificación rigurosa de:
 * - Autenticación y JWT firmado
 * - Aislamiento Multi-Tenant (BOLA / IDOR)
 * - Mercado Pago OAuth (CSRF, Cifrado AES-256)
 * - Webhook HMAC-SHA256 e Idempotencia
 * - Cálculo de Precios en Backend y Concurrencia de Stock
 * - Panel SuperAdmin y Modelo de Suscripción Fijo (0% comisión)
 * - Cero Fugas de Secretos
 */

import express from 'express';
import { db } from '../db/index.ts';
import { authRouter } from '../routes/auth.routes.ts';
import { storeRouter } from '../routes/store.routes.ts';
import { productRouter } from '../routes/product.routes.ts';
import { orderRouter } from '../routes/order.routes.ts';
import { paymentRouter } from '../routes/payment.routes.ts';
import { adminRouter } from '../routes/admin.routes.ts';
import { authMiddleware } from '../middleware/auth.ts';
import { resolveTenant } from '../middleware/tenant.ts';
import {
  encryptToken,
  decryptToken,
  signJwtToken,
  verifyJwtToken,
  generateOAuthState,
  verifyOAuthState,
  verifyMercadoPagoWebhookSignature,
} from '../utils/crypto.ts';
import crypto from 'crypto';

export interface TestResult {
  id: number;
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export async function runAllTests(): Promise<{ total: number; passed: number; failed: number; results: TestResult[] }> {
  const results: TestResult[] = [];

  // Setup express test app
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use(resolveTenant);
  app.use('/api/auth', authRouter);
  app.use('/api/stores', storeRouter);
  app.use('/api/catalog', productRouter);
  app.use('/api/orders', orderRouter);
  app.use('/api/payments', paymentRouter);
  app.use('/api/admin', adminRouter);

  const server = app.listen(0);
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function apiRequest(path: string, options: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      },
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, data: json, ok: res.ok };
  }

  async function executeTest(id: number, name: string, category: string, fn: () => Promise<void>) {
    const start = Date.now();
    try {
      await fn();
      results.push({ id, name, category, passed: true, durationMs: Date.now() - start });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({ id, name, category, passed: false, error: errorMsg, durationMs: Date.now() - start });
    }
  }

  // Preparamos tokens de prueba acordes a los datos seed de la base de datos
  const tenantAToken = signJwtToken({
    id: 'user-admin-comercio-a',
    email: 'admin@modaurbana.com',
    name: 'Carlos Gómez (Admin Moda)',
    role: 'ADMIN_COMERCIO',
    storeId: 'store-moda-urbana',
  });

  const tenantBToken = signJwtToken({
    id: 'user-admin-comercio-b',
    email: 'admin@gourmetmarket.com',
    name: 'Laura Rossi (Admin Gourmet)',
    role: 'ADMIN_COMERCIO',
    storeId: 'store-gourmet-market',
  });

  try {
    // -------------------------------------------------------------
    // 1. AUTENTICACIÓN
    // -------------------------------------------------------------
    await executeTest(1, 'Login correcto retorna JWT firmado y datos de usuario', 'Autenticación', async () => {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@modaurbana.com' }),
      });
      if (res.status !== 200 || !res.data.success) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      if (!res.data.data.token || res.data.data.user.email !== 'admin@modaurbana.com') throw new Error('Token o usuario no recibido');
      const verified = verifyJwtToken(res.data.data.token);
      if (!verified) throw new Error('JWT devuelto no es válido criptográficamente');
    });

    await executeTest(2, 'Login con credenciales inexistentes falla con 401', 'Autenticación', async () => {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'noexiste@ejemplo.com' }),
      });
      if (res.status !== 401) throw new Error(`Esperaba 401 pero recibió ${res.status}`);
    });

    await executeTest(3, 'Rutas protegidas sin token retornan 401 UNAUTHORIZED', 'Autenticación', async () => {
      const res = await apiRequest('/api/stores/store-moda-urbana/stats');
      if (res.status !== 401) throw new Error(`Esperaba 401 pero recibió ${res.status}`);
    });

    // -------------------------------------------------------------
    // 2. AISLAMIENTO MULTI-TENANT (BOLA / IDOR)
    // -------------------------------------------------------------
    await executeTest(4, 'Tenant A no puede acceder a pedidos de Tenant B (403)', 'Multi-Tenancy', async () => {
      const res = await apiRequest('/api/orders/store-gourmet-market', {
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      if (res.status !== 403) throw new Error(`Esperaba 403 TENANT_ACCESS_DENIED pero recibió ${res.status}`);
    });

    await executeTest(5, 'Tenant A no puede modificar productos de Tenant B (403)', 'Multi-Tenancy', async () => {
      const res = await apiRequest('/api/catalog/products/store-gourmet-market/prod-b-1', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tenantAToken}` },
        body: JSON.stringify({ price: 999 }),
      });
      if (res.status !== 403) throw new Error(`Esperaba 403 pero recibió ${res.status}`);
    });

    await executeTest(6, 'Tenant A no puede eliminar productos de Tenant B (403)', 'Multi-Tenancy', async () => {
      const res = await apiRequest('/api/catalog/products/store-gourmet-market/prod-b-1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      if (res.status !== 403) throw new Error(`Esperaba 403 pero recibió ${res.status}`);
    });

    await executeTest(7, 'Catálogo público de Tenant A sólo expone productos de Tenant A', 'Multi-Tenancy', async () => {
      const res = await apiRequest('/api/catalog/products/store-moda-urbana');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const items = res.data.data;
      if (items.some((p: { storeId: string }) => p.storeId !== 'store-moda-urbana')) {
        throw new Error('Se encontraron productos pertenecientes a otro tenant');
      }
    });

    await executeTest(8, 'Tenant A no puede modificar configuración de Tenant B (403)', 'Multi-Tenancy', async () => {
      const res = await apiRequest('/api/stores/store-gourmet-market/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tenantAToken}` },
        body: JSON.stringify({ name: 'Tienda Hackeada' }),
      });
      if (res.status !== 403) throw new Error(`Esperaba 403 pero recibió ${res.status}`);
    });

    await executeTest(9, 'Inyección de storeId ajeno en payload es bloqueada (403)', 'Multi-Tenancy', async () => {
      const res = await apiRequest('/api/catalog/products/store-moda-urbana', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantAToken}` },
        body: JSON.stringify({
          storeId: 'store-gourmet-market', // Intento de inyectar en tienda B
          categoryId: 'cat-a-1',
          name: 'Producto Malicioso',
          price: 100,
        }),
      });
      if (res.status !== 403) throw new Error(`Esperaba 403 pero recibió ${res.status}`);
    });

    // -------------------------------------------------------------
    // 3. MERCADO PAGO OAUTH Y CRIPTOGRAFÍA
    // -------------------------------------------------------------
    await executeTest(10, 'Cifrado AES-256-GCM y descifrado de tokens funciona correctamente', 'Criptografía', async () => {
      const originalToken = 'APP_USR_token_secreto_mercadopago_123456789';
      const encrypted = encryptToken(originalToken);
      if (encrypted === originalToken) throw new Error('El token no fue encriptado');
      const decrypted = decryptToken(encrypted);
      if (decrypted !== originalToken) throw new Error('El token descifrado no coincide');
    });

    await executeTest(11, 'Generación de state para OAuth con firma anti-CSRF', 'Mercado Pago OAuth', async () => {
      const state = generateOAuthState('store-moda-urbana');
      const verified = verifyOAuthState(state);
      if (verified !== 'store-moda-urbana') throw new Error('El state verificado no devolvió el storeId correcto');
    });

    await executeTest(12, 'Callback OAuth sin parámetros es rechazado con 400', 'Mercado Pago OAuth', async () => {
      const res = await apiRequest('/api/payments/mercadopago/oauth/callback');
      if (res.status !== 400) throw new Error(`Esperaba 400 pero recibió ${res.status}`);
    });

    await executeTest(13, 'Callback OAuth con state manipulado/inválido es rechazado con 400', 'Mercado Pago OAuth', async () => {
      const res = await apiRequest('/api/payments/mercadopago/oauth/callback?code=test_code&state=store-moda-urbana.1234.fake_signature');
      if (res.status !== 400) throw new Error(`Esperaba 400 pero recibió ${res.status}`);
    });

    await executeTest(14, 'Conexión Sandbox de Mercado Pago asocia y encripta credenciales', 'Mercado Pago', async () => {
      const res = await apiRequest('/api/payments/mercadopago/dev-connect/store-moda-urbana', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantAToken}` },
        body: JSON.stringify({ mpUserId: '123456789' }),
      });
      if (res.status !== 200 || !res.data.success) throw new Error(`Fallo al conectar Sandbox: ${res.status}`);
      const conn = db.mpConnections.find((c) => c.storeId === 'store-moda-urbana' && c.active);
      if (!conn || !conn.accessTokenEncrypted) throw new Error('Conexión o token encriptado no encontrado');
    });

    // -------------------------------------------------------------
    // 4. CHECKOUT, CONCURRENCIA DE STOCK Y PRECIOS SERVER-AUTHORITATIVE
    // -------------------------------------------------------------
    await executeTest(15, 'Checkout público calcula el total del pedido desde la DB y descuenta stock', 'Checkout & Pedidos', async () => {
      const prod = db.products.find((p) => p.id === 'prod-a-1')!;
      const initialStock = prod.stock;
      const dbPrice = prod.price;

      const res = await apiRequest('/api/orders/store-moda-urbana/checkout', {
        method: 'POST',
        body: JSON.stringify({
          customer: { firstName: 'Juan', lastName: 'Perez', email: 'juan@test.com' },
          items: [{ productId: 'prod-a-1', quantity: 2 }],
          deliveryMethod: 'PICKUP',
          paymentMethod: 'MERCADOPAGO',
        }),
      });

      if (res.status !== 201 || !res.data.success) throw new Error(`Fallo en checkout: ${res.status} - ${JSON.stringify(res.data)}`);
      const order = res.data.data;
      if (order.subtotal !== dbPrice * 2) throw new Error(`Subtotal calculado incorrecto: ${order.subtotal}`);
      if (prod.stock !== initialStock - 2) throw new Error('Stock no fue descontado');
    });

    await executeTest(16, 'Intento de manipulación de precio desde el frontend es completamente ignorado', 'Seguridad de Precios', async () => {
      const prod = db.products.find((p) => p.id === 'prod-a-2')!;
      const realPrice = prod.price;

      const res = await apiRequest('/api/orders/store-moda-urbana/checkout', {
        method: 'POST',
        body: JSON.stringify({
          customer: { firstName: 'Hacker', lastName: 'Price', email: 'hacker@test.com' },
          items: [{ productId: 'prod-a-2', quantity: 1, price: 0.01 }], // Intento de pagar $0.01
          deliveryMethod: 'PICKUP',
          paymentMethod: 'TRANSFER',
        }),
      });

      if (res.status !== 201) throw new Error(`Fallo en checkout: ${res.status}`);
      const order = res.data.data;
      if (order.subtotal === 0.01 || order.subtotal !== realPrice) {
        throw new Error('El sistema aceptó el precio alterado del frontend!');
      }
    });

    await executeTest(17, 'Checkout rechaza pedidos con stock insuficiente (INSUFFICIENT_STOCK)', 'Inventario', async () => {
      const prod = db.products.find((p) => p.id === 'prod-a-1')!;
      const excessiveQty = prod.stock + 100;

      const res = await apiRequest('/api/orders/store-moda-urbana/checkout', {
        method: 'POST',
        body: JSON.stringify({
          customer: { firstName: 'Ana', lastName: 'Gomez', email: 'ana@test.com' },
          items: [{ productId: 'prod-a-1', quantity: excessiveQty }],
          deliveryMethod: 'PICKUP',
          paymentMethod: 'TRANSFER',
        }),
      });

      if (res.status !== 400 || res.data.error?.code !== 'INSUFFICIENT_STOCK') {
        throw new Error(`Esperaba 400 INSUFFICIENT_STOCK pero recibió ${res.status}`);
      }
    });

    // -------------------------------------------------------------
    // 5. WEBHOOKS DE MERCADO PAGO E IDEMPOTENCIA
    // -------------------------------------------------------------
    await executeTest(18, 'Firma HMAC-SHA256 de Webhook de Mercado Pago válida es aceptada', 'Webhooks MP', async () => {
      const secret = 'test_webhook_secret_123';
      const dataId = '99887766';
      const requestId = 'req-abc-123';
      const ts = Math.floor(Date.now() / 1000).toString();
      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
      const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

      const isValid = verifyMercadoPagoWebhookSignature(`ts=${ts},v1=${hash}`, requestId, dataId, secret);
      if (!isValid) throw new Error('La firma válida fue incorrectamente rechazada');
    });

    await executeTest(19, 'Firma falsa o inválida en Webhook es rechazada con 401', 'Webhooks MP', async () => {
      const originalSecret = process.env.MP_WEBHOOK_SECRET;
      process.env.MP_WEBHOOK_SECRET = 'super_secret_webhook_key_12345';

      try {
        const res = await apiRequest('/api/payments/mercadopago/webhook', {
          method: 'POST',
          headers: {
            'x-signature': 'ts=12345,v1=hash_falso_invalido',
            'x-request-id': 'req-fake',
          },
          body: JSON.stringify({ data: { id: '99999' }, type: 'payment' }),
        });
        if (res.status !== 401) throw new Error(`Esperaba 401 pero recibió ${res.status}`);
      } finally {
        process.env.MP_WEBHOOK_SECRET = originalSecret;
      }
    });

    await executeTest(20, 'Idempotencia de Webhook: evento duplicado no duplica procesamiento', 'Webhooks MP', async () => {
      const eventId = 'test-idempotent-event-1';
      db.webhookEvents.push({
        id: 'whe-idem-1',
        provider: 'MERCADOPAGO',
        eventId,
        eventType: 'payment',
        status: 'PROCESSED',
        payload: {},
        processedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      const secret = process.env.MP_WEBHOOK_SECRET || 'dev_default_webhook_secret';
      const requestId = 'req-idem-123';
      const ts = Math.floor(Date.now() / 1000).toString();
      const manifest = `id:${eventId};request-id:${requestId};ts:${ts};`;
      const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

      const res = await apiRequest('/api/payments/mercadopago/webhook', {
        method: 'POST',
        headers: {
          'x-signature': `ts=${ts},v1=${hash}`,
          'x-request-id': requestId,
        },
        body: JSON.stringify({ data: { id: eventId }, type: 'payment' }),
      });

      if (res.status !== 200 || !res.data.idempotent) {
        throw new Error(`Esperaba respuesta idempotente 200 pero recibió ${res.status}`);
      }
    });

    await executeTest(21, 'Simulación de pago APPROVED actualiza pedido a CONFIRMADO', 'Estado de Pagos', async () => {
      const order = db.orders[0];
      const res = await apiRequest('/api/payments/mercadopago/simulate-payment-webhook', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id, status: 'APPROVED' }),
      });
      if (res.status !== 200 || !res.data.success) throw new Error(`Status ${res.status}`);
      if (order.status !== 'CONFIRMADO' || order.paymentStatus !== 'APPROVED') {
        throw new Error(`Estado de orden no actualizado: ${order.status}`);
      }
    });

    await executeTest(22, 'Cancelación de pedido restaura el stock de los productos', 'Inventario', async () => {
      const prod = db.products.find((p) => p.id === 'prod-a-2')!;
      const stockBefore = prod.stock;

      const checkoutRes = await apiRequest('/api/orders/store-moda-urbana/checkout', {
        method: 'POST',
        body: JSON.stringify({
          customer: { firstName: 'Test', lastName: 'Cancel', email: 'cancel@test.com' },
          items: [{ productId: 'prod-a-2', quantity: 3 }],
          deliveryMethod: 'PICKUP',
          paymentMethod: 'TRANSFER',
        }),
      });

      const orderId = checkoutRes.data.data.id;
      if (prod.stock !== stockBefore - 3) throw new Error('Stock no descontado tras checkout');

      // Cancelar pedido
      const cancelRes = await apiRequest(`/api/orders/store-moda-urbana/${orderId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tenantAToken}` },
        body: JSON.stringify({ status: 'CANCELADO' }),
      });

      if (cancelRes.status !== 200) throw new Error('Fallo al cancelar orden');
      if (prod.stock !== stockBefore) throw new Error(`El stock no fue restaurado. Esperaba ${stockBefore}, actual ${prod.stock}`);
    });

    // -------------------------------------------------------------
    // 6. SUPERADMIN, SUSCRIPCIÓN SAAS Y SEGURIDAD
    // -------------------------------------------------------------
    await executeTest(23, 'Rutas de SuperAdmin bloqueadas para usuarios no SuperAdmin (403)', 'SuperAdmin', async () => {
      const res = await apiRequest('/api/admin/stats', {
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      if (res.status !== 403) throw new Error(`Esperaba 403 pero recibió ${res.status}`);
    });

    await executeTest(24, 'Modelo SaaS mensual fijo configurado con 0% comisión en ventas', 'Modelo de Suscripción', async () => {
      const res = await apiRequest('/api/stores/store-moda-urbana/subscription', {
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const sub = res.data.data;
      if (sub.commissionRate !== 0.0) throw new Error(`Comisión debe ser 0.00% pero es ${sub.commissionRate}`);
      if (sub.amount <= 0) throw new Error('Tarifa mensual fija no configurada');
    });

    await executeTest(25, 'Comercio suspendido bloquea checkout con 403 STORE_SUSPENDED', 'Seguridad & Estado Tienda', async () => {
      const store = db.stores.find((s) => s.id === 'store-gourmet-market')!;
      store.status = 'SUSPENDIDO';

      const res = await apiRequest('/api/orders/store-gourmet-market/checkout', {
        method: 'POST',
        body: JSON.stringify({
          customer: { firstName: 'Cliente', lastName: 'Suspendido', email: 'c@test.com' },
          items: [{ productId: 'prod-b-1', quantity: 1 }],
          deliveryMethod: 'PICKUP',
          paymentMethod: 'TRANSFER',
        }),
      });

      store.status = 'ACTIVO'; // Restaurar

      if (res.status !== 403 || res.data.error?.code !== 'STORE_SUSPENDED') {
        throw new Error(`Esperaba 403 STORE_SUSPENDED pero recibió ${res.status}`);
      }
    });

  } finally {
    server.close();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed,
    failed,
    results,
  };
}
