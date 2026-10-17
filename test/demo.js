/* ==========================================================================
 * Bóveda · test/demo.js
 * Siembra una bóveda de ejemplo y la deja desbloqueada.
 * Se usa solo para hacer capturas de pantalla (/__demo en tools/serve.py).
 * ========================================================================== */
(function () {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);

  async function until(fn, ms = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { if (fn()) return true; } catch (e) { }
      await wait(50);
    }
    return false;
  }

  /** Genera una imagen JPEG sintética con un rótulo. */
  function imgBlob(label, color) {
    const c = document.createElement('canvas');
    c.width = 820;
    c.height = 580;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, c.width, c.height);
    g.addColorStop(0, color);
    g.addColorStop(1, '#101828');
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = 'rgba(255,255,255,.92)';
    x.font = 'bold 44px sans-serif';
    const words = label.split(' ');
    let line = '', y = 250;
    for (const w of words) {
      if ((line + ' ' + w).trim().length > 18) {
        x.fillText(line.trim(), 48, y); y += 58; line = w;
      } else line = (line + ' ' + w).trim();
    }
    if (line) x.fillText(line, 48, y);
    return new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
  }

  const SEED = [
    ['Resumen financiero 2022', 'Documentos financieros', 'Cierre anual del ejercicio', '#3b6cf6', true],
    ['Resumen financiero 2023', 'Documentos financieros', '', '#e5337f', false],
    ['Ingresos del primer trimestre', 'Documentos financieros', '', '#12a06a', false],
    ['Contrato de alquiler', 'Banca', 'Vence en junio', '#f59f00', true],
    ['Póliza del seguro del hogar', 'Banca', '', '#8b5cf6', false],
    ['Receta médica', 'Salud', '', '#0ea5e9', false],
    ['Título universitario', 'Estudios', '', '#d92d20', false]
  ];

  (async function run() {
    await until(() => window.Boveda);

    $('#lp').value = 'demo1234';
    $('#lp2').value = 'demo1234';
    $('#lb').click();
    await until(() => window.Boveda.state.unlocked);

    let t = Date.now();
    for (const [name, cat, notes, color, fav] of SEED) {
      const blob = await imgBlob(name, color);
      await saveDoc({
        id: uid(), date: t -= 86400000 * 9,
        name, cat, notes,
        file: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.jpg',
        type: 'image/jpeg', fav, _b: blob
      }, key, true);
    }
    await saveInfo({ id: uid(), ord: 1, label: 'Nº de pasaporte', value: 'X1234567' });
    await saveInfo({ id: uid(), ord: 2, label: 'Cuenta bancaria', value: 'ES12 3456 7890 1234' });
    await load();

    document.querySelectorAll('.ov').forEach(o => o.remove());

    // ?panel=1 abre el panel lateral (para la captura de pantalla).
    if (location.search.indexOf('panel') !== -1 && docs.length) {
      await openDocDrawer(docs[0].id, 'info');
    }

    // ?set=1 abre la vista de Ajustes (para la captura de pantalla).
    if (location.search.indexOf('set') !== -1) {
      view = 'set';
      render();
    }

    // ?lock=google simula un dispositivo ya configurado y vuelve al bloqueo,
    // para ver cómo queda la pantalla de "Iniciar sesión con Google".
    if (location.search.indexOf('lock=google') !== -1) {
      try {
        localStorage.setItem(DRIVE_ID_KEY, '123456789012-demo.apps.googleusercontent.com');
      } catch (e) { }
      prefs.driveConnected = true;
      prefs.driveEmail = 'tu-correo@gmail.com';
      prefs.rememberDevice = true;
      savePrefs();
      await saveDeviceKey(key, 'tu-correo@gmail.com');
      lockNow();
    }
  })();
})();
