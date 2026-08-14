/**
 * Orders & Checkout Routes with Server-Authoritative Pricing, PostgreSQL Transactions & Atomic Stock Concurrency
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { requireAuth } from '../middleware/auth.ts';
import { enforceTenantIsolation, requireActiveStore } from '../middleware/tenant.ts';
import { OrderStatus } from '../../src/types/index.ts';

export const orderRouter = Router();

// Crear pedido (Checkout público por tienda con transacción atómica en PostgreSQL)
orderRouter.post('/:storeId/checkout', requireActiveStore, async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const { customer, items, deliveryMethod, paymentMethod, notes, address } = req.body;

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

    // Checkout atómico en backend: recalcula precios, verifica stock y descuenta inventario transaccionalmente
    const newOrder = await db.checkoutAtomic(storeId, {
      customer,
      items,
      deliveryMethod,
      paymentMethod,
      notes,
      address,
    });

    res.status(201).json({
      success: true,
      data: {
        ...newOrder,
        subtotal: Number(newOrder.subtotal),
        shippingCost: Number(newOrder.shippingCost),
        total: Number(newOrder.total),
        items: newOrder.items.map((i) => ({
          ...i,
          price: Number(i.price),
          subtotal: Number(i.subtotal),
        })),
      },
    });
  } catch (err: unknown) {
    const errCode = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : 'Error procesando checkout';

    if (errCode === 'INSUFFICIENT_STOCK') {
      res.status(400).json({
        success: false,
        error: { code: 'INSUFFICIENT_STOCK', message },
      });
      return;
    }

    if (errCode === 'STORE_SUSPENDED' || message === 'STORE_SUSPENDED') {
      res.status(403).json({
        success: false,
        error: { code: 'STORE_SUSPENDED', message: 'Este comercio está suspendido y no puede recibir pedidos.' },
      });
      return;
    }

    if (errCode === 'STORE_NOT_FOUND' || message === 'STORE_NOT_FOUND') {
      res.status(404).json({
        success: false,
        error: { code: 'STORE_NOT_FOUND', message: 'Comercio no encontrado.' },
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: { code: 'CHECKOUT_ERROR', message },
    });
  }
});

// Listar pedidos de una tienda (Requiere Admin del comercio o SuperAdmin)
orderRouter.get('/:storeId', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const orders = await db.findOrdersByStore(storeId);

    res.json({
      success: true,
      data: orders.map((o) => ({
        ...o,
        subtotal: Number(o.subtotal),
        shippingCost: Number(o.shippingCost),
        total: Number(o.total),
        items: o.items.map((i) => ({
          ...i,
          price: Number(i.price),
          subtotal: Number(i.subtotal),
        })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al consultar pedidos';
    res.status(500).json({ success: false, error: { code: 'ORDER_FETCH_ERROR', message } });
  }
});

// Obtener un pedido individual (Requiere Admin del comercio o SuperAdmin)
orderRouter.get('/:storeId/:orderId', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId, orderId } = req.params;
    const order = await db.findOrderById(storeId, orderId);

    if (!order) {
      res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Pedido no encontrado en este comercio.' },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        ...order,
        subtotal: Number(order.subtotal),
        shippingCost: Number(order.shippingCost),
        total: Number(order.total),
        items: order.items.map((i) => ({
          ...i,
          price: Number(i.price),
          subtotal: Number(i.subtotal),
        })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al consultar pedido';
    res.status(500).json({ success: false, error: { code: 'ORDER_FETCH_ERROR', message } });
  }
});

// Actualizar estado del pedido (Admin del comercio o SuperAdmin)
orderRouter.patch('/:storeId/:orderId/status', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
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

    const updated = await db.updateOrderStatus(storeId, orderId, status, req.user?.id);

    res.json({
      success: true,
      data: {
        ...updated,
        subtotal: Number(updated.subtotal),
        shippingCost: Number(updated.shippingCost),
        total: Number(updated.total),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al actualizar estado del pedido';
    res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message } });
  }
});
