/**
 * Client API Service
 * Centraliza las llamadas al backend con manejo de tokens, seguridad y aislamiento de tenant.
 */

import {
  User,
  Store,
  Category,
  Product,
  Order,
  OrderStatus,
  Payment,
  Subscription,
  DeliveryMethod,
  PaymentProvider,
} from '../types/index.ts';

const API_BASE = '/api';

export interface CheckoutPayload {
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentProvider;
  address?: {
    address: string;
    city: string;
    province: string;
    postalCode: string;
    notes?: string;
  };
  notes?: string;
}

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = typeof window !== 'undefined' ? localStorage.getItem('saas_auth_token') : null;
  }

  public setToken(token: string | null): void {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('saas_auth_token', token);
      } else {
        localStorage.removeItem('saas_auth_token');
      }
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(data.error?.message || `Error en la solicitud: ${response.statusText}`);
    }

    return data.data !== undefined ? data.data : data;
  }

  // ==========================================
  // 1. AUTENTICACIÓN Y SESIONES DEMO
  // ==========================================
  public async login(email: string): Promise<{ user: User; token: string; store?: Store }> {
    const res = await this.request<{ user: User; token: string; store?: Store }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    this.setToken(res.token);
    return res;
  }

  public async getMe(): Promise<{ user: User; store?: Store }> {
    return this.request<{ user: User; store?: Store }>('/auth/me');
  }

  public async getDemoUsers(): Promise<Array<{ id: string; email: string; name: string; role: string; storeName?: string }>> {
    return this.request('/auth/demo-users');
  }

  // ==========================================
  // 2. TIENDAS Y CATÁLOGO PÚBLICO
  // ==========================================
  public async getStores(): Promise<Store[]> {
    return this.request<Store[]>('/stores');
  }

  public async getStoreById(storeId: string): Promise<Store> {
    return this.request<Store>(`/stores/${storeId}`);
  }

  public async getStoreBySlug(slug: string): Promise<{ store: Store; categories: Category[]; products: Product[] }> {
    return this.request<{ store: Store; categories: Category[]; products: Product[] }>(`/stores/by-slug/${slug}`);
  }

  public async updateStoreSettings(storeId: string, settingsData: Partial<Store>): Promise<Store> {
    return this.request<Store>(`/stores/${storeId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settingsData),
    });
  }

  public async getStoreSubscription(storeId: string): Promise<Subscription> {
    return this.request<Subscription>(`/stores/${storeId}/subscription`);
  }

  public async getStoreStats(storeId: string): Promise<{
    totalOrders: number;
    totalSales: number;
    pendingOrders: number;
    confirmedOrders: number;
    totalProducts: number;
    lowStockProducts: number;
  }> {
    return this.request(`/stores/${storeId}/stats`);
  }

  // ==========================================
  // 3. PRODUCTOS Y CATEGORÍAS
  // ==========================================
  public async getProductsByStore(storeId: string): Promise<Product[]> {
    return this.request<Product[]>(`/catalog/products/${storeId}`);
  }

  public async getProductById(storeId: string, productId: string): Promise<Product> {
    return this.request<Product>(`/catalog/products/${storeId}/${productId}`);
  }

  public async createProduct(storeId: string, product: Partial<Product>): Promise<Product> {
    return this.request<Product>(`/catalog/products/${storeId}`, {
      method: 'POST',
      body: JSON.stringify(product),
    });
  }

  public async updateProduct(storeId: string, productId: string, product: Partial<Product>): Promise<Product> {
    return this.request<Product>(`/catalog/products/${storeId}/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(product),
    });
  }

  public async deleteProduct(storeId: string, productId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/catalog/products/${storeId}/${productId}`, {
      method: 'DELETE',
    });
  }

  public async getCategoriesByStore(storeId: string): Promise<Category[]> {
    return this.request<Category[]>(`/catalog/categories/${storeId}`);
  }

  public async createCategory(storeId: string, category: Partial<Category>): Promise<Category> {
    return this.request<Category>(`/catalog/categories/${storeId}`, {
      method: 'POST',
      body: JSON.stringify(category),
    });
  }

  // ==========================================
  // 4. CHECKOUT Y PEDIDOS
  // ==========================================
  public async createCheckoutOrder(storeId: string, payload: CheckoutPayload): Promise<Order> {
    return this.request<Order>(`/orders/${storeId}/checkout`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async getStoreOrders(storeId: string): Promise<Order[]> {
    return this.request<Order[]>(`/orders/${storeId}`);
  }

  public async getOrderById(storeId: string, orderId: string): Promise<Order> {
    return this.request<Order>(`/orders/${storeId}/${orderId}`);
  }

  public async updateOrderStatus(storeId: string, orderId: string, status: OrderStatus): Promise<Order> {
    return this.request<Order>(`/orders/${storeId}/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // ==========================================
  // 5. MERCADO PAGO OAUTH & CHECKOUT
  // ==========================================
  public async getMercadoPagoStatus(storeId: string): Promise<{
    connected: boolean;
    mpUserId: string | null;
    publicKey: string | null;
    active: boolean;
    isOAuthConfigured: boolean;
  }> {
    return this.request(`/payments/mercadopago/status/${storeId}`);
  }

  public async getMercadoPagoConnectUrl(storeId: string): Promise<{ url: string }> {
    return this.request<{ url: string }>(`/payments/mercadopago/connect-url/${storeId}`);
  }

  public async connectMercadoPagoDev(storeId: string, mpUserId?: string): Promise<{ message: string }> {
    return this.request(`/payments/mercadopago/dev-connect/${storeId}`, {
      method: 'POST',
      body: JSON.stringify({ mpUserId }),
    });
  }

  public async disconnectMercadoPago(storeId: string): Promise<{ message: string }> {
    return this.request(`/payments/mercadopago/disconnect/${storeId}`, {
      method: 'POST',
    });
  }

  public async createMercadoPagoPreference(storeId: string, orderId: string): Promise<{
    preferenceId: string;
    initPoint: string;
    sandboxInitPoint: string;
  }> {
    return this.request(`/payments/mercadopago/create-preference/${storeId}`, {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    });
  }

  public async simulateMercadoPagoWebhook(orderId: string, status: string): Promise<{
    message: string;
    order: Order;
    payment: Payment;
  }> {
    return this.request('/payments/mercadopago/simulate-payment-webhook', {
      method: 'POST',
      body: JSON.stringify({ orderId, status }),
    });
  }

  public async verifyPayment(storeId: string, orderId: string): Promise<{
    order: Order;
    payment: Payment | null;
  }> {
    return this.request(`/payments/mercadopago/verify/${storeId}/${orderId}`);
  }

  // ==========================================
  // 6. SUPERADMIN
  // ==========================================
  public async getAdminStats(): Promise<{
    totalStores: number;
    activeStores: number;
    suspendedStores: number;
    totalOrders: number;
    totalSales: number;
    totalProducts: number;
    totalUsers: number;
  }> {
    return this.request('/admin/stats');
  }

  public async getAdminStores(): Promise<Array<Store & { productsCount: number; ordersCount: number; adminEmail: string | null }>> {
    return this.request('/admin/stores');
  }

  public async getAdminSubscriptions(): Promise<{
    subscriptions: Array<Subscription & { storeName: string; storeSlug: string; storeStatus: string }>;
    mrr: number;
    totalSubscribers: number;
  }> {
    return this.request('/admin/subscriptions');
  }

  public async updateSubscription(storeId: string, data: { amount?: number; planName?: string; status?: string }): Promise<Subscription> {
    return this.request(`/admin/subscriptions/${storeId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  public async getAuditLogs(): Promise<Array<Record<string, unknown>>> {
    return this.request('/admin/audit-logs');
  }

  public async runAutomatedTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: Array<{
      id: number;
      name: string;
      category: string;
      passed: boolean;
      error?: string;
      durationMs: number;
    }>;
  }> {
    return this.request('/admin/run-tests', { method: 'POST' });
  }

  public async createStore(payload: {
    name: string;
    slug: string;
    email: string;
    phone?: string;
    adminName?: string;
    adminEmail: string;
    primaryColor?: string;
  }): Promise<{ store: Store; adminUser: User }> {
    return this.request('/admin/stores', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateStoreStatus(storeId: string, status: 'ACTIVO' | 'SUSPENDIDO' | 'PENDIENTE'): Promise<Store> {
    return this.request(`/admin/stores/${storeId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }
}

export const api = new ApiService();
