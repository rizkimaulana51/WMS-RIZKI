(() => {
  'use strict';

  const ROUTES = {
    home:     { title: 'Dashboard',         desc: 'Ringkasan semua modul gudang',                       kw: 'dashboard beranda ringkasan home' },
    report:   { title: 'Report Daily',      desc: 'Generator laporan flooring dari data stock quant',   kw: 'report daily laporan flooring stock quant excel harian' },
    tracking: { title: 'Tracking Location', desc: 'Perpindahan barang dari PDF Location Transfer',      kw: 'tracking location lokasi pindah transfer pdf riwayat' },
    barcode:  { title: 'Barcode Scanning',  desc: 'Cek stok per barcode terhadap database Excel',       kw: 'barcode scanning scan stok database duplikat' },
  };

  const $ = (id) => document.getElementById(id);
  const navItems = [...document.querySelectorAll('.nav-item')];
  const sidebar = $('sidebar');
  const scrim = $('scrim');
  const search = $('search');
  let current = null;

  /* ---------- Sidebar mobile ---------- */
  const openMenu = () => { sidebar.classList.add('open'); scrim.classList.add('show'); };
  const closeMenu = () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); };
  $('menuBtn').addEventListener('click', openMenu);
  scrim.addEventListener('click', closeMenu);

  /* ---------- Muat iframe (lazy, sekali saja) ---------- */
  function ensureLoaded(route) {
    const view = $('view-' + route);
    const frame = view && view.querySelector('iframe');
    if (!frame || frame.dataset.loaded) return;
    frame.dataset.loaded = '1';
    frame.addEventListener('load', () => view.classList.add('ready'), { once: true });
    frame.src = frame.dataset.src;
  }

  /* ---------- Router berbasis hash ---------- */
  function go() {
    let route = (location.hash || '#home').slice(1);
    if (!ROUTES[route]) route = 'home';
    current = route;

    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + route; });
    navItems.forEach((a) => a.classList.toggle('active', a.dataset.route === route));

    $('pageTitle').textContent = ROUTES[route].title;
    $('pageDesc').textContent = ROUTES[route].desc;
    document.title = ROUTES[route].title + ' — WMS Hub';
    $('reloadBtn').hidden = route === 'home';

    if (route === 'home') renderDashboard(); else ensureLoaded(route);
    closeMenu();
  }
  window.addEventListener('hashchange', go);

  /* ---------- Muat ulang modul aktif ---------- */
  $('reloadBtn').addEventListener('click', () => {
    if (!current || current === 'home') return;
    const view = $('view-' + current);
    const frame = view.querySelector('iframe');
    view.classList.remove('ready');
    frame.src = frame.dataset.src;
    frame.addEventListener('load', () => view.classList.add('ready'), { once: true });
  });

  /* ---------- Pencarian modul (Ctrl+K) ---------- */
  const matches = (q) => Object.entries(ROUTES).filter(([, r]) => (r.title + ' ' + r.kw).toLowerCase().includes(q));
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    const hit = new Set(q ? matches(q).map(([k]) => k) : Object.keys(ROUTES));
    navItems.forEach((a) => a.classList.toggle('dim', !hit.has(a.dataset.route)));
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { search.value = ''; search.dispatchEvent(new Event('input')); search.blur(); }
    if (e.key === 'Enter') {
      const m = matches(search.value.trim().toLowerCase());
      if (m.length) { location.hash = '#' + m[0][0]; search.value = ''; search.dispatchEvent(new Event('input')); search.blur(); }
    }
  });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.focus(); search.select(); }
  });

  /* ---------- Jam & tanggal ---------- */
  const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function tick() {
    const d = new Date();
    $('clock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    $('date').textContent = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  tick();
  setInterval(tick, 15000);

  /* =========================================================
     DASHBOARD — data dibaca dari localStorage tiap modul
     ========================================================= */
  const readJSON = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
  };
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const sumRolls = (tx) => (tx.groups || []).reduce((s, g) => s + (Number(g.rolls) || 0), 0);

  function renderDashboard() {
    const trx = readJSON('wms_move_history_v1', []);
    const scans = readJSON('bsm_scans_v1', []);
    const sessions = readJSON('bsm_history_v1', []);
    const meta = readJSON('bsm_db_meta_v1', null);
    const T = Array.isArray(trx) ? trx : [];
    const S = Array.isArray(scans) ? scans : [];

    /* kartu statistik */
    const today = dayKey(new Date());
    const todayCount = T.filter((t) => t.date === today).length;
    const ok = S.filter((s) => s.status === 'ok').length;
    const dup = S.filter((s) => s.status === 'dup').length;
    const miss = S.filter((s) => s.status === 'missing').length;
    const rows = meta && meta.rowCount ? meta.rowCount : 0;
    $('st-trx').textContent = fmt(T.length);
    $('st-trx-sub').textContent = T.length ? `${fmt(todayCount)} transaksi hari ini` : 'Belum ada transaksi';
    $('st-scan').textContent = fmt(S.length);
    $('st-scan-sub').textContent = S.length ? `${fmt(ok)} valid, ${fmt(dup)} duplikat` : 'Belum ada scan';
    $('st-sess').textContent = fmt(Array.isArray(sessions) ? sessions.length : 0);
    $('st-db').textContent = fmt(rows);
    $('st-db-sub').textContent = rows ? 'Database stock aktif' : 'Belum dimuat';

    drawArea(T);
    drawDonut(ok, dup, miss);
    drawBars(T);
  }

  /* ---------- grafik area: roll per hari, 14 hari ---------- */
  function smooth(pts) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], cx = (x0 + x1) / 2;
      d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    return d;
  }
  function drawArea(T) {
    const N = 14, W = Math.max($('areaBox').clientWidth || 700, 320), H = Math.max($('areaBox').clientHeight || 238, 200), L = 16, R = 16, TOP = 44, BOT = 34;
    const days = [];
    for (let i = N - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    const per = Object.fromEntries(days.map((d) => [dayKey(d), 0]));
    T.forEach((t) => { if (t.date in per) per[t.date] += sumRolls(t); });
    const vals = days.map((d) => per[dayKey(d)]);
    const total = vals.reduce((a, b) => a + b, 0);
    const max = Math.max(...vals, 1);
    const pts = vals.map((v, i) => [L + (W - L - R) * i / (N - 1), H - BOT - (H - BOT - TOP) * (v / max)]);
    const path = smooth(pts);
    const peak = vals.indexOf(Math.max(...vals));
    const grid = [0, .5, 1].map((f) => `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${H - BOT - (H - BOT - TOP) * f}" y2="${H - BOT - (H - BOT - TOP) * f}"/>`).join('');
    const labels = days.map((d, i) => i % 2 === (N - 1) % 2 ? `<text class="ax" x="${pts[i][0]}" y="${H - 10}" text-anchor="${i === N - 1 ? 'end' : i === 0 ? 'start' : 'middle'}">${pad(d.getDate())}/${pad(d.getMonth() + 1)}</text>` : '').join('');
    let tip = '';
    if (total > 0) {
      const [px, py] = pts[peak];
      const tx = Math.min(Math.max(px, 44), W - 44);
      tip = `<circle cx="${px}" cy="${py}" r="6" fill="#fff" stroke="#8b7bff" stroke-width="3"/>
             <rect class="tip" x="${tx - 36}" y="${Math.max(py - 40, 6)}" width="72" height="26" rx="13"/>
             <text class="tip-t" x="${tx}" y="${Math.max(py - 40, 6) + 17}" text-anchor="middle">${fmt(vals[peak])} roll</text>`;
    }
    $('areaBox').innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik roll dipindahkan per hari">
        <defs>
          <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b7bff" stop-opacity=".6"/><stop offset=".6" stop-color="#6a7bff" stop-opacity=".18"/><stop offset="1" stop-color="#6a7bff" stop-opacity="0"/></linearGradient>
          <linearGradient id="gLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3aa0ff"/><stop offset=".55" stop-color="#a855f7"/><stop offset="1" stop-color="#ff6fb1"/></linearGradient>
        </defs>
        ${grid}
        <path d="${path} L${pts[N - 1][0]},${H - BOT} L${pts[0][0]},${H - BOT} Z" fill="url(#gArea)"/>
        <path class="draw" d="${path}" fill="none" stroke="url(#gLine)" stroke-width="4" stroke-linecap="round" pathLength="1400"/>
        ${tip}${labels}
      </svg>
      ${total ? '' : '<div class="chart-empty"><div><b>Belum ada perpindahan tersimpan</b>Upload PDF di Tracking Location, lalu simpan transaksinya.</div></div>'}`;
  }

  /* ---------- donut: status scan ---------- */
  function drawDonut(ok, dup, miss) {
    const total = ok + dup + miss;
    const C = 2 * Math.PI * 70;
    const seg = [
      { n: 'Valid', v: ok, c: 'url(#dOk)', dot: '#7c6cff' },
      { n: 'Duplikat', v: dup, c: 'url(#dDup)', dot: '#ffa45c' },
      { n: 'Tidak ditemukan', v: miss, c: 'url(#dMiss)', dot: '#ff6fb1' },
    ];
    let off = 0, arcs = '';
    if (total) {
      seg.forEach((s) => {
        if (!s.v) return;
        const len = C * s.v / total;
        arcs += `<circle cx="90" cy="90" r="70" fill="none" stroke="${s.c}" stroke-linecap="butt" stroke-dasharray="${Math.max(len - 3, 0.1)} ${C}" stroke-dashoffset="${-off}"/>`;
        off += len;
      });
    }
    const pct = total ? Math.round(ok / total * 100) : 0;
    $('donutBox').innerHTML = `
      <svg viewBox="0 0 180 180" role="img" aria-label="Komposisi hasil scan">
        <defs>
          <linearGradient id="dOk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3aa0ff"/><stop offset="1" stop-color="#8b7bff"/></linearGradient>
          <linearGradient id="dDup" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffa45c"/><stop offset="1" stop-color="#ff6a7a"/></linearGradient>
          <linearGradient id="dMiss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6fb1"/><stop offset="1" stop-color="#c15bff"/></linearGradient>
        </defs>
        <circle cx="90" cy="90" r="70" fill="none" stroke="rgba(255,255,255,.08)"/>
        ${arcs}
      </svg>
      <div class="ctr"><b>${total ? pct + '%' : '—'}</b><small>${total ? 'valid' : 'belum ada scan'}</small></div>`;
    $('legend').innerHTML = seg.map((s) => `<li><i style="background:${s.dot}"></i>${s.n}<span>${fmt(s.v)}</span></li>`).join('');
  }

  /* ---------- bar: tujuan terbanyak ---------- */
  function drawBars(T) {
    const by = {};
    T.forEach((t) => { if (t.dest) by[t.dest] = (by[t.dest] || 0) + sumRolls(t); });
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!top.length) {
      $('barsBox').innerHTML = '<div class="empty-note"><b>Belum ada data tujuan</b>Daftar muncul setelah ada transaksi di Tracking Location.</div>';
      return;
    }
    const max = top[0][1] || 1;
    const grads = ['linear-gradient(90deg,#8b7bff,#a855f7)', 'linear-gradient(90deg,#3aa0ff,#6a7bff)', 'linear-gradient(90deg,#ff6fb1,#c15bff)', 'linear-gradient(90deg,#ffa45c,#ff6a7a)', 'linear-gradient(90deg,#4ade80,#3aa0ff)'];
    $('barsBox').innerHTML = top.map(([name, v], i) =>
      `<div class="hb"><span class="nm" title="${esc(name)}">${esc(name)}</span><span class="tr"><i style="width:${Math.max(v / max * 100, 4)}%;background:${grads[i]}"></i></span><span class="vl">${fmt(v)}</span></div>`).join('');
  }

  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (current === 'home') renderDashboard(); }, 150); });

  go();
})();
