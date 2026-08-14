/**
 * PAGINAS WEB VENTAS ONLINE - TIPOS Y MODELOS TYPESCRIPT STRICT
 * Definiciones centralizadas y estrictas para frontend y backend.
 */

// ==========================================
// 1. Roles y Autenticación
// ==========================================
export type UserRole = 'SUPERADMIN' | 'ADMIN_COMERCIO' | 'CLIENTE';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  storeId?: string; // Solo asignado a ADMIN_COMERCIO
  createdAt: string;
  updatedAt?: string;
}

export interface AuthSession {
  user: User;
  token: string;
  store?: Store;
}

// ==========================================
// 2. Comercio / Store (Tenant)
// ==========================================
export type StoreStatus = 'PENDIENTE' | 'ACTIVO' | 'SUSPENDIDO';

export interface BankDetails {
  bankName: string;
  accountHolder: string;
  accountNumber?: string;
  cbuCvu: string;
  alias: string;
}

export interface StoreSettings {
  id?: string;
  storeId?: string;
  shippingCost?: number;
  freeShippingMinAmount?: number;
  minOrderAmount?: number;
  allowPickup?: boolean;
  allowDelivery?: boolean;
  acceptCashOnDelivery?: boolean;
  acceptBankTransfer?: boolean;
  bankDetails?: BankDetails;
  instagramUrl?: string;
  facebookUrl?: string;
  whatsappNumber?: string;
  websiteUrl?: string;
}

export interface Store {
  id: string;
  slug: string;
  name: string;
  description?: string;
  logo?: string;
  banner?: string;
  phone?: string;
  email?: string;
  address?: string;
  schedule?: string;
  primaryColor: string;
  secondaryColor: string;
  status: StoreStatus;
  settings?: StoreSettings;
  subscription?: Subscription;
  mercadoPagoConnected?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 3. Mercado Pago (OAuth Multi-Tenant & Pagos)
// ==========================================
export interface MercadoPagoConnection {
  id: string;
  storeId: string;
  mpUserId: string;
  accessTokenEncrypted?: string;
  publicKey?: string;
  expiresAt?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PaymentProvider = 'MERCADOPAGO' | 'TRANSFER' | 'CASH_ON_DELIVERY';

export type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'IN_PROCESS'
  | 'REJECTED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface Payment {
  id: string;
  orderId: string;
  storeId: string;
  provider: PaymentProvider;
  externalId?: string; // ID asignado por Mercado Pago
  status: PaymentStatus;
  amount: number;
  currency: string;
  paymentMethod?: string;
  paidAt?: string;
  rawResponse?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Interfaz para la creación de Preferencia en Mercado Pago
export interface MercadoPagoPreferenceItem {
  id: string;
  title: string;
  description?: string;
  quantity: number;
  unit_price: number;
  currency_id: string;
  picture_url?: string;
}

export interface MercadoPagoPreferencePayload {
  items: MercadoPagoPreferenceItem[];
  payer?: {
    name?: string;
    surname?: string;
    email?: string;
    phone?: {
      area_code?: string;
      number?: string;
    };
    address?: {
      street_name?: string;
      street_number?: number;
      zip_code?: string;
    };
  };
  back_urls: {
    success: string;
    pending: string;
    failure: string;
  };
  auto_return?: 'approved' | 'all';
  notification_url: string;
  external_reference: string; // ID de la orden en nuestro sistema
  statement_descriptor?: string;
  expires?: boolean;
}

export interface MercadoPagoWebhookNotification {
  id: string | number;
  live_mode: boolean;
  type: string;
  date_created: string;
  application_id: string;
  user_id: string;
  version: number;
  api_version: string;
  action: string;
  data: {
    id: string;
  };
}

// ==========================================
// 4. Catálogo: Categorías y Productos
// ==========================================
export interface Category {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  description?: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  storeId: string;
  categoryId: string;
  categoryName?: string;
  name: string;
  slug: string;
  sku?: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  minStock: number;
  images: string[];
  active: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 5. Clientes y Direcciones
// ==========================================
export interface Customer {
  id: string;
  storeId: string;
  userId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  addresses?: Address[];
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  id: string;
  customerId: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  notes?: string;
  isDefault: boolean;
}

// ==========================================
// 6. Pedidos y Carrito
// ==========================================
export type OrderStatus =
  | 'PENDIENTE'
  | 'CONFIRMADO'
  | 'PREPARANDO'
  | 'ENVIADO'
  | 'ENTREGADO'
  | 'CANCELADO';

export type DeliveryMethod = 'PICKUP' | 'DELIVERY';

export interface OrderItem {
  id?: string;
  orderId?: string;
  storeId: string;
  productId: string;
  name: string;
  sku?: string;
  price: number; // Precio unitario congelado
  quantity: number;
  subtotal: number;
  image?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  storeId: string;
  customerId: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  address?: Address;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentProvider;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

// ==========================================
// 7. Promociones y Auditoría
// ==========================================
export type PromotionType = 'PERCENTAGE' | 'FIXED_PRICE';

export interface Promotion {
  id: string;
  storeId: string;
  name: string;
  type: PromotionType;
  value: number;
  active: boolean;
  startDate?: string;
  endDate?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  storeId?: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

// ==========================================
// 8. Suscripciones SaaS (Fija mensual, 0% comisión)
// ==========================================
export type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED';

export interface Subscription {
  id: string;
  storeId: string;
  planName: string;
  amount: number; // e.g. 15000 ARS/mes
  currency: string; // ARS
  status: SubscriptionStatus;
  interval: 'MONTHLY' | 'YEARLY';
  commissionRate: number; // Siempre 0.00%
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 9. Registro de Webhook Events (Idempotencia)
// ==========================================
export interface WebhookEvent {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  storeId?: string;
  status: 'PROCESSED' | 'FAILED' | 'IGNORED';
  payload: Record<string, unknown>;
  processedAt: string;
  createdAt: string;
}

// ==========================================
// 10. Respuestas API Estándar
// ==========================================
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}
