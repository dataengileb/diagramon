# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's private reporting instead:
**Security tab → Report a vulnerability** (<https://github.com/dataengileb/diagramon/security/advisories/new>).

You can expect an acknowledgement within a few days. Once a fix is available we will publish an advisory and credit the reporter, unless you prefer to stay anonymous.

## Scope

Diagramon runs entirely in the browser. Reports of particular interest: XSS through diagram or imported content (Mermaid, PlantUML, draw.io, XLSX), unsafe handling of shared links, and anything that could leak user data.

## Supported versions

Only the latest version on `main` receives security fixes.
