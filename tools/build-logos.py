#!/usr/bin/env python3
"""
Diagramon · empaqueta los logotipos de marca que se usan como icono de grupo.

Lee tools/logos/ y escribe assets/icons/logos.js, que se carga después de los iconos
de cada nube y les añade su logotipo (categoría "Grupos"): una cuenta de Azure,
un proyecto de Google Cloud, una cuenta de SAP BTP o una capacidad de Fabric.

Fuentes:
    azure.svg         icono "Azure A" del paquete oficial Azure Public Service Icons
                      (learn.microsoft.com/azure/architecture/icons)
    google-cloud.png  marca de Google Cloud publicada en www.gstatic.com/cgc/
    sap.svg           logotipo de SAP de github.com/SAP/btp-solution-diagrams
                      (guideline/static/img/logo.svg)
El logotipo de Microsoft Fabric ya está en assets/icons/fabric.js: solo se marca como icono de grupo.

Uso:
    python3 tools/build-logos.py

Solo usa la biblioteca estándar de Python.
"""
import base64
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'logos')
OUT = os.path.join(ROOT, 'assets', 'icons', 'logos.js')

# proveedor, clave, archivo, nombre, palabras clave (es + en)
LOGOS = [
    ('azure', 'logo', 'azure.svg', 'Azure',
     'azure microsoft cuenta account tenant suscripcion subscription nube cloud logo'),
    ('gcp', 'logo', 'google-cloud.png', 'Google Cloud',
     'gcp google cloud proyecto project organizacion organization carpeta folder nube logo'),
    ('sap', 'logo', 'sap.svg', 'SAP',
     'sap btp cuenta global global account subcuenta subaccount directorio directory logo'),
]
FABRIC_KEYWORDS = 'fabric capacidad capacity tenant workspace area de trabajo dominio domain logo'
MIME = {'.svg': 'image/svg+xml', '.png': 'image/png'}


def data_uri(path):
    with open(path, 'rb') as f:
        return f'data:{MIME[os.path.splitext(path)[1]]};base64,' + base64.b64encode(f.read()).decode()


def main():
    adds = []
    for prov, key, fname, label, kw in LOGOS:
        item = {'label': label, 'type': 'generic', 'category': 'Grupos', 'file': f'logo-{prov}',
                'keywords': kw, 'group': True}
        adds.append([prov, key, data_uri(os.path.join(SRC, fname)), item])
    js = f'''/* Diagramon · logotipos de marca para grupos. Generado por tools/build-logos.py.
   Azure, Google Cloud, SAP y Microsoft Fabric son marcas de sus dueños; aquí solo identifican
   el servicio en el diagrama, como permiten sus guías de marca. Ver assets/icons/LICENSE-LOGOS.txt. */
(function (I) {{
  {json.dumps(adds, ensure_ascii=False)}.forEach(([p, k, src, it]) => {{
    const set = I[p];
    if (!set) return;
    set.files[it.file] = src;
    set.items[k] = it;
  }});
  // Fabric ya trae su logotipo: se ofrece también para grupos (capacidad, tenant, workspace)
  const f = I.fabric?.items?.fabric;
  if (f) Object.assign(f, {{ group: true, keywords: [f.keywords, {json.dumps(FABRIC_KEYWORDS)}].filter(Boolean).join(' ') }});
}})(window.DIAGRAMON_ICONS || {{}});
'''
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(js)
    print(f'{os.path.relpath(OUT, ROOT)}: {len(js) / 1024:.1f} KB')


if __name__ == '__main__':
    main()
