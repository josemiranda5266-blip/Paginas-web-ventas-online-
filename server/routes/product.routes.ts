/**
 * Product and Category Routes with Strict Tenant Isolation
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { requireAuth } from '../middleware/auth.ts';
import { enforceTenantIsolation } from '../middleware/tenant.ts';
import { Product, Category } from '../../src/types/index.ts';

export const productRouter = Router();

// ==========================================
// CATEGORÍAS
// ==========================================

// Listar categorías de un comercio
productRouter.get('/categories/:storeId', (req: Request, res: Response): void => {
  const { storeId } = req.params;
  const categories = db.categories.filter((c) => c.storeId === storeId);
  res.json({ success: true, data: categories });
});

// Crear categoría (Requiere autenticación de admin de la tienda o SuperAdmin)
productRouter.post('/categories/:storeId', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId } = req.params;
  const { name, slug, description, active } = req.body;

  if (!name || !slug) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Nombre y slug son obligatorios.' },
    });
    return;
  }

  const newCategory: Category = {
    id: `cat-${Date.now()}`,
    storeId,
    name,
    slug: slug.toLowerCase().trim(),
    description,
    active: active ?? true,
    sortOrder: db.categories.filter((c) => c.storeId === storeId).length + 1,
    createdAt: new Date().toISOString(),
  };

  db.categories.push(newCategory);

  db.auditLogs.push({
    id: `log-${Date.now()}`,
    storeId,
    userId: req.user?.id,
    action: 'CATEGORY_CREATE',
    entity: 'Category',
    entityId: newCategory.id,
    details: { name: newCategory.name },
    createdAt: new Date().toISOString(),
  });

  res.status(201).json({ success: true, data: newCategory });
});

// Actualizar categoría
productRouter.put('/categories/:storeId/:categoryId', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId, categoryId } = req.params;
  const index = db.categories.findIndex((c) => c.id === categoryId && c.storeId === storeId);

  if (index === -1) {
    res.status(404).json({
      success: false,
      error: { code: 'CATEGORY_NOT_FOUND', message: 'Categoría no encontrada en esta tienda.' },
    });
    return;
  }

  const current = db.categories[index];
  db.categories[index] = {
    ...current,
    ...req.body,
    id: current.id,
    storeId: current.storeId, // Prevenir alteración del storeId
  };

  res.json({ success: true, data: db.categories[index] });
});

// Eliminar categoría
productRouter.delete('/categories/:storeId/:categoryId', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId, categoryId } = req.params;
  const initialLength = db.categories.length;
  db.categories = db.categories.filter((c) => !(c.id === categoryId && c.storeId === storeId));

  if (db.categories.length === initialLength) {
    res.status(404).json({
      success: false,
      error: { code: 'CATEGORY_NOT_FOUND', message: 'Categoría no encontrada.' },
    });
    return;
  }

  res.json({ success: true, message: 'Categoría eliminada correctamente.' });
});

// ==========================================
// PRODUCTOS
// ==========================================

// Listar productos de un comercio
productRouter.get('/products/:storeId', (req: Request, res: Response): void => {
  const { storeId } = req.params;
  const products = db.products.filter((p) => p.storeId === storeId);
  res.json({ success: true, data: products });
});

// Obtener un producto individual de un comercio
productRouter.get('/products/:storeId/:productId', (req: Request, res: Response): void => {
  const { storeId, productId } = req.params;
  const product = db.products.find((p) => p.id === productId && p.storeId === storeId);

  if (!product) {
    res.status(404).json({
      success: false,
      error: { code: 'PRODUCT_NOT_FOUND', message: 'Producto no encontrado en este comercio.' },
    });
    return;
  }

  res.json({ success: true, data: product });
});

// Crear producto en la tienda
productRouter.post('/products/:storeId', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId } = req.params;
  const {
    categoryId,
    name,
    slug,
    sku,
    description,
    price,
    compareAtPrice,
    stock,
    minStock,
    images,
    active,
    featured,
  } = req.body;

  if (!name || price === undefined || !categoryId) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Nombre, precio y categoría son obligatorios.' },
    });
    return;
  }

  const category = db.categories.find((c) => c.id === categoryId && c.storeId === storeId);

  const newProduct: Product = {
    id: `prod-${Date.now()}`,
    storeId,
    categoryId,
    categoryName: category ? category.name : undefined,
    name,
    slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
    sku: sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
    description: description || '',
    price: Number(price),
    compareAtPrice: compareAtPrice ? Number(compareAtPrice) : undefined,
    stock: Number(stock || 0),
    minStock: Number(minStock || 0),
    images: Array.isArray(images) && images.length > 0 ? images : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80'],
    active: active ?? true,
    featured: featured ?? false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.products.push(newProduct);

  db.auditLogs.push({
    id: `log-${Date.now()}`,
    storeId,
    userId: req.user?.id,
    action: 'PRODUCT_CREATE',
    entity: 'Product',
    entityId: newProduct.id,
    details: { name: newProduct.name, price: newProduct.price, stock: newProduct.stock },
    createdAt: new Date().toISOString(),
  });

  res.status(201).json({ success: true, data: newProduct });
});

// Actualizar producto
productRouter.put('/products/:storeId/:productId', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId, productId } = req.params;
  const index = db.products.findIndex((p) => p.id === productId && p.storeId === storeId);

  if (index === -1) {
    res.status(404).json({
      success: false,
      error: { code: 'PRODUCT_NOT_FOUND', message: 'Producto no encontrado en esta tienda.' },
    });
    return;
  }

  const current = db.products[index];
  db.products[index] = {
    ...current,
    ...req.body,
    id: current.id,
    storeId: current.storeId, // Prevenir alteración del storeId
    updatedAt: new Date().toISOString(),
  };

  db.auditLogs.push({
    id: `log-${Date.now()}`,
    storeId,
    userId: req.user?.id,
    action: 'PRODUCT_UPDATE',
    entity: 'Product',
    entityId: productId,
    details: { updatedFields: Object.keys(req.body) },
    createdAt: new Date().toISOString(),
  });

  res.json({ success: true, data: db.products[index] });
});

// Eliminar producto
productRouter.delete('/products/:storeId/:productId', requireAuth, enforceTenantIsolation, (req: Request, res: Response): void => {
  const { storeId, productId } = req.params;
  const initialLength = db.products.length;
  db.products = db.products.filter((p) => !(p.id === productId && p.storeId === storeId));

  if (db.products.length === initialLength) {
    res.status(404).json({
      success: false,
      error: { code: 'PRODUCT_NOT_FOUND', message: 'Producto no encontrado.' },
    });
    return;
  }

  db.auditLogs.push({
    id: `log-${Date.now()}`,
    storeId,
    userId: req.user?.id,
    action: 'PRODUCT_DELETE',
    entity: 'Product',
    entityId: productId,
    createdAt: new Date().toISOString(),
  });

  res.json({ success: true, message: 'Producto eliminado correctamente.' });
});
