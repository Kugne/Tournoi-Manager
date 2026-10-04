# Tournoi Manager V2

Date de préparation : 2026-10-04  
Tag local : `v2`  
Fichier distribué : `tournoi-manager-V2.html`

## Points principaux

- moteur Suisse individuel exact, sans retour silencieux vers l'ancien greedy ;
- proximité Suisse conservée comme cœur sportif, avec hiérarchie explicite des revanches, miroirs, allégeances, compo, notes libres et diversité des factions ;
- rerolls limités à des variantes réellement aussi optimales, avec bye conservé tant qu'il reste éligible ;
- explications et alertes communes à la génération, à la validation et à l'édition manuelle ;
- nouvel éditeur guidé pour échanger les joueurs ou réorganiser les tables sans effacer silencieusement les résultats ;
- modèle explicite pour bye, victoire administrative, abandon commencé, double forfait et anciens résultats ambigus ;
- SOS fondé sur les points sportifs, compensations neutres calculées sur la ronde et bonus/malus séparés ;
- photographie du classement Suisse avant le Top Cut hybride ;
- finale et petite finale hybrides gérées comme deux rondes parallèles, sans faux statut inactif ni clôture anticipée ;
- imports, restaurations et historiques transactionnels, avec validation renforcée des données ;
- fonctionnement monofichier hors ligne conservé.

## Compatibilité

Les sauvegardes historiques V1.9.32 restent acceptées sans migration inventée. Les schémas internes versionnés conservent leurs propres numéros : le nom commercial V2 ne modifie pas rétroactivement leur signification.

La V2 couvre toujours les quatre formats existants : Suisse, élimination directe, hybride Suisse + Top Cut et rondes manuelles. Le Suisse par équipes reste prévu pour une phase ultérieure et n'est pas inclus dans cette livraison.

## Validation

- 178 tests automatisés réussis ;
- moteur embarqué déterministe et HTML monofichier syntaxiquement valide ;
- parcours Suisse, hybride, bracket, manuel et manuel préparé contrôlés ;
- imports, exports, sauvegardes et restaurations contrôlés ;
- 64 joueurs et cas impair à 63 joueurs validés dans Chromium, Edge et Firefox sous le seuil d'une seconde ;
- annulation, timeout et ouverture autonome contrôlés.

## Publication

Le dépôt contient `index.html`, source du fichier distribué. Pour la release GitHub, joindre ce fichier sous le nom `tournoi-manager-V2.html` et publier le tag `v2`.

La préparation locale n'effectue aucun push et ne publie aucune release automatiquement.
