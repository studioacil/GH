'use strict';

/* ============================================================
   GH — Garantie horaire · V2 « Nebula Glass »
   App 100 % locale : 3 fichiers statiques, aucune dépendance.
   ============================================================ */

/* ================= Stockage local ================= */
const LS_PROFILE = 'garantieHoraire.profile.v6';
const LS_SETTINGS_PREFIX = 'garantieHoraire.settings.v6.';
const LS_RIDES_PREFIX = 'garantieHoraire.rides.v6.';
const LS_BONUS_PREFIX = 'garantieHoraire.bonus.v6.';
const LS_INVOICES_PREFIX = 'garantieHoraire.invoices.v1';
const LS_INCENTIVES_PREFIX = 'garantieHoraire.incentives.v1';
const IMPORT_MIN_DATE = new Date('2020-01-01T00:00:00'); // plancher absolu à l'import
// Fenêtre d'import : les 24 derniers mois en mois complets — ex. le 22/11/2026 → on démarre au 01/11/2024.
function importMinDate() {
  const now = new Date();
  const cut = new Date(now.getFullYear(), now.getMonth() - 24, 1); // 1er du mois, 24 mois en arrière (heure locale)
  return cut < IMPORT_MIN_DATE ? IMPORT_MIN_DATE : cut;
}

/* ================= Modes, plateformes, zones ================= */
const PLATFORMS = {
  uber:      { label: 'Uber',      icon: 'uber' },
  bolt:      { label: 'Bolt',      icon: 'bolt' },
  deliveroo: { label: 'Deliveroo', icon: 'deliveroo' },
  ubereats:  { label: 'Uber Eats', icon: 'ubereats' },
};
const MODES = {
  vtc: {
    label: 'VTC', rate: 30, seuilNoir: 22.5, seuilEtoile: 37.5, seuilDouble: 60,
    platform: 'uber', platforms: ['uber', 'bolt'], period: 'mois',
    phases: [{ label: 'Approche', icon: 'pin' }, { label: 'Course', icon: 'car' }],
    phaseActions: ['Client pris en charge'],
  },
  livreur: {
    label: 'Livreur', rate: 19, seuilNoir: 19 * 0.788, seuilEtoile: 19 * 1.212, seuilDouble: 38,
    platform: 'ubereats', platforms: ['deliveroo', 'ubereats'], period: 'semaine',
    phases: [{ label: 'Approche', icon: 'pin' }, { label: 'Attente resto', icon: 'cloche' }, { label: 'Livraison', icon: 'box' }],
    phaseActions: ['Arrivé au resto', 'Départ avec la commande'],
  },
};
// Plateformes actives par défaut (boutons chrono) : Uber en VTC, Uber Eats en livreur.
// Réglables dans Réglages → « Plateformes actives » (stocké dans settings.platformsOn).
const DEFAULT_PLATFORMS_ON = { vtc: ['uber'], livreur: ['ubereats'] };
const DEFAULT_SETTINGS = Object.assign({ mode: 'vtc', platform: 'uber', theme: 'auto', sons: true, approcheMode: 'moyenne', demoOn: false, demoMul: 10, objTemps: 0, gmapsKey: '', platformsOn: { vtc: ['uber'], livreur: ['ubereats'] } }, MODES.vtc);

// 5 zones : ⬛ noire < seuilNoir · 🟥 rouge < GH · 🟢 verte < seuilEtoile · ⭐ étoile < seuilDouble · 💎 diamant ≥ seuilDouble
const ZONES = [
  { id: 'noire',  icon: 'zone-noire',  label: 'Noire',   color: '#3a3a3e' },
  { id: 'rouge',  icon: 'zone-rouge',  label: 'Rouge',   color: '#ff453a' },
  { id: 'verte',  icon: 'zone-verte',  label: 'Verte',   color: '#30d158' },
  { id: 'etoile', icon: 'zone-etoile', label: 'Étoile',  color: '#ffd60a' },
  { id: 'double', icon: 'zone-double', label: 'Diamant', color: '#5ac8fa' },
];
const ZONE_COLORS = {}; ZONES.forEach((z) => { ZONE_COLORS[z.id] = z.color; });
// Émojis de zone (utilisés dans les <option> du filtre de périodes : le SVG n'y est pas rendu, l'emoji si)
const ZONE_EMOJI = { double: '💎', etoile: '⭐', verte: '🟢', rouge: '🔺', noire: '💀' };
function zoneMeta(id) { return ZONES.find((z) => z.id === id) || ZONES[0]; }
function ico(name, size) {
  const s = size || 1.15;
  return '<svg class="ico" style="width:' + s + 'em;height:' + s + 'em" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
}
const zIcon = (id, size) => ico(zoneMeta(id).icon, size);

/* ================= Icônes / réglages / données ================= */
function loadProfile() {
  try { return localStorage.getItem(LS_PROFILE) || 'default'; } catch (e) { return 'default'; }
}
function saveProfile(p) { try { localStorage.setItem(LS_PROFILE, p); } catch (e) { /* ignore */ } }
function listProfiles() {
  const out = new Set(['default']);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(LS_SETTINGS_PREFIX) === 0) out.add(k.slice(LS_SETTINGS_PREFIX.length));
    }
  } catch (e) { /* ignore */ }
  return Array.from(out).sort();
}
let profile = loadProfile();
let settings = loadSettings();
let rides = loadRides();
let monthSel = null;
const zoneVisible = { double: true, etoile: true, verte: true, rouge: true, noire: true };

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_PREFIX + profile);
    if (raw) return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
  } catch (e) { /* ignore */ }
  return Object.assign({}, DEFAULT_SETTINGS);
}
function saveSettings() { try { localStorage.setItem(LS_SETTINGS_PREFIX + profile, JSON.stringify(settings)); } catch (e) { /* ignore */ } }
function loadRides() {
  try {
    const raw = localStorage.getItem(LS_RIDES_PREFIX + profile);
    if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) return a; }
  } catch (e) { /* ignore */ }
  return [];
}
function saveRides() { try { localStorage.setItem(LS_RIDES_PREFIX + profile, JSON.stringify(rides)); } catch (e) { /* ignore */ } }

// Mode démo : multiplicateur appliqué au temps écoulé du chrono (1 = temps réel).
function demoMul() {
  if (!settings.demoOn) return 1;
  const m = Number(settings.demoMul);
  return Number.isFinite(m) && m >= 1 ? m : 10;
}
// Objectif personnalisé : temps moyen par course visé, en secondes (0 = désactivé).
function objCibleSec() {
  const v = parseFloat(String(settings.objTemps).replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v * 60 : 0;
}
// Jauge d'objectif pour une liste de courses : '' si pas d'objectif, sinon la case stat.
function objStatHtml(totalSec, nb) {
  const cible = objCibleSec();
  if (!cible || !nb) return '';
  const moy = totalSec / nb;
  const ok = moy <= cible;
  const pct = Math.max(4, Math.min(100, (moy / cible) * 100));
  const coul = ok ? '#30d158' : '#ff453a';
  return '<div class="stat ' + (ok ? 'pos' : 'neg') + '"><span>Objectif temps / course</span><strong>' + fmtDur(cible) + '</strong>' +
    '<em>actuel ' + fmtDur(moy) + ' · écart ' + (ok ? '−' : '+') + fmtDur(Math.abs(moy - cible)) + ' par course</em>' +
    '<div class="objBar"><i style="width:' + pct.toFixed(1) + '%;background:' + coul + '"></i></div></div>';
}

/* Bonus réels saisis à la main, par période (clé = periodKey : mois VTC / semaine livreur) */
function loadBonus() { try { return JSON.parse(localStorage.getItem(LS_BONUS_PREFIX + profile) || '{}') || {}; } catch (e) { return {}; } }
function saveBonus(b) { try { localStorage.setItem(LS_BONUS_PREFIX + profile, JSON.stringify(b)); } catch (e) { /* ignore */ } }
function bonusFor(key) {
  const b = loadBonus();
  if (key === 'all') return Object.keys(b).reduce((s, k) => s + (Number(b[k]) || 0), 0);
  if (key && key.indexOf('Y:') === 0) { const y = key.slice(2); return Object.keys(b).filter((k) => k.indexOf(y + '-') === 0).reduce((s, k) => s + (Number(b[k]) || 0), 0); }
  return Number(b[key]) || 0;
}

/* ---- Factures client (export « driver-to-rider invoice » Uber) ----
   CSV des factures chauffeur→client : MontantBrut = prix brut TTC réellement facturé.
   Pas d'id de course → on agrège par SEMAINE de facture (lundi de DateFacture).
   Stockage : garantieHoraire.invoices.v1.<profil> = { "2026-08-03": { brut, net, taxe, n } } */
function loadInvoices() { try { return JSON.parse(localStorage.getItem(LS_INVOICES_PREFIX + '.' + profile) || '{}') || {}; } catch (e) { return {}; } }
function saveInvoices(o) { try { localStorage.setItem(LS_INVOICES_PREFIX + '.' + profile, JSON.stringify(o)); } catch (e) { /* ignore */ } }
function invoiceWeekKey(dateStr) { // lundi de la semaine contenant DateFacture
  const m = String(dateStr).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
}
function applyInvoicesCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) { showToast('CSV vide.'); return; }
  const header = rows[0].map((h) => String(h).trim());
  const col = (name) => header.indexOf(name);
  const iDate = col('DateFacture'), iBrut = col('MontantBrut'), iNet = col('MontantNet'), iTaxe = col('MontantTaxe');
  if (iDate === -1 || iBrut === -1) { showToast('CSV non reconnu : colonnes DateFacture / MontantBrut manquantes.'); return; }
  const inv = loadInvoices();
  let n = 0;
  for (const r of rows.slice(1)) {
    const k = invoiceWeekKey(String(r[iDate] || '').trim());
    if (!k) continue;
    const brut = num(String(r[iBrut] || '').replace(',', '.'));
    if (!(brut > 0)) continue;
    const e = inv[k] || { brut: 0, net: 0, taxe: 0, n: 0 };
    e.brut += brut;
    e.net += num(String(r[iNet] || '').replace(',', '.'));
    e.taxe += num(String(r[iTaxe] || '').replace(',', '.'));
    e.n += 1;
    inv[k] = e;
    n++;
  }
  saveInvoices(inv);
  renderHistory();
  renderAnalyse();
  showToast(ico('up', 1) + ' Factures client importées : ' + n + ' ligne(s), ' + Object.keys(inv).length + ' semaine(s) — brut TTC réel pris en compte pour « Facturée ».');
}
function importInvoicesFileFn(file) {
  const reader = new FileReader();
  reader.onload = () => { try { applyInvoicesCSV(String(reader.result)); } catch (e) { showToast('Erreur de lecture CSV factures : ' + e.message); } };
  reader.readAsText(file);
}
/* ---- Paiements (export « driver_payments ») → bonus par course ----
   Les lignes intermediary.incentive.* (driver_meg_bonus, peakhour, vbdp…) sont des bonus
   payés EN PLUS du tarif, inclus dans driver_upfront_fare_local.
   Formule : prix net = upfront − bonus ; bonus affiché à part (badge jaune).
   Jointure par timestamp : recognize_timestamp_local == request_timestamp_local de la course.
   Stockage : garantieHoraire.incentives.v1.<profil> = { "2026-11-21T22:46:30": 4.5 } */
function loadIncentives() { try { return JSON.parse(localStorage.getItem(LS_INCENTIVES_PREFIX + '.' + profile) || '{}') || {}; } catch (e) { return {}; } }
function saveIncentives(o) { try { localStorage.setItem(LS_INCENTIVES_PREFIX + '.' + profile, JSON.stringify(o)); } catch (e) { /* ignore */ } }
function incentiveKey(ts) { return String(ts || '').replace(' ', 'T').slice(0, 19); }
function applyPaymentsCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) { showToast('CSV vide.'); return; }
  const header = rows[0].map((h) => String(h).trim());
  const col = (name) => header.indexOf(name);
  const iCls = col('classification'), iTs = col('recognize_timestamp_local'), iAmt = col('amount_local');
  if (iCls === -1 || iTs === -1 || iAmt === -1) { showToast('CSV non reconnu : colonnes classification / recognize_timestamp_local / amount_local manquantes.'); return; }
  const inc = loadIncentives();
  let n = 0, tot = 0;
  const tmp = {}; // somme PAR FICHIER, puis REMPLACE : réimporter le même fichier ne double pas les bonus
  for (const r of rows.slice(1)) {
    const cls = String(r[iCls] || '').trim();
    if (!cls.startsWith('intermediary.incentive')) continue; // bonus uniquement (meg_bonus, peakhour, vbdp…)
    const k = incentiveKey(String(r[iTs] || '').trim());
    const a = num(String(r[iAmt] || '').replace(',', '.'));
    if (!k || !(a > 0)) continue;
    tmp[k] = Math.round(((tmp[k] || 0) + a) * 100) / 100;
    n++; tot += a;
  }
  Object.keys(tmp).forEach((k) => { inc[k] = tmp[k]; }); // idempotent
  saveIncentives(inc);
  const maj = reapplyIncentives();
  renderHistory();
  renderAnalyse();
  updateCourse();
  showToast(ico('up', 1) + ' Paiements importés : ' + n + ' bonus (' + fmtMoney(tot) + ') — import idempotent (réimport = remplacement)' + (maj ? ' · ' + maj + ' course(s) de l’historique mises à jour (prix = upfront − bonus)' : '') + '.');
}
// Réapplique les bonus du CSV paiements sur les courses importées déjà présentes :
// prix = upfront − bonus (bonus affiché à part, jamais dans le taux). Ne touche au prix
// que des courses src=csv (une saisie manuelle ou un chrono reste prioritaire).
function reapplyIncentives() {
  const inc = loadIncentives();
  let n = 0;
  for (const r of rides) {
    if (!r.meta || !r.meta.reqKey || r.meta.upfront === undefined) continue;
    const b = Math.max(0, inc[r.meta.reqKey] || 0);
    const up = num(r.meta.upfront);
    r.bonus = b;
    if (r.src === 'csv') r.price = Math.max(0, Math.round((up - b) * 100) / 100);
    const s = seuilsTemps(r.price);
    r.taux = tauxEffectif(r.price, r.actual);
    r.zone = zoneDe(r.taux);
    r.tDouble = Math.round(s.double); r.tEtoile = Math.round(s.etoile); r.tVerte = Math.round(s.verte); r.tRouge = Math.round(s.rouge);
    n++;
  }
  if (n) saveRides();
  return n;
}
function importPaymentsFileFn(file) {
  const reader = new FileReader();
  reader.onload = () => { try { applyPaymentsCSV(String(reader.result)); } catch (e) { showToast('Erreur de lecture CSV paiements : ' + e.message); } };
  reader.readAsText(file);
}

/* Somme du brut TTC facturé pour une période : chaque semaine de facture (lundi k)
   est attribuée au mois contenant son JEUDI (évite les doubles comptes aux frontières).
   Mode livreur : correspondance exacte sur la semaine. */
function facturedTTC(key) {
  const inv = loadInvoices();
  let total = 0, n = 0;
  for (const k of Object.keys(inv)) {
    const monday = new Date(k + 'T00:00:00');
    const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
    let ok = false;
    if (key === 'all') ok = true;
    else if (key.indexOf('Y:') === 0) ok = thursday.getFullYear() === Number(key.slice(2));
    else if (modeOf() === 'livreur') ok = (k === key);
    else { const p = String(key).split('-'); ok = thursday.getFullYear() === Number(p[0]) && thursday.getMonth() === Number(p[1]) - 1; }
    if (ok) { total += inv[k].brut || 0; n += inv[k].n || 0; }
  }
  return { total: total, n: n };
}

function modeOf() { return settings.mode === 'livreur' ? 'livreur' : 'vtc'; }
/* Plateformes dont le bouton chrono est affiché (réglables, au moins une active) */
function activePlatforms() {
  const m = modeOf();
  const def = DEFAULT_PLATFORMS_ON[m] || [MODES[m].platform];
  const stored = settings.platformsOn && settings.platformsOn[m];
  const list = Array.isArray(stored) ? stored.filter((p) => MODES[m].platforms.indexOf(p) !== -1) : [];
  return list.length ? list : def;
}
function seuilNoir()   { return settings.seuilNoir; }
function seuilEtoile() { return settings.seuilEtoile; }
function seuilDouble() { return settings.seuilDouble; }

/* ================= Zones & formules ================= */
function zoneDe(taux) {
  if (!Number.isFinite(taux)) return 'double';
  if (taux >= seuilDouble()) return 'double';
  if (taux >= seuilEtoile()) return 'etoile';
  if (taux >= settings.rate) return 'verte';
  if (taux >= seuilNoir()) return 'rouge';
  return 'noire';
}
// Seuils de TEMPS (secondes) pour un prix : sous le seuil -> au moins la zone
function seuilsTemps(price) {
  return {
    double: price * 3600 / seuilDouble(),
    etoile: price * 3600 / seuilEtoile(),
    verte:  price * 3600 / settings.rate,
    rouge:  price * 3600 / seuilNoir(),
  };
}
function tauxEffectif(price, elapsedSec) {
  return elapsedSec > 0 ? price / (elapsedSec / 3600) : Infinity;
}

/* ================= Utilitaires ================= */
function fmtDur(totalSec) {
  totalSec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return h + ' h ' + String(m).padStart(2, '0') + ' min';
  if (m > 0) return m + ' min ' + String(s).padStart(2, '0') + ' s';
  return s + ' s';
}
function fmtSignedDur(sec) { return (sec < 0 ? '−' : '+') + fmtDur(Math.abs(sec)); }
function fmtClock(sec) {
  sec = Math.abs(Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function fmtMoney(v) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function fmtNum(v, digits) { return v.toFixed(digits === undefined ? 1 : digits).replace('.', ','); }
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function monthLabel(key) {
  const p = key.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
function weekKey(iso) {
  const d = new Date(iso);
  const day = d.getDay();
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((day + 6) % 7));
  return monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
}
function weekLabel(key) {
  const monday = new Date(key + 'T00:00:00');
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const f = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return 'Semaine du ' + f(monday) + ' au ' + f(sunday);
}
function yearOf(iso) { return new Date(iso).getFullYear(); }
function periodKey(iso) { return modeOf() === 'livreur' ? weekKey(iso) : iso.slice(0, 7); }
function periodLabel(key) { return modeOf() === 'livreur' ? weekLabel(key) : monthLabel(key); }
function periodWord() { return modeOf() === 'livreur' ? 'semaine' : 'mois'; }

/* ================= DOM ================= */
const $ = (id) => document.getElementById(id);
const ambient = $('ambient'), toastEl = $('toast');
const themeChip = $('themeChip'), profileName = $('profileName'), profileSelHeader = $('profileSelHeader'), newProfileBtn = $('newProfileBtn');
const headerSub = $('headerSub');
const priceInput = $('priceInput'), zonePills = $('zonePills'), startBtns = $('startBtns');
const chronoPlat = $('chronoPlat');
const segTime = $('segTime'), segEuro = $('segEuro');
const ring = $('ring'), ringProgress = $('ringProgress'), clockEl = $('clock'), clockMin = $('clockMin'), clockSec = $('clockSec');
const euroCenter = $('euroCenter'), euroInt = $('euroInt'), euroDec = $('euroDec');
const clockZone = $('clockZone'), orbiter = $('orbiter'), orbDot = $('orbDot'), ringMarks = $('ringMarks');
const liveChips = document.querySelectorAll('.chronoLive');
const statusLine = $('statusLine'), phaseChips = $('phaseChips'), phaseBtns = $('phaseBtns');
const stopBtn = $('stopBtn'), cancelBtn = $('cancelBtn');
const zoneToggles = $('zoneToggles'), monthFilter = $('monthFilter'), sortSel = $('sortSel'), statsEl = $('stats'), ridesList = $('ridesList'), clearBtn = $('clearBtn');
const anaPeriodSel = $('anaPeriod'), anaKpis = $('anaKpis'), anaChartTaux = $('anaChartTaux'), anaZonesEl = $('anaZones'), anaHoursEl = $('anaHours'), anaPlatsEl = $('anaPlats'), anaRecordsEl = $('anaRecords'), anaCommissionEl = $('anaCommission');
const manDetails = $('manualDetails'), manSummary = $('manualSummary'), manPrice = $('manPrice'), manBonus = $('manBonus'), manDate = $('manDate'), phaseFields = $('phaseFields');
const manAdd = $('manAdd'), manCancelEdit = $('manCancelEdit');
const importTripsBtn = $('importTripsBtn'), importTripsFile = $('importTripsFile');
const importInvoicesBtn = $('importInvoicesBtn'), importInvoicesFile = $('importInvoicesFile');
const importPaymentsBtn = $('importPaymentsBtn'), importPaymentsFile = $('importPaymentsFile');
const themeSeg = $('themeSeg'), modeSeg = $('modeSeg'), platformToggles = $('platformToggles');
const setRate = $('setRate'), setSeuilNoir = $('setSeuilNoir'), setSeuilEtoile = $('setSeuilEtoile'), setSeuilDouble = $('setSeuilDouble');
const setDemoMul = $('setDemoMul'), setObjTemps = $('setObjTemps'), demoSeg = $('demoSeg'), objLine = $('objLine'), setGmapsKey = $('setGmapsKey');
const demoBadges = document.querySelectorAll('.demoBadge'); // badge « DÉMO ×N » sur Course + Chrono
function updateDemoBadges() {
  demoBadges.forEach((b) => {
    b.classList.toggle('hidden', !settings.demoOn);
    if (settings.demoOn) b.textContent = 'DÉMO ×' + demoMul();
  });
}
const resetSettingsBtn = $('resetSettingsBtn'), logoutBtn = $('logoutBtn'), sonsSeg = $('sonsSeg'), approcheSeg = $('approcheSeg');
const loginContact = $('loginContact'), loginCode = $('loginCode'), loginPseudo = $('loginPseudo');
const loginStep1 = $('loginStep1'), loginStep2 = $('loginStep2'), loginStep3 = $('loginStep3');
const loginTarget = $('loginTarget'), loginTarget2 = $('loginTarget2');
const demoCodeVal = $('demoCodeVal'), loginResend = $('loginResend');
let manPhaseEls = [];

const views = {
  login: $('view-login'),
  course: $('view-course'),
  chrono: $('view-chrono'),
  history: $('view-history'),
  analyse: $('view-analyse'),
  settings: $('view-settings'),
};
function showView(name) {
  if (document.body.classList.contains('locked') && name !== 'login') return; // pas de navigation tant que pas connecté
  Object.keys(views).forEach((k) => views[k].classList.toggle('active', k === name));
  document.querySelectorAll('#tabbar .tab').forEach((t) => t.classList.toggle('active', t.dataset.scr === 'view-' + name));
  if (name === 'analyse') renderAnalyse();
  if (name === 'course') prewarmOCR(); // moteur OCR chaud pour une analyse d'offre < 10 s
}
document.querySelectorAll('#tabbar .tab').forEach((t) => t.addEventListener('click', () => {
  const name = t.dataset.scr.replace('view-', '');
  // Pendant un chrono, l'onglet Course ramène au chrono en cours (la saisie de prix y est inutile)
  if (name === 'course' && timer.running) {
    showToast(ico('clock', 1) + ' Un chrono est en cours — tu es ramené au chrono.');
    showView('chrono');
    return;
  }
  showView(name);
}));

/* ================= Thème Jour / Nuit / Auto ================= */
function resolvedTheme() {
  if (settings.theme !== 'auto') return settings.theme;
  const h = new Date().getHours();
  return (h >= 7 && h < 20) ? 'light' : 'dark';
}
function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
  document.querySelectorAll('#themeSeg .segBtn').forEach((b) => b.classList.toggle('on', b.dataset.themeOpt === (settings.theme || 'auto')));
  if (themeChip) {
    themeChip.innerHTML = settings.theme === 'auto'
      ? ico('clock', 0.95) + ' auto (' + (resolvedTheme() === 'light' ? 'jour' : 'nuit') + ')'
      : (settings.theme === 'light' ? ico('sun', 0.95) + ' jour' : ico('moon', 0.95) + ' nuit');
  }
}

/* ================= Halo ambiant ================= */
function setAmbient(zone) {
  // --halo posée sur <html> : héritée par le fond (.ambient) ET le contour battant (.ambientEdge)
  // Halo UNIQUEMENT quand le chrono tourne : sinon transparent + classe haloOn retirée (CSS)
  const on = !!zone;
  const c = on ? (ZONE_COLORS[zone] || '#30d158') : 'transparent';
  document.documentElement.style.setProperty('--halo', c);
  document.documentElement.classList.toggle('haloOn', on);
}

/* ================= Toast ================= */
let toastTimer = null;
function showToast(msg) {
  toastEl.innerHTML = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4500);
}

/* ================= Écran Course ================= */
function currentPrice() {
  const v = parseFloat(String(priceInput.value).replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}
function renderStartButtons() {
  const act = activePlatforms();
  const def = act.indexOf(settings.platform) !== -1 ? settings.platform : act[0];
  startBtns.innerHTML = act.map((pl) => {
    const p = PLATFORMS[pl];
    return '<button type="button" class="cta cta' + p.label.replace(/\s/g, '') + (pl === def ? ' default' : '') +
      '" data-plat="' + pl + '" disabled>' + ico(p.icon, 1.1) + ' Chrono ' + p.label + '</button>';
  }).join('');
}
function updateCourse() {
  const p = currentPrice();
  document.querySelectorAll('#startBtns .cta').forEach((b) => { b.disabled = p === null; });
  // Ligne objectif : temps moyen par course visé (réglable, à la hausse ou à la baisse).
  const cible = objCibleSec();
  if (!cible) objLine.innerHTML = '';
  else if (p === null) { objLine.style.color = ''; objLine.innerHTML = 'Objectif : <b>' + fmtDur(cible) + '</b> par course'; }
  else {
    const tObj = p / (cible / 3600); // taux horaire correspondant à l'objectif à ce prix
    const zObj = zoneDe(tObj);
    objLine.style.color = ZONE_COLORS[zObj];
    objLine.innerHTML = 'Objectif <b>' + fmtDur(cible) + '</b>/course → à ce prix ' + zIcon(zObj, 1) + ' <b>' + fmtNum(tObj) + ' €/h</b> (' + zoneMeta(zObj).label + ')';
  }
  quickVerdict.textContent = '';
  quickVerdict.style.color = '';
  if (p === null) { zonePills.innerHTML = ''; return; }
  const s = seuilsTemps(p);
  const k = demoMul(); // en mode démo ×N, les seuils d'affichage sont en temps réel (divisés par N)
  zonePills.innerHTML =
    pill('double', 'moins de ' + fmtDur(s.double / k)) +
    pill('etoile', 'jusqu’à ' + fmtDur(s.etoile / k)) +
    pill('verte', 'jusqu’à ' + fmtDur(s.verte / k)) +
    pill('rouge', 'jusqu’à ' + fmtDur(s.rouge / k)) +
    pill('noire', 'au-delà de ' + fmtDur(s.rouge / k));
}
function pill(zone, txt) {
  return '<div class="zonePill zp-' + zone + '"><span class="zpEmoji">' + zIcon(zone, 1.3) + '</span>' +
    '<span class="zpLabel">' + zoneMeta(zone).label + '</span><span class="zpTime">' + txt + '</span></div>';
}

/* ---- Mode décision rapide (< 10 s, sans capture) : prix saisi + temps total estimé
   en chips → verdict de zone instantané + pastille correspondante surlignée. ---- */
const quickRow = $('quickRow'), quickVerdict = $('quickVerdict');
const QUICK_MINS = [8, 12, 15, 20, 25, 30, 40, 50];
function buildQuickRow() {
  quickRow.innerHTML = '<span class="qLabel">⚡ temps total estimé :</span>' +
    QUICK_MINS.map((m) => '<button type="button" class="qChip" data-min="' + m + '">' + m + ' min</button>').join('');
}
quickRow.addEventListener('click', (e) => {
  const b = e.target.closest('.qChip');
  if (!b) return;
  const p = currentPrice();
  if (p === null) { showToast('Saisis d’abord le prix de l’offre.'); return; }
  const min = Number(b.dataset.min);
  const taux = p / (min / 60);
  const z = zoneDe(taux);
  document.querySelectorAll('#zonePills .zonePill').forEach((el) => el.classList.toggle('hit', el.classList.contains('zp-' + z)));
  quickVerdict.innerHTML = zIcon(z, 1.4) + ' <b>' + zoneMeta(z).label + '</b> — ' + fmtNum(taux) + ' €/h à ' + fmtMoney(p) + ' sur ~' + min + ' min';
  quickVerdict.style.color = ZONE_COLORS[z];
});
buildQuickRow();

/* ================= Analyse d'offre (mode OCR) =================
   Capture de l'offre (file picker iOS, ou share_target « Partager → GH » sur Android) →
   OCR 100 % local (Tesseract.js vendored) → champs extraits éditables → verdict de zone
   → bouton « Lancer le chrono » qui démarre le chrono avec le prix de l'offre. */
const offerBtn = $('offerBtn'), offerFile = $('offerFile'), offerModal = $('offerModal');
const offerImg = $('offerImg'), offerScan = $('offerScan'), offerProg = $('offerProg'), offerStatus = $('offerStatus');
const offerRaw = $('offerRaw'), offerPlat = $('offerPlat');
const offerPrix = $('offerPrix'), offerEta = $('offerEta'), offerDist = $('offerDist'), offerTrajet = $('offerTrajet');
const offerSurge = $('offerSurge'), offerCoutKm = $('offerCoutKm'), offerPickup = $('offerPickup'), offerDest = $('offerDest');
const offerVerdict = $('offerVerdict'), offerZone = $('offerZone'), offerTaux = $('offerTaux'), offerDetail = $('offerDetail'), offerPill = $('offerPill');
const offerStartBtn = $('offerStartBtn'), offerCloseBtn = $('offerCloseBtn');
let offerRawText = '';

// Base absolue de l'app (ex. '/GH/' sur GitHub Pages, '/' en local) :
// INDISPENSABLE pour les chemins du worker OCR (dans un worker, les chemins relatifs
// se résolvent par rapport à l'URL du worker, pas de la page → 404 sous /GH/).
const APP_BASE = location.pathname.replace(/[^/]*$/, '');
function loadTesseract() {
  if (!loadTesseract.p) {
    loadTesseract.p = new Promise((res, rej) => {
      if (window.Tesseract) return res(window.Tesseract);
      const s = document.createElement('script');
      s.src = APP_BASE + 'vendor/tesseract/tesseract.min.js';
      s.onload = () => res(window.Tesseract);
      s.onerror = () => rej(new Error('vendor/tesseract/tesseract.min.js introuvable'));
      document.head.appendChild(s);
    });
  }
  return loadTesseract.p;
}
// Worker OCR préchauffé : créé dès l'ouverture de l'app (écran Course) pour que la 1re
// capture soit analysée en ~1–2 s (décision < 10 s). Le worker est réutilisé ensuite.
let ocrWorker = null, ocrWorkerPromise = null;
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' bloqué depuis ' + Math.round(ms / 1000) + ' s')), ms)),
  ]);
}
function prewarmOCR() {
  if (ocrWorker || ocrWorkerPromise) return ocrWorkerPromise;
  ocrWorkerPromise = loadTesseract()
    // 'eng' seul = moins à télécharger et à initialiser (prix/min/km/adresses sont en latin)
    .then((T) => T.createWorker(['eng'], 1, {
      workerPath: APP_BASE + 'vendor/tesseract/worker.min.js',
      corePath: APP_BASE + 'vendor/tesseract', // dossier : le worker y charge tesseract-core[-...].wasm.js
      langPath: APP_BASE + 'vendor/tesseract/lang',
      gzip: false, // nos fichiers lang sont des .traineddata NON compressés (sinon le worker demande .traineddata.gz → 404)
      logger: (m) => { // étapes visibles dans la modale si ouverte
        if (!offerModal.classList.contains('hidden') && m && m.status) {
          offerStatus.textContent = 'OCR : ' + m.status + (m.progress !== undefined ? ' ' + Math.round(m.progress * 100) + ' %' : '');
        }
      },
    }))
    .then((w) => {
      ocrWorker = w;
      // PSM 10 (SPARSE_TEXT) : mieux adapté aux écrans d'offre (peu de texte, dispersé)
      const psm = (window.Tesseract && window.Tesseract.PSM && window.Tesseract.PSM.SPARSE_TEXT) || 10;
      return Promise.resolve(w.setParameters ? w.setParameters({ tessedit_pageseg_mode: psm }) : null)
        .catch(() => {})
        .then(() => w);
    })
    .catch(() => { ocrWorkerPromise = null; });
  return ocrWorkerPromise;
}
async function getOcrWorker() {
  if (ocrWorker) return ocrWorker;
  if (!ocrWorkerPromise) prewarmOCR();
  try {
    // timeout : un worker qui ne répond pas ne doit pas bloquer l'écran indéfiniment
    return await withTimeout(ocrWorkerPromise, 30000, 'init moteur OCR');
  } catch (e) {
    throw new Error('création du worker OCR : ' + (e && e.message ? e.message : e));
  }
}
// capture des erreurs async pour le diagnostic de la modale OCR
window.addEventListener('unhandledrejection', (e) => { window.__lastOcrErr = String((e.reason && e.reason.message) || e.reason || ''); });
// OCR sur une image : canvas inversé (Tesseract préfère foncé sur clair), image réduite à 1200 px
async function ocrImageEl(img) {
  offerStatus.textContent = 'Chargement du moteur OCR (local)…';
  offerProg.style.width = '6%';
  const creating = !ocrWorker;
  const worker = await getOcrWorker();
  if (creating) offerStatus.textContent = 'OCR en cours…';
  else { offerProg.style.width = '45%'; offerStatus.textContent = 'OCR en cours…'; }
  const c = document.createElement('canvas');
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error('image vide (0 px)');
  // upscale vers ~1600 px de large (les petits textes d'offre aiment la résolution)
  const targetW = 1600;
  let scale = targetW / srcW;
  if (srcH * scale > 3200) scale = 3200 / srcH; // sécurité mémoire
  c.width = Math.max(1, Math.round(srcW * scale));
  c.height = Math.max(1, Math.round(srcH * scale));
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height);
  // niveaux de gris + inversion (fond sombre → clair) + binarisation au seuil moyen
  let sum = 0, n = 0;
  const gray = new Float32Array(c.width * c.height);
  for (let i = 0; i < c.width * c.height; i++) {
    const r = d.data[i * 4], g = d.data[i * 4 + 1], b = d.data[i * 4 + 2];
    const v = 255 - (0.299 * r + 0.587 * g + 0.114 * b); // inversion
    gray[i] = v; sum += v; n++;
  }
  const th = sum / n;
  for (let i = 0; i < c.width * c.height; i++) {
    const v = gray[i] > th ? 255 : 0;
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v;
    d.data[i * 4 + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  let text;
  try {
    const r = await worker.recognize(c); // worker réutilisé (pas de terminate)
    text = r.data.text;
  } catch (e) {
    throw new Error('reconnaissance : ' + (e && e.message ? e.message : e));
  }
  offerProg.style.width = '100%';
  offerStatus.textContent = 'OCR terminé ✔ — corrige les champs si besoin.';
  return text;
}
function parseOfferText(text) {
  const t = String(text);
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = { prix: null, eta: null, dist: null, surge: null, pickup: '', dest: '' };
  const NUM = /(\d{1,3}(?:[ \u00A0]\d{3})*[.,]\d{2})/g;
  const lastNumBefore = (line, idx) => {
    const nums = [...line.slice(0, idx).matchAll(/(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d+)?)/g)];
    return nums.length ? nums[nums.length - 1][1] : null;
  };
  // PRIX : ligne avec €/EUR → nombre juste avant le € ; sinon PLUS GRAND montant des 12 premières
  // lignes (le prix est le plus gros chiffre de l'écran), en excluant heure/note/min/km.
  const head = lines.slice(0, 12);
  const euroLine = head.find((l) => /€|eur/i.test(l));
  if (euroLine) {
    const n = lastNumBefore(euroLine, euroLine.search(/€|eur/i));
    if (n) out.prix = parseFloat(n.replace(/[ \u00A0]/g, '').replace(',', '.'));
  }
  if (out.prix === null) {
    let best = null;
    for (const l of head) {
      if (/\d{1,2}[h:]\d{2}|%|★|\b(min|mn|km|mi|miles)\b/i.test(l)) continue;
      for (const m of l.matchAll(NUM)) {
        const v = parseFloat(m[1].replace(/[ \u00A0]/g, '').replace(',', '.'));
        if (best === null || v > best) best = v;
      }
    }
    if (best !== null) out.prix = best;
  }
  // ETA : nombre juste avant "min"/"mn"
  const etaLine = lines.find((l) => /\b(min|mn)\b/i.test(l));
  if (etaLine) {
    const n = lastNumBefore(etaLine, etaLine.search(/\b(min|mn)\b/i));
    if (n) out.eta = parseInt(n, 10);
  }
  // DISTANCE : nombre juste avant "km"/"mi" (décimales conservées)
  const distLine = lines.find((l) => /(kms|kilom|km|miles|mi)\b/i.test(l) && /\d/.test(l));
  if (distLine) {
    const ui = distLine.search(/(kms|kilom|km|miles|mi)\b/i);
    const n = lastNumBefore(distLine, ui);
    if (n) out.dist = parseFloat(n.replace(',', '.')) * (/(miles|mi)\b/i.test(distLine) ? 1.609 : 1);
  }
  // SURGE : x/× juste avant un chiffre, sans lettre collée avant (sinon "UberX")
  const sm = t.match(/(?:^|[^a-zàâäéèêëîïôöùûüç])[x×]\s*(\d(?:[.,]\d+)?)|(\d(?:[.,]\d+)?)\s*[x×](?![a-zàâäéèêëîïôöùûüç])/i);
  if (sm) out.surge = parseFloat((sm[1] || sm[2]).replace(',', '.'));
  // ADRESSES : 1) ligne APRÈS un label Départ/Pickup ou Destination/Dropoff (label seul ou collé) ;
  // 2) sinon lignes "adress-like" nettoyées, en excluant barre de statut / note ★ / labels / prix.
  const cleanLine = (l) => l.replace(/^(départ|depart|pickup|destination|dropoff|drop-?off|arriv[ée]e?)\s*[:\-]?\s*/i, '').trim();
  const labDep = lines.findIndex((l) => /^(départ|depart|pickup|prise en charge)\b/i.test(l));
  const labDest = lines.findIndex((l) => /^(destination|dropoff|drop-?off|arriv)\b/i.test(l));
  const NOISE = /^\d{1,2}[h:]\d{2}|%|5g|lte|4g|★|\★|avis|note|rating|accepter|refuser|nouvelle|offre|€|eur|\b(min|mn|km|mi|miles)\b|uber|bolt|deliveroo|eats|prix|tarif|route|trajet/i;
  const STREET = /rue|av\.?|avenue|bd\.?|boulevard|place|impasse|quai|allée|allee|chemin|square|promenade|porte|cours|passage|rond|esplanade|parvis|gare|aéroport|aeroport|station/i;
  const addr = lines.map(cleanLine).filter((l) => {
    if (l.length < 12 || l.length > 90) return false;
    if (NOISE.test(l)) return false;
    if (!/[a-zàâäéèêëîïôöùûüç]{3,}/i.test(l)) return false;
    return (l.includes(',') && /\d/.test(l)) || (STREET.test(l) && /\d/.test(l)) || (STREET.test(l) && l.includes(','));
  });
  const tryLabel = (idx) => {
    if (idx < 0) return '';
    const same = cleanLine(lines[idx]); // label collé à l'adresse sur la même ligne
    if (same && same !== lines[idx].trim() && addr.indexOf(same) !== -1) return same;
    const next = lines[idx + 1] ? cleanLine(lines[idx + 1]) : ''; // label seul → ligne suivante
    return next && !NOISE.test(next) && addr.indexOf(next) !== -1 ? next : '';
  };
  out.pickup = tryLabel(labDep) || addr[0] || '';
  out.dest = tryLabel(labDest) || addr.find((l) => l !== out.pickup) || '';
  return out;
}
function detectPlatformFromText(text) {
  const t = String(text || '').toLowerCase();
  const act = activePlatforms();
  const pick = (p) => (act.indexOf(p) !== -1 ? p : act[0]);
  if (/bolt/.test(t)) return pick('bolt');
  if (/deliveroo/.test(t)) return pick('deliveroo');
  if (/eats|ubereats|uber eats/.test(t)) return pick('ubereats');
  if (/uber/.test(t)) return pick('uber');
  return settings.platform || act[0];
}
function offerVerdictCalc() {
  const prix = parseFloat(String(offerPrix.value).replace(',', '.'));
  if (!(prix > 0)) return null;
  const eta = parseFloat(String(offerEta.value).replace(',', '.')) || 0;
  const dist = parseFloat(String(offerDist.value).replace(',', '.')) || 0;
  const trajet = parseFloat(String(offerTrajet.value).replace(',', '.')) || Math.round(dist * 2.2 + 3);
  const coutKm = parseFloat(String(offerCoutKm.value).replace(',', '.')) || 0;
  const totalMin = eta + trajet;
  const taux = totalMin > 0 ? prix / (totalMin / 60) : 0;
  const zone = zoneDe(taux);
  const net = prix - coutKm * (dist + eta * 0.4);
  return { prix, eta, trajet, totalMin, taux, zone, net };
}
function renderOfferVerdict() {
  const v = offerVerdictCalc();
  if (!v) { offerVerdict.classList.add('hidden'); offerStartBtn.disabled = true; return; }
  const zm = zoneMeta(v.zone);
  offerVerdict.classList.remove('hidden');
  offerVerdict.style.borderColor = zm.color;
  offerVerdict.style.boxShadow = '0 0 34px ' + zm.color + '44';
  offerZone.innerHTML = zIcon(v.zone, 1.6) + ' ' + zm.label;
  offerZone.style.color = zm.color;
  offerTaux.textContent = fmtNum(v.taux) + ' €/h';
  offerTaux.style.color = zm.color;
  offerDetail.innerHTML = 'prix ' + fmtMoney(v.prix) + ' · approche ' + v.eta + ' min + trajet ~' + v.trajet + ' min → <b>' + v.totalMin + ' min</b><br>' +
    'net après coûts : <b>' + fmtMoney(v.net) + '</b>';
  const ok = v.zone === 'double' || v.zone === 'etoile' || v.zone === 'verte';
  offerPill.className = 'pill ' + (ok ? 'ok' : v.zone === 'rouge' ? 'warn' : 'bad');
  offerPill.textContent = ok ? 'RENTABLE (≥ GH ' + fmtNum(settings.rate, 0) + ' €/h)' : v.zone === 'rouge' ? 'À ÉVALUER (sous GH, au-dessus du plancher ' + fmtNum(seuilNoir(), 2) + ' €)' : 'PERTE — zone noire (risque pour la plateforme)';
  offerStartBtn.disabled = false;
  offerStartBtn.innerHTML = '▶ Lancer le chrono (' + fmtMoney(v.prix) + ')';
}
// Estimation du trajet/approche avec le trafic réel via Google Distance Matrix.
// Appelée UNIQUEMENT si une clé perso est renseignée (Réglages) — les adresses vont
// alors de ton téléphone directement à Google, jamais ailleurs. Fallback : estimation locale.
async function refineOfferWithRouting() {
  const key = (settings.gmapsKey || '').trim();
  if (!key) return;
  const pickup = offerPickup.value.trim(), dest = offerDest.value.trim();
  if (!pickup || !dest) return;
  offerStatus.textContent = 'OCR ✔ — estimation trafic réel (Google)…';
  try {
    const u = (origins, destinations) => 'https://maps.googleapis.com/maps/api/distancematrix/json?origins=' +
      encodeURIComponent(origins) + '&destinations=' + encodeURIComponent(destinations) +
      '&mode=driving&departure_time=now&key=' + encodeURIComponent(key);
    const r = await fetch(u(pickup, dest));
    const j = await r.json();
    const el = j.rows && j.rows[0] && j.rows[0].elements && j.rows[0].elements[0];
    if (el && el.status === 'OK' && el.duration) {
      offerTrajet.value = Math.ceil(el.duration.value / 60);
      if (el.distance) offerDist.value = Math.round(el.distance.value / 100) / 10;
      renderOfferVerdict();
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const r2 = await fetch(u(pos.coords.latitude + ',' + pos.coords.longitude, pickup));
          const j2 = await r2.json();
          const el2 = j2.rows && j2.rows[0] && j2.rows[0].elements && j2.rows[0].elements[0];
          if (el2 && el2.status === 'OK' && el2.duration) { offerEta.value = Math.ceil(el2.duration.value / 60); renderOfferVerdict(); }
        } catch (err) { /* ignore */ }
      }, () => {}, { timeout: 6000, maximumAge: 30000 });
    }
    offerStatus.textContent = 'OCR ✔ + trafic réel Google ✔ — corrige les champs si besoin.';
  } catch (e) {
    offerStatus.textContent = 'OCR ✔ (routing Google indisponible : ' + e.message + ') — estimation locale.';
  }
}
function openOfferModal() {
  offerModal.classList.remove('hidden');
  offerVerdict.classList.add('hidden');
  offerRaw.textContent = '—';
  offerStatus.textContent = '…';
  offerProg.style.width = '0';
  offerPlat.textContent = '';
  offerStartBtn.disabled = true;
}
function closeOfferModal() { offerModal.classList.add('hidden'); }
async function handleOfferFile(file) {
  if (!file) return;
  openOfferModal();
  offerStatus.textContent = 'Chargement de l’image…';
  // attendre VRAIMENT que l'image soit décodée avant de la passer à l'OCR
  await new Promise((res, rej) => {
    offerImg.onload = res;
    offerImg.onerror = () => rej(new Error('image illisible'));
    offerImg.src = URL.createObjectURL(file);
  });
  offerStatus.textContent = 'Image chargée — lancement de l’OCR local…';
  offerScan.style.display = 'block';
  try {
    const text = await ocrImageEl(offerImg);
    offerScan.style.display = 'none';
    offerRawText = text;
    offerRaw.textContent = text;
    const p = parseOfferText(text);
    offerPrix.value = p.prix !== null ? String(p.prix).replace('.', ',') : '';
    offerEta.value = p.eta !== null ? p.eta : '';
    offerDist.value = p.dist !== null ? String(Math.round(p.dist * 10) / 10).replace('.', ',') : '';
    offerTrajet.value = p.dist !== null ? Math.round(p.dist * 2.2 + 3) : '';
    offerSurge.value = p.surge !== null ? String(p.surge).replace('.', ',') : '';
    offerPickup.value = p.pickup;
    offerDest.value = p.dest;
    const plat = detectPlatformFromText(text);
    offerPlat.textContent = '· ' + ((PLATFORMS[plat] || {}).label || plat);
    offerPlat.dataset.plat = plat;
    if (p.prix === null) offerStatus.textContent = 'OCR ✔ — prix non détecté, saisis-le à la main (le reste est pré-rempli).';
    renderOfferVerdict();
    refineOfferWithRouting(); // trafic réel si clé Google renseignée (async, non bloquant)
  } catch (e) {
    offerScan.style.display = 'none';
    const extra = window.__lastOcrErr ? ' [' + window.__lastOcrErr + ']' : '';
    offerStatus.textContent = 'OCR indisponible : ' + e.message + extra + ' — remplis les champs à la main.';
    renderOfferVerdict();
  }
}

/* ================= Chrono (anneau 60 min + bille) ================= */
const HOUR = 3600; // 1 tour d'anneau = 60 minutes
const timer = {
  running: false, intervalId: null, startStamp: 0, price: 0, platform: null,
  seuils: null, lastZone: null, lastOverBeep: 0,
  phaseDefs: [], phaseIdx: 0, marks: [],
};
let displayMode = 'time'; // 'time' | 'euro'

function setDisplay(mode) {
  displayMode = mode === 'euro' ? 'euro' : 'time';
  segTime.classList.toggle('on', displayMode === 'time');
  segEuro.classList.toggle('on', displayMode === 'euro');
  // jamais les deux en même temps (style.display, pas l'attribut hidden)
  clockEl.style.display = displayMode === 'euro' ? 'none' : 'flex';
  euroCenter.style.display = displayMode === 'euro' ? 'flex' : 'none';
  if (timer.running) tick();
}

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

function startTimer(price, platform) {
  if (timer.intervalId) clearInterval(timer.intervalId);
  timer.running = true;
  timer.price = price;
  timer.platform = platform || settings.platform;
  timer.seuils = seuilsTemps(price);
  timer.lastZone = null;
  timer.lastOverBeep = 0;
  timer.phaseDefs = MODES[modeOf()].phases;
  timer.phaseIdx = 0;
  timer.marks = [];
  timer.startStamp = Date.now();
  const pl = PLATFORMS[timer.platform] || PLATFORMS.uber;
  chronoPlat.innerHTML = ico(pl.icon, 1) + ' ' + pl.label;
  setDisplay(displayMode);
  buildRing();
  renderPhaseButtons();
  playSound('start', 880);
  showView('chrono');
  tick();
  timer.intervalId = setInterval(tick, 250);
}

function renderPhaseButtons() {
  if (!timer.running) { phaseBtns.innerHTML = ''; return; }
  const actions = MODES[modeOf()].phaseActions;
  let html = '';
  for (let i = timer.phaseIdx; i < timer.phaseDefs.length - 1; i++) {
    html += '<button type="button" class="cta ctaPhase phaseBtn" data-next="' + (i + 1) + '">' +
      ico(timer.phaseDefs[i + 1].icon, 1) + ' ' + actions[i] + '</button>';
  }
  phaseBtns.innerHTML = html;
}
function phaseDurations(elapsed) {
  const durs = [];
  let prev = 0;
  for (let i = 0; i < timer.phaseDefs.length; i++) {
    if (i < timer.marks.length) { durs.push(Math.max(0, timer.marks[i] - prev)); prev = timer.marks[i]; }
    else if (i === timer.phaseIdx) { durs.push(Math.max(0, elapsed - prev)); prev = elapsed; }
    else durs.push(0);
  }
  return durs;
}
// Point fixe posé sur la couronne à l'angle du temps donné (0 deg = midi, sens horaire)
function addRingMark(sec, prise) {
  const deg = (sec / HOUR * 360) % 360;
  const el = document.createElement('span');
  el.className = 'ringMark' + (prise ? ' prise' : '');
  el.style.transform = 'rotate(' + deg + 'deg) translateY(calc(min(78vw, 340px) / -2 + 13px))';
  el.title = (prise ? 'Client pris en charge · ' : 'Changement de phase · ') + fmtClock(sec);
  ringMarks.appendChild(el);
}
function nextPhase(next) {
  if (!timer.running || next <= timer.phaseIdx || next > timer.phaseDefs.length - 1) return;
  const at = elapsedNow();
  timer.marks[timer.phaseIdx] = at;
  timer.phaseIdx = next;
  addRingMark(at, next === timer.phaseDefs.length - 1); // transition vers la dernière phase = client pris en charge
  playSound('phase', 1200, false, 1); // son phase (son-phase.mp3 = notification Uber) joué 1 seconde max
  const d = timer.phaseDefs[next - 1];
  const prevMark = timer.marks[next - 2] || 0;
  showToast(ico(d.icon, 1) + ' ' + d.label + ' : ' + fmtClock(timer.marks[next - 1] - prevMark) + ' → ' + ico(timer.phaseDefs[next].icon, 1) + ' ' + timer.phaseDefs[next].label);
  renderPhaseButtons();
  tick();
}
function elapsedNow() {
  const raw = (Date.now() - timer.startStamp) / 1000;
  const m = demoMul();
  return m > 1 ? raw * m : raw; // mode démo : temps accéléré ×N
}

// Pastille « chrono actif » dans l'en-tête de tous les écrans : le chrono continue
// de tourner quand on change d'écran (et même onglet navigateur masqué, car le temps
// est calculé depuis Date.now()). Un clic ramène à l'écran Chrono.
function updateLiveChips(zone, elapsed) {
  liveChips.forEach((c) => {
    if (!timer.running) { c.classList.add('hidden'); return; }
    c.classList.remove('hidden');
    c.style.color = ZONE_COLORS[zone];
    c.style.borderColor = ZONE_COLORS[zone];
    c.innerHTML = zIcon(zone, 0.95) + ' <span class="clk">' + fmtClock(elapsed) + '</span>' +
      (settings.demoOn ? ' <b class="demoTag">×' + demoMul() + '</b>' : '');
  });
}
liveChips.forEach((c) => c.addEventListener('click', () => { if (timer.running) showView('chrono'); }));
document.addEventListener('visibilitychange', () => { if (!document.hidden && timer.running) tick(); });

function tick() {
  const elapsed = elapsedNow();
  updateDemoBadges();
  const taux = tauxEffectif(timer.price, elapsed);
  const zone = zoneDe(taux);
  const s = timer.seuils;

  // Anneau 60 min : 15 min = 1er quart (90°). La bille fait un tour par heure.
  const fillDeg = Math.min(elapsed, HOUR) / HOUR * 360;
  const orbitDeg = (elapsed / HOUR * 360) % 360;
  orbiter.style.transform = 'rotate(' + orbitDeg + 'deg)';
  orbDot.style.boxShadow = '0 0 16px 6px ' + ZONE_COLORS[zone] + ', 0 0 4px 2px #fff';
  const stops = ringStops(s);
  const parts = stops.map(([z, a, b]) => {
    const startDeg = a / HOUR * 360, endDeg = b / HOUR * 360;
    const visEnd = Math.min(Math.max(fillDeg - startDeg, 0), endDeg - startDeg) / 360 * 100;
    return ZONE_COLORS[z] + ' ' + (a / HOUR * 100) + '% ' + (a / HOUR * 100 + visEnd) + '%';
  });
  ringProgress.style.background = 'conic-gradient(' + parts.join(', ') + ', transparent ' + (fillDeg / 360 * 100) + '% 100%)';
  ringProgress.style.opacity = '1';

  // Centre : temps (MM gros : SS petit) ou compteur € seul, couleur = zone
  const mm = Math.floor(elapsed / 60), ss = Math.floor(elapsed % 60);
  clockMin.textContent = String(mm).padStart(2, '0');
  clockSec.textContent = String(ss).padStart(2, '0');
  clockEl.style.color = ZONE_COLORS[zone];
  if (displayMode === 'euro') {
    const ev = elapsed * settings.rate / 3600;
    euroInt.textContent = String(Math.floor(ev));
    euroDec.textContent = ',' + String(Math.min(99, Math.round((ev - Math.floor(ev)) * 100))).padStart(2, '0');
    euroCenter.style.color = ZONE_COLORS[zone];
  }
  clockZone.innerHTML = zIcon(zone, 1.1) + ' ' + zoneMeta(zone).label +
    ' <span class="netPrice">(prix net : ' + fmtMoney(timer.price) + ')</span>';
  clockZone.style.color = ZONE_COLORS[zone];
  setAmbient(zone);
  document.title = zoneMeta(zone).label + ' ' + fmtClock(elapsed) + ' — GH';

  // Statut : passage à la zone suivante
  const txF = fmtNum(taux);
  let st = '';
  if (zone === 'double') st = zIcon('double') + ' Diamant — ' + txF + ' €/h · passage en étoile dans ' + fmtClock(Math.max(0, s.double - elapsed));
  else if (zone === 'etoile') st = zIcon('etoile') + ' Étoile — ' + txF + ' €/h · passage en verte dans ' + fmtClock(Math.max(0, s.etoile - elapsed));
  else if (zone === 'verte') st = zIcon('verte') + ' Verte — ' + txF + ' €/h · passage en rouge dans ' + fmtClock(Math.max(0, s.verte - elapsed));
  else if (zone === 'rouge') st = zIcon('rouge') + ' Rouge — ' + txF + ' €/h · passage en noire dans ' + fmtClock(Math.max(0, s.rouge - elapsed));
  else st = zIcon('noire') + ' ZONE NOIRE — ' + txF + ' €/h (plancher ' + fmtNum(seuilNoir(), 2) + ' €)';
  statusLine.innerHTML = st;

  // Phases
  const durs = phaseDurations(elapsed);
  phaseChips.innerHTML = timer.phaseDefs.map((d, i) =>
    '<span class="phaseChip">' + ico(d.icon, 0.95) + ' ' + d.label + ' ' + fmtClock(durs[i]) + '</span>').join('');

  // Sons à chaque entrée de zone (fichiers sons/ sinon bips) : double/étoile/verte/rouge 1×,
  // noire = double bip + vibration à l'entrée, puis rappel toutes les 5 min (voir ci-dessous)
  if (zone !== timer.lastZone) {
    if (zone === 'double') playSound('double', 1400);
    else if (zone === 'etoile') playSound('etoile', 1200);
    else if (zone === 'verte') playSound('verte', 1000);
    else if (zone === 'rouge') playSound('rouge', 880);
    if (zone === 'noire') { playSound('noire', 660, true); if (navigator.vibrate) navigator.vibrate([200, 80, 200]); }
    timer.lastZone = zone;
  }
  // Zone noire : bip d'entrée à chaque passage, puis rappel UNE FOIS TOUTES LES 5 MINUTES
  if (zone === 'noire' && elapsed - timer.lastOverBeep > 300) {
    playSound('noire', 660, true);
    if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
    timer.lastOverBeep = elapsed;
  }
  updateLiveChips(zone, elapsed);
}

function stopAndSave() {
  if (!timer.running) return;
  const elapsed = Math.max(elapsedNow(), 1);
  const price = timer.price;
  const taux = tauxEffectif(price, elapsed);
  const zone = zoneDe(taux);
  const s = timer.seuils;
  const durs = phaseDurations(elapsed);
  const phases = timer.phaseDefs.map((d, i) => ({ label: d.label, icon: d.icon, sec: Math.round(durs[i]) }));
  const startDate = timer.startStamp ? new Date(timer.startStamp).toISOString() : new Date().toISOString();
  const base = { price: price, actual: Math.round(elapsed), phases: phases, platform: timer.platform, date: startDate };
  const extra = { taux: taux, zone: zone, seuils: s, src: 'chrono' };
  resetTimer();
  playSound('stop', 520);
  // Détection de doublon avec une course importée (CSV) ou saisie manuellement :
  // on propose de fusionner — l'approche chronométrée (la plus fiable) est conservée,
  // le temps de course vient du CSV / de la saisie manuelle.
  const dup = findDup({ date: startDate, price: price });
  if (dup && window.confirm(
    'Une course très similaire existe déjà dans l’historique :\n' +
    fmtDate(dup.date) + ' · ' + fmtMoney(dup.price) + ' · source ' + (SRC_META[srcOf(dup)] || SRC_META.manuel).label + '\n\n' +
    'Fusionner les deux courses ?\n' +
    '→ l’approche chronométrée (la plus fiable) sera conservée\n' +
    '→ le temps de course sera pris sur la source la plus fiable (CSV > manuel)'
  )) {
    const kept = mergeRide(dup, { date: startDate, price: price, phases: phases, src: 'chrono', platform: timer.platform });
    saveRides();
    monthSel = periodKey(dup.date);
    renderHistory();
    showToast(ico('up', 1) + ' Doublon détecté : course fusionnée (' + (kept.length ? kept.join(', ') + ' pris sur le chrono' : 'aucun champ') + ') → ' + fmtNum(dup.taux) + ' €/h ' + zIcon(dup.zone, 1));
  } else {
    saveRide(base, extra);
  }
  priceInput.value = '';
  updateCourse();
  showView('course');
}
function cancelTimer() {
  if (!timer.running) return;
  resetTimer();
  showToast('Chrono annulé, course non enregistrée.');
  showView('course');
}
function resetTimer() {
  if (timer.intervalId) clearInterval(timer.intervalId);
  timer.intervalId = null;
  timer.running = false;
  clockMin.textContent = '00';
  clockSec.textContent = '00';
  clockEl.style.color = '';
  euroCenter.style.color = '';
  clockZone.textContent = '—';
  clockZone.style.color = '';
  statusLine.textContent = '';
  phaseChips.innerHTML = '';
  renderPhaseButtons();
  ringProgress.style.opacity = '0.25';
  orbiter.style.transform = 'rotate(0deg)';
  orbDot.style.boxShadow = '';
  ringMarks.innerHTML = '';
  liveChips.forEach((c) => c.classList.add('hidden'));
  setAmbient(null);
  document.title = 'GH · ' + fmtNum(settings.rate, 0) + ' €/h';
}

/* ================= Son ================= */
let audioCtx = null;
function beep(freq) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq || 880;
    g.gain.setValueAtTime(0.25, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.35);
  } catch (e) { /* audio indisponible */ }
}
function doubleBeep() { beep(660); setTimeout(() => beep(660), 180); }

/* ================= Sons locaux (sons/*.mp3|ogg|wav|m4a) =================
   Mapping (voir sons/README.md — set SoundCloud « UBER Drivers App ») :
   start→son-start, phase→son-phase, double→son-double, etoile→son-etoile,
   verte→son-verte, rouge→son-rouge, noire→son-noire (×2), stop→son-stop.
   Lecture via WebAudio (AudioBuffer) : sur iOS Safari, AUCUN son programmatique
   ne marche tant que l'AudioContext n'a pas été « débloqué » par un geste
   utilisateur → on appelle resume() au premier pointerdown/touchend et on
   précharge tous les fichiers à ce moment-là. Ensuite les buffer sources
   jouent sans geste. Si fichier absent (ou sons coupés) → bip synthétique. */
const SOUND_EXTS = ['.mp3', '.ogg', '.wav', '.m4a'];
const SOUND_NAMES = ['start', 'phase', 'double', 'etoile', 'verte', 'rouge', 'noire', 'stop'];
const soundBuffers = {}; // name -> AudioBuffer | null (pas de fichier)
function ensureCtx() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; } }
  return audioCtx;
}
function unlockAudio() {
  const ctx = ensureCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume(); // OK ici : on est dans un geste
  SOUND_NAMES.forEach((n) => { loadSound(n); }); // préchargement
}
document.addEventListener('pointerdown', unlockAudio);
document.addEventListener('touchend', unlockAudio);
async function loadSound(name) {
  if (name in soundBuffers) return soundBuffers[name];
  soundBuffers[name] = null;
  const ctx = ensureCtx();
  if (!ctx) return null;
  for (const ext of SOUND_EXTS) {
    try {
      const r = await fetch('sons/' + name + ext);
      if (r.ok) {
        soundBuffers[name] = await ctx.decodeAudioData(await r.arrayBuffer());
        return soundBuffers[name];
      }
    } catch (e) { /* on essaie l'extension suivante */ }
  }
  return null;
}
function playBuf(buf, delaySec, durSec) {
  if (!audioCtx || audioCtx.state !== 'running' || !buf) return false;
  try {
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const g = audioCtx.createGain();
    g.gain.value = 0.9;
    src.connect(g);
    g.connect(audioCtx.destination);
    const t = audioCtx.currentTime + (delaySec || 0);
    src.start(t);
    if (durSec) src.stop(t + durSec); // extrait court (ex. 1 s)
    return true;
  } catch (e) { return false; }
}
async function playSound(name, fallbackFreq, twice, durSec) {
  if (settings.sons === false) return;
  const ctx = ensureCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume();
  const buf = ctx ? await loadSound(name) : null;
  if (playBuf(buf, 0, durSec)) { if (twice) playBuf(buf, 0.18, durSec); return; }
  if (audioCtx && audioCtx.state === 'running' && fallbackFreq) {
    beep(fallbackFreq);
    if (twice) setTimeout(() => beep(fallbackFreq), 180);
  }
}

/* ================= Historique ================= */
function saveRide(base, extra) {
  const s = extra.seuils || seuilsTemps(base.price);
  const taux = extra.taux !== undefined ? extra.taux : tauxEffectif(base.price, base.actual);
  const ride = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    date: base.date || new Date().toISOString(),
    price: base.price,
    actual: Math.round(base.actual),
    phases: base.phases || [],
    taux: taux,
    zone: extra.zone || zoneDe(taux),
    platform: base.platform || settings.platform,
    src: extra.src || 'manuel',
    bonus: Math.round(Math.max(0, Number(base.bonus) || 0) * 100) / 100,
    tDouble: Math.round(s.double),
    tEtoile: Math.round(s.etoile),
    tVerte: Math.round(s.verte),
    tRouge: Math.round(s.rouge),
  };
  rides.push(ride);
  saveRides();
  monthSel = periodKey(ride.date);
  renderHistory();
  showToast(zIcon(ride.zone, 1.1) + ' Course enregistrée : ' + fmtDur(ride.actual) + ' → ' + fmtNum(ride.taux) + ' €/h');
}

/* ================= Sources & dédoublonnage =================
   3 sources de courses : 'chrono' (chronométrée), 'manuel' (saisie manuelle), 'csv' (import).
   Fiabilité par champ (règles métier) :
   - approche (phase 0) : chrono > manuel > csv
   - course (phases suivantes) : csv > manuel > chrono
   - prix : manuel (correction volontaire) > csv (donnée Uber) > chrono
   À l'ajout/import, une course proche d'une course existante (même prix à ±10 % / 1 €,
   début ou fin à ±20 min) est fusionnée champ par champ selon ces priorités. */
const SRC_RANK_APP = { chrono: 3, manuel: 2, csv: 1 };
const SRC_RANK_COURSE = { csv: 3, manuel: 2, chrono: 1 };
const SRC_RANK_PRICE = { manuel: 3, csv: 2, chrono: 1 };
const SRC_META = {
  chrono: { icon: 'clock', label: 'chrono' },
  manuel: { icon: 'edit', label: 'manuel' },
  csv: { icon: 'up', label: 'csv' },
};
function srcOf(r) { return r.src || (r.extId ? 'csv' : 'manuel'); }
function srcBadge(r) { const m = SRC_META[srcOf(r)] || SRC_META.manuel; return ico(m.icon, 0.9) + ' ' + m.label; }
/* Doublon = même prix (± max(1 €, 10 %)) et début OU fin à ± 20 min. */
function findDup(cand) {
  const t = new Date(cand.date).getTime();
  if (!Number.isFinite(t) || !(cand.price > 0)) return null;
  let best = null, bestScore = Infinity;
  for (const r of rides) {
    if (cand.extId && r.extId === cand.extId) continue; // doublon par n° de course géré à part
    const rt = new Date(r.date).getTime();
    if (!Number.isFinite(rt)) continue;
    const dt = Math.min(Math.abs(t - rt), Math.abs(t - (rt + (r.actual || 0) * 1000)));
    if (dt > 20 * 60 * 1000) continue;
    const dp = Math.abs(cand.price - (r.price || 0));
    if (dp > Math.max(1, 0.1 * Math.min(cand.price, r.price || 0))) continue;
    const score = dt + dp * 60000;
    if (score < bestScore) { bestScore = score; best = r; }
  }
  return best;
}
/* Fusionne `inc` ({date, price, phases, src, extId?, meta?, platform?}) dans `existing`
   champ par champ selon les priorités de source. Retourne la liste des champs pris à inc. */
function mergeRide(existing, inc) {
  const sEx = srcOf(existing), sIn = inc.src || 'csv';
  const kept = [];
  if ((SRC_RANK_PRICE[sIn] || 0) > (SRC_RANK_PRICE[sEx] || 0)) { existing.price = inc.price; kept.push('prix'); }
  const phEx = (existing.phases && existing.phases.length) ? existing.phases : null;
  const phIn = inc.phases || [];
  if (!phEx) {
    if (phIn.length) { existing.phases = phIn.map((q) => ({ label: q.label, icon: q.icon, sec: q.sec })); kept.push('phases'); }
  } else {
    const merged = phEx.map((p, i) => {
      const q = phIn[i] || phIn.find((x) => x.label === p.label);
      if (!q) return p;
      const rank = i === 0 ? SRC_RANK_APP : SRC_RANK_COURSE; // phase 0 = approche, le reste = course
      if ((rank[sIn] || 0) > (rank[sEx] || 0)) { kept.push(p.label); return { label: p.label, icon: p.icon || q.icon, sec: q.sec }; }
      return p;
    });
    phIn.forEach((q) => { if (!merged.find((x) => x.label === q.label)) { merged.push({ label: q.label, icon: q.icon, sec: q.sec }); kept.push(q.label); } });
    existing.phases = merged;
  }
  if (inc.extId && !existing.extId) existing.extId = inc.extId;
  if (inc.meta) existing.meta = Object.assign({}, existing.meta, inc.meta);
  if (inc.platform) existing.platform = inc.platform;
  if (inc.bonus > 0) existing.bonus = Math.max(existing.bonus || 0, inc.bonus); // bonus saisi = info, jamais dans le prix
  if (inc.date && new Date(inc.date) < new Date(existing.date)) existing.date = inc.date; // garde le début le plus ancien
  existing.actual = phasesOf(existing).reduce((a, x) => a + x.sec, 0);
  const s = seuilsTemps(existing.price);
  existing.taux = tauxEffectif(existing.price, existing.actual);
  existing.zone = zoneDe(existing.taux);
  existing.tDouble = Math.round(s.double);
  existing.tEtoile = Math.round(s.etoile);
  existing.tVerte = Math.round(s.verte);
  existing.tRouge = Math.round(s.rouge);
  return kept;
}
function toLocalInputValue(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function renderMonthFilter() {
  const periods = Array.from(new Set(rides.map((r) => periodKey(r.date)))).sort().reverse();
  const years = Array.from(new Set(rides.map((r) => yearOf(r.date)))).sort().reverse();
  const current = periodKey(new Date().toISOString());
  if (monthSel === null) monthSel = periods.includes(current) ? current : (periods[0] || 'all'); // sinon : période la plus récente avec des courses
  if (monthSel !== 'all' && monthSel.indexOf('Y:') !== 0 && !periods.includes(monthSel)) monthSel = 'all';
  const statsOf = (pred) => {
    const l = rides.filter(pred);
    const tp = l.reduce((s, r) => s + r.price, 0);
    const ts = l.reduce((s, r) => s + r.actual, 0);
    return { icon: (l.length && ts) ? ZONE_EMOJI[zoneDe(tp / (ts / 3600))] + ' ' : '', total: tp };
  };
  const keys = ['all'].concat(years.map((y) => 'Y:' + y)).concat(periods);
  monthFilter.innerHTML = keys.map((k) => {
    let label, st;
    if (k === 'all') { st = statsOf(() => true); label = st.icon + '🗂️ Toutes les périodes (' + fmtMoney(st.total) + ')'; }
    else if (k.indexOf('Y:') === 0) {
      const y = k.slice(2);
      st = statsOf((r) => yearOf(r.date) === Number(y));
      label = st.icon + '🗓️ Année ' + y + ' (' + fmtMoney(st.total) + ')';
    } else {
      st = statsOf((r) => periodKey(r.date) === k);
      label = st.icon + '📅 ' + periodLabel(k) + ' (' + fmtMoney(st.total) + ')';
    }
    return '<option value="' + k + '"' + (k === monthSel ? ' selected' : '') + '>' + label + '</option>';
  }).join('');
}

function phasesOf(r) {
  return (r.phases && r.phases.length) ? r.phases : [{ label: 'total', icon: 'clock', sec: r.actual }];
}

/* ---- Tri de l'historique ---- */
const ZONE_RANK = { double: 5, etoile: 4, verte: 3, rouge: 2, noire: 1 };
const SORTS = [
  { k: 'date_desc', label: '📅 Date ↓ (récent d’abord)' },
  { k: 'date_asc', label: '📅 Date ↑ (ancien d’abord)' },
  { k: 'price_desc', label: '💶 Prix net ↓' },
  { k: 'price_asc', label: '💶 Prix net ↑' },
  { k: 'garanti_desc', label: '🛡️ Prix garanti ↓' },
  { k: 'garanti_asc', label: '🛡️ Prix garanti ↑' },
  { k: 'taux_desc', label: '⏱️ Taux horaire ↓' },
  { k: 'taux_asc', label: '⏱️ Taux horaire ↑' },
  { k: 'duree_desc', label: '⌛ Durée de course ↓' },
  { k: 'duree_asc', label: '⌛ Durée de course ↑' },
  { k: 'zone_desc', label: '🏆 Zone (meilleure d’abord)' },
];
const garantiOf = (r) => r.actual / 3600 * settings.rate;
let sortKey = 'date_desc';
try { sortKey = localStorage.getItem('garantieHoraire.sort.v6.' + profile) || 'date_desc'; } catch (e) { /* ignore */ }
function renderSortSel() {
  sortSel.innerHTML = SORTS.map((s) => '<option value="' + s.k + '"' + (s.k === sortKey ? ' selected' : '') + '>' + s.label + '</option>').join('');
}
function sortList(list) {
  const cmp = {
    date_desc: (a, b) => b.date.localeCompare(a.date),
    date_asc: (a, b) => a.date.localeCompare(b.date),
    price_desc: (a, b) => b.price - a.price,
    price_asc: (a, b) => a.price - b.price,
    garanti_desc: (a, b) => garantiOf(b) - garantiOf(a),
    garanti_asc: (a, b) => garantiOf(a) - garantiOf(b),
    taux_desc: (a, b) => b.taux - a.taux,
    taux_asc: (a, b) => a.taux - b.taux,
    duree_desc: (a, b) => b.actual - a.actual,
    duree_asc: (a, b) => a.actual - b.actual,
    zone_desc: (a, b) => (ZONE_RANK[b.zone] - ZONE_RANK[a.zone]) || b.date.localeCompare(a.date),
  }[sortKey] || ((a, b) => b.date.localeCompare(a.date));
  return list.slice().sort(cmp);
}

function renderHistory() {
  renderMonthFilter();
  renderSortSel();
  let list;
  if (monthSel === 'all') list = rides.slice();
  else if (monthSel.indexOf('Y:') === 0) { const y = Number(monthSel.slice(2)); list = rides.filter((r) => yearOf(r.date) === y); }
  else list = rides.filter((r) => periodKey(r.date) === monthSel);
  list = list.filter((r) => zoneVisible[r.zone] !== false);
  clearBtn.disabled = rides.length === 0;

  if (list.length === 0) {
    statsEl.innerHTML = '<p style="color:var(--muted)">Aucune course pour cette sélection.</p>';
    ridesList.innerHTML = '';
    return;
  }

  const nb = list.length;
  const totalPrix = list.reduce((s, r) => s + r.price, 0);
  const totalSec = list.reduce((s, r) => s + r.actual, 0);
  const tauxMoyen = totalPrix / (totalSec / 3600);
  const zoneMois = zoneDe(tauxMoyen);
  const montantGaranti = totalSec / 3600 * settings.rate;
  const solde = list.reduce((s, r) => s + (r.tVerte - r.actual), 0);
  const soldeEtoile = list.reduce((s, r) => s + (r.tEtoile - r.actual), 0);
  const soldeDouble = list.reduce((s, r) => s + ((r.tDouble !== undefined ? r.tDouble : r.tEtoile) - r.actual), 0);
  const soldeRougeNoir = list.reduce((s, r) => s + (r.tRouge - r.actual), 0);
  const bz = { double: 0, etoile: 0, verte: 0, rouge: 0, noire: 0 };
  for (const r of list) { if (bz[r.zone] !== undefined) bz[r.zone] += r.actual; }
  const phaseTotals = [];
  for (const r of list) {
    for (const p of phasesOf(r)) {
      let e = phaseTotals.find((x) => x.label === p.label);
      if (!e) { e = { label: p.label, icon: p.icon || 'clock', sec: 0 }; phaseTotals.push(e); }
      e.sec += p.sec;
    }
  }

  statsEl.innerHTML =
    '<div class="stat pastille" style="border-color:' + ZONE_COLORS[zoneMois] + ';box-shadow:0 0 30px ' + ZONE_COLORS[zoneMois] + '55">' +
      zIcon(zoneMois, 2.4) + '<strong>' + zoneMeta(zoneMois).label + '</strong></div>' +
    '<div class="stat"><span>' + (modeOf() === 'livreur' ? 'Zone de la semaine' : 'Zone du mois') + '</span><strong>' + zoneMeta(zoneMois).label + '</strong></div>' +
    '<div class="stat"><span>Courses</span><strong>' + nb + '</strong></div>' +
    '<div class="stat"><span>Encaissé</span><strong>' + fmtMoney(totalPrix) + '</strong></div>' +
    (function () {
      // Prix brut TTC réellement facturé au client : factures (driver-to-rider) si importées,
      // sinon fallback original_fare_local des courses CSV.
      const inv = facturedTTC(monthSel);
      if (inv.n > 0) {
        return '<div class="stat"><span>Facturée TTC (factures)</span><strong>' + fmtMoney(inv.total) + '</strong>' +
          '<em>' + inv.n + ' ligne(s) de facture</em></div>';
      }
      const withC = list.filter((r) => r.meta && (r.meta.original > 0 || r.meta.commission > 0));
      if (!withC.length) return '';
      const orig = withC.reduce((s, r) => s + (r.meta.original || (r.price + (r.meta.commission || 0))), 0);
      return '<div class="stat"><span>Facturée (prix brut client)</span><strong>' + fmtMoney(orig) + '</strong>' +
        '<em>courses CSV : ' + withC.length + ' (réimporte les factures pour le TTC réel)</em></div>';
    })() +
    '<div class="stat"><span>Garanti (temps × GH ' + fmtNum(settings.rate, 0) + ' €)</span><strong>' + fmtMoney(montantGaranti) + '</strong></div>' +
    (function () {
      const estimGH = Math.max(0, montantGaranti - totalPrix); // 0 € si taux ≥ GH, sinon le complément dû
      const bonus = bonusFor(monthSel);
      return '<div class="stat ' + (estimGH > 0 ? 'pos' : '') + '"><span>Estimation GH</span><strong>' + fmtMoney(estimGH) + '</strong></div>' +
        '<button type="button" class="stat bonusStat" title="Saisir le bonus réel de la période">' +
          '<span>GH réelle + Bonus — saisir</span><strong>' + (bonus > 0 ? fmtMoney(bonus) : '- €') + '</strong>' +
          '<em>' + (bonus > 0 ? 'GH réelle + bonus saisi : ' + fmtMoney(bonus) + ' (remplace l’estimation ' + fmtMoney(estimGH) + ')' : 'aucun bonus saisi pour cette période') + '</em>' +
        '</button>';
    })() +
    (function () {
      // Commission Uber sur la période (données CSV uniquement) :
      // - avant GH : montant € + taux = commission / prix brut client (original_fare)
      // - après GH : la GH (estimation, ou saisie manuelle dans « GH + Bonus réel » si renseignée)
      //   vient en déduction de la commission : comm − GH. Taux après GH sur la même base (prix brut).
      const withC = list.filter((r) => r.meta && (r.meta.commission > 0 || r.meta.original > 0));
      if (!withC.length) return '';
      const comm = withC.reduce((s, r) => s + (r.meta.commission || 0), 0);
      // Base du % : brut TTC réellement facturé (factures) si dispo, sinon original_fare_local
      const inv = facturedTTC(monthSel);
      const orig = inv.n > 0 ? inv.total : withC.reduce((s, r) => s + (r.meta.original || (r.price + (r.meta.commission || 0))), 0);
      const pct = orig > 0 ? (comm / orig) * 100 : 0;
      const estimGH = Math.max(0, montantGaranti - totalPrix);
      const bonus = bonusFor(monthSel);
      const ghAj = bonus > 0 ? bonus : estimGH; // GH saisie manuellement prioritaire, sinon estimation
      const commApres = Math.max(0, comm - ghAj); // ghAj = 0 → après GH = avant GH
      const pctApres = orig > 0 ? (commApres / orig) * 100 : 0;
      return '<div class="stat"><span>Commission Uber (avant GH)</span><strong>' + fmtMoney(comm) + '</strong>' +
          '<em>taux de commission ' + fmtNum(pct) + ' % — prix brut client ' + fmtMoney(orig) + '</em></div>' +
        '<div class="stat"><span>Commission après GH</span><strong>' + fmtMoney(commApres) + '</strong>' +
          '<em>taux après GH ' + fmtNum(pctApres) + ' %' + (ghAj > 0 ? ' — moins ' + fmtMoney(ghAj) + (bonus > 0 ? ' (GH saisie)' : ' (estimation GH)') : ' — aucune GH déduite') + '</em></div>';
    })() +
    '<div class="stat"><span>Temps total</span><strong>' + fmtDur(totalSec) + '</strong></div>' +
    '<div class="stat"><span>Par phase</span><strong>' + phaseTotals.map((e) => ico(e.icon, 0.9) + ' ' + fmtDur(e.sec)).join(' · ') + '</strong></div>' +
    '<div class="stat highlight"><span>Taux horaire moyen</span><strong>' + fmtNum(tauxMoyen) + ' €/h</strong></div>' +
    '<div class="stat ' + (tauxMoyen >= settings.rate ? 'pos' : 'neg') + '"><span>vs GH ' + fmtNum(settings.rate, 0) + ' €/h</span><strong>' + (tauxMoyen >= settings.rate ? 'au-dessus' : 'en dessous') + '</strong></div>' +
    objStatHtml(totalSec, nb) +
    '<div class="zoneBreakdown">' +
      '<span class="zb">' + zIcon('double', 1) + ' ' + fmtDur(bz.double) + '</span>' +
      '<span class="zb">' + zIcon('etoile', 1) + ' ' + fmtDur(bz.etoile) + '</span>' +
      '<span class="zb">' + zIcon('verte', 1) + ' ' + fmtDur(bz.verte) + '</span>' +
      '<span class="zb">' + zIcon('rouge', 1) + ' ' + fmtDur(bz.rouge) + '</span>' +
      '<span class="zb">' + zIcon('noire', 1) + ' ' + fmtDur(bz.noire) + '</span>' +
    '</div>' +
    '<div class="etatLieux">' +
      '<h3>État des lieux ' + (modeOf() === 'livreur' ? 'de la semaine' : 'du mois') + ' — moyennes par course</h3>' +
      (function () {
        // Toutes les marges sont exprimées EN MOYENNE PAR COURSE :
        // en €/course (converti via la GH) ou en minutes de plus par course.
        // Si la zone de la période EST cette catégorie → ligne en gras « Tu as été X ».
        const eurCourse = (sec) => fmtMoney(Math.abs(sec) / 3600 * settings.rate / nb) + ' €/course';
        const minCourse = (sec) => 'en moyenne <b>' + fmtDur(Math.abs(sec) / nb) + '</b> de plus par course';
        const perWord = modeOf() === 'livreur' ? 'cette semaine' : 'ce mois';
        const line = (z, soldeSec, isTime) => {
          const label = zoneMeta(z).label;
          if (zoneMois === z) {
            return '<p class="el on" style="border-left:3px solid ' + ZONE_COLORS[z] + '">' + zIcon(z, 1.1) +
              ' <b>Tu as été ' + label.toUpperCase() + ' sur ' + perWord + '</b></p>';
          }
          if (isTime) {
            return '<p class="el">' + zIcon(z) + (soldeSec >= 0
              ? ' Tu tombes dans la ' + label.toLowerCase() + ' si tu mets ' + minCourse(soldeSec)
              : ' Déjà sous le seuil ' + label.toLowerCase() + ' de <b>' + fmtDur(-soldeSec / nb) + '</b> par course en moyenne') + '</p>';
          }
          return '<p class="el">' + zIcon(z) + (soldeSec >= 0
            ? ' ' + label + ' atteinte — avance de <b>' + eurCourse(soldeSec) + '</b>'
            : ' Pour être ' + label.toLowerCase() + ' il manque <b>' + eurCourse(-soldeSec) + '</b>') + '</p>';
        };
        return line('double', soldeDouble, false) +
          line('etoile', soldeEtoile, false) +
          line('verte', solde, false) +
          line('rouge', solde, true) +
          line('noire', soldeRougeNoir, true);
      })() +
    '</div>';

  const sorted = sortList(list);
  ridesList.innerHTML = sorted.map((r) => {
    const garanti = r.actual / 3600 * settings.rate;
    const plat = PLATFORMS[r.platform] || PLATFORMS.uber;
    const title = 'encaissé ' + fmtMoney(r.price) + (r.bonus > 0 ? ' + bonus ' + fmtMoney(r.bonus) : '') + ' · garanti ' + fmtMoney(garanti) + ' · taux ' + fmtNum(r.taux) + ' €/h · ' +
      phasesOf(r).map((p) => (p.icon ? ico(p.icon, 0.9) : '') + ' ' + p.label + ' ' + fmtDur(p.sec)).join(' · ');
    return '<li class="ride" style="border-left-color:' + ZONE_COLORS[r.zone] + '" title="' + title + '">' +
      '<span class="rEmoji">' + zIcon(r.zone, 1.5) + '</span>' +
      '<div class="rMain"><div class="rTop"><span>' + fmtDate(r.date) + '</span><span class="rPrice">' + fmtMoney(r.price) + '</span></div>' +
      '<div class="rSub">' +
        phasesOf(r).map((p) => '<span>' + (p.icon ? ico(p.icon, 0.9) : '') + ' ' + fmtDur(p.sec) + '</span>').join('') +
        '<span>' + fmtNum(r.taux) + ' €/h</span>' +
        '<span class="rGaranti ' + (r.price >= garanti ? 'pos' : 'neg') + '">garanti ' + fmtMoney(garanti) + '</span>' +
        '<span class="rPlat">' + ico(plat.icon, 0.9) + plat.label + '</span>' +
        '<span class="rSrc" title="Source de la course">' + srcBadge(r) + '</span>' +
        (r.bonus > 0 ? '<span class="rBonus">bonus : ' + fmtMoney(r.bonus) + '</span>' : '') +
      '</div></div>' +
      '<button class="edit" data-id="' + r.id + '" title="Modifier"><svg class="ico"><use href="#i-edit"/></svg></button>' +
      '<button class="del" data-id="' + r.id + '" title="Supprimer"><svg class="ico"><use href="#i-x"/></svg></button>' +
    '</li>';
  }).join('');
  renderAnalyse();
}

/* ================= Analyse (4e onglet) =================
   Tout est calculé depuis l'historique (rides), filtré par période :
   KPIs, évolution du taux horaire par période (barres SVG colorées par zone,
   ligne GH en pointillés), répartition du temps par zone, par heure de la
   journée, par plateforme, et records de la période. */
let anaPeriod = 'all';
try { anaPeriod = localStorage.getItem('garantieHoraire.anaPeriod.v6.' + profile) || 'all'; } catch (e) { /* ignore */ }
function anaList() {
  if (anaPeriod === 'all') return rides.slice();
  if (anaPeriod.indexOf('Y:') === 0) { const y = Number(anaPeriod.slice(2)); return rides.filter((r) => yearOf(r.date) === y); }
  return rides.filter((r) => periodKey(r.date) === anaPeriod);
}
function shortPeriod(k) {
  if (modeOf() === 'livreur') return String(k).slice(8, 10) + '/' + String(k).slice(5, 7);
  const m = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
  const p = String(k).split('-');
  return (m[Number(p[1]) - 1] || p[1]) + ' ' + String(p[0]).slice(2);
}
function renderAnaPeriodSel() {
  const periods = Array.from(new Set(rides.map((r) => periodKey(r.date)))).sort().reverse();
  const years = Array.from(new Set(rides.map((r) => yearOf(r.date)))).sort().reverse();
  const keys = ['all'].concat(years.map((y) => 'Y:' + y)).concat(periods);
  if (keys.indexOf(anaPeriod) === -1) anaPeriod = 'all';
  anaPeriodSel.innerHTML = keys.map((k) =>
    '<option value="' + k + '"' + (k === anaPeriod ? ' selected' : '') + '>' +
    (k === 'all' ? '🗂️ Toutes les périodes' : k.indexOf('Y:') === 0 ? '🗓️ Année ' + k.slice(2) : '📅 ' + periodLabel(k)) + '</option>'
  ).join('');
}
const ANA_EMPTY = '<p class="anaEmpty">Aucune course sur cette période — importe un CSV ou lance un chrono.</p>';
/* Barres du taux horaire moyen par période, colorées par zone, avec la ligne GH */
function svgTaux(list) {
  const byP = new Map();
  for (const r of list) {
    const k = periodKey(r.date);
    const e = byP.get(k) || { p: 0, s: 0 };
    e.p += r.price; e.s += r.actual; byP.set(k, e);
  }
  const rows = Array.from(byP.entries()).map(([k, e]) => ({ k: k, taux: e.s ? e.p / (e.s / 3600) : 0 })).sort((a, b) => a.k.localeCompare(b.k));
  if (!rows.length) return ANA_EMPTY;
  const W = 340, H = 150, padL = 8, padB = 20, padT = 14;
  const maxV = Math.max(settings.seuilDouble, settings.rate * 1.2, ...rows.map((r) => r.taux)) * 1.12;
  const innerH = H - padT - padB;
  const ghY = padT + (1 - settings.rate / maxV) * innerH;
  const bw = (W - padL - 6) / rows.length;
  let bars = '';
  rows.forEach((r, i) => {
    const w = Math.max(6, bw * 0.62);
    const x = padL + i * bw + (bw - w) / 2;
    const h = Math.max(1.5, (r.taux / maxV) * innerH);
    const y = H - padB - h;
    const c = ZONE_COLORS[zoneDe(r.taux)];
    bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="' + c + '"/>' +
      '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 3.5).toFixed(1) + '" class="svgVal" text-anchor="middle">' + fmtNum(r.taux, 0) + '</text>' +
      '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 7) + '" class="svgLab" text-anchor="middle">' + shortPeriod(r.k) + '</text>';
  });
  const gh = '<line x1="' + padL + '" y1="' + ghY.toFixed(1) + '" x2="' + (W - 4) + '" y2="' + ghY.toFixed(1) + '" class="svgGhLine"/>' +
    '<text x="' + (W - 6) + '" y="' + (ghY - 4).toFixed(1) + '" class="svgGh" text-anchor="end">GH ' + fmtNum(settings.rate, 0) + ' €/h</text>';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="anaSvg" preserveAspectRatio="xMidYMid meet">' + gh + bars + '</svg>';
}
/* Répartition du temps par zone : barre empilée 100 % + légende */
function svgZones(list) {
  const order = ['double', 'etoile', 'verte', 'rouge', 'noire'];
  const bz = { double: 0, etoile: 0, verte: 0, rouge: 0, noire: 0 };
  for (const r of list) { if (bz[r.zone] !== undefined) bz[r.zone] += r.actual; }
  const total = order.reduce((s, z) => s + bz[z], 0);
  if (!total) return ANA_EMPTY;
  const W = 340, H = 26;
  let x = 0, rects = '';
  order.forEach((z) => {
    const w = (bz[z] / total) * W;
    if (w > 0.5) rects += '<rect x="' + x.toFixed(1) + '" y="2" width="' + w.toFixed(1) + '" height="' + (H - 4) + '" rx="3" fill="' + ZONE_COLORS[z] + '"/>';
    x += w;
  });
  const legend = order.map((z) =>
    '<span class="zb">' + zIcon(z, 1) + ' ' + zoneMeta(z).label + ' <b>' + fmtDur(bz[z]) + '</b> · ' + Math.round((bz[z] / total) * 100) + ' %</span>'
  ).join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="anaSvg anaBar100" preserveAspectRatio="none">' + rects + '</svg>' +
    '<div class="zoneBreakdown">' + legend + '</div>';
}
/* Nombre de courses par heure de la journée, couleur = zone du taux moyen de l'heure */
function svgHours(list) {
  const buckets = new Array(24).fill(null).map(() => ({ n: 0, p: 0, s: 0 }));
  for (const r of list) {
    const h = new Date(r.date).getHours();
    buckets[h].n++; buckets[h].p += r.price; buckets[h].s += r.actual;
  }
  if (!buckets.some((b) => b.n)) return ANA_EMPTY;
  const W = 340, H = 110, padB = 16, padT = 10;
  const innerH = H - padT - padB;
  const maxN = Math.max(...buckets.map((b) => b.n));
  const bw = W / 24;
  let bars = '';
  buckets.forEach((b, h) => {
    if (!b.n) return;
    const taux = b.s ? b.p / (b.s / 3600) : 0;
    const hgt = Math.max(2, (b.n / maxN) * innerH);
    const x = h * bw + 1.5, w = bw - 3, y = H - padB - hgt;
    bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hgt.toFixed(1) + '" rx="2" fill="' + ZONE_COLORS[zoneDe(taux)] + '">' +
      '<title>' + h + 'h — ' + b.n + ' course(s), ' + fmtNum(taux) + ' €/h</title></rect>' +
      (h % 3 === 0 ? '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 4) + '" class="svgLab" text-anchor="middle">' + h + 'h</text>' : '');
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="anaSvg" preserveAspectRatio="xMidYMid meet">' + bars + '</svg>' +
    '<p class="anaHint">Hauteur = nombre de courses · couleur = zone du taux moyen de l’heure</p>';
}
function htmlPlats(list) {
  const by = new Map();
  for (const r of list) {
    const k = r.platform || 'uber';
    const e = by.get(k) || { n: 0, p: 0, s: 0 };
    e.n++; e.p += r.price; e.s += r.actual; by.set(k, e);
  }
  const rows = Array.from(by.entries()).map(([k, e]) => ({ k: k, n: e.n, p: e.p, s: e.s, taux: e.s ? e.p / (e.s / 3600) : 0 }))
    .sort((a, b) => b.p - a.p);
  if (!rows.length) return ANA_EMPTY;
  return rows.map((e) => {
    const plat = PLATFORMS[e.k] || PLATFORMS.uber;
    const z = zoneDe(e.taux);
    const sub = list.filter((r) => (r.platform || 'uber') === e.k && r.meta && (r.meta.commission > 0 || r.meta.original > 0));
    const commTxt = sub.length
      ? ' · commission ' + fmtMoney(sub.reduce((s, r) => s + (r.meta.commission || 0), 0)) + ' €'
      : '';
    return '<div class="anaRow">' +
      '<span class="anaIco" style="color:' + ZONE_COLORS[z] + '">' + ico(plat.icon, 1.1) + '</span>' +
      '<div class="anaMain"><b>' + plat.label + '</b><span>' + e.n + ' course(s) · ' + fmtMoney(e.p) + ' encaissé' + commTxt + '</span></div>' +
      '<span class="anaVal" style="color:' + ZONE_COLORS[z] + '">' + fmtNum(e.taux) + ' €/h ' + zIcon(z, 0.9) + '</span>' +
    '</div>';
  }).join('');
}
/* Commission plateforme sur la période : somme € et % du prix payé par le client.
   Donnée dispo uniquement sur les courses importées CSV (meta.original / meta.commission). */
function htmlCommission(list, baseOverride) {
  const withC = list.filter((r) => r.meta && (r.meta.commission > 0 || r.meta.original > 0));
  if (!withC.length) return '<p class="anaEmpty">Commission connue uniquement sur les courses importées (CSV Uber) : <code>service_fee_local</code>. Réimporte le CSV pour la remplir.</p>';
  const comm = withC.reduce((s, r) => s + (r.meta.commission || 0), 0);
  // Base du % : brut TTC réellement facturé (factures driver-to-rider) si importé, sinon original_fare
  const orig = (baseOverride > 0) ? baseOverride : withC.reduce((s, r) => s + (r.meta.original || (r.price + (r.meta.commission || 0))), 0);
  const pct = orig > 0 ? (comm / orig) * 100 : 0;
  const byPlat = new Map();
  for (const r of withC) {
    const k = r.platform || 'uber';
    const e = byPlat.get(k) || { comm: 0, orig: 0 };
    e.comm += r.meta.commission || 0;
    e.orig += r.meta.original || (r.price + (r.meta.commission || 0));
    byPlat.set(k, e);
  }
  const rows = Array.from(byPlat.entries()).map(([k, e]) => {
    const plat = PLATFORMS[k] || PLATFORMS.uber;
    const p = e.orig > 0 ? (e.comm / e.orig) * 100 : 0;
    return '<div class="anaRow"><span class="anaIco">' + ico(plat.icon, 1.1) + '</span>' +
      '<div class="anaMain"><b>' + plat.label + '</b><span>prix client total ' + fmtMoney(e.orig) + '</span></div>' +
      '<span class="anaVal">' + fmtMoney(e.comm) + ' · ' + fmtNum(p) + ' %</span></div>';
  }).join('');
  return '<div class="anaBig"><strong>' + fmtMoney(comm) + '</strong><span>soit ' + fmtNum(pct) + ' % du prix client (' + fmtMoney(orig) + ')</span></div>' + rows;
}
function htmlRecords(list) {
  if (!list.length) return ANA_EMPTY;
  const best = list.slice().sort((a, b) => b.taux - a.taux)[0];
  const worst = list.slice().sort((a, b) => a.taux - b.taux)[0];
  const longest = list.slice().sort((a, b) => b.actual - a.actual)[0];
  const bestPrice = list.slice().sort((a, b) => b.price - a.price)[0];
  const longestApp = list.slice().sort((a, b) => (phasesOf(b)[0].sec) - (phasesOf(a)[0].sec))[0];
  const row = (icon, label, r, val) =>
    '<div class="anaRow"><span class="anaIco">' + ico(icon, 1.1) + '</span>' +
    '<div class="anaMain"><b>' + label + '</b><span>' + fmtDate(r.date) + ' · ' + fmtMoney(r.price) + '</span></div>' +
    '<span class="anaVal" style="color:' + ZONE_COLORS[r.zone] + '">' + val + ' ' + zIcon(r.zone, 0.9) + '</span></div>';
  return row('up', 'Meilleur taux', best, fmtNum(best.taux) + ' €/h') +
    row('down', 'Taux le plus bas', worst, fmtNum(worst.taux) + ' €/h') +
    row('clock', 'Course la plus longue', longest, fmtDur(longest.actual)) +
    row('pin', 'Approche la plus longue', longestApp, fmtDur(phasesOf(longestApp)[0].sec)) +
    row('euro', 'Plus gros encaissement', bestPrice, fmtMoney(bestPrice.price));
}
function renderAnalyse() {
  if (!anaPeriodSel) return;
  renderAnaPeriodSel();
  const list = anaList();
  const nb = list.length;
  const totalPrix = list.reduce((s, r) => s + r.price, 0);
  const totalSec = list.reduce((s, r) => s + r.actual, 0);
  const tauxMoyen = nb && totalSec ? totalPrix / (totalSec / 3600) : 0;
  const zoneP = zoneDe(tauxMoyen);
  const montantGaranti = totalSec / 3600 * settings.rate;
  const estimGH = Math.max(0, montantGaranti - totalPrix);
  const bonus = bonusFor(anaPeriod);
  // Exploitation du bonus : taux horaire réel une fois le bonus ajouté à l'encaissé
  const tauxBonus = nb && totalSec ? (totalPrix + bonus) / (totalSec / 3600) : 0;
  const zoneB = zoneDe(tauxBonus);
  const totBonus = list.reduce((s, r) => s + (r.bonus || 0), 0);
  anaKpis.innerHTML = nb ? (
    '<div class="stat"><span>Courses</span><strong>' + nb + '</strong></div>' +
    '<div class="stat"><span>Encaissé</span><strong>' + fmtMoney(totalPrix) + '</strong>' + (totBonus > 0 ? '<em>dont bonus courses : ' + fmtMoney(totBonus) + '</em>' : '') + '</div>' +
    '<div class="stat"><span>Temps total</span><strong>' + fmtDur(totalSec) + '</strong></div>' +
    '<div class="stat highlight" style="border-color:' + ZONE_COLORS[zoneP] + ';box-shadow:0 0 24px ' + ZONE_COLORS[zoneP] + '44"><span>Taux horaire moyen</span><strong>' + fmtNum(tauxMoyen) + ' €/h</strong></div>' +
    (bonus > 0
      ? '<div class="stat" style="border-color:' + ZONE_COLORS[zoneB] + ';box-shadow:0 0 24px ' + ZONE_COLORS[zoneB] + '44"><span>Taux avec bonus réel (+ ' + fmtMoney(bonus) + ')</span><strong>' + fmtNum(tauxBonus) + ' €/h</strong></div>'
      : '') +
    '<div class="stat"><span>Garanti (temps × GH ' + fmtNum(settings.rate, 0) + ' €)</span><strong>' + fmtMoney(montantGaranti) + '</strong></div>' +
    '<div class="stat ' + (estimGH > 0 ? 'pos' : '') + '"><span>Estimation GH</span><strong>' + fmtMoney(estimGH) + '</strong></div>' +
    '<button type="button" class="stat bonusStat" title="Saisir le bonus réel de la période"><span>GH réelle + Bonus — saisir</span><strong>' + (bonus > 0 ? fmtMoney(bonus) : '- €') + '</strong></button>' +
    objStatHtml(totalSec, nb)
  ) : '<p style="color:var(--muted)">' + ANA_EMPTY + '</p>';
  anaChartTaux.innerHTML = svgTaux(list);
  anaZonesEl.innerHTML = svgZones(list);
  anaHoursEl.innerHTML = svgHours(list);
  anaPlatsEl.innerHTML = htmlPlats(list);
  const invAna = facturedTTC(anaPeriod);
  anaCommissionEl.innerHTML = htmlCommission(list, invAna.n > 0 ? invAna.total : 0);
  anaRecordsEl.innerHTML = htmlRecords(list);
}

/* ================= Édition / ajout manuel ================= */
let editingId = null;
function buildManualForm() {
  const defs = MODES[modeOf()].phases;
  phaseFields.innerHTML = defs.map((d, i) =>
    '<label class="fld"><span>' + ico(d.icon, 0.9) + ' ' + d.label + ' — min</span>' +
      '<input id="manPh' + i + 'Min" class="inpGlass" type="number" inputmode="numeric" min="0" step="1" /></label>' +
    '<label class="fld"><span>— sec</span>' +
      '<input id="manPh' + i + 'Sec" class="inpGlass" type="number" inputmode="numeric" min="0" max="59" step="1" /></label>'
  ).join('');
  manPhaseEls = defs.map((d, i) => ({ min: $('manPh' + i + 'Min'), sec: $('manPh' + i + 'Sec') }));
}
function parseMinSec(mi, se) {
  const m = Number.isFinite(mi) ? Math.max(0, Math.floor(mi)) : 0;
  const s = Number.isFinite(se) ? Math.max(0, Math.min(59, Math.round(se))) : 0;
  return m * 60 + s;
}
function readPhaseSecs() {
  const defs = MODES[modeOf()].phases;
  return manPhaseEls.map((els, i) => ({
    label: defs[i].label,
    icon: defs[i].icon,
    sec: parseMinSec(
      parseFloat(String(els.min.value).replace(',', '.')),
      parseFloat(String(els.sec.value).replace(',', '.'))
    ),
  }));
}
function startEdit(id) {
  const r = rides.find((x) => x.id === id);
  if (!r) return;
  editingId = id;
  const ph = phasesOf(r);
  manPrice.value = String(r.price).replace('.', ',');
  manBonus.value = r.bonus > 0 ? String(r.bonus).replace('.', ',') : '';
  manDate.value = toLocalInputValue(new Date(r.date));
  manPhaseEls.forEach((els, i) => {
    const p = ph[i] || { sec: 0 };
    els.min.value = Math.floor(p.sec / 60);
    els.sec.value = p.sec % 60;
  });
  manAdd.textContent = 'Enregistrer la modification';
  manCancelEdit.classList.remove('hidden');
  manSummary.textContent = 'Modifier la course sélectionnée';
  manDetails.open = true;
  showView('history');
  manPrice.focus();
}
function cancelEdit() {
  editingId = null;
  manPrice.value = '';
  manBonus.value = '';
  manDate.value = toLocalInputValue(new Date());
  manPhaseEls.forEach((els) => { els.min.value = ''; els.sec.value = ''; });
  manAdd.textContent = 'Ajouter à l\'historique';
  manCancelEdit.classList.add('hidden');
  manSummary.textContent = 'Ajouter une course manuellement';
}
function submitManual() {
  const p = parseFloat(String(manPrice.value).replace(',', '.'));
  const bonus = Math.round(Math.max(0, parseFloat(String(manBonus.value).replace(',', '.')) || 0) * 100) / 100;
  const phases = readPhaseSecs();
  const sec = phases.reduce((a, x) => a + x.sec, 0);
  const dv = manDate.value ? new Date(manDate.value) : new Date();
  const dateIso = isNaN(dv.getTime()) ? new Date().toISOString() : dv.toISOString();
  if (!Number.isFinite(p) || p <= 0 || sec <= 0) {
    showToast('Remplis le prix et les durées de chaque phase (min + sec).');
    return;
  }
  if (editingId) {
    const r = rides.find((x) => x.id === editingId);
    if (r) {
      r.price = p;
      r.bonus = bonus;
      r.date = dateIso;
      r.actual = sec;
      r.phases = phases;
      r.src = 'manuel'; // une correction manuelle devient la source de référence
      r.taux = tauxEffectif(p, sec);
      r.zone = zoneDe(r.taux);
      const s = seuilsTemps(p);
      r.tDouble = Math.round(s.double);
      r.tEtoile = Math.round(s.etoile);
      r.tVerte = Math.round(s.verte);
      r.tRouge = Math.round(s.rouge);
      saveRides();
      renderHistory();
      showToast(ico('edit', 1) + ' Modifiée : ' + phases.map((x) => ico(x.icon, 0.9) + ' ' + fmtDur(x.sec)).join(' · ') + ' → ' + fmtNum(r.taux) + ' €/h ' + zIcon(r.zone, 1));
    }
    cancelEdit();
  } else {
    // Détection de doublon avec une course chronométrée ou importée
    const dup = findDup({ date: dateIso, price: p });
    if (dup && window.confirm(
      'Une course très similaire existe déjà dans l’historique :\n' +
      fmtDate(dup.date) + ' · ' + fmtMoney(dup.price) + ' · source ' + (SRC_META[srcOf(dup)] || SRC_META.manuel).label + '\n\n' +
      'Fusionner les deux courses ?\n' +
      '→ si la course existante est chronométrée, son approche (la plus fiable) est conservée\n' +
      '→ le temps de course / prix saisi manuellement sera appliqué si plus fiable'
    )) {
      const kept = mergeRide(dup, { date: dateIso, price: p, phases: phases, src: 'manuel', bonus: bonus });
      saveRides();
      monthSel = periodKey(dup.date);
      renderHistory();
      showToast(ico('up', 1) + ' Doublon détecté : course fusionnée (' + (kept.length ? kept.join(', ') + ' pris sur la saisie manuelle' : 'aucun champ') + ') → ' + fmtNum(dup.taux) + ' €/h ' + zIcon(dup.zone, 1));
    } else {
      saveRide({ price: p, actual: sec, phases: phases, date: dateIso, bonus: bonus }, { src: 'manuel' });
    }
    cancelEdit();
  }
  updateCourse();
}

/* ================= Import (1 bouton, aucun export) =================
   CSV « lifetime trips » Uber (driver_lifetime_trips-0.csv) → courses.
   L'approche de chaque course se règle dans les réglages (eta / request / moyenne). */

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
function num(v) { const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function parseTs(v) { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
/* Mode d'approche (réglages) — tout se calcule depuis le CSV lifetime :
   - 'request'  : begintrip − request (borne haute, inclut le délai demande→acceptation)
   - 'eta'      : min(begintrip − request, eta) (approche estimée)
   - 'moyenne'  : moyenne des deux (recommandé) */
function approchePour(requestT, beginT, eta) {
  const brut = Math.max(0, Math.round((beginT - requestT) / 1000));
  const etaC = (eta > 0 ? Math.min(brut, Math.round(eta)) : brut);
  const mode = settings.approcheMode || 'moyenne';
  if (mode === 'request') return brut;
  if (mode === 'eta') return etaC;
  return Math.round((etaC + brut) / 2); // moyenne
}
// Recalcule l'approche de toutes les courses importées (qui ont meta.begin) selon le mode courant
function recomputeApproches() {
  let n = 0;
  for (const r of rides) {
    if (!r.meta || !r.meta.begin) continue;
    const reqT = new Date(r.date).getTime();
    const beginT = new Date(r.meta.begin).getTime();
    const app = approchePour(reqT, beginT, r.meta.eta || 0);
    if (r.phases && r.phases[0]) r.phases[0].sec = app;
    const course = r.phases && r.phases[1] ? r.phases[1].sec : Math.max(0, r.actual - app);
    r.actual = app + course;
    const s = seuilsTemps(r.price);
    r.taux = tauxEffectif(r.price, r.actual);
    r.zone = zoneDe(r.taux);
    r.tDouble = Math.round(s.double); r.tEtoile = Math.round(s.etoile); r.tVerte = Math.round(s.verte); r.tRouge = Math.round(s.rouge);
    n++;
  }
  if (n) { saveRides(); renderHistory(); updateCourse(); }
  return n;
}
// Timestamp « local » Uber : on ignore le fuseau collé (Z / +02:00) et on lit l'heure locale telle quelle
function parseTsLocal(v) {
  if (!v) return null;
  const clean = String(v).replace(/Z$/i, '').replace(/[+-]\d{2}:?\d{2}$/, '');
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}
function mapUberRow(c) {
  // Cohérence PAR LIGNE : si les 3 timestamps _local existent, on les lit tous en heure locale
  // (le Z collé est ignoré) ; sinon on prend les 3 en _utc. Jamais de mélange local/utc sur une
  // même course, sinon chaque course mixte ajoute le décalage horaire (1 h en CET) aux durées.
  const rqL = parseTsLocal(c['request_timestamp_local']), rqU = parseTs(c['request_timestamp_utc']);
  const btL = parseTsLocal(c['begintrip_timestamp_local']), btU = parseTs(c['begintrip_timestamp_utc']);
  const drL = parseTsLocal(c['dropoff_timestamp_local']), drU = parseTs(c['dropoff_timestamp_utc']);
  let request, begin, drop;
  if (rqL && btL && drL) { request = rqL; begin = btL; drop = drL; }
  else { request = rqU || rqL; begin = btU || btL; drop = drU || drL; }
  if (!request || !begin || !drop) return null;
  const completed = String(c['status'] || '').toLowerCase() === 'completed' || String(c['is_completed']) === 'true';
  // Encaissé = tarif upfront (driver_upfront_fare_local) : c'est ce que le chauffeur touche vraiment.
  // Prix brut client = original_fare_local (paiement client, commission incluse).
  // Commission Uber = |service_fee_local| — c'est le « service fee » facturé, stable à ~25 % du prix
  // client tous les mois (vérifié sur les données : 24,3–26,4 %). original−upfront ne marche PAS
  // (varie de 1 % à 28 % à cause des surges/promos découplées du tarif upfront).
  // Fallbacks : si service_fee absent → écart original−upfront ; si upfront absent → prix = original − commission.
  const orig = num(c['original_fare_local']);
  const sfAbs = Math.abs(num(c['service_fee_local']));
  let price = num(c['driver_upfront_fare_local']);
  let commission = 0;
  if (sfAbs > 0) commission = sfAbs;
  else if (price > 0) commission = Math.max(0, orig - price);
  if (!(price > 0)) price = Math.max(0, orig - commission);
  const scheduled = String(c['is_scheduled_trip']) === 'true';
  const eta = num(c['eta']);
  // Approche selon le mode choisi dans les réglages (CSV lifetime uniquement) :
  const approche = approchePour(request.getTime(), begin.getTime(), eta);
  const course = Math.max(0, Math.round((drop - begin) / 1000));
  const actual = approche + course;
  if (!(price > 0) || actual <= 0) return null;
  return {
    date: request.toISOString(),
    price: price,
    actual: actual,
    phases: [
      { label: 'Approche', icon: 'pin', sec: approche },
      { label: 'Course', icon: 'car', sec: course },
    ],
    completed: completed,
    extId: String(c['driver_trip_number'] || request.toISOString()),
    meta: { city: c['city_name'] || '', product: c['product_type_name'] || '', distance_miles: num(c['trip_distance_miles']), surge: num(c['surge_multiplier']), status: c['status'] || '', is_scheduled: scheduled, eta: eta, begin: begin.toISOString(), drop: drop.toISOString(), original: orig, commission: commission, upfront: price, reqKey: incentiveKey(c['request_timestamp_local']) },
  };
}
function applyImportedCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) { showToast('CSV vide.'); return; }
  const header = rows[0].map((h) => String(h).trim());
  let imported = 0, maj = 0, fusion = 0, ignorees = 0, horsFenetre = 0, planifiees = 0;
  const minDate = importMinDate();
  const byExt = new Map(rides.filter((r) => r.extId).map((r) => [r.extId, r]));
  for (const r of rows.slice(1)) {
    const cols = {};
    header.forEach((h, i) => { cols[h] = (r[i] || '').trim(); });
    const m = mapUberRow(cols);
    if (!m) { ignorees++; continue; }
    if (new Date(m.date) < minDate) { horsFenetre++; continue; } // 24 derniers mois complets uniquement
    if (!m.completed) { ignorees++; continue; }
    // Bonus auto (CSV payments importé) : prix net = upfront − bonus, affiché à part
    const inc = loadIncentives()[incentiveKey(cols['request_timestamp_local'])] || 0;
    if (inc > 0 && m.price > inc) { m.bonus = inc; m.price = Math.round((m.price - inc) * 100) / 100; }
    else if (inc > 0) { m.bonus = inc; }
    if (m.meta && m.meta.is_scheduled) planifiees++;
    const old = byExt.get(m.extId);
    if (old) {
      // réimport = mise à jour, mais en conservant les champs plus fiables (ex: approche chronométrée)
      mergeRide(old, { date: m.date, price: m.price, phases: m.phases, src: 'csv', extId: m.extId, meta: m.meta, platform: 'uber', bonus: m.bonus || 0 });
      maj++;
      continue;
    }
    // doublon avec une course chrono / manuelle (même prix, horaires proches) → fusion
    const dup = findDup({ date: m.date, price: m.price, extId: m.extId });
    if (dup) {
      mergeRide(dup, { date: m.date, price: m.price, phases: m.phases, src: 'csv', extId: m.extId, meta: m.meta, platform: 'uber', bonus: m.bonus || 0 });
      byExt.set(m.extId, dup);
      fusion++;
      continue;
    }
    const s = seuilsTemps(m.price);
    const taux = tauxEffectif(m.price, m.actual);
    const ride = {
      id: 'imp_' + m.extId,
      date: m.date,
      price: m.price,
      actual: m.actual,
      phases: m.phases,
      taux: taux,
      zone: zoneDe(taux),
      platform: 'uber',
      src: 'csv',
      bonus: m.bonus || 0,
      tDouble: Math.round(s.double),
      tEtoile: Math.round(s.etoile),
      tVerte: Math.round(s.verte),
      tRouge: Math.round(s.rouge),
      extId: m.extId,
      meta: m.meta,
      imported: true,
    };
    rides.push(ride);
    byExt.set(m.extId, ride);
    imported++;
  }
  saveRides();
  monthSel = null;
  renderHistory();
  updateCourse();
  showToast(ico('up', 1) + ' Import CSV : ' + imported + ' importée(s) · ' + maj + ' mise(s) à jour · ' + fusion + ' fusionnée(s) avec une course existante (doublon) · ' + ignorees + ' non terminée(s) · ' + horsFenetre + ' hors fenêtre (avant le ' + fmtDate(minDate.toISOString()) + ' — 24 derniers mois complets)' + (planifiees ? ' · ' + planifiees + ' planifiée(s) (approche plafonnée à l’ETA)' : '') + '.');
}
function importCSVFile(file) {
  const reader = new FileReader();
  reader.onload = () => { try { applyImportedCSV(String(reader.result)); } catch (e) { showToast('Erreur de lecture CSV : ' + e.message); } };
  reader.readAsText(file);
}

/* ================= Réglages & profils ================= */
function renderProfiles() {
  const profs = listProfiles();
  profileSelHeader.innerHTML = profs.map((p) =>
    '<option value="' + p + '"' + (p === profile ? ' selected' : '') + '>' + p + '</option>'
  ).join('');
  profileName.textContent = profile;
}
function renderSettings() {
  const m = modeOf();
  document.querySelectorAll('#modeSeg .segBtn').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  document.querySelectorAll('#sonsSeg .segBtn').forEach((b) => b.classList.toggle('on', (b.dataset.sons === 'on') === (settings.sons !== false)));
  document.querySelectorAll('#demoSeg .segBtn').forEach((b) => b.classList.toggle('on', (b.dataset.demo === 'on') === !!settings.demoOn));
  setDemoMul.value = settings.demoMul || 10;
  setObjTemps.value = settings.objTemps || 0;
  setGmapsKey.value = settings.gmapsKey || '';
  updateDemoBadges();
  document.querySelectorAll('#approcheSeg .segBtn').forEach((b) => b.classList.toggle('on', b.dataset.app === (settings.approcheMode || 'moyenne')));
  const actPlats = activePlatforms();
  platformToggles.innerHTML = MODES[m].platforms.map((pl) =>
    '<button type="button" class="segBtn' + (actPlats.indexOf(pl) !== -1 ? ' on' : '') + '" data-plat="' + pl + '" title="Afficher/masquer le bouton Chrono ' + PLATFORMS[pl].label + '">' +
    ico(PLATFORMS[pl].icon, 1) + ' ' + PLATFORMS[pl].label + '</button>'
  ).join('');
  setRate.value = settings.rate;
  setSeuilNoir.value = settings.seuilNoir;
  setSeuilEtoile.value = settings.seuilEtoile;
  setSeuilDouble.value = settings.seuilDouble;
  renderProfiles();
  applyTheme();
  headerSub.innerHTML =
    MODES[m].label + ' · ' + (PLATFORMS[settings.platform] || {}).label +
    ' · GH ' + fmtNum(settings.rate, 0) + ' €/h · ' + zIcon('noire', 0.95) + ' ' + fmtNum(seuilNoir(), 2) + ' € · ' + zIcon('etoile', 0.95) + ' ' + fmtNum(seuilEtoile(), 2) + ' € · ' + zIcon('double', 0.95) + ' ' + fmtNum(seuilDouble(), 2) + ' € · suivi par ' + periodWord();
  document.title = 'GH · ' + fmtNum(settings.rate, 0) + ' €/h';
}
function resetSettings() {
  const m = modeOf();
  settings = Object.assign({}, DEFAULT_SETTINGS, { mode: m, theme: settings.theme || 'auto', platformsOn: JSON.parse(JSON.stringify(DEFAULT_PLATFORMS_ON)) }, MODES[m]);
  saveSettings();
  renderSettings();
  buildManualForm();
  renderStartButtons();
  updateCourse();
  renderHistory();
  showToast('Réinitialisé (' + MODES[m].label + ') : GH ' + fmtNum(settings.rate, 0) + ' €/h · ' + zIcon('noire', 1) + ' ' + fmtNum(seuilNoir(), 2) + ' € · ' + zIcon('etoile', 1) + ' ' + fmtNum(seuilEtoile(), 2) + ' € · ' + zIcon('double', 1) + ' ' + fmtNum(seuilDouble(), 2) + ' €');
}
function onModeChange(m) {
  settings.mode = m;
  Object.assign(settings, MODES[m]);
  saveSettings();
  renderSettings();
  buildManualForm();
  renderStartButtons();
  updateCourse();
  renderHistory();
  showToast('Mode ' + MODES[m].label + ' — ' + (PLATFORMS[settings.platform] || {}).label + ' · GH ' + fmtNum(settings.rate, 0) + ' €/h · suivi par ' + periodWord() + '.');
}
function onSettingsChange() {
  const d = MODES[modeOf()];
  const r = parseFloat(String(setRate.value).replace(',', '.'));
  const sn = parseFloat(String(setSeuilNoir.value).replace(',', '.'));
  const se = parseFloat(String(setSeuilEtoile.value).replace(',', '.'));
  const sd = parseFloat(String(setSeuilDouble.value).replace(',', '.'));
  settings.rate = Number.isFinite(r) && r > 0 ? r : d.rate;
  settings.seuilNoir = Number.isFinite(sn) && sn >= 0 ? sn : d.seuilNoir;
  settings.seuilEtoile = Number.isFinite(se) && se >= 0 ? se : d.seuilEtoile;
  settings.seuilDouble = Number.isFinite(sd) && sd >= 0 ? sd : d.seuilDouble;
  const dm = parseFloat(String(setDemoMul.value).replace(',', '.'));
  settings.demoMul = Number.isFinite(dm) && dm >= 1 ? Math.min(dm, 1000) : 10;
  const ot = parseFloat(String(setObjTemps.value).replace(',', '.'));
  settings.objTemps = Number.isFinite(ot) && ot >= 0 ? ot : 0;
  settings.gmapsKey = String(setGmapsKey.value || '').trim();
  saveSettings();
  renderSettings();
  updateCourse();
  renderHistory();
  if (timer.running) tick();
}
function switchProfile(name) {
  if (!name) return;
  const s = loadSession();
  if (s && s.accountId) { try { localStorage.setItem(LS_SESSION, JSON.stringify({ local: true })); } catch (e) { /* ignore */ } }
  saveProfile(name);
  location.reload();
}

/* ================= Événements ================= */
priceInput.addEventListener('input', updateCourse);
offerBtn.addEventListener('click', () => offerFile.click());
offerFile.addEventListener('change', () => {
  if (offerFile.files && offerFile.files[0]) handleOfferFile(offerFile.files[0]);
  offerFile.value = '';
});
offerCloseBtn.addEventListener('click', closeOfferModal);
offerModal.addEventListener('click', (e) => { if (e.target === offerModal) closeOfferModal(); });
[offerPrix, offerEta, offerDist, offerTrajet, offerCoutKm].forEach((el) => el.addEventListener('input', renderOfferVerdict));
// Verdict → lancer le chrono avec le prix de l'offre et la plateforme détectée
offerStartBtn.addEventListener('click', () => {
  const v = offerVerdictCalc();
  if (!v) return;
  const plat = offerPlat.dataset.plat || settings.platform;
  closeOfferModal();
  priceInput.value = String(v.prix).replace('.', ',');
  updateCourse();
  if (timer.running) { showToast('Un chrono est déjà en cours — prix de l’offre : ' + fmtMoney(v.prix) + '.'); showView('chrono'); return; }
  startTimer(v.prix, plat);
  showToast('▶ Chrono lancé avec ' + fmtMoney(v.prix) + ' (' + ((PLATFORMS[plat] || {}).label || plat) + ') — offre ' + zoneMeta(v.zone).label + '.');
});
// Android : « Partager → GH » (share_target du manifest) envoie la capture au service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'share-image' && e.data.file) handleOfferFile(e.data.file);
  });
}
startBtns.addEventListener('click', (e) => {
  const b = e.target.closest('.cta');
  if (!b || b.disabled) return;
  if (timer.running) { showToast('Un chrono est déjà en cours.'); showView('chrono'); return; }
  const p = currentPrice();
  if (p !== null) startTimer(p, b.dataset.plat);
});
segTime.addEventListener('click', () => setDisplay('time'));
segEuro.addEventListener('click', () => setDisplay('euro'));
phaseBtns.addEventListener('click', (e) => {
  const b = e.target.closest('.phaseBtn');
  if (b) nextPhase(Number(b.dataset.next));
});
stopBtn.addEventListener('click', stopAndSave);
cancelBtn.addEventListener('click', cancelTimer);
monthFilter.addEventListener('change', () => { monthSel = monthFilter.value; renderHistory(); });
anaPeriodSel.addEventListener('change', () => {
  anaPeriod = anaPeriodSel.value;
  try { localStorage.setItem('garantieHoraire.anaPeriod.v6.' + profile, anaPeriod); } catch (e) { /* ignore */ }
  renderAnalyse();
});
sortSel.addEventListener('change', () => {
  sortKey = sortSel.value;
  try { localStorage.setItem('garantieHoraire.sort.v6.' + profile, sortKey); } catch (e) { /* ignore */ }
  renderHistory();
});
zoneToggles.addEventListener('click', (e) => {
  const b = e.target.closest('.zt');
  if (!b) return;
  const z = b.dataset.zone;
  zoneVisible[z] = !zoneVisible[z];
  b.classList.toggle('on', zoneVisible[z]);
  renderHistory();
});
ridesList.addEventListener('click', (e) => {
  const del = e.target.closest('.del');
  const edit = e.target.closest('.edit');
  if (del) {
    rides = rides.filter((r) => r.id !== del.dataset.id);
    saveRides();
    renderHistory();
    updateCourse();
    return;
  }
  if (edit) startEdit(edit.dataset.id);
});
manAdd.addEventListener('click', submitManual);
manCancelEdit.addEventListener('click', cancelEdit);
clearBtn.addEventListener('click', () => {
  if (rides.length === 0) return;
  if (confirm('Supprimer tout l\'historique du compte « ' + profile + ' » ?')) {
    rides = [];
    saveRides();
    renderHistory();
    updateCourse();
    showToast('Historique vidé.');
  }
});
importTripsBtn.addEventListener('click', () => importTripsFile.click());
importTripsFile.addEventListener('change', () => {
  if (importTripsFile.files && importTripsFile.files[0]) importCSVFile(importTripsFile.files[0]);
  importTripsFile.value = '';
});
importInvoicesBtn.addEventListener('click', () => importInvoicesFile.click());
importInvoicesFile.addEventListener('change', () => {
  if (importInvoicesFile.files && importInvoicesFile.files[0]) importInvoicesFileFn(importInvoicesFile.files[0]);
  importInvoicesFile.value = '';
});
importPaymentsBtn.addEventListener('click', () => importPaymentsFile.click());
importPaymentsFile.addEventListener('change', () => {
  if (importPaymentsFile.files && importPaymentsFile.files[0]) importPaymentsFileFn(importPaymentsFile.files[0]);
  importPaymentsFile.value = '';
});
themeSeg.addEventListener('click', (e) => {
  const b = e.target.closest('.segBtn');
  if (!b) return;
  settings.theme = b.dataset.themeOpt;
  saveSettings();
  applyTheme();
});
sonsSeg.addEventListener('click', (e) => {
  const b = e.target.closest('.segBtn');
  if (!b) return;
  settings.sons = b.dataset.sons === 'on';
  saveSettings();
  renderSettings();
  showToast(settings.sons ? ico('cloche', 1) + ' Sons activés.' : 'Sons coupés.');
});
approcheSeg.addEventListener('click', (e) => {
  const b = e.target.closest('.segBtn');
  if (!b) return;
  settings.approcheMode = b.dataset.app;
  saveSettings();
  const n = recomputeApproches();
  renderSettings();
  showToast('Approche importée : <b>' + b.textContent.trim() + '</b>' + (n ? ' — ' + n + ' course(s) recalculée(s).' : '.'));
});
// Case « GH + Bonus réel » (historique #stats ET analyse #anaKpis) : clic → la case devient
// un champ de saisie inline (clavier NUMÉRIQUE via inputmode="decimal" sur iPhone).
// La valeur saisie REMPLACE le bonus existant (pas d'addition). OK/Entrée = valide, ✕/Échap = annule.
// Si la sélection est « toutes périodes » / une année, on ramène d'abord sur la période
// la plus récente ayant des courses.
document.addEventListener('click', (e) => {
  if (e.target.closest('.bonusInput, .bonusOk, .bonusCancel')) return; // clics dans le champ/boutons d'édition
  const el = e.target.closest('.bonusStat');
  if (!el || el.dataset.editing) return;
  const isAna = !!el.closest('#anaKpis');
  let k = isAna ? anaPeriod : monthSel;
  if (!k || k === 'all' || k.indexOf('Y:') === 0) {
    const periods = Array.from(new Set(rides.map((r) => periodKey(r.date)))).sort().reverse();
    if (!periods.length) { showToast('Aucune course : importe un CSV ou lance un chrono.'); return; }
    k = periods[0];
    if (isAna) {
      anaPeriod = k;
      try { localStorage.setItem('garantieHoraire.anaPeriod.v6.' + profile, anaPeriod); } catch (err) { /* ignore */ }
    } else {
      monthSel = k;
    }
    renderHistory();
    renderAnalyse();
    showToast('Période ramenée à ' + periodLabel(k) + ' — saisis le bonus réel.');
  }
  const btn = document.querySelector((isAna ? '#anaKpis' : '#stats') + ' .bonusStat');
  if (!btn) return;
  const b0 = loadBonus();
  const cur = Number(b0[k]) || 0;
  btn.dataset.editing = '1';
  btn.innerHTML =
    '<span>GH réelle + bonus — ' + periodLabel(k) + ' (remplace)</span>' +
    '<span class="bonusEditRow">' +
      '<input class="bonusInput inpGlass" inputmode="decimal" type="text" placeholder="0,00" value="' + (cur ? String(cur).replace('.', ',') : '') + '" />' +
      '<button type="button" class="miniBtn glassBtn bonusOk">OK</button>' +
      '<button type="button" class="miniBtn glassBtn bonusCancel" title="Annuler">✕</button>' +
    '</span>';
  const inp = btn.querySelector('.bonusInput');
  inp.focus();
  try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (err) { /* ignore */ }
  const closeEdit = () => { delete btn.dataset.editing; renderHistory(); renderAnalyse(); };
  const commit = () => {
    const n = parseFloat(String(inp.value).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) { showToast('Montant invalide.'); inp.focus(); return; }
    const b = loadBonus();
    const r2 = Math.round(n * 100) / 100;
    if (r2 > 0) b[k] = r2; else delete b[k]; // REMPLACE (ou efface si 0)
    saveBonus(b);
    closeEdit();
    showToast(ico('up', 1) + ' Bonus réel pour ' + periodLabel(k) + ' : ' + fmtMoney(r2) + ' (remplacé).');
  };
  btn.querySelector('.bonusOk').addEventListener('click', commit);
  btn.querySelector('.bonusCancel').addEventListener('click', closeEdit);
  inp.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); closeEdit(); }
  });
});
modeSeg.addEventListener('click', (e) => {
  const b = e.target.closest('.segBtn');
  if (b) onModeChange(b.dataset.mode);
});
platformToggles.addEventListener('click', (e) => {
  const b = e.target.closest('.segBtn');
  if (!b) return;
  const m = modeOf();
  const act = activePlatforms();
  const i = act.indexOf(b.dataset.plat);
  if (i !== -1) {
    if (act.length === 1) { showToast('Au moins une plateforme doit rester active.'); return; }
    act.splice(i, 1);
  } else act.push(b.dataset.plat);
  settings.platformsOn = settings.platformsOn || {};
  settings.platformsOn[m] = act;
  if (act.indexOf(settings.platform) === -1) settings.platform = act[0];
  saveSettings();
  renderSettings();
  renderStartButtons();
  showToast(ico('car', 1) + ' Boutons chrono ' + modeOf() + ' : ' + act.map((p) => PLATFORMS[p].label).join(', ') + '.');
});
[setRate, setSeuilNoir, setSeuilEtoile, setSeuilDouble, setDemoMul, setObjTemps, setGmapsKey].forEach((el) => el.addEventListener('change', onSettingsChange));
demoSeg.addEventListener('click', (e) => {
  const b = e.target.closest('.segBtn');
  if (!b) return;
  settings.demoOn = b.dataset.demo === 'on';
  saveSettings();
  renderSettings();
  updateCourse();
  if (timer.running) tick();
  showToast(settings.demoOn ? ico('play', 1) + ' Mode démo ACTIVÉ — le chrono avance ×' + demoMul() + '.' : 'Mode démo coupé — chrono en temps réel.');
});
resetSettingsBtn.addEventListener('click', resetSettings);
profileSelHeader.addEventListener('change', () => switchProfile(profileSelHeader.value));
newProfileBtn.addEventListener('click', () => {
  const name = String(prompt('Nom du nouveau compte :') || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!name) return;
  switchProfile(name);
});
setInterval(applyTheme, 60000); // re-résout « auto » chaque minute

/* ================= Compte : connexion par code à 4 chiffres =================
   Inscription : e-mail OU téléphone → code à 4 chiffres → pseudo (+ VTC/Livreur).
   Connexion : e-mail/téléphone → code à 4 chiffres. Aucun mot de passe.
   100 % local : le code est généré localement ; en production, brancher sendCode()
   sur un vrai envoi e-mail/SMS (Twilio, SendGrid…). Le hash de contact est local
   (démo, non cryptographique). */
const LS_ACCOUNTS = 'gh.accounts.v1';
const LS_SESSION = 'gh.session.v1';
const LS_PENDING = 'gh.pendingCode.v1';
let loginMode = 'vtc';
let pendingContact = '';
let resendTimer = null;

function loadAccounts() { try { return JSON.parse(localStorage.getItem(LS_ACCOUNTS)) || []; } catch (e) { return []; } }
function saveAccounts(a) { try { localStorage.setItem(LS_ACCOUNTS, JSON.stringify(a)); } catch (e) { /* ignore */ } }
function loadSession() { try { return JSON.parse(localStorage.getItem(LS_SESSION)); } catch (e) { return null; } }
function hashContact(s) { let h = 5381; for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); } return 'h' + (h >>> 0).toString(16); }
function normContact(s) { s = String(s || '').trim().toLowerCase(); return s.indexOf('@') !== -1 ? s : s.replace(/[\s.\-()]/g, ''); }
function validContact(s) {
  s = String(s || '').trim();
  if (s.indexOf('@') !== -1) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  return /^\+?[0-9]{8,15}$/.test(s.replace(/[\s.\-()]/g, ''));
}
function sendCode(contact, code) { return true; } // seam prod : envoi réel e-mail/SMS

function showLoginStep(n) {
  loginStep1.classList.toggle('hidden', n !== 1);
  loginStep2.classList.toggle('hidden', n !== 2);
  loginStep3.classList.toggle('hidden', n !== 3);
}
function readPending() { try { return JSON.parse(localStorage.getItem(LS_PENDING)); } catch (e) { return null; } }

$('loginSendBtn').addEventListener('click', () => {
  const raw = loginContact.value.trim();
  if (!validContact(raw)) { showToast('Entre un e-mail valide ou un téléphone valide (8 à 15 chiffres).'); loginContact.focus(); return; }
  pendingContact = normContact(raw);
  const code = String(1000 + Math.floor(Math.random() * 9000));
  const pending = { h: hashContact(pendingContact), code: code, exp: Date.now() + 10 * 60 * 1000, attempts: 0 };
  try { localStorage.setItem(LS_PENDING, JSON.stringify(pending)); } catch (e) { /* ignore */ }
  sendCode(pendingContact, code);
  demoCodeVal.textContent = code; // mode local/démo : le code s'affiche ici
  loginTarget.textContent = raw;
  loginTarget2.textContent = raw;
  loginCode.value = '';
  showLoginStep(2);
  let wait = 30;
  loginResend.disabled = true;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    wait--;
    if (wait <= 0) { clearInterval(resendTimer); loginResend.disabled = false; loginResend.textContent = 'Renvoyer le code'; }
    else loginResend.textContent = 'Renvoyer le code (' + wait + ' s)';
  }, 1000);
  loginCode.focus();
  showToast(ico('up', 1) + ' Code envoyé à ' + raw + '.');
});
$('loginChange').addEventListener('click', () => { clearInterval(resendTimer); showLoginStep(1); loginContact.focus(); });
$('loginResend').addEventListener('click', () => { $('loginSendBtn').click(); });
$('loginVerifyBtn').addEventListener('click', () => {
  const p = readPending();
  const code = String(loginCode.value || '').trim();
  if (!p || !pendingContact || p.h !== hashContact(pendingContact)) { showToast('Aucun code en attente — renvoie-en un.'); showLoginStep(1); return; }
  if (Date.now() > p.exp) { showToast('Code expiré (10 min) — renvoie-en un.'); showLoginStep(1); return; }
  if (p.attempts >= 5) { showToast('Trop d’essais (5 max) — renvoie un nouveau code.'); showLoginStep(1); return; }
  if (code !== p.code) {
    p.attempts++;
    try { localStorage.setItem(LS_PENDING, JSON.stringify(p)); } catch (e) { /* ignore */ }
    showToast('Code incorrect (' + p.attempts + '/5).');
    loginCode.value = '';
    loginCode.focus();
    return;
  }
  // NB : le pending est conservé jusqu'au démarrage de session (création de compte comprise)
  const acc = loadAccounts().find((a) => a.contactHash === p.h);
  if (acc) startSession(acc.id, acc.pseudo); // compte existant → connexion directe
  else { showLoginStep(3); loginPseudo.focus(); } // nouveau compte → pseudo + VTC/Livreur
});
loginCode.addEventListener('input', () => { if (String(loginCode.value).trim().length === 4) $('loginVerifyBtn').click(); });
document.querySelectorAll('#loginModeSeg .segBtn').forEach((b) => b.addEventListener('click', () => {
  loginMode = b.dataset.loginMode;
  document.querySelectorAll('#loginModeSeg .segBtn').forEach((x) => x.classList.toggle('on', x === b));
}));
$('loginCreateBtn').addEventListener('click', () => {
  const pseudo = String(loginPseudo.value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (pseudo.length < 3) { showToast('Pseudo : 3 caractères min (lettres, chiffres, - _).'); loginPseudo.focus(); return; }
  const p = readPending();
  if (!p || !pendingContact) { showToast('Session de création perdue — recommence.'); showLoginStep(1); return; }
  const accounts = loadAccounts();
  const acc = { id: 'acc_' + Date.now(), contactHash: p.h, pseudo: pseudo, mode: loginMode, createdAt: new Date().toISOString() };
  accounts.push(acc);
  saveAccounts(accounts);
  // le mode choisi à la création (VTC/Livreur) devient le mode du compte
  const s = Object.assign({}, DEFAULT_SETTINGS, MODES[loginMode], { mode: loginMode, theme: (settings && settings.theme) || 'auto' });
  try { localStorage.setItem(LS_SETTINGS_PREFIX + pseudo, JSON.stringify(s)); } catch (e) { /* ignore */ }
  startSession(acc.id, pseudo);
});

function startSession(accountId, pseudo) {
  try { localStorage.removeItem(LS_PENDING); } catch (e) { /* ignore */ }
  try { localStorage.setItem(LS_SESSION, JSON.stringify({ accountId: accountId, at: Date.now() })); } catch (e) { /* ignore */ }
  enterApp(pseudo);
}
function enterApp(pseudo) {
  if (pseudo) { profile = pseudo; saveProfile(pseudo); }
  settings = loadSettings();
  rides = loadRides();
  try { sortKey = localStorage.getItem('garantieHoraire.sort.v6.' + profile) || 'date_desc'; } catch (e) { sortKey = 'date_desc'; }
  document.body.classList.remove('locked');
  renderSettings();
  buildManualForm();
  renderStartButtons();
  applyTheme();
  updateCourse();
  renderHistory();
  showView('course');
  setAmbient(null);
  showToast(ico('user', 1) + ' Connecté' + (profile ? ' en tant que « ' + profile + ' »' : ' (mode local)') + '.');
}
$('loginLocalBtn').addEventListener('click', () => {
  try { localStorage.setItem(LS_SESSION, JSON.stringify({ local: true })); } catch (e) { /* ignore */ }
  enterApp(null);
});
logoutBtn.addEventListener('click', () => {
  try { localStorage.removeItem(LS_SESSION); } catch (e) { /* ignore */ }
  location.reload();
});

/* ================= PWA : service worker (hors-ligne) + installation écran d'accueil ================= */
const installHint = $('installHint'), installHintText = $('installHintText'), installBtn = $('installBtn');
let deferredInstallPrompt = null;
function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}
function updateInstallHint() {
  if (!installHint) return;
  if (isStandalone()) { installHint.classList.add('hidden'); return; }
  installHint.classList.remove('hidden');
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  installHintText.innerHTML = isIOS
    ? 'Dans Safari : bouton <b>Partager</b> → <b>« Sur l’écran d’accueil »</b> → Ajouter. GH se lancera alors <b>plein écran</b> (icône GH sur l’écran d’accueil). En HTTPS (port 8472 + certificat installé), l’appli fonctionnera même <b>sans réseau</b>.'
    : 'Installe GH comme une appli plein écran depuis le menu du navigateur.';
  installBtn.classList.toggle('hidden', !deferredInstallPrompt);
}
// Le service worker exige un contexte sécurisé (https ou localhost) : sur le LAN en HTTP
// il ne s'enregistre pas, mais le raccourci « écran d'accueil » fonctionne quand même.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    // updateViaCache 'none' : le navigateur re-vérifie sw.js à chaque ouverture →
    // la PWA installée se met à jour TOUTE SEULE après chaque déploiement Pages.
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('⬇️ Mise à jour de GH installée — rechargement…');
            setTimeout(() => { if (!sessionStorage.getItem('ghReloaded')) { sessionStorage.setItem('ghReloaded', '1'); location.reload(); } }, 800);
          }
        });
      });
    }).catch(() => {});
  });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstallPrompt = e; updateInstallHint(); });
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; updateInstallHint(); });
installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  try { await deferredInstallPrompt.userChoice; } catch (err) { /* ignore */ }
  deferredInstallPrompt = null;
  updateInstallHint();
});
updateInstallHint();

/* ================= Init ================= */
(function boot() {
  const session = loadSession();
  if (session && session.accountId) {
    const acc = loadAccounts().find((a) => a.id === session.accountId);
    enterApp(acc ? acc.pseudo : null);
  } else if (session && session.local) {
    enterApp(null);
  } else {
    document.body.classList.add('locked');
    applyTheme();
    showLoginStep(1);
    showView('login');
  }
})();
