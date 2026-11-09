# Plan d'évolution : difficulté, ressources, nouvelles mécaniques, endgame

Statut : **en revue**. Rien n'est implémenté. Chaque lot attend un feu vert explicite avant de commencer.

Origine : revue game design de novembre 2026 (analyse du code + simulateurs `tools/balance/duel.ts` et `tools/balance/pve.ts`).
Constat principal : PvE trivial (≈ 100 % de zones réussies, Summoner à 0 % de PV perdus, boss gagnés à 100 % en solo, simulation
qui sous-estime encore la difficulté faute de monstres invoqués) et aucune boucle de fin de jeu après le Sunwright (Lv 50).

## Décisions validées

| Sujet | Décision |
|---|---|
| Axe 3 (PvP : protection, équilibre des classes) | **Hors scope** |
| Cibles de difficulté | Zone : 10-20 % de PV perdus par combat ; boss solo premier essai 50-70 %, build optimisé 85-95 % ; écart entre classes ≤ 10 points |
| Potions | **Temps de recharge** (soin et mana, même règle) |
| Esquive | **Reste en Heat** |
| Usure de l'équipement | **Conservée** |
| Exécution | **Monstres seulement** |
| Réactions élémentaires en solo | **30 %** de l'effet ; les golems du Summoner comptent comme leur maître (pas comme un autre héros) |
| Réactions élémentaires en PvP | **Non** |
| Sprites des champions | **(a) + (b)** : teinte, aura et icône + un détail peint par affixe |
| Fusion de runes | 4 identiques → 1 du rang supérieur, **coût en or**, **pas de fusion mixte** |
| Endgame | Voir `docs/G0-factions.md` |
| Conseil d'une faction | Vulnérable **seulement sous conditions** |
| Lieu de la guerre | **3 nouvelles zones + zones de haut niveau** |
| Allié dont la faction meurt | Redevient **neutre** + **récompense souvenir** |
| Livraison | **Une PR par lot** |

## Ordre des lots

| Lot | Contenu | Taille | Dépend de |
|---|---|---|---|
| A | Difficulté PvE | M | — |
| B | Ressources (une seule par compétence) | S | A |
| C | Fusion de runes | S | — |
| D | Exécution après poise brisé | M | A |
| E | Réactions élémentaires | M/L | A |
| F | Champions avec affixes | L | A, E |
| G | Endgame des factions (G0 → G5) | XL | A à F |

À la fin de chaque lot : tests (`npm test`), simulateur, rapport avant/après, validation, puis PR.

---

## Lot A : difficulté PvE

1. **Simulateur fiable** (`tools/balance/pve.ts`) : ajouter les monstres invoqués en combat de boss (squelettes du Necromancer,
   renforts du Chief, serviteurs du King), le temps de recharge des potions, et les mesures morts/heure, potions/heure,
   part des dégâts évitables.
2. **Cibles** : celles du tableau ci-dessus, codées comme seuils dans le simulateur.
3. **Leviers, dans l'ordre** :
   - temps de recharge des potions de soin (point de départ : 8 s, affiné par simulation ; `shared/potions.ts`) ;
   - courbe de dégâts des monstres par niveau, pas leurs PV (`shared/constants.ts` `MOBS`) ;
   - 1 à 2 attaques annoncées par boss qu'il faut esquiver (40-60 % des PV si on reste dedans) ;
   - Summoner : Stone Bond et priorité des monstres sur les golems (`shared/summons.ts`) ;
   - meutes mixtes (mêlée, tir, soin) dans les zones.
4. **Test en CI** : `pve.ts` en mode réduit, échec si une cible sort de sa fourchette.
5. **Rapport avant/après**, puis session de test humaine.

## Lot B : ressources

- Les 11 compétences qui coûtent Heat **et** Mana (`shared/skills.ts`) passent à une seule ressource : physique → Heat, sort → Mana.
  Tableau avant/après soumis à validation avant toute modification.
- Jauge de Mana cachée pour les classes qui n'en utilisent jamais ; la Heat reste visible pour tous (esquive).
- Temps de recharge des potions harmonisé avec le lot A.
- Infobulles, aide en jeu, README.

## Lot C : fusion de runes

- 4 runes identiques (même type, même rang) → 1 rune du rang au-dessus ; le rang 3 est le maximum (`shared/runes.ts`).
- Coût proposé : **100 or** (rang 1 → 2) et **400 or** (rang 2 → 3). Repères : revente 40 / 120 / 300 (`shared/shops.ts` `RUNE_PRICE`).
- Serveur : distance au PNJ, or, runes présentes, place dans le sac ; opération atomique, sans duplication possible (même approche que `shared/trade.ts`).
- Interface : onglet « Fusion » chez le PNJ qui rachète les runes.
- Tests : fusion valide, compte insuffisant, rang 3, or insuffisant, sac plein.

## Lot D : exécution (monstres seulement)

- Pendant l'étourdissement d'un monstre (poise à 0, `shared/combat.ts`), le premier coup d'un héros fait ×2 dégâts (sans critique
  cumulé) et rend 30 % de Heat ou 10 % de Mana. Contre un boss : ×1,5.
- Une seule exécution par étourdissement. Jamais contre un héros.
- Client : marqueur au-dessus de la cible, effet visuel et son distincts.
- Mesure de l'effet sur la durée des combats dans le simulateur.

## Lot E : réactions élémentaires (monstres seulement)

- Un coup élémentaire pose une marque de 4 s (élément + héros qui l'a posée) ; un coup d'un autre élément déclenche la réaction.
- Marque d'un autre héros : 100 %. Même héros (golems du Summoner compris) : 30 %.
- Réactions proposées :

| Marque + coup | Réaction | Effet |
|---|---|---|
| Froid + Choc | Fracture | +40 % sur ce coup, gros dégâts de poise |
| Feu + Poison | Explosion toxique | Dégâts de zone autour de la cible |
| Feu + Froid | Vapeur | La cible rate 30 % de ses attaques pendant 3 s |
| Choc + Poison | Corrosion | -25 % de résistances pendant 5 s |
| Foi + Feu | Purification | ×2 contre morts-vivants et démons, petit soin de groupe |

- Le schéma `Mob` (~24 champs synchronisés, limite 64) a la place pour la marque.

## Lot F : champions avec affixes

- ≈ 5 % des monstres d'une zone ; 1 à 2 affixes ; 2,5× PV ; nom propre ; rune garantie.
- Affixes tirés du lore de chaque famille ennemie :

| Famille | Affixe | Effet | Lien avec le lore |
|---|---|---|---|
| Le Gloam (blobs) | Scissipare | Se divise en 2 à 50 % de PV | La Mother Blob |
| Le Gloam | Contaminé | Laisse une flaque de son élément | Les blobs élémentaires |
| Morts du Nécromancien | Ouvrier de siège | Pose une baliste qui tire | Les chantiers (`shared/siege.ts`) |
| Morts du Nécromancien | Relevé | Se relève une fois à 30 % | La magie du Nécromancien |
| Peuple-bête (Mawdeep) | Cousu de peaux | Change de forme à 50 % (plus rapide) | Le rite de la Hide-Mother |
| Bandits Redfang | Chef de bande | Appelle 2 coupe-jarrets | Le Chief et ses renforts |
| Cercle Voilé (désert) | Solaire | Aura qui brûle et fait monter la Heat | Le second soleil |
| Morts de Kharsun | Ensablé | S'enterre puis surgit | La cité ensevelie |

- Sprites : (a) teinte de famille, aura, icône d'affixe ; (b) un détail peint par affixe dans `tools/art/paint/mobs.ts`.
  Planche d'aperçu validée **avant** branchement en jeu.

## Lot G : endgame des factions

Document de design : **`docs/G0-factions.md`**. Phases :

- **G0** : document de design (ce dépôt), à valider.
- **G1** : MVP Oakvale (3 factions et conseils, prise d'avant-poste par assaut, PNJ autonomes, simulation à 2 niveaux, statuts du héros, réputation).
- **G2** : stabilité, rébellions, trahisons, mort et arrivée de factions.
- **G3** : missions (siège, embuscade, infiltration/assassinat, entraînement de troupes, escorte).
- **G4** : évolution des camps.
- **G5** : extension au Sunscar.

Les phases G1 et suivantes sont planifiées en détail seulement après validation de G0.
