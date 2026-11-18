(() => {
  'use strict';

  const ROUTES = {
    home:     { title: 'Dashboard',         desc: 'Ringkasan semua modul gudang' },
    report:   { title: 'Report Daily',      desc: 'Generator laporan flooring dari data stock quant' },
    tracking: { title: 'Tracking Location', desc: 'Perpindahan barang dari PDF Location Transfer' },
    barcode:  { title: 'Barcode Scanning',  desc: 'Cek stok per barcode terhadap database Excel' },
  };

  const $ = (id) => document.getElementById(id);
  const navItems = [...document.querySelectorAll('.nav-item')];
  const sidebar = $('sidebar');
  const scrim = $('scrim');
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

    if (route === 'home') refreshStats(); else ensureLoaded(route);
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

  /* ---------- Statistik dashboard (dibaca dari localStorage modul) ---------- */
  const readJSON = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
  };
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID');
  function refreshStats() {
    const trx = readJSON('wms_move_history_v1', []);
    const scans = readJSON('bsm_scans_v1', []);
    const sessions = readJSON('bsm_history_v1', []);
    const meta = readJSON('bsm_db_meta_v1', null);
    $('st-trx').textContent = fmt(Array.isArray(trx) ? trx.length : 0);
    $('st-scan').textContent = fmt(Array.isArray(scans) ? scans.length : 0);
    $('st-sess').textContent = fmt(Array.isArray(sessions) ? sessions.length : 0);
    $('st-db').textContent = fmt(meta && meta.rowCount);
  }

  go();
})();
