/* ==========================================================================
 * Bóveda · share.js
 * Compartir documentos desde la propia aplicación.
 *
 * CÓMO FUNCIONA DE VERDAD (importante, no hay magia):
 *   • En el CELULAR, la Web Share API abre el menú nativo del sistema con el
 *     archivo YA ADJUNTO: WhatsApp, Gmail, Telegram, Drive… lo que tengas.
 *   • En el ESCRITORIO esa API casi nunca existe (Firefox/Linux, Chrome/Linux)
 *     y NINGUNA web puede adjuntar archivos a WhatsApp o Gmail: los navegadores
 *     lo bloquean por seguridad. En ese caso se abre la app con el mensaje ya
 *     escrito y se descarga el archivo para que lo adjuntes tú.
 *
 * ⚠️ Al compartir, el documento sale DESCIFRADO de la bóveda. A partir de ahí
 *    deja de estar protegido, así que la app lo avisa antes.
 * ========================================================================== */
'use strict';

let shareCtx = null;   // { d, file } del documento que se está compartiendo

/** ¿El sistema puede compartir un archivo de verdad (menú nativo)? */
function canShareFiles(file) {
  try {
    return !!(navigator.canShare && file && navigator.canShare({ files: [file] }));
  } catch (e) { return false; }
}

/** Texto que acompaña al documento compartido. */
function shareText(d) {
  return (d.name || 'Documento') + (d.notes ? '\n' + d.notes : '') + '\n\nCompartido desde ' + APP_NAME;
}

/**
 * Comparte un documento: primero intenta el menú nativo con el archivo
 * adjunto; si no se puede, abre el diálogo con las alternativas.
 */
async function shareDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;

  let blob;
  try { blob = await getBlob(d); } catch (e) { return toast('No se pudo leer el documento'); }

  const file = new File([blob], d.file || d.name, { type: d.type || 'application/octet-stream' });
  shareCtx = { d, file };

  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file], title: d.name, text: shareText(d) });
      return;                                    // el usuario eligió destino
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // canceló: no hacemos nada
    }
  }
  shareDialog(d, file);
}

/** Abre una URL externa en una pestaña nueva. */
function openExternal(url) {
  const w = window.open(url, '_blank', 'noopener');
  if (!w) toast('Permite las ventanas emergentes para compartir');
}

/* --------------------- Diálogo de alternativas ------------------------- */

/** Se muestra cuando no hay menú nativo (o el usuario lo canceló). */
function shareDialog(d, file) {
  const native = canShareFiles(file);

  openModal(`<h2>Compartir «${esc(d.name)}»</h2>
  <div class="mu" style="margin-bottom:12px">⚠️ Al compartir, el documento <b>sale descifrado</b> de tu bóveda: a partir de ahí ya no está protegido por tu contraseña.</div>

  ${native ? `<button class="btn p" data-a="shnative" style="justify-content:center;width:100%;margin-bottom:10px">${ic('share')}Compartir con otra app (menú del sistema)</button>` : ''}

  <div style="display:grid;gap:8px">
    <button class="btn" data-a="shwa" style="justify-content:flex-start">${ic('chat')}WhatsApp — abrir con el mensaje escrito</button>
    <button class="btn" data-a="shgm" style="justify-content:flex-start">${ic('mail')}Gmail — abrir un correo nuevo</button>
    <button class="btn" data-a="shml" style="justify-content:flex-start">${ic('mail')}Otro correo (Mail)</button>
    <button class="btn" data-a="shcopy" style="justify-content:flex-start">${ic('cp')}Copiar el mensaje</button>
    <button class="btn p" data-a="shdl" style="justify-content:flex-start">${ic('dl')}Descargar el archivo</button>
  </div>

  <div class="mu" style="margin-top:14px;border-top:1px solid var(--bd);padding-top:12px">
    ${native
      ? 'Con el menú del sistema el archivo va <b>adjunto</b> y solo tienes que elegir a quién.'
      : 'En computadora, WhatsApp y Gmail <b>no permiten adjuntar archivos desde una web</b> (es una protección del navegador). Descarga el archivo, se abre la conversación con el mensaje ya escrito y adjúntalo con el clip 📎.'}
  </div>
  <div class="fx"><button class="btn" data-a="close">Cancelar</button></div>`);
}

/* ------------------------- Acciones del diálogo ------------------------ */

function shNative() {
  if (!shareCtx) return;
  closeModal();
  navigator.share({ files: [shareCtx.file], title: shareCtx.d.name, text: shareText(shareCtx.d) })
    .catch(() => { });
}

function shWhatsApp() {
  if (!shareCtx) return;
  openExternal('https://wa.me/?text=' + encodeURIComponent(shareText(shareCtx.d)));
  toast('Adjunta el archivo con el clip 📎');
}

function shGmail() {
  if (!shareCtx) return;
  const s = encodeURIComponent(shareCtx.d.name || 'Documento');
  openExternal('https://mail.google.com/mail/?view=cm&fs=1&su=' + s +
    '&body=' + encodeURIComponent(shareText(shareCtx.d)));
  toast('Adjunta el archivo con el clip 📎');
}

function shMail() {
  if (!shareCtx) return;
  const s = encodeURIComponent(shareCtx.d.name || 'Documento');
  openExternal('mailto:?subject=' + s + '&body=' + encodeURIComponent(shareText(shareCtx.d)));
}

function shCopy() {
  if (!shareCtx) return;
  copyText(shareText(shareCtx.d));
}

function shDownload() {
  if (!shareCtx) return;
  download(shareCtx.file, shareCtx.file.name);
  toast('Archivo descargado: ahora adjúntalo 📎');
}

/** Comparte varios documentos a la vez (si el sistema lo permite). */
async function shareMany(ids) {
  const files = [];
  for (const id of ids) {
    const d = docs.find(x => x.id === id);
    if (!d) continue;
    try {
      const b = await getBlob(d);
      files.push(new File([b], d.file || d.name, { type: d.type || 'application/octet-stream' }));
    } catch (e) { }
  }
  if (!files.length) return toast('No hay documentos que compartir');
  try {
    if (navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files, title: APP_NAME + ' · ' + files.length + ' documentos' });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  toast('Tu dispositivo solo permite compartir de uno en uno');
}
