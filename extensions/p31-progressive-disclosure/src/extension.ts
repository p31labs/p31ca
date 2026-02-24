/**
 * P31 Progressive Disclosure
 *
 * Adapts VS Code UI complexity based on operator spoon level:
 *   Layer 0 — Breathe (spoons < 3):  minimal UI, breathing pacer only
 *   Layer 1 — Focus   (spoons 3-6):  editor + AI chat only
 *   Layer 2 — Build   (spoons 6-9):  full IDE (default)
 *   Layer 3 — Command (spoons 9-12): all systems, passphrase-gated
 */

import * as vscode from 'vscode';

interface LayerConfig {
  name: string;
  hidePanels: string[];
  hideActivityBar: boolean;
  hideStatusBar: boolean;
  zenMode: boolean;
}

interface LayerPickItem extends vscode.QuickPickItem {
  value: number;
}

const LAYERS: Record<number, LayerConfig> = {
  0: {
    name: 'BREATHE',
    hidePanels: ['terminal', 'problems', 'output', 'debug'],
    hideActivityBar: true,
    hideStatusBar: true,
    zenMode: true,
  },
  1: {
    name: 'FOCUS',
    hidePanels: ['terminal', 'debug'],
    hideActivityBar: false,
    hideStatusBar: false,
    zenMode: false,
  },
  2: {
    name: 'BUILD',
    hidePanels: [],
    hideActivityBar: false,
    hideStatusBar: false,
    zenMode: false,
  },
  3: {
    name: 'COMMAND',
    hidePanels: [],
    hideActivityBar: false,
    hideStatusBar: false,
    zenMode: false,
  },
};

let currentLayer = 2;

async function applyLayer(layer: number): Promise<void> {
  const config = LAYERS[layer];
  if (!config) return;

  currentLayer = layer;

  // Toggle zen mode for Layer 0
  const isZen = vscode.workspace
    .getConfiguration('zenMode')
    .get<boolean>('fullScreen', false);

  if (config.zenMode && !isZen) {
    await vscode.commands.executeCommand('workbench.action.toggleZenMode');
  } else if (!config.zenMode && isZen) {
    await vscode.commands.executeCommand('workbench.action.toggleZenMode');
  }

  // Activity bar visibility
  await vscode.workspace.getConfiguration('workbench').update(
    'activityBar.visible',
    !config.hideActivityBar,
    vscode.ConfigurationTarget.Workspace
  );

  // Status bar visibility
  await vscode.workspace.getConfiguration('workbench').update(
    'statusBar.visible',
    !config.hideStatusBar,
    vscode.ConfigurationTarget.Workspace
  );

  // Hide/show panels based on layer config
  const panelCommands: Record<string, string> = {
    terminal: 'workbench.action.terminal.toggleTerminal',
    problems: 'workbench.actions.view.problems',
    output: 'workbench.action.output.toggleOutput',
    debug: 'workbench.view.debug',
  };
  for (const panel of Object.keys(panelCommands)) {
    if (config.hidePanels.includes(panel)) {
      await vscode.commands.executeCommand('workbench.action.closePanel').then(
        () => {},
        () => {}
      );
    }
  }

  vscode.window.showInformationMessage(
    `Disclosure Layer ${layer}: ${config.name}`
  );
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('p31.disclosure.setLayer', async () => {
      const picked = await vscode.window.showQuickPick<LayerPickItem>(
        [
          { label: '0 — Breathe', description: 'Minimal UI, calming', value: 0 },
          { label: '1 — Focus', description: 'Editor + AI chat', value: 1 },
          { label: '2 — Build', description: 'Full IDE (default)', value: 2 },
          { label: '3 — Command', description: 'All systems', value: 3 },
        ],
        { placeHolder: 'Select disclosure layer' }
      );
      if (picked) {
        await applyLayer(picked.value);
      }
    }),

    vscode.commands.registerCommand('p31.disclosure.status', () => {
      const config = LAYERS[currentLayer];
      vscode.window.showInformationMessage(
        `Current Layer: ${currentLayer} (${config.name})`
      );
    })
  );

  // Default to Layer 2 (BUILD)
  applyLayer(2);
}

export function deactivate() {}
