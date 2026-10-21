# 🔐 Bóveda · Gestor de documentos y datos cifrados

Aplicación web **100 % local**: tus documentos y datos se cifran con AES‑GCM 256 en
tu propio dispositivo. No hay servidor, no hay cuentas, no hay telemetría.

Se puede usar en **computadora y celular** (mismo código, diseño adaptativo) y
**instalar como app** en el móvil.

---

## Cómo ejecutarlo

### Opción A · Doble clic (la más simple)

Abre `index.html` directamente en el navegador. Funciona porque todos los scripts
son **scripts clásicos** (no módulos ES), así que no hay restricciones de CORS con
`file://`.

> `crypto.subtle` necesita un *contexto seguro*. `file://` lo es tanto en Chrome
> como en Firefox, y en ambos **IndexedDB funciona**, así que tus datos persisten
> igual que con un servidor. Verificado con `python3 tools/filetest.py`.

### Opción B · Servidor local (recomendado para desarrollo)

```bash
python3 tools/serve.py          # http://127.0.0.1:5173
```

Sirve el proyecto **con las mismas cabeceras de seguridad que producción**, para
que lo que pruebas sea lo que se publica.

### Opción C · Probarlo en el celular 📱

**Ojo con esto, es el error número uno al probar desde el móvil:** si abres la app
como `http://192.168.1.x:5500` (Live Server, por ejemplo), los navegadores la
tratan como *origen no seguro* y **desactivan `crypto.subtle`**. La app no podrá
cifrar y te avisará. **No es un fallo de la app: es una regla de los navegadores.**

La solución más sencilla, sin instalar nada:

```bash
python3 tools/serve.py --https --lan
```

Eso hace tres cosas:

1. Escucha en toda la red local (`0.0.0.0`).
2. Genera un **certificado autofirmado** válido para tu IP (con `openssl`).
3. Te imprime la URL del móvil **y un código QR** para escanearlo.

```
  En esta computadora:  https://localhost:5173
  En el celular:        https://192.168.0.138:5173

  Escanea este código con el celular:
  █▀▀▀▀▀▀▀█▀█▀▀▀██▀▀█▀▀▀▀▀▀▀█
  █ █▀▀▀█ ██▄▀▀▄▀▀▀██ █▀▀▀█ █
  ...
```

El móvil tiene que estar **en el mismo WiFi**. La primera vez avisará del
certificado (es propio y de pruebas): *Avanzado* → *Continuar*. Solo pasa una vez.

| Alternativa | Cómo |
|---|---|
| **Túnel HTTPS** | `cloudflared tunnel --url http://localhost:5173` o `ngrok http 5173` → URL `https://…` pública que apunta a tu PC |
| **Chrome en Android** | `chrome://flags/#unsafely-treat-insecure-origin-as-secure` → añade `http://192.168.1.x:5500` → reinicia. **En iPhone no existe.** |
| **Live Server con HTTPS** | En VS Code: `liveServer.settings.https` en `settings.json` |
| **Publicarla** ⭐ | `tools/build.py` + Netlify (siguiente sección): la forma real y definitiva |

---

## 🌍 Publicar en internet (Netlify)

El objetivo: una URL `https://…` que abres en la computadora y en el celular.
Cada persona que entre tendrá **su propia bóveda**, aislada y cifrada con su
contraseña.

### 1. Construir la carpeta de publicación

```bash
python3 tools/build.py
```

Esto genera `dist/` con **solo lo necesario** (`test/` y `tools/` quedan fuera),
escribe `dist/_headers` con las cabeceras de seguridad y sella el service worker
con un hash del contenido.

### 2. Subirlo

1. Entra en **`https://app.netlify.com/drop`**
2. Arrastra la carpeta **`dist`** a la página
3. En segundos te da una URL tipo `https://algo-random.netlify.app`
4. Opcional: *Site configuration → Change site name* para ponerle
   `https://mi-boveda.netlify.app`

No hace falta cuenta para probarlo, ni tarjeta de crédito, ni servidor.

### 2 bis. Despliegue automático desde GitHub (recomendado) ⭐

Arrastrar la carpeta a mano funciona, pero hay que repetirlo en cada cambio. Para
que **cada `push` a `main` actualice la web solo**, conecta el repositorio:

1. Entra en **`https://app.netlify.com/start`** → *Import an existing project*
   → **GitHub** → elige tu repositorio.
2. Netlify lee el archivo **`netlify.toml`** que ya viene en el proyecto, así que
   no hay que configurar nada a mano:
   - **Build command**: `python3 tools/build.py`
   - **Publish directory**: `dist`
3. Pulsa **Deploy site**.

A partir de ahí el flujo es simplemente:

```bash
# haces tus cambios…
git add -A && git commit -m "mis cambios"
git push origin main        # → Netlify reconstruye y publica solo
```

> **Sin `netlify.toml`** Netlify intentaría `npm run build` (que en este proyecto
> no existe) y el despliegue fallaría. Ese archivo es justo lo que engancha el
> build correcto con la carpeta correcta. Si ya desplegaste arrastrando `dist/`
> (un *deploy manual*), vincular el repo con estos pasos lo convierte en
> automático.

**Actualizar el código NO borra los datos de los usuarios.** Los documentos viven
cifrados en el `IndexedDB` de cada navegador; el despliegue solo reemplaza el
«cascarón» de la app. Al abrirla de nuevo, cada usuario ve sus propios datos.

### 3. Comprobar que quedó bien

```bash
python3 tools/check_headers.py https://tu-sitio.netlify.app/index.html
```

Debe responder `[PASS] 6 cabeceras de seguridad presentes y correctas`.

### Requisitos y avisos

- **HTTPS es obligatorio**: sin él `crypto.subtle` no existe y la app avisa.
  Netlify, Vercel, Cloudflare Pages y GitHub Pages lo dan gratis.
- **GitHub Pages no soporta `_headers`**: la app funciona igual, pero sin CSP.
- **No subas la carpeta del proyecto entera**: sube `dist/`, o `test/` y `tools/`
  quedarán publicados (no son peligrosos, pero no pintan nada ahí).
- **Cada usuario tiene su bóveda**. La app no tiene cuentas: la "cuenta" es la
  contraseña maestra, que nunca sale del dispositivo.

---

## Estructura del proyecto

```
Bóveda/
├── index.html              # Esqueleto HTML: bloqueo, shell de la app y entradas de archivo
├── manifest.json           # Manifiesto PWA (nombre, iconos, pantalla completa)
├── sw.js                   # Service worker: app instalable y uso sin conexión
├── netlify.toml            # Despliegue automático en Netlify (build + publish)
├── css/
│   └── styles.css          # Todos los estilos (tema claro/oscuro automático)
├── icons/                  # Iconos PNG generados (192, 512, maskable, apple-touch, favicon)
├── js/
│   ├── config.js           # Constantes y rutas SVG de los iconos
│   ├── utils.js            # DOM, formato, base64, avisos, descargas
│   ├── crypto.js           # PBKDF2-SHA256 + AES-GCM 256 (derive / E / D)
│   ├── state.js            # Estado de la sesión (db, key, docs, info, prefs…)
│   ├── store.js            # IndexedDB: leer/escribir cifrado, cargar, migrar, borrar
│   ├── auth.js             # Bloqueo, contraseña maestra, llave del dispositivo, autobloqueo
│   ├── ui.js               # Shell de la interfaz, enrutado de vistas y modales
│   ├── documents.js        # Alta, edición, visor, descarga, impresión y borrado
│   ├── scanner.js          # Escáner multipágina + recorte en perspectiva + PDF
│   ├── info.js             # Vista "Mis datos" (etiqueta/valor cifrados)
│   ├── settings.js         # Tema, cambio de contraseña, respaldos, protección de datos
│   ├── views.js            # Lista tipo Keeper: carpetas, modos de vista, favoritos, panel
│   ├── share.js            # Compartir por WhatsApp / Gmail / correo / menú del sistema
│   ├── gdrive-config.js    # ⚙️ AQUÍ pegas tu ID de cliente de Google
│   ├── gdrive.js           # Login con Google, API de Drive y motor de sincronización
│   ├── app.js              # Acciones, delegación de eventos, PWA y arranque
│   └── excel-quinquenios.js # Quin/Adel: base cifrada, hojas del Excel, ficha y PDF
├── vendor/
│   ├── jspdf.umd.min.js    # jsPDF 2.5.1 local (la app funciona sin conexión)
│   └── xlsx.full.min.js    # SheetJS 0.20.3 local (leer y escribir Excel sin CDN)
├── data/
│   └── base-quinquenios.json # Base incluida (338 registros de las hojas Hoja 1 y Hoja 3)
├── test/
│   └── runner.js           # Prueba E2E (se inyecta solo en modo /__test)
├── tools/
│   ├── build.py            # Genera dist/ listo para publicar
│   ├── serve.py            # Servidor estático + rutas /__test y /__report
│   ├── smoke.sh            # Prueba E2E en Firefox headless (http://)
│   ├── filetest.py         # Prueba E2E abriendo file:// directamente
│   ├── check_headers.py    # Verifica las cabeceras de seguridad de un sitio
│   ├── security_headers.py # Fuente única de las cabeceras (CSP, etc.)
│   └── make_icons.py       # Regenera los iconos PNG
└── dist/                   # (generado) Carpeta que se publica
```

### Orden de carga

Los scripts comparten el entorno léxico global, así que **el orden importa**:

```
config → utils → crypto → state → store → auth → ui → views → documents → scanner → info → settings → share → gdrive-config → gdrive → app
```

`app.js` es el único que arranca la aplicación (IIFE `init()`), y `auth.js` /
`scanner.js` / `gdrive.js` registran sus propios *listeners* o exponen funciones
que se llaman después.

---

# 🖥️ Interfaz (estilo Keeper)

La pantalla principal está inspirada en **Keeper Security**:

- **Riel de iconos** oscuro a la izquierda (agregar, bóveda, datos, escanear,
  compartir, ayuda, ajustes, bloquear).
- **Barra superior** con el logotipo, buscador, filtro y el avatar de la cuenta.
- **Carpetas expandibles**: los documentos se agrupan por categoría; pulsas una
  carpeta y se abre o se cierra.
- **Tres modos de vista**: lista, cuadrícula y compacta (botones a la derecha).
- **Ordenar** por nombre, fecha o tamaño, y **Mostrar** todos / solo favoritos /
  solo imágenes / solo PDF.
- **Favoritos** con la estrella ★ (se guardan cifrados junto al documento).
- **Panel lateral** al pulsar un documento: vista previa, pestaña *Detalles*
  editable, y abajo Compartir · Descargar · Imprimir · Favorito · Eliminar.
- **Barra de estado** inferior: *cifrado: ACTIVADO*, Sincronizar, Ayuda y
  Política de privacidad.

En el celular el riel y la barra de estado se ocultan y aparece la navegación
inferior, manteniendo el mismo aspecto de lista.

---

# 📤 Compartir documentos

Hay un botón **Compartir** en cada fila, en el panel lateral y en el riel.

**En el celular** se abre el **menú nativo del sistema** con el archivo ya
**adjunto**: eliges WhatsApp, Gmail, Telegram, Drive… y listo.

**En la computadora** los navegadores **no permiten** que una web adjunte
archivos a WhatsApp o Gmail (es una protección de seguridad, no un fallo de la
app). Ahí se abre un diálogo con:

| Opción | Qué hace |
|---|---|
| WhatsApp | Abre `wa.me` con el mensaje ya escrito (adjunta tú el archivo) |
| Gmail | Abre el redactor con asunto y cuerpo |
| Otro correo | Abre tu cliente con `mailto:` |
| Copiar el mensaje | Copia el texto al portapapeles |
| Descargar el archivo | Descarga el documento para adjuntarlo con el clip 📎 |

> ⚠️ **Al compartir, el documento sale descifrado** de la bóveda. A partir de ahí
> ya no está protegido por tu contraseña. La app te lo avisa **cada vez**.

---

# ☁️ Sincronización con Google Drive

Objetivo: abrir la app en la computadora **y** en el celular y ver **los mismos
documentos**, sin depender de un servidor propio.

**Cómo se protege:** a Drive se sube el respaldo **ya cifrado**
(`boveda-respaldo.json`). Google solo ve un archivo ilegible. La llave sigue siendo
tu contraseña maestra, que **nunca sale del dispositivo**. El permiso que se pide
es `drive.file`: la app **solo ve los archivos que ella misma crea**, no el resto
de tu Drive.

## Paso A · Crear tu ID de cliente de Google (una sola vez, ~10 min)

Es **tu** cuenta, así que este paso lo tienes que hacer tú. Yo no puedo hacerlo
por ti.

1. Entra en **https://console.cloud.google.com/** con tu cuenta de Google.
2. Arriba, en el selector de proyectos → **Proyecto nuevo** → nombre `Boveda` →
   *Crear*. Asegúrate de que queda seleccionado.
3. Habilita la API de Drive:
   **https://console.cloud.google.com/apis/library/drive.googleapis.com** →
   **Habilitar**.
4. Configura la pantalla de consentimiento:
   **https://console.cloud.google.com/apis/credentials/consent**
   - Tipo de usuario: **Externo** → *Crear*.
   - Nombre de la app: `Bóveda`; correo de asistencia y de contacto: el tuyo.
   - *Guardar y continuar* (los apartados de permisos y de prueba se pueden
     dejar como están).
   - En **Usuarios de prueba** → *Añadir usuarios* → **tu propio correo**.
     (Mientras la app esté en estado «Prueba», solo esos correos pueden entrar.
     Para uso personal es justo lo que quieres.)
5. Crea la credencial:
   **https://console.cloud.google.com/apis/credentials** →
   *Crear credenciales* → **ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - Nombre: `Bóveda web`.
   - **Orígenes de JavaScript autorizados** → añade:
     - `https://TU-SITIO.netlify.app`  ← la URL de tu app
     - `http://localhost:5173`  ← opcional, para probar en tu PC
   - *Crear* → **copia el ID de cliente** (termina en
     `.apps.googleusercontent.com`).

## Paso B · Pegarlo en la app

Tienes **dos formas**:

### B.1 · Desde la propia app (la más rápida)

Abre la bóveda → **Ajustes → Sincronización con Google Drive** → pega el ID en el
campo → **Guardar ID**. Aparecerá el botón **Conectar con Google Drive**.

> Se guarda solo en **ese** dispositivo. En el celular tendrás que pegarlo otra vez.

### B.2 · En el archivo (queda en todos tus dispositivos)

Abre `js/gdrive-config.js` y pega el ID:

```js
let driveClientId = '123456789012-xxxxxxxxxxxxxxxx.apps.googleusercontent.com';
```

Vuelve a construir y a publicar:

```bash
python3 tools/build.py     # y arrastra dist/ a Netlify otra vez
```

Así el botón de conectar aparece ya puesto en la computadora **y** en el celular.

## Paso C · Conectar

1. Abre la app → desbloquea → **Ajustes → Sincronización con Google Drive**.
2. Pulsa **Conectar con Google Drive** → elige tu cuenta → *Permitir*.
3. La primera vez sube tu bóveda a tu Drive.
4. En el celular: abre la misma URL → *Añadir a pantalla de inicio* → conéctate
   con **la misma cuenta** → la app trae la copia y te pide **tu contraseña
   maestra** (la de esa bóveda). Ya está todo ahí.

A partir de ahí se sincroniza sola: al desbloquear, y unos segundos después de
cada cambio.

## Qué hace cuando hay cambios

| Situación | Qué hace |
|---|---|
| No hay copia en Drive | Sube |
| Nada cambió en ningún lado | No hace nada |
| Solo cambió este dispositivo | Sube |
| Solo cambió el otro dispositivo | Baja |
| Cambiaron los dos | **Pregunta** cuál conservar |
| La bóveda local está vacía | Adopta la copia de Drive |

## Detalles que conviene saber

- **Cada cuenta de Google = una bóveda distinta.** Si tu pareja entra con su
  correo, ve la suya, vacía. No se mezclan.
- **Cambiar la contraseña** en un dispositivo hace que el otro necesite la
  contraseña **nueva** para poder abrir la copia.
- **`file://` no sirve para esto**: Google exige `https://` o `http://localhost`.
  En Ajustes se explica si abres la app desde el disco.
- **Tokens de Google**: caducan cada hora y la app los renueva sola. Si algún día
  pide volver a autorizar, aparece un aviso en Ajustes.
- **Si borras la app de Drive**, no pasa nada: la app vuelve a subir la copia.
- **También funciona con cualquier cuenta de Google** (no hace falta Gmail).

---

## 🔑 Entrar sin contraseña (con Google)

El objetivo es **abrir la app y estar dentro**, sin escribir nada.

### Cómo se consigue

| Pieza | Papel |
|---|---|
| **Google** | La **identidad**: dice quién eres |
| **Contraseña maestra** | La **llave** que cifra |
| **Llave del dispositivo** | Se guarda en el navegador para no volver a pedir la contraseña |

La clave se guarda como objeto **`CryptoKey` no extraíble**: el código puede
**usarla** para descifrar, pero **no puede leer sus bytes**. Y **nunca se sube a
Drive**, así que Google sigue sin poder leer nada.

### Cómo se usa

**Primera vez en un dispositivo**
```
Abres la app → "Iniciar sesión con Google" → eliges tu cuenta
             → escribes la contraseña  ← ÚNICA VEZ
             → dentro ✅
```

**A partir de ahí, en ese dispositivo**
```
Abres la app → pulsas "Iniciar sesión con Google" → dentro ✅
```

**Dispositivo nuevo (segunda laptop, celular)**
```
Abres la app → "Traer mi bóveda de Google Drive" → eliges tu cuenta
             → aparecen tus documentos → escribes la contraseña  ← ÚNICA VEZ
             → dentro ✅
```

En la práctica escribes la contraseña **una vez por dispositivo y nunca más**.

### Qué protege y qué no

| Situación | ¿A salvo? |
|---|---|
| Te roban el equipo apagado y sin tu sesión de Google | 🟢 Sí |
| Alguien entra a tu Gmail | 🟢 Sí: la llave no está en Drive |
| Google quiere leer tus documentos | 🟢 No puede |
| Usan tu navegador con **otra** cuenta de Google | 🟢 Se rechaza |
| Te roban el equipo **encendido y desbloqueado** | 🔴 No (la llave está ahí) |

### Controlarlo en Ajustes

*Ajustes → Seguridad*:

- **"Entrar con Google sin escribir la contraseña en este dispositivo"** —
  actívalo o desactívalo cuando quieras.
- **"Olvidar este dispositivo"** — borra la llave; volverá a pedir la contraseña.
- **"Llave en este dispositivo: Guardada ✅ · tu@correo.com"** — estado actual.

> **Sin Google configurado no se guarda ninguna llave**: si no, cualquiera que
> abriera el navegador entraría sin más. La llave siempre va atada a una cuenta.

---

## Cómo funciona la seguridad

| Elemento | Detalle |
|---|---|
| Derivación de clave | PBKDF2-SHA256, 250 000 iteraciones, salt aleatorio de 16 bytes |
| Cifrado | AES-GCM 256; el IV (12 B) se antepone y la etiqueta GCM (16 B) va al final |
| Verificación | Se cifra la cadena `ok` con la clave; si el descifrado falla, la contraseña es incorrecta |
| Almacenamiento | IndexedDB `boveda2`, almacenes `docs`, `info`, `meta` |
| Metadatos | El nombre, la categoría y las notas también van cifrados |
| Anti fuerza bruta | Retardo progresivo (1 s…5 s) tras cada intento fallido |
| Autobloqueo | Por inactividad, configurable en Ajustes (por defecto 15 min) |
| Cabeceras web | CSP estricta (sin scripts inline), `nosniff`, `frame-ancestors 'none'`… Solo se permiten los dominios de Google que necesita el inicio de sesión |

**No hay recuperación de contraseña.** Si la olvidas, los datos son irrecuperables:
es el precio de que nadie más pueda leerlos.

---

## 📱 App instalable y protección de los datos

La app es una **PWA**: se puede instalar con su propio icono y funciona sin
conexión.

- **Android (Chrome)**: menú ⋮ → *Instalar aplicación* / *Añadir a pantalla de inicio*.
- **iPhone (Safari)**: botón *Compartir* → *Añadir a pantalla de inicio*.

> ⚠️ **En iPhone es importante instalarla.** Safari borra el almacenamiento de una
> web si pasan **7 días sin abrirla**; una app añadida a la pantalla de inicio queda
> exenta. La propia aplicación avisa la primera vez que entras desde un iPhone.

Además, al arrancar la app pide **almacenamiento persistente**
(`navigator.storage.persist()`): así el navegador se compromete a no borrar la
bóveda si al dispositivo le queda poco espacio. El estado se ve en
*Ajustes → Protección de datos*, junto con el uso y la cuota disponible.

Aun así, **mantén siempre un respaldo exportado**: es tu seguro real.

---

## Funciones principales

- **Documentos**: subir archivos (PDF, imágenes, Word, Excel, texto), verlos,
  descargarlos, imprimirlos, editarlos y borrarlos. Filtro por categoría y buscador.
- **Escáner**: captura multipágina desde cámara o galería, **recorte en perspectiva**
  con 4 esquinas arrastrables (rectificación por homografía con interpolación
  bilineal), rotación y exportación a PDF con jsPDF.
- **Mis datos**: pares etiqueta/valor cifrados, con copiado al portapapeles.
- **Quinquenios y Adelantos**: clon del Excel `MACRO_QUINQUENIOS.xlsx` con sus
  **3 hojas** (MACRO · Hoja 1 · Hoja 3) como pestañas. La Hoja 1 y la Hoja 3 son
  una **hoja de cálculo editable** dentro de la app: se busca, se filtra, se
  editan celdas (con guardado automático cifrado), se **añaden** y **eliminan
  trabajadores** y se exporta de vuelta a un `.xlsx` real. La pestaña MACRO es el
  buscador con la ficha completa (3 quinquenios y 3 gestiones de 4 adelantos).
- **Ajustes**: tema claro/oscuro/automático, autobloqueo, cambio de contraseña
  maestra (re‑cifra toda la bóveda), exportar/importar respaldo cifrado,
  protección de datos y borrado total.

---

## Pruebas

```bash
bash tools/smoke.sh                 # código fuente, servida por HTTP + cabeceras
bash tools/smoke.sh 5173 dist       # la carpeta dist/ ya construida
python3 tools/filetest.py           # código fuente abierto como file://
python3 tools/filetest.py dist      # dist/ abierto como file://
```

Todas ejecutan la **app real en Firefox headless** (188 comprobaciones) y devuelven
código de salida 0 solo si todo pasa. Comprueban, entre otras cosas:

- que **los bytes guardados en IndexedDB no son un JPEG en claro** y que el nombre
  no aparece en claro en los metadatos;
- que el descifrado es **idéntico bit a bit** al original (con la sobrecarga
  AES‑GCM exacta de 28 bytes);
- el escáner completo: arrastre de asas, recorte, rotación y que el PDF empiece
  por `%PDF`;
- el visor (imagen y PDF desde `blob:`), la edición y el borrado;
- **la interfaz tipo Keeper**: carpetas expandibles, los tres modos de vista,
  orden, filtro, favoritos y el panel lateral;
- **compartir**: que sin Web Share API se ofrezcan WhatsApp/Gmail/correo/copiar/
  descargar, que los enlaces lleven el mensaje correcto, y que **con** Web Share
  API se comparta el archivo real;
- **entrar con Google sin contraseña**: que la llave se guarde **no extraíble** y
  atada a la cuenta, que el bloqueo oculte la contraseña, que se entre sin
  escribirla, que se **rechace otra cuenta de Google** y que "olvidar este
  dispositivo" vuelva a pedir la contraseña;
- el manifest, los iconos, el **service worker** y el almacenamiento persistente;
- **la sincronización con Google Drive**, con un Drive falso: subir cuando no hay
  copia, no hacer nada si no hay cambios, subir/bajar según quién cambió,
  **detectar el conflicto** y resolverlo, adoptar la copia desde una bóveda vacía,
  y que **la copia remota no contenga nada en claro**;
- que **no hay ninguna violación de CSP** (el capturador escucha
  `securitypolicyviolation`);
- las cabeceras de seguridad del servidor (`tools/check_headers.py`).

`/__test` es una ruta exclusiva del servidor de pruebas: sirve `index.html` con un
capturador de errores y `test/runner.js` inyectados (con un `nonce` válido para la
CSP). El `index.html` de producción no se modifica nunca.

---

## Compatibilidad

Chrome/Edge 90+, Firefox 90+ y Safari 15+. En móvil la app se adapta con barra
inferior, respeta `safe-area-inset` (iPhone con notch) y usa la cámara del sistema
para escanear.
