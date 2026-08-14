/**
 * Security Middlewares: Headers, CORS, Error Handling
 */

import { Request, Response, NextFunction } from 'express';

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Configuración de encabezados de seguridad HTTP
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Store-Id, X-Tenant-Slug');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

export function errorHandlerMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[SaaS Error Handler]', err);

  const statusCode = (err as { status?: number }).status || 500;
  const message = err.message || 'Error interno del servidor';

  res.status(statusCode).json({
    success: false,
    error: {
      code: 'SERVER_ERROR',
      message: statusCode === 500 && process.env.NODE_ENV === 'production' 
        ? 'Ocurrió un error inesperado al procesar la solicitud.' 
        : message,
    },
  });
}
