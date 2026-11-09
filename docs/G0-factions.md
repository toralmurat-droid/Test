# G0 : endgame « Guerre des factions » (document de design)

Statut : **brouillon à valider**. Aucun code. Les noms propres et les chiffres sont des propositions : tout ce qui est marqué
**[À valider]** attend ta décision.

Sommaire :
1. Intention et piliers
2. Déclenchement et accès
3. Géographie : les 3 zones de bordure et les zones disputées
4. Les factions (Oakvale) et la réserve
5. Le conseil des 3
6. Territoire, troupes et ravitaillement
7. Simulation à 2 niveaux
8. Stabilité : rébellions et trahisons
9. Mort, remplacement et arrivée des factions
10. Le héros : statuts, réputation, récompenses
11. Missions (aperçu G3) et évolution des camps (aperçu G4)
12. Architecture technique
13. Paramètres par défaut
14. Critères de réussite du MVP (G1)
15. Risques
16. Sunscar (aperçu G5)
17. Questions ouvertes

---

## 1. Intention et piliers

Une fois la région délivrée, le vide laissé par le Hollow King et la Hide-Mother attire de nouvelles puissances. La région passe
d'une logique de quêtes (on bat des boss une fois) à une logique de **territoire** : ça bouge tous les jours, même sans joueurs.

Piliers :
- **Un monde qui vit sans le joueur.** Les factions sont jouées par des PNJ : elles attaquent, défendent, patrouillent, se
  trahissent. Les joueurs font pencher la balance ; ils ne sont pas indispensables pour que ça bouge.
- **Rien n'est jamais gagné.** Plus une faction grandit, plus elle devient instable (rébellions, trahisons). Une faction peut
  mourir ; une autre peut surgir.
- **Le héros choisit sa place.** Neutre, allié ou mercenaire, et il peut changer d'avis, mais ses choix laissent des traces (réputation).
- **Ancré dans le lore existant.** Chaque faction naît de ce que le joueur a vécu dans l'Acte 1.
- **Simplicité des règles.** Une seule ressource de faction, des règles lisibles (leçon de l'axe 4 : ne pas empiler les jauges).

## 2. Déclenchement et accès

- **Condition par héros** : la même que la porte de l'Acte 2, les deux derniers boss de l'Acte 1 vaincus (Ostrevar, le Hollow King,
  et Grandam Ursk, la Hide-Mother ; `shared/act2.ts` `act2Open`).
- **Le monde de la guerre est partagé par tout le serveur et persistant** (il survit aux redémarrages). Il démarre la première fois
  qu'un héros du serveur remplit la condition. **[À valider]** Autre option : il tourne dès le lancement du serveur, même si
  personne n'a encore délivré la région.
- **Héros qui n'ont pas délivré la région** :
  - les passages vers les 3 zones de bordure leur sont fermés (une sentinelle les refoule, avec une phrase de lore) ;
  - dans les zones disputées (zones de haut niveau, voir §3), les PNJ de faction les **ignorent** : ils ne les attaquent pas et
    ne peuvent pas être attaqués par eux. Les monstres des quêtes restent là et inchangés.
  - Objectif : un héros de niveau 20 qui fait ses quêtes à Greywatch Keep ne se fait pas massacrer par une armée de niveau 40.
- **Les villes restent neutres et sûres** : Oakvale et Kel Ashar ne sont jamais des territoires.

## 3. Géographie

### 3.1 Les 3 zones de bordure

Les zones de haut niveau de l'Acte 1 sont surtout à l'est et au nord-est (Greywatch Keep, Gravemoor, Cinder Scar, Stormbreak Crags,
Rimewater Hollow, Redfang Hollow) et sur la côte sud (Gullrock Cove). Les 3 zones de bordure s'ouvrent donc à leur lisière :

| Zone (nom en jeu proposé) | Où | Accès | Faction de départ |
|---|---|---|---|
| **The Dawnward Marches** (Marches de l'Aube) | Est, au-delà de Cinder Scar et de Stormbreak Crags | Un col dans les falaises de la bordure est | Ordre de l'Aube |
| **The Elderwild** (l'Antique Forêt) | Nord-est, au-delà de Rimewater Hollow et du Thornwood | Une passe gelée au nord de Rimewater | Les Affranchis |
| **The Redtide Isles** (Îles de la Marée Rouge) | Sud, en mer au large de Gullrock Cove | Un bac ou un gué de récifs depuis Gullrock Cove | Le Pacte de la Marée Rouge |

### 3.2 Intégration technique (recommandation)

- **Option recommandée : une nouvelle bande de carte**, comme le Mawdeep et le Sunscar. Une bande de 288 × 80 tuiles sous le désert,
  coupée en 3 zones de 96 × 80 séparées par de la roche. On passe d'une bande à l'autre par des liens, comme les cordes du Mawdeep
  (`shared/dungeon.ts` `LINKS`) ou la porte de l'Acte 2.
  - Avantages : aucune coordonnée existante ne bouge, ni les collisions, ni le chemin le plus court, ni les sauvegardes. La caméra,
    la minicarte et la carte du monde savent déjà se cadrer sur une bande.
  - Coût : +80 lignes de carte en mémoire (le désert en a ajouté 216).
- Option écartée : élargir `MAP_W`. Elle décale tout ce qui est construit sur `MAP_W` (désert compris) et touche beaucoup de code.

```
 Carte actuelle (MAP_W = 288)
 ┌──────────────────────────────┐ ligne 0
 │ Oakvale et sa vallée (Acte 1)│
 ├──────────────────────────────┤ 216
 │ Mawdeep (souterrain) + mer   │
 ├──────────────────────────────┤ 288 … 300 roche
 │ Sunscar (Acte 2)             │
 ├──────────────────────────────┤ 516
 │ Marches │ Elderwild │ Isles  │ ← nouvelle bande (≈ 80 lignes)
 └──────────────────────────────┘
```

### 3.3 Les nœuds de territoire

15 nœuds au total, reliés par un graphe de routes (les armées se déplacent de nœud en nœud) :

- **3 camps principaux**, un par zone de bordure (siège du conseil).
- **6 avant-postes de bordure**, 2 par zone de bordure.
- **6 avant-postes disputés**, un dans chaque zone de haut niveau : Greywatch Keep, Cinder Scar, Stormbreak Crags,
  Rimewater Hollow, Redfang Hollow, Gullrock Cove. Ils sont posés en lisière de la zone : les monstres et les quêtes de la zone
  ne bougent pas.

Graphe des liens entre zones (symétrique : chaque faction a 1 avant-poste disputé « à elle » et 2 partagés) :

```
            Rimewater ─── [Affranchis] ─── Redfang
                              │                │
                         Cinder Scar        (Pacte)
                              │                │
 Greywatch ─── [Ordre] ── Stormbreak ─── [Pacte] ─── Gullrock
```

| Avant-poste disputé | Adjacent à |
|---|---|
| Greywatch Keep | Ordre |
| Cinder Scar | Ordre, Affranchis |
| Stormbreak Crags | Ordre, Pacte |
| Rimewater Hollow | Affranchis |
| Redfang Hollow | Affranchis, Pacte |
| Gullrock Cove | Pacte |

**État initial** : chaque faction tient son camp et ses 2 avant-postes de bordure. Les 6 avant-postes disputés sont **libres**,
tenus par une garnison neutre (bandits, morts, bêtes, selon la zone) qu'il faut vaincre pour les prendre.

## 4. Les factions

Chaque faction naît d'une ligne de quêtes de l'Acte 1. Tous les noms sont **[À valider]**.

### 4.1 L'Ordre de l'Aube (The Dawn Order), à l'est

- **Origine** : les vieux marshals de Greywatch (la marque de flèche des quêtes des morts, `shared/quests.ts`) et la Chapelle de l'Aube
  d'Oakvale. Avec la Couronne tombée, ils veulent rétablir la loi et reprendre les terres du roi.
- **Valeurs** : ordre, foi, protection. Mais aussi rigidité et réquisitions forcées.
- **Style visuel** : acier clair, tabards blanc et or, soleil levant sur les bannières ; palissades de pierre, tours carrées.
- **Troupes** : piquiers, arbalétriers, chapelains (soin). Élément de prédilection : Foi.
- **Camp principal** : *Dawnhold*, un fort de pierre à moitié reconstruit dans les Marches.
- **Conseil** :
  - Marshal **Edric Vane** (Guerre) : vétéran austère, bonus d'attaque.
  - Intendante **Ilsa Brook** (Intendance) : bonus de ravitaillement.
  - Mère **Aldith**, chapelaine de l'Aube (Foi) : bonus de stabilité.

### 4.2 Les Affranchis (The Unbound), au nord-est

- **Origine** : le peuple-bête libéré à la mort de la Hide-Mother (des gens cousus dans des peaux, `shared/dungeon.ts`), recueilli
  par des druides proches d'Elder Rowan et par les trappeurs du Hunter's Camp. Ils veulent un pays à eux, loin des villages qui les
  craignent.
- **Valeurs** : liberté, nature, mémoire de la souffrance. Mais aussi rancune et sauvagerie.
- **Style visuel** : bois brut, os, peaux peintes, totems d'animaux ; huttes rondes, enclos, feux de camp.
- **Troupes** : brutes à défenses (de type tuskborn), traqueurs, voyants-corbeaux. Élément de prédilection : Poison.
- **Camp principal** : *The Antler Moot*, une clairière ceinte de bois de cerfs géants dans l'Elderwild.
- **Conseil** :
  - **Brakka Défense-Libre** (Guerre) : ancien tuskborn, bonus de troupes.
  - **Corin Lacet**, chef trappeur (Intendance) : bonus de ravitaillement.
  - **Yarrow**, druide (Foi/nature) : bonus de stabilité.

### 4.3 Le Pacte de la Marée Rouge (The Redtide Compact), au sud

- **Origine** : les restes des Redfang après la mort de leur chef et de Rask, alliés aux contrebandiers du Smugglers' Path et à une
  partie des pêcheurs de Saltmere lassés d'attendre la garde d'Oakvale.
- **Valeurs** : liberté du commerce, loyauté au clan. Mais aussi pillage et argent avant tout.
- **Style visuel** : chiffons rouges, voiles rapiécées, cordages ; pontons, carcasses de bateaux, phares de fortune.
- **Troupes** : coupe-jarrets, harponneurs, sorcières des mouettes. Élément de prédilection : Froid (embruns).
- **Camp principal** : *Redtide Harbour*, un port de fortune construit sur des épaves.
- **Conseil** :
  - **Brynja Rask**, sœur de Rask le Reaver (Guerre) : bonus d'attaque, rancune envers les héros.
  - **Silas Fût**, courtier contrebandier (Intendance) : bonus de ravitaillement.
  - **Nessa des Mouettes**, sorcière de la marée (Mystique) : bonus de stabilité.

### 4.4 La réserve (factions qui peuvent surgir)

Utilisée quand une faction disparaît (§9). Chacune naît d'un fil de lore laissé ouvert :

| Faction de réserve | Origine | Style |
|---|---|---|
| **Les Fidèles de la Couronne** (The Crownsworn) | Le culte d'Ostrevar, les porteurs du sceau à la couronne (la quête « The Crowned Seal ») | Noir et or terni, morts-vivants mêlés de vivants |
| **Les Compagnies Franches** (The Free Companies) | Des mercenaires venus d'au-delà des montagnes, attirés par la guerre | Bannières multicolores, chariots, tentes |
| **Les Enfants du Gloam** (The Gloamborn) | Un fragment du Gloam qui a appris à penser ; une faction non humaine | Gelée, cristaux élémentaires, nids |

Une faction morte rejoint aussi la réserve : elle peut revenir plus tard avec un nouveau conseil.

## 5. Le conseil des 3

- Chaque faction a 3 sièges : **Guerre**, **Intendance**, **Foi/Mystique**. Chaque conseiller vivant donne un bonus à sa faction
  (attaque, ravitaillement, stabilité). Un siège vide fait perdre ce bonus.
- Les conseillers ont une **personnalité** qui oriente l'IA de la faction : un conseil où domine la Guerre attaque plus souvent ;
  un conseil où domine l'Intendance fortifie et commerce.
- **Où ils sont** : dans le donjon du camp principal, protégés par une garde d'élite.

### 5.1 Vulnérabilité sous conditions (décision validée)

Un conseiller **ne peut être tué** que dans l'une de ces situations :

1. **Camp principal assiégé** : les défenses sont percées (porte brisée par un siège, voir §11) et la garnison est sous 30 %.
   Les 3 conseillers sont alors vulnérables tant que le siège dure.
2. **Infiltration réussie** : une mission d'infiltration ouvre une **fenêtre de 10 minutes** sur **un seul** conseiller, nommé par
   la mission (assassinat).
3. **Conseiller en campagne** : de temps en temps, le conseiller de la Guerre mène lui-même une armée (annoncé dans le fil
   d'actualité du serveur). Il est vulnérable tant qu'il est hors du camp.
4. **Camp principal perdu** : le conseil se replie dans l'avant-poste le plus fort de la faction, qui n'est pas fortifié. Il est
   vulnérable en permanence tant que la faction n'a pas repris un camp.

Garde-fous :
- **Protection de naissance** : une faction est intouchable (conseil invulnérable, camp non assiégeable) pendant **24 h** après son
  apparition.
- **Remplacement** : un conseiller mort est remplacé au bout de **6 h** (nouveau PNJ, nouveau nom), **seulement si la faction tient
  son camp principal**.
- **Mort de la faction** : les **3 sièges vides en même temps**.

## 6. Territoire, troupes et ravitaillement

- **Une seule ressource : le Ravitaillement.** Chaque nœud tenu en produit (camp principal > avant-poste de bordure > avant-poste
  disputé, qui rapporte plus mais est exposé).
- Le Ravitaillement sert à **recruter des troupes** et, en G4, à **améliorer les camps**.
- **Troupes** : des effectifs abstraits par nœud (garnison) et par armée en mouvement, en 3 rangs :

| Rang | Niveau | Coût | Débloqué par |
|---|---|---|---|
| Recrue | 30 | 1 | — |
| Vétéran | 40 | 3 | Caserne niveau 2 (G4) ou entraînement par un héros (G3) |
| Élite | 50 | 8 | Caserne niveau 3 (G4) |

- **Patrouilles** : les factions patrouillent sur les routes entre leurs nœuds. Les patrouilles ne prennent corps que près d'un
  héros (§7).
- **Ravitaillement coupé** : un nœud qui n'est plus relié au camp principal par une chaîne de nœuds amis produit moitié moins
  (encourage les attaques de flanc et les embuscades).

## 7. Simulation à 2 niveaux

Simuler des centaines de PNJ 20 fois par seconde n'est pas tenable. La guerre tourne sur 2 niveaux :

### 7.1 Niveau stratégique (toutes les 2 minutes, sur le serveur, même sans joueurs)

À chaque tour, dans l'ordre :
1. **Production** de Ravitaillement par nœud.
2. **Recrutement** selon la personnalité du conseil et le Ravitaillement.
3. **Décisions de l'IA** : renforcer un nœud menacé, attaquer le nœud adjacent le plus faible, se replier.
4. **Mouvements d'armées** le long du graphe (1 lien par tour ou plus, selon la distance).
5. **Combats loin des joueurs résolus automatiquement** : formule effectifs × rang × bonus (défense du nœud, conseil), avec une
   part de hasard. Pertes des deux côtés ; le nœud change de main si l'attaquant l'emporte.
6. **Stabilité, rébellions, trahisons** (§8).
7. **Événements** : remplacement de conseillers, protection de naissance, arrivée d'une faction (§9).
8. **Sauvegarde** de l'état.

### 7.2 Niveau tactique (le moteur actuel, 20 fois par seconde)

- Quand un héros débloqué s'approche d'un nœud, d'une route patrouillée ou d'une armée en mouvement, le serveur **fait apparaître
  les vrais PNJ** (des `Mob` avec une faction), avec un plafond par zone.
- Le combat se joue alors en temps réel (poise, exécution, réactions élémentaires…). Quand le héros s'en va ou que le combat se
  termine, le résultat (pertes, prise du nœud) est **réécrit dans l'état stratégique**.
- Un combat en cours avec un joueur n'est jamais résolu automatiquement en même temps.

### 7.3 Prise d'un nœud (assaut frontal, G1)

- Vaincre la garnison présente, puis **tenir une zone de capture** (un drapeau) pendant 60 s sans ennemi dedans.
- Les PNJ de la faction du héros (s'il est allié) arrivent en renfort si une armée amie est à 1 lien.
- Les camps principaux ne se prennent pas par assaut simple : il faut d'abord un siège (G3).

## 8. Stabilité : rébellions et trahisons

Chaque faction a une **Stabilité** de 0 à 100, recalculée à chaque tour :

```
Stabilité = 60
          − 8 × (nœuds tenus − taille idéale)           taille idéale = nœuds totaux ÷ factions vivantes
          − 5 × nœuds coupés du camp principal
          − pertes récentes (dernières 6 h, plafonné à −20)
          + 10 × conseillers vivants (au plus +30)
          + 0,5 × garnison moyenne en %  (au plus +15)
          + bonus Foi/Mystique du conseil
          (borné entre 0 et 100)
```

Effets :

| Stabilité | Effet par tour |
|---|---|
| ≥ 50 | Rien |
| 30-49 | Chance faible de **rébellion** : l'avant-poste le moins gardé devient un nœud **rebelle** (hostile à tous, à reprendre) |
| < 30 | Chance de **trahison** : un avant-poste ou une armée passe à une faction adjacente, de préférence **la plus petite** |
| < 15 | Rébellions et trahisons plus fréquentes ; un conseiller peut **déserter** (son siège se vide) |

- La taille idéale augmente quand des factions meurent : une faction seule n'est pas punie pour exister, mais elle reste punie si
  elle s'étend trop vite ou garde mal.
- **Effet recherché** : une faction qui gagne trop ralentit toute seule, et les plus petites récupèrent des forces. Pas besoin de
  joueurs pour l'équilibre.
- **Les rebelles comme graine** : un nœud rebelle tenu plus de 24 h peut devenir le point d'apparition d'une nouvelle faction (§9).

## 9. Mort, remplacement et arrivée des factions

- **Mort** : les 3 sièges du conseil sont vides en même temps.
  - Ses garnisons et armées : **50 % meurent**, **50 % rejoignent** une faction adjacente (de préférence celle qui a la meilleure
    réputation locale ou la plus petite taille).
  - Ses nœuds sans troupes deviennent **libres** (garnison neutre légère).
  - Annonce dans le fil d'actualité du serveur. La faction rejoint la réserve.
- **Arrivée** : quand il y a moins de 3 factions vivantes, après un délai aléatoire (**12 à 48 h**), une faction de la réserve
  (nouvelle ou ancienne) apparaît :
  - soit dans un **nœud rebelle** tenu depuis longtemps (les rebelles se donnent un conseil) ;
  - soit dans un **camp principal libre** ;
  - avec une garnison de départ, 24 h de protection de naissance et un nouveau conseil.
- **Jamais 0 faction** : si une seule faction reste, sa stabilité chute (taille idéale = 15, mais garnisons trop minces) et
  l'arrivée d'une faction est garantie au bout de 12 h.

## 10. Le héros

### 10.1 Statuts (le héros choisit quand c'est nécessaire)

| Statut | Ce qu'il peut faire | Relation avec les factions |
|---|---|---|
| **Neutre** (par défaut) | Commercer dans tous les camps (prix majorés), traverser les territoires | Les PNJ ne l'attaquent pas, sauf s'il attaque ou si sa réputation est Hostile |
| **Allié** d'une faction | Missions de faction, rang, vendeur de faction, entraînement de troupes, renforts PNJ en assaut | Les ennemis de la faction l'attaquent à vue |
| **Mercenaire** | Contrats de n'importe quelle faction contre de l'or (tableau de contrats dans chaque camp) | Pas de rang ni de troupes ; la faction visée par un contrat perd de la réputation envers lui |

- **Le choix est demandé au moment où il compte** : en entrant pour la première fois dans une zone de bordure, ou en parlant à un
  recruteur, ou en prenant un premier contrat.
- **Changer** : quitter une faction coûte −30 de réputation avec elle, puis **24 h d'attente** avant d'en rejoindre une autre.
  Rejoindre directement un ennemi déclaré met la réputation avec l'ancienne faction à −60 (trahison).

### 10.2 Réputation (par faction, de −100 à +100)

| Palier | Seuil | Effet |
|---|---|---|
| Hostile | ≤ −50 | Attaqué à vue, même neutre |
| Méfiant | −49 à −1 | Prix majorés, pas de missions |
| Neutre | 0 à 24 | Commerce |
| Ami | ≥ 25 | Peut rejoindre la faction |
| Honoré | ≥ 60 | Rang de Capitaine accessible, objets de faction |
| Exalté | ≥ 90 | Rang de Champion, objets uniques |

- **Rangs d'allié** : Recrue → Sergent → Capitaine → Champion, selon la réputation et les missions faites. Le rang débloque le
  nombre de soldats qu'il peut entraîner et emmener (G3).

### 10.3 Récompenses

- **Insignes de faction** (une monnaie par faction), gagnés en missions et en prises de nœuds. Ils s'échangent au vendeur de
  faction : équipement au style de la faction, cosmétiques (cape, bannière, teinture), runes.
- **Or** pour les mercenaires.
- **Récompense souvenir** quand la faction d'un allié meurt (décision validée) : le héros redevient neutre et reçoit un **titre**
  (« Dernier de l'Ordre de l'Aube »), la **bannière** de la faction en cosmétique, et un **objet souvenir** dont la qualité dépend
  de son rang. **[À valider]** le contenu exact.
- **Dépenses d'or** : dons au camp, entraînement de troupes, améliorations (G4). Ça rejoint l'économie du lot A.

## 11. Missions (aperçu G3) et évolution des camps (aperçu G4)

Détaillés plus tard ; ici, seulement le principe et ce qu'on réutilise.

| Mission | Principe | Effet stratégique | Réutilise |
|---|---|---|---|
| Assaut frontal | Prendre un nœud (G1) | Le nœud change de main | — |
| Siège | Construire et escorter un engin jusqu'à la porte d'un camp, le défendre pendant qu'il frappe | Ouvre la prise des camps principaux et la vulnérabilité du conseil | Engins de `shared/siege.ts` |
| Embuscade | Intercepter un convoi de ravitaillement sur une route | −Ravitaillement ennemi, +Insignes | Patrouilles, routes |
| Escorte | Protéger un convoi ami | +Ravitaillement | Comportement de suivi des invocations |
| Infiltration | Entrer dans un camp sans être vu, saboter (grenier, porte) ou ouvrir la fenêtre d'assassinat d'un conseiller | Sabotage ou fenêtre de 10 min | Héros cachés derrière arbres et buissons (`client/src/ambient.ts`) |
| Entraînement de troupes | Dépenser Ravitaillement et or à la caserne, ou mener des recrues au combat pour qu'elles passent Vétéran | +troupes de rang supérieur ; escouade qui suit le héros | Règles de suivi et combat de `shared/summons.ts` |

**Évolution des camps (G4)** : bâtiments améliorables (Palissade → Mur, Caserne, Grenier, Tour de guet, Forge, Sanctuaire), avec
un effet chacun (défense, rang des troupes, production, vision, équipement, stabilité) et un visuel qui change sur la carte.

## 12. Architecture technique

| Élément | Fichier proposé | Rôle |
|---|---|---|
| Données | `shared/war/factions.ts` | Factions, conseils, réserve, styles |
| Graphe | `shared/war/nodes.ts` | Nœuds, liens, zones |
| Règles pures | `shared/war/rules.ts` | Stabilité, combat automatique, production, réputation : fonctions pures, testables |
| Simulation | `server/war.ts` | Tour stratégique, IA des factions, sauvegarde |
| Pont tactique | `server/TownRoom.ts` (ou un module à part, vu la taille du fichier) | Apparition des PNJ près des héros, réécriture des résultats |
| Persistance | `data/war.json`, ou PostgreSQL si `DATABASE_URL` est défini | Même mécanisme que `server/store.ts` |
| Carte | `shared/war/borderlands.ts` + `shared/map.ts` | La nouvelle bande et ses 3 zones |
| Client | `client/src/war*.ts` | Couleurs des territoires sur la carte, panneau de faction, réputation, bannières |
| Outil | `tools/war/sim.ts` | Faire tourner la guerre en accéléré sans joueurs, sortir un historique |

Points d'attention :
- Le schéma `Player` est à la limite des 64 champs synchronisés. Le statut et la réputation passent soit dans un champ compacté,
  soit par des messages à la demande (comme le reste de l'état d'un héros qui n'a pas besoin d'être vu par les autres).
- Le schéma `Mob` (~24 champs) a la place pour un champ `faction`.
- `server/TownRoom.ts` fait déjà 5 683 lignes : la guerre doit vivre dans ses propres modules.

## 13. Paramètres par défaut

Tous réglables, en temps réel du serveur.

| Paramètre | Défaut |
|---|---|
| Tour stratégique | 2 min |
| Protection de naissance d'une faction | 24 h |
| Remplacement d'un conseiller | 6 h (si le camp principal est tenu) |
| Fenêtre d'assassinat après infiltration | 10 min |
| Capture d'un nœud | 60 s dans la zone sans ennemi |
| Délai avant l'arrivée d'une faction | 12-48 h (12 h garanties s'il n'en reste qu'une) |
| Nœud rebelle qui peut devenir une faction | Tenu ≥ 24 h |
| Attente avant de rejoindre une autre faction | 24 h |
| Niveaux des troupes | 30 / 40 / 50 |
| Plafond de PNJ de faction en jeu par zone | À mesurer (benchmark `tools/perf`) |

## 14. Critères de réussite du MVP (G1)

Mesurés avec `tools/war/sim.ts`, sur 48 h simulées **sans joueur** :
- Au moins 1 changement de main de nœud toutes les 6 h en moyenne.
- Aucune faction ne meurt dans les 24 premières heures.
- Aucune faction ne tient plus de 60 % des nœuds pendant plus de 12 h d'affilée.
- La stabilité de chaque faction varie (elle ne reste pas collée à 0 ou 100).

Et en jeu, avec 1 à 3 joueurs : prendre un avant-poste en 5-10 minutes, et voir la carte changer d'un jour à l'autre.

## 15. Risques

| Risque | Parade prévue |
|---|---|
| Un joueur seul fait mourir une faction | Conseil vulnérable seulement sous conditions, protection de naissance, remplacement des conseillers |
| Tout le monde rejoint la faction gagnante | Stabilité qui punit la taille, trahisons vers les plus petites, Insignes majorés pour la faction en retard **[À valider]** |
| Charge serveur | Simulation à 2 niveaux, PNJ réels seulement près des héros, plafond par zone |
| Faible population | Les factions PNJ jouent seules ; les critères G1 se mesurent sans joueur |
| Héros non débloqués malmenés | PNJ de faction neutres envers eux, accès aux zones de bordure fermé |
| Taille du projet | Découpage G1 → G5, chaque phase jouable seule |
| Persistance corrompue | Sauvegarde à chaque tour, versionnée, vérifiée au chargement (comme les sauvegardes des héros) |

## 16. Sunscar (aperçu G5)

Même moteur, factions du désert. Propositions **[À valider]** :
- **Les Dustriders** (nomades pillards, la quête « Dustrider Silver ») ;
- **Les Clans des Mesas** (le peuple-chameau, lents à la colère, « n'oublient jamais une dette ») ;
- **Les Porteurs d'Eau** (la guilde des gardiens de puits de Kel Ashar, autour de Sefa ; Kel Ashar elle-même reste neutre) ;
- Réserve : **les Disciples du Second Soleil** (ce qui reste du Cercle Voilé après Ishael), **les Morts de Kharsun**.

## 17. Questions ouvertes

1. **Démarrage du monde** (§2) : au premier héros qui délivre la région, ou dès le lancement du serveur ?
2. **« S'allier »** : je l'ai compris comme « rejoindre une faction ». Voulais-tu aussi des **alliances entre factions** (pactes
   temporaires décidés par l'IA, par exemple deux petites factions contre la plus grande) ?
3. **PvP entre héros de factions rivales** : l'axe 3 est hors scope, donc le MVP ne donne **aucune** récompense pour tuer un héros
   d'une faction ennemie. OK, ou tu veux un gain de réputation ?
4. **Bonus pour la faction en retard** (§15) : Insignes majorés pour les alliés de la plus petite faction, oui ou non ?
5. **Récompense souvenir** (§10.3) : titre + bannière + objet selon le rang, ça te va ?
6. **Noms et lore** des 3 factions, des conseils et de la réserve : à garder, modifier, remplacer ?
7. **Échelle de temps** : les durées en heures réelles (§13) te semblent-elles adaptées au rythme de connexion de tes joueurs ?
