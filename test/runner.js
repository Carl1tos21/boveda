/* ==========================================================================
 * Bóveda · test/runner.js
 * Prueba de extremo a extremo. Se inyecta al final de index.html cuando la
 * página se sirve a través de /__test (ver tools/serve.py).
 * Ejecuta la app real en un navegador y devuelve el informe a /__report.
 *
 * Los módulos son scripts clásicos, así que este runner comparte el mismo
 * entorno léxico global y puede llamar directamente a las funciones de la app.
 * ========================================================================== */
(function () {
  const R = { ok: true, steps: [], errors: [], details: {} };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);

  function step(name, ok, extra) {
    R.steps.push({ name, ok: !!ok, extra: extra === undefined ? null : extra });
    if (!ok) R.ok = false;
  }
  async function until(fn, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { if (fn()) return true; } catch (e) { }
      await wait(50);
    }
    return false;
  }
  async function report() {
    R.errors = window.__errs || [];
    if (R.errors.length) R.ok = false;
    const json = JSON.stringify(R);
    // Modo servidor: se envía a /__report.
    try { await fetch('/__report?d=' + encodeURIComponent(json)); } catch (e) { }
    // Modo file://: se escribe en el flujo de errores de Firefox (dump()).
    try { if (typeof dump === 'function') dump('__BOVEDA_REPORT__' + json + '\n'); } catch (e) { }
  }

  /** Genera un File de imagen sintético (JPEG con degradado y texto). */
  async function makeImageFile(name, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#ff0000');
    g.addColorStop(1, '#0000ff');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff';
    x.font = 'bold 90px sans-serif';
    x.fillText('BOVEDA', 60, Math.round(h / 2));
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
    return new File([blob], name, { type: 'image/jpeg' });
  }

  /** Lee un registro CRUDO de IndexedDB (cifrado, sin pasar por la app). */
  function rawGet(store, id) {
    return new Promise((res, rej) => {
      const q = indexedDB.open('boveda2');
      q.onsuccess = () => {
        const db = q.result;
        const rq = db.transaction(store).objectStore(store).get(id);
        rq.onsuccess = () => { const v = rq.result; db.close(); res(v); };
        rq.onerror = () => { db.close(); rej(rq.error); };
      };
      q.onerror = () => rej(q.error);
    });
  }

  /** ¿Aparece el texto (UTF-8) dentro de un ArrayBuffer? */
  function hasText(buf, text) {
    const bytes = new Uint8Array(buf);
    const needle = new TextEncoder().encode(text);
    outer:
    for (let i = 0; i <= bytes.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
      return true;
    }
    return false;
  }

  /** Simula el arrastre de un asa de recorte con Pointer Events. */
  function drag(handle, dx, dy) {
    const r = handle.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const opts = { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y };
    handle.dispatchEvent(new PointerEvent('pointerdown', opts));
    document.dispatchEvent(new PointerEvent('pointermove', Object.assign({}, opts, { clientX: x + dx, clientY: y + dy })));
    document.dispatchEvent(new PointerEvent('pointerup', opts));
  }

  window.__runBovedaTests = async function () {
    try {
      /* ---------------- 0. Arranque ---------------- */
      const ready = await until(() => window.Boveda && $('#lock'));
      step('app.js expone window.Boveda', !!ready);
      if (!ready) return;

      step('pantalla de bloqueo visible', getComputedStyle($('#lock')).display === 'flex');
      step('modo creación (primera vez)', /Crear/.test($('#lb').textContent), $('#lb').textContent.trim());
      step('crypto.subtle disponible', !!(window.crypto && window.crypto.subtle), { secure: window.isSecureContext });
      step('jsPDF cargado', !!(window.jspdf && window.jspdf.jsPDF));

      /* ---------------- 1. Crear la bóveda ---------------- */
      $('#lp').value = 'clave123';
      $('#lp2').value = 'clave123';
      $('#lb').click();

      step('bóveda creada y desbloqueada', await until(() => window.Boveda.state.unlocked));
      step('#app visible tras desbloquear', !$('#app').hidden);
      step('estado vacío en Documentos', await until(() => /Tu bóveda está vacía/.test($('#view').innerHTML)));
      step('barra lateral construida', $('#nav').children.length >= 5, $('#nav').children.length);
      step('navegación inferior construida', $('#bot').children.length === 6, $('#bot').children.length);

      /* ---------------- 2. Alta de documento ---------------- */
      const img = await makeImageFile('informe-secreto.jpg', 900, 700);
      const origBytes = new Uint8Array(await img.arrayBuffer());

      handleFiles([img]);
      step('se abre el formulario de documento', await until(() => $('#fn') && $('#fok')));
      $('#fn').value = 'Informe secreto';
      $('#fc').value = 'Trabajo';
      $('#fno').value = 'Notas confidenciales';
      $('#fok').click();

      step('documento persistido', await until(() => window.Boveda.state.docs.length === 1));
      const d = window.Boveda.state.docs[0];
      step('metadatos correctos',
        d && d.name === 'Informe secreto' && d.cat === 'Trabajo' && d.notes === 'Notas confidenciales',
        d && { name: d.name, cat: d.cat, notes: d.notes, size: d.size });
      step('tarjeta pintada en la rejilla', /Informe secreto/.test($('#view').innerHTML));
      step('miniatura generada', await until(() => !!$('[data-th="' + d.id + '"] img')));

      /* ---------------- 3. Cifrado real en disco ---------------- */
      const raw = await rawGet('docs', d.id);
      const rawHead = new Uint8Array(raw.blob);
      step('registro crudo existe', !!raw);
      step('el blob guardado NO es un JPEG en claro', !(rawHead[0] === 0xFF && rawHead[1] === 0xD8),
        { b0: rawHead[0], b1: rawHead[1] });
      step('el nombre no aparece en claro en los metadatos', !hasText(raw.meta, 'Informe secreto'));
      step('sobrecarga AES-GCM correcta (28 bytes)', raw.blob.byteLength === origBytes.length + 28,
        { guardado: raw.blob.byteLength, original: origBytes.length });

      const back = new Uint8Array(await (await getBlob(d)).arrayBuffer());
      let same = back.length === origBytes.length;
      for (let i = 0; same && i < back.length; i++) if (back[i] !== origBytes[i]) same = false;
      step('descifrado bit a bit idéntico al original', same);

      /* ---------------- 4. Datos personales ---------------- */
      $('[data-v="info"]').click();
      step('vista Mis datos activa', await until(() => /Mis datos/.test($('#view').innerHTML)));

      $('[data-a="inadd"]').click();
      step('formulario de dato abierto', await until(() => $('#il') && $('#iok')));
      $('#il').value = 'Pasaporte';
      $('#iv').value = 'X1234567';
      $('#iok').click();

      step('dato persistido', await until(() => window.Boveda.state.info.length === 1));
      step('dato pintado en la lista', /Pasaporte/.test($('#view').innerHTML));
      const iraw = await rawGet('info', window.Boveda.state.info[0].id);
      step('el valor del dato está cifrado en disco', !hasText(iraw.c, 'X1234567'));

      /* ---------------- 5. Ajustes y tema ---------------- */
      $('[data-v="set"]').click();
      step('vista Ajustes activa', await until(() => /Ajustes/.test($('#view').innerHTML) && $('#sttheme')));
      $('#sttheme').value = 'dark';
      $('#sttheme').dispatchEvent(new Event('change'));
      step('tema oscuro aplicado', document.documentElement.dataset.theme === 'dark');
      $('#sttheme').value = 'auto';
      $('#sttheme').dispatchEvent(new Event('change'));
      step('tema automático restaurado', !document.documentElement.dataset.theme);
      step('selector de autobloqueo presente', !!$('#stauto'));

      /* ---------------- 6. Escáner: recorte, rotación y PDF ---------------- */
      openScan();
      step('escáner abierto', await until(() => !!$('#scv') && scan.active));
      step('escáner sin páginas muestra el aviso', !!$('#scb').classList.contains('c'));

      await scanAdd(await makeImageFile('hoja1.jpg', 1200, 900));
      await scanAdd(await makeImageFile('hoja2.jpg', 900, 1200));
      step('dos páginas añadidas', scan.pages.length === 2, scan.pages.length);
      step('rejilla de páginas visible', $$('#scb .pg img').length === 2);

      scanCrop(0);
      step('modo recorte activo', await until(() => !!$('#stg') && !!scan.crop));
      step('4 asas de recorte', $$('#stg .hd').length === 4);
      const pts0 = JSON.stringify(scan.crop.pts);
      drag($('#stg .hd'), -40, -30);
      step('el arrastre mueve el asa', JSON.stringify(scan.crop.pts) !== pts0, scan.crop.pts[0]);
      step('el polígono se actualiza', $('#stp').getAttribute('points').split(' ').length === 4);

      const before = scan.pages[0].canvas.width;
      scanApply();
      step('recorte aplicado (ancho reducido)', scan.pages[0].canvas.width < before,
        { antes: before, despues: scan.pages[0].canvas.width });

      scanCrop(0);
      const w0 = scan.pages[0].canvas.width, h0 = scan.pages[0].canvas.height;
      scanRotate();
      step('rotación intercambia dimensiones',
        scan.pages[0].canvas.width === h0 && scan.pages[0].canvas.height === w0,
        { w: scan.pages[0].canvas.width, h: scan.pages[0].canvas.height });
      scanCancel();
      step('cancelar sale del recorte', !scan.crop);

      await scanSave();
      step('el PDF abre el formulario de guardado',
        await until(() => $('#fn') && /^Escaneo/.test($('#fn').value)), $('#fn').value);
      step('tipo PDF y categoría Escaneos', $('#fc').value === 'Escaneos');
      $('#fok').click();
      step('PDF persistido', await until(() => window.Boveda.state.docs.length === 2));
      const pdf = window.Boveda.state.docs.find(x => x.type === 'application/pdf');
      step('el documento escaneado es un PDF', !!pdf && pdf.type === 'application/pdf', pdf && pdf.file);
      const pbytes = pdf ? new Uint8Array(await (await getBlob(pdf)).arrayBuffer()) : new Uint8Array(0);
      step('el PDF descifrado empieza por %PDF',
        String.fromCharCode(pbytes[0], pbytes[1], pbytes[2], pbytes[3]) === '%PDF');
      step('el escáner se cerró al guardar', !$('#scv'));

      /* ---------------- 7. Homografía (rectificación) ---------------- */
      const sq = document.createElement('canvas');
      sq.width = 60; sq.height = 40;
      const sx = sq.getContext('2d');
      sx.fillStyle = '#ff0000';
      sx.fillRect(0, 0, 60, 40);
      const wout = warp(sq, [[0, 0], [60, 0], [60, 40], [0, 40]], 60, 40);
      const px = wout.getContext('2d').getImageData(30, 20, 1, 1).data;
      step('warp identidad conserva el color', px[0] > 200 && px[1] < 60 && px[2] < 60, [px[0], px[1], px[2]]);

      const Hm = solveH([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 0], [2, 0], [2, 2], [0, 2]]);
      const mx = (Hm[0] * 0.5 + Hm[1] * 0.5 + Hm[2]) / (Hm[6] * 0.5 + Hm[7] * 0.5 + 1);
      step('la homografía escala correctamente', Math.abs(mx - 1) < 1e-9, mx);

      /* ---------------- 8. Bloqueo y desbloqueo ---------------- */
      lockNow();
      step('bloqueo manual', await until(() => !window.Boveda.state.unlocked && getComputedStyle($('#lock')).display === 'flex'));
      step('memoria liberada tras bloquear', window.Boveda.state.docs.length === 0);
      step('modo desbloqueo (ya existe bóveda)', await until(() => /Entrar/.test($('#lb').textContent)));

      $('#lp').value = 'incorrecta';
      $('#lb').click();
      step('contraseña incorrecta rechazada', await until(() => /incorrecta/.test($('#le').textContent), 20000),
        $('#le').textContent.trim());
      step('sigue bloqueado tras fallar', !window.Boveda.state.unlocked);

      $('#lp').value = 'clave123';
      $('#lb').click();
      step('desbloqueo con la contraseña correcta', await until(() => window.Boveda.state.unlocked, 20000));
      step('los 2 documentos siguen ahí', await until(() => window.Boveda.state.docs.length === 2));
      step('el dato personal sigue ahí', await until(() => window.Boveda.state.info.length === 1));

      /* ---------------- 9. PWA y protección de datos ---------------- */
      const mlink = document.querySelector('link[rel="manifest"]');
      step('index.html declara el manifest', !!mlink, mlink && mlink.getAttribute('href'));

      const ati = document.querySelector('link[rel="apple-touch-icon"]');
      step('apple-touch-icon declarado', !!ati, ati && ati.getAttribute('href'));

      if (location.protocol !== 'file:') {
        let manifest = null;
        try { manifest = await (await fetch('manifest.json')).json(); } catch (e) { }
        step('el manifest se sirve y es JSON válido', !!manifest && !!manifest.name,
          manifest && manifest.name);
        step('el manifest declara 3 iconos', !!manifest && (manifest.icons || []).length >= 3,
          manifest && (manifest.icons || []).length);
        step('el manifest arranca a pantalla completa',
          !!manifest && manifest.display === 'standalone');

        const iconRes = await fetch('icons/icon-192.png').catch(() => null);
        step('el icono 192 se sirve correctamente',
          !!iconRes && iconRes.ok &&
          (iconRes.headers.get('content-type') || '').indexOf('image/png') === 0,
          iconRes && iconRes.headers.get('content-type'));
      } else {
        // Con file:// el navegador no permite fetch a archivos locales;
        // estas comprobaciones ya quedan cubiertas por la ejecución por HTTP.
        step('manifest e iconos: cubiertos por la ejecución por HTTP', true);
      }

      step('la API de almacenamiento persistente existe',
        !!(navigator.storage && navigator.storage.persist && navigator.storage.estimate));
      const st = await storageState();
      step('se puede consultar uso y cuota', st.quota > 0,
        { usage: st.usage, quota: st.quota, persistent: st.persistent });

      if (location.protocol !== 'file:' && 'serviceWorker' in navigator) {
        const reg = await Promise.race([
          navigator.serviceWorker.ready.then(() => true).catch(() => false),
          new Promise(r => setTimeout(() => r(false), 8000))
        ]);
        step('service worker registrado y activo', reg === true);
        const keys = await caches.keys().catch(() => []);
        step('el service worker creó su caché', keys.length > 0, keys);
      } else {
        step('service worker omitido al abrir desde el disco', location.protocol === 'file:',
          location.protocol);
      }

      $('[data-v="set"]').click();
      step('Ajustes muestra la protección de datos', await until(() => !!$('#stpersist') && !!$('#stask')));
      step('el estado del almacenamiento se resuelve',
        await until(() => $('#stpersist') && $('#stpersist').textContent.trim() !== 'Comprobando…'),
        $('#stpersist') && $('#stpersist').textContent.trim());

      /* ---------------- 10. Visor de documentos ---------------- */
      view = 'docs';
      render();
      await until(() => window.Boveda.state.docs.some(x => /^image\//.test(x.type)));
      const imgDoc = window.Boveda.state.docs.find(x => /^image\//.test(x.type));
      await viewDoc(imgDoc.id);
      step('el visor de imagen se abre', await until(() => !!$('.md.big .view img')));
      step('la imagen se carga desde blob:',
        !!$('.md.big .view img') && $('.md.big .view img').src.slice(0, 5) === 'blob:');
      closeModal();
      step('el visor se cierra', !$('.md.big'));

      const pdfDoc = window.Boveda.state.docs.find(x => x.type === 'application/pdf');
      if (pdfDoc) {
        await viewDoc(pdfDoc.id);
        step('el visor de PDF usa un iframe blob:', await until(() => !!$('.md.big .view iframe')));
        closeModal();
      }

      /* ---------------- 11. Edición y borrado ---------------- */
      const editable = window.Boveda.state.docs.find(x => /^image\//.test(x.type));
      editDoc(editable.id);
      step('el formulario de edición se abre', await until(() => !!$('#fn') && !!$('#fok')));
      $('#fn').value = 'Informe renombrado';
      $('#fc').value = 'Archivo';
      $('#fno').value = 'Nota editada';
      $('#fok').click();
      step('la edición se aplica',
        await until(() => window.Boveda.state.docs.some(x => x.name === 'Informe renombrado')));

      // El guardado lanza load(), que vacía y vuelve a llenar `docs`. Hay que
      // esperar a que la recarga termine (loadSeq) o leeríamos el array a medias.
      const seqEdit = loadSeq;
      await until(() => loadSeq > seqEdit || !$('#fn'));

      const edited = window.Boveda.state.docs.find(x => x.name === 'Informe renombrado');
      step('la categoría se actualizó', edited && edited.cat === 'Archivo', edited && edited.cat);

      const eraw = await rawGet('docs', edited.id);
      step('el nombre no aparece en claro en disco', !hasText(eraw.meta, 'Informe renombrado'));
      const emeta = JSON.parse(dec.decode(await D(key, eraw.meta)));
      step('el nuevo nombre se guardó cifrado',
        emeta.name === 'Informe renombrado' && emeta.cat === 'Archivo',
        { name: emeta.name, cat: emeta.cat });

      const beforeCount = window.Boveda.state.docs.length;
      removeDoc(edited.id);
      step('el diálogo de borrado aparece', await until(() => !!$('#cfok')));
      $('#cfok').click();
      step('el documento se elimina',
        await until(() => window.Boveda.state.docs.length === beforeCount - 1),
        window.Boveda.state.docs.length);
      step('ya no está en disco', !(await rawGet('docs', edited.id)));

      /* ---------------- 12. Sincronización con Google Drive ---------------- */
      // 12.0 Sin ID de cliente: la app debe pedirlo desde Ajustes.
      //     (Con file:// el panel se desactiva, así que se omite.)
      if (location.protocol !== 'file:') {
        driveClientId = '';
        try { localStorage.removeItem(DRIVE_ID_KEY); } catch (e) { }
        view = 'set';
        render();
        step('sin ID de cliente, el panel pide configurarlo',
          await until(() => !!$('#drvid') && !!$('[data-a="gsaveid"]')));
        step('sin configurar, la sincronización no está lista', !gdriveReady());

        $('#drvid').value = 'esto-no-es-un-id';
        $('[data-a="gsaveid"]').click();
        step('rechaza un ID con formato inválido', !gdriveReady());

        $('#drvid').value = '123456789012-abcdefghijklmnop.apps.googleusercontent.com';
        $('[data-a="gsaveid"]').click();
        step('acepta y guarda un ID válido', gdriveReady());
        step('el ID queda guardado en el dispositivo',
          savedDriveClientId() === '123456789012-abcdefghijklmnop.apps.googleusercontent.com');
      } else {
        step('configuración del ID de cliente: cubierta por la ejecución por HTTP', true);
      }

      // Dobles de prueba: ni Google ni la red entran en juego. Se sustituyen
      // driveAuth y drive por versiones falsas para validar toda la lógica.
      driveClientId = 'cliente-de-prueba';
      prefs.driveConnected = true;
      prefs.driveAuto = false;
      prefs.driveEmail = 'prueba@ejemplo.com';
      prefs.driveConflict = false;
      prefs.driveError = '';

      const fake = { file: null, content: null, clock: Date.parse('2026-01-01T00:00:00Z') };
      const tick = () => { fake.clock += 60000; return new Date(fake.clock).toISOString(); };

      driveAuth.token = async () => 'token-de-prueba';
      driveAuth.email = async () => 'prueba@ejemplo.com';
      drive.list = async () => fake.file;
      drive.create = async (t, blob) => {
        fake.content = await blob.text();
        fake.file = { id: 'f1', modifiedTime: tick(), size: fake.content.length };
        return { id: 'f1', modifiedTime: fake.file.modifiedTime };
      };
      drive.update = async (t, id, blob) => {
        fake.content = await blob.text();
        fake.file = { id, modifiedTime: tick(), size: fake.content.length };
        return { id, modifiedTime: fake.file.modifiedTime };
      };
      drive.download = async () => fake.content;

      step('la sincronización queda configurada y conectada',
        gdriveReady() && driveConnected());

      // 12.1 Sin copia en Drive -> sube
      let r = await syncNow();
      step('sin copia remota, sube la bóveda', r.status === 'uploaded', r.status);
      const remote1 = JSON.parse(fake.content || '{}');
      step('la copia remota es un respaldo de bóveda', remote1.app === 'boveda');
      step('la copia remota lleva los documentos', (remote1.docs || []).length >= 1,
        (remote1.docs || []).length);
      step('la copia remota NO contiene nada en claro',
        !(fake.content || '').includes('Informe renombrado') &&
        !(fake.content || '').includes('Pasaporte'));

      // 12.2 Sin cambios -> no hace nada
      r = await syncNow();
      step('sin cambios no hace nada', r.status === 'uptodate', r.status);

      // 12.3 Cambio local -> sube
      const localDoc = docs[0];
      localDoc.notes = 'nota para sincronizar';
      await saveDoc(localDoc);
      await load();
      r = await syncNow();
      step('un cambio local se sube a Drive', r.status === 'uploaded', r.status);

      // 12.4 Cambio remoto (otro dispositivo) -> baja
      fake.file.modifiedTime = tick();
      r = await syncNow();
      step('un cambio remoto se trae de Drive', r.status === 'downloaded', r.status);
      step('tras bajar, ya no hay nada pendiente', (await syncNow()).status === 'uptodate');

      // 12.5 Cambian los dos -> conflicto
      docs[0].notes = 'cambio local para el conflicto';
      await saveDoc(docs[0]);
      await load();
      fake.file.modifiedTime = tick();
      r = await syncNow({ auto: true });
      step('detecta el conflicto sin tocar nada', r.status === 'conflict', r.status);
      step('el conflicto queda marcado en Ajustes', prefs.driveConflict === true);

      syncNow();
      step('aparece el diálogo de conflicto', await until(() => !!$('#cfup')));
      $('#cfup').click();
      step('el conflicto se resuelve subiendo',
        await until(() => prefs.driveConflict === false));

      // 12.6 Un «dispositivo nuevo» (bóveda vacía) adopta la copia de Drive
      const beforeDocs = docs.length;
      await clearStore('docs');
      await clearStore('info');
      await put('meta', { id: 'drive' });     // sin estado de sincronización
      await load();
      step('la bóveda local queda vacía', docs.length === 0, docs.length);
      r = await syncNow();
      step('una bóveda vacía adopta la copia de Drive', r.status === 'downloaded', r.status);
      step('los documentos vuelven desde Drive', docs.length === beforeDocs, docs.length);

      // 12.7 Panel de Ajustes
      $('[data-v="set"]').click();
      step('Ajustes muestra el panel de Google Drive',
        await until(() => /Sincronización con Google Drive/.test($('#view').innerHTML)));

      if (location.protocol !== 'file:') {
        step('el panel muestra la cuenta conectada',
          /prueba@ejemplo\.com/.test($('#view').innerHTML));
        step('el interruptor de sincronización automática existe', !!$('#drvauto'));
      } else {
        // Con file:// Google no puede autenticar: el panel debe explicarlo.
        step('en file:// el panel explica que no está disponible',
          /No disponible al abrir el archivo/.test($('#view').innerHTML));
      }

      prefs.driveConnected = false;
      savePrefs();
      r = await syncNow();
      step('desconectado, no sincroniza', r.status === 'disconnected', r.status);
      renderSet();
      if (location.protocol !== 'file:') {
        step('el panel ofrece conectar', await until(() => !!$('[data-a="gconnect"]')));
      } else {
        step('en file:// no se ofrece conectar', !$('[data-a="gconnect"]'));
      }

      /* ---------------- 13. Interfaz tipo Keeper ---------------- */
      // Se siembran un par de documentos más para que el árbol tenga varias
      // carpetas y las pruebas de la lista sean significativas.
      for (const [nm, ct] of [['Factura de la luz', 'Banca'], ['Informe médico', 'Salud']]) {
        const blob = await makeImageFile(nm.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.jpg', 500, 360);
        await saveDoc({
          id: uid(), date: Date.now(), name: nm, cat: ct, notes: '',
          file: nm.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.jpg',
          type: 'image/jpeg', _b: blob
        }, key, true);
      }
      await load();

      openFolders = null;
      prefs.showFilter = 'all'; prefs.sortBy = 'name'; prefs.viewMode = 'list';
      view = 'docs';
      render();

      step('el riel de iconos está construido', $$('#rail .rb').length >= 5, $$('#rail .rb').length);
      step('la barra de estado muestra el cifrado', /cifrado: ACTIVADO/.test($('#status').textContent));
      step('el avatar de la cuenta está presente', !!$('#who .ava'), $('#who').textContent.trim());

      // La barra superior y el riel quedan pegados arriba al hacer scroll
      window.scrollTo(0, 500);
      await wait(150);
      step('la barra superior se queda pegada arriba',
        $('#topbar').getBoundingClientRect().top < 8,
        Math.round($('#topbar').getBoundingClientRect().top));
      step('el riel se queda pegado arriba',
        $('#rail').getBoundingClientRect().top < 8,
        Math.round($('#rail').getBoundingClientRect().top));
      window.scrollTo(0, 0);
      await wait(80);

      // Carpetas (categorías) expandibles
      const nFolders = $$('#view .fld').length;
      step('los documentos se agrupan en carpetas', nFolders >= 2, nFolders);
      step('las carpetas están expandidas por defecto',
        $$('#view .row2').length === docs.length, $$('#view .row2').length + '/' + docs.length);

      const fname = $('#view .fld').dataset.f;
      $('#view .fld').click();
      step('pulsar una carpeta la colapsa', await until(() => !isFolderOpen(fname)));
      step('sus documentos se ocultan', $$('#view .row2').length < docs.length,
        $$('#view .row2').length);
      $('#view .fld').click();
      step('volver a pulsarla la expande', await until(() => isFolderOpen(fname)));
      step('los documentos reaparecen', $$('#view .row2').length === docs.length);

      // Modos de vista
      $('[data-a="vm"][data-m="grid"]').click();
      step('modo cuadrícula', await until(() => !!$('#view .grid .card')));
      $('[data-a="vm"][data-m="rows"]').click();
      step('modo compacto', await until(() => !!$('#view .tree.compact')));
      $('[data-a="vm"][data-m="list"]').click();
      step('vuelve al modo lista',
        await until(() => !!$('#view .tree') && !$('#view .tree.compact')));

      // Orden
      $('[data-a="sortmenu"]').click();
      step('menú de orden abierto', await until(() => !!$('[data-a="setsort"]')));
      $('[data-a="setsort"][data-k="size"]').click();
      step('orden por tamaño aplicado', await until(() => prefs.sortBy === 'size'));
      const sizes = sortedDocs().map(d => d.size);
      step('la lista queda ordenada de mayor a menor',
        sizes.every((v, i) => i === 0 || sizes[i - 1] >= v), sizes);

      // Filtro
      $('[data-a="filtermenu"]').click();
      step('menú de filtro abierto', await until(() => !!$('[data-a="setfilter"]')));
      $('[data-a="setfilter"][data-k="fav"]').click();
      step('filtro de favoritos aplicado', await until(() => prefs.showFilter === 'fav'));
      step('solo se listan los favoritos',
        $$('#view .row2').length === docs.filter(d => d.fav).length, $$('#view .row2').length);
      prefs.showFilter = 'all'; prefs.sortBy = 'name'; savePrefs(); render();

      // Favoritos
      const favDoc = docs[0];
      const wasFav = !!favDoc.fav;
      toggleFavorite(favDoc.id);
      step('marcar como favorito',
        await until(() => docs.find(x => x.id === favDoc.id).fav === !wasFav));
      const fraw = await rawGet('docs', favDoc.id);
      const fmeta = JSON.parse(dec.decode(await D(key, fraw.meta)));
      step('el favorito se guarda en los metadatos cifrados', fmeta.fav === !wasFav, fmeta.fav);
      step('la estrella se pinta en la lista', await until(() => !!$('#view button.fav')));

      // Panel lateral
      await openDocDrawer(docs[0].id);
      step('el panel lateral se abre', await until(() => !!$('#drawer .drawer')));
      step('tiene dos pestañas', $$('#drawer .tab').length === 2, $$('#drawer .tab').length);
      step('la vista previa carga el documento',
        await until(() => !!$('#drawer .prev img') || !!$('#drawer .prev iframe')));
      step('el panel ofrece compartir y descargar',
        !!$('#drawer [data-a="share"]') && !!$('#drawer [data-a="dl"]') &&
        !!$('#drawer [data-a="pr"]') && !!$('#drawer [data-a="rm"]'));

      $('[data-a="dtab"][data-t="info"]').click();
      step('la pestaña Detalles muestra el formulario',
        await until(() => !!$('#dn') && !!$('#dc') && !!$('#dno') && !!$('[data-a="dsave"]')));
      const seqDrawer = loadSeq;
      $('#dn').value = 'Nombre desde el panel';
      $('[data-a="dsave"]').click();
      step('el panel guarda los cambios',
        await until(() => loadSeq > seqDrawer && docs.some(x => x.name === 'Nombre desde el panel')));
      const raw2 = await rawGet('docs', docs.find(x => x.name === 'Nombre desde el panel').id);
      step('el cambio del panel también queda cifrado', !hasText(raw2.meta, 'Nombre desde el panel'));
      closeDrawer();
      step('el panel se cierra', !$('#drawer'));

      /* ---------------- 14. Compartir ---------------- */
      // Sin Web Share API (como en Firefox/Linux de escritorio) debe abrirse el
      // diálogo con alternativas; con ella, el menú nativo con el archivo adjunto.
      const origShare = navigator.share;
      const origCanShare = navigator.canShare;
      try { delete navigator.share; delete navigator.canShare; } catch (e) { }

      const shDoc = docs[0];
      step('sin Web Share API, canShareFiles es falso',
        !canShareFiles(new File([new Blob(['x'])], 'x.txt', { type: 'text/plain' })));

      shareDoc(shDoc.id);
      step('se abre el diálogo de compartir', await until(() => !!$('[data-a="shwa"]')));
      step('avisa de que el documento sale descifrado',
        /sale descifrado/.test($('.md').innerHTML));
      step('ofrece WhatsApp', !!$('[data-a="shwa"]'));
      step('ofrece Gmail', !!$('[data-a="shgm"]'));
      step('ofrece correo, copiar y descargar',
        !!$('[data-a="shml"]') && !!$('[data-a="shcopy"]') && !!$('[data-a="shdl"]'));
      step('no ofrece el menú nativo si no existe', !$('[data-a="shnative"]'));

      // Los enlaces externos llevan el mensaje con el nombre del documento
      let opened = null;
      const origOpen = window.open;
      window.open = url => { opened = url; return { focus() { } }; };
      $('[data-a="shwa"]').click();
      step('WhatsApp abre wa.me con el mensaje',
        !!opened && opened.indexOf('https://wa.me/?text=') === 0 &&
        decodeURIComponent(opened).includes(shDoc.name), opened && opened.slice(0, 42));

      opened = null;
      window.open = url => { opened = url; return { focus() { } }; };
      $('[data-a="shgm"]').click();
      step('Gmail abre el redactor con asunto y cuerpo',
        !!opened && opened.indexOf('https://mail.google.com/mail/') === 0 &&
        decodeURIComponent(opened).includes(shDoc.name));
      window.open = origOpen;

      // Con Web Share API se usa el menú nativo, con el archivo adjunto
      let shared = null;
      navigator.canShare = () => true;
      navigator.share = async data => { shared = data; };
      closeModal();
      await shareDoc(shDoc.id);
      step('con Web Share API se usa el menú nativo', !!shared && shared.files.length === 1,
        shared && shared.files.length);
      step('se comparte el archivo real con su nombre',
        !!shared && shared.files[0].name === (shDoc.file || shDoc.name),
        shared && shared.files[0].name);
      step('lo que se comparte es un File', !!shared && shared.files[0] instanceof File);
      step('el mensaje incluye el nombre del documento',
        !!shared && String(shared.text).includes(shDoc.name));
      step('no se abrió el diálogo alternativo', !$('[data-a="shwa"]'));

      // Selector de documentos del riel
      sharePicker();
      step('el selector de compartir se abre',
        await until(() => !!$('.md') && /Compartir un documento/.test($('.md').innerHTML)));
      step('el selector lista los documentos',
        $$('.md .row2').length === docs.length, $$('.md .row2').length);
      closeModal();

      try {
        if (origShare) navigator.share = origShare;
        if (origCanShare) navigator.canShare = origCanShare;
      } catch (e) { }

      /* -------- 14b. Quinquenios y Adelantos · hojas del Excel (MACRO/H1/H3) --- */
      // Base de prueba en memoria (no depende de la red ni de la base incluida).
      qxData = {
        v: 1, origen: 'test', gen: '', empleados: [
          Object.assign(qxEmptyEmpleado('ANA PRUEBA UNO'), {
            fechaIngreso: '2015-03-01', cargo: 'ANALISTA', direccion: 'CALLE 1',
            codUbicacion: 'SUSCZ', departamento: 'DPADBOD', numPersona: 'B001', sueldoBruto: '5000'
          }),
          qxEmptyEmpleado('BETO PRUEBA DOS')
        ]
      };
      qxData.empleados[0].quinquenios[0].estado = 'CUMPLE';
      qxData.empleados[0].quinquenios[0].visado = 'Sí';
      qxLoaded = true;
      qxSheet = 'macro';
      qxPage = 0; qxFilter = ''; qxPageSize = 50;

      view = 'qx'; render();
      step('la vista Quin/Adel muestra las 4 pestañas',
        await until(() => $$('.qxtab').length === 4 && /MACRO/.test($('#view').innerHTML) &&
          /Panel RRHH/.test($('#view').innerHTML) &&
          /Hoja 1/.test($('#view').innerHTML) && /Hoja 3/.test($('#view').innerHTML)));
      step('el aviso de pendientes se pinta en el menú',
        await until(() => !!$('[data-v="qx"] .qxnb')));

      /* Panel de RRHH: vencimientos, pendientes y datos a revisar */
      $('[data-a="qxsheet"][data-s="venc"]').click();
      step('el Panel RRHH muestra sus 3 secciones',
        await until(() => /Próximos vencimientos/.test($('#view').innerHTML) &&
          /Pendientes de gestionar/.test($('#view').innerHTML) &&
          /Datos a revisar/.test($('#view').innerHTML)));
      step('el Panel RRHH lista al empleado con quinquenio vencido',
        /ANA PRUEBA UNO/.test($('#view').innerHTML));
      step('el Panel RRHH avisa del empleado sin fecha de ingreso',
        /Sin fecha de ingreso/.test($('#view').innerHTML));

      /* Gestión del trámite (Bloque A): estado, fecha, responsable y nota */
      step('el Panel RRHH ofrece botones «Gestionar»',
        $$('[data-a="qxgestion"]').length > 0, $$('[data-a="qxgestion"]').length);
      const gbtn = $('[data-a="qxgestion"]');
      const gid = gbtn.dataset.id, gi = +gbtn.dataset.i;
      gbtn.click();
      step('el diálogo de gestión pide los 4 datos',
        await until(() => !!$('#qxg-gestion') && !!$('#qxg-fecha') && !!$('#qxg-resp') &&
          !!$('#qxg-nota') && !!$('#qxg-cumple')));
      step('el diálogo ofrece el flujo Pendiente → Pagado',
        /Pendiente/.test($('.md').innerHTML) && /En proceso/.test($('.md').innerHTML) &&
        /Aprobado/.test($('.md').innerHTML) && /Pagado/.test($('.md').innerHTML) &&
        /Rechazado/.test($('.md').innerHTML));
      $('#qxg-gestion').value = 'Pagado';
      $('#qxg-resp').value = '  RRHH  ';
      $('#qxg-cumple').checked = true;
      $('[data-a="qxgsave"]').click();
      step('guardar el trámite marca CUMPLE, recorta y persiste',
        await until(() => {
          const emp = qxData.empleados.find(e => e.id === gid);
          return !$('.md') && emp && emp.quinquenios[gi].gestion === 'Pagado' &&
            emp.quinquenios[gi].responsable === 'RRHH' && emp.quinquenios[gi].estado === 'CUMPLE';
        }));
      step('el aviso del menú aparece en el botón Quin/Adel',
        await until(() => !!$('[data-v="qx"] .qxnb')));
      step('el aviso del menú aparece en el botón Quin/Adel',
        await until(() => !!$('[data-v="qx"] .qxnb')));
      step('y desaparece al no quedar pendientes',
        await until(() => !$('[data-v="qx"] .qxnb')));

      /* Bloque B: calendario de vencimientos de los próximos 12 meses */
      step('el Panel RRHH pinta el calendario de 12 meses',
        /Calendario de los próximos 12 meses/.test($('#view').innerHTML));
      step('el calendario lista los 12 meses',
        (($('#view').innerHTML.match(/<td><b>[A-Z][a-z]+ \d{4}<\/b><\/td>/g) || []).length) === 12,
        (($('#view').innerHTML.match(/<td><b>[A-Z][a-z]+ \d{4}<\/b><\/td>/g) || []).length));
      step('hay botón para exportar el calendario', !!$('[data-a="qxcalxlsx"]'));

      $('[data-a="qxsheet"][data-s="hoja1"]').click();
      step('la Hoja 1 pinta la tabla editable',
        await until(() => !!$('.qxgrid table.qxs') && $$('.qxs tbody tr').length === 2));
      step('la Hoja 1 tiene 25 columnas de datos (+2 de control)',
        $$('.qxs thead th').length === 27, $$('.qxs thead th').length);
      step('los encabezados son los del Excel',
        /NOMBRE COMPLETO/.test($('.qxs thead').innerHTML) && /1ER QUINQUENIO/.test($('.qxs thead').innerHTML) &&
        /TERCER ADELANTO/.test($('.qxs thead').innerHTML));
      step('la celda del nombre es editable',
        ($('.qxs tbody tr .qxname input') || {}).value === 'ANA PRUEBA UNO');
      step('la antigüedad se calcula al vuelo',
        /años/.test(($('.qxs tbody tr [data-ant]') || {}).textContent || ''));

      const cargoInput = $$('.qxs tbody tr')[0].querySelector('[data-qx="cargo"]');
      cargoInput.value = 'JEFA DE BODEGA';
      cargoInput.dispatchEvent(new Event('change', { bubbles: true }));
      step('editar una celda actualiza el modelo',
        qxData.empleados.find(e => e.nombre === 'ANA PRUEBA UNO').cargo === 'JEFA DE BODEGA');

      /* Bloque C: filtros, orden por columnas y vista móvil en tarjetas */
      step('los encabezados de la Hoja 1 son ordenables', !!$('.qxs thead [data-a="qxsort"]'));
      step('hay filtros de departamento, quinquenio y trámite',
        !!$('#qxfdepto') && !!$('#qxfquin') && !!$('#qxfgest'));
      step('las celdas llevan etiqueta para la vista móvil', !!$('.qxs tbody td[data-h]'));

      $('.qxs thead [data-a="qxsort"][data-k="0"]').click();
      step('ordenar por nombre deja el encabezado marcado con flecha',
        await until(() => {
          const th = $('.qxs thead .qxsorth.on');
          return !!th && th.textContent.indexOf('▲') >= 0;
        }));
      QX_ACTIONS.qxfiltros();
      step('limpiar filtros quita el orden',
        await until(() => !$('.qxs thead .qxsorth.on')));

      const dsel = $('#qxfdepto');
      dsel.value = 'DPADBOD';
      dsel.dispatchEvent(new Event('change', { bubbles: true }));
      step('filtrar por departamento deja solo esa área',
        await until(() => $$('.qxs tbody tr').length === 1), $$('.qxs tbody tr').length);
      step('y aparece el botón para limpiar los filtros', !!$('[data-a="qxfiltros"]'));
      QX_ACTIONS.qxfiltros();
      step('limpiar filtros devuelve todas las filas',
        await until(() => $$('.qxs tbody tr').length === 2), $$('.qxs tbody tr').length);

      /* Bloque B: la ficha con la gestión del trámite y la constancia */
      $('.qxs tbody tr .qxopen').click();
      step('la ficha incluye la gestión del trámite',
        await until(() => /Gestión del trámite/.test($('#view').innerHTML) && !!$('[data-qx="quin-gestion"]')));
      step('la ficha ofrece emitir la constancia', !!$('[data-a="qxconst"]'));
      $('[data-a="qxconst"]').click();
      step('el diálogo de constancia pide los datos de la empresa',
        await until(() => !!$('#qxc-emp') && !!$('#qxc-rif') && !!$('#qxc-ciudad') &&
          !!$('#qxc-cargo') && !!$('#qxc-firma')));
      closeModal();

      $('[data-a="qxsheet"][data-s="hoja3"]').click();
      step('la Hoja 3 pinta sus columnas de RRHH',
        await until(() => /Address Line 1/.test($('#view').innerHTML) && /Sueldo Bruto/.test($('#view').innerHTML)));
      step('la Hoja 3 muestra los datos importados',
        /CALLE 1/.test($('#view').innerHTML) && /DPADBOD/.test($('#view').innerHTML));

      qxAddWorkerDialog();
      step('se abre el diálogo de añadir trabajador', await until(() => !!$('#qxnew-nombre')));
      $('#qxnew-nombre').value = 'CARLA NUEVA TRABAJADORA';
      $('#qxnew-cargo').value = 'OPERARIA';
      $('[data-a="qxaddconfirm"]').click();
      step('el trabajador se añade a la base',
        await until(() => qxData.empleados.some(e => e.nombre === 'CARLA NUEVA TRABAJADORA')));
      step('y aparece en la hoja de cálculo',
        await until(() => /CARLA NUEVA TRABAJADORA/.test($('#view').innerHTML)));

      const carla = qxData.empleados.find(e => e.nombre === 'CARLA NUEVA TRABAJADORA');
      const delBtn = $('[data-a="qxdelrow"][data-id="' + carla.id + '"]');
      step('cada fila ofrece eliminar el trabajador', !!delBtn);
      delBtn.click();
      step('se pide confirmación para eliminar', await until(() => !!$('#cfok')));
      $('#cfok').click();
      step('el trabajador se elimina',
        await until(() => !qxData.empleados.some(e => e.nombre === 'CARLA NUEVA TRABAJADORA')));

      if (window.XLSX) {
        let xlsxSheets = null, xlsxName = '';
        const origWrite = XLSX.writeFile;
        XLSX.writeFile = (wb, name) => { xlsxSheets = wb.SheetNames.slice(); xlsxName = name; };
        qxExportXlsx();
        XLSX.writeFile = origWrite;
        step('exporta un .xlsx con las 3 hojas',
          !!xlsxSheets && xlsxSheets.join(',') === 'MACRO,Hoja1,Hoja3', xlsxSheets);
        step('el archivo exportado conserva el nombre original',
          xlsxName === 'MACRO_QUINQUENIOS.xlsx', xlsxName);
      } else {
        step('exportar .xlsx (SheetJS no disponible sin red)', true);
      }

      view = 'docs'; render();

      /* ---------------- 15. Entrar con Google sin contraseña ---------------- */
      driveClientId = 'cliente-de-prueba';
      prefs.driveEmail = 'prueba@ejemplo.com';
      prefs.driveConnected = true;
      prefs.rememberDevice = true;
      savePrefs();

      await saveDeviceKey(key, 'prueba@ejemplo.com');
      const dk = await getDeviceKeyRec();
      step('la llave del dispositivo se guarda', !!dk && !!dk.key);
      step('la llave queda atada a la cuenta de Google', !!dk && dk.email === 'prueba@ejemplo.com');
      step('la llave guardada NO es extraíble', !!dk && dk.key.extractable === false);

      // Con file:// Google no puede autenticar, así que esa vía se desactiva.
      if (location.protocol !== 'file:') {
        lockNow();
        step('el bloqueo ofrece entrar con Google',
          await until(() => !$('#lgbtn').hidden && /Google/.test($('#lgbtn').textContent)));
        step('en ese modo no se pide la contraseña', $('#lp').hidden === true);
        step('el botón de contraseña está oculto', $('#lb').hidden === true);
        step('se ofrece «usar la contraseña»', !$('#lshowpw').hidden);

        driveAuth.token = async () => 'token-de-prueba';
        driveAuth.email = async () => 'prueba@ejemplo.com';
        driveAuth.connect = async () => 'token-de-prueba';
        await googleUnlock();
        step('entra con Google SIN contraseña', await until(() => window.Boveda.state.unlocked));
        step('y los documentos están disponibles', docs.length > 0, docs.length);

        // Con OTRA cuenta de Google debe negarse
        lockNow();
        await until(() => !$('#lgbtn').hidden);
        driveAuth.email = async () => 'otra-cuenta@ejemplo.com';
        await googleUnlock();
        step('rechaza una cuenta de Google distinta',
          /no es la de esta bóveda/.test($('#le').textContent), $('#le').textContent.trim());
        step('y sigue bloqueado', !window.Boveda.state.unlocked);

        // Vuelta a la contraseña desde el enlace del bloqueo
        $('#lshowpw').click();
        step('«usar la contraseña» muestra el formulario',
          await until(() => !$('#lp').hidden && !$('#lb').hidden));
        $('#lp').value = 'clave123';
        $('#lb').click();
        step('entra con la contraseña', await until(() => window.Boveda.state.unlocked));

        view = 'set'; render();
        step('Ajustes muestra la llave guardada',
          await until(() => /Guardada/.test($('#stdevkey').textContent)),
          $('#stdevkey').textContent.trim());
      } else {
        step('entrar con Google: cubierto por la ejecución por HTTP', true);
      }

      // Olvidar el dispositivo (independiente del protocolo)
      await forgetDevice();
      step('olvidar el dispositivo borra la llave', !(await getDeviceKeyRec()));
      lockNow();
      // Ojo: paintLock() pinta el formulario al instante, pero showLock() lo
      // termina de configurar después. Esperamos a que ponga el botón «Entrar».
      step('al bloquear vuelve a pedir la contraseña',
        await until(() => $('#lb').textContent === 'Entrar' && !$('#lb').hidden &&
          !$('#lp').hidden && $('#lgbtn').hidden));
      $('#lp').value = 'clave123';
      $('#lb').click();
      step('se puede seguir entrando con la contraseña',
        await until(() => window.Boveda.state.unlocked));

      /* ---------------- 16. Cabeceras de seguridad ---------------- */
      const cspErrs = (window.__errs || []).filter(e => e.type === 'csp');
      step('ninguna violación de CSP', cspErrs.length === 0, cspErrs);

    } catch (e) {
      step('excepción no controlada: ' + e.message, false, String(e.stack || ''));
    }
    await report();
  };

  /* Espera a que la app esté lista y lanza la prueba. */
  (async function boot() {
    const t0 = Date.now();
    while (!window.Boveda && Date.now() - t0 < 20000) await wait(50);
    await window.__runBovedaTests();
  })();
})();
