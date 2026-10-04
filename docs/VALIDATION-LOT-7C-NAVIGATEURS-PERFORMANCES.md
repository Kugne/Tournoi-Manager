# Validation du lot 7C — navigateurs et performances

Date : 2026-10-04
Version contrôlée : V1.9.32
Bundle contrôlé : Worker Base64 extrait du `index.html` distribué, empreinte `bdc379b2f5a539a04999405eaa41b734741e6eb0491f3c1127a336b7a5324d5e`

## Périmètre

Le banc `tests/browser-benchmark.html` ne charge plus un Worker source différent de l'application. Il extrait le bundle complet réellement embarqué dans `index.html`, le transforme en URL Blob comme l'application, puis exerce le gestionnaire de calcul partagé.

Chaque navigateur exécute :

- trente générations initiales avec 64 joueurs, 2 016 arêtes possibles, huit rondes d'historique et tous les critères optionnels actifs ;
- jusqu'à dix variantes optimales successives, sans réutiliser une signature déjà proposée ;
- un tournoi impair de 63 joueurs par le parcours applicatif, avec exactement un bye et chaque joueur placé une fois ;
- un compteur de battements sur le thread d'interface pendant les calculs Worker ;
- une alerte suivie d'une annulation et une alerte suivie d'un timeout, avec des délais raccourcis pour le banc ;
- le contrôle qu'aucun Worker ne reste en attente.

Les tests déterministes de `SwissWorkerExecutor` conservent la preuve des seuils de production exacts : alerte à 3 000 ms et arrêt à 15 000 ms, réponse tardive ignorée et aucune solution partielle appliquée.

## Résultats mesurés

| Navigateur | Génération initiale, 30 passages | Variantes, 10 passages | Autres contrôles |
| --- | --- | --- | --- |
| Chromium intégré, Chrome 154 | min 27 ms ; médiane 29 ms ; p95 36 ms ; max 37 ms | min 28 ms ; médiane 302 ms ; p95 444 ms ; max 444 ms | 63 joueurs, réactivité, annulation, timeout, 0 Worker résiduel |
| Microsoft Edge 154 | min 28 ms ; médiane 32 ms ; p95 39 ms ; max 50 ms | min 38 ms ; médiane 350 ms ; p95 453 ms ; max 453 ms | 63 joueurs, réactivité, annulation, timeout, 0 Worker résiduel |
| Mozilla Firefox 157 | min 28 ms ; médiane 38 ms ; p95 49 ms ; max 49 ms | min 34 ms ; médiane 278 ms ; p95 421 ms ; max 421 ms | 63 joueurs, réactivité, annulation, timeout, 0 Worker résiduel |

Le p95 reste inférieur à une seconde sur les trois moteurs ciblés, pour la génération initiale comme pour les variantes.

## Distribution autonome

`index.html` a aussi été ouvert directement en URL `file://`, avec un profil vierge et sans serveur :

- Edge initialise `TMSwiss`, le titre de l'application et V1.9.32 ;
- Firefox initialise `TMSwiss`, le titre de l'application et V1.9.32.

Le parcours applicatif complet dans Chromium intégré a déjà été contrôlé aux lots 7A et 7B. Le contrôle autonome du lot 7C vise spécifiquement la promesse de distribution monofichier et l'absence de dépendance réseau au démarrage.

## Reproduction

Servir le dépôt sur `127.0.0.1`, puis exécuter le banc avec les lanceurs versionnés :

```text
node scripts/run-cdp-benchmark.mjs <chemin-edge-ou-chrome> http://127.0.0.1:8765/tests/browser-benchmark.html
node scripts/run-firefox-benchmark.mjs <chemin-firefox> http://127.0.0.1:8765/tests/browser-benchmark.html
```

Le mode `smoke` en troisième argument vérifie l'ouverture directe de `index.html`. Chaque lanceur crée un profil temporaire isolé, ferme le navigateur qu'il a créé puis supprime ce profil.

## Limites

- Les mesures dépendent de la machine ; elles prouvent ici le respect de la cible d'une seconde, pas un temps universel garanti.
- Le banc navigateur raccourcit volontairement l'alerte et le timeout afin de valider les transitions sans ajouter dix-huit secondes à chaque série. Les valeurs réelles de 3 s et 15 s sont vérifiées séparément avec une horloge déterministe.
- Chrome autonome n'est pas installé sur cette machine. Le moteur Chromium exposé par l'application s'identifie comme Chrome 154 ; Edge couvre séparément la distribution Chromium de bureau installée.

La revue globale du diff et les régressions finales restent au sous-lot 7D. L'incrément de version reste réservé au sous-lot 7E.
