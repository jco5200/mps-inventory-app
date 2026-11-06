# 📊 Control Proyecto Inventarios MPS 2026

Panel de control (SPA) interactivo para la implementación del nuevo formato de inventario en 12 cuentas empresariales del área de Managed Print Services (MPS). 

**Responsable:** Julio Correa Ortega  
**Fecha de cierre comprometida:** 30 de noviembre de 2026

## 🚀 Descripción del Proyecto

Esta aplicación web permite centralizar el seguimiento de avances, calcular el cumplimiento ponderado (45% Base A-AF, 35% AG-AS, 20% QA), administrar bloqueos, auditar la calidad de los datos (QA), registrar cortes históricos, generar reportería ejecutiva en Excel y mantener respaldos locales seguros (5 capas). 

Está diseñada para ser operada por el supervisor del proyecto y los analistas (OSA) que reportan avances.

## 🌟 Características Principales

- **Dashboard Ejecutivo:** KPIs de avance, gráficos dinámicos y un **Centro de Alertas Unificado** que alerta visualmente sobre errores QA o datos faltantes.
- **Auditoría QA Automatizada:** Al importar un Excel, el sistema audita seriales duplicados, IPs inválidas y correos mal formateados. Puedes ver el detalle en un modal y **descargar los errores a un Excel** para enviárselos al OSA.
- **Gestión de Bloqueos:** Las cuentas bloqueadas cambian su estado a `BLOQUEO`, muestran el motivo en la tabla resumen y pintan su barra de "Meta" en **rojo** en el gráfico de avance.
- **Gráfico de Evolución Histórica:** En la pestaña de Historial, un gráfico de línea muestra cómo ha evolucionado el avance global promedio en el tiempo.
- **Diseño 100% Responsive:** La interfaz se adapta automáticamente a pantallas de PC, tablets y celulares, evitando scroll horizontal indeseado.
- **Sistema de Respaldos en 5 Capas:** LocalStorage, IndexedDB, Snapshots automáticos, Carpeta Local (File System Access API) y Descarga Manual JSON.
- **Semáforo Dinámico:** Evalúa automáticamente si una cuenta está `AL DÍA`, `EN PLAZO`, `ATRASO MENOR`, `ATRASO CRÍTICO` o `SIN DATOS`.

## 🛠 Arquitectura y Tecnologías

El proyecto está construido con tecnología web pura (Vanilla), sin frameworks de por medio, lo que garantiza su velocidad, nulo costo de servidores y facilidad de despliegue:

- **HTML5** y **CSS3** (Diseño responsivo con variables y media queries).
- **JavaScript (ES6+)** para toda la lógica de negocio y manipulación del DOM.
- **Chart.js** (v4.4) + ChartDataLabels para gráficos interactivos y exportables.
- **ExcelJS** (v4.4) para lectura de archivos de OSAs y generación de reportes ejecutivos (.xlsx).
- **Almacenamiento:** LocalStorage, IndexedDB y File System Access API (para respaldos automáticos en carpetas de Windows/Mac).

## 📂 Estructura del Repositorio

- `index.html`: Estructura de la página, navegación superior, contenedores de modales y el div principal (`#app`).
- `css/styles.css`: Tema visual completo, tarjetas, tablas, badges y las reglas de adaptabilidad (Media Queries).
- `js/app.js`: El "cerebro" de la app. Contiene el estado global, cálculos matemáticos, renderizado de vistas, persistencia y eventos.

## 💻 ¿Cómo usar la aplicación?

No requiere instalación. Al abrir la página web, el sistema carga un estado inicial con las 12 cuentas configuradas.

1. **Instrucciones:** Lee la guía integrada en el menú (al final a la derecha) para entender las reglas del semáforo.
2. **Inventario Cuentas:** Es la hoja principal de carga. Puedes editar los datos en la tabla o usar el botón **"📂 Importar Excel OSA"** para cargar los datos automáticamente. Si hay errores de calidad, verás un botón **⚠️** junto al nombre de la cuenta.
3. **Dashboard:** Revisa los KPIs, gráficos, hitos y el estado global del proyecto.
4. **Acuerdos y Riesgos:** Registra bloqueos críticos, responsables y fechas de compromiso.
5. **Historial:** Usa el botón **"+ Corte semanal"** o el botón azul superior para guardar una "foto" del avance de esa semana.
6. **Respaldos:** Configura una carpeta en tu disco (idealmente sincronizada con OneDrive o Google Drive) para guardar copias de seguridad automáticas en formato JSON.

## ☁️ Despliegue (GitHub Pages)

Esta aplicación está diseñada para ser alojada de forma estática. Para publicar cambios:
1. Sube tus modificaciones a la rama `main`.
2. Ve a *Settings > Pages* en este repositorio.
3. Asegúrate de que la fuente (Source) esté apuntando a la rama `main` y a la carpeta raíz `/(root)`.
4. GitHub generará la URL pública automáticamente.

## ⚠️ Notas técnicas para futuros desarrolladores

- **Almacenamiento Local:** La aplicación no cuenta con backend ni base de datos en la nube. **Todos los datos viven en el navegador del usuario**. Si se borra la caché del navegador, los datos se perderán a menos que se haya configurado la "Carpeta de respaldo" o se haya descargado el JSON manualmente.
- **Lógica Centralizada:** El archivo `js/app.js` concentra toda la lógica. Se recomienda leer cuidadosamente antes de modificar para no romper los cálculos globales o las validaciones de jerarquía (Total ≥ Revisados ≥ Base ≥ AG-AS ≥ QA).
- **Fechas de Corte:** El sistema tiene bloqueado por seguridad el guardado de cortes con fechas futuras para no distorsionar los gráficos históricos.
- **Pesos de Evaluación:** Cualquier cambio en los pesos de la nota final debe realizarse en la constante `WEIGHTS` al inicio de `app.js`. Actualmente está en 45% Base, 35% AG-AS, 20% QA.
