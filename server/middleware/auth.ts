/**
 * Authentication Middleware & Role-Based Authorization
 */

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../src/types/index.ts';
import { db } from '../db/index.ts';

// Extender tipos de Request de Express para incluir contexto del usuario autenticado
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  storeId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      storeId?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Si no hay token, el endpoint puede ser público a menos que requireAuth lo exija
    next();
    return;
  }

  const token = authHeader.split(' ')[1];

  // En producción se verifica jwt.verify(token, JWT_SECRET).
  // Para la arquitectura inicial con sesión de desarrollo:
  const user = db.users.find((u) => u.id === token || u.email === token || token.includes(u.id));

  if (user) {
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
    };
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Acceso no autorizado. Debe iniciar sesión.',
      },
    });
    return;
  }
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Debe iniciar sesión para realizar esta acción.',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'No posee los permisos necesarios para realizar esta acción.',
        },
      });
      return;
    }

    next();
  };
}

export const requireSuperAdmin = requireRole(['SUPERADMIN']);
export const requireStoreAdmin = requireRole(['SUPERADMIN', 'ADMIN_COMERCIO']);
