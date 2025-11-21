import * as vscode from "vscode";
import { createRepository } from "./commands/create";
import { deleteRepository } from "./commands/delete";
import { modifyRepository } from "./commands/modify";

export function activate(context: vscode.ExtensionContext): void {
  const createCommand = vscode.commands.registerCommand(
    "github-repo-factory.create",
    () => {
      createRepository();
    }
  );

  const deleteCommand = vscode.commands.registerCommand(
    "github-repo-factory.delete",
    () => {
      deleteRepository();
    }
  );

  const modifyCommand = vscode.commands.registerCommand(
    "github-repo-factory.modify",
    () => {
      modifyRepository();
    }
  );

  context.subscriptions.push(createCommand, deleteCommand, modifyCommand);
}

export function deactivate(): void {
  // Cleanup if needed
}
