# GH — Garantie horaire

Application web **100 % locale** pensée pour les chauffeurs VTC et les livreurs :
elle calcule en temps réel le **taux horaire effectif** d'une course et le compare à la
**Garantie Horaire (GH)** de la plateforme, afin de rester au-dessus du seuil de
rentabilité (et de ne jamais faire perdre d'argent à la plateforme).

Aucune donnée ne quitte l'appareil : pas de compte, pas de serveur, pas de tracking.
Tout est stocké dans le `localStorage` du navigateur.

---

## 1. Lancer le projet

Aucune dépendance, aucun build. Trois fichiers statiques servis n'importe comment :

```bash
cd GH
ruby server.rb          # sert http://localhost:8471/ + https://localhost:8472/ (Cache-Control: no-store)
# ou : python3 -m http.server 8471
# ou simplement ouvrir index.html dans un navigateur (sauf l'import de fichiers,
# qui fonctionne aussi en file:// selon le navigateur)
```

**Partage public (PWA)** : pousser ce dossier sur un repo GitHub nommé **`GH`** (public) et
activer Pages (Settings → Pages → branche `main`, racine `/`) → l'appli est servie en HTTPS à
**`https://<pseudo>.github.io/GH/`** — lien à envoyer (WhatsApp…) ; installation iPhone :
Safari → Partager → « Sur l'écran d'accueil ». Le zip prêt à partager (sans clé privée) :
`/Users/JolanRabi/Downloads/gh-app.zip` (drop sur https://app.netlify.com/drop pour une URL instantanée).

**Déploiement auto sur GitHub (sans git local)** : `tools/deploy.rb` pousse tout le dossier via
l'API REST (blobs → arbre → commit → ref), Pages redéploie dans ~1 min. Créer un PAT (classic,
scope `repo`) sur github.com → Settings → Developer settings → Personal access tokens, puis :
```bash
GH_TOKEN=ghp_xxxx ./tools/deploy.sh     # le token reste sur ta machine
```
(Ne committe jamais `cert.pem`/`key.pem` — exclus par le script et le `.gitignore`.)

- App de production : **http://localhost:8471/** (HTTP) et **https://localhost:8472/** (HTTPS, port PWA)
- Sur iPhone (même Wi-Fi que le Mac) : **http://192.168.1.70:8471/** ou **https://192.168.1.70:8472/**
- Maquette interactive 2027 (référence design, mode démo ×10) : **http://localhost:8471/maquette-2027/**
- Maquette **mode « OCR »** (analyse d'offre façon Ride_IQ, OCR 100 % local via Tesseract.js vendored) :
  **http://localhost:8471/maquette-ocr/** — spec dans `V2-OFFRE.md`
- **Mode OCR en prod (V2)** : bouton 📸 sur l'écran Course → capture → OCR local (Tesseract préchauffé,
  ~1–2 s) → verdict de zone → « ▶ Lancer le chrono (prix) ». Sur **Android** : `share_target` dans le
  manifest → capture → **Partager → GH** → OCR auto (nécessite HTTPS : GitHub Pages ou port 8472).

### Installer la PWA sur iPhone (plein écran + hors-ligne)
1. `ruby server.rb` génère `cert.pem`/`key.pem` au premier lancement et ouvre **deux** ports :
   8471 (HTTP) et 8472 (HTTPS, certificat auto-signé, TLS ≥ 1.2).
2. Sur l'iPhone, ouvrir **https://192.168.1.70:8472/cert.pem** → installer le profil
   (Réglages → Profil téléchargé → Installer, puis confiance dans
   Réglages → Général → VPN et gestion d'appareil → certificats).
3. Ouvrir **https://192.168.1.70:8472/** dans Safari → bouton **Partager** →
   **« Sur l'écran d'accueil »** → Ajouter. L'icône GH (couronne 5 zones + bille)
   apparaît ; l'appli se lance **plein écran** et le service worker (`sw.js`) la rend
   **utilisable sans réseau** (app shell + 8 sons pré-cachés).
4. Sans le certificat (HTTP 8471) : le raccourci écran d'accueil fonctionne aussi
   (plein écran), mais le cache hors-ligne du SW n'est pas actif.

## 2. Architecture

```
GH/
├── index.html      # structure + sprite SVG inline (26 symboles <symbol id="i-...">)
├── style.css       # design system « Nebula Glass 2027 » (thème sombre + clair « blanc cassé »)
├── app.js          # toute la logique (vanilla JS, 'use strict', zéro librairie)
├── server.rb       # petit serveur statique de dev (port 8471)
├── maquette-2027/  # prototype interactif autonome (ne pas modifier, référence)
└── README.md       # ce fichier
```

**Stockage** (clés `localStorage`) :

| Clé | Contenu |
|---|---|
| `garantieHoraire.profile.v6` | nom du compte actif (le pseudo = le profil) |
| `garantieHoraire.settings.v6.<profil>` | réglages JSON (voir §4) |
| `garantieHoraire.rides.v6.<profil>` | historique des courses JSON (voir §5) |
| `garantieHoraire.sort.v6.<profil>` | critère de tri de l'historique |
| `garantieHoraire.bonus.v6.<profil>` | **GH réelle + bonus** saisis à la main (total, remplace l'estimation), par période : `{ "2026-10": 555.14 }` (case cliquable « GH réelle + Bonus — saisir », affiche `- €` si rien saisi) |
| `garantieHoraire.invoices.v1.<profil>` | factures client (export « driver-to-rider invoice »), agrégées par semaine de facture (lundi de `DateFacture`) : `{ "2026-08-03": { brut, net, taxe, n } }` — `brut` = MontantBrut **TTC réellement facturé** |
| `garantieHoraire.incentives.v1.<profil>` | bonus par course (export « driver_payments », lignes `intermediary.incentive.*`), indexés par `request_timestamp_local` normalisé : `{ "2026-11-21T22:46:30": 4.5 }` |
| `gh.accounts.v1` | comptes : `{ id, contactHash, pseudo, mode, createdAt }` |
| `gh.session.v1` | session active `{ accountId }` ou `{ local: true }` (mode sans compte) |
| `gh.pendingCode.v1` | code à 4 chiffres en attente `{ h, code, exp, attempts }` (10 min, 5 essais) |

Plusieurs comptes (profils) coexistent ; le sélecteur est en haut à droite de l'en-tête.

## 3. Règles métier

### 3.1 Taux horaire effectif

```
taux = prix encaissé / (temps total de la course en heures)
```

Le temps total = **somme de toutes les phases** (approche + course, ou les 3 phases
livreur). Pas de supplément, pas de « méthode A/B » : le taux effectif ne dépend que du
prix et du temps réellement passé.

### 3.2 Les 5 zones

Autour de la GH, 5 zones, du pire au meilleur :

| Zone | Condition | VTC (défaut) | Livreur (défaut) |
|---|---|---|---|
| 💀 **Noire** | `taux < seuilNoir` | < 22,50 €/h (GH × 0,75) | < 14,972 €/h (19 × 0,788, soit −21,2 %) |
| 🟥 **Rouge** | `seuilNoir ≤ taux < GH` | 22,50 – 30 €/h | 14,972 – 19 €/h |
| 🟢 **Verte** | `GH ≤ taux < seuilÉtoile` | 30 – 37,50 €/h | 19 – 23,028 €/h |
| ⭐ **Étoile** | `seuilÉtoile ≤ taux < seuilDouble` | 37,50 – 60 €/h | 23,028 – 38 €/h |
| 💎 **Diamant** | `taux ≥ seuilDouble` | ≥ 60 €/h (2 × GH) | ≥ 38 €/h (2 × GH) |

Seuils réglables dans l'app (Réglages), avec bouton de **réinitialisation aux valeurs
d'origine du mode**.

Pour une course donnée, on convertit aussi les seuils en **temps** (pour un prix P) :
`temps_zone = P × 3600 / seuil_zone`. Ex. 15 € → diamant < 15 min, étoile < 24 min,
verte < 30 min, rouge < 40 min, noire au-delà.

### 3.3 Modes et plateformes

| Mode | GH défaut | Seuils | Période de suivi | Plateformes (boutons Chrono) |
|---|---|---|---|---|
| **VTC** | 30 €/h | 22,50 / 37,50 / 60 | **mois civil** | Uber (bouton noir), Bolt (bouton vert) |
| **Livreur** | 19 €/h | 14,972 / 23,028 / 38 | **semaine civile** (lundi 00:00 → dimanche 23:59) | Deliveroo, Uber Eats |

Chaque course mémorise sa plateforme. Le sélecteur d'app (Uber/Bolt/Deliveroo/Uber Eats)
dans les réglages ne fait que pré-sélectionner le bouton de lancement par défaut.

### 3.4 Phases du chrono

- **VTC** : 2 phases — `Approche` (acceptation → prise en charge) puis `Course`.
  Bouton de transition : « Client pris en charge ».
- **Livreur** : 3 phases — `Approche`, `Attente resto`, `Livraison`.
  Transitions : « Arrivé au resto », « Départ avec la commande ».
- 4ᵉ temps livreur : la course se termine au clic sur **Terminer** (commande remise).

Chaque course de l'historique est **modifiable** (prix + durée de chaque phase, en
min + sec) pour corriger les fautes de frappe.

### 3.5 Sons

- **Fichiers locaux** dans `sons/` (extensions `.mp3/.ogg/.wav/.m4a`), servis par le serveur :
  `son-start.mp3` (SoundCloud « UBER ACCEPT » — lancement chrono),
  `son-phase.m4a` (SoundCloud « UBER DRIVER DISPATCH » — transition de phase : approche → course, arrivé au resto…),
  `son-double.mp3` / `son-etoile.mp3` (SoundCloud « UBER STARS » — zones diamant/étoile),
  `son-verte.mp3` (SoundCloud « UBER ONLINE » — zone verte),
  `son-rouge.mp3` (MyInstants « uber-driver-order-cancelled-45970 » — zone rouge),
  `son-noire.mp3` (MyInstants « klaxon-alarm-54254 » — zone noire),
  `son-stop.mp3` (SoundCloud « UBER OFFLINE » — fin de course).
  Voir le détail dans `sons/README.md`.
- **Lecture WebAudio (AudioBuffer)** : indispensable sur iOS Safari — aucun son programmatique
  ne joue tant que l'`AudioContext` n'est pas débloqué par un geste. L'app appelle `resume()`
  au premier `pointerdown`/`touchend` (`unlockAudio()`) et précharge tous les sons à ce moment.
  Ensuite les zones qui changent pendant le chrono sonnent sans nouveau geste.
- Déclencheurs : entrée dans chaque zone (1× ; **noire = double son + vibration à l'entrée,
  puis rappel une fois toutes les 5 minutes**), changement de phase (extrait de 1 s), start/stop.
- Si un fichier manque → **repli sur le bip synthétique** WebAudio (diamant 1400 Hz, rouge
  880 Hz, noire double 660 Hz…). Coupure globale dans Réglages → « Sons » (`settings.sons`).
- Note iPhone : vérifier que le **switch latéral Silent n'est pas activé** et que le volume média est monté.

## 4. Modèle de données

### `settings` (par profil)

```json
{
  "mode": "vtc",              // "vtc" | "livreur"
  "platform": "uber",         // plateforme par défaut du mode
  "platformsOn": { "vtc": ["uber"], "livreur": ["ubereats"] },  // plateformes actives (boutons chrono), réglables
  "theme": "auto",            // "light" | "dark" | "auto" (auto = jour 7h–20h, nuit sinon)
  "sons": true,               // sons du dossier sons/ (fallback bip synthétique)
  "approcheMode": "moyenne",  // approche importée CSV : "eta" | "request" | "moyenne"
  "demoOn": false,            // mode démo : chrono accéléré
  "demoMul": 10,              // vitesse de démo (×N)
  "objTemps": 0,              // objectif : temps moyen par course visé en minutes (0 = off)
  "rate": 30,                 // GH en €/h
  "seuilNoir": 22.5,
  "seuilEtoile": 37.5,
  "seuilDouble": 60
}
```

### `ride` (une course)

```json
{
  "id": "1717..._abc12",
  "date": "2026-05-20T17:51:22.000Z",
  "price": 13.81,             // € encaissés
  "actual": 2267,             // secondes totales (somme des phases)
  "phases": [ { "label": "Approche", "icon": "pin", "sec": 1119 },
              { "label": "Course",   "icon": "car", "sec": 1148 } ],
  "taux": 21.9,               // €/h effectif
  "zone": "rouge",
  "platform": "uber",
  "tDouble": 828, "tEtoile": 1326, "tVerte": 1656, "tRouge": 2211,  // seuils temps (s)
  "extId": "6402",            // driver_trip_number (import CSV, dédup)
  "src": "csv",               // source : "chrono" | "manuel" | "csv"
  "bonus": 4.5,               // bonus € saisi à part (jamais ajouté au prix) — affiché en jaune « bonus : 4,50 € » dans la ligne
  "meta": { "city": "Lyon", "product": "uberX", "distance_miles": 7.9, "surge": 1.0, "status": "completed", "eta": 800, "begin": "...", "drop": "..." },
  "imported": true
}
```

## 5. Import CSV Uber (2 boutons, aucun export)

Dans l'historique, **deux boutons d'import** (plus aucun bouton d'export) :

**Deux boutons d'import** (aucun export) :
1. **Import · Courses CSV (lifetime)** = export automatisé « Uber Data » → `Driver/driver_lifetime_trips-0.csv`.
2. **Import · Factures client CSV** = export « driver-to-rider invoice » (le CSV des factures
   chauffeur→client, ex. `UBER-...-driver-to-rider-invoice.csv`) → agrège `MontantBrut` (brut TTC
   réellement facturé au client) par semaine de facture. Sert à la case **« Facturée TTC »** et
   à la base du % de commission (plus fiable que `original_fare_local`, ~5 % au-dessus).
   Chaque semaine est attribuée au mois contenant son jeudi.
3. **Import · Paiements CSV (bonus)** = export « driver_payments » (`driver_payments-0.csv`) →
   extrait les lignes `intermediary.incentive.*` (driver_meg_bonus, peakhour…) indexées par
   `request_timestamp_local`. À l'import des courses : **prix net = `driver_upfront_fare_local` − bonus**
   (le bonus est inclus dans l'upfront), le bonus est stocké à part (`ride.bonus`) et affiché en
   jaune « bonus : 4,50 € » dans la ligne — jamais additionné au prix ni au taux.
   Ex. vérifié : course 21/11/2026 22:46 → upfront 13,50 − meg_bonus 4,50 = **9,00 €** + bonus 4,50 €.
   **Import idempotent** : les bonus d'un même fichier sont sommés par clé puis **remplacent**
   l'ancienne valeur (réimporter le même fichier ne double plus rien — bug « bonus 18 € » corrigé).
   Après l'import, `reapplyIncentives()` recalcule prix = upfront − bonus sur les courses CSV
   déjà en historique (clé `meta.reqKey` = request_timestamp normalisé, `meta.upfront` = tarif brut) ;
   les courses chrono/manuelles gardent leur prix saisi (seul le badge bonus est màj).
   Jointure vérifiée sur les données : 263/269 lignes incentive matchent un `request_timestamp_local`.
   Le CSV `driver_app_analytics` n'est **plus** importé.

Format : séparateur tabulation, point-virgule ou virgule détecté automatiquement, champs
entre guillemets gérés (fonction `parseCSV`, quote-aware).

Mapping ligne par ligne :

| Champ lu | Usage |
|---|---|
| `request_timestamp_local` (fallback `_utc`) | date de la course (`date`) — les champs `_local` sont lus **en heure locale** (le `Z`/fuseau collé est ignoré), pour éviter tout décalage d'affichage |
| `begintrip_timestamp_local` | fin de l'approche |
| `dropoff_timestamp_local` | fin de la course |
| `driver_upfront_fare_local` | **prix encaissé** = tarif upfront = ce que le chauffeur touche vraiment (le paiement client `original_fare_local` inclut la commission). Fallback : `original_fare_local − abs(service_fee_local)` |
| `service_fee_local` (valeur négative) | **commission plateforme** = `abs(service_fee_local)` — le vrai « service fee » Uber, stable à ~25 % du prix client (vérifié mois par mois). Fallback si absent : `original_fare_local − driver_upfront_fare_local`. Stockée dans `meta.commission`, affichée dans l'onglet Analyse (somme € + % du prix brut client `original_fare_local`, par plateforme). Réimporter le CSV pour remplir les courses déjà importées |
| `original_fare_local` | **prix brut client** (paiement client, commission incluse) — sert de base au % de commission |
| `status == "completed"` ou `is_completed == true` | seules les courses terminées sont importées |
| `driver_trip_number` | `extId` : **réimporter met à jour** la course existante (pas de doublon) |

Règles :
- **Fenêtre d'import : 24 derniers mois complets** (`importMinDate()` = 1er du mois 24 mois en
  arrière, heure locale ; plancher absolu 01/01/2020). Ex. le 22/11/2026 → à partir du 01/11/2024.
- `Course = dropoff − begintrip` (fiable, prise du CSV en priorité).
- `Approche` calculée depuis le CSV lifetime selon le **mode choisi dans Réglages**
  (`settings.approcheMode`, défaut **« Moyenne »** — validé comme le meilleur compromis) :
  `request` = begintrip − request · `eta` = min(begintrip − request, eta) ·
  `moyenne` = moyenne des deux. ⚠️ le CSV trips n'exporte pas l'heure d'acceptation réelle :
  `request_timestamp` = heure de la *demande* du client.
- Cohérence **par ligne** : si les 3 timestamps `_local` existent → lecture en heure locale
  (fuseau collé ignoré) ; sinon les 3 en `_utc`. Jamais de mélange (sinon ±1 h d'erreur par course).
- Changer de mode d'approche dans les réglages **recalcule** toutes les courses importées
  (`recomputeApproches`).

### 5.1 Trois sources de courses & dédoublonnage

Chaque course a une source (`src`) : **`chrono`** (chronométrée dans l'app),
**`manuel`** (saisie manuelle) ou **`csv`** (import). Badge affiché dans l'historique.

À chaque ajout/import, un **doublon** est détecté si une course existante a le même prix
(± max(1 €, 10 %)) et un début **ou** une fin à ± 20 min (`findDup`) :
- import CSV ↔ course existante avec même `extId` → mise à jour ;
- sinon, fusion champ par champ (`mergeRide`) selon les priorités :
  - **approche** : chrono > manuel > csv (le chronométré est le plus fiable) ;
  - **course** : csv > manuel > chrono ;
  - **prix** : manuel > csv > chrono.
- Chrono et saisie manuelle demandent **confirmation** (boîte de dialogue) avant fusion ;
  l'import CSV fusionne automatiquement et compte les fusions dans le toast.

## 6. Écrans et fonctionnalités

0. **Connexion (compte)** — au démarrage sans session, écran verrouillé : e-mail **ou**
   téléphone → **code à 4 chiffres** (pas de mot de passe) → si le compte existe,
   connexion directe ; sinon création du **pseudo** + choix **VTC / Livreur** (le mode
   choisi devient le mode du compte). Le code est généré localement et **affiché à
   l'écran en mode local/démo** ; en production, brancher `sendCode()` sur un vrai envoi
   e-mail/SMS (Twilio, SendGrid…). Lien « Continuer sans compte » = mode 100 % local.
   « Se déconnecter » dans les réglages. Le hash de contact est un hash local (démo,
   non cryptographique). Code valable 10 min, 5 essais max, renvoi avec compte à rebours 30 s.
1. **Course** — saisie du prix en très gros ; pastilles des 5 zones avec le temps
   restant avant chaque changement de zone ; boutons **Chrono <Plateforme>** (noir Uber,
   vert Bolt, etc.) activés dès qu'un prix est saisi. **Si un chrono est déjà en cours,
   cliquer sur l'onglet Course ramène au chrono** (avec un toast), jamais à la saisie.
2. **Chrono** — anneau de **60 minutes** (15 min = 1 quart de tour, départ à midi,
   sens horaire) coloré par segments de zones ; **bille lumineuse** (36 px, plus épaisse
   que la couronne) qui tourne sur la couronne et dont le glow prend la couleur de la
   zone courante ; au centre **Temps** (MM gros : SS petit) **ou** **Euro** (compteur €
   seul, entier gros / décimales petit) — jamais les deux, bascule par les segments
   *Temps / Euro* ; pastille de zone ; ligne de statut prédictive (« passage en rouge
   dans… ») ; **points fixes posés sur la couronne à chaque changement de phase —
   le « client pris en charge » (transition vers la dernière phase) est marqué d'un
   point rouge fixe** ; sous le nom de la zone, rappel **(prix net : X €)** ; pastilles
   des phases avec durées ; boutons de transition de phase ;
   **Terminer** (enregistre) / **Annuler**.
   Le chrono **continue de tourner** quand on change d'écran ou qu'on masque l'onglet
   navigateur (temps calculé depuis `Date.now()`, resynchro au retour via
   `visibilitychange`) ; une **pastille « chrono actif »** (icône de zone + temps) dans
   l'en-tête de chaque écran permet d'y revenir en un clic.
3. **Historique** — filtre de période : toutes / par **année** / par mois (VTC) ou
   semaine (livreur), chaque option montrant l'**émoji de la zone atteinte** (💎⭐🟢🔺💀)
   + 📅/🗓️/🗂️ et le **montant encaissé entre parenthèses** (les `<option>` ne rendent
   que du texte : émojis, pas de SVG) ; **tri** des courses (11 critères : date ↑↓,
   prix net ↑↓, prix garanti ↑↓, taux horaire ↑↓, durée ↑↓, zone) persisté par profil ;
   chaque course affiche sa **date avec l'année** ; **filtres à clic** sur les 5 logos de zone
   (afficher/masquer) ; statistiques de la période (zone du mois, encaissé, « garanti » =
   temps × GH, **Facturée TTC** = brut réellement facturé au client (factures driver-to-rider,
   si importées ; sinon fallback `original_fare_local` des courses CSV),
   **Estimation GH** = 0 € si taux ≥ GH sinon le complément dû, case cliquable
   **GH réelle + Bonus** saisie à la main (remplace l'estimation, `- €` si vide), taux moyen, répartition du
   temps par zone, **état des lieux** du mois/semaine exprimé **en moyenne par course** :
   « pour être diamant il manque X €/course », « pour être verte (GH) il manque X €/course »,
   « tu tombes dans le rouge/noire si tu mets +X min de plus par course en moyenne ») ;
   liste des courses (zone, date, prix encaissé, **prix « garanti »**, taux, phases,
   plateforme, **source** chrono/manuel/csv) avec **édition ✏️** et suppression ;
   ajout manuel (prix + **bonus** + date/heure + min/sec par phase) ; **Import CSV lifetime** (1 bouton) ;
   vider l'historique.
4. **Analyse** (4ᵉ onglet) — filtre de période indépendant (toutes / année / mois ou semaine,
   persisté `garantieHoraire.anaPeriod.v6.<profil>`) ; KPIs (courses, encaissé, temps total,
   taux moyen coloré, garanti, Estimation GH, GH + Bonus réel) ; **évolution du taux horaire
   par période** (barres SVG colorées par zone + ligne GH en pointillés) ; **répartition du
   temps par zone** (barre empilée + légende %) ; **courses par heure de la journée** (hauteur
   = nombre, couleur = zone du taux moyen de l'heure) ; **par plateforme** (taux moyen +
   zone, dont commission quand dispo) ; **commission plateforme** (somme € et % du prix client,
   globale + par plateforme — données CSV uniquement) ; **records** (meilleur/pire taux, course
   et approche les plus longues, plus gros encaissement). Graphiques SVG faits main, sans librairie.
5. **Réglages** — mode VTC/Livreur, **plateformes actives** (cases à cocher : boutons « Chrono … » affichés sur l'écran Course ; défaut **Uber** en VTC et **Uber Eats** en livreur, au moins une active, persisté par mode dans `settings.platformsOn`), **GH et 3 seuils** éditables,
   réinit aux valeurs d'origine, thème **Jour / Nuit / Auto**, comptes (profils).

## 7. Design system « Nebula Glass 2027 »

- Cible : smartphone (iPhone 18 Pro), safe-area, touch targets ≥ 44 px.
- **Deux thèmes** : sombre (glassmorphism, halos colorés) et clair « blanc cassé »
  `#faf9f5` ; `data-theme="dark|light"` sur `<html>`, bascule **auto** selon l'heure
  (7 h–20 h = jour). Variables CSS dans `:root` / `[data-theme="light"]`.
- **Sprite SVG inline** dans `index.html` : tous les logos sont des `<symbol>`,
  appelés par `ico('nom')` en JS ou `<use href="#i-nom"/>` en HTML. **Aucun emoji
  utilisé comme logo.** Pour ajouter un logo : déclarer un `<symbol id="i-xxx">` et
  l'appeler.
- Anneau 60 min : `conic-gradient` par segments de zone (`ringStops`), la progression
  se remplit via un second `conic-gradient` (`#ringProgress`) ; la bille (`#orbDot`)
  est positionnée par `transform: rotate()` sur `#orbiter`.
- Halo ambiant : `#ambient` (dégradés radiaux) + **contour périphérique battant**
  `#ambientEdge` (style « halo de contrôle » façon Claude) qui **pulse à la couleur de
  la zone courante** — la variable `--halo` est posée sur `<html>` par `setAmbient`,
  gris neutre quand aucun chrono n'est en cours.
- **Point « client pris en charge »** : point fixe rouge de **36 px (même taille que la
  bille blanche tournante)** avec halo blanc, posé sur la couronne à l'angle du moment.
- Barre d'onglets flottante en bas (`#tabbar`), marque **GH** en haut à gauche.

## 8. Conventions de code (pour contribuer)

- Vanilla JS, un seul fichier `app.js`, `'use strict'`, commentaires en français.
- Pas de framework, pas de bundler, pas de requête réseau : **100 % local**.
- Toute la logique métier (zones, seuils, périodes, import) est dans des fonctions
  pures testables : `zoneDe`, `seuilsTemps`, `tauxEffectif`, `weekKey`, `periodKey`,
  `mapUberRow`, `parseCSV`…
- Ne jamais casser la compatibilité des clés `localStorage` `*.v6.*` (migration
  manuelle si besoin).
- Tester dans le navigateur après chaque changement (le serveur renvoie
  `Cache-Control: no-store`, donc un simple F5 suffit).

## 9. Checklist de test manuel

- [ ] Saisir 15 € → pastilles : diamant < 15 min, étoile < 24 min, verte < 30 min, rouge < 40 min.
- [ ] Lancer Chrono Uber → l'anneau tourne, la bille fait un tour/heure, 15 min = quart.
- [ ] Basculer Temps/Euro : un seul des deux est visible, couleur = zone.
- [ ] Changer de phase (VTC : « Client pris en charge ») → pastille de durée + **point rouge fixe posé sur la couronne** à l'angle du moment.
- [ ] Terminer → la course apparaît dans l'historique avec encaissé + garanti.
- [ ] Éditer une course (✏️), modifier prix/phases, vérifier le recalcul du taux/zone.
- [ ] Filtrer par zone (clic sur les logos), filtrer par année/mois/semaine.
- [ ] Importer le CSV Uber d'exemple ( §10 ) → course importée, taux ≈ 21,9 €/h, zone rouge.
- [ ] Réimporter le même CSV → 0 importée (doublons).
- [ ] Passer en mode Livreur → GH 19 €, suivi par semaine, 3 phases de chrono.
- [ ] Thème auto/jour/nuit ; vérifier le contraste des deux thèmes.
- [ ] Changer de compte (profil) → données isolées.

## 10. Exemple de ligne CSV Uber (test d'import)

```csv
city_name	currency_code	status	is_completed	request_timestamp_utc	begintrip_timestamp_utc	dropoff_timestamp_utc	original_fare_local	service_fee_local	driver_upfront_fare_local	driver_trip_number	trip_distance_miles	surge_multiplier	product_type_name
Lyon	EUR	completed	true	2026-05-20T17:51:22.000Z	2026-05-20T18:10:01.000Z	2026-05-20T18:29:09.000Z	19.95	-6.14	16.61	6402	7.9	1.0	uberX
```

Résultat attendu : prix **13,81 €** (19,95 − 6,14), approche **1119 s**, course
**1148 s**, taux ≈ **21,9 €/h** → zone **rouge**.

## 11. Feuille de route

### ✅ Fait (V2)
- 5 zones + chrono multi-phases, anneau 60 min + bille + point rouge « pris en charge »,
  pastille « chrono actif » (le chrono tourne dans tous les onglets), thème jour/nuit/auto,
  prix net sous la zone, onglet Course redirigé vers le chrono en cours, multi-comptes
  (code à 4 chiffres, choix VTC/Livreur à la création), mode Livreur (semaine civile, 3 phases).
- **Halo/contour battant UNIQUEMENT quand le chrono tourne** (`html.haloOn`).
- **Plateformes actives réglables** (défaut : Uber en VTC, Uber Eats en livreur).
- **3 sources de courses (chrono / manuel / csv) + dédoublonnage** (prix ±10 %/1 €, horaires
  ±20 min) avec fusion champ par champ : approche = chrono > manuel > csv, course = csv > manuel
  > chrono, prix = manuel > csv > chrono.
- **Imports (3 boutons)** : courses lifetime (approche ETA / request / moyenne, défaut moyenne),
  factures client driver-to-rider (brut TTC réel par semaine → case « Facturée TTC » + base du
  % commission), paiements (bonus `intermediary.incentive.*` → prix = upfront − bonus, badge jaune).
- **Commission Uber** = `|service_fee_local|` (~25 % du brut TTC), cases avant/après GH
  (après = commission − GH saisie ou estimation), dans Historique + Analyse.
- **GH réelle + Bonus saisi par période** (case cliquable, clavier numérique, remplace, `- €` si vide).
- **Bonus par course** éditable, affiché à part en jaune.
- **Onglet Analyse** : KPIs, évolution du taux par période (barres zone + ligne GH), répartition
  par zone / heure / plateforme, records, commission.
- **État des lieux** en moyenne par course (€/course, min de plus par course) + « Tu as été X » en gras.
- Sons : start (UBER ACCEPT), phase (UBER DRIVER DISPATCH), **double/étoile (UBER STARS)**,
  **verte (UBER ONLINE)**, rouge (MyInstants), noire (klaxon), stop (UBER OFFLINE) —
  fallback bip si fichier absent.
- **Objectif personnalisé** (`settings.objTemps`, réglages) : temps moyen **par course** visé en
  minutes, libre (à la hausse ou à la baisse), 0 = désactivé. Affiché : sur l'écran Course
  (« à ce prix, l'objectif = X €/h, zone Y »), et jauge « Objectif temps / course » dans
  l'Historique (période sélectionnée) et l'Analyse (actuel vs cible, écart ± par course, barre
  verte/rouge).
- **Mode démo réglable** (`settings.demoOn` + `settings.demoMul`, défaut ×10) : le chrono
  avance ×N (`elapsedNow()`), badge « DÉMO ×N » sur l'écran Chrono + tag ×N dans la pastille
  « chrono actif », seuils des pastilles Course divisés par N pour rester cohérents.
- **Import CSV courses : fenêtre glissante de 24 mois complets** — ex. le 22/11/2026 →
  import à partir du 01/11/2024 (1er du mois, 24 mois en arrière, heure locale), plancher
  absolu 01/01/2020. Le toast d'import compte les lignes « hors fenêtre ».

### 🔥 Prioritaire (acté ensemble)
1. ~~**Onglet « Analyse »** (4ᵉ onglet)~~ ✅ fait. Reste à affiner : **graphe jour par jour**
   dans la période sélectionnée.
2. ~~**Objectif personnalisé**~~ ✅ fait (temps moyen par course, jauge Historique + Analyse).
3. ~~**PWA installable**~~ ✅ fait : `manifest.webmanifest` (display `standalone`, icônes
   192/512/maskable + `apple-touch-icon` générées par `tools/make_icons.rb`), `sw.js`
   (cache-first de l'app shell + des 8 sons, versionné `gh-shell-v1`), enregistrement du SW
   dans `app.js` (uniquement en contexte sécurisé : HTTPS ou localhost), bandeau
   « Installer l'appli » dans Réglages (instructions Safari → Partager → écran d'accueil sur iOS,
   bouton natif `beforeinstallprompt` sinon). **Deux serveurs** : HTTP 8471 (LAN) et
   **HTTPS 8472** (`server.rb`, certificat auto-signé `cert.pem`/`key.pem` générés au premier
   lancement, TLS ≥ 1.2 forcé ; ouvrir `/cert.pem` sur l'iPhone pour installer le profil de
   confiance) → le service worker s'active et l'appli marche **hors-ligne**.
4. **Dépôt git** pour contribuer à plusieurs + historique de versions.
5. ~~**Mode démo réglable en prod**~~ ✅ fait (bascule + vitesse ×N dans les réglages).
6. ~~**Sons manquants double/étoile/verte**~~ ✅ faits (fichiers installés dans `sons/`).
7. **Import Bolt / Deliveroo / Uber Eats** (le CSV lifetime n'existe que pour Uber).

### 🚀 Ensuite (on pourrait)
5. **Conseils contextuels selon la zone** — à mûrir : ex. zone noire → refuser les
   courses trop longues / viser le surge ; à calibrer avec des chauffeurs expérimentés.
6. Comparateur de taux entre plateformes (Uber vs Bolt) sur une même période.
7. Export PDF du mois (récap à montrer à un mentor/comptable).
8. Mode sombre « OLED pur » optionnel, couleurs de zone personnalisables.
9. Resynchroniser la maquette 2027 avec la prod (point rouge, pastille chrono actif,
   prix net, mode livreur, compte) pour une vitrine à jour.
10. Comparateur entre chauffeurs / mentorat (cohortes anonymisées) — remplace le compte
    local par un vrai backend (envoi de codes réel) si besoin.

### 🧪 Qualité
- Checklist de test manuel (§9) à dérouler sur iPhone réel (iOS Safari) et Mac.
- Dette connue : aucun test auto — harness de vérification ad hoc utilisé pendant le dev
  (syntaxe `new Function`, ids HTML↔JS, formules numériques, import CSV).

## 12. Confidentialité

Aucune donnée ne transite par un serveur : l'app est un ensemble de fichiers statiques
exécutés localement, et le `localStorage` reste sur la machine du chauffeur. Les exports
(JSON/CSV) sont générés et téléchargés localement, jamais envoyés.
