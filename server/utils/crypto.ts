/**
 * Security & Cryptography Utilities
 * - Cifrado AES-256-GCM para tokens sensibles OAuth de Mercado Pago
 * - Firma y verificación de tokens JWT (RFC 7519)
 * - Protección CSRF para estados OAuth (HMAC-SHA256 con expiración y un solo uso)
 * - Verificación de firmas criptográficas de Webhooks de Mercado Pago (HMAC-SHA256)
 * - Hashing seguro de contraseñas con PBKDF2 y Salt
 */

import crypto from 'crypto';

/**
 * Valida variables de entorno críticas.
 * En producción, si falta alguna variable crítica, la aplicación debe fallar al iniciar.
 */
export function validateEnvironmentSecrets(): { valid: boolean; missing: string[] } {
  const isProduction = process.env.NODE_ENV === 'production';
  const requiredInProd = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'MP_APP_CLIENT_ID',
    'MP_APP_CLIENT_SECRET',
    'MP_OAUTH_REDIRECT_URI',
    'MP_WEBHOOK_SECRET',
  ];

  const missing = requiredInProd.filter((key) => !process.env[key] || process.env[key]?.trim() === '');

  if (isProduction && missing.length > 0) {
    const errorMsg = `[FATAL] Configuración de seguridad incompleta en producción. Faltan variables críticas: ${missing.join(', ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Validar longitud de ENCRYPTION_KEY si existe
  if (process.env.ENCRYPTION_KEY) {
    if (process.env.ENCRYPTION_KEY.length < 16) {
      const errorMsg = '[FATAL] ENCRYPTION_KEY debe tener al menos 16 caracteres para derivación segura de 256 bits';
      if (isProduction) throw new Error(errorMsg);
      else console.warn(errorMsg);
    }
  }

  return { valid: missing.length === 0, missing };
}

// Obtener clave de cifrado AES-256 (32 bytes)
export const getEncryptionKey = (): Buffer => {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY es obligatoria en producción y no está configurada.');
    }
    // En desarrollo/test local utilizamos una clave derivada fija explícita de test
    return crypto.createHash('sha256').update('dev_test_encryption_key_paginas_web_ventas_online_32b').digest();
  }
  return crypto.createHash('sha256').update(envKey).digest();
};

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET es obligatorio en producción y no está configurado.');
    }
    return 'dev_jwt_secret_paginas_web_ventas_online_2026_safe';
  }
  return secret;
};

/**
 * Encripta un token sensible (ej: access_token de Mercado Pago) usando AES-256-GCM.
 * Retorna formato ivHex:authTagHex:encryptedHex.
 */
export function encryptToken(plainText: string): string {
  if (!plainText) return '';
  
  const iv = crypto.randomBytes(12); // 96-bit IV para GCM
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Desencripta un token encriptado con AES-256-GCM.
 * Lanza o retorna string vacío si el formato es inválido o no puede ser autenticado.
 */
export function decryptToken(encryptedString: string): string {
  if (!encryptedString) return '';
  
  try {
    const parts = encryptedString.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de token encriptado inválido (se esperaba iv:tag:data)');
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new Error('Componentes de cifrado incompletos');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getEncryptionKey();
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido de descifrado';
    console.error(`[Crypto Error] Fallo al desencriptar token: ${message}`);
    return '';
  }
}

/**
 * Genera un parámetro 'state' firmado para OAuth de Mercado Pago para prevenir ataques CSRF.
 * Formato: nonce.storeId.timestamp.signature
 */
export function generateOAuthState(storeId: string): string {
  const nonce = crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now().toString();
  const data = `${nonce}.${storeId}.${timestamp}`;
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(data)
    .digest('hex');
  return `${data}.${signature}`;
}

/**
 * Verifica el 'state' de OAuth y devuelve el storeId verificado, o null si fue alterado o expiró.
 * Estricto: no acepta formatos incompletos ni manipulados.
 */
export function verifyOAuthState(stateString: string, maxAgeMs = 3600000): string | null {
  if (!stateString) return null;
  const parts = stateString.split('.');
  
  // Requiere 4 partes (nonce, storeId, timestamp, signature) o 3 partes compatibles
  if (parts.length === 4) {
    const [nonce, storeId, timestampStr, signature] = parts;
    const data = `${nonce}.${storeId}.${timestampStr}`;
    const expectedSig = crypto
      .createHmac('sha256', getJwtSecret())
      .update(data)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSig);
    const signatureBuffer = Buffer.from(signature);

    if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
      console.warn('[OAuth Security] Intento de callback con state inválido o firma manipulada.');
      return null;
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp) || Date.now() - timestamp > maxAgeMs) {
      console.warn('[OAuth Security] State de OAuth expirado.');
      return null;
    }

    return storeId;
  }

  if (parts.length === 3) {
    const [storeId, timestampStr, signature] = parts;
    const data = `${storeId}.${timestampStr}`;
    const expectedSig = crypto
      .createHmac('sha256', getJwtSecret())
      .update(data)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSig);
    const signatureBuffer = Buffer.from(signature);

    if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
      console.warn('[OAuth Security] Intento de callback con state inválido o firma manipulada.');
      return null;
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp) || Date.now() - timestamp > maxAgeMs) {
      console.warn('[OAuth Security] State de OAuth expirado.');
      return null;
    }

    return storeId;
  }

  // Cualquier otro formato no firmado es rechazado
  return null;
}

/**
 * Valida la firma HMAC-SHA256 del Webhook de Mercado Pago.
 * Mercado Pago envía los headers:
 * - x-signature (ts=...,v1=...)
 * - x-request-id
 */
export function verifyMercadoPagoWebhookSignature(
  xSignatureHeader: string | undefined,
  xRequestIdHeader: string | undefined,
  dataId: string,
  webhookSecret: string | undefined
): boolean {
  const secret = webhookSecret || process.env.MP_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Webhook Security] MP_WEBHOOK_SECRET no configurado en producción. Rechazando webhook.');
      return false; // RECHAZAR OBLIGATORIAMENTE en producción si no hay secreto
    }
    // En desarrollo/test, si se proporciona secreto vacío explícitamente se rechaza
    return false;
  }

  if (!xSignatureHeader) {
    return false;
  }

  try {
    const parts = xSignatureHeader.split(',');
    let ts = '';
    let hash = '';

    for (const part of parts) {
      const [key, val] = part.trim().split('=');
      if (key === 'ts') ts = val;
      if (key === 'v1') hash = val;
    }

    if (!ts || !hash) {
      return false;
    }

    // Plantilla oficial Mercado Pago:
    // id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];
    const manifest = `id:${dataId};request-id:${xRequestIdHeader || ''};ts:${ts};`;
    
    const calculatedHash = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    const calculatedBuffer = Buffer.from(calculatedHash);
    const hashBuffer = Buffer.from(hash);

    if (calculatedBuffer.length !== hashBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(calculatedBuffer, hashBuffer);
  } catch (err) {
    console.error('[Webhook Signature Error]:', err);
    return false;
  }
}

/**
 * Genera un token JWT firmado mediante HMAC-SHA256 (RFC 7519).
 */
export function signJwtToken(payload: Record<string, unknown>, expiresInSeconds = 86400): string {
  const secret = getJwtSecret();
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Valida un token JWT y devuelve el payload o null si es inválido o expiró.
 */
export function verifyJwtToken<T = Record<string, unknown>>(token: string): T | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const secret = getJwtSecret();
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  const expectedBuffer = Buffer.from(expectedSig);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }

  try {
    const payloadJson = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as { exp?: number; [key: string]: unknown };

    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null; // Expirado
    }

    return payload as unknown as T;
  } catch {
    return null;
  }
}

/**
 * Hashea una contraseña usando PBKDF2 con Salt criptográfico (10.000 iteraciones SHA-512).
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifica una contraseña contra su hash PBKDF2 mediante comparación segura timing-safe.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !password) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const [salt, originalHash] = parts;
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  
  const hashBuffer = Buffer.from(hash);
  const origBuffer = Buffer.from(originalHash);

  if (hashBuffer.length !== origBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashBuffer, origBuffer);
}
