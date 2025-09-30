/**
 * Aksara Writer VS Code Commands
 * Handles menu, commands, and user interactions
 */

const path = require('path');
const { convertWithCli } = require('./converter');
const { getAvailableTemplates, getTemplateContent } = require('./templates');
const { getOrCreatePreviewPanel, updatePreview, setupPreviewSubscriptions } = require('./preview');

/**
 * Show Aksara Writer menu
 */
async function showAksaraMenu(vscode) {
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
            await previewDocument(vscode);
            break;
        case 'pdf':
            await exportDocument(vscode, 'pdf');
            break;
        case 'pptx':
            await exportDocument(vscode, 'pptx');
            break;
        case 'html':
            await exportDocument(vscode, 'html');
            break;
        case 'template':
            await insertTemplate(vscode);
            break;
        case 'theme':
            await changeTheme(vscode);
            break;
    }
}

/**
 * Smart preview - detects Aksara directives
 */
async function openSmartPreview(vscode) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showErrorMessage('Please open a markdown file first');
        return;
    }

    try {
        const markdown = editor.document.getText();
        const hasAksaraDirective = markdown.includes('aksara:true') || markdown.includes('data-aksara');

        if (hasAksaraDirective) {
            console.log('📄 Aksara directive detected - opening Ak\'sara preview');
            vscode.window.showInformationMessage('Opening Ak\'sara preview...', { modal: false });
            await previewDocument(vscode);
        } else {
            console.log('📄 No Aksara directive - opening default VS Code preview');
            vscode.window.showInformationMessage('No Aksara directive found - opening default preview...', { modal: false });
            await vscode.commands.executeCommand('markdown.showPreview');
        }
    } catch (error) {
        console.error('Error in smart preview:', error);
        vscode.window.showErrorMessage(`Preview error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Preview current document
 */
async function previewDocument(vscode, context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showErrorMessage('Please open a markdown file first');
        return;
    }

    try {
        const config = vscode.workspace.getConfiguration('aksara');
        const panel = getOrCreatePreviewPanel(vscode, editor, context);

        await updatePreview(vscode, panel, editor.document, config);

        panel.reveal(vscode.ViewColumn.Two, true);

        // Move panel to bottom
        setTimeout(async () => {
            try {
                await vscode.commands.executeCommand('workbench.action.moveEditorToBelowGroup');
            } catch (error) {
                console.log('Could not move preview to bottom:', error);
            }
        }, 100);

        // Setup subscriptions for live updates
        setupPreviewSubscriptions(vscode, panel, config);

    } catch (error) {
        vscode.window.showErrorMessage(`Error preview: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Export document to specified format
 */
async function exportDocument(vscode, format) {
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

        const config = vscode.workspace.getConfiguration('aksara');
        const options = {
            format,
            locale: config.get('defaultLocale', 'id'),
            theme: config.get('defaultTheme', 'default'),
            pageSize: config.get('defaultPageSize', 'A4')
        };

        // Show progress
        const outputPath = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Exporting to ${format.toUpperCase()}...`,
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Processing document...' });

            await editor.document.save();

            const result = await convertWithCli(editor.document.fileName, options);

            if (!result.success) {
                throw new Error(result.error);
            }

            progress.report({ increment: 50, message: 'Saving file...' });

            const ext = format === 'pptx' ? '.pptx' : format === 'pdf' ? '.pdf' : '.html';
            const output = editor.document.fileName.replace(/\.md$/, ext);

            progress.report({ increment: 100, message: 'Complete!' });

            return output;
        });

        vscode.window.showInformationMessage(
            `Document exported to ${format.toUpperCase()} successfully`,
            'Open File'
        ).then(selection => {
            if (selection === 'Open File') {
                vscode.env.openExternal(vscode.Uri.file(outputPath));
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Insert template into current document
 */
async function insertTemplate(vscode) {
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

    // Create new file for template
    const doc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: templateContent
    });

    const editor = await vscode.window.showTextDocument(doc);

    // Auto-open preview if template has Aksara directives
    if (templateContent.includes('aksara:true')) {
        setTimeout(async () => {
            await previewDocument(vscode);
        }, 500);
    }
}

/**
 * Change document theme
 */
async function changeTheme(vscode) {
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

    // Refresh preview if open
    const preview = require('./preview');
    const globalPreviewPanel = preview.globalPreviewPanel();

    if (globalPreviewPanel) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
            await updatePreview(vscode, globalPreviewPanel, editor.document, config);
        }
    }
}

module.exports = {
    showAksaraMenu,
    openSmartPreview,
    previewDocument,
    exportDocument,
    insertTemplate,
    changeTheme
};