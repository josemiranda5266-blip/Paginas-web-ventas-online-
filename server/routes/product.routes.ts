/**
 * Product and Category Routes with Strict Tenant Isolation (PostgreSQL / Prisma)
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { requireAuth } from '../middleware/auth.ts';
import { enforceTenantIsolation } from '../middleware/tenant.ts';

export const productRouter = Router();

// ==========================================
// CATEGORÍAS
// ==========================================

// Listar categorías de un comercio
productRouter.get('/categories/:storeId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const categories = await db.findCategoriesByStore(storeId);
    res.json({ success: true, data: categories });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al listar categorías';
    res.status(500).json({ success: false, error: { code: 'CATEGORY_FETCH_ERROR', message } });
  }
});

// Crear categoría (Requiere autenticación de admin de la tienda o SuperAdmin)
productRouter.post('/categories/:storeId', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const { name, slug, description, active } = req.body;

    if (!name || !slug) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Nombre y slug son obligatorios.' },
      });
      return;
    }

    const newCategory = await db.createCategory(storeId, {
      name,
      slug,
      description,
      active: active ?? true,
    });

    await db.logAudit({
      storeId,
      userId: req.user?.id,
      action: 'CATEGORY_CREATE',
      entity: 'Category',
      entityId: newCategory.id,
      details: { name: newCategory.name },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: newCategory });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al crear categoría';
    res.status(500).json({ success: false, error: { code: 'CATEGORY_CREATE_ERROR', message } });
  }
});

// Actualizar categoría
productRouter.put('/categories/:storeId/:categoryId', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId, categoryId } = req.params;
    const { name, slug, description, active, sortOrder } = req.body;

    const updated = await db.updateCategory(storeId, categoryId, {
      name,
      slug,
      description,
      active,
      sortOrder,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al actualizar categoría';
    res.status(404).json({ success: false, error: { code: 'CATEGORY_NOT_FOUND', message } });
  }
});

// Eliminar categoría
productRouter.delete('/categories/:storeId/:categoryId', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId, categoryId } = req.params;
    await db.deleteCategory(storeId, categoryId);

    await db.logAudit({
      storeId,
      userId: req.user?.id,
      action: 'CATEGORY_DELETE',
      entity: 'Category',
      entityId: categoryId,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Categoría eliminada correctamente.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al eliminar categoría';
    res.status(404).json({ success: false, error: { code: 'CATEGORY_NOT_FOUND', message } });
  }
});

// ==========================================
// PRODUCTOS
// ==========================================

// Listar productos de un comercio
productRouter.get('/products/:storeId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const products = await db.findProductsByStore(storeId);
    res.json({
      success: true,
      data: products.map((p) => ({
        ...p,
        categoryName: p.category?.name,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al listar productos';
    res.status(500).json({ success: false, error: { code: 'PRODUCT_FETCH_ERROR', message } });
  }
});

// Obtener un producto individual de un comercio
productRouter.get('/products/:storeId/:productId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId, productId } = req.params;
    const product = await db.findProductById(storeId, productId);

    if (!product) {
      res.status(404).json({
        success: false,
        error: { code: 'PRODUCT_NOT_FOUND', message: 'Producto no encontrado en este comercio.' },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        ...product,
        categoryName: product.category?.name,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al obtener producto';
    res.status(500).json({ success: false, error: { code: 'PRODUCT_FETCH_ERROR', message } });
  }
});

// Crear producto en la tienda
productRouter.post('/products/:storeId', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
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

    const newProduct = await db.createProduct(storeId, {
      categoryId,
      name,
      slug,
      sku,
      description,
      price: Number(price),
      compareAtPrice: compareAtPrice ? Number(compareAtPrice) : undefined,
      stock: Number(stock || 0),
      minStock: Number(minStock || 0),
      images: Array.isArray(images) && images.length > 0 ? images : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80'],
      active: active ?? true,
      featured: featured ?? false,
    });

    await db.logAudit({
      storeId,
      userId: req.user?.id,
      action: 'PRODUCT_CREATE',
      entity: 'Product',
      entityId: newProduct.id,
      details: { name: newProduct.name, price: Number(newProduct.price), stock: newProduct.stock },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        ...newProduct,
        categoryName: newProduct.category?.name,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al crear producto';
    res.status(500).json({ success: false, error: { code: 'PRODUCT_CREATE_ERROR', message } });
  }
});

// Actualizar producto
productRouter.put('/products/:storeId/:productId', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId, productId } = req.params;
    const {
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
      categoryId,
    } = req.body;

    const updated = await db.updateProduct(storeId, productId, {
      name,
      slug,
      sku,
      description,
      price: price !== undefined ? Number(price) : undefined,
      compareAtPrice: compareAtPrice !== undefined ? Number(compareAtPrice) : undefined,
      stock: stock !== undefined ? Number(stock) : undefined,
      minStock: minStock !== undefined ? Number(minStock) : undefined,
      images,
      active,
      featured,
      categoryId,
    });

    await db.logAudit({
      storeId,
      userId: req.user?.id,
      action: 'PRODUCT_UPDATE',
      entity: 'Product',
      entityId: productId,
      details: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        ...updated,
        categoryName: updated.category?.name,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al actualizar producto';
    res.status(404).json({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message } });
  }
});

// Eliminar producto
productRouter.delete('/products/:storeId/:productId', requireAuth, enforceTenantIsolation, async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId, productId } = req.params;
    await db.deleteProduct(storeId, productId);

    await db.logAudit({
      storeId,
      userId: req.user?.id,
      action: 'PRODUCT_DELETE',
      entity: 'Product',
      entityId: productId,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Producto eliminado correctamente.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al eliminar producto';
    res.status(404).json({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message } });
  }
});
