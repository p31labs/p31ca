import * as vscode from 'vscode';

const SPOON_BASELINE = 12;
const CONTEXT_SWITCH_COST = 1.5;

let currentSpoons = SPOON_BASELINE;
let statusBarItem: vscode.StatusBarItem;
let lastActiveFile: string | undefined;

function getLevel(spoons: number): { label: string; icon: string; layer: number } {
  if (spoons < 3) return { label: 'BREATHE', icon: '🫁', layer: 0 };
  if (spoons < 6) return { label: 'FOCUS', icon: '🎯', layer: 1 };
  if (spoons < 9) return { label: 'BUILD', icon: '🔨', layer: 2 };
  return { label: 'COMMAND', icon: '🚀', layer: 3 };
}

function updateStatusBar(): void {
  const { label, icon } = getLevel(currentSpoons);
  const pct = Math.round((currentSpoons / SPOON_BASELINE) * 100);
  statusBarItem.text = `${icon} ${currentSpoons.toFixed(1)}/${SPOON_BASELINE} ${label}`;
  statusBarItem.tooltip = `Spoon Gauge: ${pct}% capacity\nLayer: ${label}\nClick to adjust`;

  if (currentSpoons < 3) {
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else if (currentSpoons < 6) {
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    statusBarItem.backgroundColor = undefined;
  }
}

function deductSpoons(amount: number, reason: string): void {
  currentSpoons = Math.max(0, currentSpoons - amount);
  updateStatusBar();
  console.log(`[SpoonGauge] -${amount} (${reason}) → ${currentSpoons.toFixed(1)}`);
}

function restoreSpoons(amount: number, reason: string): void {
  currentSpoons = Math.min(SPOON_BASELINE, currentSpoons + amount);
  updateStatusBar();
  console.log(`[SpoonGauge] +${amount} (${reason}) → ${currentSpoons.toFixed(1)}`);
}

export function activate(context: vscode.ExtensionContext) {
  // Status bar item (bottom right)
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'p31.spoonGauge.show';
  updateStatusBar();
  statusBarItem.show();

  // Track context switches (file changes)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const currentFile = editor?.document.uri.toString();
      if (lastActiveFile && currentFile && lastActiveFile !== currentFile) {
        deductSpoons(CONTEXT_SWITCH_COST, 'context_switch');
      }
      lastActiveFile = currentFile;
    })
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('p31.spoonGauge.show', () => {
      const { label, layer } = getLevel(currentSpoons);
      vscode.window.showInformationMessage(
        `Spoon Gauge: ${currentSpoons.toFixed(1)}/${SPOON_BASELINE} | ${label} (Layer ${layer})`
      );
    }),
    vscode.commands.registerCommand('p31.spoonGauge.deduct', () => {
      deductSpoons(1.0, 'manual');
    }),
    vscode.commands.registerCommand('p31.spoonGauge.restore', () => {
      restoreSpoons(1.0, 'manual');
    })
  );

  // Restore spoons for sustained deep work (every 30 min)
  const deepWorkTimer = setInterval(() => {
    restoreSpoons(1.0, 'deep_work_30min');
  }, 30 * 60 * 1000);

  context.subscriptions.push({ dispose: () => clearInterval(deepWorkTimer) });
  context.subscriptions.push(statusBarItem);
}

export function deactivate() {}
