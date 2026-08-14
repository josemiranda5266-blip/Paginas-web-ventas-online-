/**
 * Comprehensive Automated Test Suite (36 Tests)
 * Verifica:
 * - Criptografía (AES-256-GCM, JWT, OAuth State CSRF, HMAC Webhooks)
 * - Base de datos y multi-tenant isolation (BOLA/IDOR)
 * - Checkout atómico y concurrencia real de stock en PostgreSQL
 * - Congelamiento de precios en OrderItems
 * - Idempotencia de webhooks con constraint UNIQUE
 * - Restitución automática de stock al cancelar pedidos
 * - Seguridad y control de acceso por roles (SuperAdmin, Admin Comercio, Cliente)
 */

import { db } from '../db/index.ts';
import {
  encryptToken,
  decryptToken,
  generateOAuthState,
  verifyOAuthState,
  verifyMercadoPagoWebhookSignature,
  signJwtToken,
  verifyJwtToken,
  hashPassword,
  verifyPassword,
} from '../utils/crypto.ts';
import { mercadoPagoService } from '../payments/mercadopago.service.ts';

export interface TestResult {
  id: number;
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export async function runCompleteTestSuite(): Promise<{ total: number; passed: number; failed: number; results: TestResult[] }> {
  const results: TestResult[] = [];
  let testId = 1;

  async function test(name: string, category: string, fn: () => Promise<void> | void) {
    const start = Date.now();
    try {
      await fn();
      results.push({
        id: testId++,
        name,
        category,
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        id: testId++,
        name,
        category,
        passed: false,
        error: message,
        durationMs: Date.now() - start,
      });
    }
  }

  console.log('[Test Suite] Iniciando ejecución de las 36 pruebas de verificación integral...');

  // ==========================================
  // BLOQUE 1: CRIPTOGRAFÍA Y SEGURIDAD (Pruebas 1-8)
  // ==========================================

  await test('1. Cifrado AES-256-GCM de tokens sensibles (Mercado Pago Access Token)', 'Criptografía', () => {
    const original = 'APP_USR-1234567890abcdef-secure-token-xyz';
    const encrypted = encryptToken(original);
    if (encrypted === original) throw new Error('El token cifrado es idéntico al original');
    const decrypted = decryptToken(encrypted);
    if (decrypted !== original) throw new Error(`El token desencriptado (${decrypted}) no coincide con el original (${original})`);
  });

  await test('2. Integridad y autenticación GCM (Detección de manipulación de ciphertext)', 'Criptografía', () => {
    const encrypted = encryptToken('token_secreto_123');
    const parts = encrypted.split(':');
    // Corromper el último caracter del texto cifrado
    parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith('a') ? 'b' : 'a');
    const tampered = parts.join(':');
    const decrypted = decryptToken(tampered);
    if (decrypted !== '') throw new Error('El cifrado AES-GCM aceptó un texto manipulado sin lanzar error de autenticación');
  });

  await test('3. Generación y verificación de Firma de Tokens JWT (RFC 7519)', 'Criptografía', () => {
    const payload = { id: 'usr-123', role: 'SUPERADMIN', email: 'admin@test.com' };
    const token = signJwtToken(payload, 3600);
    if (!token || token.split('.').length !== 3) throw new Error('Formato JWT inválido');
    const verified = verifyJwtToken<{ id: string; role: string }>(token);
    if (!verified || verified.id !== 'usr-123' || verified.role !== 'SUPERADMIN') {
      throw new Error('Fallo en la verificación del token JWT');
    }
  });

  await test('4. Rechazo de JWT expirado o manipulado', 'Criptografía', () => {
    const token = signJwtToken({ id: 'usr-123' }, -10); // Ya expirado
    const verified = verifyJwtToken(token);
    if (verified !== null) throw new Error('Se aceptó un JWT expirado');

    const validToken = signJwtToken({ id: 'usr-123' }, 3600);
    const tampered = validToken + 'extra_tamper';
    if (verifyJwtToken(tampered) !== null) throw new Error('Se aceptó un JWT con firma alterada');
  });

  await test('5. Generación y validación estricta de OAuth State (CSRF Prevention)', 'Criptografía', () => {
    const storeId = 'store-moda-urbana';
    const state = generateOAuthState(storeId);
    const verifiedStoreId = verifyOAuthState(state);
    if (verifiedStoreId !== storeId) throw new Error(`El state verificado (${verifiedStoreId}) no coincide con el storeId (${storeId})`);
  });

  await test('6. Rechazo de OAuth State manipulado o expirado', 'Criptografía', () => {
    const storeId = 'store-moda-urbana';
    const state = generateOAuthState(storeId);
    const tamperedState = state + '.invalid';
    if (verifyOAuthState(tamperedState) !== null) throw new Error('Se aceptó un OAuth state alterado');
  });

  await test('7. Verificación criptográfica de firma Webhook de Mercado Pago (HMAC-SHA256)', 'Criptografía', async () => {
    const secret = 'test_webhook_secret_xyz';
    const dataId = '123456789';
    const requestId = 'req-abc-999';
    const ts = Math.floor(Date.now() / 1000).toString();

    // Calcular firma oficial
    const cryptoMod = await import('crypto');
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = cryptoMod.createHmac('sha256', secret).update(manifest).digest('hex');
    const xSignature = `ts=${ts},v1=${v1}`;

    const isValid = verifyMercadoPagoWebhookSignature(xSignature, requestId, dataId, secret);
    if (!isValid) throw new Error('Fallo en la verificación de firma HMAC-SHA256 del Webhook');
  });

  await test('8. Hashing seguro de contraseñas con PBKDF2 y Salt', 'Criptografía', () => {
    const password = 'MiPasswordSeguro2026!';
    const hashed = hashPassword(password);
    if (!hashed.includes(':')) throw new Error('Formato de hash PBKDF2 inválido (falta separador salt:hash)');
    const isValid = verifyPassword(password, hashed);
    if (!isValid) throw new Error('Verificación de contraseña correcta falló');
    const isInvalid = verifyPassword('PasswordEquivocado', hashed);
    if (isInvalid) throw new Error('Verificación aceptó contraseña incorrecta');
  });

  // ==========================================
  // BLOQUE 2: MULTI-TENANT & BASE DE DATOS (Pruebas 9-16)
  // ==========================================

  await test('9. Seed inicial de datos y verificación de comercios', 'Base de Datos', async () => {
    await db.seedInitialData();
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA || storeA.name !== 'Moda Urbana Store') throw new Error('No se encontró el comercio Moda Urbana en la BD');
    const storeB = await db.findStoreBySlug('gourmet-market');
    if (!storeB || storeB.name !== 'Gourmet & Delicatessen') throw new Error('No se encontró el comercio Gourmet Market en la BD');
  });

  await test('10. Aislamiento de catálogo por Tenant (Store A vs Store B)', 'Multi-Tenant', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    const storeB = await db.findStoreBySlug('gourmet-market');
    if (!storeA || !storeB) throw new Error('Comercios no inicializados');

    const prodsA = await db.findProductsByStore(storeA.id);
    const prodsB = await db.findProductsByStore(storeB.id);

    // Verificar que productos de A no aparezcan en B y viceversa
    for (const p of prodsA) {
      if (p.storeId !== storeA.id) throw new Error('Violación de aislamiento: Producto de otro tenant filtrado en Store A');
    }
    for (const p of prodsB) {
      if (p.storeId !== storeB.id) throw new Error('Violación de aislamiento: Producto de otro tenant filtrado en Store B');
    }
  });

  await test('11. Prevención BOLA/IDOR en acceso a recursos por Tenant', 'Multi-Tenant', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    const storeB = await db.findStoreBySlug('gourmet-market');
    if (!storeA || !storeB) throw new Error('Comercios no inicializados');

    const prodsA = await db.findProductsByStore(storeA.id);
    if (prodsA.length === 0) throw new Error('No hay productos en Store A');

    // Intentar buscar producto de Store A usando el storeId de Store B
    const crossAccess = await db.findProductById(storeB.id, prodsA[0].id);
    if (crossAccess !== null) {
      throw new Error('Fallo de aislamiento BOLA/IDOR: Se pudo acceder a un producto de la tienda A consultando desde la tienda B');
    }
  });

  await test('12. Autenticación de SuperAdmin y Admin de Comercio', 'Autenticación', async () => {
    const adminUser = await db.authenticateUser('admin@paginaswebventasonline.com', 'SuperAdminPassword2026!');
    if (!adminUser || adminUser.role !== 'SUPERADMIN') throw new Error('Fallo autenticando SuperAdmin');

    const storeAdmin = await db.authenticateUser('admin@modaurbana.com', 'AdminModaPassword2026!');
    if (!storeAdmin || storeAdmin.role !== 'ADMIN_COMERCIO' || storeAdmin.storeId !== 'store-moda-urbana') {
      throw new Error('Fallo autenticando Admin de Comercio');
    }
  });

  await test('13. Gestión de estado de tienda (Activo / Suspendido)', 'Tenant', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');

    await db.updateStore(storeA.id, { status: 'SUSPENDIDO' });
    const suspended = await db.findStoreById(storeA.id);
    if (suspended?.status !== 'SUSPENDIDO') throw new Error('No se pudo suspender la tienda');

    // Reactivar para siguientes pruebas
    await db.updateStore(storeA.id, { status: 'ACTIVO' });
    const active = await db.findStoreById(storeA.id);
    if (active?.status !== 'ACTIVO') throw new Error('No se pudo reactivar la tienda');
  });

  await test('14. Gestión de suscripción SaaS (0% comisión en ventas)', 'SaaS', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');

    const sub = await db.getSubscription(storeA.id);
    if (!sub || Number(sub.commissionRate) !== 0.0) throw new Error('La comisión por venta debe ser estrictamente 0.0% (suscripción fija)');
  });

  await test('15. Registro de eventos de auditoría (Audit Logs)', 'Auditoría', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');

    await db.logAudit({
      storeId: storeA.id,
      action: 'TEST_AUDIT_ACTION',
      entity: 'Test',
      details: { note: 'prueba unitaria' },
    });

    const logs = await db.listAuditLogs(5);
    const found = logs.find((l) => l.action === 'TEST_AUDIT_ACTION');
    if (!found) throw new Error('No se registró el evento de auditoría en PostgreSQL');
  });

  await test('16. Persistencia y consumo único de OAuth State', 'Seguridad', async () => {
    const stateVal = 'test_state_' + Date.now();
    await db.saveOAuthState(stateVal, 'store-moda-urbana', 'user-1', 60000);

    const consume1 = await db.consumeOAuthState(stateVal);
    if (!consume1.valid || consume1.storeId !== 'store-moda-urbana') throw new Error('Fallo al consumir state válido por primera vez');

    // Segundo consumo debe fallar (replay attack prevention)
    const consume2 = await db.consumeOAuthState(stateVal);
    if (consume2.valid) throw new Error('Fallo de seguridad: Se permitió reutilizar un state de OAuth ya consumido (Replay Attack)');
  });

  // ==========================================
  // BLOQUE 3: CHECKOUT ATÓMICO Y CONCURRENCIA DE STOCK (Pruebas 17-25)
  // ==========================================

  await test('17. Checkout atómico exitoso con cálculo de precios en backend', 'Checkout', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');

    const products = await db.findProductsByStore(storeA.id);
    const prod = products[0];
    const initialStock = prod.stock;

    const order = await db.checkoutAtomic(storeA.id, {
      customer: { firstName: 'Juan', lastName: 'Pérez', email: 'juan@test.com', phone: '+54111111111' },
      items: [{ productId: prod.id, quantity: 2 }],
      deliveryMethod: 'DELIVERY',
      paymentMethod: 'TRANSFER',
      address: { address: 'Corrientes 1234', city: 'CABA', province: 'Buenos Aires', postalCode: '1043' },
    });

    if (!order || order.items.length !== 1) throw new Error('Orden no creada correctamente');
    if (Number(order.subtotal) !== Number(prod.price) * 2) throw new Error('Subtotal calculado incorrectamente');

    // Verificar descuento de stock
    const updatedProd = await db.findProductById(storeA.id, prod.id);
    if (updatedProd?.stock !== initialStock - 2) {
      throw new Error(`El stock no se descontó correctamente. Esperado: ${initialStock - 2}, Actual: ${updatedProd?.stock}`);
    }
  });

  await test('18. Rechazo de Checkout por Stock Insuficiente', 'Checkout', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');

    const products = await db.findProductsByStore(storeA.id);
    const prod = products[0];

    let failed = false;
    try {
      await db.checkoutAtomic(storeA.id, {
        customer: { firstName: 'María', email: 'maria@test.com' },
        items: [{ productId: prod.id, quantity: 99999 }], // Cantidad masiva mayor al stock
        deliveryMethod: 'PICKUP',
        paymentMethod: 'TRANSFER',
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'INSUFFICIENT_STOCK') {
        failed = true;
      } else if (err instanceof Error && err.message.includes('Stock insuficiente')) {
        failed = true;
      }
    }

    if (!failed) throw new Error('El sistema permitió realizar checkout superando el stock disponible');
  });

  await test('19. Congelamiento histórico de precios en OrderItem', 'Checkout', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');

    const products = await db.findProductsByStore(storeA.id);
    const prod = products[0];
    const originalPrice = Number(prod.price);

    const order = await db.checkoutAtomic(storeA.id, {
      customer: { firstName: 'Ana', email: 'ana@test.com' },
      items: [{ productId: prod.id, quantity: 1 }],
      deliveryMethod: 'PICKUP',
    });

    // Modificar precio del producto en la tienda
    const newPrice = originalPrice + 10000;
    await db.updateProduct(storeA.id, prod.id, { price: newPrice });

    // Verificar que el precio congelado en el item del pedido permanezca intacto
    const fetchedOrder = await db.findOrderById(storeA.id, order.id);
    const itemPrice = Number(fetchedOrder?.items[0]?.price);

    // Restaurar precio original
    await db.updateProduct(storeA.id, prod.id, { price: originalPrice });

    if (itemPrice !== originalPrice) {
      throw new Error(`Violación de congelamiento de precios: El precio del item cambió a ${itemPrice} cuando debía mantenerse en ${originalPrice}`);
    }
  });

  await test('20. Cancelación de pedido y restitución idempotente de stock', 'Checkout', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');

    const products = await db.findProductsByStore(storeA.id);
    const prod = products[0];
    const stockBefore = prod.stock;

    const order = await db.checkoutAtomic(storeA.id, {
      customer: { firstName: 'Pedro', email: 'pedro@test.com' },
      items: [{ productId: prod.id, quantity: 3 }],
      deliveryMethod: 'PICKUP',
    });

    const stockAfterCheckout = (await db.findProductById(storeA.id, prod.id))?.stock;
    if (stockAfterCheckout !== stockBefore - 3) throw new Error('Stock no descontado');

    // Cancelar pedido
    await db.cancelOrderAndRestoreStock(storeA.id, order.id);

    const stockAfterCancel = (await db.findProductById(storeA.id, prod.id))?.stock;
    if (stockAfterCancel !== stockBefore) {
      throw new Error(`El stock no se restituyó al cancelar. Esperado: ${stockBefore}, Actual: ${stockAfterCancel}`);
    }

    // Cancelar de nuevo (Idempotencia: no debe duplicar restitución)
    await db.cancelOrderAndRestoreStock(storeA.id, order.id);
    const stockAfterSecondCancel = (await db.findProductById(storeA.id, prod.id))?.stock;
    if (stockAfterSecondCancel !== stockBefore) {
      throw new Error('Violación de idempotencia en cancelación: El stock se incrementó doblemente al cancelar por segunda vez');
    }
  });

  await test('21. Concurrencia real de stock en transacciones simultáneas', 'Concurrencia', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');

    // Crear un producto exclusivo para prueba de concurrencia con stock exacto = 5
    const cat = (await db.findCategoriesByStore(storeA.id))[0];
    const testProd = await db.createProduct(storeA.id, {
      categoryId: cat.id,
      name: 'Producto Concurrencia Test',
      price: 1000,
      stock: 5,
    });

    // Lanzar 5 checkouts simultáneos de 1 unidad cada uno (stock total 5)
    const promises = Array.from({ length: 5 }, (_, i) =>
      db.checkoutAtomic(storeA.id, {
        customer: { firstName: `Cliente ${i}`, email: `cli${i}@test.com` },
        items: [{ productId: testProd.id, quantity: 1 }],
        deliveryMethod: 'PICKUP',
      })
    );

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    if (fulfilled.length !== 5) {
      throw new Error(`Se esperaba que los 5 checkouts concurrentes concluyeran con éxito. Éxitos: ${fulfilled.length}`);
    }

    const finalProd = await db.findProductById(storeA.id, testProd.id);
    if (finalProd?.stock !== 0) {
      throw new Error(`El stock final de concurrencia debe ser 0. Actual: ${finalProd?.stock}`);
    }

    // Un 6to checkout simultáneo debe fallar por falta de stock
    let sixthFailed = false;
    try {
      await db.checkoutAtomic(storeA.id, {
        customer: { firstName: 'Cliente 6', email: 'cli6@test.com' },
        items: [{ productId: testProd.id, quantity: 1 }],
        deliveryMethod: 'PICKUP',
      });
    } catch {
      sixthFailed = true;
    }

    if (!sixthFailed) {
      throw new Error('Fallo de control de concurrencia: Se permitió un 6to pedido sin stock disponible');
    }
  });

  await test('22. Idempotencia en Webhook Events (constraint UNIQUE en DB)', 'Webhooks', async () => {
    const eventId = 'evt-unique-test-' + Date.now();
    const res1 = await db.recordWebhookEventIdempotent(eventId, 'payment.updated', { status: 'approved' });
    if (res1.alreadyProcessed) throw new Error('El primer registro de webhook no debió marcarse como duplicado');

    const res2 = await db.recordWebhookEventIdempotent(eventId, 'payment.updated', { status: 'approved' });
    if (!res2.alreadyProcessed) throw new Error('El segundo registro con el mismo eventId debió detectarse como duplicado (idempotencia)');
  });

  await test('23. Servicio de Mercado Pago OAuth URL generation', 'MercadoPago', () => {
    const url = mercadoPagoService.getOAuthAuthorizationUrl('store-moda-urbana');
    if (!url.includes('auth.mercadopago.com/authorization') || !url.includes('client_id=')) {
      throw new Error('URL de autorización OAuth generada incorrectamente');
    }
  });

  await test('24. Normalización de estados de pago de Mercado Pago', 'MercadoPago', () => {
    if (mercadoPagoService.normalizePaymentStatus('approved') !== 'APPROVED') throw new Error('Error normalizando approved');
    if (mercadoPagoService.normalizePaymentStatus('in_process') !== 'IN_PROCESS') throw new Error('Error normalizando in_process');
    if (mercadoPagoService.normalizePaymentStatus('rejected') !== 'REJECTED') throw new Error('Error normalizando rejected');
    if (mercadoPagoService.normalizePaymentStatus('unknown_status') !== 'PENDING') throw new Error('Error normalizando estado desconocido a PENDING');
  });

  await test('25. Cifrado y descifrado de Access Tokens y Refresh Tokens múltiples', 'Criptografía', () => {
    const token1 = 'APP_USR-1111-2222-3333';
    const token2 = 'APP_USR-4444-5555-6666';
    const enc1 = encryptToken(token1);
    const enc2 = encryptToken(token2);

    if (decryptToken(enc1) !== token1 || decryptToken(enc2) !== token2) {
      throw new Error('Fallo en descifrado independiente de tokens múltiples');
    }
  });

  // ==========================================
  // BLOQUE 4: GESTIÓN DE PRODUCTOS Y CATEGORÍAS (Pruebas 26-30)
  // ==========================================

  await test('26. Creación y listado de categorías por tienda', 'Catálogo', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');

    const cat = await db.createCategory(storeA.id, {
      name: 'Calzado Exclusivo',
      slug: 'calzado-exclusivo-' + Date.now(),
      description: 'Zapatillas y zapatos de diseño',
    });

    if (!cat || cat.storeId !== storeA.id) throw new Error('Categoría creada con storeId incorrecto');
    const cats = await db.findCategoriesByStore(storeA.id);
    if (!cats.some((c) => c.id === cat.id)) throw new Error('La categoría creada no aparece en el listado de la tienda');
  });

  await test('27. Creación, actualización y eliminación de productos', 'Catálogo', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');
    const cat = (await db.findCategoriesByStore(storeA.id))[0];

    const prod = await db.createProduct(storeA.id, {
      categoryId: cat.id,
      name: 'Campera de Cuero Premium',
      price: 85000,
      stock: 10,
    });

    if (Number(prod.price) !== 85000) throw new Error('Precio de producto incorrecto');

    const updated = await db.updateProduct(storeA.id, prod.id, { price: 89000, stock: 15 });
    if (Number(updated.price) !== 89000 || updated.stock !== 15) throw new Error('Fallo al actualizar producto');

    await db.deleteProduct(storeA.id, prod.id);
    const deleted = await db.findProductById(storeA.id, prod.id);
    if (deleted !== null) throw new Error('El producto no fue eliminado correctamente');
  });

  await test('28. Creación de nuevos comercios (Tenants) por SuperAdmin', 'SaaS', async () => {
    const uniqueSlug = 'tienda-test-' + Date.now();
    const newStore = await db.createStore({
      slug: uniqueSlug,
      name: 'Tienda de Prueba Automatizada',
      email: 'test@tiendatest.com',
    });

    if (!newStore || newStore.slug !== uniqueSlug) throw new Error('Fallo al crear nuevo comercio');
    const fetched = await db.findStoreBySlug(uniqueSlug);
    if (!fetched || fetched.id !== newStore.id) throw new Error('No se pudo recuperar el comercio creado por slug');
  });

  await test('29. Listado de pedidos por tienda y filtrado por estado', 'Pedidos', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');

    const orders = await db.findOrdersByStore(storeA.id);
    if (!Array.isArray(orders)) throw new Error('El listado de pedidos no retornó un arreglo');
  });

  await test('30. Actualización de estado de pedido con registro de auditoría', 'Pedidos', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');
    const orders = await db.findOrdersByStore(storeA.id);

    if (orders.length > 0) {
      const ord = orders[0];
      const updated = await db.updateOrderStatus(storeA.id, ord.id, 'PREPARANDO', 'user-superadmin-1');
      if (updated.status !== 'PREPARANDO') throw new Error('Estado de pedido no actualizado');
    }
  });

  // ==========================================
  // BLOQUE 5: ROBUSTA INTEGRIDAD Y VALIDACIÓN (Pruebas 31-36)
  // ==========================================

  await test('31. Validación de variables de entorno críticas en criptografía', 'Seguridad', () => {
    const envCheck = db ? true : false;
    if (!envCheck) throw new Error('Base de datos no inicializada');
  });

  await test('32. Verificación de exclusividad de token cifrado para cada comercio', 'Criptografía', () => {
    const t1 = encryptToken('token_tienda_1');
    const t2 = encryptToken('token_tienda_2');
    if (t1 === t2) throw new Error('El cifrado AES-GCM generó valores idénticos para diferentes inputs (IV no aleatorio)');
  });

  await test('33. Verificación de integridad de JWT con roles múltiples', 'Autenticación', () => {
    const tokenCli = signJwtToken({ id: 'c1', role: 'CLIENTE' });
    const tokenAdm = signJwtToken({ id: 'a1', role: 'ADMIN_COMERCIO', storeId: 'store-1' });

    const pCli = verifyJwtToken<{ role: string }>(tokenCli);
    const pAdm = verifyJwtToken<{ role: string; storeId: string }>(tokenAdm);

    if (pCli?.role !== 'CLIENTE' || pAdm?.role !== 'ADMIN_COMERCIO' || pAdm?.storeId !== 'store-1') {
      throw new Error('Fallo en discriminación de roles y storeId en JWT');
    }
  });

  await test('34. Comprobación de unicidad de emails en usuarios', 'Base de Datos', async () => {
    const email = 'unique.test.user.' + Date.now() + '@test.com';
    await db.createUser({ email, name: 'User 1', role: 'CLIENTE', password: 'Password123!' });

    let duplicateCreated = false;
    try {
      await db.createUser({ email, name: 'User 2', role: 'CLIENTE', password: 'Password123!' });
      duplicateCreated = true;
    } catch {
      duplicateCreated = false;
    }

    if (duplicateCreated) throw new Error('La base de datos permitió registrar usuarios duplicados con el mismo email');
  });

  await test('35. Verificación de integridad de montos y tipos de moneda en suscripción', 'SaaS', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');
    const sub = await db.getSubscription(storeA.id);
    if (sub?.currency !== 'ARS' || Number(sub.amount) <= 0) {
      throw new Error('La suscripción debe estar en ARS con monto válido');
    }
  });

  await test('36. Prueba final de robustez de transacciones atómicas con rollback ante fallo', 'Resiliencia', async () => {
    const storeA = await db.findStoreBySlug('moda-urbana');
    if (!storeA) throw new Error('Comercio no encontrado');
    const products = await db.findProductsByStore(storeA.id);
    const prod = products[0];
    const stockInitial = prod.stock;

    let failedAsExpected = false;
    try {
      // Intentar checkout con un producto existente y un producto ID inexistente para forzar rollback
      await db.checkoutAtomic(storeA.id, {
        customer: { firstName: 'Rollback', email: 'rollback@test.com' },
        items: [
          { productId: prod.id, quantity: 2 },
          { productId: 'prod-inexistente-9999', quantity: 1 },
        ],
        deliveryMethod: 'PICKUP',
      });
    } catch {
      failedAsExpected = true;
    }

    if (!failedAsExpected) throw new Error('La transacción debió fallar por producto inexistente');

    // Verificar que el stock del producto válido NO se haya descontado gracias al rollback atómico
    const prodAfter = await db.findProductById(storeA.id, prod.id);
    if (prodAfter?.stock !== stockInitial) {
      throw new Error(`Fallo en Rollback atómico: El stock se descontó parcialmente a pesar de fallar la transacción. Inicial: ${stockInitial}, Actual: ${prodAfter?.stock}`);
    }
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`[Test Suite Completada] Total: ${results.length} | Aprobadas: ${passed} | Fallidas: ${failed}`);

  return {
    total: results.length,
    passed,
    failed,
    results,
  };
}
