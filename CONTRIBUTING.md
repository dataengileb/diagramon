# Contributing to Diagramon

Thanks for your interest! Diagramon is a small, dependency-free project, and contributions of any size are welcome: bug reports, ideas, translations, docs and code.

## Ways to help

- **Report a bug or suggest a feature** by opening an [issue](../../issues/new/choose).
- **Fix something small** (typos, docs, a bug). Look for issues labelled `good first issue`.
- **Report a vulnerability** privately. See [SECURITY.md](SECURITY.md); please don't open a public issue for it.

## Project principles

These keep Diagramon what it is, so changes that break them will usually be declined:

1. **No external dependencies and no build step.** It must keep working by double-clicking `index.html`.
2. **No network connections.** No analytics, CDN, web fonts or APIs. The Content Security Policy in `index.html` enforces this.
3. **Customizable things live in `src/config.js`.** UI text goes in `src/i18n.js`, in both English and Spanish.
4. **Escape everything.** Any text that comes from a model, import or user input and is placed into HTML must go through `esc()` (see `src/app.js`). Never interpolate raw values into `innerHTML` or `style="…"`. Don't add inline scripts or `on…=` handlers: the CSP blocks them.

## How to send a change

1. Fork the repository and create a branch from `main` (`fix/short-description` or `feature/short-description`).
2. Make your change. Keep it focused: one topic per pull request.
3. Try it in a browser: open `index.html`, exercise the feature, and check the console for errors or CSP violations.
4. Open a pull request against `main` and fill in the template.

`main` is protected: every change goes through a pull request, and the CodeQL checks must pass before merging.

## Style

Match the surrounding code: naming, comment density and idiom. There is no formatter or linter to run.

## License

By contributing, you agree that your contribution is released under the project's [MIT License](LICENSE).
