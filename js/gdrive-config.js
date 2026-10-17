/* ==========================================================================
 * Bóveda · gdrive-config.js
 *
 * ⚙️  AQUÍ SE CONFIGURA LA SINCRONIZACIÓN CON GOOGLE DRIVE
 *
 * Pega abajo tu ID de cliente de Google (client ID). Se crea gratis en
 * Google Cloud Console; el README explica los pasos con detalle.
 *
 * Ejemplo:
 *   let driveClientId = '123456789012-abcdefghijklmnop.apps.googleusercontent.com';
 *
 * Si lo dejas vacío, el panel de Google Drive en Ajustes aparecerá
 * desactivado con las instrucciones, y el resto de la app funciona igual.
 * ========================================================================== */
'use strict';

/**
 * ID de cliente OAuth 2.0 (tipo «Aplicación web»).
 *
 * Puedes pegarlo aquí (queda en el código y lo tendrán TODOS tus dispositivos)
 * o directamente desde la app: Ajustes → Sincronización con Google Drive.
 *
 * Es mutable a propósito: las pruebas automáticas lo sustituyen.
 */
let driveClientId = '';

/** Clave de localStorage donde se guarda el ID pegado desde Ajustes. */
const DRIVE_ID_KEY = 'boveda-drive-client-id';

/** ID guardado desde la app (o cadena vacía). */
function savedDriveClientId() {
  try { return localStorage.getItem(DRIVE_ID_KEY) || ''; } catch (e) { return ''; }
}

/**
 * ID efectivo: el del archivo si lo hay; si no, el pegado desde Ajustes.
 * Se prefiere el del archivo porque así viene ya puesto en todos los
 * dispositivos donde se publique la app.
 */
function effectiveDriveClientId() {
  return driveClientId || savedDriveClientId();
}

/** Guarda el ID pegado desde Ajustes (solo en este dispositivo). */
function saveDriveClientId(id) {
  try { localStorage.setItem(DRIVE_ID_KEY, id); } catch (e) { }
}

/** ¿Tiene pinta de ID de cliente de Google? */
const looksLikeClientId = id => /^[\w-]+\.apps\.googleusercontent\.com$/.test(String(id || '').trim());

/** Permiso solicitado: solo los archivos que crea esta app. */
const DRIVE_SCOPE = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

/** Nombre del archivo de respaldo dentro de tu Drive. */
const DRIVE_FILE_NAME = 'boveda-respaldo.json';

/** Milisegundos de espera tras un cambio antes de subir automáticamente. */
const DRIVE_PUSH_DELAY = 3000;
