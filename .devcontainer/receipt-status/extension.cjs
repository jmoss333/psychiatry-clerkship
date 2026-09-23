'use strict';

const { resolve } = require('node:path');
const { presentationFor } = require('./presentation.cjs');
const COMMAND = 'clerkship.verifyDevContainer';
const UNAVAILABLE = { state: 'stale', reason: 'status-unavailable', shortCommit: '' };

function createController({ vscode, execFile, root, intervalMs = 15000 }) {
  if (process.env.CLERKSHIP_DEVCONTAINER !== '1' || !root) return;
  const receiptCli = resolve(root, 'bin/devcontainer-receipt.mjs');
  const receiptRelative = 'output/devcontainer/verification-receipt.json';
  const receiptPath = resolve(root, receiptRelative);
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  item.name = 'Dev Container verification';
  item.command = COMMAND;
  let disposed = false;
  let generation = 0;
  let pending;

  function render(status) {
    const view = presentationFor(status);
    item.text = view.text;
    item.color = new vscode.ThemeColor(view.color);
    item.tooltip = view.tooltip;
  }

  function refresh() {
    if (disposed) return;
    const current = ++generation;
    pending?.kill();
    pending = undefined;
    render(UNAVAILABLE);
    let completed = false;
    try {
      const child = execFile('node', [receiptCli, 'status', '--path', receiptPath, '--root', root], {
        timeout: 5000, maxBuffer: 65536,
      }, (error, stdout) => {
        completed = true;
        if (disposed || current !== generation) return;
        pending = undefined;
        let status = UNAVAILABLE;
        if (!error) {
          try { status = JSON.parse(stdout); } catch { /* Keep the visible unavailable state. */ }
        }
        render(status);
      });
      if (!completed) pending = child;
    } catch {
      render(UNAVAILABLE);
    }
  }

  render(UNAVAILABLE);
  item.show();
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, receiptRelative));
  const subscriptions = [
    item,
    watcher,
    watcher.onDidCreate(refresh),
    watcher.onDidChange(refresh),
    watcher.onDidDelete(refresh),
    vscode.window.onDidChangeWindowState((state) => { if (state.focused) refresh(); }),
    vscode.commands.registerCommand(COMMAND, () => vscode.commands.executeCommand('workbench.action.tasks.runTask', 'Verify Dev Container')),
  ];
  const timer = setInterval(refresh, intervalMs);
  refresh();
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      pending?.kill();
      pending = undefined;
      for (const subscription of subscriptions) subscription.dispose();
    },
  };
}

function activate(context) {
  const vscode = require('vscode');
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const controller = createController({ vscode, execFile: require('node:child_process').execFile, root });
  if (controller) context.subscriptions.push(controller);
}

module.exports = { activate, createController };
