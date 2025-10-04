// Fetch JSON from a URL and throw on non-OK responses
async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return await response.json();
}

// Holds TinyChart instances for each chart canvas
let charts = {};

// Render System Info object into a compact two-column key→value grid inside target
function renderSystemKV(target, obj){
  if(!target) return;

  const humanizeKey = k => String(k || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());

  const wrap = document.createElement('div');
  wrap.className = 'kv';
  Object.keys(obj || {}).forEach(k=>{
    const kEl = document.createElement('div'); kEl.className='k'; kEl.textContent=humanizeKey(k);
    const vEl = document.createElement('div'); vEl.className='v';
    const v = obj[k];
    if(Array.isArray(v)){
      const arr = document.createElement('div'); arr.className='arr';
      v.forEach(item=>{ const tag=document.createElement('span'); tag.className='tag'; tag.textContent=String(item); arr.appendChild(tag); });
      vEl.appendChild(arr);
    } else if (v && typeof v==='object'){
      const span=document.createElement('span'); span.textContent=JSON.stringify(v);
      vEl.appendChild(span);
    } else {
      const span=document.createElement('span'); span.textContent=String(v);
      vEl.appendChild(span);
    }
    wrap.appendChild(kEl); wrap.appendChild(vEl);
  });
  target.replaceChildren(wrap);
}

// Render arrays/objects as a list of rows (one record per line) inside target
function renderList(target, val){
  if(!target) return;
  const list = document.createElement('div');
  list.className = 'nano-list';
  if(Array.isArray(val)){
    val.forEach(item=>{
      const row = document.createElement('div');
      row.className = 'nano-row';
      row.textContent = (typeof item==='string') ? item : JSON.stringify(item);
      list.appendChild(row);
    });
  } else if (val && typeof val==='object'){
    Object.keys(val).forEach(k=>{
      const row = document.createElement('div');
      row.className='nano-row';
      const v = val[k];
      row.textContent = k + ': ' + (typeof v==='string' ? v : JSON.stringify(v));
      list.appendChild(row);
    });
  } else {
    const row = document.createElement('div');
    row.className='nano-row';
    row.textContent = String(val ?? '');
    list.appendChild(row);
  }
  target.replaceChildren(list);
}

// Load all datasets from BE, render System/Events/Logs, and update charts
async function loadData() {
    try {
        const [systemInfo, eventData, logData] = await Promise.all([
            fetchJson('/dev-console/system-info'),
            fetchJson('/dev-console/events'),
            fetchJson('/dev-console/logs')
        ]);

        renderSystemKV(document.getElementById("system"), systemInfo);
        renderList(document.getElementById("eventsData"), eventData);
        renderList(document.getElementById("logsData"), logData);

        // Update charts with current system info
        updateChartsWithSystemInfo(systemInfo);
    } catch (e) {
        console.error("Error loading data:", e);
    }
}

// Push latest System Info metrics into the corresponding charts
function updateChartsWithSystemInfo(systemInfo) {
    const timestamp = Date.now();

    if (charts.memory && systemInfo.usedMemory) {
        const memoryValue = parseFloat(systemInfo.usedMemory.replace(' MB', ''));
        charts.memory.addPoint(memoryValue, timestamp);
    }

    if (charts.threads && systemInfo.threadsNano !== undefined && systemInfo.threadsActive !== undefined) {
        const totalThreads = systemInfo.threadsNano + systemInfo.threadsActive;
        charts.threads.addPoint(totalThreads, timestamp);
    }

    if (charts.events && systemInfo.totalEvents !== undefined) {
        const eventCount = parseInt(systemInfo.totalEvents, 10) || 0;
        charts.events.addPoint(eventCount, timestamp);
    }

    if (charts.heap && systemInfo.heapUsage !== undefined) {
        const heapPercentage = systemInfo.heapUsage * 100;
        charts.heap.addPoint(heapPercentage, timestamp);
    }

    if (charts.cpu && systemInfo.cpuUsage !== undefined) {
            const cpuPercentage = systemInfo.cpuUsage;
            charts.cpu.addPoint(cpuPercentage, timestamp);
    }
}

// Activate a tab by id and show its content panel (loads config on demand)
function openTab(tabId) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');

    // Load config on demand (no polling)
    if (tabId === 'config') { loadConfig(); }
}

// Fetch current config once on opening the Config tab and populate the form
async function loadConfig(){
  try {
    const cfg = await fetchJson('/dev-console/config');
    const form = document.getElementById('configForm');
    if (!form) return;

    // Fill inputs
    const maxEventsEl = document.getElementById('cfgMaxEvents');
    const maxLogsEl   = document.getElementById('cfgMaxLogs');
    const baseUrlEl   = document.getElementById('cfgBaseUrl');

    maxEventsEl.value = (cfg?.maxEvents ?? '');
    maxLogsEl.value   = (cfg?.maxLogs   ?? '');
    baseUrlEl.value   = (cfg?.baseUrl   ?? '');

    // Save original for diffing (store as strings for consistent comparisons)
    form._originalConfig = {
      maxEvents: String(cfg?.maxEvents ?? ''),
      maxLogs:   String(cfg?.maxLogs   ?? ''),
      baseUrl:   String(cfg?.baseUrl   ?? '')
    };

    // Recompute diff to set button state
    computeConfigDiff();
  } catch (e) {
    showToast('error', 'Failed to load config');
    console.error(e);
  }
}

// --- Validation helpers (minimal) ---
function setFieldError(inputEl, msg){
  const field = inputEl?.closest('.field'); if (!field) return;
  field.classList.add('error');
  let em = field.querySelector('.error-msg');
  if (!em) { em = document.createElement('div'); em.className = 'error-msg'; field.appendChild(em); }
  em.textContent = msg || '';
}
function clearFieldError(inputEl){
  const field = inputEl?.closest('.field'); if (!field) return;
  field.classList.remove('error');
  const em = field.querySelector('.error-msg'); if (em) em.remove();
}

// >0 integers only, max 9999
const isPosIntStr = s => /^[1-9]\d{0,3}$/.test(String(s).trim()); // 1..9999

// baseUrl: "/" + [a-zA-Z0-9-] only, total length 2..16, no other "/"
const isBaseUrlOK = s => /^\/[A-Za-z0-9-]{1,15}$/.test(String(s).trim());

// Compute diff vs the original config; enable/disable Update button
function computeConfigDiff(){
  const form = document.getElementById('configForm'); if (!form) return {};
  const original = form._originalConfig || {};
  const draft = {
    maxEvents: (document.getElementById('cfgMaxEvents')?.value ?? '').trim(),
    maxLogs:   (document.getElementById('cfgMaxLogs')?.value ?? '').trim(),
    baseUrl:   (document.getElementById('cfgBaseUrl')?.value ?? '').trim()
  };

  // Clear previous errors
  const maxEventsEl = document.getElementById('cfgMaxEvents');
  const maxLogsEl   = document.getElementById('cfgMaxLogs');
  const baseUrlEl   = document.getElementById('cfgBaseUrl');
  clearFieldError(maxEventsEl); clearFieldError(maxLogsEl); clearFieldError(baseUrlEl);

  // Validate current values
  let valid = true;
  if (!isPosIntStr(draft.maxEvents)) { setFieldError(maxEventsEl, 'Enter a positive integer (1–9999)'); valid = false; }
  if (!isPosIntStr(draft.maxLogs))   { setFieldError(maxLogsEl,   'Enter a positive integer (1–9999)'); valid = false; }
  if (!isBaseUrlOK(draft.baseUrl))   { setFieldError(baseUrlEl,   'Format: "/" followed by maximum 15 characters of [A–Z a–z 0–9 -]'); valid = false; }

  // Build changed map only when values differ from originals
  const changed = {};
  if (draft.maxEvents !== (original.maxEvents ?? '')) changed.maxEvents = parseInt(draft.maxEvents, 10);
  if (draft.maxLogs   !== (original.maxLogs   ?? '')) changed.maxLogs   = parseInt(draft.maxLogs, 10);
  if (draft.baseUrl   !== (original.baseUrl   ?? '')) changed.baseUrl   = draft.baseUrl;

  const btn = document.getElementById('configUpdateBtn');
  if (btn) btn.disabled = (Object.keys(changed).length === 0) || !valid;

  // Cache the diff for submit
  form._changed = changed;
  return changed;
}

// Show a toast message (success or error) for 2 seconds
function showToast(type, message){
  const toast = document.getElementById('configToast');
  if (!toast) return;
  toast.textContent = message || '';
  toast.classList.remove('error');
  if (type === 'error') toast.classList.add('error');
  toast.classList.add('show');
  setTimeout(()=> toast.classList.remove('show'), 2000);
}

// Submit only changed keys to backend after a confirm dialog
async function submitConfigUpdate(e){
  e?.preventDefault?.();
  const form = document.getElementById('configForm');
  if (!form) return;

  const changed = computeConfigDiff();
  // Abort if no changes or invalid state (button disabled)
  const btn = document.getElementById('configUpdateBtn');
  if (!changed || Object.keys(changed).length === 0 || (btn && btn.disabled)) return;

  if (!confirm('Update configuration?')) return;

  try {
    const resp = await fetch('/dev-console/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/merge-patch+json' },
      body: JSON.stringify(changed)
    });

    if (!resp.ok) {
      showToast('error', 'Update failed');
      return;
    }

    // Success: set new originals (as strings), disable button, and toast
    const current = {
      maxEvents: document.getElementById('cfgMaxEvents')?.value ?? '',
      maxLogs:   document.getElementById('cfgMaxLogs')?.value ?? '',
      baseUrl:   document.getElementById('cfgBaseUrl')?.value ?? ''
    };
    form._originalConfig = {
      maxEvents: String(current.maxEvents),
      maxLogs:   String(current.maxLogs),
      baseUrl:   String(current.baseUrl)
    };
    computeConfigDiff();
    showToast('success', 'Updated successfully');
  } catch (e) {
    showToast('error', 'Update failed');
    console.error(e);
  }
}

// Initialize tabs, charts, initial data load, and auto-refresh on DOM ready
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener("click", () => openTab(tab.dataset.tab));
    });

    const memoryCanvas = document.getElementById('memoryChart');
    const threadsCanvas = document.getElementById('threadsChart');
    const eventsCanvas = document.getElementById('eventsChart');
    const heapCanvas = document.getElementById('heapChart');
    const cpuCanvas = document.getElementById('cpuChart');

    if (memoryCanvas) {
        charts.memory = new TinyChart(memoryCanvas, {
            title: 'Memory Usage (MB)',
            lineColor: '#28a745',
            pointColor: '#28a745'
        });
    }

    if (threadsCanvas) {
        charts.threads = new TinyChart(threadsCanvas, {
            title: 'Thread Count',
            lineColor: '#ffc107',
            pointColor: '#ffc107',
            isInteger: true
        });
    }

    if (eventsCanvas) {
        charts.events = new TinyChart(eventsCanvas, {
            title: 'Total Events',
            lineColor: '#17a2b8',
            pointColor: '#17a2b8',
            isInteger: true
        });
    }

    if (heapCanvas) {
        charts.heap = new TinyChart(heapCanvas, {
            title: 'Heap Usage (%)',
            lineColor: '#dc3545',
            pointColor: '#dc3545'
        });
    }

    if (cpuCanvas) {
            charts.cpu = new TinyChart(cpuCanvas, {
                title: 'Cpu Usage (%)',
                lineColor: '#6610f2',
                pointColor: '#6610f2'
            });
    }

    loadData();
    setInterval(loadData, 2000);

    // Config form wiring (if present)
    const form = document.getElementById('configForm');
    const btnUpdate = document.getElementById('configUpdateBtn');
    const inputs = [document.getElementById('cfgMaxEvents'), document.getElementById('cfgMaxLogs'), document.getElementById('cfgBaseUrl')].filter(Boolean);
    inputs.forEach(inp => {
      inp.addEventListener('input', computeConfigDiff);
      inp.addEventListener('change', computeConfigDiff);
    });
    form?.addEventListener('submit', submitConfigUpdate);
    btnUpdate?.addEventListener('click', submitConfigUpdate);
});

// Theme/pause/export wiring (toggle theme, pause auto-refresh, export events/logs)
(function(){
  const $ = (q, el=document)=>el.querySelector(q);

  // Set the theme button icon (🌿 for light, ☀️ for dark)
  function setThemeIcon(){
    const btn = $("#nanoThemeBtn"); if(!btn) return;
    const isLight = document.body.classList.contains('light');
    btn.textContent = isLight ? "🌿 Eco mode" : "☀️Original";
  }

  // Toggle between light and dark theme and persist the choice
  function toggleTheme(){
    document.body.classList.toggle('light');
    localStorage.setItem('nano_theme', document.body.classList.contains('light') ? 'light' : 'dark');
    setThemeIcon();
  }

  // Restore previously saved theme on load and set icon
  (function restoreTheme(){
    const saved = localStorage.getItem('nano_theme');
    if (saved === 'light') document.body.classList.add('light');
    setThemeIcon();
  })();

  // Install a wrapper around loadData to support pause/resume without touching setInterval
  let paused = false;
  function installPauseWrapper(){
    const fn = window.loadData;
    if (typeof fn === 'function' && !fn.__nanoWrapped){
      const wrapped = function(){ if (paused) return; return fn.apply(this, arguments); };
      wrapped.__nanoWrapped = true;
      window.loadData = wrapped;
    }
  }
  installPauseWrapper(); setTimeout(installPauseWrapper, 0); setTimeout(installPauseWrapper, 500);

  // Toggle pause/resume state and update the pause button label
  function togglePause(){
    paused = !paused;
    const btn = $("#nanoPauseBtn"); if (btn) btn.textContent = paused ? "▶ Resume" : "⏸ Pause";
  }

  // Download a given text as a file with the specified filename
  function downloadText(filename, text){
    const blob = new Blob([text || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // Export events and logs views to separate text files
  function doExport(){
    const eventsTxt = ($("#eventsData")?.innerText) || "";
    const logsTxt = ($("#logsData")?.innerText) || "";
    downloadText("events.txt", eventsTxt); downloadText("logs.txt", logsTxt);
  }

  // Wire up Theme, Pause, and Export buttons
  function wire(){
    $("#nanoThemeBtn")?.addEventListener("click", toggleTheme);
    $("#nanoPauseBtn")?.addEventListener("click", togglePause);
    $("#nanoExportBtn")?.addEventListener("click", doExport);
  }

  // Initialize button wiring when DOM is ready
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();

// Toolbar hamburger dropdown
(() => {
  const btn  = document.getElementById('toolbarMenuBtn');
  const menu = document.getElementById('toolbarMenu');
  if (!btn || !menu) return;

  const open = () => { menu.classList.add('open'); btn.setAttribute('aria-expanded','true'); };
  const close = () => { menu.classList.remove('open'); btn.setAttribute('aria-expanded','false'); };
  const toggle = () => menu.classList.contains('open') ? close() : open();

  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

  // Close on outside click / Escape
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Optional: close after clicking any menu item
  menu.addEventListener('click', (e) => {
    const target = e.target.closest('.menu-item');
    if (target) setTimeout(close, 0);
  });
})();

// === Service shutdown confirm flow ===
// - Service names render inside #system as .tag elements, in order.
// - Index to send is zero-based in the order they appear.

(function () {
  const sysEl = document.getElementById('system');
  if (!sysEl) return;

  // Elements for modal + toast
  const modal = document.getElementById('confirmModal');
  const modalTextSvc = modal?.querySelector('.svc-name');
  const btnOk = document.getElementById('confirmOk');
  const btnCancel = document.getElementById('confirmCancel');
  const globalToast = document.getElementById('globalToast');

  let pending = { index: null, name: null };

  function showModal(svcName, svcIndex) {
    pending = { index: svcIndex, name: svcName };
    if (modalTextSvc) modalTextSvc.textContent = svcName;
    modal?.classList.add('show');
    // focus the destructive CTA for quick keyboard flow
    btnOk?.focus();
  }
  function hideModal() {
    modal?.classList.remove('show');
    pending = { index: null, name: null };
  }
  function showGlobalToastMsg(msg, isError = false) {
    if (!globalToast) return;
    globalToast.textContent = msg;
    globalToast.classList.toggle('error', !!isError);
    globalToast.classList.add('show');
    setTimeout(() => globalToast.classList.remove('show'), 2400);
  }

  // Find service elements: any #system .tag (keeps your current visuals)
  function collectServiceTags() {
    return Array.from(sysEl.querySelectorAll('.tag'));
  }

  // Delegate clicks on #system .tag items
  sysEl.addEventListener('click', (ev) => {
    const tag = ev.target.closest('.tag');
    if (!tag || !sysEl.contains(tag)) return;

    const tags = collectServiceTags();
    const idx = tags.indexOf(tag);
    if (idx < 0) return;

    const svcName = (tag.textContent || '').trim();
    if (!svcName) return;

    showModal(svcName, idx);
  });

  // Modal close handlers
  modal?.addEventListener('click', (e) => {
    if (e.target?.dataset?.close === 'true') hideModal();
  });
  btnCancel?.addEventListener('click', hideModal);

  // Confirm => call backend
  btnOk?.addEventListener('click', async () => {
    const { index, name } = pending;
    if (index == null) return;

    const url = `/dev-console/service/${encodeURIComponent(name)}`;

    try {
      const res = await fetch(url, { method: 'DELETE' });
      hideModal();

      if (res.ok) {
        showGlobalToastMsg(`${name} shutting down...`, false);
      } else {
        showGlobalToastMsg(`Operation failed`, true);
      }
    } catch (err) {
      hideModal();
      showGlobalToastMsg(`Operation failed`, true);
    }
  });
})();
