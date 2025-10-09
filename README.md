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

## Using aksara-writer-core in Tauri Apps

`aksara-writer-core` is now compatible with Tauri applications! Since Tauri runs in a sandboxed browser environment, PDF generation works differently:

### Installation

```bash
# Install without puppeteer (optional dependency)
bun add aksara-writer-core
```

### Usage in Tauri

```typescript
import { AksaraConverter } from 'aksara-writer-core';

// Initialize converter with basePath
const converter = new AksaraConverter({
  format: 'html',  // Use HTML format for Tauri
  basePath: '/path/to/your/assets'  // Required: replace process.cwd()
});

// Convert markdown to HTML
const markdown = `<!--
aksara:true
type: document
-->
# My Document
Content here...`;

const result = await converter.convert(markdown);

if (result.success) {
  // Load HTML in Tauri webview
  const htmlContent = result.data.toString();

  // Use Tauri's print API for PDF generation
  await invoke('print_to_pdf', { html: htmlContent });
}
```

### PDF Generation in Tauri

Since Puppeteer doesn't work in Tauri, implement PDF generation using:

**Option 1: Tauri Print Command** (Recommended)
```rust
// src-tauri/src/main.rs
use tauri::command;

#[command]
async fn print_to_pdf(html: String) -> Result<Vec<u8>, String> {
    // Use webview print functionality
    // Implementation depends on your Tauri setup
    Ok(vec![])
}
```

**Option 2: Use `@tauri-apps/plugin-dialog`**
```typescript
import { save } from '@tauri-apps/plugin-dialog';

// Render HTML in hidden webview
// Trigger window.print() or system print dialog
```

### Key Differences

| Feature | Node.js/CLI | Tauri |
|---------|-------------|-------|
| **Puppeteer** | ✅ Available | ❌ Not available |
| **PDF Generation** | Built-in | Use webview print |
| **HTML Export** | ✅ Supported | ✅ Supported |
| **PPTX Export** | ✅ Supported | ✅ Supported (JSZip works) |
| **File System** | `fs` module | Tauri FS API |
| **Base Path** | `process.cwd()` | Manual via `basePath` option |

### Complete Tauri Example

```typescript
import { invoke } from '@tauri-apps/api/core';
import { AksaraConverter } from 'aksara-writer-core';
import { readTextFile } from '@tauri-apps/plugin-fs';

async function convertMarkdownToPdf(markdownPath: string) {
  // Read markdown file using Tauri FS
  const markdownContent = await readTextFile(markdownPath);

  // Convert to HTML
  const converter = new AksaraConverter({
    format: 'html',
    basePath: await invoke('get_app_dir')  // Get base directory from Rust
  });

  const result = await converter.convert(markdownContent);

  if (result.success) {
    // Generate PDF using Tauri backend
    const pdfBytes = await invoke('html_to_pdf', {
      html: result.data.toString()
    });

    return pdfBytes;
  }

  throw new Error(result.error);
}
```

## Development

This project uses:
- **Bun** for package management and runtime
- **TypeScript** for type safety
- **Vite** for building and development
- **Puppeteer** for PDF generation (optional in Tauri)
- **JSZip** for PPTX generation

### Local Development Setup

For development with local packages linking:

#### 1. Uninstall Global Packages (if any)
```bash
# Remove any globally installed versions
bun remove -g aksara-writer-core
bun remove -g aksara-writer
```

#### 2. Setup Local Development Links
```bash
# In project root
cd aksara-writer

# Install dependencies (this installs for all workspace packages)
bun install

# Create local links for development
cd packages/core
bun link                    # Make core available for linking

cd ../cli
bun link aksara-writer-core # Link to local core package
bun run build              # Build the CLI
bun link                   # Make CLI globally available

cd ../vscode
# VSCode extension uses CLI via shell commands, no direct core linking needed

# Back to root for development
cd ../..
```

#### 3. Development Commands
```bash
# Build all packages in development mode
bun run dev

# Or build individual packages
cd packages/core && bun run dev    # Core package (watch mode)
cd packages/cli && bun run dev     # CLI package (watch mode)
cd packages/vscode && bun run dev  # VSCode extension (watch mode)

# Test CLI locally
bun run cli convert test.md --format pdf
```

#### 4. Revert to NPM Install (After Development)
When you're done with development and want to use published packages:

```bash
# Unlink local packages
cd packages/cli
bun unlink aksara-writer-core
bun unlink  # Remove global CLI link

cd ../core
bun unlink

# Install published packages from registry
cd ../../  # Back to root
bun install --production

# Or install globally for system-wide use
bun install -g aksara-writer
```

### Development Workflow
1. **Core changes**: Edit in `packages/core/src/` → Auto-rebuild with `bun run dev`
2. **CLI changes**: Edit in `packages/cli/src/` → Test with `bun run cli`
3. **VSCode changes**: Edit in `packages/vscode/src/` → Package with `bun run package`

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

cd aksara-writer/
bun run cli:convert test-document.md --format pdf

## License

License Comparison: MIT vs BSD 3-Clause

## Part of Ak'sara Initiative

Aksara Writer is part of the [Ak'sara Initiative](https://github.com/ak-sara) - advancing Indonesian digital literacy through locally-developed tools.