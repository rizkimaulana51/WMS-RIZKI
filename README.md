# WMS Hub

Satu web untuk tiga aplikasi gudang: **Report Daily**, **Tracking Location**, **Barcode Scanning**.
Tampilan glassmorphism, tanpa build step (HTML + CSS + JavaScript murni).

## Struktur
```
index.html            -> shell (sidebar, dashboard, router)
css/shell.css         -> tema glassmorphism shell
js/shell.js           -> navigasi, jam, statistik dashboard
apps/
  _shared/glass-app.css  -> tema glass untuk ketiga aplikasi
  report-daily/          -> project REPORT-DAILY
  tracking-location/     -> project tracking-Location
  barcode-scanner/       -> project barcode-scanning-app
vercel.json
```

## Jalankan lokal
```
npx serve .
```

## Deploy ke Vercel
1. Upload folder ini ke GitHub, lalu **Add New Project** di Vercel dan pilih repo-nya.
   Framework Preset: **Other**. Build Command & Output Directory: kosongkan.
2. Atau lewat CLI: `npm i -g vercel` lalu `vercel --prod` di folder ini.

## Menambah modul baru
1. Taruh project di `apps/nama-modul/`.
2. Tambah satu `<a class="nav-item">` di sidebar dan satu `<section class="view frame-view">` di `index.html`.
3. Tambah entri di objek `ROUTES` pada `js/shell.js`.

Catatan: semua data tersimpan di localStorage browser (per perangkat).
