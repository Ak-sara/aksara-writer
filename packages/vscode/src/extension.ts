/**
 * Aksara Writer VS Code Extension
 * Main entry point - delegates to lib/ modules for functionality
 */

import * as vscode from 'vscode';

// Import command handlers from lib/
const commands = require('../lib/commands');

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Aksara Writer extension is now active!');

    // Register main menu command
    const menuCommand = vscode.commands.registerCommand('aksara.showMenu', () => {
        commands.showAksaraMenu(vscode);
    });

    // Register smart preview command for context menu
    const previewCommand = vscode.commands.registerCommand('aksara.openPreview', () => {
        commands.openSmartPreview(vscode);
    });

    context.subscriptions.push(menuCommand, previewCommand);

    // Show welcome message
    vscode.window.showInformationMessage(
        'Aksara Writer is ready! 🚀',
        'View Templates',
        'Documentation'
    ).then(selection => {
        if (selection === 'View Templates') {
            commands.insertTemplate(vscode);
        } else if (selection === 'Documentation') {
            vscode.env.openExternal(vscode.Uri.parse('https://ak-sara.github.io'));
        }
    });
}

/**
 * Extension deactivation
 */
export function deactivate() {
    console.log('Aksara Writer extension deactivated');
}