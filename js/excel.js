/* ==========================================================================
 * Bóveda · excel.js
 * Vista «Excel»: abre tus hojas de cálculo con un Excel de verdad.
 *
 * La Bóveda guarda los archivos CIFRADOS en el dispositivo. Para trabajar con
 * ellos hay tres caminos, y ninguno modifica el original:
 *
 *   1. «Abrir en Excel»  -> descarga el .xlsx y lo abre tu Excel del ordenador.
 *                            Al terminar, lo vuelves a subir con ⬆.
 *   2. «Excel Online»    -> abre Excel en el navegador (para archivos en OneDrive).
 *   3. «Ver con Drive»   -> visor de Google incrustado (permite ver y editar).
 * ========================================================================== */
'use strict';

/** ¿Este documento es una hoja de cálculo? */
function isSheet(d) {
  const t = String(d.type || '').toLowerCase();
  const name = String(d.file || d.name || '').toLowerCase();
  const ext = (name.match(/\.([a-z0-9]+)$/) || [, ''])[1];
  return ['xlsx', 'xlsm', 'xlsb', 'xls', 'ods', 'csv', 'tsv'].indexOf(ext) >= 0 ||
    /spreadsheet|excel|csv/.test(t);
}

/** Hojas de cálculo guardadas en la bóveda (las más nuevas primero). */
const sheetDocs = () => docs.filter(d => d.cat !== '_qx' && isSheet(d));

/** Pinta la vista «Excel». */
function renderXls() {
  const v = $('#view');
  const lista = sheetDocs();

  v.innerHTML = `
    <div class="vhead"><h1>Excel</h1></div>

    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">Trabajar con tus hojas de cálculo</h2>
      <div class="mu" style="margin-bottom:12px">Los archivos siguen <b>cifrados</b> en tu dispositivo. Elige cómo abrirlos:</div>
      <div style="display:grid;gap:10px">
        <button class="btn p" data-a="new" style="justify-content:flex-start">${ic('up')}Subir un Excel (.xlsx · .xls · .csv)</button>
        <button class="btn" data-a="xlsonline" style="justify-content:flex-start">${ic('cloud')}Abrir Excel Online (pestaña nueva)</button>
      </div>
      <div class="mu" style="margin-top:10px">Excel Online trabaja con los archivos de tu <b>OneDrive</b>. Para editar uno de la bóveda: pulsa <b>⬇ Abrir en Excel</b>, edítalo y súbelo de nuevo.</div>
    </div>

    ${lista.length
      ? `<div class="tree">${lista.map(xlsRowHtml).join('')}</div>`
      : `<div class="empty">${ic('file')}<br>Todavía no tienes hojas de cálculo.<br>Toca <b>Subir un Excel</b> para empezar.</div>`}

    <div class="mu" style="margin-top:14px">${lista.length} hoja${lista.length === 1 ? '' : 's'} de cálculo · cifradas</div>`;

  thumbnails(lista);
}

/** Fila de una hoja de cálculo: un clic en la fila la ABRE en Excel. */
function xlsRowHtml(d) {
  const ext = extOf(d);
  return `<div class="row2" data-a="xlsopen" data-id="${d.id}" style="padding-left:16px">
    <span class="tile" style="background:${tileColor('Excel')}">${esc(ext)}</span>
    <span class="nm">
      <span class="nm-top"><b>${esc(d.name)}</b><i class="fmt fam-sheet">${esc(ext)}</i></span>
      <span class="nm-sub">${esc(fmt(d.size))} · ${esc(relTime(d.date))} · ${esc(d.cat || 'General')}</span>
    </span>
    <span class="qa">
      <button data-a="xlsopen" data-id="${d.id}" title="Abrir en Excel">${ic('dl')}</button>
      <button data-a="drvview" data-id="${d.id}" title="Ver con el visor de Google">${ic('cloud')}</button>
      <button data-a="open" data-id="${d.id}" title="Vista previa">${ic('more')}</button>
    </span>
  </div>`;
}

/** Abre una hoja de cálculo con el Excel del ordenador (descarga el original). */
async function openInExcel(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  try {
    download(await getBlob(d), d.file || (d.name + '.xlsx'));
    toast('Abriéndolo con tu Excel. Al terminar, súbelo de nuevo ⬆');
  } catch (e) {
    toast('No se pudo abrir el archivo');
  }
}

/** Abre Excel Online en una pestaña nueva. */
function openExcelOnline() {
  const w = window.open('https://www.office.com/launch/excel', '_blank', 'noopener');
  if (!w) toast('Permite las ventanas emergentes');
}

window.XlsActions = { openInExcel, openExcelOnline };