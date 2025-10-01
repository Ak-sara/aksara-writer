/**
 * Aksara Writer Preview Panel Management
 * Handles preview panel creation, updates, and lifecycle
 */

const path = require('path');
const { readFileSync } = require('fs');
const { convertToHtmlInMemory } = require('./converter');
const { getNoAksaraHtml } = require('./templates');

// Global preview state
let globalPreviewPanel = undefined;
let previewSubscriptions = [];
let previewUpdateTimeout = undefined;

// Sync state
let syncSubscriptions = [];
let syncEnabled = true;
let isUpdatingFromPreview = false;
let isUpdatingFromEditor = false;
let currentSyncedEditor = undefined;
let syncLockTimeout = undefined;

/**
 * Get or create preview panel
 */
function getOrCreatePreviewPanel(vscode, editor, context) {
    if (!globalPreviewPanel) {
        const fileName = path.basename(editor.document.fileName);

        // Get workspace root or fall back to parent directories
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceRoot = workspaceFolders && workspaceFolders.length > 0
            ? workspaceFolders[0].uri
            : vscode.Uri.file(path.resolve(path.dirname(editor.document.fileName), '../..'));

        globalPreviewPanel = vscode.window.createWebviewPanel(
            'aksaraPreview',
            `Ak'sara: ${fileName}`,
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: context ? [
                    workspaceRoot,
                    vscode.Uri.file(path.join(context.extensionPath, 'dist'))
                ] : [workspaceRoot]
            }
        );

        // Setup editor-preview sync
        setupEditorPreviewSync(vscode, editor, globalPreviewPanel);

        // Update title with sync indicator
        globalPreviewPanel.title = `Ak'sara: ${fileName} 🔗`;

        // Try to move panel to bottom
        setTimeout(async () => {
            try {
                await vscode.commands.executeCommand('workbench.action.moveEditorToBelowGroup');
            } catch (error) {
                console.log('Could not automatically move preview to bottom:', error);
            }
        }, 100);

        // Clear reference when panel is disposed
        globalPreviewPanel.onDidDispose(() => {
            globalPreviewPanel = undefined;
            syncSubscriptions.forEach(sub => sub.dispose());
            syncSubscriptions = [];
        });
    }

    return globalPreviewPanel;
}

/**
 * Update preview content
 */
async function updatePreview(vscode, panel, document, config) {
    const markdown = document.getText();

    if (!markdown.includes('aksara:true') && !markdown.includes('data-aksara')) {
        panel.title = `Ak'sara: ${path.basename(document.fileName)} (No Aksara)`;
        panel.webview.html = getNoAksaraHtml(path.basename(document.fileName));
        return;
    }

    const htmlContent = await convertToHtmlInMemory(markdown, document.fileName, config);
    let processedHtml = fixImagePathsInHtml(vscode, htmlContent, document.fileName, panel.webview);
    processedHtml = addContentSecurityPolicy(processedHtml);

    const htmlWithSync = injectSyncScript(vscode, processedHtml, document.fileName, panel.webview);

    panel.title = `Ak'sara: ${path.basename(document.fileName)}`;
    panel.webview.html = htmlWithSync;
}

/**
 * Setup subscriptions for live preview updates
 */
function setupPreviewSubscriptions(vscode, panel, config) {
    if (previewSubscriptions.length > 0) {
        return; // Already setup
    }

    // Update preview when active document changes
    const activeEditorChangeSubscription = vscode.window.onDidChangeActiveTextEditor(async activeEditor => {
        if (activeEditor && activeEditor.document.languageId === 'markdown' && globalPreviewPanel) {
            // Clear any ongoing sync operations
            isUpdatingFromPreview = false;
            isUpdatingFromEditor = false;
            clearTimeout(syncLockTimeout);

            // Update the synced editor reference
            currentSyncedEditor = activeEditor;

            // Re-setup sync for the new editor
            setupEditorPreviewSync(vscode, activeEditor, globalPreviewPanel);

            await updatePreview(vscode, globalPreviewPanel, activeEditor.document, config);
        }
    });

    // Update preview when document changes (with debouncing)
    const changeSubscription = vscode.workspace.onDidChangeTextDocument(async event => {
        if (event.document.languageId === 'markdown' && globalPreviewPanel) {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && event.document === activeEditor.document) {
                // Debounce updates
                if (previewUpdateTimeout) {
                    clearTimeout(previewUpdateTimeout);
                }

                previewUpdateTimeout = setTimeout(async () => {
                    await updatePreview(vscode, globalPreviewPanel, event.document, config);
                }, 300);
            }
        }
    });

    previewSubscriptions.push(activeEditorChangeSubscription, changeSubscription);

    // Clear subscriptions when panel is disposed
    panel.onDidDispose(() => {
        previewSubscriptions.forEach(sub => sub.dispose());
        previewSubscriptions = [];
        globalPreviewPanel = undefined;
    });
}

/**
 * Setup editor-preview sync
 */
function setupEditorPreviewSync(vscode, editor, panel) {
    // Dispose existing sync subscriptions
    syncSubscriptions.forEach(sub => sub.dispose());
    syncSubscriptions = [];

    currentSyncedEditor = editor;

    // Track cursor changes (higher priority than scroll)
    const cursorSubscription = vscode.window.onDidChangeTextEditorSelection(event => {
        if (event.textEditor === currentSyncedEditor &&
            !isUpdatingFromPreview &&
            syncEnabled &&
            event.textEditor === vscode.window.activeTextEditor) {

            isUpdatingFromEditor = true;
            clearTimeout(syncLockTimeout);

            const line = event.selections[0].active.line;
            const section = getSectionFromLine(event.textEditor.document, line);

            panel.webview.postMessage({
                type: 'cursor-moved',
                line: line,
                section: section,
                sourceFile: event.textEditor.document.fileName
            });

            syncLockTimeout = setTimeout(() => {
                isUpdatingFromEditor = false;
            }, 300);
        }
    });

    // Track scroll changes (lower priority - only when not updating from cursor)
    const scrollSubscription = vscode.window.onDidChangeTextEditorVisibleRanges(event => {
        if (event.textEditor === currentSyncedEditor &&
            !isUpdatingFromPreview &&
            !isUpdatingFromEditor &&
            syncEnabled &&
            event.textEditor === vscode.window.activeTextEditor) {

            // Use cursor position if available (higher priority)
            const cursorLine = event.textEditor.selection.active.line;
            const topLine = event.visibleRanges[0]?.start.line || 0;

            // Prefer cursor position over scroll position
            const targetLine = cursorLine;
            const section = getSectionFromLine(event.textEditor.document, targetLine);

            isUpdatingFromEditor = true;
            clearTimeout(syncLockTimeout);

            panel.webview.postMessage({
                type: 'scroll-changed',
                line: targetLine,
                section: section,
                sourceFile: event.textEditor.document.fileName
            });

            syncLockTimeout = setTimeout(() => {
                isUpdatingFromEditor = false;
            }, 500);
        }
    });

    // Handle messages from preview
    const messageSubscription = panel.webview.onDidReceiveMessage(message => {
        if (!syncEnabled || !currentSyncedEditor || isUpdatingFromEditor) {
            return;
        }

        switch (message.type) {
            case 'preview-scroll':
                syncEditorToPreview(vscode, currentSyncedEditor, message.line, message.section);
                break;
            case 'slide-changed':
                syncEditorToSlide(vscode, currentSyncedEditor, message.section);
                break;
        }
    });

    syncSubscriptions.push(cursorSubscription, scrollSubscription, messageSubscription);
}

/**
 * Get section number from line
 */
function getSectionFromLine(document, line) {
    let section = 0;

    // Count how many section separators (---) are BEFORE the current line
    for (let i = 0; i < line; i++) {
        const lineText = document.lineAt(i).text.trim();
        const isHorizontalRule = /^-{3,}$/.test(lineText);

        // Only count --- separators
        if (isHorizontalRule) {
            section++;
        }
    }

    return section;
}

/**
 * Get line from section number
 */
function getLineFromSection(document, targetSection) {
    // If target is section 0, return line 0
    if (targetSection === 0) {
        return 0;
    }

    let section = 0;

    // Find the Nth --- separator (where N = targetSection)
    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text.trim();
        const isHorizontalRule = /^-{3,}$/.test(lineText);

        if (isHorizontalRule) {
            section++;

            // When we find the separator that marks the start of targetSection
            if (section === targetSection) {
                return Math.min(i + 1, document.lineCount - 1);
            }
        }
    }

    return 0;
}

/**
 * Sync editor to preview position
 */
function syncEditorToPreview(vscode, editor, line, section) {
    if (isUpdatingFromEditor) return;

    isUpdatingFromPreview = true;
    clearTimeout(syncLockTimeout);

    const targetLine = line || getLineFromSection(editor.document, section);
    const position = new vscode.Position(targetLine, 0);
    const selection = new vscode.Selection(position, position);

    editor.selection = selection;
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);

    syncLockTimeout = setTimeout(() => {
        isUpdatingFromPreview = false;
    }, 1000);
}

/**
 * Sync editor to slide
 */
function syncEditorToSlide(vscode, editor, section) {
    const targetLine = getLineFromSection(editor.document, section);
    syncEditorToPreview(vscode, editor, targetLine, section);
}

/**
 * Fix image paths for webview
 */
function fixImagePathsInHtml(vscode, html, documentPath, webview) {
    const docDir = path.dirname(documentPath);

    // Fix CSS background images (both background: and background-image:)
    html = html.replace(/(background(?:-image)?:\s*[^;]*url\(['"]?)([^'")]+)(['"]?\))/g, (match, prefix, src, suffix) => {
        if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('vscode-webview-resource:')) {
            return match;
        }

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

        try {
            const webviewUri = webview.asWebviewUri(vscode.Uri.file(absolutePath));
            return `${prefix}${webviewUri.toString()}${suffix}`;
        } catch (error) {
            console.warn('Failed to convert background image path:', src, error);
            return match;
        }
    });

    // Fix img src attributes
    return html.replace(/(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/g, (match, prefix, src, suffix) => {
        if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('vscode-webview-resource:')) {
            return match;
        }

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

        try {
            const webviewUri = webview.asWebviewUri(vscode.Uri.file(absolutePath));
            return `${prefix}${webviewUri.toString()}${suffix}`;
        } catch (error) {
            return match;
        }
    });
}

/**
 * Add Content Security Policy
 */
function addContentSecurityPolicy(html) {
    if (!html.includes('content-security-policy')) {
        return html.replace(
            '<head>',
            `<head>
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: vscode-webview-resource: https:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">`
        );
    }
    return html;
}

/**
 * Inject sync script
 */
function injectSyncScript(vscode, html, documentFileName, webview) {
    const docUri = webview.asWebviewUri(vscode.Uri.file(documentFileName));
    const docDir = webview.asWebviewUri(vscode.Uri.file(path.dirname(documentFileName)));

    const syncScriptPath = path.join(__dirname, 'sync.js');
    let syncScript = '';

    try {
        syncScript = readFileSync(syncScriptPath, 'utf-8');
    } catch (error) {
        syncScript = `
            console.log('⚠️ External sync script not found');
            const vscode = acquireVsCodeApi();
            window.addEventListener('message', event => {
                console.log('📨 Received message:', event.data);
            });
        `;
    }

    return html.replace(
        '</body>',
        `<script>
            window.documentUri = '${docUri}';
            window.documentDir = '${docDir}';
            ${syncScript}
        </script>
        </body>`
    );
}

module.exports = {
    getOrCreatePreviewPanel,
    updatePreview,
    setupPreviewSubscriptions,
    globalPreviewPanel: () => globalPreviewPanel
};