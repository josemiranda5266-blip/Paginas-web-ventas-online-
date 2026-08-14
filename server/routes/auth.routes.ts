/**
 * Auth Routes: Login, Session & Roles
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { signJwtToken } from '../utils/crypto.ts';

export const authRouter = Router();

// Login de usuarios (SuperAdmin, Admin Comercio, Cliente)
authRouter.post('/login', (req: Request, res: Response): void => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Debe ingresar un email.' },
    });
    return;
  }

  const user = db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase().trim());

  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas. Usuario no encontrado.' },
    });
    return;
  }

  let store = undefined;
  if (user.storeId) {
    store = db.stores.find((s) => s.id === user.storeId);
  }

  // Generar JWT firmado con payload de sesión
  const token = signJwtToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    storeId: user.storeId,
  });

  // Registrar auditoría de inicio de sesión
  db.auditLogs.push({
    id: `log-${Date.now()}`,
    storeId: user.storeId,
    userId: user.id,
    action: 'USER_LOGIN',
    entity: 'User',
    entityId: user.id,
    details: { email: user.email, role: user.role },
    createdAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
        createdAt: user.createdAt,
      },
      token,
      store: store,
    },
  });
});

// Obtener perfil actual según token
authRouter.get('/me', (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'No hay sesión activa o el token es inválido.' },
    });
    return;
  }

  let store = undefined;
  if (req.user.storeId) {
    store = db.stores.find((s) => s.id === req.user?.storeId);
  }

  res.json({
    success: true,
    data: {
      user: req.user,
      store: store,
    },
  });
});

// Listar usuarios demo disponibles para auditoría y pruebas
authRouter.get('/demo-users', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: db.users.map((u) => {
      const store = u.storeId ? db.stores.find((s) => s.id === u.storeId) : null;
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        storeId: u.storeId,
        storeName: store ? store.name : undefined,
        storeSlug: store ? store.slug : undefined,
      };
    }),
  });
});
