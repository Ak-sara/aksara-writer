/**
 * Aksara Writer Conversion Functions
 * Handles markdown to HTML/PDF/PPTX conversion
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const { readFile } = require('fs/promises');
const path = require('path');

const execAsync = promisify(exec);

/**
 * Convert markdown to HTML using CLI via stdin/stdout (live preview)
 */
async function convertToHtmlInMemory(markdown, documentPath, config) {
    try {
        // Use CLI with stdin/stdout for live preview (no file I/O)
        // Set working directory to document directory for proper path resolution
        const workingDir = documentPath ? path.dirname(documentPath) : process.cwd();
        const theme = config?.get('defaultTheme', 'default') || 'default';
        const locale = config?.get('defaultLocale', 'id') || 'id';
        const command = `aksara-writer convert - --format html --stdout --locale ${locale} --theme ${theme}`;

        const { spawn } = require('child_process');

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
function convertToHtmlSimple(markdown) {
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
        const headers = headerRow.split('|').map((h) => h.trim()).filter((h) => h);
        const rows = bodyRows.trim().split('\n').map((row) =>
            row.split('|').map((cell) => cell.trim()).filter((cell) => cell)
        );

        const headerHtml = headers.map((h) => `<th>${h}</th>`).join('');
        const bodyHtml = rows.map((row) =>
            `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`
        ).join('');

        return `<table style="border-collapse: collapse; width: 100%;"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
    });

    // Wrap list items in ul tags
    html = html.replace(/(<li>.*?<\/li>\s*)+/g, (match) => {
        return `<ul>${match}</ul>`;
    });

    // Convert line breaks to paragraphs
    const lines = html.split('\n');
    const processedLines = [];

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
    <title>Ak'sara Preview</title>
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
async function convertWithCli(filePath, options) {
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

/**
 * Fix image paths in HTML for VS Code webview
 */
function fixImagePathsInHtml(html, documentPath, webview) {
    const docDir = path.dirname(documentPath);

    // First fix CSS background images
    html = html.replace(/(background-image:\s*url\(['"]?)([^'")]+)(['"]?\))/g, (match, prefix, src, suffix) => {
        // Skip if already a data URL, HTTP URL, or webview resource
        if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('vscode-webview-resource:')) {
            return match;
        }

        console.log('🖼️ Fixing CSS background image path:', src);

        // Convert relative paths to absolute paths, then to webview URIs
        let absolutePath;
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
            const webviewUri = webview.asWebviewUri(require('vscode').Uri.file(absolutePath));
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
        let absolutePath;
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
            const webviewUri = webview.asWebviewUri(require('vscode').Uri.file(absolutePath));
            console.log('✅ Fixed img src path:', src, '->', webviewUri.toString());
            return `${prefix}${webviewUri.toString()}${suffix}`;
        } catch (error) {
            console.warn(`Failed to convert image path: ${src}`, error);
            return match;
        }
    });
}

module.exports = {
    convertToHtmlInMemory,
    convertToHtmlSimple,
    convertWithCli,
    fixImagePathsInHtml
};