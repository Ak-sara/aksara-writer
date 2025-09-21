# Aksara Writer - VS Code Extension

![Aksara Writer Logo](https://raw.githubusercontent.com/ak-sara/aksara-writer/main/packages/vscode/aksara.png)

**Modern markdown converter with Indonesian business templates for VS Code**

Transform your markdown documents into professional PDF, HTML, and PowerPoint presentations with Aksara Writer - the document creator designed specifically for Indonesian businesses.

## 🚀 Features

- **📄 Multiple Export Formats**: Convert markdown to PDF, HTML, and PPTX
- **🇮🇩 Indonesian Business Focus**: Templates designed for local business needs
- **👁️ Live Preview**: Real-time preview of your documents
- **📝 Business Templates**: Invoice, Proposal, Report, Contract, and more
- **🎨 Professional Themes**: Multiple themes for different document types
- **⚡ One-Click Access**: Marp-style single button for all actions

## 📦 Installation

### Prerequisites

1. **Install Bun Runtime** (required for Aksara CLI):
   ```bash
   # macOS/Linux
   curl -fsSL https://bun.sh/install | bash

   # Windows (PowerShell)
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

2. **Install Aksara Writer CLI**:
   ```bash
   # Clone the repository
   git clone https://github.com/ak-sara/aksara-writer.git
   cd aksara-writer

   # Install dependencies
   bun install

   # Test the CLI
   bun run packages/cli/src/index.ts --help
   ```

### Extension Installation

1. Download the `.vsix` file from the [releases page](https://github.com/ak-sara/aksara-writer/releases)
2. Open VS Code
3. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
4. Type "Extensions: Install from VSIX"
5. Select the downloaded `.vsix` file

## 🎯 Usage

### Getting Started

1. **Open a Markdown File**: Create or open any `.md` file in VS Code
2. **Access Aksara Writer**: Click the **"Aksara Writer"** button in the editor toolbar (▶️ icon)
3. **Choose Action**: Select from the menu:
   - 👁️ **Preview Document** - Live HTML preview
   - 📄 **Export to PDF** - Generate PDF document
   - 📊 **Export to PowerPoint** - Create PPTX presentation
   - 🌐 **Export to HTML** - Generate HTML file
   - 📝 **Insert Template** - Add business templates
   - 🎨 **Change Theme** - Select document theme

### Aksara Directives

Use special directives in your markdown to control document appearance:

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

### Available Templates

- **📄 Default** - Dokumen Umum
- **🧾 Invoice** - Faktur Penjualan
- **📋 Proposal** - Proposal Bisnis
- **📊 Report** - Laporan Bisnis
- **📝 Contract** - Kontrak Legal
- **📮 Letter** - Surat Resmi

### Themes

- **🏢 Default** - Indonesian Business
- **✨ Minimal** - Clean Design
- **🏛️ Corporate** - Formal Corporate
- **🏛️ Government** - Government Official

## 📸 Screenshots

### Single Button Interface
![Marp-style Button](https://ak-sara.github.io/assets/vscode-button.png)

### Command Palette
![Action Menu](https://ak-sara.github.io/assets/vscode-menu.png)

### Live Preview
![Preview Window](https://ak-sara.github.io/assets/vscode-preview.png)

## ⚙️ Configuration

Access settings via `File > Preferences > Settings` and search for "Aksara":

- **Default Locale**: `id` (Indonesian) or `en` (English)
- **Default Theme**: Document theme selection
- **Default Page Size**: A4, Letter, or Legal
- **Auto Preview**: Automatically show preview for markdown files

## 🔧 Troubleshooting

### Common Issues

**Q: "Module not found" error when using commands**
- **A**: Ensure Bun is installed and Aksara Writer CLI is properly set up in your project

**Q: Preview not updating**
- **A**: Save your markdown file first, then try the preview again

**Q: Export fails**
- **A**: Check that your markdown file is saved and contains valid Aksara directives

### Getting Help

- 📖 **Documentation**: [ak-sara.github.io](https://ak-sara.github.io)
- 🐛 **Issues**: [GitHub Issues](https://github.com/ak-sara/aksara-writer/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/ak-sara/aksara-writer/discussions)

## 🤝 Contributing

Aksara Writer is part of the **Ak'sara Initiative** - advancing Indonesia's digital literacy.

### Ways to Contribute

1. **Report Bugs**: Found an issue? [Report it here](https://github.com/ak-sara/aksara-writer/issues)
2. **Feature Requests**: Have ideas? [Share them with us](https://github.com/ak-sara/aksara-writer/discussions)
3. **Code Contributions**: Fork the repo and submit pull requests
4. **Templates**: Create Indonesian business templates
5. **Translations**: Help localize for different regions

### Development

```bash
# Clone and setup
git clone https://github.com/ak-sara/aksara-writer.git
cd aksara-writer/packages/vscode

# Install dependencies
bun install

# Build extension
bun run build

# Package extension
bun run package
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🌟 About Ak'sara Initiative

**Ak'sara**, draws from the Sanskrit word for "character" or "alphabet," which holds a deep connection to Indonesian culture. We believe that just as every story is built from individual letters, the best applications are crafted from well-written code. 

Our philosophy is simple: we compose, not just code. Like the ancient scripts of the Nusantara archipelago, each line of code is a fundamental character, which, when thoughtfully arranged, forms a powerful instruction that brings visions to life.

### Our Projects

- **Aksara Writer** - Document creator for businesses
- **Aksara IS** - No-code application builder (Svelte)
- **Personal AI Assistant** - Offline AI assistant (Tauri + Rust)
- **MerdekaOS** - Arch-based Linux distribution

**Learn more**: [ak-sara.github.io](https://ak-sara.github.io)

---

**Made with ❤️ for Indonesian businesses by the Ak'sara Initiative**

![Indonesian Flag](https://img.shields.io/badge/🇮🇩-Proudly%20Indonesian-red?style=flat-square)
![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue?style=flat-square&logo=visual-studio-code)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)