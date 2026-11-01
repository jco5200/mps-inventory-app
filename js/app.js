/* =============================================================
   CONTROL PROYECTO INVENTARIOS MPS 2026 - CÓDIGO COMPLETO
   Versión corregida: fixes de snapshots, semáforo de riesgos,
   debounce, IDs robustos, guards de librerías y backup-status.
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
  { week:'Inicio', period:'29-30 oct', phase:'Preparación y asignación',
    osaAction:'Revisar instrucciones, confirmar archivo, universo preliminar y responsable por cuenta.',
    supAction:'Distribuir formato, explicar criterios y resolver dudas iniciales.',
    deliverable:'Responsables confirmados y universo preliminar por cuenta.',
    meta:0.10,
    evidence:'Correo o acta de asignación; total preliminar de equipos.',
    risk:'Falta de responsable o universo desconocido.',
    meeting:'30-oct: control de inicio',
    responsible:'Supervisor + OSA', status:'Completado' },

  { week:'Semana 1', period:'02-06 nov', phase:'Levantamiento base columnas A-AF',
    osaAction:'Completar datos de identificación, red, ubicación, estado y datos base para todos los equipos.',
    supAction:'Revisar consistencia inicial y remover bloqueos de acceso o información.',
    deliverable:'Campos A-AF avanzados y primeras brechas documentadas.',
    meta:0.55,
    evidence:'Archivo OSA actualizado; conteo total y equipos revisados.',
    risk:'Bajo ritmo de levantamiento o diferencias en el universo.',
    meeting:'06-nov: primer corte formal',
    responsible:'OSA / Supervisor', status:'En curso' },

  { week:'Semana 2', period:'09-13 nov', phase:'Investigación columnas AG-AS, corte 1',
    osaAction:'Investigar los campos avanzados; registrar información disponible y documentar lo no aplicable.',
    supAction:'Verificar criterios, priorizar cuentas atrasadas y asignar acciones.',
    deliverable:'Primer corte AG-AS y pendientes identificados.',
    meta:0.75,
    evidence:'Listado de pendientes AG-AS; fuentes consultadas; responsables.',
    risk:'Dependencias de información y campos no aplicables sin justificación.',
    meeting:'13-nov: revisión de avance',
    responsible:'OSA / Supervisor', status:'Pendiente' },

  { week:'Semana 3', period:'16-20 nov', phase:'Cierre de investigación AG-AS',
    osaAction:'Completar investigación, resolver pendientes y actualizar excepciones.',
    supAction:'Validar evidencia y escalar bloqueos críticos.',
    deliverable:'AG-AS cerrado o excepciones formalmente documentadas.',
    meta:0.90,
    evidence:'Archivo actualizado; excepciones; acuerdos de cierre.',
    risk:'Pendientes sin responsable o evidencia insuficiente.',
    meeting:'20-nov: cierre AG-AS',
    responsible:'OSA / Supervisor', status:'Pendiente' },

  { week:'Semana 4', period:'23-27 nov', phase:'QA y correcciones',
    osaAction:'Corregir duplicados, vacíos, formatos e inconsistencias detectadas.',
    supAction:'Ejecutar control de calidad, muestreo y devolución de observaciones.',
    deliverable:'Inventario corregido y listo para cierre.',
    meta:0.98,
    evidence:'Checklist QA; observaciones resueltas; versión corregida.',
    risk:'Correcciones tardías o reincidencia de errores.',
    meeting:'27-nov: aprobación QA',
    responsible:'Supervisor + OSA', status:'Pendiente' },

  { week:'Cierre', period:'30 nov', phase:'Revisión final y Cierre',
    osaAction:'Entregar versión final y documentar pendientes excepcionales.',
    supAction:'Consolidar estado, preparar informe y cerrar compromisos.',
    deliverable:'Inventarios cerrados y estado final presentado.',
    meta:1.00,
    evidence:'Versión final; acta de cierre; pendientes excepcionales.',
    risk:'Pendientes sin aceptación o falta de evidencia final.',
    meeting:'30-nov: cierre del proyecto',
    responsible:'Supervisor', status:'Pendiente' },
];

let state = null;
let currentView = 'instructions';
let charts = {};

/* ========== SISTEMA DE RESPALDO (5 CAPAS) ========== */
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
  if (!window.showDirectoryPicker) {
    toast('Tu navegador no soporta guardado a carpeta. Usá Chrome, Edge u Opera.');
    return;
  }
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    await dbPut(STORE_CURRENT, 'dirHandle', dir);
    if (dir.requestPermission) { try { await dir.requestPermission({ mode: 'readwrite' }); } catch {} }
    fileHandle = await dir.getFileHandle('mps_backup.json', { create: true });
    await autoSaveToFile();
    toast('✓ Carpeta configurada: ' + dir.name);
    render();
  } catch (e) {
    if (e.name !== 'AbortError') toast('Error: ' + e.message);
  }
}
async function restoreFileHandle() {
  try {
    const dir = await dbGet(STORE_CURRENT, 'dirHandle');
    if (!dir) return;
    const perm = await dir.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      fileHandle = await dir.getFileHandle('mps_backup.json', { create: true });
    }
  } catch (e) { console.error(e); }
}
async function autoSaveToFile() {
  if (!fileHandle) return false;
  try {
    const w = await fileHandle.createWritable();
    await w.write(JSON.stringify(state, null, 2));
    await w.close();
    state._lastFileSave = new Date().toISOString();
    try {
      const dir = await dbGet(STORE_CURRENT, 'dirHandle');
      if (dir) {
        const day = new Date().toISOString().slice(0,10);
        const v = await dir.getFileHandle(`mps_backup_${day}.json`, { create: true });
        const w2 = await v.createWritable();
        await w2.write(JSON.stringify(state, null, 2));
        await w2.close();
      }
    } catch {}
    return true;
  } catch (e) { console.error('Auto-save falló:', e); return false; }
}
async function addSnapshot(snapState) {
  await dbPut(STORE_SNAPSHOTS, null, { date: new Date().toISOString(), state: JSON.parse(JSON.stringify(snapState)) });
  lastSnapTs = Date.now();
  const all = await dbAll(STORE_SNAPSHOTS);
  if (all.length > 200) {
    for (const s of all.slice(0, all.length - 200)) await dbDelete(STORE_SNAPSHOTS, s.id);
  }
}
async function maybeAutoSnapshot() {
  if (!state) return;
  if (lastSnapTs && (Date.now() - lastSnapTs) < 15 * 60 * 1000) return;
  try { await addSnapshot(state); } catch (e) { console.error('Auto-snapshot error:', e); }
}

function saveState() {
  state._lastSave = new Date().toISOString();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveStateFull().catch(e => console.error('Backup error:', e));
  }, 400);
}
async function saveStateFull() {
  state._lastSave = new Date().toISOString();
  await dbPut(STORE_CURRENT, 'current', state);
  await autoSaveToFile();
  updateBackupStatus();
}
async function loadState() {
  let dbState = null, lsState = null;
  try {
    const db = await dbGet(STORE_CURRENT, 'current');
    if (db && db.accounts) dbState = db;
  } catch(e) {}
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    if (r) { const p = JSON.parse(r); if (p.accounts) lsState = p; }
  } catch(e) {}
  if (dbState && lsState) {
    const dbTs = dbState._lastSave ? new Date(dbState._lastSave).getTime() : 0;
    const lsTs = lsState._lastSave ? new Date(lsState._lastSave).getTime() : 0;
    return lsTs > dbTs ? lsState : dbState;
  }
  return dbState || lsState || getInitialState();
}
function getBackupStatus() {
  if (!fileHandle) return { level: 'warn', msg: '⚠ Sin carpeta de respaldo', long: 'Configurá una carpeta en Respaldos para protección automática.' };
  if (!state._lastFileSave) return { level: 'warn', msg: '⚠ Aún sin guardado a archivo', long: 'Hacé un cambio o esperá 5 min.' };
  const last = new Date(state._lastFileSave);
  const hours = (Date.now() - last.getTime()) / 3600000;
  if (hours > 24) return { level: 'danger', msg: `🔴 Último respaldo hace ${Math.floor(hours/24)} días`, long: 'Exportá manualmente para asegurar los datos.' };
  if (hours > 3) return { level: 'warn', msg: `🟡 Último respaldo hace ${Math.floor(hours)} horas`, long: 'Debería actualizarse pronto.' };
  return { level: 'ok', msg: `✓ Respaldado ${last.toLocaleTimeString()}`, long: 'Todo en orden.' };
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
    if (!fileHandle) return;
    const last = state._lastFileSave ? new Date(state._lastFileSave).getTime() : 0;
    const hours = (Date.now() - last) / 3600000;
    if (hours > 1) { e.preventDefault(); e.returnValue = '¿Salir sin respaldar a carpeta?'; return e.returnValue; }
  });
}

/* ========== STATE ========== */
function getInitialState() {
  const accounts = [
    ['fasa','FASA',1,'Edgardo Carrasco',418],
    ['u-central','U CENTRAL',2,'Debora Arriagada',124],
    ['u-mayor','U MAYOR',3,'Yeremy Ovalle',243],
    ['uai','UAI',1,'Felipe Higueras',102],
    ['caja-18','CAJA 18',1,'Sergio Orellana',323],
    ['lo-barnechea','LO BARNECHEA',1,'Pedro Bustamante',141],
    ['sura','SURA',1,'Gaspar Giron',240],
    ['dhl','DHL',1,'Sergio Agurto',81],
    ['larrain','LARRAIN',1,'Sergio Agurto',68],
    ['salfa','SALFA',1,'Alejandro Garrido',377],
    ['metlife','METLIFE SEGUROS',1,'Felipe Higueras',103],
    ['provida','PROVIDA',1,'Felipe Higueras',0],
  ].map(([id,name,osas,responsible,total]) => ({
    id, name, osas, responsible, total,
    reviewed: 0, baseCount: 0, agasCount: 0, qaCount: 0,
    updateDate: '2026-10-30',
    criticalBlock: false, blockDetail: '', nextAction: '',
    actionResponsible: '', commitmentDate: '',
    observations: id === 'provida' ? 'Cuenta no está en DCC' : 'Preparación completada',
  }));
  return { accounts, risks: [], history: [], controlDate: new Date().toISOString().slice(0,10) };
}

/* ========== CALCULATIONS ========== */
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
  if (p >= m - 0.10) return 'ATRASO MENOR';
  return 'ATRASO CRÍTICO';
}
function statusClass(s) {
  const map = {
    'FINALIZADO': 'badge-finalizado',
    'AL DÍA': 'badge-verde',
    'ATRASO MENOR': 'badge-ambar',
    'ATRASO CRÍTICO': 'badge-rojo',
    'CRÍTICO': 'badge-rojo',
    'SIN DATOS': 'badge-sin-fecha'
  };
  return map[s] || '';
}
function fmtPct(v) { if (v==null || isNaN(v)) return '—'; return (v*100).toFixed(1)+'%'; }
function daysSinceDate(d) { if (!d) return null; return Math.floor((new Date(state.controlDate+'T00:00:00') - new Date(d+'T00:00:00'))/86400000); }

/* Semáforo de riesgos ahora usa state.controlDate para ser coherente con el resto */
function calcRiskSemaphore(r) {
  if (r.status === 'Cerrado') return 'CERRADO';
  if (!r.commitmentDate) return 'SIN FECHA';
  const today = new Date(state.controlDate + 'T00:00:00');
  const target = new Date(r.commitmentDate + 'T00:00:00');
  const d = Math.ceil((target - today) / 86400000);
  if (d < 0) return 'VENCIDO';
  if (d <= 2) return 'URGENTE';
  return 'EN PLAZO';
}
function calcRiskDays(r) {
  if (!r.commitmentDate) return null;
  const today = new Date(state.controlDate + 'T00:00:00');
  const target = new Date(r.commitmentDate + 'T00:00:00');
  return Math.ceil((target - today) / 86400000);
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
    if (a.baseCount > a.reviewed) w.push({ accountId:a.id, account:a.name, msg:`Base ok (${a.baseCount}) > Revisados (${a.reviewed})` });
    if (a.agasCount > a.baseCount) w.push({ accountId:a.id, account:a.name, msg:`AG-AS ok > Base ok — verificar` });
    if (a.criticalBlock && !a.nextAction) w.push({ accountId:a.id, account:a.name, msg:`Bloqueo sin próxima acción` });
    if (a.criticalBlock && !a.commitmentDate) w.push({ accountId:a.id, account:a.name, msg:`Bloqueo sin fecha compromiso` });
  });
  return w;
}
function getLastSnapshotByAccount() {
  const m = {};
  state.accounts.forEach(a => {
    const c = state.history.filter(h => h.account === a.name);
    if (c.length) m[a.id] = c[c.length-1].global;
  });
  return m;
}
/* ID robusto para riesgos: usa el máximo existente + 1 */
function nextRiskId() {
  let max = 0;
  state.risks.forEach(r => {
    const m = String(r.id || '').match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  });
  return 'A-' + String(max + 1).padStart(3, '0');
}

/* ========== RENDER ========== */
function render() {
  Object.values(charts).forEach(c => c && c.destroy && c.destroy());
  charts = {};
  updateBackupStatus();
  const app = document.getElementById('app');
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

/* ---------- DASHBOARD ---------- */
function renderDashboard(app) {
  const accs = state.accounts;
  const totalOSAs = accs.reduce((s,a)=>s+(+a.osas||0),0);
  const avgProgress = accs.reduce((s,a)=>s+calcGlobal(a),0)/accs.length;
  const totalReviewed = accs.reduce((s,a)=>s+(+a.reviewed||0),0);
  const totalEquip = accs.reduce((s,a)=>s+(+a.total||0),0);

  const counts = { FINALIZADO:0, 'AL DÍA':0, 'ATRASO MENOR':0, 'ATRASO CRÍTICO':0, 'CRÍTICO':0, 'SIN DATOS':0 };
  accs.forEach(a => counts[calcStatus(a)]++);

  const warnings = validateAll();
  const week = getCurrentWeek(state.controlDate);
  const prep = isPreparationPhase(state.controlDate);
  const prepDone = accs.filter(a => a.responsible && a.total > 0).length;
  const bStatus = getBackupStatus();

  app.innerHTML = `
    ${bStatus.level !== 'ok' ? `<div class="card" style="border-left:4px solid var(--${bStatus.level === 'danger' ? 'danger' : 'warning'});background:${bStatus.level === 'danger' ? '#fef2f2' : '#fffbeb'}">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div><strong style="color:${bStatus.level === 'danger' ? '#991b1b' : '#92400e'}">${bStatus.msg}</strong><div class="help">${bStatus.long}</div></div>
        <button class="btn btn-primary" onclick="document.querySelector('[data-view=backups]').click()">Ir a Respaldos →</button>
      </div>
    </div>` : ''}
    ${warnings.length ? `<div class="card" style="border-left:4px solid var(--warning);background:#fffbeb">
      <h2 style="color:#92400e;font-size:14px">⚠ ${warnings.length} alerta(s)</h2>
      <ul style="margin:8px 0 0 20px;font-size:13px;color:#78350f">
        ${warnings.slice(0,5).map(w=>`<li><strong>${w.account}</strong>: ${w.msg}</li>`).join('')}
        ${warnings.length>5?`<li>… y ${warnings.length-5} más</li>`:''}
      </ul></div>` : ''}

    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Cuentas</div><div class="kpi-value">12</div><div class="kpi-sub">${totalOSAs} OSAs asignados</div></div>
      <div class="kpi success"><div class="kpi-label">Avance promedio</div><div class="kpi-value">${fmtPct(avgProgress)}</div><div class="kpi-sub">Meta ${prep?'—':fmtPct(week.meta)}</div></div>
      <div class="kpi success"><div class="kpi-label">Al día</div><div class="kpi-value">${counts['AL DÍA']+counts.FINALIZADO}</div><div class="kpi-sub">${counts['ATRASO MENOR']} en atraso menor</div></div>
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
        <thead><tr><th>Cuenta</th><th>OSAs</th><th>Total</th><th>Revisados</th><th>Base</th><th>AG-AS</th><th>QA</th><th>Global</th><th>Meta</th><th>Brecha</th><th>Fase</th><th>Estado</th></tr></thead>
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

    <div class="card">
      <h2>Hitos del proyecto</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Hito</th><th>Fecha</th><th>Meta</th><th>Resultado</th><th>Situación</th><th>Comentarios / Justificación</th></tr></thead>
        <tbody>${[
          {name:'Preparación',date:'2026-10-30',meta:0.10},{name:'Inventario base',date:'2026-11-06',meta:0.55},
          {name:'Corte AG-AS',date:'2026-11-13',meta:0.75},{name:'Cierre AG-AS',date:'2026-11-20',meta:0.90},
          {name:'QA',date:'2026-11-27',meta:0.98},{name:'Cierre',date:'2026-11-30',meta:1.00},
        ].map(h=>{
          let sit, comment = '';

          if (state.controlDate < h.date) {
            sit = 'PRÓXIMO';
            comment = 'Aún no es la fecha de evaluación.';
          } else if (h.name === 'Preparación') {
            const pending = accs.filter(a => !(a.responsible && a.total > 0));
            if (pending.length === 0) {
              sit = 'CUMPLIDO · 100%';
              comment = 'Todas las cuentas listas.';
            } else if (pending.length === 1 && pending[0].id === 'provida') {
              sit = 'CUMPLIDO · EXCEPCIÓN';
              comment = 'PROVIDA excluida (No está en DCC).';
            } else {
              sit = 'PENDIENTE';
              comment = `Falta completar: ${pending.map(p=>p.name).join(', ')}`;
            }
          } else {
            sit = avgProgress >= h.meta ? 'CUMPLIDO · '+fmtPct(avgProgress) : 'PENDIENTE';
            comment = avgProgress >= h.meta ? 'Meta alcanzada.' : `Brecha global de ${(h.meta*100 - avgProgress*100).toFixed(1)} pts.`;
          }

          const cls = sit.startsWith('CUMPLIDO')?'badge-verde':sit==='PENDIENTE'?'badge-rojo':'badge-sin-fecha';
          return `<tr>
            <td>${h.name}</td>
            <td>${h.date}</td>
            <td>${fmtPct(h.meta)}</td>
            <td>${fmtPct(avgProgress)}</td>
            <td><span class="badge ${cls}">${sit}</span></td>
            <td style="font-size:12px;color:var(--gray-600)">${comment}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table></div>
    </div>
  `;

  if (typeof Chart === 'undefined') {
    console.warn('Chart.js no está disponible; los gráficos no se muestran.');
    return;
  }

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
    data:{ labels:['Al día','Atraso menor','Atraso crítico','Finalizado','Sin datos'], datasets:[{
      data:[counts['AL DÍA'],counts['ATRASO MENOR'],counts['ATRASO CRÍTICO']+counts['CRÍTICO'],counts.FINALIZADO,counts['SIN DATOS']],
      backgroundColor:['#16a34a','#f59e0b','#dc2626','#0d9488','#9ca3af'], borderWidth:0,
    }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ position:'bottom' },
        datalabels: { color: '#fff', font: { size: 12, weight: 'bold' }, formatter: (val) => val > 0 ? val : '' }
      }
    }
  });
}

/* ---------- PLAN SEMANAL ---------- */
function renderPlan(app) {
  const week = getCurrentWeek(state.controlDate);
  const isPrep = isPreparationPhase(state.controlDate);
  const prepDone = state.accounts.filter(a => a.responsible && a.total > 0).length;
  const avg = state.accounts.reduce((s,a)=>s+calcGlobal(a),0)/state.accounts.length;

  const priority = { 'ATRASO CRÍTICO':0, 'CRÍTICO':0, 'ATRASO MENOR':1, 'AL DÍA':2, 'FINALIZADO':3, 'SIN DATOS':4 };
  const sorted = [...state.accounts].sort((a,b)=>{
    const sa = priority[calcStatus(a)] ?? 5, sb = priority[calcStatus(b)] ?? 5;
    if (sa !== sb) return sa - sb;
    return calcGap(a) - calcGap(b);
  });

  app.innerHTML = `
    <div class="card plan-header">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:20px;">
        <div>
          <div class="week-badge">${week.name} · ${week.period}</div>
          <h2 style="font-size:22px;margin-top:10px;">Foco: ${week.focus}</h2>
          <p class="help" style="font-size:14px;margin-top:4px;">${isPrep ? `Preparación: ${prepDone}/12 cuentas con responsable y total` : `Meta acumulada: ${fmtPct(week.meta)}`}</p>
        </div>
        <div style="text-align:right"><div style="font-size:32px;font-weight:700;color:var(--primary);line-height:1">${fmtPct(avg)}</div><div class="help">Avance promedio</div></div>
      </div>
    </div>
    ${isPrep ? `<div class="card"><h2>Checklist de preparación</h2><p class="help" style="margin-bottom:16px">Haz clic en cualquier cuenta para editar su información base o iniciar la reunión.</p><div class="prep-grid">
      ${state.accounts.map(a=>{const ok=a.responsible&&a.total>0;return `<div class="prep-item ${ok?'ok':'pending'}" style="cursor:pointer; transition: box-shadow 0.2s" onmouseover="this.style.boxShadow='0 4px 6px -1px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='none'" data-meeting="${a.id}">
        <div class="prep-icon">${ok?'✓':'○'}</div>
        <div style="flex:1"><strong>${a.name}</strong><div class="help">${ok?`${a.responsible} · ${a.total} equipos`:'Pendiente'}</div></div>
        <button class="btn btn-sm btn-primary">✎ Editar</button>
      </div>`;}).join('')}
    </div></div>` : `<div class="card"><h2>Reuniones prioritarias</h2><p class="help">Ordenadas por prioridad. Empezá por las rojas.</p>
      <div class="reunion-list">${sorted.map(a=>{
        const st=calcStatus(a), g=calcGlobal(a), gap=calcGap(a), days=daysSinceDate(a.updateDate);
        return `<div class="reunion-item">
          <div><span class="badge ${statusClass(st)}">${st}</span></div>
          <div><strong>${a.name}</strong><div class="help">${a.responsible} · ${a.osas} OSA(s) · ${a.total} equipos</div></div>
          <div class="reunion-metrics">
            <div><strong>${fmtPct(g)}</strong><div class="help">Global</div></div>
            <div><strong>${fmtPct(calcMeta(state.controlDate))}</strong><div class="help">Meta</div></div>
            <div style="color:${gap<0?'var(--danger)':'var(--success)'}"><strong>${(gap*100).toFixed(1)}</strong><div class="help">Brecha</div></div>
            <div><strong>${days==null?'—':days+'d'}</strong><div class="help">Sin reportar</div></div>
          </div>
          <div><button class="btn btn-primary" data-meeting="${a.id}">Iniciar reunión →</button></div>
        </div>`;}).join('')}
      </div></div>`}
  `;
  app.querySelectorAll('[data-meeting]').forEach(b=>b.addEventListener('click',()=>openReunionModal(b.dataset.meeting)));
}

/* ---------- INVENTARIO CUENTAS ---------- */
function renderAccounts(app) {
  const warnings = validateAll();
  const lastSnap = getLastSnapshotByAccount();
  app.innerHTML = `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px">
      <div><h2>Inventario por Cuenta</h2><p class="help">Ingresá conteos. Los % se calculan solos.</p></div>
      <button class="btn btn-primary" id="btnImportOSA">📂 Importar Excel de OSA</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Cuenta</th><th>OSAs</th><th>Responsable</th><th>Total</th><th>Revisados</th>
        <th>Base ok</th><th>AG-AS ok</th><th>QA ok</th>
        <th>% Base</th><th>% AG-AS</th><th>% QA</th><th>Global</th><th>Δ</th>
        <th>Fecha</th><th>Meta</th><th>Brecha</th><th>Fase</th><th>Bloqueo</th>
        <th>Próx. acción</th><th>Responsable</th><th>Fecha comp.</th>
        <th style="min-width:150px">Observaciones / Justificación</th><th>Estado</th>
      </tr></thead>
      <tbody id="accountsBody"></tbody>
    </table></div>
  </div>`;
  const tbody = document.getElementById('accountsBody');
  tbody.innerHTML = state.accounts.map(a => {
    const g=calcGlobal(a), m=calcMeta(state.controlDate), gap=g-m, st=calcStatus(a);
    const delta = lastSnap[a.id] != null ? g - lastSnap[a.id] : null;
    const deltaStr = delta==null ? '—' : (delta>=0
      ? `<span style="color:var(--success);white-space:nowrap">↑ +${(delta*100).toFixed(1)}</span>`
      : `<span style="color:var(--danger);white-space:nowrap">↓ ${(delta*100).toFixed(1)}</span>`);
    const w = warnings.filter(x=>x.accountId===a.id);
    return `<tr data-id="${a.id}" style="${w.length?'background:#fef2f2':''}">
      <td><strong>${a.name}</strong></td>
      <td><input type="number" min="0" value="${a.osas}" data-field="osas"></td>
      <td><input type="text" value="${a.responsible}" data-field="responsible" style="min-width:130px"></td>
      <td><input type="number" min="0" value="${a.total}" data-field="total"></td>
      <td><input type="number" min="0" value="${a.reviewed}" data-field="reviewed"></td>
      <td><input type="number" min="0" value="${a.baseCount}" data-field="baseCount"></td>
      <td><input type="number" min="0" value="${a.agasCount}" data-field="agasCount"></td>
      <td><input type="number" min="0" value="${a.qaCount}" data-field="qaCount"></td>
      <td>${fmtPct(pctBase(a))}</td><td>${fmtPct(pctAGAS(a))}</td><td>${fmtPct(pctQA(a))}</td>
      <td><strong>${fmtPct(g)}</strong></td><td>${deltaStr}</td>
      <td><input type="date" value="${a.updateDate}" data-field="updateDate"></td>
      <td>${fmtPct(m)}</td>
      <td style="color:${gap<0?'var(--danger)':'var(--success)'};white-space:nowrap">${(gap*100).toFixed(1)} pts</td>
      <td>${calcPhase(a)}</td>
      <td><input type="checkbox" ${a.criticalBlock?'checked':''} data-field="criticalBlock"></td>
      <td><input type="text" value="${a.nextAction||''}" data-field="nextAction" style="min-width:120px"></td>
      <td><input type="text" value="${a.actionResponsible||''}" data-field="actionResponsible" style="min-width:110px"></td>
      <td><input type="date" value="${a.commitmentDate||''}" data-field="commitmentDate"></td>
      <td><input type="text" value="${a.observations||''}" data-field="observations" placeholder="Justificación..."></td>
      <td><span class="badge ${statusClass(st)}">${st}</span></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', e => {
      const tr = e.target.closest('tr');
      const acc = state.accounts.find(a=>a.id===tr.dataset.id);
      const field = e.target.dataset.field;
      let val = e.target.value;
      if (e.target.type==='checkbox') val = e.target.checked;
      else if (e.target.type==='number') {
        val = val==='' ? 0 : Math.max(0, Number(val));
        if (field==='reviewed' && val > acc.total) { toast('Revisados no puede superar el total'); return; }
        if (field==='baseCount' && val > acc.reviewed) { toast('Base ok no puede superar revisados'); return; }
      }
      acc[field] = val;
      if (!acc.updateDate && ['reviewed','baseCount','agasCount','qaCount'].includes(field)) acc.updateDate = state.controlDate;
      saveState(); render();
    });
  });

  document.getElementById('btnImportOSA').addEventListener('click', () => {
    if (typeof ExcelJS === 'undefined') { toast('ExcelJS no se cargó. Revisá tu conexión.'); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.xlsx,.xls';
    input.onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      toast('Procesando archivo, por favor espera...');
      setTimeout(() => openImportModal(f), 100);
    };
    input.click();
  });
}

/* ---------- IMPORTAR OSA (CON AUTO-DETECCIÓN POR NOMBRE) ---------- */
async function openImportModal(file) {
  const modal = document.getElementById('importModal');
  const body = document.getElementById('modalBody');
  const title = document.getElementById('modalTitle');
  const btnConfirm = document.getElementById('modalConfirm');
  const btnCancel = document.getElementById('modalCancel');

  title.textContent = `Analizando: ${file.name}`;
  body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gray-600)">⏳ Procesando archivo...</div>';
  modal.style.display = 'grid';
  btnConfirm.disabled = true;

  try {
    if (typeof ExcelJS === 'undefined') throw new Error('ExcelJS no está disponible.');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.getWorksheet('Data a llenar') || wb.worksheets[2] || wb.worksheets[0];
    const BASE = 32, AGAS = 13;
    let total=0, baseOk=0, agasOk=0;
    const baseEmpty=[], agasUnjustified=[];

    for (let r=2; r<=ws.rowCount; r++) {
      const row = ws.getRow(r);
      const s = row.getCell(1).value;
      if (!s || String(s).trim()==='') break;
      total++;
      const sStr = String(s).trim();

      let okBase = true;
      for (let c=1; c<=BASE; c++) {
        let v = row.getCell(c).value;
        if (v==null || String(v).trim()==='') { okBase = false; break; }
      }
      if (okBase) baseOk++; else if (baseEmpty.length<5) baseEmpty.push(sStr);

      let okAgas = true;
      for (let c=BASE+1; c<=BASE+AGAS; c++) {
        let v = row.getCell(c).value;
        if (v==null || String(v).trim()==='') { okAgas = false; break; }
      }
      if (okAgas) agasOk++; else if (agasUnjustified.length<5) agasUnjustified.push(sStr);
    }

    // Auto-detectar cuenta por nombre de archivo
    let matchedId = '';
    const fname = file.name.toLowerCase();
    for (const a of state.accounts) {
        const safeName = a.name.toLowerCase().replace(/\s+/g, '_');
        const safeNameNoSpace = a.name.toLowerCase().replace(/\s+/g, '');
        if (fname.includes(safeName) || fname.includes(safeNameNoSpace) || fname.includes(a.id.toLowerCase())) {
            matchedId = a.id;
            break;
        }
    }

    const safeTotal = total > 0 ? total : 1;
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr auto;gap:12px;margin-bottom:16px;font-size:14px">
        <span>Total equipos detectados</span><strong>${total}</strong>
        <span>Base A-AF completa</span><strong>${baseOk} (${(baseOk/safeTotal*100).toFixed(1)}%)</strong>
        <span>AG-AS completa</span><strong>${agasOk} (${(agasOk/safeTotal*100).toFixed(1)}%)</strong>
      </div>
      ${baseEmpty.length ? `<div style="background:#fffbeb;border-left:3px solid var(--warning);padding:10px;font-size:12px;color:#92400e;margin-bottom:10px"><strong>⚠ ${total-baseOk} equipos sin Base A-AF completa.</strong><br>Ej: ${baseEmpty.join(', ')}</div>` : ''}
      ${agasUnjustified.length ? `<div style="background:#fffbeb;border-left:3px solid var(--warning);padding:10px;font-size:12px;color:#92400e"><strong>⚠ ${total-agasOk} equipos sin AG-AS completa.</strong><br>Ej: ${agasUnjustified.join(', ')}</div>` : ''}

      <div style="background:#eff6ff;padding:12px;border-radius:8px;margin-top:16px;margin-bottom:16px">
        <p class="help" style="margin-bottom:8px">Seleccioná a qué cuenta querés aplicar estos datos (se intentó auto-detectar por nombre):</p>
        <select id="importTargetAccount" style="width:100%;padding:10px;border:1px solid var(--gray-300);border-radius:6px;font-family:inherit;font-weight:600">
          <option value="">-- Seleccionar cuenta --</option>
          ${state.accounts.map(a => `<option value="${a.id}" ${a.id === matchedId ? 'selected' : ''}>${a.name}</option>`).join('')}
        </select>
        ${matchedId ? `<p style="font-size:12px;color:var(--success);margin-top:8px;font-weight:600">✓ Cuenta detectada automáticamente en el nombre del archivo.</p>` : ''}
      </div>
    `;

    btnConfirm.disabled = false;
    btnConfirm.onclick = () => {
      const accId = document.getElementById('importTargetAccount').value;
      if (!accId) { toast('Seleccioná una cuenta'); return; }
      const acc = state.accounts.find(a => a.id === accId);
      acc.total = total;
      acc.reviewed = baseOk;
      acc.baseCount = baseOk;
      acc.agasCount = agasOk;
      acc.updateDate = state.controlDate;
      saveState();
      modal.style.display = 'none';
      render();
      toast(`✓ ${acc.name} actualizada desde archivo`);
    };
  } catch (err) {
    body.innerHTML = `<div style="color:var(--danger);text-align:center;padding:20px">Error al leer el archivo: ${err.message}</div>`;
  }
  btnCancel.onclick = () => { modal.style.display = 'none'; };
}

/* ---------- REUNIÓN MODAL ---------- */
function openReunionModal(accountId) {
  const acc = state.accounts.find(a=>a.id===accountId);
  const st = calcStatus(acc), g = calcGlobal(acc), m = calcMeta(state.controlDate), gap = g - m;
  const modal = document.getElementById('reunionModal');
  const body = document.getElementById('reunionBody');
  body.innerHTML = `
    <div class="reunion-header">
      <div><h2 style="margin:0">${acc.name}</h2><p class="help" style="margin:4px 0 0">${acc.responsible} · ${acc.osas} OSA(s) · ${acc.total} equipos</p></div>
      <span class="badge ${statusClass(st)}" style="font-size:12px;padding:6px 14px">${st}</span>
    </div>
    <div class="reunion-kpis">
      <div><div class="help">Global</div><div style="font-size:20px;font-weight:700">${fmtPct(g)}</div></div>
      <div><div class="help">Meta hoy</div><div style="font-size:20px;font-weight:700">${fmtPct(m)}</div></div>
      <div><div class="help">Brecha</div><div style="font-size:20px;font-weight:700;color:${gap<0?'var(--danger)':'var(--success)'}">${(gap*100).toFixed(1)} pts</div></div>
    </div>
    <h3 style="margin-top:24px">Inventario</h3>
    <div class="form-grid" style="margin-top:10px">
      <div><label>Total equipos</label><input type="number" id="rm-total" value="${acc.total}" min="0"></div>
      <div><label>Revisados</label><input type="number" id="rm-reviewed" value="${acc.reviewed}" min="0"></div>
      <div><label>Base A-AF ok</label><input type="number" id="rm-base" value="${acc.baseCount}" min="0"></div>
      <div><label>AG-AS ok</label><input type="number" id="rm-agas" value="${acc.agasCount}" min="0"></div>
      <div><label>QA ok</label><input type="number" id="rm-qa" value="${acc.qaCount}" min="0"></div>
    </div>
    <h3 style="margin-top:24px">Bloqueo y próxima acción</h3>
    <div class="form-grid" style="margin-top:10px">
      <div style="grid-column:1/-1;display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="rm-block" ${acc.criticalBlock?'checked':''}>
        <label for="rm-block" style="margin:0">Bloqueo crítico</label>
      </div>
      <div style="grid-column:1/-1"><label>Detalle del bloqueo</label><input type="text" id="rm-blockdetail" value="${acc.blockDetail||''}"></div>
      <div><label>Próxima acción</label><input type="text" id="rm-nextaction" value="${acc.nextAction||''}"></div>
      <div><label>Responsable</label><input type="text" id="rm-actionresp" value="${acc.actionResponsible||''}"></div>
      <div><label>Fecha compromiso</label><input type="date" id="rm-commitment" value="${acc.commitmentDate||''}"></div>
    </div>
    <h3 style="margin-top:24px">Observaciones</h3>
    <div style="margin-top:10px"><textarea id="rm-obs" rows="2" style="width:100%;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;font-family:inherit;font-size:13px">${acc.observations||''}</textarea></div>
    <div class="modal-actions" style="justify-content:space-between;margin-top:24px">
      <button class="btn" id="rm-cancel">Cerrar sin guardar</button>
      <button class="btn btn-primary" id="rm-save">Guardar corte de esta cuenta</button>
    </div>
  `;
  modal.style.display = 'grid';
  document.getElementById('rm-cancel').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('rm-save').onclick = () => {
    acc.total = Math.max(0, parseInt(document.getElementById('rm-total').value) || 0);
    acc.reviewed = Math.max(0, parseInt(document.getElementById('rm-reviewed').value) || 0);
    acc.baseCount = Math.max(0, parseInt(document.getElementById('rm-base').value) || 0);
    acc.agasCount = Math.max(0, parseInt(document.getElementById('rm-agas').value) || 0);
    acc.qaCount = Math.max(0, parseInt(document.getElementById('rm-qa').value) || 0);
    acc.criticalBlock = document.getElementById('rm-block').checked;
    acc.blockDetail = document.getElementById('rm-blockdetail').value;
    acc.nextAction = document.getElementById('rm-nextaction').value;
    acc.actionResponsible = document.getElementById('rm-actionresp').value;
    acc.commitmentDate = document.getElementById('rm-commitment').value;
    acc.observations = document.getElementById('rm-obs').value;
    acc.updateDate = state.controlDate;
    if (acc.criticalBlock && acc.blockDetail) {
      const exists = state.risks.find(r => r.account === acc.name && r.status !== 'Cerrado');
      if (!exists) {
        state.risks.push({ id: nextRiskId(), meetingDate: state.controlDate, account: acc.name, category: 'Plazo', detail: acc.blockDetail, impact: 'Alto', responsible: acc.actionResponsible, commitmentDate: acc.commitmentDate, status: 'Abierto', closure: '' });
      }
    }
    state.history.push({
      date: state.controlDate, account: acc.name, osas: acc.osas,
      total: acc.total, reviewed: acc.reviewed,
      baseCount: acc.baseCount, agasCount: acc.agasCount, qaCount: acc.qaCount,
      pctBase: pctBase(acc), pctAGAS: pctAGAS(acc), pctQA: pctQA(acc),
      global: calcGlobal(acc), status: calcStatus(acc), comment: acc.observations,
    });
    saveState();
    modal.style.display = 'none';
    toast(`✓ Corte de ${acc.name} guardado`);
    render();
  };
}

/* ---------- GANTT TIPO EXCEL ---------- */
function renderGantt(app) {
  const dates = [];
  let curr = new Date('2026-10-29T00:00:00');
  const end = new Date('2026-11-30T00:00:00');
  while (curr <= end) {
    dates.push(curr.toISOString().slice(0,10));
    curr.setDate(curr.getDate() + 1);
  }

  const today = state.controlDate;

  let html = `<div class="card">
    <h2>Gantt de planificación por cuenta</h2>
    <p class="help">Línea de tiempo comprometida. El avance real se ve en Cuentas o Dashboard.</p>
    <div class="gantt-container" style="margin-top:16px">
      <table class="gantt-table">
        <thead>
          <tr>
            <th class="col-left">Cuenta</th>
            <th>OSAs</th>
            <th class="col-left">Fase</th>
            <th>Inicio</th>
            <th>Fin</th>
            ${dates.map(d => `<th class="gantt-day-header ${d === today ? 'gantt-today-col' : ''}"><span>${d.slice(5)}</span></th>`).join('')}
          </tr>
        </thead>
        <tbody>`;

  state.accounts.forEach(a => {
    GANTT_PHASES.forEach((ph, idx) => {
      const isFirst = idx === 0;
      html += `<tr>
        <td class="col-left" style="color:var(--primary);font-weight:600;${isFirst ? 'border-top:2px solid var(--gray-300)' : ''}">${isFirst ? a.name : ''}</td>
        <td style="${isFirst ? 'border-top:2px solid var(--gray-300)' : ''}">${isFirst ? a.osas : ''}</td>
        <td class="col-left" style="color:${ph.color};font-weight:600;${isFirst ? 'border-top:2px solid var(--gray-300)' : ''}">${ph.name}</td>
        <td style="${isFirst ? 'border-top:2px solid var(--gray-300)' : ''}">${ph.start.slice(5)}</td>
        <td style="${isFirst ? 'border-top:2px solid var(--gray-300)' : ''}">${ph.end.slice(5)}</td>
        ${dates.map(d => {
          const isActive = d >= ph.start && d <= ph.end;
          const isTodayCol = d === today ? 'gantt-today-col' : '';
          const borderTop = isFirst ? 'border-top:2px solid var(--gray-300);' : '';
          return `<td class="${isTodayCol}" style="padding:0; ${borderTop}">
            ${isActive ? `<div class="gantt-active-cell" style="background:${ph.color}; width:100%; height:24px;"></div>` : ''}
          </td>`;
        }).join('')}
      </tr>`;
    });
  });

  html += `</tbody></table></div>
    <div style="margin-top:16px;display:flex;gap:16px;flex-wrap:wrap;font-size:12px">
      ${GANTT_PHASES.map(ph=>`<span style="display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${ph.color}"></span>${ph.name}</span>`).join('')}
    </div>
  </div>`;

  app.innerHTML = html;
}

/* ---------- RIESGOS ---------- */
function renderRisks(app) {
  if (!state.risks.length) {
    state.risks.push({ id:'A-001', meetingDate:'2026-10-30', account:'Todas', category:'Plazo', detail:'Inicio de preparación y asignación', impact:'Bajo', responsible:'Supervisor / OSA', commitmentDate:'2026-11-03', status:'En gestión', closure:'' });
    saveState();
  }
  app.innerHTML = `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div><h2>Acuerdos, riesgos y bloqueos</h2><p class="help">Cerrá un registro solo con evidencia.</p></div>
      <button class="btn btn-primary" id="btnAddRisk">+ Nuevo registro</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Fecha</th><th>Cuenta</th><th>Categoría</th><th>Detalle</th><th>Impacto</th><th>Responsable</th><th>Compromiso</th><th>Estado</th><th>Días</th><th>Semáforo</th><th>Cierre</th><th></th></tr></thead>
      <tbody id="risksBody"></tbody>
    </table></div>
  </div>`;
  const tb = document.getElementById('risksBody');
  tb.innerHTML = state.risks.map((r,i)=>{
    const sem = calcRiskSemaphore(r), days = calcRiskDays(r);
    const cls = { 'CERRADO':'badge-finalizado','VENCIDO':'badge-rojo','URGENTE':'badge-ambar','EN PLAZO':'badge-verde','SIN FECHA':'badge-sin-fecha' }[sem];
    return `<tr data-i="${i}">
      <td style="white-space: nowrap; min-width: 60px;"><strong>${r.id}</strong></td>
      <td><input type="date" value="${r.meetingDate||''}" data-field="meetingDate"></td>
      <td><input type="text" value="${r.account||''}" data-field="account" style="min-width:120px"></td>
      <td><select data-field="category" style="min-width:110px">${['Dato faltante','Acceso','Capacidad','Calidad','Plazo','Decisión','Otro'].map(c=>`<option ${r.category===c?'selected':''}>${c}</option>`).join('')}</select></td>
      <td><input type="text" value="${r.detail||''}" data-field="detail" style="min-width:200px"></td>
      <td><select data-field="impact" style="min-width:80px">${['Bajo','Medio','Alto'].map(c=>`<option ${r.impact===c?'selected':''}>${c}</option>`).join('')}</select></td>
      <td><input type="text" value="${r.responsible||''}" data-field="responsible" style="min-width:130px"></td>
      <td><input type="date" value="${r.commitmentDate||''}" data-field="commitmentDate"></td>
      <td><select data-field="status" style="min-width:100px">${['Abierto','En gestión','Cerrado'].map(c=>`<option ${r.status===c?'selected':''}>${c}</option>`).join('')}</select></td>
      <td>${days==null?'—':days}</td>
      <td><span class="badge ${cls}">${sem}</span></td>
      <td><input type="text" value="${r.closure||''}" data-field="closure" style="min-width:160px"></td>
      <td><button class="btn-ghost" data-del="${i}">✕</button></td>
    </tr>`;
  }).join('');
  tb.querySelectorAll('input, select').forEach(inp=>{
    inp.addEventListener('change',e=>{ const i = +e.target.closest('tr').dataset.i; state.risks[i][e.target.dataset.field] = e.target.value; saveState(); render(); });
  });
  tb.querySelectorAll('[data-del]').forEach(b=>{
    b.addEventListener('click',e=>{ if (!confirm('¿Eliminar?')) return; state.risks.splice(+e.target.dataset.del,1); saveState(); render(); });
  });
  document.getElementById('btnAddRisk').addEventListener('click',()=>{
    state.risks.push({ id: nextRiskId(), meetingDate:state.controlDate, account:'', category:'Otro', detail:'', impact:'Bajo', responsible:'', commitmentDate:'', status:'Abierto', closure:'' });
    saveState(); render();
  });
}

/* ---------- HISTORIAL ---------- */
function renderHistory(app) {
  const sorted = [...state.history].sort((a,b)=>b.date.localeCompare(a.date));
  app.innerHTML = `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div><h2>Historial de cortes</h2><p class="help">Cada corte guarda una foto de la cuenta.</p></div>
      <button class="btn btn-primary" id="btnSnap2">+ Guardar corte semanal</button>
    </div>
    ${sorted.length===0 ? '<div class="empty">Aún no hay cortes guardados.</div>' : `
    <div class="table-wrap"><table>
      <thead><tr><th>Fecha</th><th>Cuenta</th><th>OSAs</th><th>Total</th><th>Revisados</th><th>Base ok</th><th>AG-AS ok</th><th>QA ok</th><th>% Base</th><th>% AG-AS</th><th>% QA</th><th>% Global</th><th>Estado</th><th>Comentario</th></tr></thead>
      <tbody>${sorted.map(h=>`<tr>
        <td style="white-space:nowrap">${h.date}</td><td><strong>${h.account}</strong></td><td>${h.osas}</td><td>${h.total}</td><td>${h.reviewed||0}</td>
        <td>${h.baseCount||0}</td><td>${h.agasCount||0}</td><td>${h.qaCount||0}</td>
        <td>${fmtPct(h.pctBase)}</td><td>${fmtPct(h.pctAGAS)}</td><td>${fmtPct(h.pctQA)}</td><td>${fmtPct(h.global)}</td>
        <td><span class="badge ${statusClass(h.status)}">${h.status}</span></td>
        <td style="min-width:200px">${h.comment||''}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  </div>`;
  document.getElementById('btnSnap2').addEventListener('click', takeSnapshot);
}

/* ---------- CRONOGRAMA ---------- */
function renderSchedule(app) {
  app.innerHTML = `<div class="card">
    <h2>Cronograma semanal y pauta de ejecución</h2>
    <p class="help">Plan detallado para coordinar a los OSAs, supervisar entregables y conducir las reuniones.</p>
    <div class="table-wrap" style="margin-top:16px"><table>
      <thead><tr>
        <th>Semana</th><th>Periodo</th><th>Fase principal</th>
        <th style="min-width:180px">Actividades del OSA</th>
        <th style="min-width:180px">Actividad del supervisor</th>
        <th style="min-width:150px">Entregable esperado</th>
        <th>Meta acum.</th>
        <th style="min-width:150px">Evidencia requerida</th>
        <th style="min-width:150px">Riesgo a controlar</th>
        <th>Reunión / control</th>
        <th>Responsable</th>
        <th>Estado</th>
      </tr></thead>
      <tbody>
        ${SCHEDULE.map(s=>`<tr>
          <td><strong>${s.week}</strong></td>
          <td>${s.period}</td>
          <td>${s.phase}</td>
          <td style="font-size:12px;color:var(--gray-600)">${s.osaAction}</td>
          <td style="font-size:12px;color:var(--gray-600)">${s.supAction}</td>
          <td style="font-size:12px;color:var(--gray-600)">${s.deliverable}</td>
          <td><span class="badge badge-sin-fecha" style="background:var(--primary);color:#fff">${fmtPct(s.meta)}</span></td>
          <td style="font-size:12px;color:var(--gray-600)">${s.evidence}</td>
          <td style="font-size:12px;color:var(--danger)">${s.risk}</td>
          <td><span style="font-size:12px;font-weight:600;white-space:nowrap">${s.meeting}</span></td>
          <td style="font-size:12px;white-space:nowrap">${s.responsible}</td>
          <td><span class="badge ${s.status==='Completado'?'badge-verde':s.status==='En curso'?'badge-ambar':'badge-sin-fecha'}">${s.status}</span></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}

/* ---------- RESPALDOS ---------- */
async function renderBackups(app) {
  const status = getBackupStatus();
  const snapshots = await dbAll(STORE_SNAPSHOTS);
  const recent = snapshots.slice(-20).reverse();
  const hasFile = !!fileHandle;

  app.innerHTML = `
    <div class="backup-hero">
      <h2>🛡 Sistema de respaldo</h2>
      <p>5 capas de protección. Nunca pierdas el avance del proyecto.</p>
      <div class="backup-grid">
        <div class="backup-card ok"><div class="label">Capa 1 · localStorage</div><div class="value">✓ Activo</div></div>
        <div class="backup-card ok"><div class="label">Capa 2 · IndexedDB</div><div class="value">✓ Activo</div></div>
        <div class="backup-card ok"><div class="label">Capa 3 · Snapshots</div><div class="value">${snapshots.length} versiones</div></div>
        <div class="backup-card ${hasFile?'ok':'warn'}"><div class="label">Capa 4 · Carpeta disco</div><div class="value">${hasFile?'✓ Configurada':'⚠ No configurada'}</div></div>
        <div class="backup-card ok"><div class="label">Capa 5 · Descarga JSON</div><div class="value">✓ Disponible</div></div>
      </div>
    </div>
    <div class="card" style="border-left:4px solid var(--${status.level === 'ok' ? 'success' : status.level === 'warn' ? 'warning' : 'danger'})">
      <h2>${status.level === 'ok' ? '✓' : status.level === 'warn' ? '⚠' : '🔴'} Estado del respaldo</h2>
      <p class="help">${status.long}</p>
      ${!hasFile ? `
        <div style="margin-top:16px;padding:16px;background:#fffbeb;border-radius:8px">
          <h3 style="color:#92400e;margin-bottom:8px">Recomendación fuerte</h3>
          <p style="font-size:13px;color:#78350f;margin-bottom:12px">Configurá una carpeta dentro de <strong>OneDrive</strong>, <strong>Google Drive</strong> o <strong>Dropbox</strong>. La app guardará el archivo <code>mps_backup.json</code> cada 5 minutos, y tu nube lo sincronizará solo.</p>
          <button class="btn btn-primary" id="btnPickFolder">📁 Elegir carpeta de respaldo</button>
        </div>
      ` : `<div style="margin-top:16px;padding:12px;background:#f0fdf4;border-radius:8px;font-size:13px;color:#065f46"><strong>✓ Carpeta activa.</strong> ${state._lastFileSave ? `Último: ${new Date(state._lastFileSave).toLocaleString()}` : ''}</div>`}
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div><h2>Máquina del tiempo · ${snapshots.length} versiones</h2><p class="help">Podés volver a cualquier versión anterior. Nada se sobrescribe.</p></div
