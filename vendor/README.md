# Librerías de terceros (vendorizadas)

Bóveda **no usa CDN**: todas estas librerías se sirven desde el propio sitio,
para que la app funcione sin conexión y para no depender de terceros. El
navegador solo carga las que necesita cada pantalla (las de `.docx/.pptx` se
cargan al vuelo, solo al previsualizar esos archivos).

## Versiones incluidas

| Archivo | Librería | Versión | Licencia | Uso en Bóveda |
|---|---|---|---|---|
| `jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | MIT | Generar PDF (escáner y constancias de Quinquenios) |
| `xlsx.full.min.js` | [SheetJS](https://sheetjs.com) (xlsx) | 0.20.3 | Apache-2.0 | Leer y escribir `.xlsx` (Excel) |
| `jszip.min.js` | [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | MIT / GPLv3 | Descomprimir `.docx/.pptx` para la vista previa |
| `docx-preview.min.js` | [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) | ≈0.3.x (sin versión embebida) | Apache-2.0 | Vista previa de Word (`.docx`) |

## Notas de seguridad

- **SheetJS 0.20.3** es la distribución oficial más reciente y **no** arrastra
  los CVE de las builds antiguas de la comunidad (prototype pollution
  CVE-2023-30533 y ReDoS CVE-2024-22363, presentes en `< 0.20.x`).
- **JSZip 3.10.1** es la última y corrige el CVE-2022-48285 (path traversal en
  versiones `< 3.8.0`).
- **jsPDF 2.5.1**: los avisos GHSA-w532-jxjh-hjhj (CVE-2025-29907) y
  GHSA-8mvj-3j78-4qmw (CVE-2025-57810) afectan a `addImage` / `html` /
  `addSvgAsImage` **cuando la URL o el PNG los controla un atacante**. En Bóveda
  `addImage` recibe **solo** `canvas.toDataURL()` de la propia imagen del usuario
  (`js/scanner.js`), nunca datos externos; y `html`/`addSvgAsImage` no se usan.
  Por eso **no son explotables** aquí y no se justifica un salto de versión
  mayor (3.x) que arriesgaría romper el escáner/PDF. Si algún día se migra,
  actualizar también la tabla de arriba y del README, y pasar las pruebas E2E.

## Cómo actualizar una librería

1. Descarga la nueva build (`.min.js`), mejor desde la fuente oficial.
2. Sustituye el archivo manteniendo **el mismo nombre**.
3. Comprueba que sigue exponiendo el global que usa la app (`window.jspdf`,
   `XLSX`, `JSZip`, `docx`).
4. Pasa las pruebas:
   ```bash
   bash tools/smoke.sh        # app real en Firefox headless
   python3 tools/filetest.py  # abrir index.html como file://
   ```
5. Actualiza esta tabla **y** la sección `vendor/` del `README.md`.
