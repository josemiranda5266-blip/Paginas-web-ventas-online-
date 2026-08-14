/**
 * Mercado Pago Multi-Tenant Payment Adapter & Service
 * 
 * Arquitectura y Principios:
 * 1. OAuth por comercio (Cada comercio conecta y autoriza SU propia cuenta).
 * 2. Cero comisiones de venta cobradas por la plataforma (100% de la venta va a la cuenta del comercio).
 * 3. Encriptación AES-256-GCM de access tokens y refresh tokens en base de datos.
 * 4. Mercado Pago Checkout API -> API de Orders (/v1/orders).
 * 5. Verificación criptográfica de firma de Webhooks (HMAC-SHA256 timingSafeEqual).
 * 6. Idempotencia y trazabilidad transaccional en PostgreSQL.
 */

import { PaymentStatus } from '../../src/types/index.ts';
import {
  CreateMercadoPagoOrderOptions,
  MercadoPagoOrderResponse,
  MercadoPagoOAuthTokenResponse,
  PaymentWebhookResult,
} from './types.ts';
import {
  encryptToken,
  decryptToken,
  generateOAuthState,
  verifyOAuthState,
  verifyMercadoPagoWebhookSignature,
} from '../utils/crypto.ts';

export class MercadoPagoService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private webhookSecret: string;

  constructor() {
    this.clientId = process.env.MP_APP_CLIENT_ID || '';
    this.clientSecret = process.env.MP_APP_CLIENT_SECRET || '';
    this.redirectUri = process.env.MP_OAUTH_REDIRECT_URI || '';
    this.webhookSecret = process.env.MP_WEBHOOK_SECRET || '';
  }

  /**
   * Verifica si las credenciales de la aplicación integradora están configuradas en el entorno.
   */
  public isOAuthConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  /**
   * Genera la URL de autorización OAuth de Mercado Pago para que el comercio conecte su cuenta.
   * Se incluye un `state` firmado criptográficamente para asociar la conexión de forma aislada y prevenir CSRF.
   */
  public getOAuthAuthorizationUrl(storeId: string): string {
    if (!this.clientId) {
      throw new Error('MP_APP_CLIENT_ID no configurado en variables de entorno');
    }
    const signedState = generateOAuthState(storeId);
    const baseUrl = 'https://auth.mercadopago.com/authorization';
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      platform_id: 'mp',
      state: signedState,
      redirect_uri: this.redirectUri,
    });
    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Valida el parámetro state retornado por el callback de OAuth.
   */
  public verifyOAuthState(state: string): string | null {
    return verifyOAuthState(state);
  }

  /**
   * Intercambia el código de autorización devuelto por Mercado Pago por los tokens del comercio.
   */
  public async exchangeOAuthCode(code: string): Promise<MercadoPagoOAuthTokenResponse> {
    if (!this.clientSecret || !this.clientId) {
      throw new Error('Credenciales de la aplicación Mercado Pago (MP_APP_CLIENT_ID / MP_APP_CLIENT_SECRET) no configuradas');
    }

    const response = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_secret: this.clientSecret,
        client_id: this.clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error en Mercado Pago OAuth exchange: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as MercadoPagoOAuthTokenResponse;
    return data;
  }

  /**
   * Renueva un access_token expirado usando el refresh_token del comercio.
   */
  public async refreshOAuthToken(encryptedRefreshToken: string): Promise<MercadoPagoOAuthTokenResponse> {
    const refreshToken = decryptToken(encryptedRefreshToken);
    if (!refreshToken) {
      throw new Error('Refresh token inválido o no desencriptable');
    }

    const response = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_secret: this.clientSecret,
        client_id: this.clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error al renovar token de Mercado Pago: ${response.status} - ${errorText}`);
    }

    return (await response.json()) as MercadoPagoOAuthTokenResponse;
  }

  /**
   * Crea una orden en Mercado Pago utilizando la API Oficial de Orders (/v1/orders)
   * con el Access Token propio del comercio.
   * Cero comisión sobre ventas (marketplace_fee = 0).
   */
  public async createOrder(
    encryptedStoreAccessToken: string,
    options: CreateMercadoPagoOrderOptions
  ): Promise<MercadoPagoOrderResponse> {
    const storeAccessToken = decryptToken(encryptedStoreAccessToken);
    
    if (!storeAccessToken) {
      throw new Error('El comercio no tiene un Access Token de Mercado Pago válido o conectado.');
    }

    // Estructura oficial de Mercado Pago Orders API
    const orderPayload = {
      type: 'online',
      external_reference: options.orderId,
      total_amount: Number(options.totalAmount),
      items: options.items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description || item.title,
        quantity: Number(item.quantity),
        unit_price: Number(item.unitPrice),
        currency_id: 'ARS',
        picture_url: item.pictureUrl,
      })),
      payer: {
        email: options.payer.email,
        first_name: options.payer.name,
        last_name: options.payer.surname,
        phone: options.payer.phone ? { number: options.payer.phone } : undefined,
      },
      notification_url: options.notificationUrl,
      back_urls: options.backUrls,
      statement_descriptor: options.storeName ? `Tienda ${options.storeName}` : `Tienda ${options.storeId}`,
    };

    // Modo Sandbox / Dev Token
    if (storeAccessToken.startsWith('TEST_MOCK_TOKEN_') || storeAccessToken.startsWith('SANDBOX_DEMO_')) {
      const mockMpOrderId = `mp-ord-sandbox-${options.orderId}-${Date.now()}`;
      const mockInitPoint = `${options.backUrls.success}&mp_order_id=${mockMpOrderId}&status=approved`;
      return {
        orderId: options.orderId,
        mpOrderId: mockMpOrderId,
        status: 'opened',
        initPoint: mockInitPoint,
        sandboxInitPoint: mockInitPoint,
        externalReference: options.orderId,
        totalAmount: options.totalAmount,
        rawResponse: { simulated: true, payload: orderPayload },
      };
    }

    const response = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${storeAccessToken}`,
        'X-Idempotency-Key': `order-${options.orderId}`,
      },
      body: JSON.stringify(orderPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error creando Orden en Mercado Pago (/v1/orders): ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as {
      id: string;
      status: string;
      init_point?: string;
      checkout_url?: string;
      sandbox_init_point?: string;
      external_reference?: string;
      total_amount?: number;
      [key: string]: unknown;
    };

    const initPoint = result.init_point || result.checkout_url || '';
    const sandboxInitPoint = result.sandbox_init_point || initPoint;

    return {
      orderId: options.orderId,
      mpOrderId: String(result.id),
      status: result.status || 'opened',
      initPoint,
      sandboxInitPoint,
      externalReference: result.external_reference || options.orderId,
      totalAmount: result.total_amount || options.totalAmount,
      rawResponse: result,
    };
  }

  /**
   * Consulta una Orden en Mercado Pago (/v1/orders/{id} o /merchant_orders/{id})
   */
  public async fetchOrder(
    encryptedStoreAccessToken: string,
    mpOrderId: string
  ): Promise<{ id: string; status: string; payments: Array<{ id: string; status: string; amount: number }>; externalReference?: string }> {
    const storeAccessToken = decryptToken(encryptedStoreAccessToken);
    
    if (!storeAccessToken) {
      throw new Error('Access Token del comercio no disponible.');
    }

    if (mpOrderId.startsWith('mp-ord-sandbox-') || storeAccessToken.startsWith('SANDBOX_DEMO_')) {
      return {
        id: mpOrderId,
        status: 'closed',
        payments: [{ id: `pay-sim-${Date.now()}`, status: 'approved', amount: 100 }],
      };
    }

    // Consultar Orden en Mercado Pago
    const response = await fetch(`https://api.mercadopago.com/v1/orders/${mpOrderId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${storeAccessToken}`,
      },
    });

    if (!response.ok) {
      // Fallback a merchant_orders si la orden fue creada bajo esquema merchant_order
      const moRes = await fetch(`https://api.mercadopago.com/merchant_orders/${mpOrderId}`, {
        headers: { Authorization: `Bearer ${storeAccessToken}` },
      });
      if (!moRes.ok) {
        throw new Error(`Error consultando Orden de Mercado Pago: ${response.status}`);
      }
      const moData = (await moRes.json()) as { id: number | string; status: string; payments?: Array<{ id: number; status: string; transaction_amount: number }>; external_reference?: string };
      return {
        id: String(moData.id),
        status: moData.status,
        externalReference: moData.external_reference,
        payments: (moData.payments || []).map((p) => ({ id: String(p.id), status: p.status, amount: p.transaction_amount })),
      };
    }

    const data = (await response.json()) as {
      id: string;
      status: string;
      external_reference?: string;
      payments?: Array<{ id: string; status: string; transaction_amount: number }>;
    };

    return {
      id: String(data.id),
      status: data.status,
      externalReference: data.external_reference,
      payments: (data.payments || []).map((p) => ({ id: String(p.id), status: p.status, amount: p.transaction_amount })),
    };
  }

  /**
   * Consulta el estado de un pago directamente en la API de Mercado Pago con el token del comercio.
   */
  public async fetchPayment(
    encryptedStoreAccessToken: string,
    paymentId: string
  ): Promise<PaymentWebhookResult> {
    const storeAccessToken = decryptToken(encryptedStoreAccessToken);
    
    if (!storeAccessToken) {
      throw new Error('Access Token del comercio no disponible para consultar el pago.');
    }

    // Si es un ID de prueba simulado en desarrollo
    if (paymentId.startsWith('sim-') || storeAccessToken.startsWith('SANDBOX_DEMO_') || storeAccessToken.startsWith('TEST_MOCK_TOKEN_')) {
      return {
        paymentId,
        status: 'APPROVED',
        provider: 'MERCADOPAGO',
        amount: 0,
        rawPayload: { simulated: true, paymentId, status: 'approved' },
      };
    }

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${storeAccessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error consultando pago en Mercado Pago: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      id: number | string;
      status: string;
      transaction_amount: number;
      external_reference?: string;
      order?: { id?: string };
      [key: string]: unknown;
    };

    return {
      paymentId: String(data.id),
      mpOrderId: data.order?.id ? String(data.order.id) : undefined,
      orderId: data.external_reference,
      status: this.normalizePaymentStatus(data.status),
      provider: 'MERCADOPAGO',
      amount: data.transaction_amount,
      rawPayload: data,
    };
  }

  /**
   * Valida la firma del webhook recibido.
   */
  public verifyWebhookSignature(
    xSignature: string | undefined,
    xRequestId: string | undefined,
    dataId: string
  ): boolean {
    const secret = process.env.MP_WEBHOOK_SECRET || this.webhookSecret;
    return verifyMercadoPagoWebhookSignature(xSignature, xRequestId, dataId, secret);
  }

  /**
   * Normaliza los estados nativos de Mercado Pago a tipos estrictos del sistema.
   */
  public normalizePaymentStatus(mpStatus: string): PaymentStatus {
    switch (mpStatus?.toLowerCase()) {
      case 'approved':
        return 'APPROVED';
      case 'in_process':
      case 'pending':
      case 'authorized':
        return 'IN_PROCESS';
      case 'rejected':
        return 'REJECTED';
      case 'cancelled':
        return 'CANCELLED';
      case 'refunded':
      case 'charged_back':
        return 'REFUNDED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Helper para encriptar tokens antes de persistirlos.
   */
  public encrypt(token: string): string {
    return encryptToken(token);
  }

  /**
   * Helper para desencriptar tokens.
   */
  public decrypt(encrypted: string): string {
    return decryptToken(encrypted);
  }
}

export const mercadoPagoService = new MercadoPagoService();
