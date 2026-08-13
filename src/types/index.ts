/**
 * Multi-tenant E-Commerce SaaS Data Models & Types
 */

export type UserRole = 'SUPERADMIN' | 'ADMIN_COMERCIO' | 'CLIENTE';

export type StoreStatus = 'PENDIENTE' | 'ACTIVO' | 'SUSPENDIDO';

export type OrderStatus =
  | 'PENDIENTE'
  | 'CONFIRMADO'
  | 'PREPARANDO'
  | 'ENVIADO'
  | 'ENTREGADO'
  | 'CANCELADO';

export type DeliveryMethod = 'pickup' | 'delivery';
export type PaymentMethod = 'transfer' | 'cash_on_delivery';

export interface BankDetails {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  cbuCvu: string;
  alias: string;
}

export interface StoreSettings {
  shippingCost: number;
  freeShippingMinAmount: number;
  minOrderAmount: number;
  deliveryMethods: DeliveryMethod[];
  bankDetails: BankDetails;
  acceptCashOnDelivery: boolean;
}

export interface Store {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo: string;
  banner: string;
  phone: string;
  email: string;
  address: string;
  schedule: string;
  socialLinks: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
    website?: string;
  };
  primaryColor: string;
  secondaryColor: string;
  status: StoreStatus;
  settings: StoreSettings;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  storeId?: string; // Only for ADMIN_COMERCIO
  createdAt: string;
}

export interface Category {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  description?: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Product {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  price: number;
  compareAtPrice?: number; // Precio anterior / tachado
  stock: number;
  minStock: number;
  categoryId: string;
  categoryName?: string;
  images: string[];
  active: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  sku?: string;
  image?: string;
}

export interface CustomerInfo {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  notes?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  storeId: string;
  customer: CustomerInfo;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Promotion {
  id: string;
  storeId: string;
  name: string;
  type: 'percentage' | 'fixed_price';
  value: number;
  active: boolean;
  startDate?: string;
  endDate?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  store?: Store;
}

export interface CartItem {
  product: Product;
  quantity: number;
}
