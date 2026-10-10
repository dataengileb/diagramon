[← Diagramon](../README.es.md) · [English](sharing.md) · **Español**

# 🔐 Compartir un diagrama cifrado

**Exportar › HTML cifrado** pide una contraseña (12 caracteres o más, con medidor de fortaleza) y guarda un único archivo `.html`.

- **Autosuficiente y de solo lectura.** El archivo lleva su propio visor. Se abre con doble clic en cualquier navegador reciente, sin conexión, sin Diagramon, sin instalar ni descargar nada.
- **Todo va cifrado**, también el título. En claro solo quedan los parámetros del cifrado.
- **Criptografía estándar y robusta** del propio navegador (Web Crypto): la clave sale de la contraseña con PBKDF2-SHA-256, 600 000 iteraciones y una sal aleatoria de 16 bytes; el diagrama se comprime y se cifra con AES-256-GCM (vector inicial aleatorio de 12 bytes), que además detecta cualquier alteración.
- **El visor no puede filtrar ni ejecutar nada.** Bloquea la red con su propia política CSP y muestra el diagrama como imagen (las zonas de comentario son simples cajas dibujadas encima).
- Envía la contraseña por un **canal distinto** al del archivo. Una contraseña perdida no se puede recuperar.

## Dejar que el revisor comente

En el diálogo, **Permitir que el revisor comente** viene activada. Desactívala para obtener el archivo de solo lectura de siempre.

- **En el visor** un botón **Comentarios** abre un panel lateral. El revisor pulsa un componente, una conexión o un grupo del diagrama (o lo elige de la lista, que también tiene decisiones, requisitos y versiones, y *Todo el diagrama*), escribe su nombre y el comentario, y lo añade. Sobre cada forma ve cuántos comentarios tiene.
- **No se envía nada a ningún sitio.** Los comentarios quedan en la página hasta que el revisor pulsa **Descargar mis comentarios**, que guarda `diagramon-comentarios.json` (`diagramon-comments.json` en inglés). Cerrar o bloquear la página antes de descargar pide confirmación.
- **El archivo de comentarios también va cifrado**, con la misma clave que el diagrama (la misma contraseña, sal e iteraciones, y un vector inicial nuevo), así que puede viajar por correo. Un archivo de diagrama no se puede hacer pasar por uno de comentarios, ni al revés: el formato forma parte de los datos autenticados. El nombre lo escribe el revisor y no se verifica.
- **Incluir los hilos de comentarios abiertos** (apagada por defecto) mete en el archivo los hilos sin resolver para que el revisor pueda leerlos y responderlos. Los hilos marcados como **internos** nunca viajan, ni tampoco los resueltos.
- Las formas añaden unos pocos KB al archivo.

### Importar los comentarios

Abre el archivo de comentarios con el botón **Importar** (o suéltalo sobre la ventana). Diagramon pide la contraseña con la que compartiste el diagrama, abre el archivo y muestra lo que entraría antes de cambiar nada: cuántos hilos y respuestas nuevos, una vista previa de los primeros y los avisos.

- Los comentarios llegan como hilos marcados **cliente**, con el nombre y la fecha del revisor. Puedes responderlos, resolverlos, marcarlos como internos o borrarlos igual que los tuyos. Toda la importación es un solo paso de deshacer, y después se abre el diálogo **Comentarios**.
- Una respuesta a uno de tus hilos se añade a ese hilo. Un comentario sobre un componente, una conexión o un grupo que ya no existe pasa a *Todo el diagrama* y recuerda de qué trataba.
- **Importar dos veces el mismo archivo no añade nada**: cada comentario se reconoce por el id del archivo más el del comentario, y la segunda vez salen como *ya importados*. Se avisa si el archivo se hizo a partir de un documento con otro título.
- El archivo es contenido no confiable: se valida, se limita su tamaño y siempre se muestra como texto plano.
- Los hilos abiertos que no son internos también salen en el **informe**, en una sección *Comentarios abiertos*.
