import * as vscode from "vscode";
import {
  executeGhCommand,
  getUserRepositories,
  getCurrentUser,
  getUserOrganizations,
  RepositoryInfo,
} from "../utils/ghCli";

export async function deleteRepository(
  repoName?: string,
  silent = false
): Promise<boolean> {
  let targetRepo = repoName;

  if (!targetRepo) {
    // Show progress while fetching repositories
    const repos = await vscode.window.withProgress<RepositoryInfo[]>(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Loading repositories...",
        cancellable: false,
      },
      async () => {
        // Get current user and organizations
        const currentUser = await getCurrentUser();
        const organizations = await getUserOrganizations();

        // Fetch repositories from user and all organizations
        const allRepos: RepositoryInfo[] = [];

        // Fetch user's repositories
        if (currentUser) {
          const userRepos = await getUserRepositories(currentUser);
          allRepos.push(...userRepos);
        }

        // Fetch repositories from each organization
        for (const org of organizations) {
          const orgRepos = await getUserRepositories(org);
          allRepos.push(...orgRepos);
        }

        // Remove duplicates (in case a repo appears in multiple places)
        const uniqueRepos = new Map<string, RepositoryInfo>();
        for (const repo of allRepos) {
          if (repo.fullName && !uniqueRepos.has(repo.fullName)) {
            uniqueRepos.set(repo.fullName, repo);
          }
        }

        return Array.from(uniqueRepos.values()).sort((a, b) =>
          a.fullName.localeCompare(b.fullName)
        );
      }
    );

    if (repos.length === 0) {
      vscode.window.showWarningMessage(
        "No repositories found. Make sure you have access to at least one repository."
      );
      return false;
    }

    // Create QuickPick items with search/filter capability
    const items: vscode.QuickPickItem[] = repos.map((repo) => ({
      label: repo.fullName,
      description: repo.description || "",
      detail: repo.visibility ? `Visibility: ${repo.visibility}` : undefined,
    }));

    // Show searchable QuickPick
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Search and select repository to delete...",
      title: "Select Repository to Delete",
      ignoreFocusOut: true,
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!selected) {
      return false; // User cancelled
    }

    targetRepo = selected.label;
  }

  // Confirmation dialog
  if (!silent) {
    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to delete repository "${targetRepo}"? This action cannot be undone.`,
      { modal: true },
      "Delete",
      "Cancel"
    );

    if (confirm !== "Delete") {
      return false;
    }
  }

  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Deleting repository ${targetRepo}`,
      cancellable: false,
    },
    async () => {
      try {
        const command = `gh repo delete ${targetRepo} --yes`;
        const result = await executeGhCommand(command);

        if (!result.success) {
          if (!silent) {
            // Check for missing delete_repo scope error
            const errorText = result.stderr.toLowerCase();
            if (
              errorText.includes("delete_repo") ||
              (errorText.includes("403") && errorText.includes("admin rights"))
            ) {
              const message =
                `Failed to delete repository: Missing required permissions.\n\n` +
                `The delete operation requires the "delete_repo" scope. To fix this, run:\n\n` +
                `gh auth refresh -h github.com -s delete_repo\n\n` +
                `Then try deleting the repository again.`;
              vscode.window
                .showErrorMessage(message, "Open Documentation")
                .then((action) => {
                  if (action === "Open Documentation") {
                    vscode.env.openExternal(
                      vscode.Uri.parse(
                        "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
                      )
                    );
                  }
                });
            } else {
              vscode.window.showErrorMessage(
                `Failed to delete repository: ${result.stderr}`
              );
            }
          }
          return false;
        }

        if (!silent) {
          vscode.window.showInformationMessage(
            `Repository ${targetRepo} deleted successfully.`
          );
        }
        return true;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (!silent) {
          vscode.window.showErrorMessage(
            `Error deleting repository: ${errorMessage}`
          );
        }
        return false;
      }
    }
  );
}
