/**
 * Paginas Web Ventas Online - Servidor Principal Express + Vite Full-Stack
 * Arquitectura Multi-Tenant Segura con Aislamiento por storeId y soporte Mercado Pago
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

// Middlewares
import { corsMiddleware, errorHandlerMiddleware, securityHeadersMiddleware } from './server/middleware/security.ts';
import { authMiddleware } from './server/middleware/auth.ts';
import { resolveTenant } from './server/middleware/tenant.ts';

// Rutas
import { authRouter } from './server/routes/auth.routes.ts';
import { storeRouter } from './server/routes/store.routes.ts';
import { productRouter } from './server/routes/product.routes.ts';
import { orderRouter } from './server/routes/order.routes.ts';
import { paymentRouter } from './server/routes/payment.routes.ts';
import { adminRouter } from './server/routes/admin.routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Middlewares de Seguridad y Parsing
  app.use(securityHeadersMiddleware);
  app.use(corsMiddleware);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 2. Middlewares de Contexto: Autenticación y Resolución de Tenant
  app.use(authMiddleware);
  app.use(resolveTenant);

  // 3. Health check del SaaS
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'Paginas Web Ventas Online - SaaS Multi-Tenant',
      version: '1.0.0',
      aiFeatures: false, // Garantizado sin IA
      strictMode: true,
      timestamp: new Date().toISOString(),
    });
  });

  // 4. Montaje de Rutas de la API Backend
  app.use('/api/auth', authRouter);
  app.use('/api/stores', storeRouter);
  app.use('/api/catalog', productRouter);
  app.use('/api/orders', orderRouter);
  app.use('/api/payments', paymentRouter);
  app.use('/api/admin', adminRouter);

  // 5. Manejador Centralizado de Errores
  app.use(errorHandlerMiddleware);

  // 6. Vite middleware para frontend en desarrollo / estáticos en producción
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Paginas Web Ventas Online] Servidor ejecutándose en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Paginas Web Ventas Online] Error al iniciar servidor:', err);
  process.exit(1);
});
