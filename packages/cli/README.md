# Aksara Writer CLI

[![npm version](https://badge.fury.io/js/aksara-writer.svg)](https://badge.fury.io/js/aksara-writer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Modern markdown-to-document converter designed for Indonesian businesses. Convert your markdown files to professional PDF, HTML, and PowerPoint presentations with Indonesian business templates.

## Installation

### Global Installation

```bash
npm install -g aksara-writer
```

### Usage

After installation, you can use the `aksara-writer` command globally:

```bash
# Convert markdown to PDF
aksara-writer convert document.md --format pdf --output document.pdf

# Convert to HTML with specific theme
aksara-writer convert proposal.md --format html --theme corporate --output proposal.html

# Convert to PowerPoint presentation
aksara-writer convert presentation.md --format pptx --output presentation.pptx
```

## Commands

### Convert

Convert markdown files to various formats:

```bash
aksara-writer convert <input.md> [options]
```

**Options:**
- `-f, --format <format>` - Output format: `html`, `pdf`, or `pptx` (default: html)
- `-o, --output <output>` - Output file path
- `-t, --theme <theme>` - Document theme: `default`, `minimal`, `corporate`, `government`
- `--template <template>` - Document template: `default`, `invoice`, `proposal`, `report`, `contract`, `letter`
- `--locale <locale>` - Document locale: `id` (Indonesian) or `en` (English) (default: id)

### Templates

List available templates:

```bash
aksara-writer templates
```

### Themes

List available themes:

```bash
aksara-writer themes
```

### Initialize

Create a sample markdown file with Aksara directives:

```bash
aksara-writer init [filename]
```

## Aksara Directives

Add special directives to your markdown to control document appearance:

```markdown
<!--
aksara:true
type: presentation
size: 16:9
meta:
    title: My Presentation
    subtitle: Professional Document
header: | ![image w:40px h:40px](./logo.svg) | Company Name | 2025 |
footer: © 2025 Your Company - Confidential
background: ./background.jpg
-->

# Your Content Here
```

## Document Types

### Document Mode
Perfect for formal business documents, contracts, and reports with A4 page sizing.

```markdown
<!--
aksara:true
type: document
template: proposal
theme: corporate
-->
```

### Presentation Mode
Ideal for slide presentations with 16:9 or 4:3 aspect ratios.

```markdown
<!--
aksara:true
type: presentation
size: 16:9
theme: minimal
-->
```

## Templates

- **📄 Default** - Dokumen Umum
- **🧾 Invoice** - Faktur Penjualan
- **📋 Proposal** - Proposal Bisnis
- **📊 Report** - Laporan Bisnis
- **📝 Contract** - Kontrak Legal
- **📮 Letter** - Surat Resmi

## Themes

- **🏢 Default** - Indonesian Business
- **✨ Minimal** - Clean Design
- **🏛️ Corporate** - Formal Corporate
- **🏛️ Government** - Government Official

## Examples

### Business Proposal
```bash
aksara-writer convert proposal.md --format pdf --template proposal --theme corporate
```

### Invoice
```bash
aksara-writer convert invoice.md --format html --template invoice
```

### Presentation
```bash
aksara-writer convert slides.md --format pptx --theme minimal
```

## Requirements

- Node.js 18.0.0 or higher
- Modern web browser (for PDF generation)

## About Ak'sara Initiative

**Ak'sara** draws from the Sanskrit word for "character" or "alphabet," representing our mission to advance Indonesia's digital literacy. We believe that just as every story is built from individual letters, the best applications are crafted from well-written code.

### Our Projects

- **Aksara Writer** - Document creator for businesses
- **Aksara IS** - No-code application builder
- **Personal AI Assistant** - Offline AI assistant
- **MerdekaOS** - Arch-based Linux distribution

**Learn more**: [ak-sara.github.io](https://ak-sara.github.io)

## Contributing

We welcome contributions! Please see our [contribution guidelines](https://github.com/ak-sara/aksara-writer/blob/main/CONTRIBUTING.md).

## License

MIT License - see [LICENSE](https://github.com/ak-sara/aksara-writer/blob/main/LICENSE) file for details.

---

**Made with ❤️ for Indonesian businesses by the Ak'sara Initiative**

![Indonesian Flag](https://img.shields.io/badge/🇮🇩-Proudly%20Indonesian-red?style=flat-square)