/* ==========================================================================
 * Bóveda · ms-auth.js
 * Página de retorno del inicio de sesión de Microsoft (ver ms-auth.html).
 *
 * No forma parte de la app: solo recoge el «code» de la URL, se lo envía a la
 * ventana que abrió esta (por postMessage) y se cierra sola.
 * Va en un archivo aparte porque la CSP prohíbe los scripts en línea.
 * ========================================================================== */
'use strict';

(function () {
  const q = new URLSearchParams(location.search);
  let code = q.get('code') || '';
  const error = q.get('error') || '';
  const desc = q.get('error_description') || '';

  /* Algunos proveedores devuelven los datos en el fragmento (#code=…). */
  if (!code && location.hash) {
    try { code = new URLSearchParams(location.hash.slice(1)).get('code') || ''; } catch (e) { }
  }

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { boveda: 'msauth', code: code, error: error, desc: desc },
        location.origin
      );
    }
  } catch (e) { /* sin ventana madre: no hay nada que hacer */ }

  const msg = document.getElementById('msg');
  if (msg) {
    msg.textContent = error
      ? 'No se pudo conectar: ' + (desc || error)
      : 'Listo. Puedes cerrar esta ventana.';
  }
  setTimeout(() => { try { window.close(); } catch (e) { } }, 700);
})();
