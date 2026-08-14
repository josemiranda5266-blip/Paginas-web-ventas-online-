/**
 * Mercado Pago Multi-Tenant Payment Adapter & Service
 * 
 * Arquitectura:
 * 1. OAuth por comercio (Cada comercio autoriza SU propia cuenta).
 * 2. Cero comisiones de venta descontadas por nuestra app (100% de la venta va a la cuenta del comercio).
 * 3. Encriptación AES-256 de access tokens y refresh tokens.
 * 4. Creación de preferencias de pago con el Access Token del comercio.
 * 5. Verificación criptográfica de firma de Webhooks (HMAC-SHA256).
 * 6. Normalización e idempotencia de eventos de pago.
 */

import { PaymentStatus } from '../../src/types/index.ts';
import { CreatePreferenceOptions, MercadoPagoOAuthTokenResponse, PaymentWebhookResult } from './types.ts';
import { encryptToken, decryptToken, verifyMercadoPagoWebhookSignature } from '../utils/crypto.ts';

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
   * Se incluye el `storeId` en el parámetro `state` para asociar la conexión de forma aislada.
   */
  public getOAuthAuthorizationUrl(storeId: string): string {
    if (!this.clientId) {
      throw new Error('MP_APP_CLIENT_ID no configurado en variables de entorno');
    }
    const baseUrl = 'https://auth.mercadopago.com/authorization';
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      platform_id: 'mp',
      state: storeId,
      redirect_uri: this.redirectUri,
    });
    return `${baseUrl}?${params.toString()}`;
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
   * Crea una preferencia de pago en la cuenta del comercio usando SU propio Access Token.
   */
  public async createPreference(
    encryptedStoreAccessToken: string,
    options: CreatePreferenceOptions
  ): Promise<{ preferenceId: string; initPoint: string; sandboxInitPoint: string }> {
    const storeAccessToken = decryptToken(encryptedStoreAccessToken);
    
    if (!storeAccessToken) {
      throw new Error('El comercio no tiene un Access Token de Mercado Pago válido o conectado.');
    }

    // Modo Sandbox / Demo simulado si el token es de prueba local
    if (storeAccessToken.startsWith('TEST_MOCK_TOKEN_') || storeAccessToken.startsWith('SANDBOX_DEMO_')) {
      const mockPrefId = `pref-sandbox-${options.storeId}-${Date.now()}`;
      return {
        preferenceId: mockPrefId,
        initPoint: `${options.backUrls.success}&preference_id=${mockPrefId}&status=approved`,
        sandboxInitPoint: `${options.backUrls.success}&preference_id=${mockPrefId}&status=approved`,
      };
    }

    const payload = {
      items: options.items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
        quantity: item.quantity,
        unit_price: Number(item.unitPrice),
        currency_id: 'ARS',
        picture_url: item.pictureUrl,
      })),
      payer: {
        name: options.payer.name,
        surname: options.payer.surname,
        email: options.payer.email,
        phone: options.payer.phone ? { number: options.payer.phone } : undefined,
      },
      back_urls: options.backUrls,
      auto_return: 'approved',
      notification_url: options.notificationUrl,
      external_reference: options.orderId,
      statement_descriptor: `Tienda ${options.storeId}`,
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${storeAccessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error creando preferencia de Mercado Pago: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as { id: string; init_point: string; sandbox_init_point: string };
    return {
      preferenceId: result.id,
      initPoint: result.init_point,
      sandboxInitPoint: result.sandbox_init_point || result.init_point,
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
    if (paymentId.startsWith('sim-') || storeAccessToken.startsWith('TEST_MOCK_TOKEN_')) {
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
      [key: string]: unknown;
    };

    return {
      paymentId: String(data.id),
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
    return verifyMercadoPagoWebhookSignature(xSignature, xRequestId, dataId, this.webhookSecret);
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
