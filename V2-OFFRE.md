# GH V2 — « Analyse d'offre » (style Ride_IQ, mais 100 % local) + Webapp Android

Objectif : labelliser une offre Uber/Bolt **avant de l'accepter** (zone diamant→noire +
verdict rentable/perte), en < 10 s, depuis une simple capture d'écran de l'offre.

## 1. Principes invariants
- **100 % local** : OCR dans le navigateur (Tesseract.js vendored), données en `localStorage`.
- **Aucune interaction avec l'app Uber** (jamais de tap auto, jamais de lecture auto de l'écran
  sur iOS — impossible de toute façon). L'utilisateur importe **lui-même** sa capture.
  → risque CGU quasi nul (lecture manuelle de son propre écran).
- **Vie privée** : les adresses ne vont nulle part, sauf vers Google Maps si l'utilisateur
  renseigne **sa propre clé API** (stockée en local). Alternative gratuite : OSRM public.

## 2. Flux par plateforme

### iOS (PWA installée écran d'accueil)
1. Offre Uber → **capture d'écran** (boutons latéraux).
2. Ouvrir **GH** (icône écran d'accueil) → onglet Course → bouton **📸 Analyser une offre**.
3. File picker Photos (`<input type="file" accept="image/*">`) → la capture.
4. OCR local → extraction → verdict affiché en overlay/modal.
5. Boutons : **« Pré-remplir le chrono »** (prix + plateforme renseignés) / **« Ignorer »**.

> iOS ne supporte pas `share_target` : le file picker est le canal. Geste total ≈ 5–8 s.

### Android (webapp = même PWA + share target)
Même code, plus :
- `manifest.webmanifest` → bloc `share_target` (POST multipart `files: image/*` vers
  `./index.html?share=image`) : **capture → Partager → GH** apparaît dans la feuille de
  partage (équivalent de la « bulle » de Ride_IQ). Geste ≈ 3–4 s.
- Le **service worker** intercepte le POST `?share=image`, récupère le fichier et le passe
  à la page via `postMessage` (pattern standard share-target). Cache bump `gh-shell-v2`.
- Bouton **« Installer »** natif Android déjà en place (`beforeinstallprompt`).
- Option plus tard : **TWA** (Trusted Web Activity) pour publier sur le Play Store en
  simple webview de `studioacil.github.io/GH/`.

## 3. Pipeline OCR (offline)
- Vendor dans `vendor/tesseract/` : `tesseract.min.js`, worker, `.wasm`, `lang/eng.traineddata`
  (+ `fra` si dispo) — ~4–8 Mo, OK pour GitHub Pages.
- Prétraitement : upscale 2x, contraste/grayscale (canvas) pour fiabiliser.
- Parsing de l'offre Uber/Bolt par regex sur les lignes OCR :
  prix `€?\d+[.,]\d{2}`, ETA `(\d+)\s*min`, distance `(\d+[.,]\d+)\s*km`,
  surge `x?\d+[.,]\d+`, adresses (lignes longues avec virgule/numéro).
- Champs éditables à la main si l'OCR dérape (l'UI montre l'image + les champs extraits).
- **Calibration** : à faire avec 2–3 vraies captures (floues) par type d'offre (UberX,
  Comfort, surge, Bolt).

## 4. Estimation du temps de trajet (routing)
- Géolocalisation du téléphone au moment de la capture (`navigator.geolocation`, permission
  demandée au clic) → origine.
- **Google Distance Matrix** (clé perso en Réglages, jamais envoyée ailleurs) :
  `origins=lat,lng` → `destinations=pickup|dropoff`, `mode=driving`, `departure_time=now`
  (trafic en temps réel) → durée approche + durée trajet.
- Fallback gratuit : **OSRM** public `router.project-osrm.org` (rate-limité, coordonnées
  envoyées à OSRM — averti dans l'UI).
- Fallback sans réseau : distance à vol d'oiseau × 1,3 ÷ 50 km/h (estimation grossière,
  affichée comme telle).

## 5. Verdict
- `tempsTotal = approche + trajet` (saisie manuelle possible).
- `taux = prix / (tempsTotal/3600)` → **pastille de zone** (diamant/étoile/verte/rouge/noire).
- Coûts réels réglables (€/km carburant+usure, €/mois fixes → ramenés) : `net = prix − coûts`
  → verdict **« rentable » si taux ≥ GH**, « à évaluer » entre seuil noire et GH, « perte » sous
  le seuil noire.
- Historique des offres analysées (acceptée/refusée) dans un nouvel onglet ou section
  Analyse — utile pour calibrer.

## 6. Fichiers impactés
- `index.html` : bouton 📸 + modal offre + input file caché + champ clé API + coûts/km.
- `app.js` : `ocr.js` (Tesseract), `routing.js` (Google/OSRM/vol d'oiseau), `offer.js`
  (parse + verdict + pré-remplissage chrono).
- `vendor/tesseract/…` : librairie vendored.
- `manifest.webmanifest` : `share_target` (Android).
- `sw.js` : handler POST `?share=image` + cache `gh-shell-v2`.
- `style.css` : modal offre, pastille verdict, gros boutons tactiles.

## 7. Phases — état
1. **Mode décision rapide** (sans capture) : prix + ETA préréglées → zone en 1 tap — ✅ dans `maquette-ocr/` (à porter dans l'app si besoin).
2. **Capture + OCR local + verdict zone** — ✅ **prod** : bouton 📸 écran Course → modale OCR (Tesseract vendored, **worker préchauffé** à l'ouverture de l'app → 1re analyse en ~1–2 s), champs éditables, verdict zone + rentable/perte, puis **« ▶ Lancer le chrono (prix) »** qui démarre le chrono pré-rempli (plateforme détectée depuis le texte OCR).
3. **Routing Google/OSRM** (clé perso en Réglages) → temps trajet réel — ⏳ à faire (estimation locale dist×2,2 min/km pour l'instant).
4. **Android share_target** — ✅ `manifest.webmanifest` (`share_target` POST `./index.html?share=image`) + `sw.js` v2 (handler POST → `postMessage` à la page) + écouteur `share-image` dans `app.js` : **capture → Partager → GH** ouvre la modale et lance l'OCR direct. Nécessite HTTPS (GitHub Pages ou 8472 + cert).
5. **Historique des offres** + coûts/km persistés + TWA Play Store (optionnel) — ⏳.

## 8. Risques / limites
- OCR imparfait sur petites polices → champs éditables + calibration avec vraies captures.
- Coût Google Distance Matrix ≈ 0,005 $/requête (quotas gratuits généreux au début).
- iOS : pas de share target → file picker (un peu plus long).
- Ne JAMAIS automatiser l'acceptation dans l'app Uber (CGU, ban) — GH reste lecture seule.
