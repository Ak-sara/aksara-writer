# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
```bash
# Install dependencies
bun install

# Run demos and tests
bun run demo              # Quick test conversion
bun run test-full         # Full test suite

# CLI commands
bun run cli               # Run CLI directly
bun run cli:init          # Initialize project
bun run cli:convert       # Convert documents
bun run cli:templates     # List templates
bun run cli:themes        # List themes
```

### Package Development
```bash
# Core package (packages/core)
cd packages/core
bun run build            # Build: tsc && vite build
bun run dev              # Development: vite build --watch
bun run test             # Run tests

# CLI package (packages/cli)
cd packages/cli
bun run build            # Build: tsc && chmod +x dist/index.js
bun run dev              # Development: tsc --watch
bun run test             # Run tests

# VSCode extension (packages/vscode)
cd packages/vscode
bun run build            # Build: tsc && webpack --mode production
bun run dev              # Development: tsc --watch
bun run package          # Package extension: vsce package --no-dependencies
bun run publish          # Publish: vsce publish --no-dependencies
```

## Architecture Overview

### Monorepo Structure
This is a **Bun-based TypeScript monorepo** with three main packages:

- **`packages/core`**: Core conversion engine (TypeScript → JavaScript via Vite)
  - Converts markdown to HTML/PDF/PPTX
  - Uses Puppeteer for PDF generation, JSZip for PPTX
  - Includes Indonesian business document templates

- **`packages/cli`**: Command-line interface
  - Depends on `aksara-writer-core`
  - Built with Commander.js, Chalk, Ora

- **`packages/vscode`**: VS Code extension
  - Live preview and export functionality
  - Built with Webpack for VS Code compatibility

### Key Technologies
- **Runtime**: Bun (development and execution)
- **Language**: TypeScript with ES2022 target
- **Bundling**: Vite (core), Webpack (VSCode), TypeScript compiler (CLI)
- **PDF Generation**: Puppeteer
- **PPTX Generation**: JSZip
- **Markdown Processing**: Custom parser with Indonesian language support

### Core Conversion Flow
1. **Parse Aksara Directives**: Extract configuration from HTML comments
   ```markdown
   <!--
   aksara:true
   type: document | presentation
   size: A4 | 16:9 | 4:3
   meta:
       title: Document Title
       subtitle: Document Subtitle
   -->
   ```

2. **Section Parsing**: Split content by `---` separators for multi-page documents
3. **Markdown to HTML**: Custom parser with table support, image handling, Indonesian text processing
4. **Format-Specific Conversion**:
   - HTML: Template-based output with CSS styling
   - PDF: Puppeteer HTML-to-PDF conversion
   - PPTX: JSZip-based PowerPoint generation

### Template System
Templates located in `packages/core/templates/` and `packages/core/styles/`:
- `document.html` / `document.css`: A4 document layouts
- `presentation.css`: Slide-based layouts
- `document-controls.html`: Interactive preview controls
- Indonesian business templates (invoices, proposals, reports)
- Document/Letter Format

### Important Development Notes
- **Bun Runtime**: All scripts use `bun run` not `npm run`
- **TypeScript Configuration**: Root `tsconfig.json` covers all packages
- **Module System**: ESModule (`"type": "module"` in package.json)
- **Path Handling**: Image paths converted to base64 data URLs for cross-platform compatibility
- **Indonesian Focus**: Built-in support for Bahasa Indonesia business documents

### Testing
- Run `bun run demo` for quick functionality test
- Run `bun run test-full` for comprehensive testing
- Individual package tests with `bun run test` in package directories

### Publishing
Packages are published to NPM:
- `aksara-writer-core` (core engine)
- `aksara-writer` (CLI tool)
- VS Code extension published to marketplace as `aksara-writer-vscode`