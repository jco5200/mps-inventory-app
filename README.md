# Control Proyecto Inventarios MPS 2026

Panel de control (SPA) para la implementación del nuevo formato de inventario en 12 cuentas empresariales del área de Managed Print Services (MPS). 

**Responsable:** Julio Correa Ortega
**Fecha de cierre comprometida:** 30 de noviembre de 2026

## 🚀 Descripción del Proyecto

Esta aplicación web permite centralizar el seguimiento de avances, calcular el cumplimiento ponderado (45% Base A-AF, 35% AG-AS, 20% QA), administrar bloqueos, registrar cortes históricos, generar reportería ejecutiva en Excel y mantener respaldos locales seguros (5 capas). 

Está diseñada para ser operada por el supervisor del proyecto y los analistas (OSA) que reportan avances.

## 🛠 Arquitectura y Tecnologías

El proyecto está construido con tecnología web pura (Vanilla), sin frameworks de por medio, lo que facilita su despliegue y mantenimiento:

- **HTML5** y **CSS3** (Diseño responsivo).
- **JavaScript (ES6+)** para toda la lógica de negocio.
- **Chart.js** (v4.4) para gráficos de avance y distribución.
- **ExcelJS** (v4.4) para lectura/escritura de archivos .xlsx.
- **Almacenamiento local:** LocalStorage, IndexedDB y File System Access API (para respaldos en carpetas locales).

## 📂 Estructura del Repositorio

- `index.html`: Estructura de la página, navegación, modales y contenedor principal.
- `css/styles.css`: Tema visual, tablas, tarjetas, badges y diseño responsivo.
- `js/app.js`: Estado global, lógica de negocio, renderizado, persistencia y eventos.

## 💻 ¿Cómo usar la aplicación?

No requiere instalación. Al abrir la página web, el sistema carga un estado inicial con las 12 cuentas configuradas.

1. **Instrucciones:** Lee la guía integrada para entender las reglas del semáforo.
2. **Inventario Cuentas:** Es la hoja principal de carga. Puedes editar los datos directamente en la tabla o usar el botón **"Importar Excel OSA"** para cargar los datos automáticamente desde el archivo del analista.
3. **Dashboard:** Revisa los KPIs, gráficos y el estado global del proyecto.
4. **Acuerdos y Riesgos:** Registra bloqueos, responsables y fechas de compromiso.
5. **Cortes e Historial:** Usa el botón **"Guardar corte semanal"** en el menú superior para guardar una foto del avance de esa semana.
6. **Respaldos:** Configura una carpeta en tu disco (idealmente sincronizada con OneDrive o Google Drive) para guardar copias de seguridad automáticas en formato JSON.

## ☁️ Despliegue (GitHub Pages)

Esta aplicación está diseñada para ser alojada de forma estática. Para publicar cambios:
1. Sube tus modificaciones a la rama `main`.
2. Ve a *Settings > Pages* en este repositorio.
3. Asegúrate de que la fuente (Source) esté apuntando a la rama `main` y a la carpeta raíz `/(root)`.
4. GitHub generará la URL pública automáticamente.

## ⚠️ Notas técnicas para futuros desarrolladores

- La aplicación no cuenta con backend. **Todos los datos viven en el navegador del usuario**. Si se borra la caché del navegador, los datos se perderán a menos que se haya configurado la "Carpeta de respaldo" o se haya descargado el JSON manualmente.
- El archivo `js/app.js` concentra toda la lógica. Se recomienda leer cuidadosamente antes de modificar para no romper los cálculos globales o las validaciones de jerarquía (Total ≥ Revisados ≥ Base ≥ AG-AS ≥ QA).
- Cualquier cambio en los pesos de evaluación debe realizarse en la constante `WEIGHTS` al inicio de `app.js`.
