# Aksara Writer

Modern markdown-to-document converter designed for Indonesian businesses and developers.

## Overview

Aksara Writer is a powerful markdown converter that generates professional documents in multiple formats (HTML, PDF, PPTX) with built-in Indonesian language support and business templates.

### Key Features

- 🚀 **Fast conversion** powered by Bun runtime
- 📄 **Multiple formats**: HTML, PDF, PowerPoint (PPTX)
- 🇮🇩 **Indonesian-first**: Built-in Bahasa Indonesia support
- 🎨 **Business templates**: Invoice, proposals, reports
- 📝 **VS Code integration**: Live preview and export
- 🏢 **Professional output**: A4, legal compliance, local standards

## Architecture

```
aksara-writer/
├── packages/
│   ├── core/           # Core conversion engine (TypeScript)
│   ├── cli/            # Command line interface
│   └── vscode/         # VS Code extension
├── templates/          # Indonesian business templates
├── themes/            # Document themes
└── examples/          # Example documents
```
### Directives
```
<!-- 
aksara:true
style: ./style.css
size: 210mmx297mm | 16:9 | 4:3
meta:
    title: dokumen title
    subtitle: dokumen subtitle
header: | left | center | right |
footer: anything
background: ../assets/background    
-->
---
page 1
---
Page 2
---
```
## Quick Start

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Start development
bun run dev

# Convert markdown to PDF
bun run cli convert document.md --format pdf
```

## VS Code Extension

The VS Code extension provides:
- Live markdown preview with Indonesian templates
- One-click export to PDF/PPTX/HTML
- Template gallery for business documents
- Indonesian language UI

## Templates

### Business Documents
- **Invoice** (Faktur) - Indonesian tax-compliant invoices
- **Proposal** (Proposal Bisnis) - Professional business proposals
- **Report** (Laporan) - Corporate reports and presentations
- **Contract** (Kontrak) - Legal document templates

### Government Documents
- **Official Letter** (Surat Resmi) - Government correspondence
- **Permit Application** (Permohonan Izin) - License applications
- **Tender Document** (Dokumen Tender) - Procurement documents

## Development

This project uses:
- **Bun** for package management and runtime
- **TypeScript** for type safety
- **Vite** for building and development
- **Puppeteer** for PDF generation
- **JSZip** for PPTX generation

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

cd aksara-writer/
bun run cli:convert test-document.md --format pdf

## License

License Comparison: MIT vs BSD 3-Clause

## Part of Ak'sara Initiative

Aksara Writer is part of the [Ak'sara Initiative](https://github.com/ak-sara) - advancing Indonesian digital literacy through locally-developed tools.