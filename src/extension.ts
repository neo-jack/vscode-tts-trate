import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('TTS Sidebar Extension is now active!');
    
	const sidebarProvider = new SidebarProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"vscode-tts-sidebar-view",
			sidebarProvider
		)
	);
    
    // Optional: Show a message to confirm it loaded (can be removed later)
    // vscode.window.showInformationMessage('TTS Sidebar Loaded');
}

export function deactivate() {}
