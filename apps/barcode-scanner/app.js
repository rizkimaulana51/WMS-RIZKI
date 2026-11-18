(() => {
  'use strict';

  /* ============================================================
     STATE
  ============================================================ */
  const state = {
    db: new Map(),          // barcode(string, normalized) -> record object
    dbMeta: null,           // { fileName, rowCount, loadedAt }
    scans: [],              // array of scan entries, newest first is NOT assumed; keep chronological
    seenBarcodes: new Map(),// barcode -> count of times scanned this session
    history: [],            // archived sessions: { id, owner, startTime, endTime, scans:[...] }
  };

  const STORAGE_KEYS = {
    db: 'bsm_db_v1',
    dbMeta: 'bsm_db_meta_v1',
    scans: 'bsm_scans_v1',
    history: 'bsm_history_v1',
  };

  /* ============================================================
     DOM REFS
  ============================================================ */
  const dbFileInput   = document.getElementById('dbFileInput');
  const dropzone       = document.getElementById('dropzone');
  const dbDot           = document.getElementById('dbDot');
  const dbStatusText   = document.getElementById('dbStatusText');
  const dbMetaBox      = document.getElementById('dbMeta');
  const dbFileName     = document.getElementById('dbFileName');
  const dbRowCount     = document.getElementById('dbRowCount');
  const dbLoadedAt     = document.getElementById('dbLoadedAt');
  const dbClearBtn     = document.getElementById('dbClearBtn');

  const scanForm   = document.getElementById('scanForm');
  const scanInput  = document.getElementById('scanInput');
  const sessionOwner = document.getElementById('sessionOwner');
  const resetSessionBtn = document.getElementById('resetSessionBtn');
  const archiveSessionBtn = document.getElementById('archiveSessionBtn');

  const toggleBatchBtn = document.getElementById('toggleBatchBtn');
  const batchPanel = document.getElementById('batchPanel');
  const batchInput = document.getElementById('batchInput');
  const processBatchBtn = document.getElementById('processBatchBtn');
  const clearBatchBtn = document.getElementById('clearBatchBtn');

  const copyAllBtn = document.getElementById('copyAllBtn');

  const historySub = document.getElementById('historySub');
  const historyGroups = document.getElementById('historyGroups');
  const historyOwnerFilter = document.getElementById('historyOwnerFilter');
  const downloadAllHistoryBtn = document.getElementById('downloadAllHistoryBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  const pivotScope = document.getElementById('pivotScope');
  const pivotBody = document.getElementById('pivotBody');
  const pivotFoot = document.getElementById('pivotFoot');
  const pivotSub = document.getElementById('pivotSub');
  const pivotNote = document.getElementById('pivotNote');
  const downloadPivotBtn = document.getElementById('downloadPivotBtn');

  const statTotal   = document.getElementById('statTotal');
  const statUnique  = document.getElementById('statUnique');
  const statDup     = document.getElementById('statDup');
  const statMissing = document.getElementById('statMissing');

  const warningsCard  = document.getElementById('warningsCard');
  const warningsList  = document.getElementById('warningsList');
  const warningsCount = document.getElementById('warningsCount');

  const resultsBody  = document.getElementById('resultsBody');
  const tableSub     = document.getElementById('tableSub');
  const tableFilter  = document.getElementById('tableFilter');
  const exportBtn    = document.getElementById('exportBtn');

  const toastEl = document.getElementById('toast');

  /* ============================================================
     UTIL
  ============================================================ */
  function normBarcode(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim().replace(/\s+/g, '');
  }

  function showToast(msg, ms = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('is-visible'), ms);
  }

  function fmtTime(d) {
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ============================================================
     PERSISTENCE (localStorage) — best effort, wrapped in try/catch
  ============================================================ */
  function persistDb() {
    try {
      const arr = Array.from(state.db.entries());
      localStorage.setItem(STORAGE_KEYS.db, JSON.stringify(arr));
      localStorage.setItem(STORAGE_KEYS.dbMeta, JSON.stringify(state.dbMeta));
    } catch (e) {
      console.warn('Tidak bisa menyimpan database ke localStorage (mungkin terlalu besar):', e);
    }
  }

  function persistScans() {
    try {
      localStorage.setItem(STORAGE_KEYS.scans, JSON.stringify(state.scans));
    } catch (e) {
      console.warn('Tidak bisa menyimpan sesi scan:', e);
    }
  }

  function persistHistory() {
    try {
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history));
    } catch (e) {
      console.warn('Tidak bisa menyimpan riwayat:', e);
    }
  }

  function loadPersisted() {
    try {
      const rawDb = localStorage.getItem(STORAGE_KEYS.db);
      const rawMeta = localStorage.getItem(STORAGE_KEYS.dbMeta);
      if (rawDb && rawMeta) {
        state.db = new Map(JSON.parse(rawDb));
        state.dbMeta = JSON.parse(rawMeta);
        renderDbStatus();
      }
    } catch (e) { console.warn('Gagal memuat database tersimpan', e); }

    try {
      const rawScans = localStorage.getItem(STORAGE_KEYS.scans);
      if (rawScans) {
        state.scans = JSON.parse(rawScans);
        state.seenBarcodes = new Map();
        for (const s of state.scans) {
          state.seenBarcodes.set(s.barcode, (state.seenBarcodes.get(s.barcode) || 0) + 1);
        }
        renderAll();
      }
    } catch (e) { console.warn('Gagal memuat sesi scan tersimpan', e); }

    try {
      const rawHistory = localStorage.getItem(STORAGE_KEYS.history);
      if (rawHistory) {
        state.history = JSON.parse(rawHistory);
        renderHistory();
        renderPivot();
      }
    } catch (e) { console.warn('Gagal memuat riwayat tersimpan', e); }
  }

  /* ============================================================
     DATABASE IMPORT
  ============================================================ */
  const COLUMN_ALIASES = {
    barcode: ['lot/serial number', 'lot serial number', 'barcode', 'serial', 'lot', 'sn', 'kode barcode'],
    productCode: ['product code', 'kode produk', 'sku'],
    productName: ['product/name', 'product name', 'nama produk', 'motif', 'product'],
    container: ['nomor container', 'container', 'no container'],
    location: ['location', 'lokasi'],
    warehouse: ['warehouse', 'gudang'],
    owner: ['stock owner', 'pemilik', 'pemilik stock', 'owner'],
    grade: ['grade'],
    gramasi: ['gramasi'],
    jenisPrint: ['jenis print', 'print type'],
    availableQty: ['available quantity', 'qty tersedia'],
    qty: ['quantity', 'qty'],
    uom: ['unit of measure', 'uom', 'satuan'],
    company: ['company', 'perusahaan'],
    incomingDate: ['incoming date', 'tanggal masuk'],
  };

  function mapHeaders(headerRow) {
    const norm = headerRow.map(h => String(h ?? '').trim().toLowerCase());
    const map = {}; // field -> column index
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      let idx = norm.findIndex(h => aliases.includes(h));
      map[field] = idx; // -1 if not found
    }
    // barcode column is mandatory; fall back to first column if not matched
    if (map.barcode === -1) map.barcode = 0;
    return map;
  }

  function handleDbFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

        if (!rows.length) throw new Error('File kosong');

        const headerRow = rows[0];
        const colMap = mapHeaders(headerRow);
        const dataRows = rows.slice(1).filter(r => r.some(c => c !== '' && c !== null && c !== undefined));

        const newDb = new Map();
        for (const r of dataRows) {
          const barcode = normBarcode(r[colMap.barcode]);
          if (!barcode) continue;
          const rec = {
            barcode,
            productCode: colMap.productCode >= 0 ? r[colMap.productCode] : '',
            productName: colMap.productName >= 0 ? r[colMap.productName] : '',
            container: colMap.container >= 0 ? r[colMap.container] : '',
            location: colMap.location >= 0 ? r[colMap.location] : '',
            warehouse: colMap.warehouse >= 0 ? r[colMap.warehouse] : '',
            owner: colMap.owner >= 0 ? r[colMap.owner] : '',
            grade: colMap.grade >= 0 ? r[colMap.grade] : '',
            gramasi: colMap.gramasi >= 0 ? r[colMap.gramasi] : '',
            jenisPrint: colMap.jenisPrint >= 0 ? r[colMap.jenisPrint] : '',
            availableQty: colMap.availableQty >= 0 ? r[colMap.availableQty] : '',
            qty: colMap.qty >= 0 ? r[colMap.qty] : '',
            uom: colMap.uom >= 0 ? r[colMap.uom] : '',
            company: colMap.company >= 0 ? r[colMap.company] : '',
            incomingDate: colMap.incomingDate >= 0 ? r[colMap.incomingDate] : '',
          };
          // last one wins if duplicate barcode rows exist in source file
          newDb.set(barcode, rec);
        }

        if (newDb.size === 0) throw new Error('Tidak ada baris dengan barcode valid pada kolom pertama.');

        state.db = newDb;
        state.dbMeta = {
          fileName: file.name,
          rowCount: newDb.size,
          loadedAt: new Date().toISOString(),
        };
        persistDb();
        renderDbStatus();
        showToast(`Database dimuat: ${newDb.size.toLocaleString('id-ID')} baris`);
      } catch (err) {
        console.error(err);
        alert('Gagal membaca file database: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function renderDbStatus() {
    if (state.db.size > 0 && state.dbMeta) {
      dbDot.className = 'dot dot--on';
      dbStatusText.textContent = `${state.dbMeta.rowCount.toLocaleString('id-ID')} barcode siap`;
      dbMetaBox.hidden = false;
      dbFileName.textContent = state.dbMeta.fileName;
      dbRowCount.textContent = state.dbMeta.rowCount.toLocaleString('id-ID');
      dbLoadedAt.textContent = new Date(state.dbMeta.loadedAt).toLocaleString('id-ID');
    } else {
      dbDot.className = 'dot dot--off';
      dbStatusText.textContent = 'Database belum dimuat';
      dbMetaBox.hidden = true;
    }
  }

  dbFileInput.addEventListener('change', () => {
    if (dbFileInput.files[0]) handleDbFile(dbFileInput.files[0]);
    dbFileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(evt =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); })
  );
  ['dragleave', 'drop'].forEach(evt =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('is-dragover'); })
  );
  dropzone.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (f) handleDbFile(f);
  });

  dbClearBtn.addEventListener('click', () => {
    if (!confirm('Hapus database yang sedang dimuat?')) return;
    state.db = new Map();
    state.dbMeta = null;
    localStorage.removeItem(STORAGE_KEYS.db);
    localStorage.removeItem(STORAGE_KEYS.dbMeta);
    renderDbStatus();
    showToast('Database dihapus');
  });

  /* ============================================================
     SCANNING
  ============================================================ */
  scanForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = scanInput.value;
    const barcode = normBarcode(raw);
    scanInput.value = '';
    if (!barcode) return;
    addScan(barcode);
  });

  function addScan(barcode, opts = {}) {
    const { render = true, flash = true } = opts;
    const rec = state.db.get(barcode);
    const isMissing = !rec;
    const priorCount = state.seenBarcodes.get(barcode) || 0;
    const isDup = priorCount >= 1;

    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      barcode,
      time: new Date().toISOString(),
      owner: sessionOwner.value.trim(),
      status: isMissing ? 'missing' : (isDup ? 'dup' : 'ok'),
      rec: rec || null,
      occurrence: priorCount + 1,
    };

    state.scans.push(entry);
    state.seenBarcodes.set(barcode, priorCount + 1);

    if (render) {
      persistScans();
      if (flash) flashInput(entry.status);
      renderAll({ scrollToId: entry.id });
    }
    return entry;
  }

  function flashInput(status) {
    const cls = status === 'ok' ? 'flash-ok' : status === 'dup' ? 'flash-dup' : 'flash-bad';
    scanInput.classList.remove('flash-ok', 'flash-dup', 'flash-bad');
    // force reflow to restart animation-like effect
    void scanInput.offsetWidth;
    scanInput.classList.add(cls);
    setTimeout(() => scanInput.classList.remove(cls), 450);
  }

  resetSessionBtn.addEventListener('click', () => {
    if (state.scans.length && !confirm('Kosongkan seluruh hasil scan sesi ini TANPA menyimpan ke riwayat? Data akan hilang permanen.')) return;
    state.scans = [];
    state.seenBarcodes = new Map();
    persistScans();
    renderAll();
    showToast('Sesi dikosongkan');
  });

  archiveSessionBtn.addEventListener('click', () => {
    if (state.scans.length === 0) {
      showToast('Belum ada scan di sesi ini');
      return;
    }
    const owner = sessionOwner.value.trim() || 'Tanpa nama';
    const times = state.scans.map(s => new Date(s.time).getTime());
    const session = {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      owner,
      startTime: new Date(Math.min(...times)).toISOString(),
      endTime: new Date(Math.max(...times)).toISOString(),
      scans: state.scans.map(s => ({ ...s })),
    };
    state.history.push(session);
    persistHistory();

    state.scans = [];
    state.seenBarcodes = new Map();
    persistScans();

    renderAll();
    showToast(`Sesi diarsipkan ke riwayat "${owner}"`);
  });

  /* ---- batch input (multi-barcode at once) ---- */
  toggleBatchBtn.addEventListener('click', () => {
    const willShow = batchPanel.hidden;
    batchPanel.hidden = !willShow;
    toggleBatchBtn.textContent = willShow ? '− Tutup input banyak barcode' : '+ Input banyak barcode sekaligus';
    if (willShow) batchInput.focus();
  });

  clearBatchBtn.addEventListener('click', () => {
    batchInput.value = '';
    batchInput.focus();
  });

  function parseBatchBarcodes(raw) {
    return raw
      .split(/[\r\n,;\t]+/)
      .map(s => normBarcode(s))
      .filter(Boolean);
  }

  processBatchBtn.addEventListener('click', () => {
    const barcodes = parseBatchBarcodes(batchInput.value);
    if (barcodes.length === 0) {
      showToast('Tidak ada barcode yang terbaca dari kotak input');
      return;
    }
    let ok = 0, dup = 0, missing = 0;
    for (const bc of barcodes) {
      const entry = addScan(bc, { render: false });
      if (entry.status === 'ok') ok++;
      else if (entry.status === 'dup') dup++;
      else missing++;
    }
    persistScans();
    renderAll();
    batchInput.value = '';
    showToast(`${barcodes.length} barcode diproses — ${ok} valid, ${dup} duplikat, ${missing} tidak ditemukan`, 3200);
  });

  // Allow pasting a multi-line list directly into the single scan input too:
  // if the pasted text contains more than one barcode, route it to batch processing.
  scanInput.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const barcodes = parseBatchBarcodes(text);
    if (barcodes.length > 1) {
      e.preventDefault();
      let ok = 0, dup = 0, missing = 0;
      for (const bc of barcodes) {
        const entry = addScan(bc, { render: false });
        if (entry.status === 'ok') ok++;
        else if (entry.status === 'dup') dup++;
        else missing++;
      }
      persistScans();
      renderAll();
      scanInput.value = '';
      showToast(`${barcodes.length} barcode ditempel & diproses — ${ok} valid, ${dup} duplikat, ${missing} tidak ditemukan`, 3200);
    }
  });

  function removeScan(id) {
    const idx = state.scans.findIndex(s => s.id === id);
    if (idx === -1) return;
    const [removed] = state.scans.splice(idx, 1);
    // recompute seenBarcodes + occurrence numbering for that barcode
    recomputeOccurrences();
    persistScans();
    renderAll();
  }

  function recomputeOccurrences() {
    state.seenBarcodes = new Map();
    for (const s of state.scans) {
      const prior = state.seenBarcodes.get(s.barcode) || 0;
      state.seenBarcodes.set(s.barcode, prior + 1);
      s.occurrence = prior + 1;
      const rec = state.db.get(s.barcode);
      s.rec = rec || null;
      s.status = !rec ? 'missing' : (prior >= 1 ? 'dup' : 'ok');
    }
  }

  // keep focus on scan input at all times unless user is typing elsewhere
  document.addEventListener('click', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;
    scanInput.focus();
  });
  window.addEventListener('load', () => scanInput.focus());

  /* ============================================================
     RENDER
  ============================================================ */
  function renderAll(opts = {}) {
    renderStats();
    renderWarnings();
    renderTable(opts);
    renderHistory();
    renderPivot();
  }

  function sessionCounts(scans) {
    const ok = scans.filter(s => s.status === 'ok').length;
    const dup = scans.filter(s => s.status === 'dup').length;
    const missing = scans.filter(s => s.status === 'missing').length;
    return { total: scans.length, ok, dup, missing };
  }

  function renderHistory() {
    // rebuild owner filter options
    const owners = Array.from(new Set(state.history.map(s => s.owner))).sort((a, b) => a.localeCompare(b, 'id'));
    const currentFilter = historyOwnerFilter.value;
    historyOwnerFilter.innerHTML = '<option value="">Semua pemilik</option>' +
      owners.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
    if (owners.includes(currentFilter)) historyOwnerFilter.value = currentFilter;

    if (state.history.length === 0) {
      historySub.textContent = 'Belum ada sesi diarsipkan';
      historyGroups.innerHTML = '<p class="history-empty" id="historyEmpty">Klik <strong>Arsipkan sesi ini</strong> di panel kiri untuk mulai menyimpan riwayat per pemilik.</p>';
      return;
    }

    const activeFilter = historyOwnerFilter.value;
    const filtered = activeFilter ? state.history.filter(s => s.owner === activeFilter) : state.history;

    historySub.textContent = `${state.history.length.toLocaleString('id-ID')} sesi · ${owners.length.toLocaleString('id-ID')} pemilik`;

    if (filtered.length === 0) {
      historyGroups.innerHTML = '<p class="history-empty">Tidak ada sesi untuk pemilik ini.</p>';
      return;
    }

    // group filtered sessions by owner
    const groups = new Map();
    for (const sess of filtered) {
      if (!groups.has(sess.owner)) groups.set(sess.owner, []);
      groups.get(sess.owner).push(sess);
    }

    const groupOwners = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'id'));

    historyGroups.innerHTML = groupOwners.map(owner => {
      const sessions = groups.get(owner).slice().sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      const allScans = sessions.flatMap(s => s.scans);
      const c = sessionCounts(allScans);
      const sessionsHtml = sessions.map(sess => {
        const sc = sessionCounts(sess.scans);
        const start = new Date(sess.startTime);
        const end = new Date(sess.endTime);
        const dateLabel = start.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        return `<div class="session-item" data-session-id="${sess.id}">
          <div class="session-item-info">
            <strong>${dateLabel} · ${fmtTime(start)}–${fmtTime(end)}</strong>
            <span>${sc.total} scan · ${sc.ok} valid · ${sc.dup} duplikat · ${sc.missing} tidak ditemukan</span>
          </div>
          <div class="session-item-actions">
            <button class="btn btn--ghost btn--sm" data-download-session="${sess.id}" type="button">Unduh</button>
            <button class="row-remove" title="Hapus sesi ini" data-delete-session="${sess.id}">✕</button>
          </div>
        </div>`;
      }).join('');

      return `<div class="owner-group" data-owner="${escapeHtml(owner)}">
        <div class="owner-group-head" data-toggle-owner>
          <span class="owner-name"><span class="chevron">▸</span>${escapeHtml(owner)}</span>
          <div class="owner-stats">
            <span class="owner-chip">${sessions.length} sesi</span>
            <span class="owner-chip owner-chip--ok">${c.ok} valid</span>
            <span class="owner-chip owner-chip--dup">${c.dup} duplikat</span>
            <span class="owner-chip owner-chip--bad">${c.missing} tidak ditemukan</span>
            <div class="owner-actions">
              <button class="btn btn--ghost btn--sm" data-download-owner="${escapeHtml(owner)}" type="button">Unduh semua</button>
            </div>
          </div>
        </div>
        <div class="owner-sessions">${sessionsHtml}</div>
      </div>`;
    }).join('');
  }

  historyOwnerFilter.addEventListener('change', () => renderHistory());

  historyGroups.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle-owner]');
    if (toggle) {
      toggle.closest('.owner-group').classList.toggle('is-open');
      return;
    }
    const dlSession = e.target.closest('[data-download-session]');
    if (dlSession) {
      downloadSession(dlSession.getAttribute('data-download-session'));
      return;
    }
    const delSession = e.target.closest('[data-delete-session]');
    if (delSession) {
      const id = delSession.getAttribute('data-delete-session');
      if (confirm('Hapus sesi ini dari riwayat?')) {
        state.history = state.history.filter(s => s.id !== id);
        persistHistory();
        renderHistory();
      }
      return;
    }
    const dlOwner = e.target.closest('[data-download-owner]');
    if (dlOwner) {
      downloadOwnerHistory(dlOwner.getAttribute('data-download-owner'));
      return;
    }
  });

  clearHistoryBtn.addEventListener('click', () => {
    if (state.history.length === 0) return;
    if (!confirm('Hapus SELURUH riwayat sesi (semua pemilik)? Tindakan ini tidak bisa dibatalkan.')) return;
    state.history = [];
    persistHistory();
    renderHistory();
    showToast('Riwayat dihapus');
  });

  /* ---- history export helpers ---- */

  function scanRowsForExport(scans, extra = {}) {
    return scans.map((s, i) => {
      const r = s.rec || {};
      return {
        'No': i + 1,
        'Barcode': s.barcode,
        'Status': s.status === 'ok' ? 'OK' : s.status === 'dup' ? 'DUPLIKAT' : 'TIDAK DITEMUKAN',
        'Nama Produk/Motif': r.productName || '',
        'Kode Produk': r.productCode || '',
        'Pemilik Stock': r.owner || '',
        'Grade': r.grade || '',
        'Gramasi': r.gramasi || '',
        'Jenis Print': r.jenisPrint || '',
        'Warehouse': r.warehouse || '',
        'Lokasi': r.location || '',
        'Qty': r.qty ?? '',
        'UoM': r.uom || '',
        'Sesi/Pemilik Scan': extra.owner ?? (s.owner || ''),
        'Waktu Scan': new Date(s.time).toLocaleString('id-ID'),
      };
    });
  }

  function downloadWorkbook(rows, filenamePrefix) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Scan');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    XLSX.writeFile(wb, `${filenamePrefix}-${stamp}.xlsx`);
  }

  function downloadSession(sessionId) {
    const sess = state.history.find(s => s.id === sessionId);
    if (!sess) return;
    const rows = scanRowsForExport(sess.scans, { owner: sess.owner });
    downloadWorkbook(rows, `riwayat-${slugify(sess.owner)}`);
  }

  function downloadOwnerHistory(owner) {
    const sessions = state.history.filter(s => s.owner === owner);
    const rows = sessions.flatMap(sess => scanRowsForExport(sess.scans, { owner: sess.owner }));
    downloadWorkbook(rows, `riwayat-${slugify(owner)}`);
  }

  downloadAllHistoryBtn.addEventListener('click', () => {
    if (state.history.length === 0) {
      showToast('Belum ada riwayat untuk diunduh');
      return;
    }
    const rows = state.history.flatMap(sess => scanRowsForExport(sess.scans, { owner: sess.owner }));
    downloadWorkbook(rows, 'riwayat-semua-pemilik');
  });

  function slugify(str) {
    return String(str).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sesi';
  }

  /* ============================================================
     PIVOT — Motif × Container (total roll & total meter)
  ============================================================ */
  function parseNum(v) {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined || v === '') return 0;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function syncPivotScopeOptions() {
    const owners = Array.from(new Set(state.history.map(s => s.owner))).sort((a, b) => a.localeCompare(b, 'id'));
    const current = pivotScope.value;
    const staticOpts = [
      '<option value="active">Sesi aktif</option>',
      '<option value="history-all">Riwayat — semua pemilik</option>',
    ];
    const ownerOpts = owners.map(o => `<option value="owner:${escapeHtml(o)}">Riwayat — ${escapeHtml(o)}</option>`);
    pivotScope.innerHTML = staticOpts.concat(ownerOpts).join('');
    const validValues = ['active', 'history-all', ...owners.map(o => `owner:${o}`)];
    if (validValues.includes(current)) pivotScope.value = current;
  }

  function getPivotSourceScans() {
    const scope = pivotScope.value;
    if (scope === 'active') return state.scans;
    if (scope === 'history-all') return state.history.flatMap(s => s.scans);
    if (scope.startsWith('owner:')) {
      const owner = scope.slice('owner:'.length);
      return state.history.filter(s => s.owner === owner).flatMap(s => s.scans);
    }
    return state.scans;
  }

  function computePivot(scans) {
    // only barcodes found in the database carry motif/container/qty data
    const found = scans.filter(s => s.rec);
    // dedupe by barcode so a barcode scanned twice (duplicate) is counted once as one physical roll
    const uniqueByBarcode = new Map();
    for (const s of found) {
      if (!uniqueByBarcode.has(s.barcode)) uniqueByBarcode.set(s.barcode, s);
    }
    const missingCount = scans.filter(s => !s.rec).length;
    const dupCount = scans.filter(s => s.status === 'dup').length;

    const groups = new Map(); // key: motif||container -> { motif, container, roll, meter }
    for (const s of uniqueByBarcode.values()) {
      const motif = s.rec.productName || '(Tanpa nama motif)';
      const container = s.rec.container || '(Tanpa no container)';
      const key = motif + '||' + container;
      if (!groups.has(key)) groups.set(key, { motif, container, roll: 0, meter: 0 });
      const g = groups.get(key);
      g.roll += 1;
      g.meter += parseNum(s.rec.qty);
    }

    const rows = Array.from(groups.values()).sort((a, b) =>
      a.motif.localeCompare(b.motif, 'id') || a.container.localeCompare(b.container, 'id')
    );
    return { rows, missingCount, dupCount, uniqueCount: uniqueByBarcode.size };
  }

  function renderPivot() {
    syncPivotScopeOptions();
    const source = getPivotSourceScans();
    const { rows, missingCount, dupCount, uniqueCount } = computePivot(source);

    if (source.length === 0) {
      pivotSub.textContent = 'Belum ada data untuk direkap';
      pivotBody.innerHTML = '<tr class="empty-row"><td colspan="4">Belum ada data untuk direkap.</td></tr>';
      pivotFoot.innerHTML = '';
      pivotNote.textContent = '';
      return;
    }

    pivotSub.textContent = `${rows.length.toLocaleString('id-ID')} kombinasi motif × container`;

    if (rows.length === 0) {
      pivotBody.innerHTML = '<tr class="empty-row"><td colspan="4">Tidak ada barcode valid (ditemukan di database) pada cakupan ini.</td></tr>';
      pivotFoot.innerHTML = '';
    } else {
      pivotBody.innerHTML = rows.map(r => `<tr>
        <td>${escapeHtml(r.motif)}</td>
        <td class="barcode-cell">${escapeHtml(r.container)}</td>
        <td>${r.roll.toLocaleString('id-ID')}</td>
        <td>${r.meter.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
      </tr>`).join('');

      const totalRoll = rows.reduce((a, r) => a + r.roll, 0);
      const totalMeter = rows.reduce((a, r) => a + r.meter, 0);
      pivotFoot.innerHTML = `<tr>
        <td colspan="2">Total (${uniqueCount.toLocaleString('id-ID')} roll unik)</td>
        <td>${totalRoll.toLocaleString('id-ID')}</td>
        <td>${totalMeter.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
      </tr>`;
    }

    const noteParts = [];
    if (dupCount > 0) noteParts.push(`${dupCount} scan duplikat dihitung sekali per barcode`);
    if (missingCount > 0) noteParts.push(`${missingCount} barcode tidak ditemukan di database dan tidak masuk pivot`);
    pivotNote.textContent = noteParts.length ? `Catatan: ${noteParts.join('; ')}.` : '';
  }

  pivotScope.addEventListener('change', renderPivot);

  downloadPivotBtn.addEventListener('click', () => {
    const source = getPivotSourceScans();
    const { rows } = computePivot(source);
    if (rows.length === 0) {
      showToast('Belum ada data pivot untuk diunduh');
      return;
    }
    const exportRows = rows.map(r => ({
      'Nama Motif': r.motif,
      'No Container': r.container,
      'Total Roll': r.roll,
      'Total Meter': Number(r.meter.toFixed(2)),
    }));
    const totalRoll = rows.reduce((a, r) => a + r.roll, 0);
    const totalMeter = rows.reduce((a, r) => a + r.meter, 0);
    exportRows.push({
      'Nama Motif': 'TOTAL', 'No Container': '',
      'Total Roll': totalRoll, 'Total Meter': Number(totalMeter.toFixed(2)),
    });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pivot Motif-Container');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const scopeLabel = pivotScope.value === 'active' ? 'sesi-aktif' : slugify(pivotScope.options[pivotScope.selectedIndex].text);
    XLSX.writeFile(wb, `pivot-${scopeLabel}-${stamp}.xlsx`);
  });

  function renderStats() {
    const total = state.scans.length;
    const ok = state.scans.filter(s => s.status === 'ok').length;
    const dup = state.scans.filter(s => s.status === 'dup').length;
    const missing = state.scans.filter(s => s.status === 'missing').length;
    statTotal.textContent = total.toLocaleString('id-ID');
    statUnique.textContent = ok.toLocaleString('id-ID');
    statDup.textContent = dup.toLocaleString('id-ID');
    statMissing.textContent = missing.toLocaleString('id-ID');
  }

  function renderWarnings() {
    const issues = state.scans.filter(s => s.status !== 'ok');
    if (issues.length === 0) {
      warningsCard.hidden = true;
      warningsList.innerHTML = '';
      return;
    }
    warningsCard.hidden = false;
    warningsCount.textContent = `${issues.length} isu`;
    warningsList.innerHTML = issues.slice().reverse().map(s => {
      if (s.status === 'dup') {
        const name = s.rec ? escapeHtml(s.rec.productName || '—') : '—';
        return `<li class="warning-item">
          <span class="warning-badge">Duplikat</span>
          <span class="warning-text">Barcode <code>${escapeHtml(s.barcode)}</code> sudah discan sebelumnya (scan ke-${s.occurrence}) — item: <strong>${name}</strong></span>
        </li>`;
      }
      return `<li class="warning-item is-missing">
        <span class="warning-badge">Tidak ada</span>
        <span class="warning-text">Barcode <code>${escapeHtml(s.barcode)}</code> tidak ditemukan di database.</span>
      </li>`;
    }).join('');
  }

  function renderTable(opts = {}) {
    const filterVal = tableFilter.value.trim().toLowerCase();
    let rows = state.scans;
    if (filterVal) {
      rows = rows.filter(s => {
        const hay = [
          s.barcode, s.rec?.productName, s.rec?.productCode, s.rec?.owner,
          s.rec?.grade, s.rec?.jenisPrint, s.rec?.warehouse, s.rec?.location,
        ].map(v => String(v ?? '').toLowerCase()).join(' ');
        return hay.includes(filterVal);
      });
    }

    if (state.scans.length === 0) {
      tableSub.textContent = 'Belum ada barcode discan';
    } else {
      tableSub.textContent = `${state.scans.length.toLocaleString('id-ID')} baris${filterVal ? ` · ${rows.length} cocok filter` : ''}`;
    }

    if (rows.length === 0) {
      resultsBody.innerHTML = `<tr class="empty-row"><td colspan="15">${
        state.scans.length === 0
          ? 'Belum ada data. Scan barcode pertama Anda di panel kiri.'
          : 'Tidak ada hasil yang cocok dengan filter.'
      }</td></tr>`;
      return;
    }

    // show newest first
    const ordered = rows.slice().reverse();
    resultsBody.innerHTML = ordered.map((s, i) => {
      const n = rows.length - i;
      const r = s.rec || {};
      const statusHtml = s.status === 'ok'
        ? '<span class="status-pill status-pill--ok">OK</span>'
        : s.status === 'dup'
          ? '<span class="status-pill status-pill--dup">Duplikat</span>'
          : '<span class="status-pill status-pill--missing">Tidak ada</span>';
      const rowClass = s.status === 'dup' ? 'row--dup' : s.status === 'missing' ? 'row--missing' : '';
      const time = new Date(s.time);
      return `<tr class="${rowClass}" data-id="${s.id}">
        <td>${n}</td>
        <td class="barcode-cell">${escapeHtml(s.barcode)}</td>
        <td>${statusHtml}</td>
        <td>${escapeHtml(r.productName || (s.status === 'missing' ? '—' : ''))}</td>
        <td>${escapeHtml(r.productCode || '')}</td>
        <td>${escapeHtml(r.owner || '')}</td>
        <td>${escapeHtml(r.grade || '')}</td>
        <td>${escapeHtml(r.gramasi || '')}</td>
        <td>${escapeHtml(r.jenisPrint || '')}</td>
        <td>${escapeHtml(r.warehouse || '')}</td>
        <td>${escapeHtml(r.location || '')}</td>
        <td>${escapeHtml(r.qty ?? '')}</td>
        <td>${escapeHtml(r.uom || '')}</td>
        <td>${fmtTime(time)}</td>
        <td>
          <div class="row-actions">
            <button class="row-copy" title="Salin barcode ini" data-copy="${escapeHtml(s.barcode)}">Copy</button>
            <button class="row-remove" title="Hapus baris" data-remove="${s.id}">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  resultsBody.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      const barcode = copyBtn.getAttribute('data-copy');
      copyText(barcode).then(() => {
        showToast(`Barcode disalin: ${barcode}`, 1600);
        copyBtn.textContent = 'Tersalin';
        copyBtn.classList.add('is-copied');
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('is-copied');
        }, 1200);
      });
      return;
    }
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    removeScan(btn.getAttribute('data-remove'));
  });

  copyAllBtn.addEventListener('click', () => {
    const filterVal = tableFilter.value.trim().toLowerCase();
    let rows = state.scans;
    if (filterVal) {
      rows = rows.filter(s => {
        const hay = [
          s.barcode, s.rec?.productName, s.rec?.productCode, s.rec?.owner,
          s.rec?.grade, s.rec?.jenisPrint, s.rec?.warehouse, s.rec?.location,
        ].map(v => String(v ?? '').toLowerCase()).join(' ');
        return hay.includes(filterVal);
      });
    }
    if (rows.length === 0) {
      showToast('Tidak ada barcode untuk disalin');
      return;
    }
    const text = rows.map(s => s.barcode).join('\n');
    copyText(text).then(() => {
      showToast(`${rows.length} barcode disalin ke clipboard`);
    });
  });

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    return new Promise((resolve) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); } catch (e) { console.warn('Copy fallback gagal', e); }
      document.body.removeChild(ta);
      resolve();
    });
  }

  tableFilter.addEventListener('input', () => renderTable());

  /* ============================================================
     EXPORT
  ============================================================ */
  exportBtn.addEventListener('click', () => {
    if (state.scans.length === 0) {
      showToast('Belum ada data untuk diexport');
      return;
    }
    const rows = state.scans.map((s, i) => {
      const r = s.rec || {};
      return {
        'No': i + 1,
        'Barcode': s.barcode,
        'Status': s.status === 'ok' ? 'OK' : s.status === 'dup' ? 'DUPLIKAT' : 'TIDAK DITEMUKAN',
        'Nama Produk/Motif': r.productName || '',
        'Kode Produk': r.productCode || '',
        'Pemilik Stock': r.owner || '',
        'Grade': r.grade || '',
        'Gramasi': r.gramasi || '',
        'Jenis Print': r.jenisPrint || '',
        'Warehouse': r.warehouse || '',
        'Lokasi': r.location || '',
        'Qty': r.qty ?? '',
        'UoM': r.uom || '',
        'Sesi/Pemilik Scan': s.owner || '',
        'Waktu Scan': new Date(s.time).toLocaleString('id-ID'),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hasil Scan');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    XLSX.writeFile(wb, `hasil-scan-${stamp}.xlsx`);
  });

  /* ============================================================
     INIT
  ============================================================ */
  loadPersisted();
  renderAll();
})();
