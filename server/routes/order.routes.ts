/**
 * Orders & Checkout Routes with Server-Authoritative Pricing & Stock Concurrency
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { requireAuth } from '../middleware/auth.ts';
import { enforceTenantIsolation, requireActiveStore } from '../middleware/tenant.ts';
import { Order, OrderItem, OrderStatus, PaymentProvider } from '../../src/types/index.ts';

export const orderRouter = Router();

// Crear pedido (Checkout público por tienda con validación total en backend)
orderRouter.post('/:storeId/checkout', requireActiveStore, (req: Request, res: Response): void => {
  const { storeId } = req.params;
  const { customer, items, deliveryMethod, paymentMethod, notes, address } = req.body;

  const store = db.stores.find((s) => s.id === storeId);
  if (!store) {
    res.status(404).json({
      success: false,
      error: { code: 'STORE_NOT_FOUND', message: 'Comercio no encontrado.' },
    });
    return;
  }

  if (store.status === 'SUSPENDIDO') {
    res.status(403).json({
      success: false,
      error: { code: 'STORE_SUSPENDED', message: 'Este comercio está suspendido y no puede recibir pedidos.' },
    });
    return;
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({
      success: false,
      error: { code: 'EMPTY_CART', message: 'El carrito no puede estar vacío.' },
    });
    return;
  }

  if (!customer?.firstName || !customer?.email) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_CUSTOMER', message: 'Nombre y email del cliente son requeridos.' },
    });
    return;
  }

  // 1. Recalcular precios e inventario en backend de forma 100% segura (Ignora precios del frontend)
  const orderItems: OrderItem[] = [];
  let calculatedSubtotal = 0;

  for (const item of items) {
    const product = db.products.find((p) => p.id === item.productId && p.storeId === storeId);

    if (!product) {
      res.status(400).json({
        success: false,
        error: { code: 'PRODUCT_NOT_FOUND', message: `Producto ID ${item.productId} no disponible en este comercio.` },
      });
      return;
    }

    if (!product.active) {
      res.status(400).json({
        success: false,
        error: { code: 'PRODUCT_INACTIVE', message: `El producto "${product.name}" no está disponible actualmente.` },
      });
      return;
    }

    const requestedQty = Math.max(1, Math.floor(Number(item.quantity) || 1));

    if (product.stock < requestedQty) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: `Stock insuficiente para "${product.name}". Disponible: ${product.stock} unidades.`,
        },
      });
      return;
    }

    const unitPrice = Number(product.price);
    const itemSubtotal = unitPrice * requestedQty;
    calculatedSubtotal += itemSubtotal;

    orderItems.push({
      storeId,
      productId: product.id,
      name: product.name,
      sku: product.sku,
      price: unitPrice, // Precio unitario histórico congelado
      quantity: requestedQty,
      subtotal: itemSubtotal,
      image: product.images[0],
    });

    // Descontar stock inmediatamente
    product.stock -= requestedQty;
  }

  // 2. Calcular costo de envío según configuración de la tienda
  let shippingCost = 0;
  if (deliveryMethod === 'DELIVERY') {
    const minFree = store.settings?.freeShippingMinAmount || 0;
    if (minFree > 0 && calculatedSubtotal >= minFree) {
      shippingCost = 0;
    } else {
      shippingCost = store.settings?.shippingCost || 0;
    }
  }

  const total = calculatedSubtotal + shippingCost;
  const orderCount = db.orders.filter((o) => o.storeId === storeId).length + 1;
  const orderNumber = `#${String(orderCount).padStart(4, '0')}`;

  const newOrder: Order = {
    id: `ord-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    orderNumber,
    storeId,
    customerId: `cust-${Date.now()}`,
    customer: {
      firstName: customer.firstName,
      lastName: customer.lastName || '',
      email: customer.email,
      phone: customer.phone,
    },
    address: address,
    deliveryMethod: (deliveryMethod as 'PICKUP' | 'DELIVERY') || 'DELIVERY',
    paymentMethod: (paymentMethod as PaymentProvider) || 'TRANSFER',
    items: orderItems,
    subtotal: calculatedSubtotal,
    shippingCost,
    total,
    status: 'PENDIENTE',
    paymentStatus: 'PENDING',
    notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.orders.push(newOrder);

  // Registrar auditoría
  db.auditLogs.push({
    id: `log-${Date.now()}`,
    storeId,
    action: 'ORDER_CREATE',
    entity: 'Order',
    entityId: newOrder.id,
    details: { orderNumber: newOrder.orderNumber, total: newOrder.total, itemsCount: orderItems.length },
    createdAt: new Date().toISOString(),
  });

  res.status(201).json({
    success: true,
    data: newOrder,
  });
});

// Listar pedidos de una tienda (Requiere Admin del comercio o SuperAdmin)
orderRouter.get('/:storeId', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId } = req.params;
  const orders = db.orders
    .filter((o) => o.storeId === storeId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ success: true, data: orders });
});

// Obtener un pedido individual (Requiere Admin del comercio o SuperAdmin)
orderRouter.get('/:storeId/:orderId', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId, orderId } = req.params;
  const order = db.orders.find((o) => o.id === orderId && o.storeId === storeId);

  if (!order) {
    res.status(404).json({
      success: false,
      error: { code: 'ORDER_NOT_FOUND', message: 'Pedido no encontrado en este comercio.' },
    });
    return;
  }

  res.json({ success: true, data: order });
});

// Actualizar estado del pedido (Admin del comercio o SuperAdmin)
orderRouter.patch('/:storeId/:orderId/status', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId, orderId } = req.params;
  const { status } = req.body;

  const validStatuses: OrderStatus[] = ['PENDIENTE', 'CONFIRMADO', 'PREPARANDO', 'ENVIADO', 'ENTREGADO', 'CANCELADO'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Estado de pedido no válido.' },
    });
    return;
  }

  const orderIndex = db.orders.findIndex((o) => o.id === orderId && o.storeId === storeId);
  if (orderIndex === -1) {
    res.status(404).json({
      success: false,
      error: { code: 'ORDER_NOT_FOUND', message: 'Pedido no encontrado.' },
    });
    return;
  }

  const previousStatus = db.orders[orderIndex].status;
  db.orders[orderIndex].status = status;
  db.orders[orderIndex].updatedAt = new Date().toISOString();

  // Si se cancela el pedido, restaurar el inventario de los productos
  if (status === 'CANCELADO' && previousStatus !== 'CANCELADO') {
    for (const item of db.orders[orderIndex].items) {
      const product = db.products.find((p) => p.id === item.productId && p.storeId === storeId);
      if (product) {
        product.stock += item.quantity;
      }
    }
  }

  // Registrar auditoría
  db.auditLogs.push({
    id: `log-${Date.now()}`,
    storeId,
    userId: req.user?.id,
    action: 'ORDER_STATUS_UPDATE',
    entity: 'Order',
    entityId: orderId,
    details: { previousStatus, newStatus: status },
    createdAt: new Date().toISOString(),
  });

  res.json({ success: true, data: db.orders[orderIndex] });
});
