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

  MIT License (Current)

  Pros:
  - ✅ Most popular - Widely recognized and trusted
  - ✅ Simple & short - Easy to understand
  - ✅ Maximum adoption - No barriers for commercial use
  - ✅ GitHub friendly - Default choice for many projects

  Cons:
  - ❌ No trademark protection - Anyone can use your project name
  - ❌ No patent grants - Less legal protection

  BSD 3-Clause License

  Pros:
  - ✅ Trademark protection - Prevents unauthorized use of your name "Ak'sara"
  - ✅ Endorsement clause - Others can't claim your endorsement
  - ✅ Still permissive - Similar freedom as MIT
  - ✅ Better for branding - Protects "Ak'sara Initiative" identity

  Cons:
  - ❌ Slightly more complex - Additional clause to understand
  - ❌ Less common - Though still well-known

  Recommendation for Ak'sara Initiative

  I recommend BSD 3-Clause because:
  1. 🏛️ Brand Protection - "Ak'sara" and "Ak'sara Initiative" are valuable brands
  2. 🇮🇩 Indonesian Identity - Protects the cultural significance
  3. 🚀 Future Projects - Consistent licensing across MerdekaOS, Personal AI, etc.

  Publishing Requirements

  📦 NPM Repository

  Prerequisites:
  1. NPM Account - Create at npmjs.com
  2. Email Verification - Verify your email
  3. 2FA Setup - Required for publishing

  Publishing Steps:
  # 1. Login to npm
  npm login

  # 2. Build packages
  cd packages/core && npm run build
  cd ../cli && npm run build

  # 3. Publish core first
  cd packages/core && npm publish

  # 4. Then publish CLI
  cd ../cli && npm publish

  Requirements:
  - ✅ Unique package names - aksara-writer and aksara-writer-core
  - ✅ Valid package.json - We already have this
  - ✅ README files - We already have this
  - ✅ License file - Need to add

  🛍️ VS Code Marketplace

  Prerequisites:
  1. Microsoft Account - For Azure DevOps
  2. Azure DevOps Organization - Free tier
  3. Personal Access Token - With Marketplace permissions
  4. Publisher Account - Register "ak-sara" or "aksara-initiative"

  Publishing Steps:
  # 1. Install vsce
  npm install -g vsce

  # 2. Create publisher (one-time)
  vsce create-publisher ak-sara

  # 3. Login with token
  vsce login ak-sara

  # 4. Package and publish
  cd packages/vscode
  vsce publish

  The main decision is the license choice - BSD 3-Clause would better protect the "Ak'sara" brand identity, which seems important for your
  Indonesian digital literacy initiative.

## Part of Ak'sara Initiative

Aksara Writer is part of the [Ak'sara Initiative](https://github.com/ak-sara) - advancing Indonesian digital literacy through locally-developed tools.