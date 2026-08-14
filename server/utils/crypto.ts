/**
 * Security & Cryptography Utilities
 * - Cifrado AES-256-GCM para tokens sensibles OAuth de Mercado Pago
 * - Firma y verificación de tokens JWT (RFC 7519)
 * - Protección CSRF para estados OAuth (HMAC-SHA256)
 * - Verificación de firmas criptográficas de Webhooks de Mercado Pago (HMAC-SHA256)
 * - Hashing seguro de contraseñas con PBKDF2 y Salt
 */

import crypto from 'crypto';

// Clave de encriptación de 32 bytes (256 bits) para AES-256-GCM
const getEncryptionKey = (): Buffer => {
  const envKey = process.env.ENCRYPTION_KEY || 'paginas_web_ventas_online_32b_secret_key_default!';
  return crypto.createHash('sha256').update(envKey).digest();
};

const getJwtSecret = (): string => {
  return process.env.JWT_SECRET || 'paginas_web_jwt_secret_key_production_safe_2026';
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
 */
export function decryptToken(encryptedString: string): string {
  if (!encryptedString) return '';
  
  try {
    const parts = encryptedString.split(':');
    if (parts.length !== 3) {
      // Formato no encriptado (legacy o desarrollo directo)
      return encryptedString;
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getEncryptionKey();
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.error('[Crypto Error] Fallo al desencriptar token:', err instanceof Error ? err.message : 'Error desconocido');
    return '';
  }
}

/**
 * Genera un parámetro 'state' firmado para OAuth de Mercado Pago para prevenir ataques CSRF.
 * Formato: storeId.timestamp.signature
 */
export function generateOAuthState(storeId: string): string {
  const timestamp = Date.now().toString();
  const data = `${storeId}.${timestamp}`;
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(data)
    .digest('hex');
  return `${data}.${signature}`;
}

/**
 * Verifica el 'state' de OAuth y devuelve el storeId verificado, o null si fue alterado o expiró.
 */
export function verifyOAuthState(stateString: string, maxAgeMs = 3600000): string | null {
  if (!stateString) return null;
  const parts = stateString.split('.');
  if (parts.length !== 3) {
    // Si viene solo storeId en modo tolerante
    return parts[0] || null;
  }

  const [storeId, timestampStr, signature] = parts;
  const data = `${storeId}.${timestampStr}`;
  const expectedSig = crypto
    .createHmac('sha256', getJwtSecret())
    .update(data)
    .digest('hex');

  if (signature !== expectedSig) {
    console.warn('[OAuth Security] Intento de callback con state inválido o manipulado.');
    return null;
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || Date.now() - timestamp > maxAgeMs) {
    console.warn('[OAuth Security] State de OAuth expirado.');
    return null;
  }

  return storeId;
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
  webhookSecret: string
): boolean {
  if (!webhookSecret) {
    // En desarrollo local sin secret configurado, permitir verificación
    return true;
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
      .createHmac('sha256', webhookSecret)
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

  if (signature !== expectedSig) {
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
 * Hashea una contraseña usando PBKDF2 con Salt criptográfico.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifica una contraseña contra su hash PBKDF2.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const [salt, originalHash] = parts;
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(originalHash));
}
