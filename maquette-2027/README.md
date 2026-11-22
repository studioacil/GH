# GH — Maquette 2027 « Nebula Glass » (prototype, non déployée)

Ouvre : http://localhost:8471/maquette-2027/

## La vision
Partir d'une feuille blanche, penser « app native 2027 sur iPhone 18 Pro » :
pas un site web sombre, mais une **expérience plein écran, glassmorphism, halo vivant**.

## Design system
- **Fond** : noir profond + **halo ambiant animé** (3 dégradés radiaux floutés) dont la
  couleur = la **zone en cours** (bleu 💠 double étoile → or → vert → rouge → charbon).
  Pendant le chrono, toute la page "respire" la couleur de ta zone.
- **Verre** : cartes `backdrop-filter: blur(22px) saturate(1.4)`, bordure hairline,
  ombre douce + reflet interne (inset highlight).
- **Typographie** : SF Pro (system), chiffres **tabulaires** partout (prix, chrono, taux).
- **Rayons** : 26 px cartes, pilules 999 px.
- **Ressort** : animations `cubic-bezier(.34,1.56,.64,1)` (spring iOS), press `scale(.965)`.
- **Safe areas** : `env(safe-area-inset-*)` partout (Dynamic Island + home indicator).
- **Tab bar flottante** en bas, style iOS (blur, pilule centrale), au lieu des onglets en haut.

## Parcours
1. **Course** : le prix saisi devient un **chiffre hero géant** centré ; en dessous, les
   5 pilules de temps de zone (💠⭐🟢🟥⬛) ; en bas, 2 gros CTA pilule **Uber (noir glossy)** /
   **Bolt (vert)**.
2. **Chrono** : **anneau de progression** façon app Activité — 5 arcs colorés (du meilleur
   au pire), la partie parcourue s'illumine en vif, le reste reste atténué. Au centre :
   horloge géante + pastille de zone. Sous : statut « passage en 🟥 dans 12:03 » + chips
   des phases (🚶 approche / 🚗 course). Boutons phase, Terminer, Annuler en pilules.
   Toggle « démo ×60 » pour voir l'anneau avancer vite.
3. **Historique** : select verre des périodes (emoji zone + encaissé entre parenthèses),
   boutons de zones 💠⭐🟢🟥⬛, carte récap (pastille géante + taux moyen + encaissé/garanti),
   état des lieux, liste de courses en cartes verre avec liseré de zone.
4. **Réglages** : champs verre + sélecteurs segmentés (mode, plateforme).

## Différences clés vs l'app actuelle
- Tab bar en bas (pouce) au lieu d'onglets hauts.
- Anneau à la place de la barre horizontale.
- Halo ambiant contextuel (couleur de zone).
- Hero prix géant, CTA plateforme glossy.
- Cartes verre partout, toast pilule au-dessus du home indicator.

## À décider avant déploiement
- Garder le mode sombre uniquement, ou ajouter un thème clair ?
- L'anneau remplace-t-il la barre, ou les deux (barre en détail) ?
- Les CTA plateforme : un seul gros bouton qui reprend la plateforme par défaut + appui long
  pour changer, ou toujours 2 boutons ?
- Conserver le sélecteur de périodes tel quel, ou en bottom sheet ?

## Mode démo (ajouté)

- **Démo ×10** : case « démo ×10 » dans l'en-tête des écrans Course et Chrono (synchronisée),
  badge « démo ×10 » à côté du logo GH quand actif. Le chrono avance alors **10× plus vite**
  (6 s réelles = 1 min de chrono) pour voir les changements de zone rapidement.
- **Import CSV Uber fonctionnel** (bouton « Import CSV Uber » dans l'historique) :
  séparateur auto (tab/;/,), guillemets gérés, prix = `original_fare_local − |service_fee_local|`,
  phases Approche/Course depuis les timestamps, `status=completed` uniquement,
  dédup via `driver_trip_number`, **rien avant le 01/01/2020**.
- **Export JSON / Export CSV** et bouton **« Données de démo »** pour restaurer les
  courses factices (tout est en mémoire, rien n'est persisté).
