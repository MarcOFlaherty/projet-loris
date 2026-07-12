# Observatoire des Établissements Scolaires Fermés

Tableau de bord cartographique et statistique des établissements scolaires fermés en France, à partir de la base publique de la DEPP (Ministère de l'Éducation nationale).

**🔗 Site en ligne :** https://mofy-scpo.github.io/projet-loris/

## Fonctionnalités

- **Carte interactive** de la France (régions / départements) avec dégradé de densité des fermetures.
- **KPI** : total des établissements fermés, maternelles & élémentaires, collèges & lycées.
- **Graphiques** : évolution des fermetures par année, principaux types fermés, structure par degré.
- **Annuaire** filtrable et paginé (recherche par nom, commune, UAI ; filtres par année et par type).
- **Filtrage géographique** : un clic sur une région ou un département recentre la carte et filtre l'ensemble du tableau de bord.

## Source des données

Données publiques du jeu de données `fr-en-etablissements-fermes`, interrogées en direct via l'API Opendatasoft de l'Éducation nationale :

```
https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-etablissements-fermes/records
```

Portail : https://data.education.gouv.fr/explore/dataset/fr-en-etablissements-fermes/

## Architecture

Site 100 % statique, sans backend. Les statistiques et l'annuaire sont récupérés côté client depuis l'API DEPP.

| Fichier | Rôle |
|---------|------|
| `index.html` | Structure du tableau de bord |
| `index.css` | Styles (thème sombre) |
| `app.js` | Logique : appels API, KPI, graphiques (Chart.js), tableau, filtres |
| `map.html` | Carte Folium pré-générée (intégrée en iframe) |
| `build_map.py` | Script de génération de la carte |

## Régénérer la carte

La carte `map.html` est un artefact généré. Pour la reconstruire (agrégats par région/département) :

```bash
pip install -r requirements.txt
python build_map.py
```

Le script télécharge les GeoJSON des régions et départements, récupère les agrégats depuis l'API DEPP, puis écrit `map.html`.

## Déploiement

Le site est publié automatiquement via **GitHub Pages** (branche `main`, racine du dépôt). Tout `push` sur `main` met le site à jour.
