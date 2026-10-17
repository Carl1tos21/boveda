/* ==========================================================================
 * Bóveda · crypto.js
 * Cifrado AES-GCM 256 con clave derivada por PBKDF2-SHA256.
 * El IV (12 bytes) se antepone al criptograma; la etiqueta GCM (16 bytes)
 * viaja al final, de ahí GCM_OVERHEAD = 28 bytes de sobrecarga.
 * ========================================================================== */
'use strict';

/** Deriva la clave maestra a partir de la contraseña y el salt. */
async function derive(pw, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    k,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Cifra un buffer y devuelve IV || criptograma. */
async function E(k, buf) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, buf);
  const o = new Uint8Array(IV_BYTES + c.byteLength);
  o.set(iv);
  o.set(new Uint8Array(c), IV_BYTES);
  return o.buffer;
}

/** Descifra un buffer con formato IV || criptograma. */
async function D(k, buf) {
  const u = new Uint8Array(buf);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, IV_BYTES) }, k, u.slice(IV_BYTES));
}

/** ¿El navegador puede cifrar en este contexto (https, localhost o file)? */
const cryptoOK = () => !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues);

/**
 * Explica por qué no hay cifrado disponible. El mensaje importa: es el error
 * más habitual al probar desde el móvil (http://192.168.x.x no es un origen
 * seguro y los navegadores desactivan crypto.subtle).
 */
function cryptoProblemMsg() {
  if (!window.isSecureContext && /^https?:$/.test(location.protocol)) {
    return 'Estás abriendo la app en ' + location.origin + ', que no es un origen ' +
      'seguro. Los navegadores solo permiten el cifrado en https:// o en localhost. ' +
      'Prueba con «python3 tools/serve.py --https --lan» o publica la app.';
  }
  return 'Tu navegador no permite el cifrado aquí. Abre el enlace directamente en Chrome o Safari.';
}
