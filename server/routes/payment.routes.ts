/**
 * Payment & Mercado Pago Multi-Tenant Routes
 * Gestiona OAuth por comercio, generación de Checkout preferences, Webhooks idempotentes y verificación.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { requireAuth } from '../middleware/auth.ts';
import { enforceTenantIsolation } from '../middleware/tenant.ts';
import { mercadoPagoService } from '../payments/mercadopago.service.ts';
import { Payment, PaymentStatus, OrderStatus } from '../../src/types/index.ts';

export const paymentRouter = Router();

// ==========================================
// 1. ESTADO Y OAUTH MERCADO PAGO POR COMERCIO
// ==========================================

// Obtener estado de conexión de Mercado Pago para un comercio
paymentRouter.get('/mercadopago/status/:storeId', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId } = req.params;
  const connection = db.mpConnections.find((c) => c.storeId === storeId && c.active);

  res.json({
    success: true,
    data: {
      connected: Boolean(connection && connection.active),
      mpUserId: connection ? connection.mpUserId : null,
      publicKey: connection ? connection.publicKey : null,
      active: connection ? connection.active : false,
      isOAuthConfigured: mercadoPagoService.isOAuthConfigured(),
      updatedAt: connection ? connection.updatedAt : null,
    },
  });
});

// Obtener URL para conectar la cuenta de Mercado Pago del comercio vía OAuth
paymentRouter.get('/mercadopago/connect-url/:storeId', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId } = req.params;

  if (!mercadoPagoService.isOAuthConfigured()) {
    res.status(400).json({
      success: false,
      error: {
        code: 'MP_OAUTH_NOT_CONFIGURED',
        message: 'Las variables MP_APP_CLIENT_ID y MP_APP_CLIENT_SECRET aún no han sido configuradas en el entorno. Puedes usar el modo de pruebas Sandbox para verificar el flujo de compras.',
      },
    });
    return;
  }

  try {
    const url = mercadoPagoService.getOAuthAuthorizationUrl(storeId);
    res.json({ success: true, data: { url } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error generando URL de Mercado Pago OAuth';
    res.status(500).json({ success: false, error: { code: 'MP_OAUTH_CONFIG_ERROR', message } });
  }
});

// Callback OAuth de Mercado Pago (Recibe 'code' y 'state' con storeId)
paymentRouter.get('/mercadopago/oauth/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state: storeId } = req.query;

  if (!code || !storeId) {
    res.status(400).send('Parámetros de OAuth inválidos.');
    return;
  }

  try {
    const tokenData = await mercadoPagoService.exchangeOAuthCode(String(code));
    const cleanStoreId = String(storeId);

    // Encriptar tokens antes de persistirlos en la base de datos
    const encryptedAccessToken = mercadoPagoService.encrypt(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token ? mercadoPagoService.encrypt(tokenData.refresh_token) : undefined;

    const existingIndex = db.mpConnections.findIndex((c) => c.storeId === cleanStoreId);
    const connection = {
      id: `mp-conn-${Date.now()}`,
      storeId: cleanStoreId,
      mpUserId: String(tokenData.user_id),
      accessTokenEncrypted: encryptedAccessToken,
      refreshTokenEncrypted: encryptedRefreshToken,
      publicKey: tokenData.public_key,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      db.mpConnections[existingIndex] = connection;
    } else {
      db.mpConnections.push(connection);
    }

    // Marcar tienda con Mercado Pago conectado
    const store = db.stores.find((s) => s.id === cleanStoreId);
    if (store) {
      store.mercadoPagoConnected = true;
    }

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Mercado Pago Conectado</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 40px; background: #0f172a; color: #f8fafc;">
          <div style="max-width: 480px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 16px; border: 1px solid #334155;">
            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
            <h2 style="margin: 0 0 12px 0; color: #38bdf8;">¡Cuenta de Mercado Pago vinculada!</h2>
            <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">Tu comercio ya puede recibir pagos directamente en su cuenta de Mercado Pago con 0% de comisión de nuestra plataforma.</p>
            <p style="color: #64748b; font-size: 12px; margin-top: 24px;">Esta ventana se cerrará automáticamente...</p>
          </div>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'MP_CONNECTED', storeId: '${cleanStoreId}' }, '*');
              }
            } catch(e) {}
            setTimeout(() => window.close(), 2500);
          </script>
        </body>
      </html>
    `);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error en OAuth de Mercado Pago';
    res.status(500).send(`Error vinculando Mercado Pago: ${message}`);
  }
});

// Conectar en modo Sandbox / Pruebas de Desarrollo
paymentRouter.post('/mercadopago/dev-connect/:storeId', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId } = req.params;
  const { mpUserId } = req.body;

  const mockToken = `SANDBOX_DEMO_TOKEN_${storeId}_${Date.now()}`;
  const encryptedAccessToken = mercadoPagoService.encrypt(mockToken);

  const existingIndex = db.mpConnections.findIndex((c) => c.storeId === storeId);
  const connection = {
    id: `mp-conn-dev-${Date.now()}`,
    storeId,
    mpUserId: mpUserId || `mp-user-sandbox-${Math.floor(100000 + Math.random() * 900000)}`,
    accessTokenEncrypted: encryptedAccessToken,
    publicKey: 'TEST-APP-PUBLIC-KEY-SANDBOX',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    db.mpConnections[existingIndex] = connection;
  } else {
    db.mpConnections.push(connection);
  }

  const store = db.stores.find((s) => s.id === storeId);
  if (store) {
    store.mercadoPagoConnected = true;
  }

  res.json({
    success: true,
    data: {
      message: 'Cuenta de Mercado Pago (Sandbox) conectada con éxito.',
      connection: {
        storeId,
        mpUserId: connection.mpUserId,
        active: true,
      },
    },
  });
});

// Desconectar Mercado Pago de un comercio
paymentRouter.post('/mercadopago/disconnect/:storeId', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId } = req.params;

  const index = db.mpConnections.findIndex((c) => c.storeId === storeId);
  if (index >= 0) {
    db.mpConnections[index].active = false;
    db.mpConnections[index].accessTokenEncrypted = '';
    db.mpConnections[index].updatedAt = new Date().toISOString();
  }

  const store = db.stores.find((s) => s.id === storeId);
  if (store) {
    store.mercadoPagoConnected = false;
  }

  res.json({
    success: true,
    data: { message: 'Mercado Pago ha sido desconectado de este comercio.' },
  });
});

// ==========================================
// 2. CREACIÓN DE PREFERENCIA DE PAGO (CHECKOUT)
// ==========================================
paymentRouter.post('/mercadopago/create-preference/:storeId', async (req: Request, res: Response): Promise<void> => {
  const { storeId } = req.params;
  const { orderId } = req.body;

  const order = db.orders.find((o) => o.id === orderId && o.storeId === storeId);
  if (!order) {
    res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Orden no encontrada.' } });
    return;
  }

  const mpConnection = db.mpConnections.find((c) => c.storeId === storeId && c.active);
  if (!mpConnection || !mpConnection.accessTokenEncrypted) {
    res.status(400).json({
      success: false,
      error: {
        code: 'MP_NOT_CONFIGURED',
        message: 'Este comercio aún no ha conectado su cuenta de Mercado Pago.',
      },
    });
    return;
  }

  try {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const preference = await mercadoPagoService.createPreference(mpConnection.accessTokenEncrypted, {
      storeId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      items: order.items.map((i) => ({
        id: i.productId,
        title: i.name,
        quantity: i.quantity,
        unitPrice: i.price,
        pictureUrl: i.image,
      })),
      payer: {
        name: order.customer.firstName,
        surname: order.customer.lastName || '',
        email: order.customer.email,
        phone: order.customer.phone,
      },
      backUrls: {
        success: `${appUrl}/tienda/${order.storeId}?orderId=${order.id}&status=success`,
        pending: `${appUrl}/tienda/${order.storeId}?orderId=${order.id}&status=pending`,
        failure: `${appUrl}/tienda/${order.storeId}?orderId=${order.id}&status=failure`,
      },
      notificationUrl: `${appUrl}/api/payments/mercadopago/webhook`,
    });

    // Registrar intento de pago pendiente (Idempotente)
    const existingPayment = db.payments.find((p) => p.orderId === order.id);
    if (!existingPayment) {
      db.payments.push({
        id: `pay-${Date.now()}`,
        orderId: order.id,
        storeId,
        provider: 'MERCADOPAGO',
        externalId: preference.preferenceId,
        status: 'PENDING',
        amount: order.total,
        currency: 'ARS',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: preference,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error creando preferencia';
    res.status(500).json({ success: false, error: { code: 'PREFERENCE_CREATION_FAILED', message } });
  }
});

// ==========================================
// 3. WEBHOOK DE MERCADO PAGO (Idempotente y Seguro)
// ==========================================
paymentRouter.post('/mercadopago/webhook', async (req: Request, res: Response): Promise<void> => {
  const xSignature = req.headers['x-signature'] as string | undefined;
  const xRequestId = req.headers['x-request-id'] as string | undefined;
  const { type, data, action } = req.body;

  const eventId = data?.id ? String(data.id) : `event-${Date.now()}`;

  // 1. Verificación de firma criptográfica
  const isValidSignature = mercadoPagoService.verifyWebhookSignature(xSignature, xRequestId, eventId);
  if (!isValidSignature) {
    console.warn('[Mercado Pago Webhook] Firma inválida rechazada');
    res.status(401).json({ error: 'INVALID_SIGNATURE' });
    return;
  }

  // 2. Control de Idempotencia: Si el evento ya fue procesado, respondemos 200 OK inmediatamente
  const existingEvent = db.webhookEvents.find((e) => e.eventId === eventId);
  if (existingEvent) {
    res.status(200).json({ received: true, idempotent: true });
    return;
  }

  // 3. Registrar evento en auditoría
  db.webhookEvents.push({
    id: `whe-${Date.now()}`,
    provider: 'MERCADOPAGO',
    eventId,
    eventType: type || action || 'payment',
    status: 'PROCESSED',
    payload: req.body,
    processedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  // 4. Procesar pagos
  if (type === 'payment' || action === 'payment.created' || action === 'payment.updated') {
    const paymentId = String(data?.id);
    
    // Buscar si existe un pago registrado con este externalId o consultar órdenes
    const paymentRecord = db.payments.find((p) => p.externalId === paymentId);
    if (paymentRecord) {
      const storeConnection = db.mpConnections.find((c) => c.storeId === paymentRecord.storeId && c.active);
      if (storeConnection && storeConnection.accessTokenEncrypted) {
        try {
          const mpPayment = await mercadoPagoService.fetchPayment(storeConnection.accessTokenEncrypted, paymentId);
          paymentRecord.status = mpPayment.status;
          paymentRecord.updatedAt = new Date().toISOString();

          // Sincronizar estado del pedido de forma segura
          const order = db.orders.find((o) => o.id === paymentRecord.orderId);
          if (order) {
            order.paymentStatus = mpPayment.status;
            if (mpPayment.status === 'APPROVED') {
              order.status = 'CONFIRMADO';
            } else if (mpPayment.status === 'REJECTED' || mpPayment.status === 'CANCELLED') {
              order.status = 'CANCELADO';
            }
            order.updatedAt = new Date().toISOString();
          }
        } catch (fetchErr) {
          console.error('[Webhook Fetch Payment Error]:', fetchErr);
        }
      }
    }
  }

  res.status(200).json({ received: true });
});

// ==========================================
// 4. SIMULADOR DE WEBHOOK / PAGO (Para Pruebas en Desarrollo)
// ==========================================
paymentRouter.post('/mercadopago/simulate-payment-webhook', (req: Request, res: Response): void => {
  const { orderId, status } = req.body;

  const validStatuses: PaymentStatus[] = ['APPROVED', 'PENDING', 'IN_PROCESS', 'REJECTED', 'CANCELLED', 'REFUNDED'];
  const targetStatus = validStatuses.includes(status) ? status : 'APPROVED';

  const order = db.orders.find((o) => o.id === orderId);
  if (!order) {
    res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Orden no encontrada.' } });
    return;
  }

  // Actualizar o crear registro de pago
  let payment = db.payments.find((p) => p.orderId === orderId);
  if (!payment) {
    payment = {
      id: `pay-sim-${Date.now()}`,
      orderId,
      storeId: order.storeId,
      provider: 'MERCADOPAGO',
      externalId: `sim-mp-${Date.now()}`,
      status: targetStatus,
      amount: order.total,
      currency: 'ARS',
      paymentMethod: 'credit_card',
      paidAt: targetStatus === 'APPROVED' ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.payments.push(payment);
  } else {
    payment.status = targetStatus;
    if (targetStatus === 'APPROVED') payment.paidAt = new Date().toISOString();
    payment.updatedAt = new Date().toISOString();
  }

  // Sincronizar estado del pedido
  order.paymentStatus = targetStatus;
  if (targetStatus === 'APPROVED') {
    order.status = 'CONFIRMADO';
  } else if (targetStatus === 'REJECTED' || targetStatus === 'CANCELLED') {
    order.status = 'CANCELADO';
  }
  order.updatedAt = new Date().toISOString();

  // Registrar en webhook events para idempotencia
  db.webhookEvents.push({
    id: `whe-sim-${Date.now()}`,
    provider: 'MERCADOPAGO',
    eventId: `sim-event-${Date.now()}`,
    eventType: 'payment',
    storeId: order.storeId,
    status: 'PROCESSED',
    payload: { orderId, simulatedStatus: targetStatus },
    processedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    data: {
      message: `Pago simulado con estado "${targetStatus}" aplicado a la orden ${order.orderNumber}.`,
      order,
      payment,
    },
  });
});

// ==========================================
// 5. VERIFICACIÓN DE PAGO POR PEDIDO
// ==========================================
paymentRouter.get('/mercadopago/verify/:storeId/:orderId', async (req: Request, res: Response): Promise<void> => {
  const { storeId, orderId } = req.params;

  const order = db.orders.find((o) => o.id === orderId && o.storeId === storeId);
  if (!order) {
    res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Pedido no encontrado.' } });
    return;
  }

  const payment = db.payments.find((p) => p.orderId === orderId);

  res.json({
    success: true,
    data: {
      order,
      payment: payment || null,
    },
  });
});
