import * as vscode from 'vscode';
import * as WebSocket from 'ws'; // WebSocket client for buffer_agent
import { spawn, ChildProcess } from 'child_process';
import { SerialPort } from 'serialport'; // native serial
import { buildFrame, cobsDecode, parseFrame } from './protocol'; // P31 binary framing and parser

// Define our Buffer Agent connection
const BUFFER_WS_URL = 'ws://127.0.0.1:8031/ws';
let bufferSocket: WebSocket | null = null;
let pythonProcess: ChildProcess | null = null; // Track the backend process
let crdtProcess: ChildProcess | null = null; // Add CRDT process tracker
let nodeOnePort: SerialPort | null = null; // hardware totem port

import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('P31 Centaur EDE is now online. Voltage steady.');

    // --- 0. BOOT THE PYTHON ENGINE ---
    function startPythonBackend() {
        if (pythonProcess) {
            console.log('Backend already running.');
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('P31 requires an open workspace to boot the AI Mesh.');
            return;
        }
        const backendDir = path.join(workspaceFolders[0].uri.fsPath, 'backend');

        console.log('Igniting Buffer Agent from:', backendDir);

        pythonProcess = spawn('uvicorn', ['buffer_agent:app', '--port', '8031', '--reload'], {
            cwd: backendDir,
            shell: true
        });

        pythonProcess.stdout?.on('data', (data) => {
            console.log(`[P31 Buffer]: ${data.toString().trim()}`);
            if (data.toString().includes('Application startup complete')) {
                connectToBuffer();
            }
        });

        pythonProcess.stderr?.on('data', (data) => {
            console.error(`[P31 Buffer Error]: ${data.toString().trim()}`);
        });

        pythonProcess.on('close', (code) => {
            console.log(`Buffer Agent exited with code ${code}`);
            pythonProcess = null;
            if (bufferSocket) bufferSocket.close();
        });

        // Boot the CRDT Sync Server
        crdtProcess = spawn('python', ['crdt_server.py'], {
            cwd: backendDir,
            shell: true
        });

        crdtProcess.stdout?.on('data', (data) => {
            console.log(`[P31 Sync]: ${data.toString().trim()}`);
        });

        crdtProcess.stderr?.on('data', (data) => {
            console.error(`[P31 Sync Error]: ${data.toString().trim()}`);
        });

        crdtProcess.on('close', (code) => {
            console.log(`CRDT server exited with code ${code}`);
            crdtProcess = null;
        });
    }

    // --- 1. CONNECT TO NODE ONE (ESP32-S3) ---
    async function connectToNodeOne() {
        try {
            const ports = await SerialPort.list();
            const espPortInfo = ports.find(p => 
                p.vendorId && (p.vendorId.toLowerCase() === '303a' || p.vendorId.toLowerCase() === '10c4')
            );

            if (!espPortInfo) {
                console.log('Node One totem not detected on USB.');
                return;
            }

            console.log(`Connecting to Node One on ${espPortInfo.path}...`);
            nodeOnePort = new SerialPort({
                path: espPortInfo.path,
                baudRate: 115200,
                autoOpen: true
            });

            let incomingBuffer = new Uint8Array(0);

            nodeOnePort.on('open', () => {
                console.log('Hardware Link Established. Haptic engine online.');
            });

            // accumulate bytes until 0x00 delimiter, then attempt parse
            nodeOnePort.on('data', (chunk: Buffer) => {
                const arr = new Uint8Array(chunk);
                // append to incomingBuffer
                const combined = new Uint8Array(incomingBuffer.length + arr.length);
                combined.set(incomingBuffer, 0);
                combined.set(arr, incomingBuffer.length);
                incomingBuffer = combined;

                // look for delimiter(s)
                let delimiterIndex;
                while ((delimiterIndex = incomingBuffer.indexOf(0x00)) !== -1) {
                    const frameBytes = incomingBuffer.subarray(0, delimiterIndex);
                    incomingBuffer = incomingBuffer.subarray(delimiterIndex + 1);

                    try {
                        const decoded = cobsDecode(frameBytes);
                        const parsed = parseFrame(decoded);
                        if (parsed) {
                            if (parsed.cmd === 0x20) {
                                console.log('Node One click event received');
                                if (bufferSocket && bufferSocket.readyState === WebSocket.OPEN) {
                                    bufferSocket.send(JSON.stringify({ type: 'thick_click' }));
                                }
                            }
                            // handle other incoming commands if needed
                        } else {
                            console.warn('Invalid frame received from Node One');
                        }
                    } catch (e) {
                        console.error('Error processing incoming frame:', e);
                    }
                }
            });

            nodeOnePort.on('error', (err) => {
                console.error('Node One Serial Error:', err.message);
            });

        } catch (err) {
            console.error('Failed to scan for Node One:', err);
        }
    }



    const disposable = vscode.commands.registerCommand('p31ca.launchDome', () => {
        // Boot the backend BEFORE opening the panel
        startPythonBackend();
        // also attempt to connect to hardware totom
        connectToNodeOne();

        // Create and show a new webview panel
        const panel = vscode.window.createWebviewPanel(
            'p31SpaceshipEarth', // Internal ID
            'Spaceship Earth', // Title displayed to the user
            vscode.ViewColumn.Two, // Open in a split pane to the right
            {
                enableScripts: true, // Crucial for React and Three.js
                retainContextWhenHidden: true // Prevents the 3D scene from reloading when you change tabs
            }
        );

        // compute URI for bundled script
        const scriptPathOnDisk = vscode.Uri.file(
            path.join(context.extensionPath, 'dist', 'webview', 'bundle.js')
        );
        const scriptUri = panel.webview.asWebviewUri(scriptPathOnDisk);

        // Set the initial HTML payload
        panel.webview.html = getWebviewContent(scriptUri);

        // --- 1. ESTABLISH THE BUFFER AGENT LINK ---
        function connectToBuffer() {
            bufferSocket = new WebSocket(BUFFER_WS_URL);

            bufferSocket.on('open', () => {
                console.log('Linked to P31 Buffer Agent.');
                panel.webview.postMessage({ command: 'bufferStatus', data: { connected: true } });
            });

            bufferSocket.on('message', (data) => {
                // Relay AI streams and Neo4j graph updates directly to the Dome
                const payload = data.toString();
                panel.webview.postMessage({ command: 'bufferStream', data: payload });
            });

            bufferSocket.on('close', () => {
                panel.webview.postMessage({ command: 'bufferStatus', data: { connected: false } });
                // Reconnect logic can go here
            });
        }
        
        connectToBuffer();


        // -------------------------------------------------------------------
        // Synaptic Bridge: messages from the webview -> extension host
        // -------------------------------------------------------------------
        panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'systemReady':
                        vscode.window.showInformationMessage('P31: Spaceship Earth Link Established.');
                        
                        // Send initial context back to the Dome
                        const activeEditor = vscode.window.activeTextEditor;
                        const fileName = activeEditor ? activeEditor.document.fileName.split(/[/\\]/).pop() : 'No Active File';
                        const hasSelection = activeEditor ? !activeEditor.selection.isEmpty : false;
                        
                        panel.webview.postMessage({ 
                            command: 'updateContext', 
                            data: { activeFile: fileName, hasSelection: hasSelection } 
                        });
                        break;
                        
                    case 'triggerHaptic':
                        // Fire the physical "Thick Click" using P31 protocol
                        if (nodeOnePort && nodeOnePort.isOpen) {
                            const intensity = message.data?.intensity || 100;
                            const payloadBytes = new Uint8Array([intensity]);
                            const frame = buildFrame(0x02, payloadBytes);

                            nodeOnePort.write(frame, (err) => {
                                if (err) console.error('Haptic frame transmission failed:', err);
                                else console.log(`[P31 Protocol] Haptic frame dispatched. Intensity: ${intensity}%`);
                            });
                        } else {
                            console.log('Haptic requested, but Node One is offline.');
                        }
                        break;
                    case 'sendToBuffer':
                        // Enrich the payload with IDE context before forwarding
                        const editorForBuffer = vscode.window.activeTextEditor;
                        let selectedText = '';
                        if (editorForBuffer && !editorForBuffer.selection.isEmpty) {
                            selectedText = editorForBuffer.document.getText(editorForBuffer.selection);
                        }
                        const enrichedPayload = {
                            action: message.data.action,
                            content: message.data.content,
                            context: {
                                activeFile: editorForBuffer ? editorForBuffer.document.fileName : null,
                                highlightedCode: selectedText
                            }
                        };
                        if (bufferSocket && bufferSocket.readyState === WebSocket.OPEN) {
                            bufferSocket.send(JSON.stringify(enrichedPayload));
                        } else {
                            vscode.window.showErrorMessage('P31 Buffer Agent is offline. Is FastAPI running?');
                        }
                        break;
                    case 'remote_access_request':
                        vscode.window.showInformationMessage(
                            `P31 Andromeda: Remote Agent requesting access to ${message.data.nodeId}`,
                            'Open Cockpit'
                        ).then(selection => {
                            if (selection === 'Open Cockpit') {
                                vscode.commands.executeCommand('p31ca.launchDome');
                            }
                        });
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        // listen for active editor changes and forward updates
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && panel.visible) {
                const fname = editor.document.fileName.split(/[/\\]/).pop();
                const hasSelection = !editor.selection.isEmpty;
                panel.webview.postMessage({ 
                    command: 'updateContext', 
                    data: { activeFile: fname, hasSelection: hasSelection } 
                });
            }
        });

        // also watch selection changes within the same editor
        vscode.window.onDidChangeTextEditorSelection((event) => {
            if (event.textEditor && panel.visible) {
                const fname = event.textEditor.document.fileName.split(/[/\\]/).pop();
                const hasSelection = !event.textEditor.selection.isEmpty;
                panel.webview.postMessage({
                    command: 'updateContext',
                    data: { activeFile: fname, hasSelection: hasSelection }
                });
            }
        });
    });

    context.subscriptions.push(disposable);
}

function getWebviewContent(scriptUri?: vscode.Uri) {
    // This is a placeholder shell until the React/Three.js bundle is loaded.
    // When compilation succeeds the bundle will mount into the <div id="root"/>.
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Spaceship Earth</title>
        <style>
            body { 
                margin: 0; padding: 0; 
                background-color: #050510; /* COLORS.void */
                color: #4ecdc4; /* COLORS.teal */
                font-family: 'JetBrains Mono', monospace; 
                display: flex; justify-content: center; align-items: center; 
                height: 100vh; overflow: hidden;
            }
            .status { text-align: center; }
            .glow { text-shadow: 0 0 10px #4ecdc4; }
        </style>
    </head>
    <body>
        <div id="root" style="width:100%;height:100%">
            <div class="status">
                <h1 class="glow">P31 IVM INITIALIZED</h1>
                <p>Awaiting React/Three.js injection...</p>
            </div>
        </div>
        ${scriptUri ? `<script src="${scriptUri}"></script>` : ''}
    </body>
    </html>`;
}

export function deactivate() {
    console.log('P31 EDE powering down. Severing Buffer Agent.');
    if (bufferSocket) {
        bufferSocket.close();
    }
    if (pythonProcess) {
        // kill child to prevent zombie uvicorn instances
        pythonProcess.kill('SIGTERM');
    }
    if (crdtProcess) {
        // terminate lightweight sync server
        crdtProcess.kill('SIGTERM');
    }
}
