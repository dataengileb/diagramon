#!/usr/bin/env python3
"""
Diagramon · empaqueta las tipografías incluidas (Inter, IBM Plex Sans, Fira Code).

Lee los .woff2 de assets/fonts/ y escribe assets/fonts/fonts.js, que define window.DIAGRAMON_FONTS.
Van en base64 (como los iconos) porque los navegadores bloquean cargar archivos de
tipografía desde file:// y la CSP prohíbe fetch. Así funcionan al abrir index.html
con doble clic y viajan dentro de las exportaciones SVG/PNG.

Uso:
    python3 tools/build-fonts.py

Para añadir una tipografía:
  1. Descarga sus .woff2 de Google Fonts (fonts.googleapis.com/css2?family=...; pide
     el CSS con un User-Agent de navegador moderno y baja el .woff2 de cada
     subconjunto) y déjalos en assets/fonts/, p. ej. assets/fonts/Lato-latin.woff2 y
     assets/fonts/Lato-latin-ext.woff2. Añade su licencia (assets/fonts/OFL-Lato.txt) y
     menciónala en los Créditos del README.
  2. Añade una entrada a FONTS (abajo): clave, nombre visible, css con alternativas
     y los archivos con su peso y unicode-range (cópialo del CSS de Google).
  3. Ejecuta este script. La tipografía aparece sola en el selector de la barra
     superior (config.js solo guarda las alternativas del sistema).

Solo usa la biblioteca estándar de Python.
"""
import base64
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'fonts')

# Unicode-range de los subconjuntos de Google Fonts
LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF'

# clave -> nombre visible, css (con alternativas del sistema) y archivos (archivo, peso, unicode-range)
FONTS = {
    'inter': {
        'label': 'Inter',
        'css': '"Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        'files': [('Inter-latin-ext.woff2', '400 800', LATIN_EXT), ('Inter-latin.woff2', '400 800', LATIN)],
    },
    'plex': {
        'label': 'IBM Plex Sans',
        'css': '"IBM Plex Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        'files': [('IBMPlexSans-latin-ext.woff2', '400 700', LATIN_EXT), ('IBMPlexSans-latin.woff2', '400 700', LATIN)],
    },
    'fira': {
        'label': 'Fira Code',
        'css': '"Fira Code", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        'files': [('FiraCode-latin-ext.woff2', '400 700', LATIN_EXT), ('FiraCode-latin.woff2', '400 700', LATIN)],
    },
}


def main():
    out = {}
    for key, f in FONTS.items():
        # El nombre de familia es el primer elemento del css
        family = f['css'].split(',')[0].strip().strip('"')
        faces = []
        for name, weight, rng in f['files']:
            with open(os.path.join(ROOT, name), 'rb') as fh:
                data = base64.b64encode(fh.read()).decode()
            faces.append({'weight': weight, 'style': 'normal', 'unicodeRange': rng, 'src': 'data:font/woff2;base64,' + data})
        out[key] = {'label': f['label'], 'family': family, 'css': f['css'], 'faces': faces}
    path = os.path.join(ROOT, 'fonts.js')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('/* Generado por tools/build-fonts.py. No editar a mano. Licencias: assets/fonts/OFL-*.txt */\n')
        fh.write('window.DIAGRAMON_FONTS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n')
    print('%s: %d tipografías, %.0f KB' % (os.path.relpath(path), len(out), os.path.getsize(path) / 1024))


if __name__ == '__main__':
    main()
