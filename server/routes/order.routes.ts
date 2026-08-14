/**
 * Orders & Checkout Routes with Stock & Price Backend Validation
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { requireAuth } from '../middleware/auth.ts';
import { enforceTenantIsolation, requireActiveStore } from '../middleware/tenant.ts';
import { Order, OrderItem, OrderStatus, PaymentProvider } from '../../src/types/index.ts';

export const orderRouter = Router();

// Crear pedido (Checkout público por tienda)
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

  // 1. Recalcular precios e inventario en backend de forma segura
  const orderItems: OrderItem[] = [];
  let calculatedSubtotal = 0;

  for (const item of items) {
    const product = db.products.find((p) => p.id === item.productId && p.storeId === storeId);

    if (!product) {
      res.status(400).json({
        success: false,
        error: { code: 'PRODUCT_NOT_FOUND', message: `Producto ID ${item.productId} no disponible en esta tienda.` },
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

    const requestedQty = Math.max(1, Number(item.quantity) || 1);

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

    const itemSubtotal = product.price * requestedQty;
    calculatedSubtotal += itemSubtotal;

    orderItems.push({
      storeId,
      productId: product.id,
      name: product.name,
      sku: product.sku,
      price: product.price, // Precio unitario congelado
      quantity: requestedQty,
      subtotal: itemSubtotal,
      image: product.images[0],
    });

    // Descontar stock inmediatamente
    product.stock -= requestedQty;
  }

  // 2. Calcular costo de envío
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
    id: `ord-${Date.now()}`,
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
    paymentStatus: paymentMethod === 'MERCADOPAGO' ? 'PENDING' : 'PENDING',
    notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.orders.push(newOrder);

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

  db.orders[orderIndex].status = status;
  db.orders[orderIndex].updatedAt = new Date().toISOString();

  res.json({ success: true, data: db.orders[orderIndex] });
});
