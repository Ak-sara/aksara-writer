/**
 * Aksara Writer Template Functions
 * Handles template management and non-Aksara document HTML generation
 */

const { readFileSync, existsSync, readdirSync } = require('fs');
const { join, basename, extname } = require('path');

/**
 * Get available templates from the templates directory
 */
function getAvailableTemplates() {
    try {
        const vscode = require('vscode');
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

        const templateMetadata = {
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
function getTemplateContent(templateName) {
    try {
        const vscode = require('vscode');
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
function getFallbackTemplate() {
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
 * Generate HTML for non-Aksara documents
 */
function getNoAksaraHtml(fileName) {
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
            <pre class="code-block">&lt;!--
aksara:true
type: document
--&gt;

# Your Content Here</pre>
            <p><strong>For presentations:</strong></p>
            <pre class="code-block">&lt;!--
aksara:true
type: presentation
size: 16:9
--&gt;

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

module.exports = {
    getAvailableTemplates,
    getTemplateContent,
    getFallbackTemplate,
    getNoAksaraHtml
};