/* ==========================================================================
 * Bóveda · info.js
 * Vista "Mis datos": pares etiqueta/valor cifrados (documentos, cuentas,
 * contactos, notas rápidas...).
 * ========================================================================== */
'use strict';

/** Pinta la vista de datos personales. */
function renderInfo() {
  const v = $('#view');
  v.innerHTML = `<h1>Mis datos</h1>
  <div class="mu">${info.length} dato${info.length === 1 ? '' : 's'} cifrado${info.length === 1 ? '' : 's'}</div>
  <div class="chips"><button class="btn p" data-a="inadd">${ic('plus')}Agregar dato</button></div>
  ${info.length
      ? info.map(i => `<div class="row">
      <div class="l">${esc(i.label)}</div>
      <div class="v">${esc(i.value)}</div>
      <button class="btn s" title="Copiar" data-a="incopy" data-id="${i.id}">${ic('cp')}</button>
      <button class="btn s" title="Editar" data-a="inedit" data-id="${i.id}">${ic('ed')}</button>
      <button class="btn s d" title="Eliminar" data-a="inrm" data-id="${i.id}">${ic('tr')}</button>
    </div>`).join('')
      : `<div class="empty">${ic('id')}<br>Guarda aquí tus datos importantes<br>(números de documento, cuentas, contactos).<br>Toca <b>Agregar dato</b> para empezar.</div>`}`;
}

/** Formulario de alta/edición de un dato. */
function infoForm(item) {
  const isNew = !item;
  openModal(`<h2>${isNew ? 'Nuevo dato' : 'Editar dato'}</h2>
  <div class="f"><label>Etiqueta</label><input id="il" value="${esc(item ? item.label : '')}" placeholder="Ej: Nº de pasaporte"></div>
  <div class="f"><label>Valor</label><textarea id="iv" rows="4" placeholder="Contenido...">${esc(item ? item.value : '')}</textarea></div>
  <div class="fx"><button class="btn" data-a="close">Cancelar</button><button class="btn p" id="iok">${ic('ok')}Guardar</button></div>`);

  $('#iok').onclick = async () => {
    const label = $('#il').value.trim();
    const value = $('#iv').value.trim();
    if (!label) return toast('Escribe una etiqueta');

    if (isNew) {
      const ord = info.length ? Math.max.apply(null, info.map(i => i.ord)) + 1 : 1;
      await saveInfo({ id: uid(), ord, label, value });
    } else {
      const o = info.find(i => i.id === item.id);
      if (!o) return;
      Object.assign(o, { label, value });
      await saveInfo(o);
    }
    closeModal();
    await load();
    toast('Dato guardado ✅');
  };
}

/** Elimina un dato previa confirmación. */
async function removeInfo(id) {
  const i = info.find(x => x.id === id);
  if (!i) return;
  if (!await confirmDialog('Eliminar dato', `¿Eliminar «${i.label}»?`)) return;
  await del('info', id);
  await load();
  toast('Dato eliminado');
}

/** Copia el valor de un dato al portapapeles. */
function copyInfo(id) {
  const i = info.find(x => x.id === id);
  if (i) copyText(i.value);
}
