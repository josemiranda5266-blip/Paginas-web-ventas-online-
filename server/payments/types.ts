/**
 * Server-side Mercado Pago & Payment Types
 */

import { PaymentProvider, PaymentStatus } from '../../src/types/index.ts';

export interface CreatePreferenceOptions {
  storeId: string;
  orderId: string;
  orderNumber: string;
  items: Array<{
    id: string;
    title: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    pictureUrl?: string;
  }>;
  payer: {
    name: string;
    surname: string;
    email: string;
    phone?: string;
    address?: {
      street: string;
      number?: number;
      zipCode?: string;
    };
  };
  backUrls: {
    success: string;
    pending: string;
    failure: string;
  };
  notificationUrl: string;
}

export interface MercadoPagoOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
  public_key: string;
  live_mode: boolean;
}

export interface PaymentWebhookResult {
  paymentId: string;
  storeId?: string;
  orderId?: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  amount: number;
  rawPayload: Record<string, unknown>;
}
