/**
 * P31 Cockpit Panel
 *
 * Unified status dashboard showing:
 * - Backend connection status
 * - Neo4j graph status
 * - Spoon gauge summary
 * - Active node count
 * - AI mesh status
 */

import * as vscode from 'vscode';
import * as http from 'http';

interface HealthData {
  status: string;
  uptime: number;
  neo4j: string;
  spoons: number;
  timestamp: string;
}

class StatusProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private healthData: HealthData | null = null;

  refresh(): void {
    this.fetchHealth().then(() => this._onDidChangeTreeData.fire());
  }

  private fetchHealth(): Promise<void> {
    return new Promise((resolve) => {
      const req = http.get('http://localhost:8031/health', (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            this.healthData = JSON.parse(data);
          } catch {
            this.healthData = null;
          }
          resolve();
        });
      });
      req.on('error', () => {
        this.healthData = null;
        resolve();
      });
      req.setTimeout(3000, () => {
        req.destroy();
        this.healthData = null;
        resolve();
      });
    });
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    if (!this.healthData) {
      const item = new vscode.TreeItem('○ Backend Offline');
      item.description = 'localhost:8031 unreachable';
      return [item];
    }

    const h = this.healthData;
    return [
      this.makeItem(`● Backend`, h.status),
      this.makeItem(`Neo4j`, h.neo4j),
      this.makeItem(`Spoons`, `${h.spoons.toFixed(1)} / 12`),
      this.makeItem(`Uptime`, `${Math.floor(h.uptime)}s`),
    ];
  }

  private makeItem(label: string, desc: string): vscode.TreeItem {
    const item = new vscode.TreeItem(label);
    item.description = desc;
    return item;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new StatusProvider();

  vscode.window.registerTreeDataProvider('p31.cockpit.status', provider);

  // Auto-refresh every 15s
  const refreshTimer = setInterval(() => provider.refresh(), 15000);

  context.subscriptions.push(
    vscode.commands.registerCommand('p31.cockpit.open', () => {
      provider.refresh();
      vscode.commands.executeCommand('p31.cockpit.status.focus');
    }),
    { dispose: () => clearInterval(refreshTimer) }
  );

  // Initial fetch
  provider.refresh();
}

export function deactivate() {}
