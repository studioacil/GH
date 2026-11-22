# Sons de l'app (set SoundCloud « UBER Drivers App » de CMoore Sound + MyInstants)

Les fichiers présents dans ce dossier sont servis tels quels par `server.rb`
(extensions acceptées : .mp3, .ogg, .wav, .m4a — voir `SOUND_EXTS` dans `app.js`).
Si un fichier manque, l'app retombe sur le bip synthétique (WebAudio).

| Fichier | Source | Déclencheur dans l'app |
|---|---|---|
| `son-start.mp3` | SoundCloud set CMoore Sound — « UBER ACCEPT » (424306074) | lancement du chrono |
| `son-phase.m4a` | SoundCloud set — « UBER DRIVER DISPATCH » (499012374, HLS-only → segments concaténés en fMP4) | transition de phase (approche → en course, arrivé au resto, départ…) |
| `son-double.mp3` | SoundCloud set — « UBER STARS » (424306173) | entrée en zone diamant |
| `son-etoile.mp3` | SoundCloud set — « UBER STARS » (424306173) | entrée en zone étoile |
| `son-verte.mp3` | SoundCloud set — « UBER ONLINE » (424306206) | entrée en zone verte |
| `son-rouge.mp3` | MyInstants — « uber-driver-order-cancelled-45970 » | entrée en zone rouge |
| `son-noire.mp3` | MyInstants — « klaxon-alarm-54254 » (klaxon d'alarme) | entrée en zone noire (×2 + vibration, répété toutes les 30 s) |
| `son-stop.mp3` | SoundCloud set — « UBER OFFLINE » (424306185) | « Terminer & enregistrer » (arrêt du chrono) |

Set de référence : https://soundcloud.com/cmooresound/sets/uber-drivers-app
(9 morceaux : DRIVER DISPATCH, ACCEPT, START TRIP, ONLINE, OFFLINE, STARS, ARRIVED, REROUTE, NEW CARD).
