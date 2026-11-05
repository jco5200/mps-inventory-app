/* =============================================================
   CONTROL PROYECTO INVENTARIOS MPS 2026 - app.js
   VERSIÓN FINAL UNIFICADA Y OPTIMIZADA
   ============================================================= */
const STORAGE_KEY = 'mps_inv_2026_v1';
const WEIGHTS = { base: 0.45, agas: 0.35, qa: 0.20 };

if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

const META_THRESHOLDS = [
  { max: '2026-10-30', meta: 0.10 },
  { max: '2026-11-06', meta: 0.55 },
  { max: '2026-11-13', meta: 0.75 },
  { max: '2026-11-20', meta: 0.90 },
  { max: '2026-11-27', meta: 0.98 },
  { max: '9999-12-31', meta: 1.00 },
];

const GANTT_PHASES = [
  { name: 'Preparación',         start: '2026-10-29', end: '2026-10-30', color: '#6b7280' },
  { name: 'Levantamiento A-AF',  start: '2026-11-02', end: '2026-11-06', color: '#3b82f6' },
  { name: 'Investigación AG-AS', start: '2026-11-02', end: '2026-11-20', color: '#8b5cf6' },
  { name: 'QA y correcciones',   start: '2026-11-23', end: '2026-11-27', color: '#f59e0b' },
  { name: 'Cierre ejecutivo',    start: '2026-11-30', end: '2026-11-30', color: '#16a34a' },
];

const SCHEDULE = [
  { week:'Inicio', period:'29-30 oct', phase:'Preparación y asignación', osaAction:'Revisar instrucciones, confirmar archivo, universo preliminar y responsable por cuenta.', supAction:'Distribuir formato, explicar criterios y resolver dudas iniciales.', deliverable:'Responsables confirmados y universo preliminar por cuenta.', meta:0.10, evidence:'Correo o acta de asignación; total preliminar de equipos.', risk:'Falta de responsable o universo desconocido.', meeting:'30-oct: control de inicio', responsible:'Supervisor + OSA', status:'Completado' },
  { week:'Semana 1', period:'02-06 nov', phase:'Levantamiento base columnas A-AF', osaAction:'Completar datos de identificación, red, ubicación, estado y datos base para todos los equipos.', supAction:'Revisar consistencia inicial y remover bloqueos de acceso o información.', deliverable:'Campos A-AF avanzados y primeras brechas documentadas.', meta:0.55, evidence:'Archivo OSA actualizado; conteo total y equipos revisados.', risk:'Bajo ritmo de levantamiento o diferencias en el universo.', meeting:'06-nov: primer corte formal', responsible:'OSA / Supervisor', status:'En curso' },
  { week:'Semana 2', period:'09-13 nov', phase:'Investigación columnas AG-AS, corte 1', osaAction:'Investigar los campos avanzados; registrar información disponible y documentar lo no aplicable.', supAction:'Verificar criterios, priorizar cuentas atrasadas y asignar acciones.', deliverable:'Primer corte AG-AS y pendientes identificados.', meta:0.75, evidence:'Listado de pendientes AG-AS; fuentes consultadas; responsables.', risk:'Dependencias de información y campos no aplicables sin justificación.', meeting:'13-nov: revisión de avance', responsible:'OSA / Supervisor', status:'Pendiente' },
  { week:'Semana 3', period:'16-20 nov', phase:'Cierre de investigación AG-AS', osaAction:'Completar investigación, resolver pendientes y actualizar excepciones.', supAction:'Validar evidencia y escalar bloqueos críticos.', deliverable:'AG-AS cerrado o excepciones formalmente documentadas.', meta:0.90, evidence:'Archivo actualizado; excepciones; acuerdos de cierre.', risk:'Pendientes sin responsable o evidencia insuficiente.', meeting:'20-nov: cierre AG-AS', responsible:'OSA / Supervisor', status:'Pendiente' },
  { week:'Semana 4', period:'23-27 nov', phase:'QA y correcciones', osaAction:'Corregir duplicados, vacíos, formatos e inconsistencias detectadas.', supAction:'Ejecutar control de calidad, muestreo y devolución de observaciones.', deliverable:'Inventario corregido y listo para cierre.', meta:0.98, evidence:'Checklist QA; observaciones resueltas; versión corregida.', risk:'Correcciones tardías o reincidencia de errores.', meeting:'27-nov: aprobación QA', responsible:'Supervisor + OSA', status:'Pendiente' },
  { week:'Cierre', period:'30 nov', phase:'Revisión final y Cierre', osaAction:'Entregar versión final y documentar pendientes excepcionales.', supAction:'Consolidar estado, preparar informe y cerrar compromisos.', deliverable:'Inventarios cerrados y estado final presentado.', meta:1.00, evidence:'Versión final; acta de cierre; pendientes excepcionales.', risk:'Pendientes sin aceptación o falta de evidencia final.', meeting:'30-nov: cierre del proyecto', responsible:'Supervisor', status:'Pendiente' },
];

let state = null;
let currentView = 'dashboard'; 
let charts = {};

/* ========== RESPALDO ========== */
const DB_NAME = 'mps_inv_db';
const DB_VERSION = 1;
const STORE_CURRENT = 'state';
const STORE_SNAPSHOTS = 'snapshots';
let fileHandle = null;
let autoSaveTimer = null;
let saveTimer = null;
let lastSnapTs = 0;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_CURRENT)) db.createObjectStore(STORE_CURRENT);
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        const s = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date');
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}
async function dbPut(store, key, value) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    if (key) tx.objectStore(store).put(value, key);
    else tx.objectStore(store).add(value);
    tx.oncomplete = () => res();
    tx.onerror = e => rej(e.target.error);
  });
}
async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = e => rej(e.target.error);
  });
}
async function dbAll(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = e => rej(e.target.error);
  });
}
async function dbDelete(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = e => rej(e.target.error);
  });
}
async function pickBackupFolder() {
  if (!window.showDirectoryPicker) { toast('Usá Chrome, Edge u Opera.'); return; }
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    await dbPut(STORE_CURRENT, 'dirHandle', dir);
    if (dir.requestPermission) { try { await dir.requestPermission({ mode: 'readwrite' }); } catch (e) {} }
    fileHandle = await dir.getFileHandle('mps_backup.json', { create: true });
    await autoSaveToFile();
    toast('✓ Carpeta configurada: ' + dir.name);
    render();
  } catch (e) { if (e.name !== 'AbortError') toast('Error: ' + e.message); }
}
async function restoreFileHandle() {
  try {
    const dir = await dbGet(STORE_CURRENT, 'dirHandle');
    if (!dir) return;
    const perm = await dir.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') fileHandle = await dir.getFileHandle('mps_backup.json', { create: true });
  } catch (e) { console.error(e); }
}
async function autoSaveToFile() {
  if (!fileHandle || !state) return false;
  try {
    const w = await fileHandle.createWritable();
    await w.write(JSON.stringify(state, null, 2));
    await w.close();
    state._lastFileSave = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    return true;
  } catch (e) { console.error('Auto-save falló:', e); return false; }
}
async function addSnapshot(snapState) {
  await dbPut(STORE_SNAPSHOTS, null, { date: new Date().toISOString(), state: JSON.parse(JSON.stringify(snapState)) });
  lastSnapTs = Date.now();
  const all = await dbAll(STORE_SNAPSHOTS);
  if (all.length > 200) { for (const s of all.slice(0, all.length - 200)) await dbDelete(STORE_SNAPSHOTS, s.id); }
}
async function maybeAutoSnapshot() {
  if (!state) return;
  if (lastSnapTs && (Date.now() - lastSnapTs) < 15 * 60 * 1000) return;
  try { await addSnapshot(state); } catch (e) {}
}
function saveState() {
  if (!state) return;
  state._lastSave = new Date().toISOString();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; saveStateFull().catch(e => console.error(e)); }, 400);
}
async function saveStateFull() {
  if (!state) return;
  state._lastSave = new Date().toISOString();
  await dbPut(STORE_CURRENT, 'current', state);
  await autoSaveToFile();
  updateBackupStatus();
}
async function loadState() {
  let dbState = null, lsState = null;
  try { const db = await dbGet(STORE_CURRENT, 'current'); if (db && db.accounts) dbState = db; } catch (e) {}
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) { const p = JSON.parse(r); if (p.accounts) lsState = p; } } catch (e) {}
  if (dbState && lsState) {
    const dbTs = dbState._lastSave ? new Date(dbState._lastSave).getTime() : 0;
    const lsTs = lsState._lastSave ? new Date(lsState._lastSave).getTime() : 0;
    return lsTs > dbTs ? lsState : dbState;
  }
  return dbState || lsState || getInitialState();
}
function getBackupStatus() {
  if (!fileHandle) return { level: 'warn', msg: '⚠ Sin carpeta de respaldo', long: 'Configurá una carpeta en Respaldos.' };
  if (!state || !state._lastFileSave) return { level: 'warn', msg: '⚠ Aún sin guardado', long: 'Hacé un cambio o esperá 5 min.' };
  const hours = (Date.now() - new Date(state._lastFileSave).getTime()) / 3600000;
  if (hours > 24) return { level: 'danger', msg: `🔴 Último respaldo hace ${Math.floor(hours/24)} días`, long: 'Exportá manualmente.' };
  if (hours > 3) return { level: 'warn', msg: `🟡 Último respaldo hace ${Math.floor(hours)} horas`, long: 'Debería actualizarse.' };
  return { level: 'ok', msg: `✓ Respaldado ${new Date(state._lastFileSave).toLocaleTimeString()}`, long: 'Todo en orden.' };
}
function updateBackupStatus() {
  const el = document.getElementById('backupStatus');
  if (!el || !state) return;
  const s = getBackupStatus();
  el.className = 'backup-status ' + s.level;
  el.textContent = s.msg;
  el.style.display = 'inline-block';
}
function startAutoSave() {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(async () => {
    if (fileHandle && state) { await autoSaveToFile(); updateBackupStatus(); }
    await maybeAutoSnapshot();
  }, 5 * 60 * 1000);
}
function setupUnloadWarning() {
  window.addEventListener('beforeunload', e => {
    if (!fileHandle || !state) return;
    const hours = (Date.now() - (state._lastFileSave ? new Date(state._lastFileSave).getTime() : 0)) / 3600000;
    if (hours > 1) { e.preventDefault(); e.returnValue = '¿Salir sin respaldar?'; return e.returnValue; }
  });
}

/* ========== ESTADO INICIAL ========== */
function getInitialState() {
  const accounts = [
    ['fasa','FASA',1,'Edgardo Carrasco',418], ['u-central','U CENTRAL',2,'Debora Arriagada',124],
    ['u-mayor','U MAYOR',3,'Yeremy Ovalle',243], ['uai','UAI',1,'Felipe Higueras',102],
    ['caja-18','CAJA 18',1,'Sergio Orellana',323], ['lo-barnechea','LO BARNECHEA',1,'Pedro Bustamante',141],
    ['sura','SURA',1,'Gaspar Giron',240], ['dhl','DHL',1,'Sergio Agurto',81],
    ['larrain','LARRAIN',1,'Sergio Agurto',68], ['salfa','SALFA',1,'Alejandro Garrido',377],
    ['metlife','METLIFE SEGUROS',1,'Felipe Higueras',103], ['provida','PROVIDA',1,'Felipe Higueras',0]
  ].map(([id,name,osas,responsible,total]) => ({
    id, name, osas, responsible, total, reviewed: 0, baseCount: 0, agasCount: 0, qaCount: 0,
    updateDate: '2026-10-30', criticalBlock: false, blockDetail: '', nextAction: '',
    actionResponsible: '', commitmentDate: '', observations: id === 'provida' ? 'No está en DCC' : 'Preparación completada'
  }));
  return { accounts, risks: [], history: [], controlDate: new Date().toISOString().slice(0,10) };
}

/* ========== CÁLCULOS ========== */
function pctBase(a) { return a.total > 0 ? Math.min(1, a.baseCount / a.total) : 0; }
function pctAGAS(a) { return a.total > 0 ? Math.min(1, a.agasCount / a.total) : 0; }
function pctQA(a)   { return a.total > 0 ? Math.min(1, a.qaCount   / a.total) : 0; }
function calcGlobal(a) { return pctBase(a)*WEIGHTS.base + pctAGAS(a)*WEIGHTS.agas + pctQA(a)*WEIGHTS.qa; }
function calcMeta(d) { if (!d) return 0; for (const t of META_THRESHOLDS) if (d <= t.max) return t.meta; return 1; }
function calcGap(a) { return calcGlobal(a) - calcMeta(state.controlDate); }
function calcPhase(a) {
  const p = calcGlobal(a);
  if (p >= 1) return 'Finalizado';
  if (p >= 0.80) return 'QA y correcciones';
  if (p >= 0.45) return 'Investigación AG-AS';
  if (p > 0) return 'Inventario base A-AF';
  return 'Preparación';
}
function calcStatus(a) {
  const p = calcGlobal(a);
  if (p >= 1) return 'FINALIZADO';
  if (!a.total || !a.updateDate) return 'SIN DATOS';
  if (a.criticalBlock) return 'CRÍTICO';
  
  const m = calcMeta(state.controlDate);
  if (p >= m) return 'AL DÍA';
  
  let currentPhaseEnd = '9999-12-31';
  for (let i = 0; i < META_THRESHOLDS.length; i++) {
     if (state.controlDate <= META_THRESHOLDS[i].max) {
         currentPhaseEnd = META_THRESHOLDS[i].max;
         break;
     }
  }
  
  if (state.controlDate > currentPhaseEnd) {
      if (p >= m - 0.10) return 'ATRASO MENOR';
      return 'ATRASO CRÍTICO';
  } else {
      if (p >= m * 0.5) {
          return 'EN PLAZO'; 
      } else {
          return 'ATRASO MENOR'; 
      }
  }
}
function statusClass(s) {
  const map = { 
    'FINALIZADO': 'badge-finalizado', 
    'AL DÍA': 'badge-verde', 
    'EN PLAZO': 'badge-verde', 
    'ATRASO MENOR': 'badge-ambar', 
    'ATRASO CRÍTICO': 'badge-rojo', 
    'CRÍTICO': 'badge-rojo', 
    'SIN DATOS': 'badge-sin-fecha' 
  };
  return map[s] || '';
}
function fmtPct(v) { if (v==null || isNaN(v)) return '—'; return (v*100).toFixed(1)+'%'; }
function daysSinceDate(d) { if (!d) return null; return Math.floor((new Date(state.controlDate+'T00:00:00') - new Date(d+'T00:00:00'))/86400000); }
function calcRiskSemaphore(r) {
  if (r.status === 'Cerrado') return 'CERRADO';
  if (!r.commitmentDate) return 'SIN FECHA';
  const d = Math.ceil((new Date(r.commitmentDate + 'T00:00:00') - new Date(state.controlDate + 'T00:00:00')) / 86400000);
  if (d < 0) return 'VENCIDO';
  if (d <= 2) return 'URGENTE';
  return 'EN PLAZO';
}
function calcRiskDays(r) {
  if (!r.commitmentDate) return null;
  return Math.ceil((new Date(r.commitmentDate + 'T00:00:00') - new Date(state.controlDate + 'T00:00:00')) / 86400000);
}
function getCurrentWeek(d) {
  if (d <= '2026-10-30') return { name:'Inicio',   focus:'Preparación y asignación', meta:0.10, period:'29-30 oct' };
  if (d <= '2026-11-06') return { name:'Semana 1', focus:'Levantamiento base A-AF',  meta:0.55, period:'02-06 nov' };
  if (d <= '2026-11-13') return { name:'Semana 2', focus:'Investigación AG-AS',      meta:0.75, period:'09-13 nov' };
  if (d <= '2026-11-20') return { name:'Semana 3', focus:'Cierre AG-AS',             meta:0.90, period:'16-20 nov' };
  if (d <= '2026-11-27') return { name:'Semana 4', focus:'QA y correcciones',        meta:0.98, period:'23-27 nov' };
  return                       { name:'Cierre',   focus:'Revisión final y cierre',   meta:1.00, period:'30 nov' };
}
function isPreparationPhase(d) { return d <= '2026-10-30'; }
function validateAll() {
  const w = [];
  state.accounts.forEach(a => {
    if (a.reviewed > a.total) w.push({ accountId:a.id, account:a.name, msg:`Revisados (${a.reviewed}) > Total (${a.total})` });
    if (a.baseCount > a.reviewed) w.push({ accountId:a.id, account:a.name, msg:`Base ok > Revisados` });
    if (a.agasCount > a.baseCount) w.push({ accountId:a.id, account:a.name, msg:`AG-AS ok > Base ok` });
    if (a.qaCount > a.agasCount) w.push({ accountId:a.id, account:a.name, msg:`QA ok > AG-AS ok` });
    if (a.criticalBlock && !a.nextAction) w.push({ accountId:a.id, account:a.name, msg:`Bloqueo sin próxima acción` });
    if (a.criticalBlock && !a.commitmentDate) w.push({ accountId:a.id, account:a.name, msg:`Bloqueo sin fecha` });
  });
  return w;
}
function getLastSnapshotByAccount() {
  const m = {};
  state.accounts.forEach(a => { const c = state.history.filter(h => h.account === a.name); if (c.length) m[a.id] = c[c.length-1].global; });
  return m;
}
function nextRiskId() {
  let max = 0;
  state.risks.forEach(r => { const m = String(r.id || '').match(/(\d+)/); if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; } });
  return 'A-' + String(max + 1).padStart(3, '0');
}

/* ========== ROUTER ========== */
function render() {
  Object.values(charts).forEach(c => c && c.destroy && c.destroy());
  charts = {};
  updateBackupStatus();
  
  const cd = document.getElementById('controlDate');
  if (cd && state && cd.value !== state.controlDate) {
     cd.value = state.controlDate;
  }
  
  const app = document.getElementById('app');
  if (!app) return;
  if (currentView === 'dashboard') renderDashboard(app);
  else if (currentView === 'plan') renderPlan(app);
  else if (currentView === 'accounts') renderAccounts(app);
  else if (currentView === 'gantt') renderGantt(app);
  else if (currentView === 'risks') renderRisks(app);
  else if (currentView === 'history') renderHistory(app);
  else if (currentView === 'schedule') renderSchedule(app);
  else if (currentView === 'backups') renderBackups(app);
  else if (currentView === 'instructions') renderInstructions(app);
  else if (currentView === 'settings') renderSettings(app);
}

/* ========== VISTAS ========== */
function openQAAlertsModal(accountName) {
  const acc = state.accounts.find(a => a.name === accountName);
  if (!acc || !acc.qaDetails || acc.qaDetails.length === 0) return;
  
  let modal = document.getElementById('qaAlertsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'qaAlertsModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:grid;place-items:center;z-index:9999;';
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div style="background:white;border-radius:12px;width:90%;max-width:600px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.2);">
      <div style="padding:16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;background:#fef2f2;">
        <h2 style="margin:0;font-size:16px;color:#991b1b;">Errores QA: ${acc.name}</h2>
        <button id="qaAlertsCloseX" style="background:none;border:none;font-size:24px;cursor:pointer;color:#991b1b;line-height:1;">&times;</button>
      </div>
      <div style="padding:16px;overflow-y:auto;font-size:14px;color:#374151;">
        <ul style="margin:0;padding-left:20px;">
          ${acc.qaDetails.map(d => `<li style="margin-bottom:6px;">${d}</li>`).join('')}
        </ul>
      </div>
      <div style="padding:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:10px;background:#f8fafc;flex-wrap:wrap;">
        <button class="btn" id="qaAlertsExportBtn" style="background:#991b1b;color:#fff;border:none;">📥 Descargar errores en Excel</button>
        <button class="btn btn-primary" id="qaAlertsCloseBtn">Cerrar</button>
      </div>
    </div>
  `;
  modal.style.display = 'grid';
  
  document.getElementById('qaAlertsCloseX').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('qaAlertsCloseBtn').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('qaAlertsExportBtn').onclick = () => { exportQAErrorsToExcel(acc.name); };
}

async function exportQAErrorsToExcel(accountName) {
  if (typeof ExcelJS === 'undefined') { toast('ExcelJS no cargó. Revisá tu conexión.'); return; }
  const acc = state.accounts.find(a => a.name === accountName);
  if (!acc || !acc.qaDetails || acc.qaDetails.length === 0) { toast('Sin errores QA para exportar'); return; }
  
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Control Proyecto Inventarios MPS 2026';
    
    const ws = wb.addWorksheet('Errores QA');
    ws.columns = [
      { header: '#', key: 'num', width: 8 },
      { header: 'Cuenta', key: 'account', width: 26 },
      { header: 'Detalle del error', key: 'detail', width: 80 }
    ];
    
    acc.qaDetails.forEach((d, i) => {
      ws.addRow({ num: i + 1, account: acc.name, detail: d });
    });
    
    const header = ws.getRow(1);
    header.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    header.height = 22;
    
    ws.eachRow((row, r) => {
      if (r !== 1) {
        row.eachCell(c => {
          c.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
          c.alignment = { vertical: 'middle', wrapText: true };
        });
      }
    });
    
    const buf = await wb.xlsx.writeBuffer();
    const safeName = acc.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
    download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `QA_Errores_${safeName}_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast(`✓ Errores de ${acc.name} exportados a Excel`);
  } catch (e) {
    console.error(e);
    toast('Error al exportar: ' + e.message);
  }
}

function renderDashboard(app) {
  const accs = state.accounts;
  const totalOSAs = accs.reduce((s,a)=>s+(+a.osas||0),0);
  const avgProgress = accs.reduce((s,a)=>s+calcGlobal(a),0)/accs.length;
  const totalReviewed = accs.reduce((s,a)=>s+(+a.reviewed||0),0);
  const totalEquip = accs.reduce((s,a)=>s+(+a.total||0),0);

  const counts = { FINALIZADO:0, 'AL DÍA':0, 'EN PLAZO':0, 'ATRASO MENOR':0, 'ATRASO CRÍTICO':0, 'CRÍTICO':0, 'SIN DATOS':0 };
  accs.forEach(a => counts[calcStatus(a)]++);

  // Solo consideramos errores QA reales (archivos con fallas)
  const accountsWithQA = accs.filter(a => a.qaDetails && a.qaDetails.length > 0);
  const hasErrors = accountsWithQA.length > 0;
  
  // Contamos cuántas cuentas tienen equipos cargados (Total > 0)
  const cuentasCargadas = accs.filter(a => a.total > 0).length;

  const week = getCurrentWeek(state.controlDate);
  const prep = isPreparationPhase(state.controlDate);
  const prepDone = accs.filter(a => a.responsible && a.total > 0).length;
  const bStatus = getBackupStatus();

  const milestones = [
    {name:'Preparación', date:'2026-10-30', meta:0.10},
    {name:'Inventario base', date:'2026-11-06', meta:0.55},
    {name:'Corte AG-AS', date:'2026-11-13', meta:0.75},
    {name:'Cierre AG-AS', date:'2026-11-20', meta:0.90},
    {name:'QA', date:'2026-11-27', meta:0.98},
    {name:'Cierre', date:'2026-11-30', meta:1.00},
  ];
  let hitosCumplidos = 0, hitosProximos = 0, hitosPendientes = 0;

  const milestoneData = milestones.map(h => {
    let sit, comment = '';
    if (state.controlDate < h.date) {
      sit = 'PRÓXIMO'; comment = 'Aún no es la fecha de evaluación.'; hitosProximos++;
    } else if (h.name === 'Preparación') {
      const pending = accs.filter(a => !(a.responsible && a.total > 0));
      if (pending.length === 0) { 
          sit = 'CUMPLIDO · 100%'; comment = 'Todas las cuentas listas.'; hitosCumplidos++; 
      } else if (pending.length === 1 && (pending[0].id === 'provida' || pending[0].id === 'uai')) { 
          sit = 'CUMPLIDO · EXCEPCIÓN'; comment = `${pending[0].name} excluida (Justificada).`; hitosCumplidos++; 
      } else { 
          sit = 'PENDIENTE'; comment = `Falta completar: ${pending.map(p=>p.name).join(', ')}`; hitosPendientes++; 
      }
    } else {
      if (avgProgress >= h.meta) { sit = 'CUMPLIDO · '+fmtPct(avgProgress); comment = 'Meta alcanzada.'; hitosCumplidos++; }
      else { sit = 'PENDIENTE'; comment = `Brecha global de ${(h.meta*100 - avgProgress*100).toFixed(1)} pts.`; hitosPendientes++; }
    }
    return { ...h, sit, comment };
  });

  app.innerHTML = `
    ${bStatus.level !== 'ok' ? `<div class="card" style="border-left:4px solid var(--${bStatus.level === 'danger' ? 'danger' : 'warning'});background:${bStatus.level === 'danger' ? '#fef2f2' : '#fffbeb'}">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div><strong style="color:${bStatus.level === 'danger' ? '#991b1b' : '#92400e'}">${bStatus.msg}</strong><div class="help">${bStatus.long}</div></div>
        <button class="btn btn-primary" onclick="document.querySelector('[data-view=backups]').click()">Ir a Respaldos →</button>
      </div>
    </div>` : ''}

    <!-- CENTRO DE ALERTAS UNIFICADO -->
    <div class="card" style="padding: 0; overflow: hidden; margin-bottom: 20px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <div style="padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
        <h2 style="margin: 0; font-size: 15px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">🔔</span> Estado del Sistema
        </h2>
        ${hasErrors 
          ? `<span style="background: #fecaca; color: #991b1b; font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: bold;">${accountsWithQA.length} Cuentas con errores QA</span>` 
          : `<span style="background: #dcfce7; color: #166534; font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: bold;">Sin errores QA</span>`}
      </div>
      
      ${hasErrors ? `
      <div style="padding: 16px 20px; background: #fef2f2;">
        <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 16px;">🚨</span> Errores QA en archivos (Requiere acción del OSA)
        </h3>
        <ul style="margin: 0; padding-left: 24px; font-size: 13px; color: #7f1d1d;">
          ${accountsWithQA.map(a => `
            <li style="margin-bottom: 4px;"><strong>${a.name}</strong>: ${a.qaDetails.length} error(es) detectados.
            <a href="#" onclick="openQAAlertsModal('${a.name}'); return false;" style="color: #991b1b; text-decoration: underline; font-weight: bold; margin-left: 6px;">Auditar</a></li>
          `).join('')}
        </ul>
      </div>
      ` : `
      <div style="padding: 20px; background: #f0fdf4; color: #166534; font-size: 14px; display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 28px;">✅</span> 
        <div>
          <strong style="display: block; font-size: 16px; margin-bottom: 4px;">Todo en orden</strong>
          Se han cargado exitosamente <strong>${cuentasCargadas} cuentas</strong> en el sistema. No se detectaron errores QA en los archivos importados.
        </div>
      </div>
      `}
    </div>

    <div class="card" style="border-left: 4px solid var(--primary); background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%); margin-bottom: 20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px;">
        <div>
          <h2 style="margin:0; font-size:18px; color:#1e3a8a;">📍 Fase Actual: ${week.name} (${week.period})</h2>
          <p class="help" style="margin:4px 0 0 0; font-size:14px; color:#3b82f6;">Foco: <strong>${week.focus}</strong></p>
        </div>
        <div style="text-align:right; background:white; padding:10px 20px; border-radius:8px; border:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
          <div style="font-size:11px; color:var(--gray-500); font-weight:bold; text-transform:uppercase; letter-spacing:0.5px;">Meta del Hito</div>
          <div style="font-size:22px; font-weight:700; color:var(--primary);">${fmtPct(week.meta)}</div>
        </div>
      </div>
    </div>
     
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Cuentas</div><div class="kpi-value">12</div><div class="kpi-sub">${totalOSAs} OSAs asignados</div></div>
      <div class="kpi success"><div class="kpi-label">Avance promedio</div><div class="kpi-value">${fmtPct(avgProgress)}</div><div class="kpi-sub">Meta ${prep?'—':fmtPct(week.meta)}</div></div>
      <div class="kpi success"><div class="kpi-label">Al día</div><div class="kpi-value">${counts['AL DÍA']+counts.FINALIZADO+counts['EN PLAZO']}</div><div class="kpi-sub">${counts['ATRASO MENOR']} en atraso menor</div></div>
      <div class="kpi danger"><div class="kpi-label">Atraso crítico</div><div class="kpi-value">${counts['ATRASO CRÍTICO']+counts['CRÍTICO']}</div><div class="kpi-sub">${counts['SIN DATOS']} sin datos</div></div>
      <div class="kpi"><div class="kpi-label">Equipos revisados</div><div class="kpi-value">${totalReviewed}</div><div class="kpi-sub">de ${totalEquip} totales</div></div>
    </div>

    ${prep ? `<div class="card"><h2>Hito de Preparación · ${prepDone}/12 cuentas listas</h2><p class="help">Cada cuenta debe tener responsable y total definidos. Se cumple antes del 30-10-2026.</p></div>` : ''}

    <div class="charts-row">
      <div class="card"><h2>Avance vs Meta por cuenta</h2><div class="chart-container"><canvas id="chartProgress"></canvas></div></div>
      <div class="card"><h2>Distribución de estados</h2><div class="chart-container"><canvas id="chartStatus"></canvas></div></div>
    </div>

    <div class="card">
      <h2>Resumen por cuenta</h2>
               <div class="table-wrap"><table>
            <thead><tr><th>Cuenta</th><th>OSAs</th><th>Total</th><th>Revisados</th><th>% Col A-AF</th><th>Col AG-AS</th><th>QA</th><th>Global</th><th>Meta</th><th>Brecha</th><th>Fase</th><th>Estado</th></tr></thead>
            <tbody>${accs.map(a=>{
              const g=calcGlobal(a), m=calcMeta(state.controlDate), gap=g-m, st=calcStatus(a);
              return `<tr><td><strong>${a.name}</strong></td><td>${a.osas}</td><td>${a.total}</td><td>${a.reviewed}</td>
                <td>${fmtPct(pctBase(a))}</td><td>${fmtPct(pctAGAS(a))}</td><td>${fmtPct(pctQA(a))}</td>
                <td><strong>${fmtPct(g)}</strong></td><td>${fmtPct(m)}</td>
                <td style="color:${gap<0?'var(--danger)':'var(--success)'}">${(gap*100).toFixed(1)} pts</td>
                <td>${calcPhase(a)}</td><td><span class="badge ${statusClass(st)}">${st}</span></td></tr>`;}).join('')}
            </tbody>
          </table></div>
    </div>

    <div class="charts-row">
      <div class="card">
        <h2>Hitos del proyecto</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Hito</th><th>Fecha</th><th>Meta</th><th>Resultado</th><th>Situación</th><th>Comentarios / Justificación</th></tr></thead>
          <tbody>${milestoneData.map(h=>{
            const cls = h.sit.startsWith('CUMPLIDO')?'badge-verde':h.sit==='PENDIENTE'?'badge-rojo':'badge-sin-fecha';
            return `<tr><td>${h.name}</td><td>${h.date}</td><td>${fmtPct(h.meta)}</td><td>${fmtPct(avgProgress)}</td>
              <td><span class="badge ${cls}">${h.sit}</span></td>
              <td style="font-size:12px;color:var(--gray-600)">${h.comment}</td></tr>`;
          }).join('')}
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <h2>Estado de Hitos</h2>
        <div class="chart-container"><canvas id="chartMilestones"></canvas></div>
      </div>
    </div>
  `;

  if (typeof Chart === 'undefined') {
    console.warn('Chart.js no disponible; los gráficos no se muestran.');
    return;
  }

  try {
    charts.progress = new Chart(document.getElementById('chartProgress'), {
      type:'bar',
      data:{ labels:accs.map(a=>a.name), datasets:[
        { label:'Avance', data:accs.map(a=>+(calcGlobal(a)*100).toFixed(1)), backgroundColor:'#2563eb', borderRadius:6 },
        { label:'Meta', data:accs.map(()=>+(calcMeta(state.controlDate)*100).toFixed(1)), backgroundColor:'#94a3b8', borderRadius:6 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        scales:{ y:{ beginAtZero:true, max:100, ticks:{ callback:v=>v+'%' } } },
        plugins:{
          legend:{ position:'bottom' },
          datalabels: { anchor: 'end', align: 'top', formatter: (val) => val > 0 ? val + '%' : '', font: { size: 10, weight: 'bold' }, color: '#374151' }
        }
      }
    });

    charts.status = new Chart(document.getElementById('chartStatus'), {
      type:'doughnut',
      data:{ labels:['Al día / En plazo','Atraso menor','Atraso crítico','Finalizado','Sin datos'], datasets:[{
        data:[counts['AL DÍA']+counts['EN PLAZO'],counts['ATRASO MENOR'],counts['ATRASO CRÍTICO']+counts['CRÍTICO'],counts.FINALIZADO,counts['SIN DATOS']],
        backgroundColor:['#16a34a','#f59e0b','#dc2626','#0d9488','#9ca3af'], borderWidth:0,
      }]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{ position:'bottom' },
          datalabels: { color: '#fff', font: { size: 12, weight: 'bold' }, formatter: (val) => val > 0 ? val : '' }
        }
      }
    });

    charts.milestones = new Chart(document.getElementById('chartMilestones'), {
      type:'doughnut',
      data:{ labels:['Cumplidos','Próximos','Pendientes'], datasets:[{
        data:[hitosCumplidos, hitosProximos, hitosPendientes],
        backgroundColor:['#16a34a', '#f59e0b', '#dc2626'], borderWidth:0,
      }]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{ position:'bottom' },
          datalabels: { color: '#fff', font: { size: 14, weight: 'bold' }, formatter: (val) => val > 0 ? val : '' }
        }
      }
    });
  } catch (e) { console.warn('Error al dibujar gráficos:', e); }
}

async function openImportModal(file) {
  const modal = document.getElementById('importModal'), body = document.getElementById('modalBody'), title = document.getElementById('modalTitle'), btnConfirm = document.getElementById('modalConfirm'), btnCancel = document.getElementById('modalCancel');
  title.textContent = `Analizando: ${file.name}`; body.innerHTML = '<div style="text-align:center;padding:30px">⏳ Procesando y auditando calidad...</div>'; modal.style.display = 'grid'; btnConfirm.disabled = true;
  
  try {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.getWorksheet('Data a llenar') || wb.worksheets[2] || wb.worksheets[0];
    
    let maxCol = 0;
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell, colNumber) => { if (cell.value && String(cell.value).trim() !== '') maxCol = Math.max(maxCol, colNumber); });
    if (maxCol < 32) maxCol = 45;

    let totalEquipos = 0, filledBase = 0, filledAgas = 0;
    let qaErrores = 0;
    let qaDetalles = [];
    const serialesUnicos = new Set();
    const baseCols = 32;

    for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const serial = row.getCell(1).value;
        
        if (!serial || String(serial).trim() === '') continue; 
        const serialStr = String(serial).trim();
        totalEquipos++;
        
        if (serialesUnicos.has(serialStr)) { 
            qaErrores++; 
            if(qaDetalles.length < 50) qaDetalles.push(`Serial duplicado: ${serialStr}`); 
        }
        serialesUnicos.add(serialStr);

        const email = row.getCell(17).value;
        if (email && !String(email).includes('@') && String(email) !== 'No Aplica' && String(email) !== 'No aplica') { 
            qaErrores++; 
            if(qaDetalles.length < 50) qaDetalles.push(`Email inválido en serial ${serialStr}: ${email}`); 
        }
        
        const ip = row.getCell(8).value;
        if (ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(String(ip)) && String(ip) !== '0.0.0.0' && String(ip) !== '1.1.1.1' && String(ip) !== 'No Aplica') { 
            qaErrores++; 
            if(qaDetalles.length < 50) qaDetalles.push(`IP inválida en serial ${serialStr}: ${ip}`); 
        }

        for (let c = 1; c <= baseCols; c++) { if (row.getCell(c).value != null && String(row.getCell(c).value).trim() !== '') filledBase++; }
        for (let c = baseCols + 1; c <= maxCol; c++) { if (row.getCell(c).value != null && String(row.getCell(c).value).trim() !== '') filledAgas++; }
    }

    const pctBase = totalEquipos > 0 ? (filledBase / (totalEquipos * baseCols)) : 0;
    const pctAgas = totalEquipos > 0 && maxCol > baseCols ? (filledAgas / (totalEquipos * (maxCol - baseCols))) : 0;
    const reviewBase = Math.round(totalEquipos * pctBase);
    const reviewAgas = Math.round(totalEquipos * pctAgas);
    
    const qaOk = Math.max(0, totalEquipos - qaErrores);

    let matchedId = ''; const fname = file.name.toLowerCase();
    for (const a of state.accounts) { if (fname.includes(a.name.toLowerCase().replace(/\s+/g, '_')) || fname.includes(a.id.toLowerCase())) { matchedId = a.id; break; } }

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr auto;gap:12px;margin-bottom:16px;font-size:14px">
        <span>Total equipos válidos</span><strong>${totalEquipos}</strong>
        <span>Madurez Col A-AF</span><strong>${(pctBase*100).toFixed(1)}% (${reviewBase} equipos eq.)</strong>
        <span>Madurez Col AG-AS</span><strong>${(pctAgas*100).toFixed(1)}% (${reviewAgas} equipos eq.)</strong>
        <span>QA Automático (Auditoría)</span><strong style="color:${qaErrores>0?'var(--danger)':'var(--success)'}">${qaOk} OK / ${qaErrores} errores</strong>
      </div>
      ${qaErrores > 0 ? `<div style="background:#fef2f2;color:#991b1b;padding:10px;border-radius:6px;font-size:12px;margin-bottom:16px;max-height:120px;overflow-y:auto"><strong>⚠ Errores detectados:</strong><ul style="margin:4px 0 0 16px;padding:0">${qaDetalles.slice(0, 10).map(d => `<li>${d}</li>`).join('')}</ul>${qaDetalles.length > 10 ? `<i>... y más errores guardados para el Dashboard.</i>` : ''}</div>` : ''}
      <div style="background:#eff6ff;padding:12px;border-radius:8px;margin-bottom:16px">
        <select id="importTargetAccount" style="width:100%;padding:10px;">
          <option value="">-- Seleccionar Cuenta --</option>
          ${state.accounts.map(a => `<option value="${a.id}" ${a.id === matchedId ? 'selected' : ''}>${a.name} (Avance actual: ${fmtPct(calcGlobal(a))})</option>`).join('')}
        </select>
      </div>`;
      
    btnConfirm.disabled = false;
    btnConfirm.onclick = () => {
      const accId = document.getElementById('importTargetAccount').value; 
      if (!accId) { toast('Seleccioná cuenta'); return; }
      const acc = state.accounts.find(a => a.id === accId);
      
      const isBetter = (totalEquipos > acc.total) || (reviewBase > acc.baseCount) || (reviewAgas > acc.agasCount) || (qaOk > acc.qaCount);

      if (isBetter) {
          acc.total = totalEquipos; 
          acc.reviewed = totalEquipos;
          acc.baseCount = reviewBase;
          acc.agasCount = reviewAgas;
          acc.qaCount = qaOk;
          acc.updateDate = state.controlDate;
          acc.qaDetails = qaDetalles;
          saveState(); modal.style.display = 'none'; render(); 
          toast(`✓ ${acc.name} actualizada (QA: ${qaOk})`);
      } else {
          modal.style.display = 'none';
          toast(`⚠ Archivo ignorado: El avance en el sistema es mayor o igual.`);
      }
    };
  } catch (err) { body.innerHTML = `<div style="color:red;padding:20px">Error: ${err.message}</div>`; }
  btnCancel.onclick = () => { modal.style.display = 'none'; };
}

function renderPlan(app) {
  const week = getCurrentWeek(state.controlDate);
  const isPrep = isPreparationPhase(state.controlDate);
  const prepDone = state.accounts.filter(a => a.responsible && a.total > 0).length;
  const avg = state.accounts.reduce((s,a)=>s+calcGlobal(a),0)/state.accounts.length;

  const sorted = [...state.accounts].sort((a,b)=>{const p={'ATRASO CRÍTICO':0,'CRÍTICO':0,'ATRASO MENOR':1,'EN PLAZO':2,'AL DÍA':3,'FINALIZADO':4,'SIN DATOS':5}; return (p[calcStatus(a)]??6)-(p[calcStatus(b)]??6);});
   
  app.innerHTML = `
    <div class="card plan-header"><div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:20px;"><div><div class="week-badge">${week.name} · ${week.period}</div><h2 style="font-size:22px;margin-top:10px;">Foco: ${week.focus}</h2><p class="help">${isPrep ? `Prep: ${prepDone}/12 cuentas` : `Meta: ${fmtPct(week.meta)}`}</p></div><div style="text-align:right"><div style="font-size:32px;font-weight:700;color:var(--primary);">${fmtPct(avg)}</div><div class="help">Avance prom.</div></div></div></div>
    ${isPrep ? `<div class="card"><h2>Preparación</h2><div class="prep-grid">${state.accounts.map(a=>{const ok=a.responsible&&a.total>0;return `<div class="prep-item ${ok?'ok':'pending'}" data-meeting="${a.id}"><div class="prep-icon">${ok?'✓':'○'}</div><div style="flex:1"><strong>${a.name}</strong><div class="help">${ok?a.responsible:'Pendiente'}</div></div><button class="btn btn-sm btn-primary">✎ Editar</button></div>`;}).join('')}</div></div>` 
    : `<div class="card"><h2>Reuniones prioritarias</h2><div class="reunion-list">${sorted.map(a=>{const st=calcStatus(a),g=calcGlobal(a),gap=calcGap(a);return `<div class="reunion-item"><div><span class="badge ${statusClass(st)}">${st}</span></div><div><strong>${a.name}</strong><div class="help">${a.responsible} · ${a.total} equipos</div></div><div class="reunion-metrics"><div><strong>${fmtPct(g)}</strong><div class="help">Global</div></div><div style="color:${gap<0?'var(--danger)':'var(--success)'}"><strong>${(gap*100).toFixed(1)}</strong><div class="help">Brecha</div></div></div><div><button class="btn btn-primary" data-meeting="${a.id}">Reunión →</button></div></div>`;}).join('')}</div></div>`}
  `;
  app.querySelectorAll('[data-meeting]').forEach(b=>b.addEventListener('click',()=>openReunionModal(b.dataset.meeting)));
}

function renderAccounts(app) {
  const warnings = validateAll();
  const lastSnap = getLastSnapshotByAccount();
  
  app.innerHTML = `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div><h2>Inventario por Cuenta</h2><p class="help">Los % se calculan solos.</p></div><button class="btn btn-primary" id="btnImportOSA">📂 Importar Excel OSA</button></div>
    <div class="table-wrap"><table><thead><tr><th>Cuenta</th><th>OSAs</th><th>Responsable</th><th>Total</th><th>Revisados</th><th>% Base Col A-AF</th><th>AG-AS</th><th>QA</th><th>Global</th><th>Estado</th><th>Bloqueo</th><th>Acción</th></tr></thead><tbody id="accountsBody"></tbody></table></div>
  </div>`;
  
  const tbody = document.getElementById('accountsBody');
  tbody.innerHTML = state.accounts.map(a => {
    const g=calcGlobal(a), st=calcStatus(a);
    const w = warnings.filter(x=>x.accountId===a.id);
    const hasQA = a.qaDetails && a.qaDetails.length > 0;
    return `<tr data-id="${a.id}" style="${w.length?'background:#fffbeb; border-left: 4px solid #f59e0b;':''}">
      <td><strong>${a.name}</strong>${hasQA ? `<button class="btn-qa-warning" data-qa="${a.id}" title="Ver ${a.qaDetails.length} error(es) QA detectado(s)" style="background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;border-radius:6px;padding:2px 6px;font-size:12px;margin-left:6px;cursor:pointer;font-weight:bold;line-height:1;">⚠️ ${a.qaDetails.length}</button>` : ''}</td>
      <td><input type="number" min="0" value="${a.osas}" data-field="osas"></td><td><input type="text" value="${a.responsible}" data-field="responsible"></td>
      <td><input type="number" min="0" value="${a.total}" data-field="total"></td><td><input type="number" min="0" value="${a.reviewed}" data-field="reviewed"></td>
      <td><input type="number" min="0" value="${a.baseCount}" data-field="baseCount"></td><td><input type="number" min="0" value="${a.agasCount}" data-field="agasCount"></td><td><input type="number" min="0" value="${a.qaCount}" data-field="qaCount"></td>
      <td><strong>${fmtPct(g)}</strong></td><td><span class="badge ${statusClass(st)}">${st}</span></td>
      <td><input type="checkbox" ${a.criticalBlock?'checked':''} data-field="criticalBlock"></td>
      <td><button class="btn btn-sm btn-danger" data-reset="${a.id}" title="Borrar carga de esta cuenta">🗑️</button></td>
    </tr>`;
  }).join('');
  
  tbody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', e => {
      const tr = e.target.closest('tr'), acc = state.accounts.find(a=>a.id===tr.dataset.id), f = e.target.dataset.field;
      let v = e.target.value;
      if (e.target.type==='checkbox') v = e.target.checked;
      else if (e.target.type==='number') {
        v = Math.max(0, Math.floor(Number(v)) || 0);
        if (f==='total' && v < acc.reviewed) { toast('Total < Revisados'); e.target.value = acc.total; return; }
        if (f==='reviewed' && (v > acc.total || v < acc.baseCount)) { toast('Revisados inválido'); e.target.value = acc.reviewed; return; }
        if (f==='baseCount' && (v > acc.reviewed || v < acc.agasCount)) { toast('Base inválida'); e.target.value = acc.baseCount; return; }
        if (f==='agasCount' && (v > acc.baseCount || v < acc.qaCount)) { toast('AG-AS inválido'); e.target.value = acc.agasCount; return; }
        if (f==='qaCount' && v > acc.agasCount) { toast('QA > AG-AS'); e.target.value = acc.qaCount; return; }
      }
      acc[f] = v; if (!acc.updateDate && ['reviewed','baseCount','agasCount','qaCount'].includes(f)) acc.updateDate = state.controlDate;
      saveState(); render();
    });
  });

  tbody.querySelectorAll('[data-qa]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const accId = e.currentTarget.dataset.qa;
      const acc = state.accounts.find(a => a.id === accId);
      if (acc && acc.qaDetails && acc.qaDetails.length > 0) openQAAlertsModal(acc.name);
    });
  });

  tbody.querySelectorAll('[data-reset]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const accId = e.target.dataset.reset;
      const acc = state.accounts.find(a => a.id === accId);
      if (!confirm(`¿Borrar todos los datos cargados de la cuenta ${acc.name}?`)) return;
      acc.total = 0; acc.reviewed = 0; acc.baseCount = 0; acc.agasCount = 0; acc.qaCount = 0;
      acc.updateDate = '';
      saveState(); render();
      toast(`Datos de ${acc.name} eliminados`);
    });
  });

  document.getElementById('btnImportOSA').addEventListener('click', () => {
    if (typeof ExcelJS === 'undefined') { toast('ExcelJS no cargó'); return; }
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.xlsx,.xls';
    input.onchange = e => { const f = e.target.files[0]; if (f) setTimeout(() => openImportModal(f), 100); };
    input.click();
  });
}

function openReunionModal(accountId) {
  const acc = state.accounts.find(a=>a.id===accountId), st = calcStatus(acc), g = calcGlobal(acc), m = calcMeta(state.controlDate), gap = g - m;
  const modal = document.getElementById('reunionModal'), body = document.getElementById('reunionBody');
  body.innerHTML = `<div class="reunion-header"><div><h2 style="margin:0">${acc.name}</h2><p class="help">${acc.responsible} · ${acc.total} equipos</p></div><span class="badge ${statusClass(st)}">${st}</span></div>
    <div class="form-grid" style="margin-top:20px"><div><label>Total</label><input type="number" id="rm-total" value="${acc.total}"></div><div><label>Revisados</label><input type="number" id="rm-reviewed" value="${acc.reviewed}"></div><div><label>Base</label><input type="number" id="rm-base" value="${acc.baseCount}"></div><div><label>AG-AS</label><input type="number" id="rm-agas" value="${acc.agasCount}"></div><div><label>QA</label><input type="number" id="rm-qa" value="${acc.qaCount}"></div></div>
    <h3 style="margin-top:20px">Bloqueo</h3><div class="form-grid"><div style="grid-column:1/-1"><label><input type="checkbox" id="rm-block" ${acc.criticalBlock?'checked':''}> Bloqueo crítico</label></div><div style="grid-column:1/-1"><label>Detalle</label><input type="text" id="rm-blockdetail" value="${acc.blockDetail||''}"></div><div><label>Próx. Acción</label><input type="text" id="rm-nextaction" value="${acc.nextAction||''}"></div><div><label>Responsable</label><input type="text" id="rm-actionresp" value="${acc.actionResponsible||''}"></div><div><label>Fecha Comp.</label><input type="date" id="rm-commitment" value="${acc.commitmentDate||''}"></div></div>
    <div class="modal-actions" style="margin-top:20px"><button class="btn" id="rm-cancel">Cerrar</button><button class="btn btn-primary" id="rm-save">Guardar corte</button></div>`;
  modal.style.display = 'grid';
  document.getElementById('rm-cancel').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('rm-save').onclick = () => {
    const t=Math.max(0,parseInt(document.getElementById('rm-total').value)||0), r=Math.max(0,parseInt(document.getElementById('rm-reviewed').value)||0), b=Math.max(0,parseInt(document.getElementById('rm-base').value)||0), ag=Math.max(0,parseInt(document.getElementById('rm-agas').value)||0), q=Math.max(0,parseInt(document.getElementById('rm-qa').value)||0), cb=document.getElementById('rm-block').checked, na=document.getElementById('rm-nextaction').value.trim(), cd=document.getElementById('rm-commitment').value;
    if (r>t || b>r || ag>b || q>ag) { toast('Jerarquía inválida: Total ≥ Revisados ≥ Base ≥ AG-AS ≥ QA'); return; }
    if (cb && (!na || !cd)) { toast('Bloqueo requiere acción y fecha'); return; }
    acc.total=t; acc.reviewed=r; acc.baseCount=b; acc.agasCount=ag; acc.qaCount=q; acc.criticalBlock=cb; acc.blockDetail=document.getElementById('rm-blockdetail').value; acc.nextAction=na; acc.actionResponsible=document.getElementById('rm-actionresp').value; acc.commitmentDate=cd; acc.updateDate=state.controlDate;
    if (cb && acc.blockDetail && !state.risks.find(rx => rx.account === acc.name && rx.status !== 'Cerrado')) { state.risks.push({ id: nextRiskId(), meetingDate: state.controlDate, account: acc.name, category: 'Plazo', detail: acc.blockDetail, impact: 'Alto', responsible: acc.actionResponsible, commitmentDate: acc.commitmentDate, status: 'Abierto', closure: '' }); }
    state.history.push({ date: state.controlDate, account: acc.name, osas: acc.osas, total: acc.total, reviewed: acc.reviewed, baseCount: acc.baseCount, agasCount: acc.agasCount, qaCount: acc.qaCount, pctBase: pctBase(acc), pctAGAS: pctAGAS(acc), pctQA: pctQA(acc), global: calcGlobal(acc), status: calcStatus(acc), comment: acc.observations });
    saveState(); modal.style.display = 'none'; render(); toast('Corte guardado');
  };
}

function renderGantt(app) {
  const dates = []; let curr = new Date('2026-10-29T00:00:00'), end = new Date('2026-11-30T00:00:00');
  while (curr <= end) { dates.push(curr.toISOString().slice(0,10)); curr.setDate(curr.getDate() + 1); }
  let html = `<div class="card"><h2>Gantt</h2><div class="gantt-container"><table class="gantt-table"><thead><tr><th class="col-left">Cuenta</th><th>Fase</th>${dates.map(d => `<th class="gantt-day-header"><span>${d.slice(5)}</span></th>`).join('')}</tr></thead><tbody>`;
  state.accounts.forEach(a => { GANTT_PHASES.forEach((ph, idx) => { html += `<tr><td class="col-left">${idx===0?a.name:''}</td><td class="col-left">${ph.name}</td>${dates.map(d => `<td>${(d >= ph.start && d <= ph.end) ? `<div style="background:${ph.color};height:20px"></div>` : ''}</td>`).join('')}</tr>`; }); });
  html += `</tbody></table></div></div>`; app.innerHTML = html;
}

function renderRisks(app) {
  if (!state.risks.length) { state.risks.push({ id:'A-001', meetingDate:'2026-10-30', account:'Todas', category:'Plazo', detail:'Inicio', impact:'Bajo', responsible:'Supervisor', commitmentDate:'2026-11-03', status:'En gestión', closure:'' }); saveState(); }
  app.innerHTML = `<div class="card"><div style="display:flex;justify-content:space-between;margin-bottom:16px"><h2>Riesgos</h2><button class="btn btn-primary" id="btnAddRisk">+ Nuevo</button></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Cuenta</th><th>Detalle</th><th>Compromiso</th><th>Estado</th><th>Semáforo</th><th></th></tr></thead><tbody id="risksBody"></tbody></table></div></div>`;
  document.getElementById('risksBody').innerHTML = state.risks.map((r,i)=>{ const sem = calcRiskSemaphore(r); return `<tr><td><strong>${r.id}</strong></td><td><input type="text" value="${r.account||''}" data-field="account"></td><td><input type="text" value="${r.detail||''}" data-field="detail"></td><td><input type="date" value="${r.commitmentDate||''}" data-field="commitmentDate"></td><td><select data-field="status">${['Abierto','En gestión','Cerrado'].map(c=>`<option ${r.status===c?'selected':''}>${c}</option>`).join('')}</select></td><td>${sem}</td><td><button class="btn-ghost" data-del="${i}">✕</button></td></tr>`; }).join('');
  document.querySelectorAll('#risksBody input, #risksBody select').forEach(inp=>{ inp.addEventListener('change',e=>{ state.risks[+e.target.closest('tr').rowIndex-1][e.target.dataset.field] = e.target.value; saveState(); render(); }); });
  document.querySelectorAll('[data-del]').forEach(b=>{ b.addEventListener('click',e=>{ state.risks.splice(+e.target.dataset.del,1); saveState(); render(); }); });
  document.getElementById('btnAddRisk').addEventListener('click',()=>{ state.risks.push({ id: nextRiskId(), meetingDate:state.controlDate, account:'', category:'Otro', detail:'', impact:'Bajo', responsible:'', commitmentDate:'', status:'Abierto', closure:'' }); saveState(); render(); });
}

function renderHistory(app) {
  const sorted = [...state.history].sort((a,b)=>b.date.localeCompare(a.date));
  
  const byDate = {};
  state.history.forEach(h => {
    if (!byDate[h.date]) byDate[h.date] = [];
    byDate[h.date].push(h.global);
  });
  const evoDates = Object.keys(byDate).sort();
  const evoValues = evoDates.map(d => +(byDate[d].reduce((s,v) => s + v, 0) / byDate[d].length * 100).toFixed(1));
  
  app.innerHTML = `<div class="card">
    <div style="display:flex;justify-content:space-between;margin-bottom:16px"><h2>Historial</h2><button class="btn btn-primary" id="btnSnap2">+ Corte semanal</button></div>
    ${sorted.length===0 
      ? '<div class="empty">Sin cortes registrados. Usá "+ Corte semanal" para guardar el primero.</div>' 
      : `<div style="margin-bottom:20px">
          <h3 style="margin:0 0 12px 0;font-size:15px;color:var(--gray-700)">📈 Evolución del Avance Global Promedio</h3>
          <div class="chart-container"><canvas id="chartEvoHistory"></canvas></div>
        </div>
        <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Cuenta</th><th>Global</th><th>Estado</th></tr></thead><tbody>${sorted.map(h=>`<tr><td>${h.date}</td><td>${h.account}</td><td>${fmtPct(h.global)}</td><td><span class="badge ${statusClass(h.status)}">${h.status}</span></td></tr>`).join('')}</tbody></table></div>`}
  </div>`;
  
  document.getElementById('btnSnap2').addEventListener('click', takeSnapshot);
  
  if (evoDates.length > 0 && typeof Chart !== 'undefined') {
    try {
      const canvas = document.getElementById('chartEvoHistory');
      if (canvas) {
        charts.evoHistory = new Chart(canvas, {
          type: 'line',
          data: {
            labels: evoDates.map(d => {
              const parts = d.split('-');
              return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
            }),
            datasets: [{
              label: 'Avance Global Promedio (%)',
              data: evoValues,
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37, 99, 235, 0.1)',
              fill: true,
              tension: 0.3,
              pointRadius: 5,
              pointBackgroundColor: '#2563eb',
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
              borderWidth: 3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom' },
              datalabels: {
                anchor: 'top',
                align: 'top',
                formatter: (val) => val + '%',
                font: { size: 11, weight: 'bold' },
                color: '#1e293b'
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                ticks: { callback: v => v + '%' }
              },
              x: {
                title: { display: true, text: 'Fecha del corte' }
              }
            }
          }
        });
      }
    } catch (e) { console.warn('Error al dibujar gráfico de evolución:', e); }
  }
}

function renderSchedule(app) {
  app.innerHTML = `<div class="card"><h2>Cronograma semanal</h2><div class="table-wrap"><table><thead><tr><th>Semana</th><th>Periodo</th><th>Fase</th><th>OSA</th><th>Supervisor</th><th>Entregable</th><th>Meta</th></tr></thead><tbody>${SCHEDULE.map(s=>`<tr><td><strong>${s.week}</strong></td><td>${s.period}</td><td>${s.phase}</td><td style="font-size:12px">${s.osaAction}</td><td style="font-size:12px">${s.supAction}</td><td style="font-size:12px">${s.deliverable}</td><td><span class="badge badge-sin-fecha" style="background:var(--primary);color:#fff">${fmtPct(s.meta)}</span></td></tr>`).join('')}</tbody></table></div></div>`;
}

async function renderBackups(app) {
  const status = getBackupStatus(); let snapshots = []; try { snapshots = await dbAll(STORE_SNAPSHOTS); } catch (e) {}
  const recent = snapshots.slice(-20).reverse(), hasFile = !!fileHandle;
  
  app.innerHTML = `<div class="backup-hero"><h2>🛡 Sistema de respaldo</h2><div class="backup-grid"><div class="backup-card ok"><div class="label">Capa 1 · localStorage</div><div class="value">✓ Activo</div></div><div class="backup-card ok"><div class="label">Capa 2 · IndexedDB</div><div class="value">✓ Activo</div></div><div class="backup-card ok"><div class="label">Capa 3 · Snapshots</div><div class="value">${snapshots.length} versiones</div></div><div class="backup-card ${hasFile?'ok':'warn'}"><div class="label">Capa 4 · Carpeta</div><div class="value">${hasFile?'✓ Configurada':'⚠ No configurada'}</div></div><div class="backup-card ok"><div class="label">Capa 5 · Descarga JSON</div><div class="value">✓ Disponible</div></div></div></div>
    
    <div class="card" style="border-left:4px solid var(--${status.level})"><h2>Estado: ${status.msg}</h2><p class="help">${status.long}</p>${!hasFile ? `<div style="margin-top:16px;padding:16px;background:#fffbeb;border-radius:8px"><button class="btn btn-primary" id="btnPickFolder">📁 Elegir carpeta de respaldo</button></div>` : ''}</div>
    
    <div class="card">
      <div style="display:flex;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <h2 style="margin:0">Máquina del tiempo · ${snapshots.length} versiones</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="btnExportNow">⬇ JSON ahora</button>
          <button class="btn btn-primary" id="btnImportRestore">⬆ Restaurar</button>
          <button class="btn btn-danger" id="btnDeleteAllSnapshots" ${snapshots.length === 0 ? 'disabled' : ''}>🗑️ Borrar todos</button>
        </div>
      </div>
      ${recent.length === 0 ? '<div class="empty">Sin versiones</div>' : `<div class="snapshot-list">${recent.map(s => `<div class="snapshot-item"><div><div class="snapshot-date">${new Date(s.date).toLocaleString('es-CL')}</div></div><button class="btn btn-sm" data-restore="${s.id}">Restaurar</button><button class="btn-del-snap" data-del="${s.id}">🗑️ Eliminar</button></div>`).join('')}</div>`}
    </div>`;
    
  document.getElementById('btnPickFolder')?.addEventListener('click', pickBackupFolder);
  document.getElementById('btnExportNow')?.addEventListener('click', () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); download(blob, `mps_backup.json`); });
  document.getElementById('btnImportRestore')?.addEventListener('click', () => { const input = document.createElement('input'); input.type='file'; input.accept='.json'; input.onchange=async e=>{ const f=e.target.files[0]; if(!f)return; const txt=await f.text(); try{ const data=JSON.parse(txt); if(!data.accounts)throw new Error('Inválido'); if(!confirm('¿Reemplazar datos?'))return; await addSnapshot(state); state=data; await dbPut(STORE_CURRENT,'current',state); saveState(); render(); }catch(err){toast('Error');} }; input.click(); });
  
  document.getElementById('btnDeleteAllSnapshots')?.addEventListener('click', async () => {
    if (!confirm('¿Estás seguro de eliminar TODOS los respaldos de la máquina del tiempo? Esta acción no se puede deshacer.')) return;
    try {
      const all = await dbAll(STORE_SNAPSHOTS);
      for (const s of all) { await dbDelete(STORE_SNAPSHOTS, s.id); }
      toast('✓ Todos los respaldos eliminados');
      render();
    } catch (e) { toast('Error al eliminar respaldos'); }
  });

  app.querySelectorAll('[data-restore]').forEach(btn => { btn.addEventListener('click', async () => { const snap = snapshots.find(s => s.id === +btn.dataset.restore); if (!snap) return; if (!confirm('¿Restaurar?')) return; await addSnapshot(state); state = JSON.parse(JSON.stringify(snap.state)); await dbPut(STORE_CURRENT, 'current', state); saveState(); render(); }); });
  app.querySelectorAll('[data-del]').forEach(btn => { btn.addEventListener('click', async () => { if (!confirm('¿Eliminar?')) return; await dbDelete(STORE_SNAPSHOTS, +btn.dataset.del); render(); }); });
}

function renderInstructions(app) {
  app.innerHTML = `
    <div class="card">
      <h2>📖 Guía del Sistema · Control Proyecto Inventarios MPS 2026</h2>
      <p class="help" style="margin-bottom:20px">Esta guía detalla el objetivo del proyecto, la función de cada pestaña y el procedimiento paso a paso para que cualquier persona pueda operar la aplicación sin depender de un experto.</p>

      <div class="instruction-step" style="border-left-color: #2563eb;">
        <h4>Objetivo del Proyecto</h4>
        <p>Este sistema controla la implementación del nuevo formato de inventario en las 12 cuentas del área MPS (Servicio de Impresión Gestionado). Cada OSA (Operador de Servicio) completa su archivo individual de inventario. El supervisor (tú) actualiza este control en las reuniones de seguimiento, registra bloqueos y presenta el avance al mandante.</p>
        <p><strong>Cierre comprometido:</strong> 30-11-2026.</p>
      </div>

      <div class="instruction-step">
        <h4>¿Qué hace cada parte del sitio?</h4>
        <ul>
          <li><strong>Dashboard:</strong> Vista ejecutiva. Muestra los KPIs (tarjetas), gráficos de avance vs meta, distribución de estados y los hitos del proyecto. Incluye un Centro de Alertas unificado. No se edita manualmente; se alimenta de las demás pestañas.</li>
          <li><strong>Plan Semanal:</strong> Te indica en qué semana del cronograma estás, cuál es el foco actual (ej: Levantamiento A-AF) y te muestra las reuniones prioritarias ordenadas por criticidad (las rojas primero).</li>
          <li><strong>Inventario Cuentas:</strong> Es la hoja principal de carga. Aquí ingresas los datos de cada cuenta (Total equipos, Revisados, Base A-AF, AG-AS y QA), registras bloqueos y observaciones. Si la cuenta tiene errores QA detectados por la auditoría del Excel, verás un botón ⚠️ junto a su nombre para ver el detalle y descargar los errores.</li>
          <li><strong>Gantt:</strong> Muestra la línea de tiempo comprometida para cada cuenta y fase, con vista de días para ver la evolución temporal.</li>
          <li><strong>Acuerdos y Riesgos:</strong> Registro formal de bloqueos, decisiones y compromisos. Cada registro tiene un responsable y una fecha de vencimiento con semáforo automático.</li>
          <li><strong>Historial:</strong> Conserva una "foto" (snapshot) del avance de cada cuenta en cada reunión. Incluye un gráfico de línea con la evolución del avance global promedio en el tiempo.</li>
          <li><strong>Cronograma:</strong> Pauta detallada de las actividades esperadas por semana, entregables, evidencias y riesgos a controlar.</li>
          <li><strong>Respaldos:</strong> Sistema de 5 capas de seguridad (LocalStorage, IndexedDB, Snapshots, Carpeta Local y Descarga JSON) para no perder nunca la información.</li>
          <li><strong>Configuración:</strong> Ajustes de la fecha de control, exportación de datos y reinicio del sistema.</li>
        </ul>
      </div>

      <div class="instruction-step" style="border-left-color: #16a34a;">
        <h4>Reglas del Semáforo (Estados)</h4>
        <p>El estado se calcula automáticamente según el avance global vs la meta a la fecha:</p>
        <ul>
          <li><span class="badge badge-verde">AL DÍA</span> Cumple o supera la meta correspondiente a la fecha de control.</li>
          <li><span class="badge badge-ambar">ATRASO MENOR</span> Está hasta 10 puntos porcentuales por debajo de la meta.</li>
          <li><span class="badge badge-rojo">ATRASO CRÍTICO</span> Está a más de 10 puntos por debajo de la meta o posee un bloqueo crítico.</li>
          <li><span class="badge badge-finalizado">FINALIZADO</span> El avance global ha llegado al 100%.</li>
          <li><span class="badge badge-sin-fecha">SIN DATOS</span> No hay información cargada para esa cuenta.</li>
        </ul>
        <p><em>El avance global se calcula con la ponderación: 45% Base A-AF + 35% AG-AS + 20% QA.</em></p>
      </div>

      <div class="instruction-step">
        <h4>Cómo actualizar el libro en menos de 5 minutos</h4>
        <p><strong>Opción A: Registro Manual (Reunión con el OSA)</strong></p>
        <ol style="padding-left: 24px; font-size: 14px; color: var(--gray-700); margin-bottom: 16px;">
          <li>Ve a <strong>Plan Semanal</strong> (o <strong>Inventario Cuentas</strong>) y haz clic en la fila/tarjeta de la cuenta que vas a revisar.</li>
          <li>En la ventana que se abre, ingresa las cantidades exactas dictadas por el OSA (Total, Revisados, Base, AG-AS, QA).</li>
          <li>Si hay un bloqueo, márcalo y describe la próxima acción, responsable y fecha compromiso.</li>
          <li>Haz clic en <strong>"Guardar corte de esta cuenta"</strong>. Los porcentajes y el semáforo se calculan solos.</li>
        </ol>
        <p><strong>Opción B: Carga desde Excel del OSA</strong></p>
        <ol style="padding-left: 24px; font-size: 14px; color: var(--gray-700);">
          <li>Ve a <strong>Inventario Cuentas</strong> y haz clic en <strong>"📂 Importar Excel de OSA"</strong>.</li>
          <li>Selecciona el archivo del OSA. El sistema contará automáticamente cuántos equipos tienen la Base (32 columnas) y AG-AS (13 columnas) completas.</li>
          <li>💡 <strong>Truco:</strong> Si el archivo incluye el nombre de la cuenta en su nombre (ej: <em>FASA_Inventario_Octubre.xlsx</em>), el sistema <strong>seleccionará la cuenta automáticamente</strong>. De lo contrario, elígela manualmente del menú desplegable y haz clic en Aplicar.</li>
        </ol>
      </div>

      <div class="instruction-step" style="border-left-color: #f59e0b;">
        <h4>Controles antes de presentar al mandante</h4>
        <p>Antes de guardar el corte semanal y exportar a Excel, asegúrate de:</p>
        <ul>
          <li>✓ Confirmar que todas las cuentas tengan la fecha de último reporte actualizada.</li>
          <li>✓ Validar que "Equipos revisados" no supere el "Total equipos".</li>
          <li>✓ Revisar que no haya celdas rojas sin justificación en las observaciones.</li>
          <li>✓ Verificar que cada bloqueo tenga próxima acción, responsable y fecha compromiso.</li>
          <li>✓ Usar la Gantt como planificación y el Dashboard/Inventario Cuentas como evidencia del avance real.</li>
          <li>✓ Guardar el corte en Historial y descargar el Excel para enviar por correo.</li>
        </ul>
      </div>
    </div>
  `;
}

function renderSettings(app) {
  app.innerHTML = `<div class="card"><h2>Configuración</h2><div class="form-grid" style="margin-bottom:20px"><div><label>Fecha de control</label><input type="date" id="setControlDate" value="${state.controlDate}"></div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary" id="btnExportJSON">⬇ JSON</button><button class="btn" id="btnImportJSON">⬆ Importar JSON</button><button class="btn" id="btnExportCSV">⬇ CSV</button><button class="btn btn-danger" id="btnReset">🔄 Reiniciar</button></div><input type="file" id="fileImport" accept="application/json" hidden></div>`;
  document.getElementById('setControlDate').addEventListener('change',e=>{ state.controlDate=e.target.value; saveState(); render(); });
  document.getElementById('btnExportJSON').addEventListener('click',()=>{ download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}), `mps.json`); });
  document.getElementById('btnImportJSON').addEventListener('click',()=>document.getElementById('fileImport').click());
  document.getElementById('fileImport').addEventListener('change',e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>{ try{const d=JSON.parse(ev.target.result); if(!d.accounts)throw new Error(); state=d; saveState(); render();}catch(err){alert('Error');} }; r.readAsText(f); });
  document.getElementById('btnExportCSV').addEventListener('click',()=>{ const h=['Cuenta','Total','Revisados']; const rows=state.accounts.map(a=>[a.name,a.total,a.reviewed]); const csv=[h,...rows].map(r=>r.join(',')).join('\n'); download(new Blob([csv],{type:'text/csv'}), 'mps.csv'); });
  document.getElementById('btnReset').addEventListener('click',()=>{ if(!confirm('¿Borrar todo?'))return; state=getInitialState(); saveState(); render(); });
}

function generateChartImage(config) { 
  if (typeof Chart === 'undefined') return null; 
  const c = document.createElement('canvas'); 
  c.width = 900; c.height = 450; 
  const chart = new Chart(c, { ...config, plugins: [ChartDataLabels] }); 
  const url = chart.toBase64Image(); 
  chart.destroy(); 
  return url.split(',')[1]; 
}

async function exportToExcel() {
  if (typeof ExcelJS === 'undefined') { toast('ExcelJS no cargado. Revisá tu conexión.'); return; }
  toast('Generando Excel Ejecutivo con Hitos...');

  const accs = state.accounts;
  const totalOSAs = accs.reduce((s,a)=>s+(+a.osas||0),0);
  const avgProgress = accs.reduce((s,a)=>s+calcGlobal(a),0)/accs.length;
  const totalReviewed = accs.reduce((s,a)=>s+(+a.reviewed||0),0);

  const counts = { FINALIZADO:0, 'AL DÍA':0, 'EN PLAZO':0, 'ATRASO MENOR':0, 'ATRASO CRÍTICO':0, 'CRÍTICO':0, 'SIN DATOS':0 };
  accs.forEach(a=>counts[calcStatus(a)]++);
  const enRojo = counts['ATRASO CRÍTICO'] + counts['CRÍTICO'];

  const milestones = [
    {name:'Preparación', date:'2026-10-30', meta:0.10},
    {name:'Inventario base', date:'2026-11-06', meta:0.55},
    {name:'Corte AG-AS', date:'2026-11-13', meta:0.75},
    {name:'Cierre AG-AS', date:'2026-11-20', meta:0.90},
    {name:'QA', date:'2026-11-27', meta:0.98},
    {name:'Cierre', date:'2026-11-30', meta:1.00},
  ];
  let hitosCumplidos = 0, hitosProximos = 0, hitosPendientes = 0;

  const milestoneData = milestones.map(h => {
    let sit;
    if (state.controlDate < h.date) {
      sit = 'PRÓXIMO'; hitosProximos++;
    } else if (h.name === 'Preparación') {
      const pending = accs.filter(a => !(a.responsible && a.total > 0));
      if (pending.length === 0 || (pending.length === 1 && pending[0].id === 'provida')) {
        sit = 'CUMPLIDO'; hitosCumplidos++;
      } else {
        sit = 'PENDIENTE'; hitosPendientes++;
      }
    } else {
      if (avgProgress >= h.meta) { sit = 'CUMPLIDO'; hitosCumplidos++; } 
      else { sit = 'PENDIENTE'; hitosPendientes++; }
    }
    return { ...h, sit };
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Control Proyecto Inventarios MPS 2026';
  
  const colors = { darkBlue: 'FF1E3A8A', teal: 'FF0D9488', blue: 'FF2563EB', purple: 'FF8B5CF6', red: 'FFDC2626', green: 'FF16A34A', border: 'FFE2E8F0' };
  const borderStyle = { top: { style: 'thin', color: { argb: colors.border } }, left: { style: 'thin', color: { argb: colors.border } }, bottom: { style: 'thin', color: { argb: colors.border } }, right: { style: 'thin', color: { argb: colors.border } } };

  const ws = wb.addWorksheet('01_Dashboard', { views:[{showGridLines:false}], properties:{ tabColor:{argb: colors.teal} } });
  ws.columns = [{width:16},{width:10},{width:10},{width:10},{width:10},{width:10},{width:10},{width:10},{width:18},{width:12},{width:12},{width:12}];

  ws.mergeCells('A1:L2');
  const title = ws.getCell('A1');
  title.value = 'DASHBOARD EJECUTIVO DEL PROYECTO';
  title.font = { bold:true, size:18, color:{argb:'FFFFFFFF'} };
  title.fill = { type:'pattern', pattern:'solid', fgColor:{argb: colors.darkBlue} };
  title.alignment = { horizontal:'left', vertical:'middle' };
  ws.getRow(1).height = 30; ws.getRow(2).height = 30;

  ws.mergeCells('A3:L3');
  ws.getCell('A3').value = `Área MPS / Seguimiento de 12 cuentas / Cierre comprometido: 30-11-2026`;
  ws.getCell('A3').font = { size:10, color:{argb:'FF64748B'} };

  const kpis = [
    {label:'CUENTAS', value: 12, startCol: 1, color: colors.teal},
    {label:'OSAs', value: totalOSAs, startCol: 3, color: colors.blue},
    {label:'AVANCE PROMEDIO', value: fmtPct(avgProgress), startCol: 5, color: colors.purple},
    {label:'CUENTAS EN ROJO', value: enRojo, startCol: 7, color: colors.red},
    {label:'EQUIPOS REVISADOS', value: totalReviewed, startCol: 9, color: colors.green}
  ];

  kpis.forEach(k => {
    ws.mergeCells(5, k.startCol, 5, k.startCol + 1);
    const hc = ws.getCell(5, k.startCol);
    hc.value = k.label; hc.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.color } }; hc.alignment = { horizontal: 'center', vertical: 'middle' };
    
    ws.mergeCells(6, k.startCol, 7, k.startCol + 1);
    const vc = ws.getCell(6, k.startCol);
    vc.value = k.value; vc.font = { bold: true, size: 18, color: { argb: 'FF1E293B' } }; vc.alignment = { horizontal: 'center', vertical: 'middle' }; vc.border = borderStyle;
  });

  ws.mergeCells('A9:E9');
  ws.getCell('A9').value = 'Resumen por cuenta';
  ws.getCell('A9').font = { bold:true, size:12, color:{argb: colors.darkBlue} };
  
  const headers = ['Cuenta', 'OSAs', 'Revisados', 'Global', 'Estado'];
  headers.forEach((h, i) => {
    const c = ws.getCell(10, i + 1);
    c.value = h; c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.darkBlue } }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = borderStyle;
  });

  accs.forEach((a, i) => {
    const r = 11 + i; const g = calcGlobal(a), st = calcStatus(a); const row = ws.getRow(r);
    row.getCell(1).value = a.name; row.getCell(2).value = a.osas; row.getCell(3).value = a.reviewed; row.getCell(4).value = fmtPct(g); row.getCell(5).value = st;
    for (let c = 1; c <= 5; c++) { row.getCell(c).border = borderStyle; row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; }
    row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    
    const stCell = row.getCell(5);
    if (st === 'AL DÍA' || st === 'FINALIZADO' || st === 'EN PLAZO') { stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; stCell.font = { color: { argb: 'FF065F46' }, bold: true }; }
    else if (st === 'ATRASO MENOR') { stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; stCell.font = { color: { argb: 'FF92400E' }, bold: true }; }
    else { stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; stCell.font = { color: { argb: 'FF991B1B' }, bold: true }; }
  });

  const startRowHitos = 26;
  ws.mergeCells(`A${startRowHitos}:E${startRowHitos}`);
  ws.getCell(`A${startRowHitos}`).value = 'Hitos y metas';
  ws.getCell(`A${startRowHitos}`).font = { bold:true, size:12, color:{argb: colors.darkBlue} };

  const hitosHeaders = ['Hito', 'Fecha', 'Meta', 'Resultado', 'Situación'];
  hitosHeaders.forEach((h, i) => {
    const c = ws.getCell(startRowHitos + 1, i + 1);
    c.value = h; c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.darkBlue } }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = borderStyle;
  });

  milestoneData.forEach((h, i) => {
    const r = startRowHitos + 2 + i; const row = ws.getRow(r);
    row.getCell(1).value = h.name; row.getCell(2).value = h.date; row.getCell(3).value = fmtPct(h.meta); row.getCell(4).value = fmtPct(avgProgress); row.getCell(5).value = h.sit;
    for (let c = 1; c <= 5; c++) { row.getCell(c).border = borderStyle; row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; }
    row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    
    const sitCell = row.getCell(5);
    if (h.sit === 'CUMPLIDO') { sitCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; sitCell.font = { color: { argb: 'FF065F46' }, bold: true }; }
    else if (h.sit === 'PRÓXIMO') { sitCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; sitCell.font = { color: { argb: 'FF92400E' }, bold: true }; }
    else { sitCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; sitCell.font = { color: { argb: 'FF991B1B' }, bold: true }; }
  });

  const barImg = generateChartImage({
    type:'bar',
    data:{ labels:accs.map(a=>a.name), datasets:[{ label:'Avance', data:accs.map(a=>+(calcGlobal(a)*100).toFixed(1)), backgroundColor:'#2563eb' }]},
    options:{ responsive:false, animation:false, 
      plugins:{ 
        title:{display:true,text:'Avance global por cuenta',font:{size:14,weight:'bold'}}, 
        legend:{display:false},
        datalabels: { anchor: 'end', align: 'top', formatter: (val) => val > 0 ? val + '%' : '', font: { size: 10, weight: 'bold' }, color: '#1e293b' }
      }, 
      scales:{ y:{ beginAtZero:true, max:100 } } 
    },
  });
  if (barImg) ws.addImage(wb.addImage({base64:barImg,extension:'png'}), { tl:{col:6, row:9}, ext:{width:500,height:250} });

  const donaHitosImg = generateChartImage({
    type:'doughnut',
    data:{ labels:['Cumplidos','Próximos','Pendientes'], datasets:[{ data:[hitosCumplidos, hitosProximos, hitosPendientes], backgroundColor:['#16a34a', '#f59e0b', '#dc2626'] }]},
    options:{ responsive:false, animation:false, 
      layout: { padding: 20 },
      plugins:{ 
        title:{display:true,text:'Estado de Hitos',font:{size:14,weight:'bold'}}, 
        legend:{position:'right'},
        datalabels: { 
          color: '#fff', 
          font: { size: 16, weight: 'bold' },
          display: (context) => context.dataset.data[context.dataIndex] > 0,
          formatter: (val) => val 
        }
      } 
    },
  });
   
  if (donaHitosImg) ws.addImage(wb.addImage({base64:donaHitosImg,extension:'png'}), { tl:{col:6, row:startRowHitos}, ext:{width:450,height:250} });

  const wsA = wb.addWorksheet('02_Inventario', { properties:{ tabColor:{argb: colors.green} } });
  wsA.columns = [
    {header:'Cuenta',key:'name',width:22},{header:'OSAs',key:'osas',width:8},{header:'Responsable',key:'responsible',width:24},
    {header:'Total',key:'total',width:10},{header:'Revisados',key:'reviewed',width:12},{header:'Base ok',key:'baseCount',width:10},
    {header:'AG-AS ok',key:'agasCount',width:10},{header:'QA ok',key:'qaCount',width:10},
    {header:'Global',key:'global',width:12},{header:'Estado',key:'status',width:18},
  ];

  accs.forEach(a=>wsA.addRow({
    name:a.name, osas:a.osas, responsible:a.responsible, total:a.total, reviewed:a.reviewed,
    baseCount:a.baseCount, agasCount:a.agasCount, qaCount:a.qaCount,
    global:fmtPct(calcGlobal(a)), status:calcStatus(a)
  }));

  const hA = wsA.getRow(1);
  hA.eachCell(c => { c.font = {bold:true, color:{argb:'FFFFFFFF'}}; c.fill = { type:'pattern', pattern:'solid', fgColor:{argb: colors.darkBlue} }; c.alignment={horizontal:'center'}; });
  wsA.eachRow((row, r)=>{ if (r!==1) row.eachCell((cell) => { cell.border = borderStyle; }); });

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), `MPS_Ejecutivo_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('✓ Excel Ejecutivo generado con Hitos');
}

function download(blob, filename) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href); }
let toastTimer;
function toast(msg) { const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove('show'), 2400); }
function takeSnapshot() { const date = state.controlDate; state.accounts.forEach(a => { state.history.push({ date, account: a.name, osas: a.osas, total: a.total, reviewed: a.reviewed, baseCount: a.baseCount, agasCount: a.agasCount, qaCount: a.qaCount, pctBase: pctBase(a), pctAGAS: pctAGAS(a), pctQA: pctQA(a), global: calcGlobal(a), status: calcStatus(a), comment: a.observations||'' }); }); saveState(); toast(`Corte ${date} guardado`); if (currentView === 'history') render(); }

async function init() {
  state = await loadState(); 
  if (!state.controlDate) state.controlDate = new Date().toISOString().slice(0,10);
  
  const cd = document.getElementById('controlDate'); 
  if (cd) { 
    cd.value = state.controlDate; 
    cd.addEventListener('change', e => { state.controlDate = e.target.value; saveState(); render(); }); 
  }
  
  const nav = document.querySelector('.app-nav');
  const instrBtn = document.querySelector('.app-nav [data-view="instructions"]');
  if (nav && instrBtn) {
     nav.appendChild(instrBtn);
  }

  document.getElementById('btnSnapshot')?.addEventListener('click', takeSnapshot);
  document.getElementById('btnExportExcel')?.addEventListener('click', () => { exportToExcel().catch(err => toast('Error')); });
  
  document.querySelectorAll('.app-nav button').forEach(b => { 
    b.addEventListener('click', () => { 
      document.querySelectorAll('.app-nav button').forEach(x=>x.classList.remove('active')); 
      b.classList.add('active'); 
      currentView = b.dataset.view; 
      render(); 
      window.scrollTo({top:0,behavior:'smooth'}); 
    }); 
  });

  await restoreFileHandle(); 
  startAutoSave(); 
  setupUnloadWarning(); 
  updateBackupStatus(); 
  
  document.querySelectorAll('.app-nav button').forEach(x=>x.classList.remove('active'));
  document.querySelector('.app-nav button[data-view="dashboard"]')?.classList.add('active');
  
  render();
}
init();
// ========== FIN DEL ARCHIVO app.js ==========
