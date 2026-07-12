import json
import requests
import folium

def main():
    print("1. Téléchargement des GeoJSONs géographiques...")
    regions_geojson_url = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson"
    depts_geojson_url = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson"
    
    try:
        regions_geojson = requests.get(regions_geojson_url).json()
        depts_geojson = requests.get(depts_geojson_url).json()
    except Exception as e:
        print(f"Erreur lors du téléchargement des GeoJSONs: {e}")
        return

    print("2. Récupération des données statistiques depuis l'API de l'Éducation Nationale...")
    # Récupération statistiques par régions
    regions_api_url = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-etablissements-fermes/records?group_by=code_region&select=code_region,count(numero_uai)%20as%20total&limit=100"
    # Récupération statistiques par départements
    depts_api_url = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-etablissements-fermes/records?group_by=code_departement&select=code_departement,count(numero_uai)%20as%20total&limit=150"
    
    try:
        regions_stats = requests.get(regions_api_url).json()
        depts_stats = requests.get(depts_api_url).json()
    except Exception as e:
        print(f"Erreur lors de la récupération des statistiques API: {e}")
        return

    # Traitement des données des régions
    regions_counts = {}
    for r in regions_stats.get('results', []):
        if r.get('code_region') is not None:
            regions_counts[str(r['code_region'])] = r.get('total', 0)

    # Fonction pour nettoyer le code département
    def clean_dept_code(code):
        if not code:
            return ""
        code = str(code).strip()
        if len(code) == 3 and code.startswith('0'):
            return code[1:] # "007" -> "07", "072" -> "72"
        return code

    # Traitement des données des départements
    depts_counts = {}
    for d in depts_stats.get('results', []):
        if d.get('code_departement') is not None:
            cleaned_code = clean_dept_code(d['code_departement'])
            depts_counts[cleaned_code] = d.get('total', 0)

    print("3. Association des statistiques aux GeoJSONs...")
    # Injecter les statistiques dans les propriétés GeoJSON
    for feature in regions_geojson['features']:
        code = str(feature['properties']['code'])
        count = regions_counts.get(code, 0)
        feature['properties']['total_fermes'] = count
        feature['properties']['total_formatted'] = f"{count:,}".replace(",", " ")

    for feature in depts_geojson['features']:
        code = str(feature['properties']['code'])
        count = depts_counts.get(code, 0)
        feature['properties']['total_fermes'] = count
        feature['properties']['total_formatted'] = f"{count:,}".replace(",", " ")

    # Palettes de couleurs adaptées pour le thème sombre (dégradés indigo -> rose -> corail)
    def get_region_color(count):
        if count == 0: return '#1e1b4b' # Indigo très foncé
        elif count < 250: return '#312e81' # Indigo foncé
        elif count < 1000: return '#4338ca' # Indigo moyen
        elif count < 2000: return '#6366f1' # Indigo clair
        elif count < 3000: return '#8b5cf6' # Violet
        elif count < 4500: return '#ec4899' # Rose
        else: return '#f43f5e' # Rose corail vif

    def get_dept_color(count):
        if count == 0: return '#1e1b4b'
        elif count < 100: return '#312e81'
        elif count < 250: return '#4338ca'
        elif count < 400: return '#6366f1'
        elif count < 600: return '#8b5cf6'
        elif count < 900: return '#ec4899'
        else: return '#f43f5e'

    # Fonctions de style pour Folium
    def region_style(feature):
        count = feature['properties']['total_fermes']
        return {
            'fillColor': get_region_color(count),
            'color': '#475569', # Bordures gris ardoise
            'weight': 1.5,
            'fillOpacity': 0.6,
        }

    def dept_style(feature):
        count = feature['properties']['total_fermes']
        return {
            'fillColor': get_dept_color(count),
            'color': '#334155', # Bordures gris ardoise plus fin
            'weight': 1,
            'fillOpacity': 0.6,
        }

    # Style survol
    highlight_style = {
        'weight': 3,
        'color': '#ffffff',
        'fillOpacity': 0.85
    }

    print("4. Création de la carte Folium...")
    # Initialisation de la carte centrée sur la France métropolitaine
    m = folium.Map(
        location=[46.2276, 2.2137], 
        zoom_start=6, 
        tiles="cartodbdark_matter",
        zoom_control=True
    )

    # Tooltips stylisés pour dark mode
    region_tooltip = folium.GeoJsonTooltip(
        fields=['nom', 'code', 'total_formatted'],
        aliases=['Région', 'Code', 'Établissements fermés'],
        localize=True,
        sticky=True,
        style="font-family: 'Outfit', sans-serif; font-size: 13px; background-color: #0f172a; color: #f8fafc; border: 1px solid #475569; border-radius: 6px; padding: 8px;"
    )

    dept_tooltip = folium.GeoJsonTooltip(
        fields=['nom', 'code', 'total_formatted'],
        aliases=['Département', 'Code', 'Établissements fermés'],
        localize=True,
        sticky=True,
        style="font-family: 'Outfit', sans-serif; font-size: 13px; background-color: #0f172a; color: #f8fafc; border: 1px solid #475569; border-radius: 6px; padding: 8px;"
    )

    # Création des couches GeoJSON
    regions_layer = folium.GeoJson(
        regions_geojson,
        name="Régions",
        style_function=region_style,
        highlight_function=lambda x: highlight_style,
        tooltip=region_tooltip
    ).add_to(m)

    depts_layer = folium.GeoJson(
        depts_geojson,
        name="Départements",
        style_function=dept_style,
        highlight_function=lambda x: highlight_style,
        tooltip=dept_tooltip
    )
    # On ajoute les départements mais on les désactive par défaut (ou l'inverse)
    depts_layer.add_to(m)

    # Contrôle des couches
    folium.LayerControl(collapsed=False).add_to(m)

    print("5. Injection du code d'interaction JavaScript...")
    # Script JS personnalisé pour gérer les clics et communiquer avec le dashboard parent
    js_interaction = f"""
    <script>
    setTimeout(function() {{
        var mapObj = {m.get_name()};
        var regLayer = {regions_layer.get_name()};
        var deptLayer = {depts_layer.get_name()};
        var activeMarker = null;

        // Fonction d'envoi du message au parent
        function sendSelection(level, props, bounds) {{
            window.parent.postMessage({{
                type: 'SELECT_AREA',
                level: level,
                code: props.code,
                name: props.nom,
                total: props.total_fermes
            }}, '*');
            mapObj.fitBounds(bounds);
        }}

        if (regLayer) {{
            regLayer.on('click', function(e) {{
                sendSelection('region', e.target.feature.properties, e.target.getBounds());
            }});
        }}

        if (deptLayer) {{
            deptLayer.on('click', function(e) {{
                sendSelection('department', e.target.feature.properties, e.target.getBounds());
            }});
        }}

        // Écouteur de messages envoyés par la page principale (dashboard)
        window.addEventListener('message', function(event) {{
            if (event.data.type === 'RESET_MAP') {{
                mapObj.setView([46.2276, 2.2137], 6);
                if (activeMarker) {{
                    mapObj.removeLayer(activeMarker);
                    activeMarker = null;
                }}
            }} else if (event.data.type === 'ZOOM_TO_COORDINATES') {{
                if (activeMarker) {{
                    mapObj.removeLayer(activeMarker);
                }}
                mapObj.setView([event.data.lat, event.data.lon], 15);
                activeMarker = L.marker([event.data.lat, event.data.lon]).addTo(mapObj);
                
                var popupContent = `
                    <div style="font-family: 'Outfit', sans-serif; font-size:12px; color:#1e293b;">
                        <h4 style="margin: 0 0 4px 0; font-size:13px; color:#0f172a;">${{event.data.name}}</h4>
                        <p style="margin: 0 0 6px 0; color:#64748b;">${{event.data.info}}</p>
                        <table style="width:100%; border-collapse:collapse; font-size:11px;">
                            <tr><td style="font-weight:bold; padding:2px 0;">UAI:</td><td>${{event.data.uai}}</td></tr>
                            <tr><td style="font-weight:bold; padding:2px 0;">Ouvert:</td><td>${{event.data.ouverture}}</td></tr>
                            <tr><td style="font-weight:bold; padding:2px 0;">Fermé:</td><td>${{event.data.fermeture}}</td></tr>
                        </table>
                    </div>
                `;
                activeMarker.bindPopup(popupContent).openPopup();
            }}
        }});
    }}, 500);
    </script>
    """

    # Insertion du script dans l'HTML de la carte
    m.get_root().html.add_child(folium.Element(js_interaction))

    # Sauvegarde de la carte générée
    print("6. Sauvegarde du fichier map.html...")
    m.save("map.html")
    print("Succès ! La carte Folium a été générée avec succès dans 'map.html'.")

if __name__ == "__main__":
    main()
