/* =============================================================
   CONTROL PROYECTO INVENTARIOS MPS 2026 - CÓDIGO COMPLETO
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
let currentView = 'dashboard';
let charts = {};

/* ========== SISTEMA DE RESPALDO (5 CAPAS) ========== */
const DB_NAME = 'mps_inv_db';
const DB_VERSION = 1;
const STORE_CURRENT = 'state';
const STORE_SNAPSHOTS = 'snapshots';
let fileHandle = null;
let autoSaveTimer = null;

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
  const all = await dbAll(STORE_SNAPSHOTS);
  if (all.length > 200) {
    for (const s of all.slice(0, all.length - 200)) await dbDelete(STORE_SNAPSHOTS, s.id);
  }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
  saveStateFull().catch(e => console.error('Backup error:', e));
}
async function saveStateFull() {
  state._lastSave = new Date().toISOString();
  await dbPut(STORE_CURRENT, 'current', state);
  await addSnapshot(state);
  await autoSaveToFile();
  updateBackupStatus();
}
async function loadState() {
  try { const db = await dbGet(STORE_CURRENT, 'current'); if (db && db.accounts) return db; } catch(e) {}
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    if (r) { const p = JSON.parse(r); if (p.accounts) return p; }
  } catch(e) {}
  return getInitialState();
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
  if (!el) return;
  const s = getBackupStatus();
  el.className = s.level;
  el.textContent = s.msg;
  el.style.display = 'inline-block';
}
function startAutoSave() {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(async () => {
    if (fileHandle && state) { await autoSaveToFile(); updateBackupStatus(); }
  }, 5 * 60 * 1000);
}
function setupUnloadWarning() {
  window.addEventListener('beforeunload', e => {
    const last = state._lastFileSave ? new Date(state._lastFileSave).getTime() : 0;
    const hours = (Date.now() - last) / 3600000;
    if (hours > 1) { e.preventDefault(); e.returnValue = '¿Salir sin respaldar?'; return e.returnValue; }
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
function calcRiskSemaphore(r) {
  if (r.status === 'Cerrado') return 'CERRADO';
  if (!r.commitmentDate) return 'SIN FECHA';
  const d = Math.ceil((new Date(r.commitmentDate+'T00:00:00') - new Date(new Date().toDateString()))/86400000);
  if (d < 0) return 'VENCIDO';
  if (d <= 2) return 'URGENTE';
  return 'EN PLAZO';
}
function calcRiskDays(r) {
  if (!r.commitmentDate) return null;
  return Math.ceil((new Date(r.commitmentDate+'T00:00:00') - new Date(new Date().toDateString()))/86400000);
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

/* ========== RENDER ========== */
function render() {
  Object.values(charts).forEach(c => c && c.destroy && c.destroy());
  charts = {};
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
    ${isPrep ? `<div class="card"><h2>Checklist de preparación</h2><div class="prep-grid">
      ${state.accounts.map(a=>{const ok=a.responsible&&a.total>0;return `<div class="prep-item ${ok?'ok':'pending'}">
        <div class="prep-icon">${ok?'✓':'○'}</div>
        <div><strong>${a.name}</strong><div class="help">${ok?`${a.responsible} · ${a.total} equipos`:'Pendiente'}</div></div>
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

/* ---------- IMPORTAR OSA ---------- */
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

      let okAgas = true, hasEmpty = false;
      for (let c=BASE+1; c<=BASE+AGAS; c++) {
        let v = row.getCell(c).value;
        if (v==null || String(v).trim()==='') { hasEmpty = true; okAgas = false; }
      }
      if (okAgas && !hasEmpty) agasOk++; else if (hasEmpty && agasUnjustified.length<5) agasUnjustified.push(sStr);
    }

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr auto;gap:12px;margin-bottom:16px;font-size:14px">
        <span>Total equipos detectados</span><strong>${total}</strong>
        <span>Base A-AF completa</span><strong>${baseOk} (${(baseOk/total*100).toFixed(1)}%)</strong>
        <span>AG-AS completa</span><strong>${agasOk} (${(agasOk/total*100).toFixed(1)}%)</strong>
      </div>
      ${baseEmpty.length ? `<div style="background:#fffbeb;border-left:3px solid var(--warning);padding:10px;font-size:12px;color:#92400e;margin-bottom:10px"><strong>⚠ ${total-baseOk} equipos sin Base A-AF completa.</strong><br>Ej: ${baseEmpty.join(', ')}</div>` : ''}
      ${agasUnjustified.length ? `<div style="background:#fffbeb;border-left:3px solid var(--warning);padding:10px;font-size:12px;color:#92400e"><strong>⚠ ${total-agasOk} equipos sin AG-AS completa.</strong><br>Ej: ${agasUnjustified.join(', ')}</div>` : ''}
      <p class="help" style="margin-top:16px">Seleccioná a qué cuenta querés aplicar estos datos:</p>
      <select id="importTargetAccount" style="width:100%;padding:8px;border:1px solid var(--gray-300);border-radius:6px;font-family:inherit">
        <option value="">-- Seleccionar cuenta --</option>
        ${state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
      </select>
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
        const nextId = 'A-' + String(state.risks.length+1).padStart(3,'0');
        state.risks.push({ id: nextId, meetingDate: state.controlDate, account: acc.name, category: 'Plazo', detail: acc.blockDetail, impact: 'Alto', responsible: acc.actionResponsible, commitmentDate: acc.commitmentDate, status: 'Abierto', closure: '' });
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
    const nextId = 'A-' + String(state.risks.length+1).padStart(3,'0');
    state.risks.push({ id:nextId, meetingDate:state.controlDate, account:'', category:'Otro', detail:'', impact:'Bajo', responsible:'', commitmentDate:'', status:'Abierto', closure:'' });
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
        <div><h2>Máquina del tiempo · ${snapshots.length} versiones</h2><p class="help">Podés volver a cualquier versión anterior. Nada se sobrescribe.</p></div>
        <div style="display:flex;gap:8px">
          <button class="btn" id="btnExportNow">⬇ Descargar JSON ahora</button>
          <button class="btn btn-primary" id="btnImportRestore">⬆ Restaurar desde archivo</button>
        </div>
      </div>
      ${recent.length === 0 ? '<div class="empty">Aún no hay versiones guardadas.</div>' : `
      <div class="snapshot-list">
        ${recent.map(s => {
          const accCount = s.state.accounts ? s.state.accounts.length : 0;
          return `<div class="snapshot-item">
            <div><div class="snapshot-date">${new Date(s.date).toLocaleString('es-CL')}</div><div class="snapshot-meta">${accCount} cuentas · ${s.state.history?.length || 0} cortes</div></div>
            <div style="text-align:right"><div class="snapshot-meta">ID</div><div style="font-family:monospace;font-size:11px">#${s.id}</div></div>
            <button class="btn btn-sm" data-restore="${s.id}">Restaurar</button>
            <button class="btn-del-snap" data-del-snap="${s.id}" title="Eliminar respaldo">🗑️ Eliminar</button>
          </div>`;
        }).join('')}
      </div>`}
    </div>
  `;

  document.getElementById('btnPickFolder')?.addEventListener('click', pickBackupFolder);
  document.getElementById('btnExportNow')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    download(blob, `mps_backup_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`);
    toast('✓ JSON descargado');
  });
  document.getElementById('btnImportRestore')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const txt = await f.text();
      try {
        const data = JSON.parse(txt);
        if (!data.accounts) throw new Error('Formato inválido');
        if (!confirm('¿Reemplazar TODOS los datos actuales? La versión actual quedará en el historial.')) return;
        await addSnapshot(state); state = data; await dbPut(STORE_CURRENT, 'current', state); saveState(); toast('✓ Datos restaurados'); render();
      } catch (err) { toast('Error: ' + err.message); }
    };
    input.click();
  });
  app.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = +btn.dataset.restore; const snap = snapshots.find(s => s.id === id);
      if (!snap) return;
      if (!confirm(`¿Restaurar al estado del ${new Date(snap.date).toLocaleString()}? La versión actual se conservará.`)) return;
      await addSnapshot(state); state = JSON.parse(JSON.stringify(snap.state)); await dbPut(STORE_CURRENT, 'current', state); saveState(); toast('✓ Restaurado'); render();
    });
  });
  app.querySelectorAll('[data-del-snap]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = +btn.dataset.delSnap;
      if (!confirm('¿Eliminar este respaldo permanentemente?')) return;
      await dbDelete(STORE_SNAPSHOTS, id);
      render();
      toast('Respaldo eliminado');
    });
  });
}

/* ---------- INSTRUCCIONES ---------- */
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
          <li><strong>Dashboard:</strong> Vista ejecutiva. Muestra los KPIs (tarjetas), gráficos de avance vs meta, distribución de estados y los hitos del proyecto. No se edita manualmente; se alimenta de las demás pestañas.</li>
          <li><strong>Plan Semanal:</strong> Te indica en qué semana del cronograma estás, cuál es el foco actual (ej: Levantamiento A-AF) y te muestra las reuniones prioritarias ordenadas por criticidad (las rojas primero).</li>
          <li><strong>Inventario Cuentas:</strong> Es la hoja principal de carga. Aquí ingresas los datos de cada cuenta (Total equipos, Revisados, Base A-AF, AG-AS y QA), registras bloqueos y observaciones.</li>
          <li><strong>Gantt:</strong> Muestra la línea de tiempo comprometida para cada cuenta y fase, con vista de días para ver la evolución temporal.</li>
          <li><strong>Acuerdos y Riesgos:</strong> Registro formal de bloqueos, decisiones y compromisos. Cada registro tiene un responsable y una fecha de vencimiento con semáforo automático.</li>
          <li><strong>Historial:</strong> Conserva una "foto" (snapshot) del avance de cada cuenta en cada reunión. Permite reconstruir la evolución semanal.</li>
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
          <li>Ve a <strong>Plan Semanal</strong> y haz clic en <strong>"Iniciar reunión →"</strong> en la cuenta que vas a revisar.</li>
          <li>En la ventana, ingresa las cantidades exactas dictadas por el OSA (Total, Revisados, Base, AG-AS, QA).</li>
          <li>Si hay un bloqueo, márcalo y describe la próxima acción, responsable y fecha compromiso.</li>
          <li>Haz clic en <strong>"Guardar corte de esta cuenta"</strong>. Los porcentajes y el semáforo se calculan solos.</li>
        </ol>
        <p><strong>Opción B: Carga desde Excel del OSA</strong></p>
        <ol style="padding-left: 24px; font-size: 14px; color: var(--gray-700);">
          <li>Ve a <strong>Inventario Cuentas</strong> y haz clic en <strong>"📂 Importar Excel de OSA"</strong>.</li>
          <li>Selecciona el archivo del OSA. El sistema contará automáticamente cuántos equipos tienen la Base (32 columnas) y AG-AS (13 columnas) completas.</li>
          <li>Elige a qué cuenta pertenece el archivo y haz clic en Aplicar.</li>
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

/* ---------- SETTINGS ---------- */
function renderSettings(app) {
  app.innerHTML = `<div class="card">
    <h2>Configuración y respaldo</h2>
    <div class="form-grid" style="margin-bottom:20px">
      <div><label>Fecha de control</label><input type="date" id="setControlDate" value="${state.controlDate}"><p class="help">Cambiala para simular semanas futuras.</p></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-primary" id="btnExportJSON">⬇ Exportar JSON</button>
      <button class="btn" id="btnImportJSON">⬆ Importar JSON</button>
      <button class="btn" id="btnExportCSV">⬇ Exportar CSV</button>
      <button class="btn btn-danger" id="btnReset">🔄 Reiniciar todo</button>
    </div>
    <input type="file" id="fileImport" accept="application/json" hidden>
  </div>`;

  document.getElementById('setControlDate').addEventListener('change',e=>{
    state.controlDate = e.target.value; saveState();
    document.getElementById('controlDate').value = e.target.value;
    toast('Fecha de control actualizada'); render();
  });
  document.getElementById('btnExportJSON').addEventListener('click',()=>{
    const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    download(blob, `mps_backup_${new Date().toISOString().slice(0,10)}.json`);
  });
  document.getElementById('btnImportJSON').addEventListener('click',()=>document.getElementById('fileImport').click());
  document.getElementById('fileImport').addEventListener('change',e=>{
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try { const d = JSON.parse(ev.target.result); if (!d.accounts) throw new Error('Formato inválido');
        state = d; saveState(); render(); toast('Datos importados correctamente');
      } catch (err) { alert('Error: ' + err.message); }
    };
    r.readAsText(f);
  });
  document.getElementById('btnExportCSV').addEventListener('click',()=>{
    const h = ['Cuenta','OSAs','Responsable','Total','Revisados','Base ok','AG-AS ok','QA ok','%Base','%AG-AS','%QA','Global','Fecha','Meta','Estado'];
    const rows = state.accounts.map(a=>[a.name,a.osas,a.responsible,a.total,a.reviewed,a.baseCount,a.agasCount,a.qaCount,
      fmtPct(pctBase(a)),fmtPct(pctAGAS(a)),fmtPct(pctQA(a)),fmtPct(calcGlobal(a)),a.updateDate,fmtPct(calcMeta(state.controlDate)),calcStatus(a)]);
    const csv = [h,...rows].map(r=>r.join(',')).join('\n');
    download(new Blob([csv],{type:'text/csv'}), 'mps_cuentas.csv');
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    if (!confirm('Se borrarán TODOS los datos. ¿Continuar?')) return;
    state = getInitialState(); saveState(); render(); toast('Sistema reiniciado');
  });
}

/* ========== EXPORTAR EXCEL ========== */
function generateChartImage(config) {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 450;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
  const chart = new Chart(c, config);
  const url = c.toDataURL('image/png', 1.0);
  chart.destroy();
  return url.split(',')[1];
}

async function exportToExcel() {
  toast('Generando Excel con gráficos...');
  const accs = state.accounts;
  const totalOSAs = accs.reduce((s,a)=>s+(+a.osas||0),0);
  const avgProgress = accs.reduce((s,a)=>s+calcGlobal(a),0)/accs.length;
  const totalReviewed = accs.reduce((s,a)=>s+(+a.reviewed||0),0);
  const totalEquip = accs.reduce((s,a)=>s+(+a.total||0),0);
  
  const counts = { FINALIZADO:0, 'AL DÍA':0, 'ATRASO MENOR':0, 'ATRASO CRÍTICO':0, 'CRÍTICO':0, 'SIN DATOS':0 };
  accs.forEach(a=>counts[calcStatus(a)]++);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Control Proyecto Inventarios MPS 2026';
  wb.created = new Date();

  const ws = wb.addWorksheet('Dashboard', { views:[{showGridLines:false}], properties:{ tabColor:{argb:'FF2563EB'} } });
  ws.columns = [{width:3},{width:22},{width:16},{width:16},{width:3},{width:22},{width:16},{width:16}];

  ws.mergeCells('B2:H2');
  const t = ws.getCell('B2');
  t.value = 'DASHBOARD EJECUTIVO · CONTROL INVENTARIOS MPS 2026';
  t.font = { bold:true, size:18, color:{argb:'FFFFFFFF'} };
  t.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF2563EB'} };
  t.alignment = { horizontal:'left', vertical:'middle', indent:1 };
  ws.getRow(2).height = 40;

  ws.mergeCells('B3:H3');
  ws.getCell('B3').value = `Cierre: 30-11-2026 · Generado: ${new Date().toLocaleString('es-CL')} · Fecha control: ${state.controlDate}`;
  ws.getCell('B3').font = { italic:true, size:10, color:{argb:'FF6B7280'} };

  const kpis = [
    {label:'Cuentas',value:12,color:'FF2563EB'},{label:'OSAs',value:totalOSAs,color:'FF2563EB'},
    {label:'Avance promedio',value:avgProgress,color:'FF16A34A',pct:true},{label:'Equipos revisados',value:`${totalReviewed}/${totalEquip}`,color:'FF2563EB'},
    {label:'Al día',value:counts['AL DÍA']+counts.FINALIZADO,color:'FF16A34A'},{label:'Atraso menor',value:counts['ATRASO MENOR'],color:'FFF59E0B'},
    {label:'Atraso crítico',value:counts['ATRASO CRÍTICO']+counts['CRÍTICO'],color:'FFDC2626'},{label:'Finalizados',value:counts.FINALIZADO,color:'FF0D9488'},
  ];
  kpis.forEach((k,i)=>{
    const col = i<4?2:6, row = i<4?5+i:5+(i-4);
    ws.getCell(row,col).value = k.label;
    ws.getCell(row,col).font = { bold:true, size:10, color:{argb:'FF6B7280'} };
    const v = ws.getCell(row,col+1);
    v.value = k.value; v.font = { bold:true, size:14, color:{argb:k.color} };
    if (k.pct) v.numFmt = '0.0%';
  });

  const barImg = generateChartImage({
    type:'bar',
    data:{ labels:accs.map(a=>a.name), datasets:[
      { label:'Avance', data:accs.map(a=>+(calcGlobal(a)*100).toFixed(1)), backgroundColor:'#2563eb', borderRadius:6 },
      { label:'Meta', data:accs.map(()=>+(calcMeta(state.controlDate)*100).toFixed(1)), backgroundColor:'#94a3b8', borderRadius:6 },
    ]},
    options:{ responsive:false, animation:false, plugins:{ title:{display:true,text:'Avance vs Meta por cuenta',font:{size:16,weight:'bold'}}, legend:{position:'bottom'}, datalabels:{display:false} }, scales:{ y:{ beginAtZero:true, max:100, ticks:{callback:v=>v+'%'} } } },
  });

  const doughnutImg = generateChartImage({
    type:'doughnut',
    data:{ labels:['Al día','Atraso menor','Atraso crítico','Finalizado','Sin datos'], datasets:[{ data:[counts['AL DÍA'],counts['ATRASO MENOR'],counts['ATRASO CRÍTICO']+counts['CRÍTICO'],counts.FINALIZADO,counts['SIN DATOS']], backgroundColor:['#16a34a','#f59e0b','#dc2626','#0d9488','#9ca3af'] }]},
    options:{ responsive:false, animation:false, plugins:{ title:{display:true,text:'Distribución de estados',font:{size:16,weight:'bold'}}, legend:{position:'bottom'}, datalabels:{display:false} } },
  });

  ws.addImage(wb.addImage({base64:barImg,extension:'png'}), { tl:{col:1,row:13}, ext:{width:720,height:360} });
  ws.addImage(wb.addImage({base64:doughnutImg,extension:'png'}), { tl:{col:5,row:13}, ext:{width:480,height:360} });

  const start = 34;
  ws.getCell(`B${start}`).value = 'RESUMEN POR CUENTA';
  ws.getCell(`B${start}`).font = { bold:true, size:13, color:{argb:'FF2563EB'} };
  ['Cuenta','Avance','Meta','Brecha','Fase','Estado'].forEach((h,i)=>{
    const c = ws.getCell(start+1, 2+i);
    c.value = h; c.font = { bold:true, color:{argb:'FFFFFFFF'} };
    c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF2563EB'} };
    c.alignment = { horizontal:'center' };
  });
  accs.forEach((a,i)=>{
    const r = start+2+i, g = calcGlobal(a), m = calcMeta(state.controlDate), gap = g-m, st = calcStatus(a);
    ws.getCell(r,2).value = a.name;
    ws.getCell(r,3).value = g; ws.getCell(r,3).numFmt = '0.0%';
    ws.getCell(r,4).value = m; ws.getCell(r,4).numFmt = '0.0%';
    ws.getCell(r,5).value = gap; ws.getCell(r,5).numFmt = '+0.0%;-0.0%;0.0%';
    ws.getCell(r,5).font = { color:{argb: gap<0?'FFDC2626':'FF16A34A'}, bold:true };
    ws.getCell(r,6).value = calcPhase(a);
    ws.getCell(r,7).value = st;
    const cmap = { 'AL DÍA':'FFD1FAE5','ATRASO MENOR':'FFFEF3C7','ATRASO CRÍTICO':'FFFEE2E2','CRÍTICO':'FFFEE2E2',FINALIZADO:'FFCCFBF1','SIN DATOS':'FFF3F4F6' };
    ws.getCell(r,7).fill = { type:'pattern', pattern:'solid', fgColor:{argb:cmap[st]||'FFFFFFFF'} };
    ws.getCell(r,7).font = { bold:true };
    ws.getCell(r,7).alignment = { horizontal:'center' };
  });

  const wsA = wb.addWorksheet('Actualizar Avance', { properties:{ tabColor:{argb:'FF16A34A'} } });
  wsA.columns = [
    {header:'Cuenta',key:'name',width:20},{header:'OSAs',key:'osas',width:8},{header:'Responsable',key:'responsible',width:22},
    {header:'Total',key:'total',width:10},{header:'Revisados',key:'reviewed',width:12},{header:'Base ok',key:'baseCount',width:10},
    {header:'AG-AS ok',key:'agasCount',width:10},{header:'QA ok',key:'qaCount',width:10},
    {header:'% Base',key:'pctBase',width:10},{header:'% AG-AS',key:'pctAGAS',width:10},{header:'% QA',key:'pctQA',width:10},
    {header:'Global',key:'global',width:10},{header:'Fecha',key:'updateDate',width:14},{header:'Meta',key:'meta',width:10},
    {header:'Brecha',key:'gap',width:12},{header:'Fase',key:'phase',width:22},{header:'Bloqueo',key:'block',width:10},{header:'Estado',key:'status',width:14},
  ];
  accs.forEach(a=>wsA.addRow({
    name:a.name, osas:a.osas, responsible:a.responsible, total:a.total, reviewed:a.reviewed,
    baseCount:a.baseCount, agasCount:a.agasCount, qaCount:a.qaCount,
    pctBase:pctBase(a), pctAGAS:pctAGAS(a), pctQA:pctQA(a), global:calcGlobal(a), updateDate:a.updateDate,
    meta:calcMeta(state.controlDate), gap:calcGap(a), phase:calcPhase(a), block:a.criticalBlock?'Sí':'No', status:calcStatus(a),
  }));
  const hA = wsA.getRow(1);
  hA.font = { bold:true, color:{argb:'FFFFFFFF'} };
  hA.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF2563EB'} };
  hA.height = 32;
  [9,10,11,12,14].forEach(c=>wsA.getColumn(c).numFmt = '0.0%');
  wsA.getColumn(15).numFmt = '+0.0%;-0.0%;0.0%';
  wsA.eachRow((row,r)=>{
    if (r===1) return;
    const s = row.getCell(18);
    const cmap = { 'AL DÍA':'FFD1FAE5','ATRASO MENOR':'FFFEF3C7','ATRASO CRÍTICO':'FFFEE2E2','CRÍTICO':'FFFEE2E2',FINALIZADO:'FFCCFBF1','SIN DATOS':'FFF3F4F6' };
    if (cmap[s.value]) { s.fill = { type:'pattern', pattern:'solid', fgColor:{argb:cmap[s.value]} }; s.font = { bold:true }; }
    row.height = 22;
  });
  wsA.views = [{ state:'frozen', ySplit:1 }];
  wsA.autoFilter = { from:'A1', to:'R1' };

  if (state.risks.length) {
    const wsR = wb.addWorksheet('Acuerdos y Riesgos', { properties:{ tabColor:{argb:'FFDC2626'} } });
    wsR.columns = [
      {header:'ID',key:'id',width:8},{header:'Fecha',key:'meetingDate',width:14},{header:'Cuenta',key:'account',width:18},
      {header:'Categoría',key:'category',width:14},{header:'Detalle',key:'detail',width:40},{header:'Impacto',key:'impact',width:10},
      {header:'Responsable',key:'responsible',width:20},{header:'Compromiso',key:'commitmentDate',width:14},
      {header:'Estado',key:'status',width:12},{header:'Días',key:'days',width:10},{header:'Semáforo',key:'sem',width:12},{header:'Cierre',key:'closure',width:30},
    ];
    state.risks.forEach(r=>wsR.addRow({
      id:r.id, meetingDate:r.meetingDate, account:r.account, category:r.category, detail:r.detail,
      impact:r.impact, responsible:r.responsible, commitmentDate:r.commitmentDate, status:r.status,
      days:calcRiskDays(r), sem:calcRiskSemaphore(r), closure:r.closure,
    }));
    const hR = wsR.getRow(1);
    hR.font = { bold:true, color:{argb:'FFFFFFFF'} };
    hR.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFDC2626'} };
    wsR.views = [{ state:'frozen', ySplit:1 }];
  }

  if (state.history.length) {
    const wsH = wb.addWorksheet('Historial', { properties:{ tabColor:{argb:'FFF59E0B'} } });
    wsH.columns = [
      {header:'Fecha',key:'date',width:14},{header:'Cuenta',key:'account',width:20},{header:'OSAs',key:'osas',width:8},
      {header:'Total',key:'total',width:10},{header:'Revisados',key:'reviewed',width:12},{header:'Base ok',key:'baseCount',width:10},
      {header:'AG-AS ok',key:'agasCount',width:10},{header:'QA ok',key:'qaCount',width:10},
      {header:'% Base',key:'pctBase',width:10},{header:'% AG-AS',key:'pctAGAS',width:10},{header:'% QA',key:'pctQA',width:10},
      {header:'Global',key:'global',width:10},{header:'Estado',key:'status',width:14},{header:'Comentario',key:'comment',width:40},
    ];
    state.history.forEach(h=>wsH.addRow(h));
    const hH = wsH.getRow(1);
    hH.font = { bold:true, color:{argb:'FFFFFFFF'} };
    hH.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFF59E0B'} };
    [9,10,11,12].forEach(c=>wsH.getColumn(c).numFmt = '0.0%');
    wsH.views = [{ state:'frozen', ySplit:1 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), `MPS_Control_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('✓ Excel exportado');
}

/* ========== UTILS / ACTIONS ========== */
function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  a.click(); URL.revokeObjectURL(a.href);
}
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2400);
}
function takeSnapshot() {
  const date = state.controlDate;
  state.accounts.forEach(a => {
    state.history.push({
      date, account: a.name, osas: a.osas, total: a.total, reviewed: a.reviewed,
      baseCount: a.baseCount, agasCount: a.agasCount, qaCount: a.qaCount,
      pctBase: pctBase(a), pctAGAS: pctAGAS(a), pctQA: pctQA(a),
      global: calcGlobal(a), status: calcStatus(a), comment: a.observations||'',
    });
  });
  saveState();
  toast(`Corte ${date} guardado (12 cuentas)`);
  if (currentView === 'history') render();
}

/* ========== INIT ========== */
async function init() {
  state = await loadState();
  if (!state.controlDate) state.controlDate = new Date().toISOString().slice(0,10);
  
  document.getElementById('controlDate').value = state.controlDate;
  document.getElementById('controlDate').addEventListener('change', e => {
    state.controlDate = e.target.value; saveState();
    render(); toast('Fecha de control: ' + e.target.value);
  });
  
  document.getElementById('btnSnapshot').addEventListener('click', takeSnapshot);
  document.getElementById('btnExportExcel').addEventListener('click', () => {
    exportToExcel().catch(err => { console.error(err); toast('Error al exportar: ' + err.message); });
  });
  
  document.querySelectorAll('.app-nav button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.app-nav button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      currentView = b.dataset.view; render();
      window.scrollTo({top:0,behavior:'smooth'});
    });
  });

  await restoreFileHandle();
  startAutoSave();
  setupUnloadWarning();
  updateBackupStatus();
  render();
}

init();
