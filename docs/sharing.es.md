[← Diagramon](../README.es.md) · [English](sharing.md) · **Español**

# 🔐 Compartir un diagrama cifrado

**Exportar › HTML cifrado** pide una contraseña (12 caracteres o más, con medidor de fortaleza) y guarda un único archivo `.html`.

- **Autosuficiente y de solo lectura.** El archivo lleva su propio visor. Se abre con doble clic en cualquier navegador reciente, sin conexión, sin Diagramon, sin instalar ni descargar nada.
- **Todo va cifrado**, también el título. En claro solo quedan los parámetros del cifrado.
- **Criptografía estándar y robusta** del propio navegador (Web Crypto): la clave sale de la contraseña con PBKDF2-SHA-256, 600 000 iteraciones y una sal aleatoria de 16 bytes; el diagrama se comprime y se cifra con AES-256-GCM (vector inicial aleatorio de 12 bytes), que además detecta cualquier alteración.
- **El visor no puede filtrar ni ejecutar nada.** Bloquea la red con su propia política CSP y muestra el diagrama como imagen.
- Envía la contraseña por un **canal distinto** al del archivo. Una contraseña perdida no se puede recuperar.
