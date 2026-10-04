# Validation du lot 7D — revue finale et régressions

Date : 2026-10-04  
Branche : `feat/swiss-optimizer-phase1`  
Version contrôlée : V1.9.32

## Revue et corrections

La revue globale des changements réalisés depuis V1.9.32 a relevé puis fait corriger trois défauts concrets :

1. le libellé organisateur du score libre pouvait être interprété comme du HTML dans plusieurs écrans interactifs ; il est maintenant échappé dans les rondes, le classement, les statistiques et les paramètres ;
2. les alertes des appariements manuels pouvaient considérer des rondes futures ou non validées comme un historique réel ; seuls les matchs et byes des rondes antérieures validées sont désormais retenus ;
3. l'analyse d'une ronde Suisse déjà générée reprenait les options courantes du tournoi. Chaque nouvelle génération, variante ou édition conserve maintenant une photographie normalisée des critères employés. Une modification ultérieure des réglages ne réinterprète plus rétroactivement la ronde et l'interface précise qu'un prochain reroll utilisera les nouvelles options.

Une ronde modifiée manuellement et dépourvue d'alerte est décrite comme telle, sans prétendre démontrer son optimalité globale.

Une seconde revue indépendante, limitée à ces corrections, n'a trouvé aucun défaut P1/P2 résiduel.

## Validations automatisées

- génération déterministe du moteur embarqué puis contrôle syntaxique : réussi ;
- tests ciblés après correction : 58/58 réussis ;
- suite complète après correction : 173/173 réussis ;
- contrôle des espaces et fins de lignes du diff : réussi.

La suite couvre notamment les formats Suisse classique et hybride, le bracket, le manuel et le manuel préparé, les imports et restaurations, les exports, les résultats administratifs, les blocages, les byes, les variantes optimales et le protocole Worker.

## Navigateurs et performances finales

Le banc charge le bundle Worker réellement inclus dans `index.html` et vérifie 64 joueurs, le cas impair à 63 joueurs, la complétude des tables, la réactivité, l'annulation, le timeout et l'absence de Worker résiduel.

| Navigateur | Génération initiale, p95 | Variantes, p95 | Résultat |
| --- | ---: | ---: | --- |
| Chromium 154 intégré | 32 ms | 442 ms | réussi |
| Microsoft Edge 154 | 58 ms | 467 ms | réussi |
| Mozilla Firefox 157 | 48 ms | 388 ms | réussi |

Le seuil métier d'une seconde est respecté. L'ouverture directe du fichier monofichier initialise aussi l'application et affiche V1.9.32 dans Edge et Firefox. Chromium n'a produit aucune erreur de console sur l'ouverture intégrée.

Sous Windows, Firefox peut conserver brièvement le verrou de son profil de test après la fermeture réussie de la session. Le lanceur utilise désormais une instance isolée, retente le nettoyage puis signale clairement le dossier temporaire s'il reste verrouillé, sans transformer le résultat fonctionnel réussi en échec artificiel.

## État de sortie

- aucune régression P1/P2 connue dans le périmètre relu ;
- version applicative inchangée : V1.9.32 ;
- aucun push, tag ni release effectué ;
- prochain sous-lot : 7E, passage cohérent de toute la livraison en V2 et préparation des métadonnées de livraison.
