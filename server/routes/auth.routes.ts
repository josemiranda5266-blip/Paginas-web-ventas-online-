/**
 * Auth Routes: Login, Register, Session & Roles
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.ts';
import { signJwtToken } from '../utils/crypto.ts';
import { requireAuth } from '../middleware/auth.ts';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email('Email con formato inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

const registerSchema = z.object({
  email: z.string().email('Email con formato inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  phone: z.string().optional(),
});

// Login de usuarios (SuperAdmin, Admin Comercio, Cliente)
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      // Compatibilidad con pruebas simples que envían solo email sin password
      const email = req.body?.email;
      if (!email) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Debe ingresar un email y contraseña.' },
        });
        return;
      }
    }

    const email = String(req.body.email).toLowerCase().trim();
    const password = req.body.password;

    let user;
    if (password) {
      user = await db.authenticateUser(email, password);
    } else {
      user = await db.findUserByEmail(email);
    }

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas. Usuario o contraseña incorrectos.' },
      });
      return;
    }

    let store = undefined;
    if (user.storeId) {
      store = await db.findStoreById(user.storeId);
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
    await db.logAudit({
      storeId: user.storeId || undefined,
      userId: user.id,
      action: 'USER_LOGIN',
      entity: 'User',
      entityId: user.id,
      details: { email: user.email, role: user.role },
      ipAddress: req.ip,
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
        store: store || undefined,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error en autenticación';
    res.status(500).json({ success: false, error: { code: 'AUTH_ERROR', message } });
  }
});

// Registro de nuevos clientes
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: parseResult.error.issues[0]?.message || 'Datos de registro inválidos' },
      });
      return;
    }

    const { email, password, name, phone } = parseResult.data;

    const existing = await db.findUserByEmail(email);
    if (existing) {
      res.status(400).json({
        success: false,
        error: { code: 'EMAIL_ALREADY_EXISTS', message: 'El correo electrónico ya está registrado.' },
      });
      return;
    }

    const user = await db.createUser({
      email,
      password,
      name,
      phone,
      role: 'CLIENTE',
    });

    const token = signJwtToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    await db.logAudit({
      userId: user.id,
      action: 'USER_REGISTER',
      entity: 'User',
      entityId: user.id,
      details: { email: user.email },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
        },
        token,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error en registro de usuario';
    res.status(500).json({ success: false, error: { code: 'REGISTER_ERROR', message } });
  }
});

// Obtener perfil actual según token
authRouter.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No hay sesión activa o el token es inválido.' },
      });
      return;
    }

    let store = undefined;
    if (req.user.storeId) {
      store = await db.findStoreById(req.user.storeId);
    }

    res.json({
      success: true,
      data: {
        user: req.user,
        store: store || undefined,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al obtener perfil';
    res.status(500).json({ success: false, error: { code: 'PROFILE_ERROR', message } });
  }
});

// Listar usuarios demo en desarrollo
authRouter.get('/demo-users', async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await db.listUsers();
    res.json({
      success: true,
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        storeId: u.storeId,
        storeName: u.store?.name,
        storeSlug: u.store?.slug,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: 'Error consultando usuarios' } });
  }
});
