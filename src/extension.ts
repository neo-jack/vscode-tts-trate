import * as vscode from "vscode";
import { SidebarProvider } from "./SidebarProvider";
import { spawn } from "child_process";

export function activate(context: vscode.ExtensionContext) {
  console.log("TTS Sidebar Extension is now active!");

  const sidebarProvider = new SidebarProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "vscode-tts-sidebar-view",
      sidebarProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-tts-sidebar.speakSelection",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage("No active editor.");
          return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        const text = selectedText.trim();
        if (!text) {
          vscode.window.showErrorMessage("No selected text to speak.");
          return;
        }

        try {
          const normalized = semanticizeEnglish(text);
          await speakWithWindowsTts(normalized);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Speak failed: ${message}`);
        }
      },
    ),
  );

  // Optional: Show a message to confirm it loaded (can be removed later)
  // vscode.window.showInformationMessage('TTS Sidebar Loaded');
}

export function deactivate() {}

function semanticizeEnglish(input: string): string {
  const map: Record<string, string> = {
    var: "variable",
    let: "let",
    const: "constant",
    func: "function",
    fn: "function",
    int: "integer",
    bool: "boolean",
    str: "string",
  };

  let text = input;
  for (const [k, v] of Object.entries(map)) {
    const reg = new RegExp(`\\b${escapeRegExp(k)}\\b`, "gi");
    text = text.replace(reg, v);
  }

  return text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function speakWithWindowsTts(text: string): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("This command currently supports Windows only.");
  }

  const escapedText = text
    .replace(/`/g, "``")
    .replace(/\$/g, "`$")
    .replace(/"/g, '`"');
  const script = [
    "Add-Type -AssemblyName System.Speech",
    "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "$synth.Rate = 0",
    `$synth.Speak("${escapedText}")`,
  ].join("; ");

  const encoded = toPowerShellEncodedCommand(script);

  await new Promise<void>((resolve, reject) => {
    const ps = spawn(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded,
      ],
      { windowsHide: true },
    );

    let stderr = "";
    ps.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    ps.on("error", (e) => reject(e));
    ps.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
    });
  });
}

function toPowerShellEncodedCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}
