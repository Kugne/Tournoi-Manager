# Provenance du solveur Blossom BigInt

`blossom-bigint.mjs` est un port adapté de :

- dépôt : `mattkrick/EdmondsBlossom` ;
- fichier amont : `app/blossom.js` ;
- commit épinglé : `fab7ca8505e1577b009696c038dc804cf0acbea2` ;
- auteur du port JavaScript amont : Matt Krick ;
- algorithme source : implémentation de maximum-weight matching de Joris van Rantwijk ;
- licence amont : MIT.

Le commit a été résolu directement avec `git ls-remote` le 27 septembre 2026. La source amont indique : « Converted to JS from Python by Matt Krick. Original: http://jorisvr.nl/maximummatching.html ».

## Adaptations locales auditées

- conversion CommonJS vers module ESM strict ;
- API explicite avec nombre de sommets, afin de représenter les sommets isolés ;
- poids, relâchements (`slack`), variables duales, deltas et maximum de poids exclusivement en `BigInt` ;
- constantes `2n`, `0n` et division entière `/ 2n` aux endroits arithmétiques de l'algorithme ;
- suppression des sentinelles arithmétiques `Infinity`, `Math.max` et tableaux vides employés comme valeurs de delta ;
- indices de sommets, d'arêtes et d'extrémités conservés en `Number` (ils ne représentent jamais un poids) ;
- déclarations lexicales de toutes les variables qui étaient implicites dans la source non stricte ;
- remplacement des troncatures bit-à-bit `~~(p / 2)` par `Math.floor(p / 2)` pour les indices ;
- correction des deux bornes de type de nœud conformément à l'algorithme source : enfant sommet si `< nVertex`, blossom si `>= nVertex` ;
- validation des entrées : sommets, boucles, arêtes parallèles et type `BigInt` des poids ;
- priorité à la cardinalité maximale, puis rejet typé si le couplage obtenu n'est pas parfait ;
- vérification finale de la symétrie du couplage et restitution du poids total en `BigInt`.

Les poids ne sont jamais convertis en `Number`. Les conversions ou opérations numériques restantes concernent uniquement les indices de tableaux, bornés ici à 64 sommets et 2 016 arêtes simples.

## Licence MIT amont

The MIT License (MIT)

Copyright (c) 2015 mattkrick

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
