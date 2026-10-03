# Validation du lot 7B — persistance, imports et exports

Date : 2026-10-03  
Version contrôlée : V1.9.32  
Support fonctionnel : application monofichier servie localement dans Chromium intégré

## Parcours exécutés

| Parcours | Contrôle réalisé | Résultat |
| --- | --- | --- |
| Import JSON historique | Import d'une sauvegarde sans `schemaVersion`, contenant un résultat `bye_forced` V1.9.32 | Tournoi, joueurs et résultat relus ; sauvegarde locale confirmée. |
| Import JSON incompatible | Photographie hybride de version connue mais incomplète | Import refusé avant confirmation ; l'état V1.9.32 courant reste affiché. |
| Snapshot automatique | Ouverture de l'historique réel, cinq entrées maximum | Comptages tournoi/joueurs et actions affichés sans erreur. |
| Restauration snapshot | Restauration confirmée d'un état antérieur multi-formats | État restauré, réenregistré puis relu ; message de succès seulement après écriture. |
| Export snapshot | Déclenchement depuis l'historique | Export JSON accepté par l'application. |
| Import joueurs CSV | BOM UTF-8, une ligne valide et une compo `abc` | BOM ignoré ; ligne valide ajoutée ; ligne non numérique refusée et comptée comme ignorée. |
| Classement CSV | Suisse, manuel, bracket et hybride après Top Cut | Quatre exports déclenchés, avec quatre lignes de classement et confirmation de succès. |
| Fiche joueur et statistiques CSV | Hybride, détail joueur activé | Export individuel et export statistique détaillé confirmés. |
| PDF | Classement courant | Document généré jusqu'à l'interface d'impression native ; les libellés libres sont échappés dans le HTML produit. |

## Corrections réalisées

- `save()` indique désormais explicitement si l'écriture a réussi. Un import JSON, un import joueurs CSV ou une restauration de snapshot qui rencontre une erreur de stockage revient entièrement à l'état précédent, y compris la pile d'annulation, et n'affiche plus de faux succès. L'action Annuler vérifie elle aussi l'écriture avant de dépiler l'historique.
- Une photographie Suisse hybride n'est plus acceptée sur sa seule version : rangs, joueurs, seeds, frontière du cut et valeurs numériques doivent être cohérents. Les métadonnées de scores neutres contrôlent aussi population, statut et valeurs.
- Un historique de snapshots illisible ou contenant une entrée mal formée est signalé sans être remplacé silencieusement ; les sauvegardes automatiques cessent de l'écraser tant qu'il n'est pas récupéré.
- L'import joueurs retire un éventuel BOM et refuse une compo non entière au lieu de conserver `NaN` puis de la transformer implicitement.
- La fiche joueur parcourt les indices réels de `roundsData`. Une ronde validée après une ronde préparée encore ouverte garde donc son vrai numéro et sa vraie phase.
- Les champs textuels libres sont protégés dans les CSV détaillés et dans les documents PDF : noms, factions, prix, adversaires, tournoi et intitulé du score libre ne peuvent plus casser les colonnes ou le HTML imprimé.

## Compatibilité et limites

- Les sauvegardes V1.9.32 sans version racine restent acceptées. Leur ancien résultat forcé conserve explicitement l'incertitude sur le début de partie.
- L'import joueurs reste volontairement un format simple `Pseudo;Faction;Compo` ligne par ligne. Il ne constitue pas un lecteur CSV à guillemets complet ; un point-virgule dans un pseudo ou une faction n'est donc pas pris en charge à l'import.
- Les snapshots sont automatiques : premier point après une minute, puis toutes les dix minutes, cinq entrées maximum. Il n'existe pas d'action de création manuelle, conformément à l'interface actuelle.
- L'enregistrement matériel d'un PDF dépend de la boîte d'impression du navigateur et reste une action de l'organisateur.

Les contrôles multi-navigateurs, grands effectifs et performances restent dans le sous-lot 7C. La revue finale et l'incrément de version restent dans les sous-lots 7D et 7E.
