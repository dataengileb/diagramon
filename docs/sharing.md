[← Diagramon](../README.md) · **English** · [Español](sharing.es.md)

# 🔐 Share an encrypted diagram

**Export › Encrypted HTML** asks for a password (12 characters or more, with a strength meter) and saves a single `.html` file.

- **Self-contained and view only.** The file carries its own small viewer. It opens in any recent browser with a double click, offline, with no Diagramon, no install and no download.
- **Everything is encrypted**, the title too. In clear there are only the encryption parameters.
- **Strong, standard crypto** from the browser (Web Crypto): the key comes from the password with PBKDF2-SHA-256 and 600,000 iterations and a random 16-byte salt; the diagram is compressed and encrypted with AES-256-GCM (random 12-byte IV), which also detects any tampering.
- **The viewer cannot leak or run anything.** It blocks the network with its own Content Security Policy and shows the diagram as an image.
- Send the password through a **different channel** than the file. A lost password cannot be recovered.
