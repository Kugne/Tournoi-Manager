# Appariements suisses — dossier de reprise

Discussion source : « Expliquer appariement ronde suisse », 7 septembre 2026, tâche `01a07d54-c49f-7a62-80ae-71029dc4ae96`. Récupérée le 17 septembre 2026 à la demande de l’utilisateur. Chantier reporté pour y revenir quand du temps sera disponible ; aucune amélioration du moteur lancée.

## Besoin et périmètre

Comprendre les appariements de la quatrième ronde à partir des captures de l’application, vérifier les calculs et rechercher des améliorations raisonnables. Une seule poule de 16 joueurs, 4 rondes, OPR Grimdark Future à 2 000 points. Victoire/nul/défaite : 3/1/0. Compo activée, note libre activée en mode Séparer, pas de miroir activé, allégeances désactivées. Aucun blocage manuel communiqué. Tous actifs, aucun bye dans le test.

Le score servant à choisir les paires est distinct des points et départages du classement. Le SOS reconstruit est la somme des points actuels des adversaires rencontrés. Le classement observé privilégie le SOS avant la compo ; le tri d’appariement annoncé privilégie points, compo puis SOS. En ronde 1 : compo puis aléatoire.

## Profils fournis — ordre du CSV conservé

| Joueur | Faction | Compo | Note libre |
|---|---|---:|---|
| thekay | Goblin Reclaimers | 2 | Externe |
| primarque666 | Human Defense Force | 2 | Externe |
| Helvain | Ratmen Clans | 2 | Launaguet |
| System | Human Defense Force | 1 | Mordus |
| hwk | Robot Legions | 0 | Mordus |
| Thelordash | Wormhole Daemons: Daemons of Plague | 1 | Mordus |
| Haramir09 | High Elf Fleets | 2 | Mordus |
| Marcus09 | Battle Brothers: Wolf Brothers | 1 | Mordus |
| Alrik | Dark Elf Raiders | 0 | SystemLan |
| Pergame | Havoc Brothers: Change Disciples | 2 | Launaguet |
| GameBoy | Infected Colonies | 0 | Aix |
| Chichoula | Orc Marauders | 0 | Aix |
| imrahil31 | Eternal Dynasty | 1 | Launaguet |
| koko | Human Defense Force | 1 | SystemLan |
| BenL | Blessed Sisters | 0 | Launaguet |
| Psyca | Havoc Brothers: War Disciples | 2 | Externe |

Instruction explicite de l’utilisateur : **Externe est une note libre à part entière**, au même titre que les clubs. Ne pas la rendre neutre ni lui appliquer une exception.

## Historique des rencontres

Reconstitution conservée dans le script de simulation retrouvé ; le premier joueur de chaque paire ci-dessous est le vainqueur. Aucun nul sur ces trois rondes.

| Ronde 1 | Ronde 2 | Ronde 3 |
|---|---|---|
| Haramir09 – thekay | Haramir09 – Helvain | Pergame – primarque666 |
| Pergame – Psyca | hwk – BenL | BenL – Alrik |
| Helvain – primarque666 | imrahil31 – koko | Helvain – Marcus09 |
| Thelordash – koko | Alrik – GameBoy | imrahil31 – Chichoula |
| Marcus09 – imrahil31 | System – Pergame | thekay – Psyca |
| hwk – GameBoy | Thelordash – Marcus09 | System – Haramir09 |
| BenL – Chichoula | primarque666 – thekay | koko – GameBoy |
| System – Alrik | Chichoula – Psyca | Thelordash – hwk |

Après R3 : System et Thelordash à 9 points ; Haramir09, hwk, Pergame, BenL, Helvain, imrahil31 à 6 ; primarque666, Alrik, Marcus09, Chichoula, thekay, koko à 3 ; Psyca et GameBoy à 0. Les points et SOS de la capture avaient été jugés cohérents. Exemples : System SOS 15, Thelordash 12, Marcus09 21 ; plage de SOS 9 à 21.

## Barème historique et moteur réellement découvert

| Critère | Pénalité historique |
|---|---:|
| Déjà rencontrés | −10 000 |
| Blocage manuel | −8 000 |
| Même faction, option activée | −3 000 |
| Même allégeance, option activée | −2 000 |
| Note libre non respectée selon Regrouper/Séparer | −50 |
| Écart de points | −100 par point |
| Écart de compo, option activée | −50 par point |
| Écart de SOS | −10 par point, ensuite réduit à −1 |

Meilleur score = plus proche de zéro. Ce sont des pénalités pondérées, pas toutes des interdictions absolues : une contrainte peut être forcée faute de solution. Le texte initial décrivait un greedy simple ; l’examen du HTML a montré **un greedy suivi d’échanges d’adversaires entre deux matchs**, améliorant leur score cumulé, avec une limite de 300 passages. Les premières accusations d’incohérence fondées sur un greedy pur ont été retirées.

Repères dans le HTML historique uniquement : `pairScore(p1,p2)` vers les lignes 1785–1811 ; échanges correctifs vers 1841–1866 ; tableau d’aide vers 403–410. Rechercher les fonctions dans la version courante plutôt que réutiliser ces numéros.

Bye décrit dans l’aide : partir du bas du classement en privilégiant un joueur n’en ayant jamais reçu. Ce cas n’a pas été couvert par le tournoi de référence.

## Ronde 4 observée — SOS ×10

| Table | Rencontre | Points | Score de paire |
|---|---|---|---:|
| 1 | Alrik – primarque666 | 3 – 3 | −100 |
| 2 | Helvain – Pergame | 6 – 6 | −50 |
| 3 | Marcus09 – koko | 3 – 3 | −60 |
| 4 | System – Thelordash | 9 – 9 | −80 |
| 5 | Psyca – GameBoy | 0 – 0 | −100 |
| 6 | imrahil31 – hwk | 6 – 6 | −110 |
| 7 | Haramir09 – BenL | 6 – 6 | −160 |
| 8 | Chichoula – thekay | 3 – 3 | −130 |

Zéro écart de points, zéro répétition, zéro miroir, deux matchs de même note libre. Somme des écarts de compo 9 ; somme des écarts de SOS 24. Les numéros de table ne représentent pas ici l’ordre du classement sportif.

Questions et cas révélateurs :

- Haramir09 – imrahil31 vaut −140, mieux individuellement que Haramir09 – BenL à −160. Mais imrahil31 – hwk vaut −110 et leur réaffectation naïve laisse hwk – BenL, déjà joué en R2, à −10 030. Comparaison des deux matchs : −270 contre −10 170.
- Alrik – Chichoula vaut −30 et semblait devoir être choisi en premier. Mais échanger seulement les adversaires avec primarque666 et thekay recrée leur rencontre de R2 : combinaison actuelle −230 contre −10 140 pour l’échange. Les corrections locales expliquent le comportement ; une amélioration peut nécessiter de revoir au moins trois matchs ensemble.
- Helvain – Pergame reste autorisé malgré leur note Launaguet : −50 est une préférence, pas un veto.
- Avec SOS ×10, un écart de SOS de 12 coûte 120, contre 50 par point de compo et 100 par point de classement. La compo allant de 0 à 2 dans ce test, le SOS peut dépasser son influence maximale de 100. C’est l’écart de SOS, et non sa valeur absolue, qui importe.

## Simulations et conclusions

Les fichiers retrouvés sont copiés dans `../work/reference-suisse-2026-09-07/` : rapport détaillé, résultats JSON et script de simulation, plus HTML d’origine et HTML corrigé v3. Le script conserve ses chemins historiques : **archive de référence, à adapter avant exécution**, pas un test prêt à lancer depuis ce projet.

Méthode historique : fonction `generatePairings` extraite du HTML V1.9.32, auxiliaires adaptés au test, ordre CSV conservé, score scénario nul. Les huit matchs réels ont été reproduits exactement. Comparaison à un optimum exact par programmation dynamique sur les sous-ensembles, maximisant la somme des scores du même barème. Sept variantes testées : SOS ×10, SOS ×1, plafond min(SOS ×10,20), SOS /1000, sans SOS, SOS ×1 + note libre ×10, SOS ×1 + compo ×100.

| Réglage et moteur | Somme écarts points | Somme écarts compo |
|---|---:|---:|
| Moteur existant, SOS ×10 | 0 | 9 |
| Moteur existant, SOS ×1 | 0 | 9 |
| Moteur existant, SOS plafonné à 20 | 6, sur deux matchs | 5 |
| Optimum global, SOS ×1 | 0 | 7 |

Passer à SOS ×1 change seulement Helvain – Pergame / Haramir09 – BenL en Haramir09 – Pergame / Helvain – BenL. L’écart de compo de 2 est transféré à Helvain ; le total reste 9. Réduire le SOS corrige son poids excessif, sans résoudre le défaut global.

Solution optimale trouvée pour SOS ×10 et ×1 : System – Thelordash ; Haramir09 – Pergame ; Helvain – hwk ; imrahil31 – BenL ; Alrik – Chichoula ; primarque666 – Marcus09 ; thekay – koko ; GameBoy – Psyca. Zéro écart de points, répétition ou miroir ; deux mêmes notes ; compo cumulée 7 au lieu de 9 ; SOS cumulé 30 au lieu de 24 ; pire écart de compo toujours 2.

Deux cents historiques **synthétiques**, mêmes 16 profils, graine 20260907, forces fixes aléatoires par tournoi, 10 % de nuls, autres résultats selon une probabilité logistique. Comparaisons avant R4 et R8, chaque variante appliquée à la même situation sans modifier les rondes antérieures. R8 est un test de contrainte hors du format demandé. Le moteur SOS ×10 manque l’optimum du barème dans 39 % des cas R4 et 75 % R8 ; SOS ×1 dans 40,5 % R4. Ce ne sont pas des taux d’erreur sportive ni une garantie sur tous les formats. Le rapport et le JSON conservent les autres métriques.

## Décisions finales et propositions écartées

- Choix final : **conserver le moteur greedy avec corrections locales**, réduire SOS de ×10 à ×1 et actualiser Informations. Compo et note libre restent à ×50 ; points à ×100.
- Ne pas retenir le plafond SOS à 20 comme modification isolée : les simulations ont contredit l’intuition initiale et créé deux matchs à 6 contre 3 points.
- Rendre Externe neutre a été explicitement rejeté par l’utilisateur.
- Réduire les notes libres à ×10, les limiter à R1 ou augmenter la compo à ×100 : pistes évoquées, **non adoptées**. Baisser les notes favorise davantage les rencontres de même note ; doubler la compo peut accroître les écarts de points.
- Remplacer immédiatement le moteur par l’optimisation exacte proposée a été abandonné au profit d’une expérimentation séparée. L’utilisateur a rappelé que ce moteur est le cœur de l’application, partagé avec le suisse hybride, et qu’une modification profonde présente un coût et un risque de régression.

Petits correctifs historiquement réalisés et annoncés testés : aide décrivant les échanges correctifs ; alertes directes selon les options (ancienne condition miroir impossible `sc <= -3000 && sc > -2000`) ; barèmes personnalisés à zéro conservés au lieu des valeurs par défaut ; menu Regrouper/Séparer désactivé quand Note libre est décochée, à la création **et** dans les paramètres ; indicateur d’échec de sauvegarde et une seule alerte par période d’échec, avec tentatives maintenues et retour à Sauvegardé après réussite. La première correction du menu avait oublié la création ; corrigé dans v3.

La discussion annonce une publication du HTML v3 dans `index.html` du dépôt Kugne/Tournoi-Manager, branche main, commit `f51774248b12cbc89e6aaeb01a27e59a1e4cd385`. C’est un fait rapporté par l’historique, **non revérifié aujourd’hui**. Le fichier `Tournoi-manager-V1.9.32-A jour.html` de ce projet n’a pas encore été comparé à ces archives. Ne pas supposer que les anciens correctifs lui manquent ou lui sont tous intégrés.

## Chantier à reprendre plus tard

Définir d’abord ce que veut dire meilleur : somme du barème, priorités sportives explicites, réduction des écarts de points, ou limitation de la pire rencontre. Ces objectifs peuvent diverger ; maximiser une somme n’impose pas des priorités absolues.

Développer une alternative dans une copie expérimentale, conserver les entrées et sorties du moteur et comparer sur des tournois de référence sans changer leurs résultats. La méthode exacte du test est exponentielle et adaptée à 16 joueurs ; étudier une méthode adaptée aux grands effectifs avant généralisation. Une correction sur trois matchs est une autre piste, sans garantie d’optimum.

Vérifications envisagées : suisse classique et phase suisse hybride, grands effectifs, byes, forfaits, blocages, miroirs, allégeances, compo, notes Regrouper/Séparer, contraintes forcées, égalités de scores, régénération des rondes et temps de calcul. Ne pas refaire les écrans ou classements sans besoin, mais vérifier leurs interactions avec la fonction partagée.

Améliorations d’explication évoquées, non réalisées dans cet échange : détail du score d’une rencontre (« Pourquoi ce match ? »), bilan des écarts et contraintes avant validation d’une ronde, comparaison de variantes sur une copie. Un détail de score explique le barème, pas à lui seul le choix final parmi tous les adversaires.

Limites de conservation : les captures étaient jointes via des chemins temporaires ; elles ne sont pas recopiées dans ce dossier. Les données exploitées et reconstituées dans la discussion sont conservées ici et dans le script. Aucun nouvel audit ni nouvelle simulation effectué le 17 septembre.

