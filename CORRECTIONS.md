# CORRECTIONS.md — Feuille de route des corrections (22/11/2026)

## 🔴 P0 — L'OCR ne marche pas sur le Pixel (PWA installée depuis github.io/GH)
Symptôme : « OCR indisponible (cannot read properties of undefined) », puis toujours rien.

| # | Cause | Fix | Statut |
|---|---|---|---|
| 1 | `corePath` pointait sur le `.wasm` au lieu du dossier contenant le glue `tesseract-core.wasm.js` | `corePath` = dossier + 4 variantes core vendored | ✅ c74d615 |
| 2 | Chemins relatifs du worker cassés sous le sous-dossier `/GH/` (résolus par rapport à l'URL du worker) | `APP_BASE` absolu partout (workerPath/corePath/langPath) | ✅ 5ef19f3 |
| 3 | Image pas encore décodée quand l'OCR la lit (canvas vide) | `await offerImg.onload` avant OCR | ✅ f1fb8af |
| 4 | **Precache SW de 33 Mo en un `addAll` : si un fichier échoue, TOUT l'install du SW échoue** → plus de SW = partage auto mort + cache KO + pas de mise à jour auto | precache fichier par fichier (`allSettled`), cache v5 | ✅ f9fa5aa |
| 5 | **ROOT CAUSE probable : `gzip` défaut à true dans tesseract.js v5 → le worker demande `eng.traineddata.gz` → 404 chez nous → init worker KO → « undefined »** | `gzip: false` dans `createWorker` (nos fichiers sont des `.traineddata` non compressés) | ✅ poussé |
| 6 | PWA du Pixel = ancienne version en cache | network-first pour le code + `updateViaCache:'none'` + toast « Mise à jour installée » ; si bloqué : supprimer/réinstaller l'icône | ✅ f9fa5aa |
| 7 | Peu de visibilité sur l'erreur exacte | messages d'étape dans la modale + page d'autotest `maquette-ocr/test.html` (étapes ✅/❌ visibles sur le téléphone) | ✅ poussé |

| 8 | **Symptôme « bloque à Chargement du moteur OCR » = createWorker ne se termine jamais (hang, pas d'erreur)** — typique d'un échec de chargement langue/core dans le worker qui n'est pas propagé | `gzip:false` (cause #5) + **timeout 30 s avec message explicite** + logger d'étapes dans la modale + autotest `maquette-ocr/test.html` | ✅ poussé f610c1a+ |

**Vérification** : Pixel → icône GH → Course → 📸 → capture → verdict en < 3 s.
Autotest sur iPhone 12 mini ET Pixel : ouvrir **`https://studioacil.github.io/GH/maquette-ocr/test.html`** → « Lancer le test OCR » → noter la 1ʳᵉ étape ❌ (1=lib, 2=image, 3=worker+langue, 4=reconnaissance).

## 🟠 P1 — Mise à jour auto de la PWA
Fait côté code (network-first + updateViaCache none + toast + reload), bloqué par P0.4.

## 🟠 P1 — Routing « trafic réel » (remplace l'estimation locale dist×2,2)
- Google Distance Matrix : ✅ codé, s'active si clé perso dans Réglages.
- **Fallback OSRM sans clé à coder** : `router.project-osrm.org/route/v1/driving/{lng,lat};{lng,lat}?overview=false` → `duration`. ⏳

## 🟡 P2 — Import DSAR `driver_trip_status_*.csv` (approche RÉELLE par course)
4ᵉ bouton d'import : approche = durée du statut `to_pickup`, jointure `begin_timestamp_local` ≈ `begintrip_timestamp_local`.
Priorité d'approche : chrono > DSAR > request/ETA/moyenne. ⏳ (attente du DSAR complet de ta part)

## 🟡 P2 — Reste de la feuille de route (README §11)
Graphe jour par jour dans Analyse, conseils contextuels, export PDF, couleurs de zone custom, resync maquette-2027, compte SMS/mail réel (Twilio), comparateur chauffeurs (backend).
