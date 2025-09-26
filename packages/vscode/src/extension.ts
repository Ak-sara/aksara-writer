/**
 * Aksara Writer VS Code Extension
 * Provides markdown conversion and preview capabilities
 */

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, basename, extname, dirname } from 'path';
import * as path from 'path';

// Define types locally to avoid import issues
interface ConvertOptions {
    format: 'html' | 'pdf' | 'pptx';
    locale?: 'id' | 'en';
    theme?: string;
    pageSize?: 'A4' | 'Letter' | 'Legal';
    orientation?: 'portrait' | 'landscape';
}

const execAsync = promisify(exec);

// Global reference to the single preview panel
let globalPreviewPanel: vscode.WebviewPanel | undefined;
let previewSubscriptions: vscode.Disposable[] = [];

// Debouncing for live preview updates
let previewUpdateTimeout: NodeJS.Timeout | undefined;

// Editor-Preview Sync System
let syncEnabled = true;
let isUpdatingFromPreview = false;

// Sync helper functions
function setupEditorPreviewSync(editor: vscode.TextEditor, panel: vscode.WebviewPanel) {
    console.log('🔧 Setting up editor-preview sync for:', editor.document.fileName);

    // Track cursor/scroll changes
    const cursorSubscription = vscode.window.onDidChangeTextEditorSelection(event => {
        if (event.textEditor === editor && !isUpdatingFromPreview && syncEnabled) {
            const line = event.selections[0].active.line;
            const section = getSectionFromLine(editor.document, line);

            console.log('📤 Sending cursor-moved to preview:', { line, section });
            panel.webview.postMessage({
                type: 'cursor-moved',
                line: line,
                section: section
            });
        }
    });

    const scrollSubscription = vscode.window.onDidChangeTextEditorVisibleRanges(event => {
        if (event.textEditor === editor && !isUpdatingFromPreview && syncEnabled) {
            const topLine = event.visibleRanges[0]?.start.line || 0;
            const section = getSectionFromLine(editor.document, topLine);

            console.log('📤 Sending scroll-changed to preview:', { line: topLine, section });
            panel.webview.postMessage({
                type: 'scroll-changed',
                line: topLine,
                section: section
            });
        }
    });

    // Handle messages from preview
    const messageSubscription = panel.webview.onDidReceiveMessage(message => {
        console.log('📨 Received message from preview:', message);
        if (!syncEnabled) return;

        switch (message.type) {
            case 'preview-scroll':
                syncEditorToPreview(editor, message.line, message.section);
                break;
            case 'slide-changed':
                syncEditorToSlide(editor, message.section);
                break;
        }
    });

    // Clean up on panel dispose
    panel.onDidDispose(() => {
        cursorSubscription.dispose();
        scrollSubscription.dispose();
        messageSubscription.dispose();
    });
}

function getSectionFromLine(document: vscode.TextDocument, line: number): number {
    let section = 0;
    const sections = [];
    for (let i = 0; i <= line; i++) {
        const lineText = document.lineAt(i).text.trim();
        // Count both --- separators and # headers as section boundaries
        if (lineText === '---' || (lineText.startsWith('# ') && i > 0)) {
            section++;
            sections.push(`Line ${i}: "${lineText}"`);
        }
    }
    console.log(`🔍 Section detection for line ${line}: section=${section}, boundaries found:`, sections);
    return section;
}

function getLineFromSection(document: vscode.TextDocument, targetSection: number): number {
    let section = 0;
    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text.trim();
        // Count both --- separators and # headers as section boundaries
        if (lineText === '---' || (lineText.startsWith('# ') && i > 0)) {
            section++;
        }
        if (section === targetSection) {
            return i + 1; // Return line after separator
        }
    }
    return 0;
}

function syncEditorToPreview(editor: vscode.TextEditor, line: number, section: number) {
    isUpdatingFromPreview = true;

    const targetLine = line || getLineFromSection(editor.document, section);
    const position = new vscode.Position(targetLine, 0);
    const selection = new vscode.Selection(position, position);

    editor.selection = selection;
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);

    setTimeout(() => { isUpdatingFromPreview = false; }, 100);
}

function syncEditorToSlide(editor: vscode.TextEditor, section: number) {
    const targetLine = getLineFromSection(editor.document, section);
    syncEditorToPreview(editor, targetLine, section);
}

/**
 * Fix image paths in HTML for VS Code webview
 */
function fixImagePathsInHtml(html: string, documentPath: string, webview: vscode.Webview): string {
    const docDir = path.dirname(documentPath);

    // First fix CSS background images
    html = html.replace(/(background-image:\s*url\(['"]?)([^'")]+)(['"]?\))/g, (match, prefix, src, suffix) => {
        // Skip if already a data URL, HTTP URL, or webview resource
        if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('vscode-webview-resource:')) {
            return match;
        }

        console.log('🖼️ Fixing CSS background image path:', src);

        // Convert relative paths to absolute paths, then to webview URIs
        let absolutePath: string;
        if (src.startsWith('./')) {
            absolutePath = path.join(docDir, src.substring(2));
        } else if (src.startsWith('../')) {
            absolutePath = path.resolve(docDir, src);
        } else if (!path.isAbsolute(src)) {
            absolutePath = path.join(docDir, src);
        } else {
            absolutePath = src;
        }

        // Convert to webview URI
        try {
            const webviewUri = webview.asWebviewUri(vscode.Uri.file(absolutePath));
            console.log('✅ Fixed CSS background path:', src, '->', webviewUri.toString());
            return `${prefix}${webviewUri.toString()}${suffix}`;
        } catch (error) {
            console.warn(`Failed to convert CSS background path: ${src}`, error);
            return match;
        }
    });

    // Then fix image src attributes with webview URIs
    return html.replace(/(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/g, (match, prefix, src, suffix) => {
        // Skip if already a data URL, HTTP URL, or webview resource
        if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('vscode-webview-resource:')) {
            return match;
        }

        console.log('🖼️ Fixing img src path:', src);

        // Convert relative paths to absolute paths, then to webview URIs
        let absolutePath: string;
        if (src.startsWith('./')) {
            absolutePath = path.join(docDir, src.substring(2));
        } else if (src.startsWith('../')) {
            absolutePath = path.resolve(docDir, src);
        } else if (!path.isAbsolute(src)) {
            absolutePath = path.join(docDir, src);
        } else {
            absolutePath = src;
        }

        // Convert to webview URI
        try {
            const webviewUri = webview.asWebviewUri(vscode.Uri.file(absolutePath));
            console.log('✅ Fixed img src path:', src, '->', webviewUri.toString());
            return `${prefix}${webviewUri.toString()}${suffix}`;
        } catch (error) {
            console.warn(`Failed to convert image path: ${src}`, error);
            return match;
        }
    });
}

/**
 * Generate HTML for non-Aksara documents
 */
function getNoAksaraHtml(fileName: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aksara Writer - No Directive</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 2rem;
            background: #f8f9fa;
            color: #2c3e50;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            max-width: 600px;
            background: white;
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            text-align: center;
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            color: #34495e;
            margin-bottom: 1rem;
        }
        .filename {
            background: #ecf0f1;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            font-family: monospace;
            margin: 1rem 0;
            color: #2c3e50;
        }
        .instructions {
            background: #e8f4fd;
            border: 1px solid #bee5eb;
            border-radius: 8px;
            padding: 1.5rem;
            margin: 1.5rem 0;
            text-align: left;
        }
        .instructions h3 {
            margin-top: 0;
            color: #0c5460;
        }
        .code-block {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 1rem;
            border-radius: 6px;
            font-family: monospace;
            font-size: 0.9rem;
            margin: 1rem 0;
            text-align: left;
        }
        .note {
            color: #6c757d;
            font-size: 0.9rem;
            margin-top: 1rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">📄</div>
        <h1>Aksara Writer Preview</h1>
        <div class="filename">${fileName}</div>

        <div class="instructions">
            <h3>🔧 To enable Aksara Writer preview:</h3>
            <p>Add the following directive to the top of your markdown file:</p>
            <pre class="code-block">\<!--
aksara:true
type: document
--\>

# Your Content Here</pre>
            <p><strong>For presentations:</strong></p>
            <pre class="code-block">\<!--
aksara:true
type: presentation
size: 16:9
--\>

# Your Presentation</pre>
        </div>

        <div class="note">
            This file will automatically preview when you add the <code>aksara:true</code> directive.
        </div>
    </div>
</body>
</html>
    `;
}

interface ConvertOptions {
    format: 'html' | 'pdf' | 'pptx';
    locale?: 'id' | 'en';
    theme?: string;
    pageSize?: 'A4' | 'Letter' | 'Legal';
}

/**
 * Convert markdown to HTML using CLI via stdin/stdout (live preview)
 */
async function convertToHtmlInMemory(markdown: string, documentPath?: string): Promise<string> {
    try {
        // Use CLI with stdin/stdout for live preview (no file I/O)
        // Set working directory to document directory for proper path resolution
        const workingDir = documentPath ? path.dirname(documentPath) : process.cwd();
        const config = vscode.workspace.getConfiguration('aksara');
        const theme = config.get<string>('defaultTheme', 'default');
        const locale = config.get<'id' | 'en'>('defaultLocale', 'id');
        const command = `aksara-writer convert - --format html --stdout --locale ${locale} --theme ${theme}`;

        const { spawn } = await import('child_process');

        return new Promise((resolve, reject) => {
            const child = spawn('bash', ['-c', command], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: workingDir // Set working directory to document directory
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    console.warn('CLI conversion failed:', stderr);
                    reject(new Error(`CLI failed with code ${code}: ${stderr}`));
                }
            });

            child.on('error', (error) => {
                console.warn('CLI spawn error:', error);
                reject(error);
            });

            // Send markdown to CLI via stdin
            child.stdin.write(markdown);
            child.stdin.end();
        });
    } catch (error) {
        console.warn('CLI converter failed, falling back to simple converter:', error);
        return convertToHtmlSimple(markdown);
    }
}

/**
 * Fallback simple converter (backup when core fails)
 */
function convertToHtmlSimple(markdown: string): string {
    // Basic markdown to HTML conversion for preview
    let html = markdown;

    // Process JavaScript expressions first
    html = html.replace(/\$\{([^}]+)\}/g, (match, expression) => {
        try {
            if (expression.includes('new Date()')) {
                if (expression.includes('.toLocaleDateString(')) {
                    const localeMatch = expression.match(/\.toLocaleDateString\(['"](.*?)['"]\)/);
                    const locale = localeMatch ? localeMatch[1] : 'id-ID';
                    return new Date().toLocaleDateString(locale);
                }
                if (expression.includes('.getFullYear()')) {
                    return new Date().getFullYear().toString();
                }
            }
            if (expression.includes('Date.now()')) {
                const offsetMatch = expression.match(/Date\.now\(\)\s*([+\-])\s*(.+?)\)\.toLocaleDateString/);
                if (offsetMatch) {
                    const operator = offsetMatch[1];
                    const offsetMs = eval(offsetMatch[2]); // Safe for simple math
                    const dateMs = operator === '+' ? Date.now() + offsetMs : Date.now() - offsetMs;
                    return new Date(dateMs).toLocaleDateString('id-ID');
                }
            }
            return match;
        } catch {
            return match;
        }
    });

    // Remove Aksara directives
    html = html.replace(/<!--[\s\S]*?-->/g, '');

    // Convert markdown to HTML
    html = html
        // Headers
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^#### (.*$)/gm, '<h4>$1</h4>')

        // Bold and italic
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')

        // Code
        .replace(/`(.*?)`/g, '<code>$1</code>')

        // Lists
        .replace(/^- (.*$)/gm, '<li>$1</li>')
        .replace(/^(\d+)\. (.*$)/gm, '<li>$2</li>')

        // Images
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto;">')

        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

        // Horizontal rules
        .replace(/^---$/gm, '<hr>');

    // Process tables
    html = html.replace(/^\|(.+)\|\s*\n\|[-\s|:]+\|\s*\n((?:\|.+\|\s*\n?)*)/gm, (match, headerRow, bodyRows) => {
        const headers = headerRow.split('|').map((h: string) => h.trim()).filter((h: string) => h);
        const rows = bodyRows.trim().split('\n').map((row: string) =>
            row.split('|').map((cell: string) => cell.trim()).filter((cell: string) => cell)
        );

        const headerHtml = headers.map((h: string) => `<th>${h}</th>`).join('');
        const bodyHtml = rows.map((row: string[]) =>
            `<tr>${row.map((cell: string) => `<td>${cell}</td>`).join('')}</tr>`
        ).join('');

        return `<table style="border-collapse: collapse; width: 100%;"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
    });

    // Wrap list items in ul tags
    html = html.replace(/(<li>.*?<\/li>\s*)+/g, (match) => {
        return `<ul>${match}</ul>`;
    });

    // Convert line breaks to paragraphs
    const lines = html.split('\n');
    const processedLines: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') continue;

        // Don't wrap block elements
        if (trimmed.match(/^<(h[1-6]|ul|ol|li|table|div|hr|img)/)) {
            processedLines.push(trimmed);
        } else if (trimmed.match(/^<\/?(h[1-6]|ul|ol|li|table|div|hr)/)) {
            processedLines.push(trimmed);
        } else {
            processedLines.push(`<p>${trimmed}</p>`);
        }
    }

    // Add basic CSS
    const styledHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aksara Preview</title>
    <style>
        body {
            font-family: 'Inter', 'Segoe UI', 'Noto Sans', sans-serif;
            line-height: 1.6;
            color: #2c3e50;
            max-width: 21cm;
            margin: 0 auto;
            padding: 2rem;
            background: white;
        }
        h1 { color: #2c3e50; border-bottom: 3px solid #667eea; padding-bottom: 0.5rem; }
        h2, h3, h4 { color: #34495e; }
        table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        th, td { border: 1px solid #bdc3c7; padding: 0.75rem; text-align: left; }
        th { background: #34495e; color: white; font-weight: 600; }
        tr:nth-child(even) { background: #f8f9fa; }
        code { background: #ecf0f1; padding: 0.2rem 0.4rem; border-radius: 3px; }
        ul { padding-left: 1.5rem; }
        li { margin: 0.5rem 0; }
        hr { border: none; border-top: 2px solid #ecf0f1; margin: 2rem 0; }
    </style>
</head>
<body>
    ${processedLines.join('\n')}
</body>
</html>`;

    return styledHtml;
}

/**
 * Convert document using Aksara CLI (for file exports) - original approach
 */
async function convertWithCli(filePath: string, options: ConvertOptions): Promise<{success: boolean, data?: string, error?: string}> {
    try {
        // Use global aksara-writer CLI (file-based conversion)
        const command = `aksara-writer convert "${filePath}" --format ${options.format} --locale ${options.locale || 'id'}`;

        const { stdout, stderr } = await execAsync(command, { cwd: path.dirname(filePath) });

        // Check if conversion was successful by looking for success message or absence of real errors
        if (stderr && stderr.includes('Error:') && !stdout.includes('Document converted successfully')) {
            return { success: false, error: stderr };
        }

        // For HTML format, read the output file
        if (options.format === 'html') {
            const outputPath = filePath.replace(/\.md$/, '.html');
            try {
                const htmlContent = await readFile(outputPath, 'utf-8');
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

        // Use core-based in-memory conversion for WYSIWYG preview
        const htmlContent = await convertToHtmlInMemory(markdown, document.fileName);
        const result = { success: true, data: htmlContent };

        if (!result.success) {
            vscode.window.showErrorMessage(`Failed to create preview: Unknown error`);
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

            // Setup editor-preview sync
            setupEditorPreviewSync(editor, globalPreviewPanel);

            // Clear reference when panel is disposed
            globalPreviewPanel.onDidDispose(() => {
                globalPreviewPanel = undefined;
            });
        }

        // Fix image paths for VS Code webview (but preserve base64 data URLs)
        let processedHtml = fixImagePathsInHtml(result.data!.toString(), document.fileName, globalPreviewPanel.webview);

        // Add Content Security Policy to allow data URLs for images
        if (!processedHtml.includes('content-security-policy')) {
            processedHtml = processedHtml.replace(
                '<head>',
                `<head>
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: vscode-webview-resource: https:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">`
            );
        }

        // Debug: Log if we have base64 images
        if (processedHtml.includes('data:image/')) {
            console.log('VS Code: Found base64 images in HTML');
        }

        // Inject document path information for additional JS processing
        const docUri = globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(document.fileName));
        const docDir = globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(path.dirname(document.fileName)));

        const htmlWithInjectedPath = processedHtml.replace(
            '<body>',
            `<body>
            <script>
                window.documentUri = '${docUri}';
                window.documentDir = '${docDir}';
            </script>
            <script src="${globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, 'preview.js')))}"></script>`
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
                        // Use core-based in-memory conversion
                        const htmlContent = await convertToHtmlInMemory(markdown, activeEditor.document.fileName);

                        // Fix image paths and inject document path information
                        let processedHtml = fixImagePathsInHtml(htmlContent, activeEditor.document.fileName, globalPreviewPanel.webview);

                        // Add Content Security Policy to allow data URLs for images
                        if (!processedHtml.includes('content-security-policy')) {
                            processedHtml = processedHtml.replace(
                                '<head>',
                                `<head>
                                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: vscode-webview-resource: https:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">`
                            );
                        }

                        const docUri = globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(activeEditor.document.fileName));
                        const docDir = globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(path.dirname(activeEditor.document.fileName)));

                        const htmlWithPaths = processedHtml.replace(
                            '<body>',
                            `<body>
                            <script>
                                window.documentUri = '${docUri}';
                                window.documentDir = '${docDir}';
                            </script>
                            <script src="${globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, 'preview.js')))}"></script>`
                        );

                        globalPreviewPanel.title = `Preview: ${path.basename(activeEditor.document.fileName)}`;
                        globalPreviewPanel.webview.html = htmlWithPaths;
                    } else {
                        // Show message for non-Aksara documents instead of closing
                        globalPreviewPanel.title = `Preview: ${path.basename(activeEditor.document.fileName)} (No Aksara)`;
                        globalPreviewPanel.webview.html = getNoAksaraHtml(path.basename(activeEditor.document.fileName));
                    }
                }
            });

            // Update preview when document changes (with debouncing)
            const changeSubscription = vscode.workspace.onDidChangeTextDocument(async event => {
                if (event.document.languageId === 'markdown' && globalPreviewPanel) {
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor && event.document === activeEditor.document) {
                        // Clear previous timeout
                        if (previewUpdateTimeout) {
                            clearTimeout(previewUpdateTimeout);
                        }

                        // Debounce updates to avoid too many renders
                        previewUpdateTimeout = setTimeout(async () => {
                            const markdown = event.document.getText();
                            if (markdown.includes('aksara:true') || markdown.includes('data-aksara')) {
                                // Use core-based in-memory conversion
                                const htmlContent = await convertToHtmlInMemory(markdown, event.document.fileName);

                                // Fix image paths and inject document path information
                                let processedHtml = fixImagePathsInHtml(htmlContent, event.document.fileName, globalPreviewPanel!.webview);

                                // Add Content Security Policy to allow data URLs for images
                                if (!processedHtml.includes('content-security-policy')) {
                                    processedHtml = processedHtml.replace(
                                        '<head>',
                                        `<head>
                                        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: vscode-webview-resource: https:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">`
                                    );
                                }

                                const docUri = globalPreviewPanel!.webview.asWebviewUri(vscode.Uri.file(event.document.fileName));
                                const docDir = globalPreviewPanel!.webview.asWebviewUri(vscode.Uri.file(path.dirname(event.document.fileName)));

                                const htmlWithPaths = processedHtml.replace(
                                    '<body>',
                                    `<body>
                                    <script>
                                        window.documentUri = '${docUri}';
                                        window.documentDir = '${docDir}';
                                    </script>
                                    <script src="${globalPreviewPanel!.webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, 'preview.js')))}"></script>`
                                );

                                globalPreviewPanel!.title = `Ak'sara: ${path.basename(event.document.fileName)}`;
                                globalPreviewPanel!.webview.html = htmlWithPaths;
                            } else {
                                // Show message if Aksara directive is removed instead of closing
                                globalPreviewPanel!.title = `Ak'sara: ${path.basename(event.document.fileName)} (No Aksara)`;
                                globalPreviewPanel!.webview.html = getNoAksaraHtml(path.basename(event.document.fileName));
                            }
                        }, 300); // 300ms debounce
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

            // Use CLI to convert (file-based export)
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
    const templates = getAvailableTemplates();

    if (templates.length === 0) {
        vscode.window.showErrorMessage('No templates found');
        return;
    }

    const templateOptions = templates.map(template => ({
        label: `${template.icon} ${template.title}`,
        value: template.name
    }));

    const selected = await vscode.window.showQuickPick(templateOptions, {
        placeHolder: 'Select document template'
    });

    if (!selected) return;

    const templateContent = getTemplateContent(selected.value);

    // Always create new file for templates (better UX)
    const doc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: templateContent
    });

    const editor = await vscode.window.showTextDocument(doc);

    // Auto-open preview if the template has Aksara directives
    if (templateContent.includes('aksara:true')) {
        // Small delay to ensure the document is fully loaded
        setTimeout(async () => {
            await previewDocument();
        }, 500);
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

    // Refresh preview if it's open
    if (globalPreviewPanel) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
            const markdown = editor.document.getText();
            if (markdown.includes('aksara:true') || markdown.includes('data-aksara')) {
                const htmlContent = await convertToHtmlInMemory(markdown, editor.document.fileName);
                let processedHtml = fixImagePathsInHtml(htmlContent, editor.document.fileName, globalPreviewPanel.webview);

                if (!processedHtml.includes('content-security-policy')) {
                    processedHtml = processedHtml.replace(
                        '<head>',
                        `<head>
                        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: vscode-webview-resource: https:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">`
                    );
                }

                const docUri = globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(editor.document.fileName));
                const docDir = globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(path.dirname(editor.document.fileName)));

                const htmlWithPaths = processedHtml.replace(
                    '<body>',
                    `<body>
                    <script>
                        window.documentUri = '${docUri}';
                        window.documentDir = '${docDir}';
                    </script>
                    <script src="${globalPreviewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, 'preview.js')))}"></script>`
                );

                globalPreviewPanel.webview.html = htmlWithPaths;
            }
        }
    }
}

/**
 * Get available templates from the templates directory
 */
function getAvailableTemplates(): Array<{name: string, title: string, icon: string}> {
    try {
        const extensionPath = vscode.extensions.getExtension('ak-sara.aksara-writer-vscode')?.extensionPath;
        if (!extensionPath) {
            return [];
        }

        const templatesDir = join(extensionPath, 'templates');
        if (!existsSync(templatesDir)) {
            return [];
        }

        const templateFiles = readdirSync(templatesDir)
            .filter(file => extname(file) === '.md')
            .map(file => basename(file, '.md'));

        const templateMetadata: Record<string, {title: string, icon: string}> = {
            'default': { title: 'Default - General Document', icon: '📄' },
            'invoice': { title: 'Invoice - Sales Invoice', icon: '🧾' },
            'proposal': { title: 'Proposal - Business Proposal', icon: '📋' },
            'report': { title: 'Report - Business Report', icon: '📊' },
            'contract': { title: 'Contract - Legal Contract', icon: '📝' },
            'letter': { title: 'Letter - Official Letter', icon: '📮' }
        };

        return templateFiles.map(name => ({
            name,
            title: templateMetadata[name]?.title || `${name.charAt(0).toUpperCase() + name.slice(1)} Template`,
            icon: templateMetadata[name]?.icon || '📄'
        }));
    } catch (error) {
        console.error('Error reading templates:', error);
        return [];
    }
}

/**
 * Get template content from file
 */
function getTemplateContent(templateName: string): string {
    try {
        const extensionPath = vscode.extensions.getExtension('ak-sara.aksara-writer-vscode')?.extensionPath;
        if (!extensionPath) {
            return getFallbackTemplate();
        }

        const templatePath = join(extensionPath, 'templates', `${templateName}.md`);
        if (!existsSync(templatePath)) {
            return getFallbackTemplate();
        }

        return readFileSync(templatePath, 'utf-8');
    } catch (error) {
        console.error(`Error reading template ${templateName}:`, error);
        return getFallbackTemplate();
    }
}

/**
 * Get fallback template if file reading fails
 */
function getFallbackTemplate(): string {
    return `<!--
aksara:true
type: document
style: ./style.css
size: 210mmx297mm
meta:
    title: Dokumen Bisnis
    subtitle: Document Professional
header: | PT. Perusahaan | Dokumen | \${new Date().toLocaleDateString('id-ID')} |
footer: Halaman [page] dari [total] - Dibuat dengan Aksara Writer
-->

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
`;
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