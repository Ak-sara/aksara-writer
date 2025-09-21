/**
 * Aksara Writer VS Code Extension
 * Provides markdown conversion and preview capabilities
 */

import * as vscode from 'vscode';
// import { AksaraConverter, ConvertOptions } from '../../core/src/index';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Global reference to the single preview panel
let globalPreviewPanel: vscode.WebviewPanel | undefined;
let previewSubscriptions: vscode.Disposable[] = [];

interface ConvertOptions {
    format: 'html' | 'pdf' | 'pptx';
    locale?: 'id' | 'en';
    theme?: string;
    pageSize?: 'A4' | 'Letter' | 'Legal';
}
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Convert document using Aksara CLI
 */
async function convertWithCli(filePath: string, options: ConvertOptions): Promise<{success: boolean, data?: string, error?: string}> {
    try {
        // Find the aksara-writer project root by looking for package.json
        let projectRoot = path.dirname(filePath);
        while (projectRoot !== path.dirname(projectRoot)) {
            const packagePath = path.join(projectRoot, 'package.json');
            try {
                const packageContent = await fs.readFile(packagePath, 'utf-8');
                if (packageContent.includes('"aksara-writer"')) {
                    break;
                }
            } catch {}
            projectRoot = path.dirname(projectRoot);
        }

        const cliPath = path.join(projectRoot, 'packages/cli/src/index.ts');
        const command = `bun run "${cliPath}" convert "${filePath}" --format ${options.format}`;

        const { stdout, stderr } = await execAsync(command, { cwd: path.dirname(filePath) });

        // Check if conversion was successful by looking for success message
        if (stderr && !stderr.includes('Document converted successfully') && !stdout.includes('Document converted successfully')) {
            return { success: false, error: stderr };
        }

        // For HTML format, read the output file
        if (options.format === 'html') {
            const outputPath = filePath.replace(/\.md$/, '.html');
            try {
                const htmlContent = await fs.readFile(outputPath, 'utf-8');
                return { success: true, data: htmlContent };
            } catch (readError) {
                return { success: false, error: `Could not read HTML output: ${readError}` };
            }
        }

        return { success: true, data: stdout };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Aksara Writer extension is now active!');

    // Register main menu command
    const command = vscode.commands.registerCommand('aksara.showMenu', showAksaraMenu);
    context.subscriptions.push(command);

    // Show welcome message
    vscode.window.showInformationMessage(
        'Aksara Writer is ready! 🚀',
        'View Templates',
        'Documentation'
    ).then(selection => {
        if (selection === 'View Templates') {
            insertTemplate();
        } else if (selection === 'Documentation') {
            vscode.env.openExternal(vscode.Uri.parse('https://ak-sara.github.io'));
        }
    });
}

/**
 * Show Aksara Writer menu (like Marp)
 */
async function showAksaraMenu() {
    const menuItems = [
        { label: '👁️ Preview Document', description: 'Open live preview', action: 'preview' },
        { label: '📄 Export to PDF', description: 'Generate PDF document', action: 'pdf' },
        { label: '📊 Export to PowerPoint', description: 'Generate PPTX presentation', action: 'pptx' },
        { label: '🌐 Export to HTML', description: 'Generate HTML document', action: 'html' },
        { label: '📝 Insert Template', description: 'Add business template', action: 'template' },
        { label: '🎨 Change Theme', description: 'Select document theme', action: 'theme' }
    ];

    const selected = await vscode.window.showQuickPick(menuItems, {
        placeHolder: 'Choose an action for your Aksara document'
    });

    if (!selected) return;

    switch (selected.action) {
        case 'preview':
            await previewDocument();
            break;
        case 'pdf':
            await exportDocument('pdf');
            break;
        case 'pptx':
            await exportDocument('pptx');
            break;
        case 'html':
            await exportDocument('html');
            break;
        case 'template':
            await insertTemplate();
            break;
        case 'theme':
            await changeTheme();
            break;
    }
}

/**
 * Preview current markdown document
 */
async function previewDocument(context?: vscode.ExtensionContext) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showErrorMessage('Please open a markdown file first');
        return;
    }

    try {
        const document = editor.document;
        const markdown = document.getText();

        const config = vscode.workspace.getConfiguration('aksara');
        const options: ConvertOptions = {
            format: 'html',
            locale: config.get<'id' | 'en'>('defaultLocale', 'id'),
            theme: config.get<string>('defaultTheme', 'default'),
            pageSize: config.get<'A4' | 'Letter' | 'Legal'>('defaultPageSize', 'A4')
        };

        // Use CLI to convert document
        const result = await convertWithCli(document.fileName, options);

        if (!result.success) {
            vscode.window.showErrorMessage(`Failed to create preview: ${result.error}`);
            return;
        }

        // Create or reuse panel
        if (!globalPreviewPanel) {
            // Create new panel
            globalPreviewPanel = vscode.window.createWebviewPanel(
                'aksaraPreview',
                `Preview: ${path.basename(document.fileName)}`,
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: context ? [
                        vscode.Uri.file(path.dirname(document.fileName)),
                        vscode.Uri.file(path.join(context.extensionPath, 'dist'))
                    ] : [vscode.Uri.file(path.dirname(document.fileName))]
                }
            );

            // Clear reference when panel is disposed
            globalPreviewPanel.onDidDispose(() => {
                globalPreviewPanel = undefined;
            });
        }

        // Inject document path information for image resolution
        const docUri = globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(document.fileName));
        const docDir = globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(path.dirname(document.fileName)));

        const htmlWithInjectedPath = result.data!.toString().replace(
            '<body>',
            `<body>
            <script>
                window.documentUri = '${docUri}';
                window.documentDir = '${docDir}';
            </script>`
        );

        // Update panel content
        globalPreviewPanel.title = `Preview: ${path.basename(document.fileName)}`;
        globalPreviewPanel.webview.html = htmlWithInjectedPath;
        globalPreviewPanel.reveal(vscode.ViewColumn.Beside);

        // Set up subscriptions only once when creating the panel
        if (previewSubscriptions.length === 0) {
            // Update preview when active document changes
            const activeEditorChangeSubscription = vscode.window.onDidChangeActiveTextEditor(async activeEditor => {
                if (activeEditor && activeEditor.document.languageId === 'markdown' && globalPreviewPanel) {
                    const markdown = activeEditor.document.getText();
                    if (markdown.includes('aksara:true') || markdown.includes('data-aksara')) {
                        // Save document and re-convert
                        if (activeEditor.document.isDirty) {
                            await activeEditor.document.save();
                        }
                        const updatedResult = await convertWithCli(activeEditor.document.fileName, options);
                        if (updatedResult.success) {
                            // Inject document path information
                            const docUri = globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(activeEditor.document.fileName));
                            const docDir = globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(path.dirname(activeEditor.document.fileName)));

                            const htmlWithPaths = updatedResult.data!.toString().replace(
                                '<body>',
                                `<body>
                                <script>
                                    window.documentUri = '${docUri}';
                                    window.documentDir = '${docDir}';
                                </script>`
                            );

                            globalPreviewPanel.title = `Preview: ${path.basename(activeEditor.document.fileName)}`;
                            globalPreviewPanel.webview.html = htmlWithPaths;
                        }
                    } else {
                        // Hide or close preview for non-Aksara documents
                        globalPreviewPanel.dispose();
                    }
                }
            });

            // Update preview when document changes
            const changeSubscription = vscode.workspace.onDidChangeTextDocument(async event => {
                if (event.document.languageId === 'markdown' && globalPreviewPanel) {
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor && event.document === activeEditor.document) {
                        const markdown = event.document.getText();
                        if (markdown.includes('aksara:true') || markdown.includes('data-aksara')) {
                            // Save document and re-convert
                            if (event.document.isDirty) {
                                await event.document.save();
                            }
                            const updatedResult = await convertWithCli(event.document.fileName, options);
                            if (updatedResult.success) {
                                // Inject document path information
                                const docUri = globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(event.document.fileName));
                                const docDir = globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(path.dirname(event.document.fileName)));

                                const htmlWithPaths = updatedResult.data!.toString().replace(
                                    '<body>',
                                    `<body>
                                    <script>
                                        window.documentUri = '${docUri}';
                                        window.documentDir = '${docDir}';
                                    </script>`
                                );

                                globalPreviewPanel.title = `Preview: ${path.basename(event.document.fileName)}`;
                                globalPreviewPanel.webview.html = htmlWithPaths;
                            }
                        } else {
                            // Close preview if Aksara directive is removed
                            globalPreviewPanel.dispose();
                        }
                    }
                }
            });

            previewSubscriptions.push(activeEditorChangeSubscription, changeSubscription);

            // Clear reference and dispose subscriptions when panel is disposed
            globalPreviewPanel.onDidDispose(() => {
                previewSubscriptions.forEach(sub => sub.dispose());
                previewSubscriptions = [];
                globalPreviewPanel = undefined;
            });
        }

    } catch (error) {
        vscode.window.showErrorMessage(`Error preview: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Export document to specified format
 */
async function exportDocument(format: 'pdf' | 'pptx' | 'html') {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showErrorMessage('Please open a markdown file first');
        return;
    }

    try {
        // Save document if dirty
        if (editor.document.isDirty) {
            await editor.document.save();
        }

        const document = editor.document;
        const markdown = document.getText();

        const config = vscode.workspace.getConfiguration('aksara');
        const options: ConvertOptions = {
            format,
            locale: config.get<'id' | 'en'>('defaultLocale', 'id'),
            theme: config.get<string>('defaultTheme', 'default'),
            pageSize: config.get<'A4' | 'Letter' | 'Legal'>('defaultPageSize', 'A4')
        };

        // Show progress
        const progress = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Exporting to ${format.toUpperCase()}...`,
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Processing document...' });

            // Save document first
            await document.save();

            // Use CLI to convert
            const result = await convertWithCli(document.fileName, options);

            if (!result.success) {
                throw new Error(result.error);
            }

            progress.report({ increment: 50, message: 'Menyimpan file...' });

            // Get output path
            const inputPath = document.fileName;
            const ext = format === 'pptx' ? '.pptx' : format === 'pdf' ? '.pdf' : '.html';
            const outputPath = inputPath.replace(/\.md$/, ext);

            progress.report({ increment: 100, message: 'Complete!' });

            return outputPath;
        });

        vscode.window.showInformationMessage(
            `Document exported to ${format.toUpperCase()} successfully`,
            'Open File'
        ).then(selection => {
            if (selection === 'Open File') {
                vscode.env.openExternal(vscode.Uri.file(progress));
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Insert template into current document
 */
async function insertTemplate() {
    const templates = [
        { label: '📄 Default - General Document', value: 'default' },
        { label: '🧾 Invoice - Sales Invoice', value: 'invoice' },
        { label: '📋 Proposal - Business Proposal', value: 'proposal' },
        { label: '📊 Report - Business Report', value: 'report' },
        { label: '📝 Contract - Legal Contract', value: 'contract' },
        { label: '📮 Letter - Official Letter', value: 'letter' }
    ];

    const selected = await vscode.window.showQuickPick(templates, {
        placeHolder: 'Select document template'
    });

    if (!selected) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        // Create new file
        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: getTemplateContent(selected.value)
        });
        await vscode.window.showTextDocument(doc);
    } else {
        // Insert into current document
        const position = editor.selection.active;
        await editor.edit(editBuilder => {
            editBuilder.insert(position, getTemplateContent(selected.value));
        });
    }
}

/**
 * Change document theme
 */
async function changeTheme() {
    const themes = [
        { label: '🏢 Default - Indonesian Business', value: 'default' },
        { label: '✨ Minimal - Clean Design', value: 'minimal' },
        { label: '🏛️ Corporate - Formal Corporate', value: 'corporate' },
        { label: '🏛️ Government - Government Official', value: 'government' }
    ];

    const selected = await vscode.window.showQuickPick(themes, {
        placeHolder: 'Select document theme'
    });

    if (!selected) return;

    const config = vscode.workspace.getConfiguration('aksara');
    await config.update('defaultTheme', selected.value, vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage(`Theme changed to: ${selected.label}`);
}

/**
 * Get template content
 */
function getTemplateContent(template: string): string {
    const templates = {
        default: `---
title: "Dokumen Bisnis"
author: "Nama Penulis"
subject: "Dokumen Professional"
locale: id
pageSize: A4
---

# Judul Dokumen

## Pendahuluan

Ini adalah dokumen bisnis yang dibuat dengan **Aksara Writer**.

### Fitur Utama

- ✅ Konversi ke PDF, HTML, dan PPTX
- 🇮🇩 Dukungan Bahasa Indonesia
- 📄 Template bisnis profesional
- 🎨 Tema yang dapat disesuaikan

## Kesimpulan

Aksara Writer memudahkan pembuatan dokumen profesional untuk bisnis Indonesia.

---
*Dibuat dengan Aksara Writer*
`,

        invoice: `---
title: "Faktur Penjualan"
author: "PT. Nama Perusahaan"
subject: "Faktur #INV-001"
template: invoice
locale: id
---

# FAKTUR PENJUALAN

**Nomor:** INV-001
**Tanggal:** ${new Date().toLocaleDateString('id-ID')}

## Data Perusahaan

**PT. Nama Perusahaan**
Alamat: Jl. Contoh No. 123, Jakarta
NPWP: 01.234.567.8-901.000
Telp: (021) 1234567

## Data Pelanggan

**Nama:** [Nama Pelanggan]
**Alamat:** [Alamat Pelanggan]
**NPWP:** [NPWP Pelanggan]

## Detail Barang/Jasa

| No | Deskripsi | Qty | Harga Satuan | Total |
|----|-----------|-----|--------------|-------|
| 1  | [Item 1]  | 1   | Rp 1.000.000| Rp 1.000.000 |
| 2  | [Item 2]  | 2   | Rp 500.000   | Rp 1.000.000 |

**Subtotal:** Rp 2.000.000
**PPN 11%:** Rp 220.000
**Total:** Rp 2.220.000

---
*Faktur dibuat dengan Aksara Writer*
`,

        proposal: `---
title: "Proposal Bisnis"
author: "Nama Tim/Perusahaan"
subject: "Proposal Kerjasama"
template: proposal
locale: id
---

# PROPOSAL BISNIS

## Ringkasan Eksekutif

[Ringkasan singkat tentang proposal bisnis Anda]

## Latar Belakang

### Identifikasi Masalah
- Masalah 1
- Masalah 2
- Masalah 3

### Peluang Pasar
[Deskripsi peluang pasar yang ada]

## Solusi yang Ditawarkan

### Produk/Layanan
[Deskripsi produk atau layanan yang ditawarkan]

### Keunggulan Kompetitif
- Keunggulan 1
- Keunggulan 2
- Keunggulan 3

## Kesimpulan

[Kesimpulan dan ajakan untuk bekerjasama]

---
*Proposal dibuat dengan Aksara Writer*
`
    };

    return templates[template as keyof typeof templates] || templates.default;
}

/**
 * Webview provider for preview panel
 */
class AksaraPreviewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getWelcomeHtml();
    }

    private getWelcomeHtml(): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Aksara Writer</title>
            <style>
                body {
                    font-family: 'Segoe UI', sans-serif;
                    padding: 20px;
                    text-align: center;
                    color: #333;
                }
                .logo { font-size: 2em; margin-bottom: 1em; }
                .welcome { margin-bottom: 2em; }
                .actions button {
                    background: #007ACC;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    margin: 5px;
                    border-radius: 4px;
                    cursor: pointer;
                }
            </style>
        </head>
        <body>
            <div class="logo">📝 Aksara Writer</div>
            <div class="welcome">
                <p>Selamat datang di <strong>Aksara Writer</strong>!</p>
                <p>Buat dokumen profesional dengan mudah.</p>
            </div>
            <div class="actions">
                <p>Buka file markdown untuk melihat preview di sini.</p>
            </div>
        </body>
        </html>
        `;
    }
}

export function deactivate() {}