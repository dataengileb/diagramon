<div align="center">

**English** · [Español](README.es.md)

<img src="docs/logo.svg" width="112" alt="Diagramon, a cloud with antennas">

# Diagramon

**Animated cloud architecture diagrams that live 100% on your computer.**

No server. No account. No internet. Not a single byte of your customers' data leaves your machine.

![Open source](https://img.shields.io/badge/open%20source-MIT-C2B6F6?style=flat-square)
![Privacy](https://img.shields.io/badge/privacy-100%25%20local-A6E3C8?style=flat-square)
![No install](https://img.shields.io/badge/install-none-F8C99E?style=flat-square)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-F5A9C6?style=flat-square)
![Works offline](https://img.shields.io/badge/works-offline-A9D2F3?style=flat-square)
![English and Spanish](https://img.shields.io/badge/UI-EN%20%7C%20ES-E0B5EE?style=flat-square)

<img src="docs/diagram-dark.png" alt="A 3-tier AWS web app drawn with Diagramon in dark mode, with a cost tag under each service">

</div>

---

## Why Diagramon?

Architecture diagrams often hold the most sensitive facts a team has: customer names, account IDs, IP ranges, network layout
and real costs. Most diagram tools ask you to upload all of that to someone else's cloud just to draw boxes and arrows.

**Diagramon does not.** It is a single HTML page that you open from your disk. It draws polished, animated diagrams with
around 290 official cloud icons, and the browser itself blocks every network request.

- **Private by design.** Your diagrams stay in your browser and in the files you export.
- **Zero setup.** Double-click `index.html`. No install, no build step, no sign-up.
- **Built for real architectures.** Official AWS, Azure, Google Cloud, SAP BTP and Microsoft Fabric icons, nested groups, costs and flow playback.
- **From your real infrastructure.** Drop a `terraform show -json`, a CloudFormation template, Kubernetes manifests or a `docker-compose.yml` and get the diagram, grouped by VPC, subnet or namespace.
- **Diagrams as code.** Type a short text and the canvas updates live. Text, JSON and canvas always stay in sync.
- **English or Spanish.** The app opens in English. One click switches it to Spanish.

---

## 🔒 Your data never leaves your machine

| | Diagramon | Typical cloud diagram tools |
|---|---|---|
| Where does your diagram live? | In your browser and in the files you export | On the vendor's servers |
| Account required? | No | Usually |
| Internet required? | No, not even for icons | Yes |
| Analytics or telemetry? | None | Often |
| Cloud AI for "text to diagram"? | No: the text language runs locally | Sometimes |

**How it is enforced**

- **One HTML page with plain JavaScript.** No third-party libraries, no CDN, no web fonts loaded from the internet, no trackers.
  The official icons are embedded in `assets/icons/*.js` and the three fonts in `assets/fonts/fonts.js` (base64).
- **The browser blocks the network.** `index.html` sets a Content Security Policy (`connect-src 'none'`).
  Even if someone added code that tried to send data, the browser would refuse it.
- **Short, open code.** You can read every line. There are no calls to `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon`.
- **Local autosave.** Work is saved in your browser's `localStorage`, on your machine.
  Exports (SVG, PNG, JSON) are files that you decide where to keep.

> **Tips for sensitive data:** on a shared computer, use a private window or clear the site data when you finish.
> Also review your browser extensions: they can read the pages you open, this one included.
>
> **Only import files you trust.** JSON or infrastructure-as-code files from unknown sources should be treated like any downloaded file.

---

## ✨ Features

- 🎞️ **Living diagrams**: particles travel along connections, dashed lines flow, and **Flow** plays the path step by step.
- ☁️ **Official icons** for **AWS, Azure, Google Cloud, SAP BTP and Microsoft Fabric** (about 290 services), plus generic icons.
- 🏗️ **Import infrastructure as code**: Terraform (state, plan or `.tfstate`), CloudFormation/SAM, Kubernetes and Docker Compose, parsed locally.
- 🧩 **Nested groups**: region › VPC › subnet, cluster › namespace, and more.
- 🖱️ **Multi-select, alignment and smart guides**: align, distribute with equal spacing, and snap to edges and centers.
- 💵 **Manual costs**: USD per hour, month, year or multi-year, shown under each service, with an approximate monthly total.
- 🏷️ **Data classification and encryption in transit**: tag nodes and connections as *Public, Internal, Confidential, PII, PCI* or *PHI*, mark each connection as encrypted 🔒 or not, and get a red warning when sensitive data travels unencrypted.
- ⌨️ **Diagram as code**: a small text language, with errors shown by line number.
- 🗂️ **Versions and environments**: save the canvas as *Version 1, 2, 3…* or as *Development, QA, Production*, open any of them, and compare it with the canvas: new items in green, changed in yellow, removed as red ghosts.
- ⚑ **Review findings**: raise a finding on any component by hand, with what must be fixed, who raised it, when, and the due date. Tags show *IN REVIEW*, *OVERDUE* or *RESOLVED*, and open findings are listed in the export.
- 🧭 **Data governance**: datasets on each connection with their **lineage** from origin to consumption, **owner, steward, team and cost center** per component (inherited from groups) with a **Governance** view, **region and jurisdiction** with a warning when sensitive data leaves it (*PII leaves the EU → US*), and **bronze / silver / gold** data lake layers with their own style and legend.
- 📐 **Elbow connectors**: switch between curves and right-angle lines that route around the nodes, for the whole diagram or one connection.
- 🧾 **Legend and title block** in SVG and PNG exports: connection styles, component colors, data classes, author, version, date and estimated cost. Ready to hand in.
- 🔦 **Flow highlighting** for any component: neighbors, targets, sources or everything.
- 🌐 **English and Spanish UI**: the 🌐 button in the top bar (or the **`L`** key) switches the language and remembers your choice.
- 🌗 **Dark mode** by default, **light** and **high-contrast black** modes with one key, and two palettes (Pastel and Neon).
- 📤 **Export** to SVG (animated), PNG or JSON. **Import** JSON by dropping it on the canvas.
- ↩️ **Undo and redo**, autosave and automatic layout.

<div align="center">
<img src="docs/diagram-light.png" alt="Microservices on Google Kubernetes Engine drawn with Diagramon in light mode">
</div>

---

## 🚀 Get started in 30 seconds

**Just want to try it?** Open the [online demo](https://dataengileb.github.io/diagramon/). It is the same page, served by GitHub Pages: your diagram stays in your browser.

1. **Download** the project: green **Code › Download ZIP** button, or with git:

   ```bash
   git clone https://github.com/dataengileb/diagramon.git
   ```

2. **Open** `index.html` with a double-click in any modern browser.
3. That's it. There is no step 3. 🎉

Prefer Spanish? Click the 🌐 **EN** button in the top bar, or press **`L`**.

---

## 📚 Documentation

| Guide | What you will find |
|---|---|
| [📘 Tutorial](docs/guide.md) | Step by step: your first diagram, connections, groups, costs, availability, data classification, governance, security review, compliance, STRIDE, versions, notes and zones, presenting, exporting, views, C4 levels and the [keyboard shortcuts](docs/guide.md#keyboard-shortcuts) |
| [🏗️ Import infrastructure as code](docs/iac-import.md) | Terraform, CloudFormation/SAM, Kubernetes and Docker Compose to a diagram, with the sample files |
| [🔐 Share an encrypted diagram](docs/sharing.md) | A single password-protected HTML file that opens anywhere |
| [⌨️ Diagram as code](docs/text-format.md) | The *Text* tab syntax, in English and Spanish |
| [🎨 Customize](docs/customize.md) | Themes, palettes, types, rules and templates in `src/config.js` |
| [🗂️ Project structure](docs/project-structure.md) | What each file and folder does |
| [🧭 Known gaps](docs/known-gaps.md) | What still needs testing outside the browser, small improvements not done yet, and limits by design |
| [🛣️ Ideas and possible improvements](docs/roadmap.md) | Larger changes open for contributors, such as connections between groups |

---

## 🤝 Contributing

Contributions are welcome! Open an *issue* with your idea or send a *pull request*.

To keep the spirit of the project:

- **No external dependencies** and no build step: it must keep working with a double-click.
- **No network connections**: no analytics, CDN, web fonts loaded from the web or APIs (the fonts are bundled).
- Customizable things belong in `src/config.js`. New UI text goes in `src/i18n.js`, in both languages.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the details, and [SECURITY.md](SECURITY.md) to report a vulnerability privately.

---

## 🙏 Credits

Diagramon is inspired by [**archify**](https://github.com/tt-a1i/archify) by [@tt-a1i](https://github.com/tt-a1i),
an agent skill that turns ideas, plans and codebases into interactive diagrams (MIT license).
Thank you for the inspiration. 💜

---

## 📄 License

Diagramon's code is **open source** under the [MIT license](LICENSE): use it, change it and share it freely,
including in commercial projects.

The bundled fonts are [Inter](https://github.com/rsms/inter), [IBM Plex Sans](https://github.com/IBM/plex) and [Fira Code](https://github.com/tonsky/FiraCode), under the SIL Open Font License 1.1
(copies in [`assets/fonts/OFL-Inter.txt`](assets/fonts/OFL-Inter.txt), [`assets/fonts/OFL-IBMPlexSans.txt`](assets/fonts/OFL-IBMPlexSans.txt) and [`assets/fonts/OFL-FiraCode.txt`](assets/fonts/OFL-FiraCode.txt)).

The **official icons** in `assets/icons/` belong to Amazon Web Services, Microsoft, Google and SAP, and are **not** covered by the MIT license.
AWS, Microsoft and Google allow their use in architecture diagrams under their own terms.
SAP BTP icons come from [SAP/btp-solution-diagrams](https://github.com/SAP/btp-solution-diagrams)
under the Apache 2.0 license (copy in [`assets/icons/LICENSE-SAP.txt`](assets/icons/LICENSE-SAP.txt)).
Microsoft Fabric icons come from Microsoft's official `@fabric-msft/svg-icons` package, under the MIT license
(copy in [`assets/icons/LICENSE-FABRIC.txt`](assets/icons/LICENSE-FABRIC.txt)), and follow the same usage rules as Azure icons.
SAP only publishes icons for its BTP services. Its business applications (S/4HANA, ECC, TM, EWM…) have no official icon,
so Diagramon shows them with the SAP logo.
The Azure, Google Cloud and SAP **logos** offered as group icons (an Azure subscription, a Google Cloud project, an SAP BTP account)
are trademarks of their owners, used only to identify the service. Sources and terms in [`assets/icons/LICENSE-LOGOS.txt`](assets/icons/LICENSE-LOGOS.txt).
Diagramon shows the icons unchanged: do not crop, rotate or distort them, and do not use them to represent your own product.
AWS, Azure, Microsoft Fabric, Google Cloud and SAP are trademarks of their respective owners. Diagramon is not affiliated with any of them.

<div align="center">
<sub>Made with 💜 and pastel colors. Your diagrams, on your machine.</sub>
</div>
