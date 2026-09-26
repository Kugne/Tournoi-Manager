# Audit de Tournoi Manager — 17 septembre 2026

## Conclusion

La version fournie contient les correctifs de notre séance du 7 septembre : son contenu est identique au HTML corrigé v3 archivé. Le SOS d’appariement est à ×1, le zéro est accepté dans le barème de création, les contrôles de note libre ont été synchronisés et les échecs de sauvegarde ordinaires sont signalés.

Les priorités proposées sont **l’intégrité des données et des résultats**, puis les imports et les messages de confirmation. Améliorer l’optimisation du suisse vient ensuite : le moteur actuel est perfectible, mais les défauts ci-dessous peuvent produire un classement incorrect ou compromettre une sauvegarde sans changer de moteur.

L’application analysée n’a pas été modifiée. Aucun test n’a utilisé le stockage réel du navigateur ni des données de tournoi de l’utilisateur.

## Périmètre et méthode

- Source : `../Tournoi-manager-V1.9.32-A jour.html`, 241 631 octets, fichier unique mêlant styles, écrans, état et logique métier.
- Lecture des chemins principaux : initialisation, sauvegarde/undo/snapshots, imports, joueurs et statuts, classement, appariements, validation, bracket/hybride et rendu des données.
- Revue indépendante ciblée du moteur par un agent code-reviewer, en lecture seule.
- Compilation du script JavaScript avec Node ; chargement du script de l’application dans des contextes VM avec interface et stockage simulés ; reproductions ciblées.
- Script rejouable : `../work/audit-code.cjs`. Résultats : `../work/audit-resultats.json`. Commande depuis le dossier projet : `node work/audit-code.cjs`.
- 13 vérifications réussies, comprenant deux contrôles positifs (syntaxe et identité avec la v3) et onze reproductions de défauts/cas limites. Les alertes, éléments du DOM et confirmations sont simulés ; ce n’est pas une campagne navigateur complète.

**Limite de validation de l’application :** l’ouverture du fichier `file://` a été refusée par la politique de sécurité de l’outil navigateur. Aucun contournement tenté. L’apparence réelle, le confort mobile, les téléchargements, les impressions/PDF, le timer audio et les parcours clavier n’ont donc pas été vérifiés visuellement ou en navigateur. Ce rapport constitue un audit du code et des comportements reproduits, pas une certification de tous les écrans et formats.

Les lignes indiquées ci-dessous concernent exactement le HTML fourni. P1 = à corriger en priorité ; P2 = correction importante ou fiabilisation ; P3 = amélioration de confort.

## Problèmes confirmés

### 1. P1 — Une ronde peut attribuer un bye et un match au même joueur

**Déclencheur :** ronde de trois joueurs ; dans l’édition des appariements, sélectionner A pour le bye et A–B pour la partie. L’enregistrement est accepté ; C n’est plus appairé.

**Cause :** `savePairingEdits`, lignes 3467–3475, ignore les byes et ignore aussi les matchs impliquant un bénéficiaire de bye lors du comptage des doublons. Le calcul du classement peut ensuite donner à A les points du bye et ceux de sa partie dans une seule ronde.

**Correction proposée :** compter tous les emplacements de joueur, bye compris. Si le bye joué est une fonctionnalité voulue, le représenter explicitement avec un adversaire de secours et une seule attribution de points, plutôt que deux rencontres ordinaires. Vérifier aussi que chaque joueur attendu figure exactement une fois.

**Preuve :** reproduction acceptée : bye A + match A–B.

### 2. P1 — Supprimer un joueur retire des résultats déjà acquis à son adversaire

**Déclencheur :** A gagne contre B dans une ronde validée. Repasser le tournoi en attente, puis supprimer B. A passe de **3 points et 4 points de scénario à 0 et 0** dans le test.

**Cause :** `deletePlayer`, ligne 1615, efface physiquement B ; `getStandings`, ligne 1700, ignore une rencontre si l’un des joueurs n’existe plus. `resetTournamentToWaiting`, ligne 3669, conserve les rondes tout en réautorisant l’édition/suppression.

**Correction proposée :** interdire la suppression physique d’un joueur référencé par une ronde, ou conserver une fiche historique et utiliser abandon/archivage. Préserver les résultats validés et avertir avant toute modification qui les recalculerait.

### 3. P1 — Un forfait entre deux tours réorganise le tableau éliminatoire

**Déclencheur :** les vainqueurs des quatre quarts sont A, C, E, G. C devient absent avant les demi-finales. Le moteur génère **A–E et bye G**, au lieu de conserver les branches **bye A et E–G**.

**Cause :** `generateBracketNextRound`, lignes 1995 et 2011–2015, filtre les vainqueurs indisponibles puis apparie la liste compactée. Les positions de qualification ne sont plus conservées. Cette fonction sert aussi au cut hybride.

**Correction proposée :** conserver les emplacements et propager les qualifications dans leur branche ; résoudre le forfait sur la place concernée. Définir les cas de deux joueurs indisponibles et conserver la cohérence de la petite finale.

### 4. P1 — Une sauvegarde locale illisible est remplacée silencieusement par un état vide

**Déclencheur :** la clé `tm4` contient un JSON invalide. Au lancement, l’erreur de lecture est ignorée ; `init()` finit par enregistrer l’état initial vide sur cette même clé.

**Cause :** `load`, ligne 956, absorbe toutes les erreurs ; `init`, lignes 3254–3269, appelle ensuite `save`. Une valeur valide syntaxiquement mais mal structurée, comme `{}`, provoque plutôt un plantage de l’initialisation.

**Correction proposée :** distinguer stockage absent, stockage inaccessible, JSON invalide et schéma invalide. Conserver une copie de la valeur défectueuse, bloquer l’écriture automatique et proposer export/récupération depuis un snapshot. Ne jamais écraser un état refusé à la lecture.

**Preuve :** JSON invalide remplacé par un état sans tournois ; `{}` provoque une exception.

### 5. P1 — L’import JSON peut enregistrer une structure qui bloque ensuite le démarrage

**Déclencheur :** importer un objet avec `tournaments:[{id:'t',players:[null],roundsData:[]}]` et `gameSystems:[]`. La condition d’acceptation le juge valide ; l’initialisation échoue ensuite sur la migration des joueurs.

**Cause :** `importJSON`, lignes 3020–3028, contrôle les tableaux principaux mais pas leurs contenus ni leurs relations. Le nouvel objet remplace S et est enregistré avant que `init` ne vérifie implicitement les champs.

**Correction proposée :** valider complètement un objet candidat avant remplacement : joueurs, systèmes, rondes, matchs, identifiants uniques, références et valeurs numériques finies. Versionner le format, migrer sur une copie, conserver un export de l’état précédent et effectuer un remplacement transactionnel avec retour arrière en cas d’échec.

**Preuve :** la condition exacte accepte `players:[null]` ; le même état fait échouer `init()`.

### 6. P1 — Deux sessions peuvent écraser leurs changements sans avertissement

**Déclencheur :** deux onglets/sessions du même stockage chargent l’état, puis l’un enregistre une modification. L’autre conserve son ancien état et sa sauvegarde périodique peut écraser la modification.

**Cause :** chaque session garde son propre S ; `save`, lignes 934–953, réécrit tout `tm4`, sans révision ni détection de concurrence. Sauvegarde périodique toutes les 30 secondes, ligne 973. Aucun traitement de l’événement `storage` dans la source.

**Correction proposée :** détecter l’autre session et les changements du stockage, utiliser une révision et refuser un enregistrement issu d’un état périmé ; proposer rechargement ou export de la copie locale. Un simple événement `storage` ne suffit pas, seul, à garantir l’absence de concurrence.

**Preuve :** deux contextes partageant le même stockage ; la sauvegarde de A écrase celle de B.

### 7. P1 — Des saisies sont interprétées comme du HTML

**Déclencheur :** un pseudo contenant `<b>Nom</b>` est interpolé dans une notification. Le contenu est construit comme une balise au lieu d’un texte littéral.

**Cause :** `toast`, ligne 1023, utilise `innerHTML` avec un message contenant notamment les pseudos (`addPlayer`, ligne 1485) et noms de tournois. D’autres rendus ne protègent pas toutes les valeurs : systèmes/factions vers 1164–1199, faction du classement vers 2489, prix dans des attributs.

**Impact :** affichage modifiable par une saisie ; risque d’injection de code via des attributs HTML actifs lors d’une saisie ou import non fiable. **La construction HTML a été reproduite ; aucune charge exécutant du code n’a été testée dans un navigateur.** Ce risque ne signifie pas qu’une exploitation a eu lieu.

**Correction proposée :** utiliser `textContent` pour les données, créer séparément les éléments décoratifs, et auditer chaque interpolation dans le HTML, les attributs et les gestionnaires d’événements. `escapeHtml` existe déjà (ligne 1411), mais son usage est incomplet et ne remplace pas la validation des identifiants utilisés dans du JavaScript inline.

### 8. P2 — La restauration peut annoncer une réussite après une panne de sauvegarde

**Déclencheur :** restaurer un snapshot alors que `localStorage.setItem` échoue. `save()` absorbe la panne ; `init()` recharge l’ancien état encore stocké ; la notification annonce pourtant « Snapshot restauré ».

**Cause :** `snapshotRestore`, lignes 1001–1006, ne reçoit pas de résultat de succès de `save`. Même enchaînement dans l’import JSON, qui peut annoncer une réussite malgré un enregistrement refusé.

**Correction proposée :** retourner un résultat explicite de sauvegarde, ne recharger ni annoncer un succès après un échec, et garder les données candidates exportables. Conserver les erreurs de quota ou d’accès dans le parcours de restauration/import.

**Preuve :** le système « Restauré » redevient « Ancien » dans S lorsque l’écriture échoue.

### 9. P2 — Annulation et snapshots ne gèrent pas uniformément les erreurs de stockage

**Déclencheur reproduit :** cliquer Annuler lorsque le stockage refuse l’écriture. Une exception non interceptée interrompt le parcours après avoir consommé l’entrée undo et changé S.

**Cause :** `undoLastAction`, lignes 962–971, appelle directement `setItem` sans protection. `snapshotSave`, ligne 978, ignore toutes les erreurs ; ouverture/restauration/export des snapshots font des `JSON.parse` non protégés, lignes 981, 1002 et 1010.

**Correction proposée :** centraliser les accès au stockage, préserver l’entrée undo en cas d’échec, vérifier les snapshots et afficher leur état réel. Les cinq snapshots locaux partagent le navigateur et son quota ; ils complètent un export externe, sans en constituer un substitut indépendant.

### 10. P2 — Le CSV importé n’est pas compatible avec les champs CSV entre guillemets

**Déclencheur :** importer `"Alpha;Beta";Faction;2`. Le joueur devient `"Alpha`, sa faction `Beta"`, et la compo n’est pas exploitable.

**Cause :** `importCSV`, ligne 1640, fait `split(';')` puis `parseInt` sans validation complète. `importGSCSV` procède également par séparation brute. `csvEscape`, ligne 1409, sait pourtant produire des champs échappés pour les exports.

**Correction proposée :** vrai parseur CSV gérant guillemets, séparateurs et retours de ligne ; aperçu avant import, en-tête explicite, mapping de colonnes et refus des compos invalides. Documenter les schémas : le CSV de classement contient d’autres colonnes que l’import de joueurs ; ne pas promettre un aller-retour direct entre ces formats.

## Anomalie fortement étayée par la lecture, à confirmer en navigateur

**P2 — Éditer un joueur éliminé peut le remettre Inscrit.** `openEditPlayer` affecte son statut au sélecteur `ep-status` (ligne 1492), mais ce sélecteur ne contient pas `eliminatedcut` (ligne 703). En HTML standard, la sélection devient vide ; `saveEditPlayer`, ligne 1613, normalise alors cette valeur en `inscrit`, même pour une simple modification de note. Préserver le statut non édité ou proposer l’option appropriée. La revue indépendante a reproduit la transition avec une interface simulant cette règle ; le sélecteur réel n’a pas été manipulé pendant cet audit.

## Limites et améliorations, distinctes des bugs

### Appariements suisses

Le greedy suivi d’échanges entre deux matchs ne garantit pas l’optimum global. Notre simulation historique sur 16 joueurs reste un bon cas de référence, mais n’a pas été relancée dans cet audit. Le dossier `RONDE-SUISSE-2026-09-07.md` conserve les données et décisions.

Avant toute évolution : définir les priorités entre répétitions, points, miroirs, compo et notes ; distinguer interdictions absolues et pénalités ; choisir entre meilleure somme et réduction de la pire rencontre. Tester un moteur alternatif isolé avec les mêmes entrées/sorties, puis comparer suisse classique et hybride, byes, forfaits et grands effectifs. Ne pas généraliser l’optimisation exponentielle du test de 16 joueurs.

Un détail du score et un bilan avant validation rendraient les compromis visibles. Les alertes forcées peuvent rester un choix d’organisateur ; une identité de joueur dupliquée ou une référence inexistante devrait, elle, empêcher la validation.

### Architecture et maintenance

Extraire progressivement les fonctions pures de classement, appariement et validation, puis la persistance. Ajouter quelques fixtures couvrant les défauts confirmés avant refactorisation. Cette séparation peut conserver le fichier HTML distribuable et son fonctionnement autonome ; elle n’impose pas immédiatement un framework ni un serveur.

Introduire une version de schéma, une validation centrale et des identifiants stables. Éviter que chaque écran ait ses propres variantes des règles de statut et de sauvegarde. La base monolithique reste pratique à distribuer, mais une fonction partagée peut affecter plusieurs formats.

### Préservation du règlement

Le barème modifiable est relu par `getStandings`, donc une modification recalcule aussi les rondes antérieures. Ce comportement n’est pas nécessairement un bug, mais mérite un avertissement, un aperçu et une trace datée. Même prudence pour les modifications de système/factions après démarrage.

### Expérience d’utilisation et accessibilité

Des styles mobile existent (seuils 768 et 480 px) ; leur qualité visuelle n’a pas été testée. Programmer une vérification des tableaux, menus, modales et formulaires sur téléphone.

Les modales gèrent Échap et placent le focus dans un premier champ, mais la lecture ne montre pas de piège de focus, de retour au déclencheur, ni de sémantique `dialog`/`aria-modal`. Associer les labels aux champs, nommer les boutons uniquement iconographiques et rendre les notifications accessibles. À valider avec clavier et lecteur d’écran.

Proposer un rappel d’export externe avant tournoi et un bilan de fin ; afficher la date du dernier snapshot réussi, plutôt que déduire sa réussite de la seule sauvegarde principale.

### Tournois par équipes

La réflexion 8 équipes / 3 joueurs / 5 rondes est une future fonctionnalité, pas un dysfonctionnement de l’application actuelle. Stabiliser les règles de rencontre et les départages avant conception du modèle équipes ; conserver séparément points de rencontre et points individuels.

## Ordre de travail proposé — à décider avec l’utilisateur

1. **Protéger les données** : chargement, schéma d’import, sauvegarde/restauration, concurrence et export de récupération.
2. **Protéger les résultats** : unicité des joueurs par ronde, suppression historique, propagation du bracket et statut des éliminés.
3. **Protéger les rendus et les saisies** : texte/HTML, import CSV et validation numérique.
4. **Vérifier les vrais parcours** : navigateur, mobile, impression/export, timer, suisse et hybride de bout en bout sur des données de test.
5. **Améliorer l’explication et la maintenance**, puis expérimenter un moteur suisse alternatif et le format équipes lorsque le chantier sera repris.

Cet ordre est une recommandation de l’audit, pas une décision de mise en œuvre. Aucun commit, push ou déploiement effectué.

