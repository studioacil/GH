'use strict';
/* ============================================================
   MAQUETTE 2027 — prototype interactif (logos SVG maison)
   ============================================================ */

/* ---- Icônes SVG (sprite dans index.html) ---- */
function ico(name, size) {
  const s = size || 1.15;
  return '<svg class="ico" style="width:' + s + 'em;height:' + s + 'em" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
}

/* ---- Réglages (fixes pour la maquette) ---- */
const RATE = 30, SEUIL_NOIR = 22.5, SEUIL_ETOILE = 37.5, SEUIL_DOUBLE = 60;
const ZONE_COLORS = { double: '#5ac8fa', etoile: '#ffd60a', verte: '#30d158', rouge: '#ff453a', noire: '#3a3a3e' };
const ZONE_ICON = { double: 'zone-double', etoile: 'zone-etoile', verte: 'zone-verte', rouge: 'zone-rouge', noire: 'zone-noire' };
const ZONE_LABEL = { double: 'Diamant', etoile: 'Étoile', verte: 'Verte', rouge: 'Rouge', noire: 'Noire' };
const zIcon = (z, size) => ico(ZONE_ICON[z], size);

function zoneDe(t) {
  if (!isFinite(t)) return 'double';
  if (t >= SEUIL_DOUBLE) return 'double';
  if (t >= SEUIL_ETOILE) return 'etoile';
  if (t >= RATE) return 'verte';
  if (t >= SEUIL_NOIR) return 'rouge';
  return 'noire';
}
function seuilsTemps(p) {
  return { double: p * 3600 / SEUIL_DOUBLE, etoile: p * 3600 / SEUIL_ETOILE, verte: p * 3600 / RATE, rouge: p * 3600 / SEUIL_NOIR };
}
const taux = (p, s) => (s > 0 ? p / (s / 3600) : Infinity);

/* ---- Format ---- */
const fmtMoney = (v) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtDur = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (h > 0) return h + ' h ' + String(m).padStart(2, '0');
  if (m > 0) return m + ' min ' + String(ss).padStart(2, '0') + ' s';
  return ss + ' s';
};
const fmtClock = (s) => {
  s = Math.abs(Math.round(s));
  const m = Math.floor(s / 60), ss = s % 60;
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
};
const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};
const monthKey = (iso) => iso.slice(0, 7);
const monthLabel = (k) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

/* ---- Données factices ---- */
let rides = [
  { date: '2026-10-05T08:12:00Z', price: 12, actual: 3600, platform: 'uber', phases: [{ label: 'Approche', icon: 'pin', sec: 1200 }, { label: 'Course', icon: 'car', sec: 2400 }] },
  { date: '2026-11-20T17:51:00Z', price: 14.67, actual: 2267, platform: 'uber', phases: [{ label: 'Approche', icon: 'pin', sec: 1119 }, { label: 'Course', icon: 'car', sec: 1148 }] },
  { date: '2026-11-21T12:03:00Z', price: 40, actual: 1800, platform: 'bolt', phases: [{ label: 'Approche', icon: 'pin', sec: 600 }, { label: 'Course', icon: 'car', sec: 1200 }] },
  { date: '2026-11-22T09:30:00Z', price: 25, actual: 3000, platform: 'uber', phases: [{ label: 'Approche', icon: 'pin', sec: 900 }, { label: 'Course', icon: 'car', sec: 2100 }] },
].map((r) => ({ ...r, taux: taux(r.price, r.actual), zone: zoneDe(taux(r.price, r.actual)) }));
const DEMO_RIDES = JSON.parse(JSON.stringify(rides)); // snapshot pour « Données de démo »

const zoneVisible = { double: true, etoile: true, verte: true, rouge: true, noire: true };
let monthSel = null;

/* ---- DOM ---- */
const $ = (id) => document.getElementById(id);
const priceInput = $('priceInput'), zonePills = $('zonePills');
const ring = $('ring'), ringProgress = $('ringProgress'), clockEl = $('clock'), clockZone = $('clockZone');
const statusLine = $('statusLine'), phaseChips = $('phaseChips');
const ringWrap = $('ringWrap');
const orbiter = $('orbiter'), orbDot = $('orbDot');
const segZones = $('segZones'), segEuro = $('segEuro');
const ambient = $('ambient'), toastEl = $('toast');
const periodSel = $('periodSel'), recap = $('recap'), etat = $('etat'), ridesList = $('ridesList');

/* ---- Navigation ---- */
document.querySelectorAll('#tabbar .tab').forEach((t) => t.addEventListener('click', () => showScreen(t.dataset.scr)));
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
  document.querySelectorAll('#tabbar .tab').forEach((x) => x.classList.toggle('active', x.dataset.scr === id));
}

/* ---- Toast ---- */
let toastT = null;
function toast(msg) {
  toastEl.innerHTML = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

/* ---- Halo ambiant ---- */
function setAmbient(zone) {
  ambient.style.setProperty('--halo', ZONE_COLORS[zone] || '#30d158');
}

/* ---- Écran Course ---- */
function currentPrice() {
  const v = parseFloat(String(priceInput.value).replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}
function updateCourse() {
  const p = currentPrice();
  $('btnUber').disabled = $('btnBolt').disabled = p === null;
  if (p === null) { zonePills.innerHTML = ''; return; }
  const s = seuilsTemps(p);
  zonePills.innerHTML =
    pill('double', 'moins de ' + fmtDur(s.double)) +
    pill('etoile', 'jusqu’à ' + fmtDur(s.etoile)) +
    pill('verte', 'jusqu’à ' + fmtDur(s.verte)) +
    pill('rouge', 'jusqu’à ' + fmtDur(s.rouge)) +
    pill('noire', 'au-delà de ' + fmtDur(s.rouge));
}
function pill(zone, txt) {
  return '<div class="zonePill zp-' + zone + '"><span class="zpEmoji">' + zIcon(zone, 1.3) + '</span>' +
    '<span class="zpLabel">' + ZONE_LABEL[zone] + '</span><span class="zpTime">' + txt + '</span></div>';
}
priceInput.addEventListener('input', updateCourse);

/* ---- Chrono ---- */
const PHASES = [{ label: 'Approche', icon: 'pin' }, { label: 'Course', icon: 'car' }];
const timer = { running: false, iv: null, start: 0, price: 0, platform: 'uber', total: 0, seuils: null, marks: [], phaseIdx: 0, lastZone: null, speed: 1 };
let displayMode = 'zones';
function setDisplay(mode) {
  displayMode = mode === 'euro' ? 'euro' : 'zones';
  segZones.classList.toggle('on', displayMode === 'zones');
  segEuro.classList.toggle('on', displayMode === 'euro');
  // le compteur € prend la place du chrono au centre de l'anneau (jamais les deux)
  // NB: style.display et pas l'attribut hidden, sinon le display:flex du CSS l'écrase
  $('clock').style.display = displayMode === 'euro' ? 'none' : 'flex';
  $('euroCenter').style.display = displayMode === 'euro' ? 'flex' : 'none';
  if (timer.running) tick();
}
segZones.addEventListener('click', () => setDisplay('zones'));
segEuro.addEventListener('click', () => setDisplay('euro'));

function startChrono(platform) {
  const p = currentPrice();
  if (p === null) return;
  timer.running = true;
  timer.price = p;
  timer.platform = platform;
  timer.seuils = seuilsTemps(p);
  timer.total = timer.seuils.rouge * 1.15;
  timer.marks = [];
  timer.phaseIdx = 0;
  timer.lastZone = null;
  timer.start = performance.now();
  $('chronoPlat').innerHTML = (platform === 'bolt' ? ico('bolt', 1.1) : ico('uber', 1.1)) + ' ' + (platform === 'bolt' ? 'Bolt' : 'Uber');
  $('btnPhase').classList.remove('hidden');
  buildRing();
  showScreen('scr-chrono');
  tick();
  timer.iv = setInterval(tick, 100);
}
function elapsed() { return ((performance.now() - timer.start) / 1000) * timer.speed; }
const HOUR = 3600; // le cercle = 60 minutes (1 tour complet = 1 h)
function ringStops(s) {
  const cap = (v) => Math.min(v, HOUR);
  const stops = [
    ['double', 0, cap(s.double)],
    ['etoile', cap(s.double), cap(s.etoile)],
    ['verte', cap(s.etoile), cap(s.verte)],
    ['rouge', cap(s.verte), cap(s.rouge)],
    ['noire', cap(s.rouge), HOUR],
  ].filter(([, a, b]) => b > a + 0.01);
  if (!stops.length) stops.push(['noire', 0, HOUR]);
  return stops;
}
function buildRing() {
  const stops = ringStops(timer.seuils);
  const base = 'conic-gradient(' + // from 0deg = MIDI, sens horaire
    stops.map(([z, a, b]) => ZONE_COLORS[z] + ' ' + (a / HOUR * 100) + '% ' + (b / HOUR * 100) + '%').join(', ') + ')';
  ring.style.background = base;
  ringProgress.style.background = base;
  ringProgress.style.opacity = '0.25';
}
function tick() {
  const e = elapsed();
  const s = timer.seuils;
  const tx = taux(timer.price, e);
  const zone = zoneDe(tx);
  // minutes en gros, secondes en petit
  const mm = Math.floor(e / 60), ss = Math.floor(e % 60);
  $('clockMin').textContent = String(mm).padStart(2, '0');
  $('clockSec').textContent = String(ss).padStart(2, '0');
  clockEl.style.color = ZONE_COLORS[zone];
  clockZone.innerHTML = zIcon(zone, 1.1) + ' ' + ZONE_LABEL[zone];
  clockZone.style.color = ZONE_COLORS[zone];
  setAmbient(zone);
  // Anneau = 60 min : 15 min = 1er quart (90°). La petite voiture fait un tour par heure.
  const fillDeg = Math.min(e, HOUR) / HOUR * 360;
  const orbitDeg = (e / HOUR * 360) % 360;
  if (orbiter) orbiter.style.transform = 'rotate(' + orbitDeg + 'deg)';
  if (orbDot) orbDot.style.boxShadow = '0 0 16px 6px ' + ZONE_COLORS[zone] + ', 0 0 4px 2px #fff';
  const stops = ringStops(s);
  const parts = stops.map(([z, a, b]) => {
    const startDeg = a / HOUR * 360, endDeg = b / HOUR * 360;
    const visEnd = Math.min(Math.max(fillDeg - startDeg, 0), endDeg - startDeg) / 360 * 100;
    return ZONE_COLORS[z] + ' ' + (a / HOUR * 100) + '% ' + (a / HOUR * 100 + visEnd) + '%';
  });
  ringProgress.style.background = 'conic-gradient(' + parts.join(', ') + ', transparent ' + (fillDeg / 360 * 100) + '% 100%)';
  ringProgress.style.opacity = '1';
  const txF = tx.toFixed(1).replace('.', ',');
  let st = '';
  if (zone === 'double') st = zIcon('double') + ' Diamant — ' + txF + ' €/h · passage en étoile dans ' + fmtClock(Math.max(0, s.double - e));
  else if (zone === 'etoile') st = zIcon('etoile') + ' Étoile — ' + txF + ' €/h · passage en verte dans ' + fmtClock(Math.max(0, s.etoile - e));
  else if (zone === 'verte') st = zIcon('verte') + ' Verte — ' + txF + ' €/h · passage en rouge dans ' + fmtClock(Math.max(0, s.verte - e));
  else if (zone === 'rouge') st = zIcon('rouge') + ' Rouge — ' + txF + ' €/h · passage en noire dans ' + fmtClock(Math.max(0, s.rouge - e));
  else st = zIcon('noire') + ' ZONE NOIRE — ' + txF + ' €/h';
  statusLine.innerHTML = st;
  const durs = phaseDurs(e);
  phaseChips.innerHTML = PHASES.map((d, i) => '<span class="phaseChip">' + ico(d.icon, 0.95) + ' ' + d.label + ' ' + fmtClock(durs[i]) + '</span>').join('');
  if (displayMode === 'euro') {
    // compteur € seul, au centre, couleur = zone (mêmes tailles que le chrono)
    const ev = e * RATE / 3600;
    const ei = Math.floor(ev);
    const ed = Math.min(99, Math.round((ev - ei) * 100));
    $('euroInt').textContent = String(ei);
    $('euroDec').textContent = ',' + String(ed).padStart(2, '0');
    $('euroCenter').style.color = ZONE_COLORS[zone];
  }
  if (zone !== timer.lastZone) { if (navigator.vibrate && (zone === 'rouge' || zone === 'noire')) navigator.vibrate(zone === 'noire' ? [200, 80, 200] : 60); timer.lastZone = zone; }
}
function phaseDurs(e) {
  const durs = []; let prev = 0;
  for (let i = 0; i < PHASES.length; i++) {
    if (i < timer.marks.length) { durs.push(Math.max(0, timer.marks[i] - prev)); prev = timer.marks[i]; }
    else if (i === timer.phaseIdx) { durs.push(Math.max(0, e - prev)); prev = e; }
    else durs.push(0);
  }
  return durs;
}
$('btnPhase').addEventListener('click', () => {
  if (!timer.running || timer.phaseIdx >= PHASES.length - 1) return;
  timer.marks[timer.phaseIdx] = elapsed();
  timer.phaseIdx++;
  if (navigator.vibrate) navigator.vibrate(40);
  $('btnPhase').classList.add('hidden');
  toast(ico('car', 1) + ' Course commencée — approche : ' + fmtClock(timer.marks[0]));
});
/* ---- Mode démo ×10 (global : case dispo sur Course et Chrono, badge « démo ×10 ») ---- */
function setDemoX10(on) {
  timer.speed = on ? 10 : 1;
  document.querySelectorAll('.demoSpeed').forEach((c) => { c.checked = on; });
  document.querySelectorAll('.demoBadge').forEach((b) => b.classList.toggle('hidden', !on));
  toast(on ? ico('clock', 1) + ' Mode démo ×10 : le chrono avance 10× plus vite.' : 'Mode démo ×10 désactivé.');
}
document.querySelectorAll('.demoSpeed').forEach((c) => c.addEventListener('change', (e) => setDemoX10(e.target.checked)));

function stopChrono() {
  if (!timer.running) return;
  const e = Math.max(elapsed(), 1);
  const durs = phaseDurs(e);
  const phases = PHASES.map((d, i) => ({ label: d.label, icon: d.icon, sec: Math.round(durs[i]) }));
  const r = { date: new Date().toISOString(), price: timer.price, actual: Math.round(e), platform: timer.platform, phases: phases };
  r.taux = taux(r.price, r.actual); r.zone = zoneDe(r.taux);
  rides.push(r);
  clearInterval(timer.iv); timer.running = false;
  setAmbient('verte');
  priceInput.value = '';
  updateCourse();
  renderHistory();
  showScreen('scr-course');
  toast(zIcon(r.zone, 1.1) + ' Enregistré : ' + fmtMoney(r.price) + ' en ' + fmtDur(r.actual) + ' → ' + r.taux.toFixed(1).replace('.', ',') + ' €/h');
}
$('btnStop').addEventListener('click', stopChrono);
$('btnCancel').addEventListener('click', () => {
  clearInterval(timer.iv); timer.running = false; setAmbient('verte');
  showScreen('scr-course'); toast('Chrono annulé.');
});
$('btnUber').addEventListener('click', () => startChrono('uber'));
$('btnBolt').addEventListener('click', () => startChrono('bolt'));

/* ---- Historique ---- */
function renderPeriods() {
  const periods = [...new Set(rides.map((r) => monthKey(r.date)))].sort().reverse();
  const years = [...new Set(rides.map((r) => r.date.slice(0, 4)))].sort().reverse();
  const current = monthKey(new Date().toISOString());
  if (monthSel === null) monthSel = periods.includes(current) ? current : 'all';
  const keys = ['all', ...years.map((y) => 'Y:' + y), ...periods];
  const statsOf = (pred) => {
    const l = rides.filter(pred);
    const tp = l.reduce((s, r) => s + r.price, 0), ts = l.reduce((s, r) => s + r.actual, 0);
    return { icon: l.length && ts ? zIcon(zoneDe(tp / (ts / 3600)), 1.1) : '', total: tp };
  };
  periodSel.innerHTML = keys.map((k) => {
    let label, st;
    if (k === 'all') { st = statsOf(() => true); label = st.icon + ' Toutes les périodes (' + fmtMoney(st.total) + ')'; }
    else if (k.startsWith('Y:')) { const y = k.slice(2); st = statsOf((r) => r.date.slice(0, 4) === y); label = st.icon + ' ' + ico('cal', 1) + ' ' + y + ' (' + fmtMoney(st.total) + ')'; }
    else { st = statsOf((r) => monthKey(r.date) === k); label = st.icon + ' ' + monthLabel(k) + ' (' + fmtMoney(st.total) + ')'; }
    return '<option value="' + k + '"' + (k === monthSel ? ' selected' : '') + '>' + label + '</option>';
  }).join('');
}
function renderHistory() {
  renderPeriods();
  let list;
  if (monthSel === 'all') list = rides.slice();
  else if (monthSel.startsWith('Y:')) list = rides.filter((r) => r.date.slice(0, 4) === monthSel.slice(2));
  else list = rides.filter((r) => monthKey(r.date) === monthSel);
  list = list.filter((r) => zoneVisible[r.zone]);

  if (!list.length) { recap.innerHTML = '<p style="color:var(--muted);padding:8px">Aucune course.</p>'; etat.innerHTML = ''; ridesList.innerHTML = ''; return; }

  const nb = list.length;
  const tp = list.reduce((s, r) => s + r.price, 0);
  const ts = list.reduce((s, r) => s + r.actual, 0);
  const tm = tp / (ts / 3600);
  const zone = zoneDe(tm);
  const garanti = ts / 3600 * RATE;
  const sVerte = list.reduce((s, r) => s + (seuilsTemps(r.price).verte - r.actual), 0);
  const sNoir = list.reduce((s, r) => s + (seuilsTemps(r.price).rouge - r.actual), 0);
  const sDouble = list.reduce((s, r) => s + (seuilsTemps(r.price).double - r.actual), 0);

  recap.innerHTML =
    '<div class="pastille" style="border-color:' + ZONE_COLORS[zone] + ';box-shadow:0 0 34px ' + ZONE_COLORS[zone] + '66">' + zIcon(zone, 2.4) + '</div>' +
    '<div><div class="rLabel">Taux moyen · ' + nb + ' course(s)</div><div class="rVal">' + tm.toFixed(1).replace('.', ',') + ' €/h</div></div>' +
    '<div><div class="rLabel">Encaissé / Garanti (temps × ' + RATE + ' €)</div><div class="rVal small">' + fmtMoney(tp) + ' / ' + fmtMoney(garanti) + ' <span style="color:' + (tp >= garanti ? 'var(--z-verte)' : 'var(--z-rouge)') + '">(' + (tp - garanti >= 0 ? '+' : '') + fmtMoney(tp - garanti) + ')</span></div></div>';

  etat.innerHTML =
    '<div>' + (sVerte >= 0 ? zIcon('verte') + ' Crédit de <b>' + fmtDur(sVerte) + '</b> avant rouge' : zIcon('rouge') + ' Déjà sous GH de <b>' + fmtDur(-sVerte) + '</b>') + '</div>' +
    '<div>' + (sNoir >= 0 ? zIcon('rouge') + ' Marge de <b>' + fmtDur(sNoir) + '</b> avant noire' : zIcon('noire') + ' Plancher franchi de <b>' + fmtDur(-sNoir) + '</b>') + '</div>' +
    '<div>' + (sDouble >= 0 ? zIcon('double') + ' Diamant atteint, avance de <b>' + fmtDur(sDouble) + '</b>' : zIcon('double') + ' Il te manque <b>' + fmtDur(-sDouble) + '</b> pour le diamant') + '</div>';

  ridesList.innerHTML = list.slice().sort((a, b) => b.date.localeCompare(a.date)).map((r) => {
    const g = r.actual / 3600 * RATE;
    return '<li class="ride" style="border-left-color:' + ZONE_COLORS[r.zone] + '">' +
      '<span class="rEmoji">' + zIcon(r.zone, 1.5) + '</span>' +
      '<div class="rMain"><div class="rTop"><span>' + fmtDate(r.date) + '</span><span class="rPrice">' + fmtMoney(r.price) + '</span></div>' +
      '<div class="rSub">' + r.phases.map((p) => '<span>' + ico(p.icon, 0.9) + ' ' + fmtDur(p.sec) + '</span>').join('') +
      '<span>' + r.taux.toFixed(1).replace('.', ',') + ' €/h</span>' +
      '<span class="rGaranti ' + (r.price >= g ? 'pos' : 'neg') + '">garanti ' + fmtMoney(g) + '</span>' +
      '<span class="rPlat">' + (r.platform === 'bolt' ? ico('bolt', 0.9) + 'Bolt' : ico('uber', 0.9) + 'Uber') + '</span>' +
      '</div></div></li>';
  }).join('');
}
periodSel.addEventListener('change', () => { monthSel = periodSel.value; renderHistory(); });
document.querySelectorAll('#zoneToggles .zt').forEach((b) => b.addEventListener('click', () => {
  const z = b.dataset.zone;
  zoneVisible[z] = !zoneVisible[z];
  b.classList.toggle('on', zoneVisible[z]);
  renderHistory();
}));

/* ---- Thème Jour / Nuit / Auto ---- */
const THEME_KEY = 'ghTheme2027';
let themeOpt = 'auto';
try { themeOpt = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { /* ignore */ }
function resolvedTheme() {
  if (themeOpt !== 'auto') return themeOpt;
  const h = new Date().getHours();
  return (h >= 7 && h < 20) ? 'light' : 'dark';
}
function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
  document.querySelectorAll('#themeSeg .segBtn').forEach((b) => b.classList.toggle('on', b.dataset.themeOpt === themeOpt));
  const chip = $('themeChip');
  if (chip) chip.innerHTML = themeOpt === 'auto'
    ? ico('clock', 0.95) + ' auto (' + (resolvedTheme() === 'light' ? 'jour' : 'nuit') + ')'
    : (themeOpt === 'light' ? ico('sun', 0.95) + ' jour' : ico('moon', 0.95) + ' nuit');
}
document.querySelectorAll('#themeSeg .segBtn').forEach((b) => b.addEventListener('click', () => {
  themeOpt = b.dataset.themeOpt;
  try { localStorage.setItem(THEME_KEY, themeOpt); } catch (e) { /* ignore */ }
  applyTheme();
}));
setInterval(applyTheme, 60000);

/* ---- Export / Import (mode démo, en mémoire) ---- */
const IMPORT_MIN_DATE = new Date('2020-01-01T00:00:00.000Z'); // rien avant le 01/01/2020
function download(text, filename, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('btnExportJson').addEventListener('click', () => {
  download(JSON.stringify({ app: 'gh-maquette-2027', demo: true, rides }, null, 2), 'maquette-demo-rides.json', 'application/json');
  toast(ico('down', 1) + ' Export JSON téléchargé (' + rides.length + ' courses).');
});
$('btnExportCsv').addEventListener('click', () => {
  const head = 'date;prix_eur;total_s;taux_eur_h;zone;platform;phases_s';
  const rows = rides.map((r) => [r.date, String(r.price).replace('.', ','), r.actual, String(r.taux.toFixed(2)).replace('.', ','), r.zone, r.platform, (r.phases || []).map((p) => p.sec).join('+')].join(';'));
  download('﻿' + head + '\n' + rows.join('\n'), 'maquette-demo-rides.csv', 'text/csv');
  toast(ico('down', 1) + ' Export CSV téléchargé.');
});
$('btnResetDemo').addEventListener('click', () => {
  rides = JSON.parse(JSON.stringify(DEMO_RIDES));
  monthSel = null;
  renderHistory();
  toast(ico('clock', 1) + ' Données de démo restaurées (' + rides.length + ' courses factices).');
});

/* Import CSV Uber : séparateur auto (tab/;/,), champs entre guillemets gérés */
function detectSep(headerLine) {
  let best = '\t', bestN = -1;
  for (const c of ['\t', ';', ',']) {
    const n = (headerLine || '').split(c).length;
    if (n > bestN) { bestN = n; best = c; }
  }
  return best;
}
function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const sep = detectSep((text.split(/\r?\n/)[0]) || '');
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
function parseTs(v) { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
// Timestamp « local » Uber : on ignore le fuseau collé (Z / +02:00) et on lit l'heure locale telle quelle
function parseTsLocal(v) {
  if (!v) return null;
  const clean = String(v).replace(/Z$/i, '').replace(/[+-]\d{2}:?\d{2}$/, '');
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}
function mapUberRow(c) {
  // Cohérence PAR LIGNE : 3 timestamps _local dispo → tout en local ; sinon tout en _utc
  // (évite d'ajouter le décalage horaire aux durées quand on mélange local et utc)
  const rqL = parseTsLocal(c['request_timestamp_local']), rqU = parseTs(c['request_timestamp_utc']);
  const btL = parseTsLocal(c['begintrip_timestamp_local']), btU = parseTs(c['begintrip_timestamp_utc']);
  const drL = parseTsLocal(c['dropoff_timestamp_local']), drU = parseTs(c['dropoff_timestamp_utc']);
  let request, begin, drop;
  if (rqL && btL && drL) { request = rqL; begin = btL; drop = drL; }
  else { request = rqU || rqL; begin = btU || btL; drop = drU || drL; }
  if (!request || !begin || !drop) return null;
  const completed = String(c['status'] || '').toLowerCase() === 'completed' || String(c['is_completed']) === 'true';
  // Encaissé = tarif upfront (ce que le chauffeur touche vraiment) ; fallback : original − |service_fee|
  let price = num(c['driver_upfront_fare_local']);
  if (!(price > 0)) price = num(c['original_fare_local']) - Math.abs(num(c['service_fee_local']));
  let approche = Math.max(0, Math.round((begin - request) / 1000));
  const course = Math.max(0, Math.round((drop - begin) / 1000));
  const scheduled = String(c['is_scheduled_trip']) === 'true';
  const eta = num(c['eta']);
  // Le CSV n'exporte pas l'heure d'acceptation réelle (request = heure de la demande) :
  // on plafonne l'approche à l'eta, seule vraie mesure d'approche transmise par Uber.
  if (eta > 0 && approche > eta) approche = Math.round(eta);
  const actual = approche + course;
  if (!(price > 0) || actual <= 0) return null;
  return {
    date: request.toISOString(), price, actual, completed, scheduled,
    phases: [{ label: 'Approche', icon: 'pin', sec: approche }, { label: 'Course', icon: 'car', sec: course }],
    extId: String(c['driver_trip_number'] || request.toISOString()),
  };
}
function applyImportedCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) { toast('CSV vide.'); return; }
  const header = rows[0].map((h) => String(h).trim());
  let imported = 0, maj = 0, ignorees = 0, avant2020 = 0, planifiees = 0;
  const byExt = new Map(rides.filter((r) => r.extId).map((r) => [r.extId, r]));
  for (const r of rows.slice(1)) {
    const cols = {};
    header.forEach((h, i) => { cols[h] = (r[i] || '').trim(); });
    const m = mapUberRow(cols);
    if (!m) { ignorees++; continue; }
    if (new Date(m.date) < IMPORT_MIN_DATE) { avant2020++; continue; }
    if (!m.completed) { ignorees++; continue; }
    if (m.scheduled) planifiees++;
    const t = taux(m.price, m.actual);
    const fields = { date: m.date, price: m.price, actual: m.actual, phases: m.phases, platform: 'uber', taux: t, zone: zoneDe(t), extId: m.extId, imported: true };
    const old = byExt.get(m.extId);
    if (old) { Object.assign(old, fields); maj++; continue; } // réimport = mise à jour
    rides.push(fields);
    byExt.set(m.extId, fields);
    imported++;
  }
  monthSel = null;
  renderHistory();
  toast(ico('up', 1) + ' Import CSV : ' + imported + ' importée(s) · ' + maj + ' mise(s) à jour · ' + ignorees + ' non terminée(s) · ' + avant2020 + ' avant 2020' + (planifiees ? ' · ' + planifiees + ' planifiée(s) (approche plafonnée à l’ETA)' : '') + '.');
}
$('btnImportCsv').addEventListener('click', () => $('importCsvFile').click());
$('importCsvFile').addEventListener('change', () => {
  const f = $('importCsvFile').files && $('importCsvFile').files[0];
  if (f) {
    const reader = new FileReader();
    reader.onload = () => { try { applyImportedCSV(String(reader.result)); } catch (e) { toast('Erreur CSV : ' + e.message); } };
    reader.readAsText(f);
  }
  $('importCsvFile').value = '';
});

/* ---- Init ---- */
applyTheme();
updateCourse();
renderHistory();
setAmbient('verte');
