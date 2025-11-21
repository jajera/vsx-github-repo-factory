// Mock vscode module for unit tests
export const window = {
  showErrorMessage: () => Promise.resolve(undefined),
  showInformationMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  showInputBox: () => Promise.resolve(undefined),
  showQuickPick: () => Promise.resolve(undefined),
  createQuickPick: () => ({
    items: [],
    activeItems: [],
    placeholder: "",
    title: "",
    ignoreFocusOut: false,
    onDidAccept: () => ({ dispose: () => {} }),
    onDidHide: () => ({ dispose: () => {} }),
    show: () => {},
    dispose: () => {},
  }),
  withProgress: async (options: any, task: any) => {
    const progress = {
      report: () => {},
    };
    return await task(progress, { isCancellationRequested: false });
  },
};

export const ProgressLocation = {
  Notification: 15,
  Window: 10,
  SourceControl: 1,
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: () => Promise.resolve(undefined),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path }),
};

export const workspace = {
  workspaceFolders: undefined,
};

