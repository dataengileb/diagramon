[← Diagramon](../README.md) · **English** · [Español](sharing.es.md)

# 🔐 Share an encrypted diagram

**Export › Encrypted HTML** asks for a password (12 characters or more, with a strength meter) and saves a single `.html` file.

- **Self-contained and view only.** The file carries its own small viewer. It opens in any recent browser with a double click, offline, with no Diagramon, no install and no download.
- **Everything is encrypted**, the title too. In clear there are only the encryption parameters.
- **Strong, standard crypto** from the browser (Web Crypto): the key comes from the password with PBKDF2-SHA-256 and 600,000 iterations and a random 16-byte salt; the diagram is compressed and encrypted with AES-256-GCM (random 12-byte IV), which also detects any tampering.
- **The viewer cannot leak or run anything.** It blocks the network with its own Content Security Policy and shows the diagram as an image (the comment zones are plain boxes drawn over it).
- Send the password through a **different channel** than the file. A lost password cannot be recovered.

## Let the reviewer comment

In the dialog, **Let the reviewer comment** is on by default. Turn it off to get the view-only file as before.

- **In the viewer** a **Comments** button opens a side panel. The reviewer clicks a component, a connection or a group in the diagram (or picks it from the list, which also has decisions, requirements and versions, and *The whole diagram*), writes their name and the comment, and adds it. Each reviewer sees the number of comments on every shape.
- **Nothing is sent anywhere.** The comments stay in the page until the reviewer presses **Download my comments**, which saves `diagramon-comments.json` (`diagramon-comentarios.json` in Spanish). Closing or locking the page before downloading asks for confirmation.
- **The comments file is encrypted too**, with the same key as the diagram (same password, same salt and iterations, a fresh initial vector), so it can travel by email. A diagram file cannot be passed off as a comments file, or the other way round: the format is part of the authenticated data. The name is typed by the reviewer and is not verified.
- **Include the open comment threads** (off by default) puts the unresolved threads in the file so the reviewer can read them and reply. Threads marked **internal** never travel, and neither do resolved ones.
- The shapes add a few KB to the file.

### Import the comments

Open the comments file from the **Import** button (or drop it on the window). Diagramon asks for the password used to share the diagram, opens the file and shows what would come in before changing anything: how many new threads and replies, a preview of the first ones, and warnings.

- The comments arrive as threads marked **client**, with the reviewer's name and date. You can answer, resolve, mark internal or delete them like your own. The whole import is one undo step, and the **Comments** dialog opens afterwards.
- A reply to one of your threads is added to that thread. A comment about a component, connection or group that no longer exists goes to *The whole diagram* and remembers what it was about.
- **Importing the same file twice adds nothing**: each comment is recognised by the file's own id plus the comment's id, and the second time they show as *already imported*. A warning appears if the file was made from a document with another title.
- The file is untrusted content: it is validated, limited in size and always shown as plain text.
- Open threads that are not internal also go in the **report**, in an *Open comments* section.
