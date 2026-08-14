/**
 * Database Abstraction Layer - Multi-Tenant Data Store
 * Preparado para PostgreSQL / Prisma ORM.
 */

import {
  User,
  Store,
  Category,
  Product,
  Order,
  Payment,
  MercadoPagoConnection,
  AuditLog,
  Subscription,
  WebhookEvent,
} from '../../src/types/index.ts';

class DatabaseStore {
  public users: User[] = [];
  public stores: Store[] = [];
  public categories: Category[] = [];
  public products: Product[] = [];
  public orders: Order[] = [];
  public payments: Payment[] = [];
  public mpConnections: MercadoPagoConnection[] = [];
  public auditLogs: AuditLog[] = [];
  public subscriptions: Subscription[] = [];
  public webhookEvents: WebhookEvent[] = [];

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    // 1. SuperAdmin
    this.users.push({
      id: 'user-superadmin-1',
      email: 'admin@paginaswebventasonline.com',
      name: 'Super Administrador',
      role: 'SUPERADMIN',
      createdAt: new Date().toISOString(),
    });

    // 2. Comercio A: Moda Urbana
    const storeAId = 'store-moda-urbana';
    const storeA: Store = {
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
      secondaryColor: '#1e293b',
      status: 'ACTIVO',
      mercadoPagoConnected: false,
      settings: {
        shippingCost: 2500,
        freeShippingMinAmount: 35000,
        minOrderAmount: 5000,
        allowPickup: true,
        allowDelivery: true,
        acceptCashOnDelivery: true,
        acceptBankTransfer: true,
        bankDetails: {
          bankName: 'Banco Galicia',
          accountHolder: 'Moda Urbana SRL',
          accountNumber: '4001234-5 001-2',
          cbuCvu: '0070001620000040012345',
          alias: 'MODA.URBANA.PAGOS',
        },
        instagramUrl: 'https://instagram.com/modaurbana',
        whatsappNumber: '+5491145678901',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.stores.push(storeA);

    // Admin Comercio A
    this.users.push({
      id: 'user-admin-comercio-a',
      email: 'admin@modaurbana.com',
      name: 'Carlos Gómez (Admin Moda)',
      role: 'ADMIN_COMERCIO',
      storeId: storeAId,
      createdAt: new Date().toISOString(),
    });

    // Categorías Comercio A
    const catA1: Category = {
      id: 'cat-a-1',
      storeId: storeAId,
      name: 'Remeras & Tops',
      slug: 'remeras-tops',
      description: 'Remeras de algodón premium y diseños urbanos',
      active: true,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    };
    const catA2: Category = {
      id: 'cat-a-2',
      storeId: storeAId,
      name: 'Pantalones & Jeans',
      slug: 'pantalones-jeans',
      description: 'Jeans slim fit, cargo y pantalones urbanos',
      active: true,
      sortOrder: 2,
      createdAt: new Date().toISOString(),
    };
    this.categories.push(catA1, catA2);

    // Productos Comercio A
    this.products.push(
      {
        id: 'prod-a-1',
        storeId: storeAId,
        categoryId: catA1.id,
        categoryName: catA1.name,
        name: 'Remera Oversize Heavy Cotton',
        slug: 'remera-oversize-heavy-cotton',
        sku: 'REM-OVR-01',
        description: 'Remera confeccionada en 100% algodón peinado 24/1, corte oversize y costuras reforzadas.',
        price: 18500,
        compareAtPrice: 22000,
        stock: 25,
        minStock: 5,
        images: [
          'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80',
        ],
        active: true,
        featured: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'prod-a-2',
        storeId: storeAId,
        categoryId: catA2.id,
        categoryName: catA2.name,
        name: 'Jean Cargo Streetwear Negro',
        slug: 'jean-cargo-streetwear-negro',
        sku: 'JEA-CRG-02',
        description: 'Pantalón cargo con múltiples bolsillos funcionales, tela denim elastizada y calce cómodo.',
        price: 34900,
        compareAtPrice: 39000,
        stock: 12,
        minStock: 3,
        images: [
          'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600&auto=format&fit=crop&q=80',
        ],
        active: true,
        featured: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    );

    // 3. Comercio B: Gourmet Market
    const storeBId = 'store-gourmet-market';
    const storeB: Store = {
      id: storeBId,
      slug: 'gourmet-market',
      name: 'Gourmet Market & Delicatessen',
      description: 'Vinos de autor, quesos artesanales y productos gourmet importados.',
      logo: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=200&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1543083477-4f785aeafaa9?w=1200&auto=format&fit=crop&q=80',
      phone: '+54 11 9876-5432',
      email: 'pedidos@gourmetmarket.com',
      address: 'Calle Gorriti 5678, Palermo',
      schedule: 'Martes a Domingos 11:00 a 22:00 hs',
      primaryColor: '#059669',
      secondaryColor: '#064e3b',
      status: 'ACTIVO',
      mercadoPagoConnected: false,
      settings: {
        shippingCost: 3200,
        freeShippingMinAmount: 45000,
        minOrderAmount: 8000,
        allowPickup: true,
        allowDelivery: true,
        acceptCashOnDelivery: false,
        acceptBankTransfer: true,
        bankDetails: {
          bankName: 'Banco Santander',
          accountHolder: 'Gourmet Market SA',
          accountNumber: '1209384-1',
          cbuCvu: '0720000188000012093841',
          alias: 'GOURMET.MARKET.PAGOS',
        },
        instagramUrl: 'https://instagram.com/gourmetmarket',
        whatsappNumber: '+5491198765432',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.stores.push(storeB);

    // Admin Comercio B
    this.users.push({
      id: 'user-admin-comercio-b',
      email: 'admin@gourmetmarket.com',
      name: 'Laura Rossi (Admin Gourmet)',
      role: 'ADMIN_COMERCIO',
      storeId: storeBId,
      createdAt: new Date().toISOString(),
    });

    // Categorías Comercio B
    const catB1: Category = {
      id: 'cat-b-1',
      storeId: storeBId,
      name: 'Vinos & Espumantes',
      slug: 'vinos-espumantes',
      description: 'Selección de bodegas boutique y etiquetas premiadas',
      active: true,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    };
    this.categories.push(catB1);

    // Productos Comercio B
    this.products.push({
      id: 'prod-b-1',
      storeId: storeBId,
      categoryId: catB1.id,
      categoryName: catB1.name,
      name: 'Malbec Reserva Valle de Uco 2021',
      slug: 'malbec-reserva-valle-de-uco-2021',
      sku: 'VIN-MAL-21',
      description: 'Crianza de 12 meses en barricas de roble francés. Notas a frutos rojos maduros, vainilla y chocolate.',
      price: 15400,
      compareAtPrice: 18000,
      stock: 36,
      minStock: 6,
      images: [
        'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&auto=format&fit=crop&q=80',
      ],
      active: true,
      featured: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 4. Suscripciones SaaS Mensuales Fijas (0% comisión en ventas)
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    this.subscriptions.push(
      {
        id: 'sub-moda-urbana',
        storeId: storeAId,
        planName: 'Plan Comercio Pro (Fijo)',
        amount: 15000,
        currency: 'ARS',
        status: 'ACTIVE',
        interval: 'MONTHLY',
        commissionRate: 0.0, // 0% de comisión en ventas
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: thirtyDaysLater.toISOString(),
        cancelAtPeriodEnd: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'sub-gourmet-market',
        storeId: storeBId,
        planName: 'Plan Comercio Pro (Fijo)',
        amount: 15000,
        currency: 'ARS',
        status: 'ACTIVE',
        interval: 'MONTHLY',
        commissionRate: 0.0, // 0% de comisión en ventas
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: thirtyDaysLater.toISOString(),
        cancelAtPeriodEnd: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    );

    // 5. Pedidos Iniciales de Demostración
    this.orders.push({
      id: 'ord-demo-1',
      orderNumber: '#0001',
      storeId: storeAId,
      customerId: 'cust-demo-1',
      customer: {
        firstName: 'Martín',
        lastName: 'Pérez',
        email: 'martin.perez@ejemplo.com',
        phone: '+54 11 5555-1234',
      },
      address: {
        id: 'addr-demo-1',
        customerId: 'cust-demo-1',
        address: 'Calle Falsa 123, 4to B',
        city: 'Buenos Aires',
        province: 'CABA',
        postalCode: '1425',
        notes: 'Timbre Pérez',
        isDefault: true,
      },
      deliveryMethod: 'DELIVERY',
      paymentMethod: 'MERCADOPAGO',
      items: [
        {
          storeId: storeAId,
          productId: 'prod-a-1',
          name: 'Remera Oversize Heavy Cotton',
          sku: 'REM-OVR-01',
          price: 18500,
          quantity: 2,
          subtotal: 37000,
          image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80',
        },
      ],
      subtotal: 37000,
      shippingCost: 0,
      total: 37000,
      status: 'CONFIRMADO',
      paymentStatus: 'APPROVED',
      notes: 'Entregar por la tarde',
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 20).toISOString(),
    });

    this.payments.push({
      id: 'pay-demo-1',
      orderId: 'ord-demo-1',
      storeId: storeAId,
      provider: 'MERCADOPAGO',
      externalId: 'mp-pay-99887766',
      status: 'APPROVED',
      amount: 37000,
      currency: 'ARS',
      paymentMethod: 'credit_card',
      paidAt: new Date(Date.now() - 3600000 * 20).toISOString(),
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 20).toISOString(),
    });
  }
}

export const db = new DatabaseStore();
