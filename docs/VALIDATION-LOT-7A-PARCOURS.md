# Validation du lot 7A — parcours multi-formats

Date : 2026-10-03  
Version contrôlée : V1.9.32  
Support : application monofichier servie localement dans Chromium intégré

## Parcours exécutés

| Format | Scénario réel | Résultat |
| --- | --- | --- |
| Suisse | 4 joueurs, 2 rondes, lancement exact, scores et validations | Appariements complets, progression et classement conformes ; aucun rematch en ronde 2. |
| Bracket | 4 joueurs, demi-finales puis finale | Vainqueurs correctement propagés et champion affiché. |
| Manuel | 4 joueurs, 2 rondes créées successivement | Éditeur partagé accessible, saisie et validation correctes, alertes de revanche visibles. |
| Manuel préparé | 4 joueurs, 2 rondes préparées avant le tournoi | Navigation et conservation correctes ; après correction, l'écran revient sur la première ronde ouverte et avance ensuite vers la suivante. |
| Hybride | 4 joueurs, 1 ronde Suisse, Top 4, demi-finales puis finale | Seeds conformes au classement Suisse, valeurs suisses figées, progression du tableau et champion corrects. |

Dans le classement hybride final, l'ordre suit volontairement la progression du Top Cut. Les points, scores secondaires et SOS affichés restent ceux de la photographie Suisse : ce comportement est conforme à l'architecture décidée et n'a pas été modifié.

## Régressions corrigées

- La préparation de toutes les rondes manuelles affichait d'abord la dernière ronde préparée. L'application choisit maintenant la première ronde non validée, uniquement dans ce mode ; les autres formats conservent leur sélection historique de la dernière ronde.
- Après ajout, import ou suppression de joueurs, le nombre affiché dans la barre latérale pouvait rester ancien jusqu'à un rendu ultérieur. Les résumés concernés sont maintenant rafraîchis immédiatement. Le check-in et tous les changements de statut, y compris absent ou drop via le parcours administratif, actualisent aussi le nombre de joueurs actifs du bandeau supérieur.

## Portée

Ce sous-lot valide les parcours applicatifs principaux. Les imports/exports et restaurations approfondis, les autres navigateurs, les grands effectifs, la revue finale et l'incrément de version restent répartis dans les sous-lots 7B à 7E.
