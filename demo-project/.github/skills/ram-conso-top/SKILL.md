---
name: ram-conso-top
description: Affiche la RAM totale et libre et le top 5 des processus consommateurs de mémoire avec résumé en français.
---

# RAM Conso Top

Affiche la RAM totale / libre / utilisée de la machine et le top des plus gros consommateurs de mémoire (nom, mémoire utilisée, pourcentage), avec un résumé clair en français.

## Quand l'utiliser

- Pour vérifier rapidement la mémoire vive disponible.
- Pour identifier les processus qui consomment le plus de RAM.
- Quand l'utilisateur demande « top mémoire », « RAM libre », « qui consomme la RAM ».

## Lancement

Le script s'exécute avec la racine du workspace comme répertoire courant, via le skill runner :

```bash
python .github/skills/ram-conso-top/run.py
python .github/skills/ram-conso-top/run.py --top 5
python .github/skills/ram-conso-top/run.py --top 10 --unite go
python .github/skills/ram-conso-top/run.py --output data/rapport-ram.txt
```

Les chemins de fichiers (ex. `data/notes.md`) sont relatifs à la racine du workspace.

## Options

- `--top N` : nombre de processus à lister (défaut : `5`, 1 à 50).
- `--unite {auto,mo,go}` : unité d'affichage (défaut : `auto`).
- `--output CHEMIN` : écrit aussi le rapport dans ce fichier relatif au workspace (ex. `data/rapport-ram.txt`). Crée les dossiers parents si besoin.

## Règles

- 100 % bibliothèque standard, aucune donnée inventée, aucun accès réseau.
- Non interactif : ne jamais demander d'entrée clavier.
- En cas d'erreur d'usage, message sur stderr avec code de sortie 2.