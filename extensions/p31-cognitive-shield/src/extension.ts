/**
 * P31 Cognitive Shield
 *
 * Scores incoming messages for voltage (urgency/emotional/cognitive load)
 * using the canonical formula: composite = urgency*0.4 + emotional*0.3 + cognitive*0.3
 *
 * Batches notifications at 60s intervals to prevent interrupt-driven spoon depletion.
 * Thresholds (0-10 scale): GREEN <3, YELLOW 3-6, RED 6-8, CRITICAL >=8
 */

import * as vscode from 'vscode';

interface VoltageResult {
  urgency: number;
  emotional: number;
  cognitive: number;
  composite: number;
  level: string;
}

function scoreVoltage(text: string): VoltageResult {
  const lower = text.toLowerCase();

  const urgencyWords = ['urgent', 'asap', 'blocker', 'critical', 'deadline', 'emergency'];
  const emotionalWords = ['angry', 'frustrated', 'unacceptable', 'disappointed', 'furious'];
  const cognitiveWords = ['review', 'architecture', 'refactor', 'redesign', 'migrate', 'complex'];

  let urgency = 0;
  urgencyWords.forEach(w => { if (lower.includes(w)) urgency += 2.5; });
  urgency = Math.min(10, urgency);

  let emotional = 0;
  emotionalWords.forEach(w => { if (lower.includes(w)) emotional += 2.0; });
  emotional = Math.min(10, emotional);

  let cognitive = 0;
  cognitiveWords.forEach(w => { if (lower.includes(w)) cognitive += 2.0; });
  cognitive = Math.min(10, cognitive);

  const composite = Math.min(10, +(urgency * 0.4 + emotional * 0.3 + cognitive * 0.3).toFixed(2));

  let level: string;
  if (composite >= 8) level = 'CRITICAL';
  else if (composite >= 6) level = 'RED';
  else if (composite >= 3) level = 'YELLOW';
  else level = 'GREEN';

  return { urgency, emotional, cognitive, composite, level };
}

const LEVEL_ICONS: Record<string, string> = {
  GREEN: '🟢',
  YELLOW: '🟡',
  RED: '🔴',
  CRITICAL: '⛔',
};

let batchedMessages: { text: string; voltage: VoltageResult }[] = [];

export function activate(context: vscode.ExtensionContext) {
  // 60-second batching timer
  const batchTimer = setInterval(() => {
    if (batchedMessages.length === 0) return;

    const maxVoltage = batchedMessages.reduce(
      (max, m) => m.voltage.composite > max.voltage.composite ? m : max,
      batchedMessages[0]
    );

    const icon = LEVEL_ICONS[maxVoltage.voltage.level] || '🟢';
    const count = batchedMessages.length;

    vscode.window.setStatusBarMessage(
      `Shield: ${icon} ${count} msg(s), peak V:${maxVoltage.voltage.composite}`,
      5000
    );

    // Only show notification for RED/CRITICAL
    if (maxVoltage.voltage.composite >= 6) {
      vscode.window.showWarningMessage(
        `Cognitive Shield: ${icon} High voltage detected (${maxVoltage.voltage.composite.toFixed(1)}). ` +
        `${count} message(s) batched. Consider a breathing break.`
      );
    }

    batchedMessages = [];
  }, 60000);

  // Command to check status
  context.subscriptions.push(
    vscode.commands.registerCommand('p31.shield.status', () => {
      const pending = batchedMessages.length;
      vscode.window.showInformationMessage(
        `Cognitive Shield: ${pending} message(s) in current batch. ` +
        `Batch interval: 60s.`
      );
    })
  );

  context.subscriptions.push({ dispose: () => clearInterval(batchTimer) });
}

export function deactivate() {}
