/**
 * Security & Cryptography Utilities
 * Encriptación AES-256 para tokens OAuth y utilidades de firma de Webhooks
 */

import crypto from 'crypto';

// Clave de encriptación de 32 bytes (256 bits)
const getEncryptionKey = (): Buffer => {
  const envKey = process.env.ENCRYPTION_KEY || 'paginas_web_ventas_online_32b_secret_key_default!';
  // Si tiene formato hex o string directo, normalizamos a 32 bytes usando SHA-256
  return crypto.createHash('sha256').update(envKey).digest();
};

/**
 * Encripta un texto (ej: access_token de Mercado Pago) usando AES-256-GCM.
 * Retorna formato iv:authTag:encryptedData en base64.
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
      // Si no tiene el formato iv:tag:data (por ejemplo datos legacy en texto plano en dev), retornar directo
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
    // Si no hay secret configurado en desarrollo, permitimos validación en modo permisivo
    return true;
  }

  if (!xSignatureHeader) {
    return false;
  }

  try {
    // Parsear ts y v1 del header x-signature
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

    // Plantilla de manifiesto oficial de Mercado Pago:
    // id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];
    const manifest = `id:${dataId};request-id:${xRequestIdHeader || ''};ts:${ts};`;
    
    const calculatedHash = crypto
      .createHmac('sha256', webhookSecret)
      .update(manifest)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
  } catch (err) {
    console.error('[Webhook Signature Error]:', err);
    return false;
  }
}
