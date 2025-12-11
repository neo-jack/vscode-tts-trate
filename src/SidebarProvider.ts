import * as vscode from "vscode";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  _doc?: vscode.TextDocument;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    console.log("SidebarProvider.resolveWebviewView called");
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
  }

  public revive(panel: vscode.WebviewView) {
    this._view = panel;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<style>
					body {
						padding: 10px;
						font-family: var(--vscode-font-family);
						display: flex;
						flex-direction: column;
						gap: 10px;
						color: var(--vscode-foreground);
                        border: 2px solid transparent; /* Debug helper */
					}
                    /* Add a fallback color if vars are missing */
                    h3 { color: #333; }
                    @media (prefers-color-scheme: dark) {
                        h3 { color: #eee; }
                    }
                    textarea {
                        width: 100%;
                        height: 150px;
                        background: var(--vscode-input-background, #fff);
                        color: var(--vscode-input-foreground, #000);
                        border: 1px solid var(--vscode-input-border, #ccc);
                        padding: 8px;
                        resize: vertical;
                        font-family: inherit;
                        box-sizing: border-box;
                    }
                    textarea:focus {
                        outline: 1px solid var(--vscode-focusBorder, #007acc);
                    }
                    button {
                        background: var(--vscode-button-background, #007acc);
                        color: var(--vscode-button-foreground, #fff);
                        border: none;
                        padding: 8px 12px;
                        cursor: pointer;
                        font-weight: bold;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 5px;
                    }
                    button:hover {
                        background: var(--vscode-button-hoverBackground, #005a9e);
                    }
                    .controls {
                        display: flex;
                        gap: 10px;
                        align-items: center;
                    }
                    select {
                        background: var(--vscode-dropdown-background, #fff);
                        color: var(--vscode-dropdown-foreground, #000);
                        border: 1px solid var(--vscode-dropdown-border, #ccc);
                        padding: 5px;
                        flex: 1;
                    }
                    #error-container {
                        color: red;
                        font-weight: bold;
                        display: none;
                        padding: 10px;
                        border: 1px solid red;
                    }
				</style>
			</head>
			<body>
				<h3>TTS Assistant</h3>
                <div id="error-container"></div>
                <textarea id="text-input" placeholder="Enter English text here..."></textarea>
                
                <div class="controls">
                    <select id="voice-select">
                        <option value="">Loading voices...</option>
                    </select>
                </div>

                <button id="speak-btn">
                    <span>🔊</span> Speak
                </button>

                <script nonce="${nonce}">
                    try {
                        // Initialize VS Code API
                        const vscode = acquireVsCodeApi();
                        
                        if (!window.speechSynthesis) {
                            throw new Error("Speech Synthesis API is not supported in this environment.");
                        }

                        const synth = window.speechSynthesis;
                        const textInput = document.getElementById('text-input');
                        const speakBtn = document.getElementById('speak-btn');
                        const voiceSelect = document.getElementById('voice-select');
                        const errorContainer = document.getElementById('error-container');

                        function showError(msg) {
                            if (errorContainer) {
                                errorContainer.textContent = msg;
                                errorContainer.style.display = 'block';
                            }
                        }

                        let voices = [];

                        function populateVoices() {
                            try {
                                voices = synth.getVoices().sort(function (a, b) {
                                    const aname = a.name.toUpperCase();
                                    const bname = b.name.toUpperCase();
                                    if (aname < bname) return -1;
                                    else if (aname == bname) return 0;
                                    return +1;
                                });
                                 
                                voiceSelect.innerHTML = '<option value="">Default Voice</option>';
                                 
                                // If voices are empty, try again shortly (sometimes async)
                                if (voices.length === 0) {
                                    setTimeout(populateVoices, 100);
                                    return;
                                }

                                for (let i = 0; i < voices.length; i++) {
                                    // Prefer English voices for better UX
                                    if(voices[i].lang.includes('en')) {
                                        const option = document.createElement('option');
                                        option.textContent = voices[i].name + ' (' + voices[i].lang + ')';
                                        option.setAttribute('data-lang', voices[i].lang);
                                        option.setAttribute('data-name', voices[i].name);
                                        voiceSelect.appendChild(option);
                                    }
                                }
                            } catch (e) {
                                console.error('Error populating voices:', e);
                                showError('Error loading voices: ' + e.message);
                            }
                        }

                        populateVoices();
                        if (speechSynthesis.onvoiceschanged !== undefined) {
                            speechSynthesis.onvoiceschanged = populateVoices;
                        }

                        // 回车触发朗读，Shift+回车换行
                        textInput.addEventListener('keydown', function(e) {
                            console.log('keydown:', e.key, e.keyCode, 'shift:', e.shiftKey);
                            if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
                                e.preventDefault();
                                e.stopPropagation();
                                speakBtn.click();
                                return false;
                            }
                        });

                        speakBtn.addEventListener('click', () => {
                            try {
                                if (synth.speaking) {
                                    synth.cancel();
                                }

                                const text = textInput.value;
                                if (text !== '') {
                                    const utterance = new SpeechSynthesisUtterance(text);
                                    
                                    const selectedOption = voiceSelect.selectedOptions[0] ? voiceSelect.selectedOptions[0].getAttribute('data-name') : null;
                                    if (selectedOption) {
                                        for (let i = 0; i < voices.length; i++) {
                                            if (voices[i].name === selectedOption) {
                                                utterance.voice = voices[i];
                                                break;
                                            }
                                        }
                                    }
                                    
                                    // Default to US English if no voice selected
                                    if(!utterance.voice) {
                                        utterance.lang = 'en-US';
                                    }

                                    synth.speak(utterance);
                                }
                            } catch (e) {
                                 console.error('Error speaking:', e);
                                 showError('Error speaking: ' + e.message);
                            }
                        });
                    } catch (err) {
                        console.error("Critical Webview Error:", err);
                        document.body.innerHTML = '<h3 style="color:red">Extension Error</h3><p>' + err.message + '</p>';
                    }
                </script>
			</body>
			</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
