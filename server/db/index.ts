/**
 * PostgreSQL / Prisma ORM Database Repository & Service Layer
 * 
 * Implementa:
 * - Aislamiento estricto multi-tenant por Store / Tenant
 * - Transacciones atómicas de Stock y Concurrencia real
 * - Congelamiento histórico de precios en Order / OrderItem
 * - Idempotencia persistente en WebhookEvent con constraint UNIQUE
 * - Registro seguro de auditoría
 * - Almacenamiento seguro de credenciales con hash PBKDF2 y cifrado AES-256-GCM
 */

import { prisma } from './prisma.ts';
import { hashPassword, verifyPassword } from '../utils/crypto.ts';
import {
  UserRole,
  StoreStatus,
  OrderStatus,
  PaymentStatus,
  PaymentProvider,
  DeliveryMethod,
} from '../../src/types/index.ts';

export interface CheckoutCustomerData {
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
}

export interface CheckoutItemInput {
  productId: string;
  quantity: number;
  price?: number; // Ignorado intencionalmente: El precio se recalcula en backend
}

export interface CheckoutInput {
  customer: CheckoutCustomerData;
  items: CheckoutItemInput[];
  deliveryMethod?: 'PICKUP' | 'DELIVERY';
  paymentMethod?: PaymentProvider;
  notes?: string;
  address?: {
    address: string;
    city: string;
    province: string;
    postalCode: string;
    notes?: string;
  };
}

export class DatabaseRepository {
  public prisma = prisma;

  // Mutex / Lock local para simular serialización de transacciones si se ejecutan tests concurrentes en runtime
  private stockLockMap = new Map<string, Promise<unknown>>();

  private async acquireLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.stockLockMap.get(key) || Promise.resolve();
    let resolveLock!: () => void;
    const currentLock = new Promise<void>((r) => {
      resolveLock = r;
    });

    this.stockLockMap.set(key, prev.then(() => currentLock));

    try {
      await prev;
      return await fn();
    } finally {
      resolveLock();
      if (this.stockLockMap.get(key) === currentLock) {
        this.stockLockMap.delete(key);
      }
    }
  }

  // =================================================================
  // 1. USUARIOS Y AUTENTICACIÓN
  // =================================================================

  public async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { store: true },
    });
  }

  public async findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { store: true },
    });
  }

  public async createUser(data: {
    email: string;
    password?: string;
    passwordHash?: string;
    name: string;
    role: UserRole;
    phone?: string;
    storeId?: string;
  }) {
    const finalHash = data.passwordHash || (data.password ? hashPassword(data.password) : hashPassword('DefaultPass2026!'));
    return this.prisma.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        passwordHash: finalHash,
        name: data.name,
        role: data.role,
        phone: data.phone,
        storeId: data.storeId,
      },
    });
  }

  public async authenticateUser(email: string, passwordPlain: string) {
    const user = await this.findUserByEmail(email);
    if (!user || !user.passwordHash) {
      return null;
    }

    const isValid = verifyPassword(passwordPlain, user.passwordHash);
    if (!isValid) {
      return null;
    }

    return user;
  }

  public async listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        storeId: true,
        phone: true,
        createdAt: true,
        store: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  // =================================================================
  // 2. STORES (TENANTS)
  // =================================================================

  public async findStoreById(id: string) {
    return this.prisma.store.findUnique({
      where: { id },
      include: {
        settings: true,
        subscription: true,
        mercadoPago: true,
      },
    });
  }

  public async findStoreBySlug(slug: string) {
    return this.prisma.store.findUnique({
      where: { slug: slug.toLowerCase().trim() },
      include: {
        settings: true,
        subscription: true,
        mercadoPago: {
          select: {
            id: true,
            mpUserId: true,
            publicKey: true,
            active: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  public async listStores() {
    return this.prisma.store.findMany({
      include: {
        settings: true,
        subscription: true,
        mercadoPago: {
          select: { id: true, mpUserId: true, active: true },
        },
        _count: {
          select: { products: true, orders: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async createStore(data: {
    id?: string;
    slug: string;
    name: string;
    description?: string;
    logo?: string;
    banner?: string;
    phone?: string;
    email?: string;
    address?: string;
    schedule?: string;
    primaryColor?: string;
    secondaryColor?: string;
    status?: StoreStatus;
    settings?: {
      shippingCost?: number;
      freeShippingMinAmount?: number;
      minOrderAmount?: number;
      allowPickup?: boolean;
      allowDelivery?: boolean;
      acceptCashOnDelivery?: boolean;
      acceptBankTransfer?: boolean;
      bankName?: string;
      bankAccountHolder?: string;
      bankAccountNumber?: string;
      bankCbuCvu?: string;
      bankAlias?: string;
      instagramUrl?: string;
      whatsappNumber?: string;
    };
  }) {
    const storeId = data.id || `store-${data.slug.toLowerCase().trim()}`;
    const cleanSlug = data.slug.toLowerCase().trim();

    return this.prisma.store.create({
      data: {
        id: storeId,
        slug: cleanSlug,
        name: data.name,
        description: data.description || '',
        logo: data.logo || '',
        banner: data.banner || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        schedule: data.schedule || '',
        primaryColor: data.primaryColor || '#2563eb',
        secondaryColor: data.secondaryColor || '#1e293b',
        status: data.status || 'ACTIVO',
        settings: {
          create: {
            shippingCost: data.settings?.shippingCost || 0,
            freeShippingMinAmount: data.settings?.freeShippingMinAmount || 0,
            minOrderAmount: data.settings?.minOrderAmount || 0,
            allowPickup: data.settings?.allowPickup ?? true,
            allowDelivery: data.settings?.allowDelivery ?? true,
            acceptCashOnDelivery: data.settings?.acceptCashOnDelivery ?? true,
            acceptBankTransfer: data.settings?.acceptBankTransfer ?? true,
            bankName: data.settings?.bankName || '',
            bankAccountHolder: data.settings?.bankAccountHolder || '',
            bankAccountNumber: data.settings?.bankAccountNumber || '',
            bankCbuCvu: data.settings?.bankCbuCvu || '',
            bankAlias: data.settings?.bankAlias || '',
            instagramUrl: data.settings?.instagramUrl || '',
            whatsappNumber: data.settings?.whatsappNumber || '',
          },
        },
        subscription: {
          create: {
            planName: 'Plan Comercio Pro (Fijo)',
            amount: 15000,
            currency: 'ARS',
            status: 'ACTIVE',
            interval: 'MONTHLY',
            commissionRate: 0.0,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
      include: {
        settings: true,
        subscription: true,
      },
    });
  }

  public async updateStore(id: string, data: Partial<{
    name: string;
    description: string;
    phone: string;
    email: string;
    address: string;
    schedule: string;
    primaryColor: string;
    secondaryColor: string;
    status: StoreStatus;
    settings: Record<string, unknown>;
  }>) {
    const { settings, ...storeFields } = data;

    return this.prisma.store.update({
      where: { id },
      data: {
        ...storeFields,
        settings: settings
          ? {
              upsert: {
                create: { ...settings },
                update: { ...settings },
              },
            }
          : undefined,
      },
      include: { settings: true, subscription: true },
    });
  }

  // =================================================================
  // 3. PRODUCTOS Y CATEGORÍAS (MULTI-TENANT)
  // =================================================================

  public async findProductsByStore(storeId: string, options?: { onlyActive?: boolean }) {
    return this.prisma.product.findMany({
      where: {
        storeId,
        ...(options?.onlyActive ? { active: true } : {}),
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async findProductById(storeId: string, productId: string) {
    return this.prisma.product.findFirst({
      where: { id: productId, storeId },
      include: { category: true },
    });
  }

  public async createProduct(storeId: string, data: {
    id?: string;
    categoryId: string;
    name: string;
    slug?: string;
    sku?: string;
    description?: string;
    price: number;
    compareAtPrice?: number;
    stock?: number;
    minStock?: number;
    images?: string[];
    active?: boolean;
    featured?: boolean;
  }) {
    const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return this.prisma.product.create({
      data: {
        id: data.id,
        storeId,
        categoryId: data.categoryId,
        name: data.name,
        slug,
        sku: data.sku || `SKU-${Date.now().toString().slice(-6)}`,
        description: data.description || '',
        price: data.price,
        compareAtPrice: data.compareAtPrice,
        stock: data.stock ?? 0,
        minStock: data.minStock ?? 0,
        images: data.images && data.images.length > 0 ? data.images : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80'],
        active: data.active ?? true,
        featured: data.featured ?? false,
      },
      include: { category: true },
    });
  }

  public async updateProduct(storeId: string, productId: string, data: Partial<{
    name: string;
    slug: string;
    sku: string;
    description: string;
    price: number;
    compareAtPrice: number;
    stock: number;
    minStock: number;
    images: string[];
    active: boolean;
    featured: boolean;
    categoryId: string;
  }>) {
    return this.prisma.product.update({
      where: { id: productId, storeId },
      data: { ...data },
      include: { category: true },
    });
  }

  public async deleteProduct(storeId: string, productId: string) {
    return this.prisma.product.delete({
      where: { id: productId, storeId },
    });
  }

  public async findCategoriesByStore(storeId: string, options?: { onlyActive?: boolean }) {
    return this.prisma.category.findMany({
      where: {
        storeId,
        ...(options?.onlyActive ? { active: true } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  public async createCategory(storeId: string, data: {
    id?: string;
    name: string;
    slug: string;
    description?: string;
    active?: boolean;
    sortOrder?: number;
  }) {
    return this.prisma.category.create({
      data: {
        id: data.id,
        storeId,
        name: data.name,
        slug: data.slug.toLowerCase().trim(),
        description: data.description || '',
        active: data.active ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  public async updateCategory(storeId: string, categoryId: string, data: Partial<{
    name: string;
    slug: string;
    description: string;
    active: boolean;
    sortOrder: number;
  }>) {
    return this.prisma.category.update({
      where: { id: categoryId, storeId },
      data: { ...data },
    });
  }

  public async deleteCategory(storeId: string, categoryId: string) {
    return this.prisma.category.delete({
      where: { id: categoryId, storeId },
    });
  }

  // =================================================================
  // 4. CHECKOUT ATÓMICO CON CONCURRENCIA Y CONGELAMIENTO DE PRECIOS
  // =================================================================

  public async checkoutAtomic(storeId: string, input: CheckoutInput) {
    return this.acquireLock(`checkout-${storeId}`, async () => {
      // 1. Validar estado de la tienda
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        include: { settings: true },
      });

      if (!store) {
        throw new Error('STORE_NOT_FOUND');
      }

      if (store.status === 'SUSPENDIDO') {
        const err = new Error('STORE_SUSPENDED');
        (err as unknown as { code: string }).code = 'STORE_SUSPENDED';
        throw err;
      }

      if (!input.items || input.items.length === 0) {
        throw new Error('EMPTY_CART');
      }

      // 2. Transacción atómica de stock y cálculo de precios exclusivamente en backend
      return this.prisma.$transaction(async (tx) => {
        let calculatedSubtotal = 0;
        const orderItemsData: Array<{
          productId: string;
          name: string;
          sku: string | null;
          price: number;
          quantity: number;
          subtotal: number;
          image: string | null;
        }> = [];

        for (const item of input.items) {
          // Consultar producto directamente de PostgreSQL
          const product = await tx.product.findFirst({
            where: { id: item.productId, storeId },
          });

          if (!product) {
            const err = new Error(`PRODUCT_NOT_FOUND: ${item.productId}`);
            (err as unknown as { code: string }).code = 'PRODUCT_NOT_FOUND';
            throw err;
          }

          if (!product.active) {
            const err = new Error(`PRODUCT_INACTIVE: ${product.name}`);
            (err as unknown as { code: string }).code = 'PRODUCT_INACTIVE';
            throw err;
          }

          const requestedQty = Math.max(1, Math.floor(Number(item.quantity) || 1));

          // Verificación de stock para concurrencia
          if (product.stock < requestedQty) {
            const err = new Error(`Stock insuficiente para "${product.name}". Disponible: ${product.stock}`);
            (err as unknown as { code: string }).code = 'INSUFFICIENT_STOCK';
            throw err;
          }

          // Descontar stock atómicamente
          const updatedProduct = await tx.product.update({
            where: { id: product.id },
            data: { stock: { decrement: requestedQty } },
          });

          // Verificación adicional de seguridad contra stock negativo
          if (updatedProduct.stock < 0) {
            const err = new Error(`Stock negativo detectado para "${product.name}".`);
            (err as unknown as { code: string }).code = 'INSUFFICIENT_STOCK';
            throw err;
          }

          const unitPrice = Number(product.price);
          const itemSubtotal = unitPrice * requestedQty;
          calculatedSubtotal += itemSubtotal;

          orderItemsData.push({
            productId: product.id,
            name: product.name,
            sku: product.sku,
            price: unitPrice, // Precio unitario congelado
            quantity: requestedQty,
            subtotal: itemSubtotal,
            image: product.images[0] || null,
          });
        }

        // Calcular costo de envío
        let shippingCost = 0;
        if (input.deliveryMethod === 'DELIVERY') {
          const freeMin = Number(store.settings?.freeShippingMinAmount || 0);
          if (freeMin > 0 && calculatedSubtotal >= freeMin) {
            shippingCost = 0;
          } else {
            shippingCost = Number(store.settings?.shippingCost || 0);
          }
        }

        const total = calculatedSubtotal + shippingCost;

        // Crear o buscar Customer
        let customer = await tx.customer.findFirst({
          where: { storeId, email: input.customer.email.toLowerCase().trim() },
        });

        if (!customer) {
          customer = await tx.customer.create({
            data: {
              storeId,
              firstName: input.customer.firstName,
              lastName: input.customer.lastName || '',
              email: input.customer.email.toLowerCase().trim(),
              phone: input.customer.phone || null,
            },
          });
        }

        // Crear Dirección si aplica
        let addressId: string | null = null;
        if (input.address) {
          const addressRecord = await tx.address.create({
            data: {
              customerId: customer.id,
              address: input.address.address,
              city: input.address.city,
              province: input.address.province,
              postalCode: input.address.postalCode,
              notes: input.address.notes || null,
            },
          });
          addressId = addressRecord.id;
        }

        const countOrders = await tx.order.count({ where: { storeId } });
        const orderNumber = `#${String(countOrders + 1).padStart(4, '0')}`;

        // Crear Orden con OrderItems congelados
        const newOrder = await tx.order.create({
          data: {
            orderNumber,
            storeId,
            customerId: customer.id,
            addressId,
            deliveryMethod: (input.deliveryMethod as DeliveryMethod) || 'DELIVERY',
            subtotal: calculatedSubtotal,
            shippingCost,
            total,
            status: 'PENDIENTE',
            notes: input.notes || null,
            items: {
              create: orderItemsData.map((oi) => ({
                productId: oi.productId,
                name: oi.name,
                sku: oi.sku,
                price: oi.price,
                quantity: oi.quantity,
                subtotal: oi.subtotal,
                image: oi.image,
              })),
            },
            payments: {
              create: {
                storeId,
                provider: input.paymentMethod || 'TRANSFER',
                status: 'PENDING',
                amount: total,
                currency: 'ARS',
              },
            },
          },
          include: {
            items: true,
            payments: true,
            customer: true,
            address: true,
          },
        });

        // Registrar auditoría
        await tx.auditLog.create({
          data: {
            storeId,
            action: 'ORDER_CREATE',
            entity: 'Order',
            entityId: newOrder.id,
            details: {
              orderNumber: newOrder.orderNumber,
              total: Number(newOrder.total),
              itemsCount: orderItemsData.length,
            },
          },
        });

        return newOrder;
      });
    });
  }

  // =================================================================
  // 5. GESTIÓN Y CANCELACIÓN DE PEDIDOS (RESTAURACIÓN IDEMPOTENTE)
  // =================================================================

  public async findOrdersByStore(storeId: string) {
    return this.prisma.order.findMany({
      where: { storeId },
      include: {
        items: true,
        payments: true,
        customer: true,
        address: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async findOrderById(storeId: string, orderId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: {
        items: true,
        payments: true,
        customer: true,
        address: true,
      },
    });
  }

  public async cancelOrderAndRestoreStock(storeId: string, orderId: string, userId?: string) {
    return this.acquireLock(`order-${orderId}`, async () => {
      return this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, storeId },
          include: { items: true },
        });

        if (!order) {
          throw new Error('ORDER_NOT_FOUND');
        }

        // Idempotencia: Si ya estaba cancelado, no restaurar stock dos veces
        if (order.status === 'CANCELADO') {
          return order;
        }

        // Restaurar inventario de cada item
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }

        // Actualizar estado de orden
        const updated = await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELADO' },
          include: { items: true, payments: true, customer: true },
        });

        // Registrar auditoría
        await tx.auditLog.create({
          data: {
            storeId,
            userId,
            action: 'ORDER_CANCELLED_STOCK_RESTORED',
            entity: 'Order',
            entityId: orderId,
            details: { previousStatus: order.status, itemsCount: order.items.length },
          },
        });

        return updated;
      });
    });
  }

  public async updateOrderStatus(storeId: string, orderId: string, status: OrderStatus, userId?: string) {
    if (status === 'CANCELADO') {
      return this.cancelOrderAndRestoreStock(storeId, orderId, userId);
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId, storeId },
      data: { status },
      include: { items: true, payments: true, customer: true },
    });

    await this.prisma.auditLog.create({
      data: {
        storeId,
        userId,
        action: 'ORDER_STATUS_UPDATE',
        entity: 'Order',
        entityId: orderId,
        details: { newStatus: status },
      },
    });

    return updated;
  }

  // =================================================================
  // 6. PAGOS Y CONEXIÓN MERCADO PAGO OAUTH
  // =================================================================

  public async findMercadoPagoConnection(storeId: string) {
    return this.prisma.mercadoPagoConnection.findUnique({
      where: { storeId },
    });
  }

  public async saveMercadoPagoConnection(data: {
    storeId: string;
    mpUserId: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted?: string;
    publicKey?: string;
    expiresAt?: Date;
  }) {
    return this.prisma.mercadoPagoConnection.upsert({
      where: { storeId: data.storeId },
      create: {
        storeId: data.storeId,
        mpUserId: data.mpUserId,
        accessTokenEncrypted: data.accessTokenEncrypted,
        refreshTokenEncrypted: data.refreshTokenEncrypted,
        publicKey: data.publicKey,
        expiresAt: data.expiresAt,
        active: true,
      },
      update: {
        mpUserId: data.mpUserId,
        accessTokenEncrypted: data.accessTokenEncrypted,
        refreshTokenEncrypted: data.refreshTokenEncrypted,
        publicKey: data.publicKey,
        expiresAt: data.expiresAt,
        active: true,
      },
    });
  }

  public async disconnectMercadoPago(storeId: string) {
    return this.prisma.mercadoPagoConnection.updateMany({
      where: { storeId },
      data: {
        active: false,
        accessTokenEncrypted: '',
      },
    });
  }

  // =================================================================
  // 7. WEBHOOK EVENTS & IDEMPOTENCIA EN POSTGRESQL
  // =================================================================

  public async recordWebhookEventIdempotent(
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
    storeId?: string
  ): Promise<{ alreadyProcessed: boolean; eventRecord?: unknown }> {
    return this.acquireLock(`webhook-${eventId}`, async () => {
      // Verificar si ya fue procesado
      const existing = await this.prisma.webhookEvent.findUnique({
        where: { eventId },
      });

      if (existing) {
        return { alreadyProcessed: true, eventRecord: existing };
      }

      try {
        const created = await this.prisma.webhookEvent.create({
          data: {
            provider: 'MERCADOPAGO',
            eventId,
            eventType,
            storeId,
            status: 'PROCESSED',
            payload: payload as unknown as object,
          },
        });
        return { alreadyProcessed: false, eventRecord: created };
      } catch (err: unknown) {
        // En caso de conflicto de clave única por concurrencia
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
          return { alreadyProcessed: true };
        }
        throw err;
      }
    });
  }

  // =================================================================
  // 8. OAUTH STATE (CSRF & REPLAY PREVENTION - SINGLE USE)
  // =================================================================

  public async saveOAuthState(state: string, storeId: string, userId?: string, ttlMs = 3600000) {
    return this.prisma.oAuthState.create({
      data: {
        state,
        storeId,
        userId,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
  }

  public async consumeOAuthState(state: string): Promise<{ valid: boolean; storeId?: string }> {
    return this.acquireLock(`oauth-state-${state}`, async () => {
      const record = await this.prisma.oAuthState.findUnique({
        where: { state },
      });

      if (!record || record.used || new Date() > record.expiresAt) {
        return { valid: false };
      }

      // Marcar como usado inmediatamente para prevenir replay
      await this.prisma.oAuthState.update({
        where: { state },
        data: { used: true },
      });

      return { valid: true, storeId: record.storeId };
    });
  }

  // =================================================================
  // 9. AUDITORÍA Y SUSCRIPCIONES SAAS
  // =================================================================

  public async logAudit(data: {
    storeId?: string;
    userId?: string;
    action: string;
    entity: string;
    entityId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        storeId: data.storeId,
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        details: data.details ? (data.details as unknown as object) : undefined,
        ipAddress: data.ipAddress,
      },
    });
  }

  public async listAuditLogs(limit = 100) {
    return this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        store: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }

  public async getSubscription(storeId: string) {
    return this.prisma.subscription.findUnique({
      where: { storeId },
    });
  }

  public async listSubscriptions() {
    return this.prisma.subscription.findMany({
      include: {
        store: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async updateSubscription(storeId: string, data: Partial<{
    amount: number;
    planName: string;
    status: string;
  }>) {
    return this.prisma.subscription.update({
      where: { storeId },
      data: { ...data },
    });
  }

  // =================================================================
  // 10. SEED DE DATOS INICIALES SEGUROS
  // =================================================================

  public async seedInitialData() {
    // 1. SuperAdmin
    const existingAdmin = await this.prisma.user.findUnique({
      where: { email: 'admin@paginaswebventasonline.com' },
    });

    if (!existingAdmin) {
      await this.prisma.user.create({
        data: {
          id: 'user-superadmin-1',
          email: 'admin@paginaswebventasonline.com',
          passwordHash: hashPassword('SuperAdminPassword2026!'),
          name: 'Super Administrador',
          role: 'SUPERADMIN',
        },
      });
    }

    // 2. Comercio A: Moda Urbana
    const storeAId = 'store-moda-urbana';
    let storeA = await this.prisma.store.findUnique({ where: { id: storeAId } });
    if (!storeA) {
      storeA = await this.createStore({
        id: storeAId,
        slug: 'moda-urbana',
        name: 'Moda Urbana Store',
        description: 'Prendas de vestir exclusivas, calzado y accesorios con envíos a todo el país.',
        logo: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&auto=format&fit=crop&q=80',
        banner: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80',
        phone: '+54 11 4567-8901',
        email: 'contacto@modaurbana.com',
        address: 'Av. Santa Fe 1234, CABA',
        schedule: 'Lunes a Sábados 10:00 a 20:00 hs',
        primaryColor: '#2563eb',
        settings: {
          shippingCost: 2500,
          freeShippingMinAmount: 35000,
          minOrderAmount: 5000,
          allowPickup: true,
          allowDelivery: true,
          acceptCashOnDelivery: true,
          acceptBankTransfer: true,
          bankName: 'Banco Galicia',
          bankAccountHolder: 'Moda Urbana SRL',
          bankAccountNumber: '4001234-5 001-2',
          bankCbuCvu: '0070001620000040012345',
          bankAlias: 'MODA.URBANA.PAGOS',
          instagramUrl: 'https://instagram.com/modaurbana',
          whatsappNumber: '+5491145678901',
        },
      });

      // Admin Comercio A
      await this.prisma.user.create({
        data: {
          id: 'user-admin-comercio-a',
          email: 'admin@modaurbana.com',
          passwordHash: hashPassword('AdminModaPassword2026!'),
          name: 'Carlos Gómez (Admin Moda)',
          role: 'ADMIN_COMERCIO',
          storeId: storeAId,
        },
      });

      // Categorías Comercio A
      const catA1 = await this.prisma.category.create({
        data: {
          id: 'cat-a-1',
          storeId: storeAId,
          name: 'Remeras & Tops',
          slug: 'remeras-tops',
          description: 'Remeras de algodón premium y diseños urbanos',
          sortOrder: 1,
        },
      });

      const catA2 = await this.prisma.category.create({
        data: {
          id: 'cat-a-2',
          storeId: storeAId,
          name: 'Pantalones & Jeans',
          slug: 'pantalones-jeans',
          description: 'Jeans slim fit, cargo y pantalones urbanos',
          sortOrder: 2,
        },
      });

      // Productos Comercio A
      await this.prisma.product.createMany({
        data: [
          {
            id: 'prod-a-1',
            storeId: storeAId,
            categoryId: catA1.id,
            name: 'Remera Oversize Heavy Cotton',
            slug: 'remera-oversize-heavy-cotton',
            sku: 'REM-OVR-01',
            description: 'Remera confeccionada en 100% algodón peinado 24/1, corte oversize y costuras reforzadas.',
            price: 18500,
            compareAtPrice: 22000,
            stock: 25,
            minStock: 5,
            images: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80'],
            active: true,
            featured: true,
          },
          {
            id: 'prod-a-2',
            storeId: storeAId,
            categoryId: catA2.id,
            name: 'Jean Cargo Streetwear Negro',
            slug: 'jean-cargo-streetwear-negro',
            sku: 'JEA-CRG-02',
            description: 'Pantalón cargo con múltiples bolsillos funcionales, tela denim elastizada y calce cómodo.',
            price: 34900,
            compareAtPrice: 39000,
            stock: 12,
            minStock: 3,
            images: ['https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600&auto=format&fit=crop&q=80'],
            active: true,
            featured: true,
          },
        ],
      });
    }

    // 3. Comercio B: Gourmet Market
    const storeBId = 'store-gourmet-market';
    let storeB = await this.prisma.store.findUnique({ where: { id: storeBId } });
    if (!storeB) {
      storeB = await this.createStore({
        id: storeBId,
        slug: 'gourmet-market',
        name: 'Gourmet & Delicatessen',
        description: 'Vinos de autor, quesos artesanales, aceites de oliva extra virgen y productos importados.',
        logo: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&auto=format&fit=crop&q=80',
        banner: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&auto=format&fit=crop&q=80',
        phone: '+54 11 9876-5432',
        email: 'ventas@gourmetmarket.com',
        address: 'Thames 1850, Palermo Soho, CABA',
        primaryColor: '#059669',
        settings: {
          shippingCost: 3200,
          freeShippingMinAmount: 50000,
          minOrderAmount: 8000,
          allowPickup: true,
          allowDelivery: true,
          acceptCashOnDelivery: false,
          acceptBankTransfer: true,
          bankName: 'Banco Santander',
          bankAccountHolder: 'Gourmet Market SA',
          bankAccountNumber: '1005678-9 002-1',
          bankCbuCvu: '0720000720000010056789',
          bankAlias: 'GOURMET.MARKET.PAGOS',
        },
      });

      // Admin Comercio B
      await this.prisma.user.create({
        data: {
          id: 'user-admin-comercio-b',
          email: 'admin@gourmetmarket.com',
          passwordHash: hashPassword('AdminGourmetPassword2026!'),
          name: 'Laura Rossi (Admin Gourmet)',
          role: 'ADMIN_COMERCIO',
          storeId: storeBId,
        },
      });

      // Categoría Comercio B
      const catB1 = await this.prisma.category.create({
        data: {
          id: 'cat-b-1',
          storeId: storeBId,
          name: 'Vinos & Bebidas',
          slug: 'vinos-bebidas',
          description: 'Selección de bodegas boutique y etiquetas premium',
          sortOrder: 1,
        },
      });

      // Producto Comercio B
      await this.prisma.product.create({
        data: {
          id: 'prod-b-1',
          storeId: storeBId,
          categoryId: catB1.id,
          name: 'Vino Malbec Gran Reserva 2020',
          slug: 'vino-malbec-gran-reserva-2020',
          sku: 'VIN-MLB-01',
          description: 'Vino tinto de guarda, Valle de Uco, Mendoza. 18 meses de crianza en roble francés.',
          price: 28900,
          compareAtPrice: 32500,
          stock: 18,
          minStock: 4,
          images: ['https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=600&auto=format&fit=crop&q=80'],
          active: true,
          featured: true,
        },
      });
    }
  }
}

export const db = new DatabaseRepository();
