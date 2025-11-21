import * as vscode from "vscode";
import {
  getRepositorySettings,
  applyRepositorySettings,
} from "../utils/settings";
import {
  getUserRepositories,
  getCurrentUser,
  getUserOrganizations,
  RepositoryInfo,
} from "../utils/ghCli";
import { RepositorySettings } from "../types";

export async function modifyRepository(repoName?: string): Promise<void> {
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
      return;
    }

    // Create QuickPick items with search/filter capability
    const items: vscode.QuickPickItem[] = repos.map((repo) => ({
      label: repo.fullName,
      description: repo.description || "",
      detail: repo.visibility ? `Visibility: ${repo.visibility}` : undefined,
    }));

    // Show searchable QuickPick
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Search and select repository to modify...",
      title: "Select Repository to Modify",
      ignoreFocusOut: true,
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!selected) {
      return; // User cancelled
    }

    targetRepo = selected.label;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Modifying repository ${targetRepo}`,
      cancellable: true,
    },
    async (progress, token) => {
      try {
        // Fetch current settings
        progress.report({
          increment: 0,
          message: "Fetching current repository settings...",
        });
        if (token.isCancellationRequested) {
          return;
        }

        if (!targetRepo) {
          return;
        }

        const currentSettings = await getRepositorySettings(targetRepo);
        if (!currentSettings) {
          vscode.window.showErrorMessage(
            "Failed to fetch repository settings."
          );
          return;
        }

        // Collect modifications
        progress.report({
          increment: 30,
          message: "Collecting modifications...",
        });
        if (token.isCancellationRequested) {
          return;
        }

        const modifications = await collectModifications(
          currentSettings,
          token
        );
        if (!modifications) {
          return; // User cancelled
        }

        // Check if there are any actual changes
        if (Object.keys(modifications).length === 0) {
          vscode.window.showInformationMessage(
            "No changes to apply. Repository settings are already as specified."
          );
          return;
        }

        // Apply modifications
        progress.report({
          increment: 60,
          message: "Applying modifications...",
        });
        if (token.isCancellationRequested) {
          return;
        }

        const result = await applyRepositorySettings(
          targetRepo,
          modifications,
          currentSettings
        );

        // Check if there were no actual changes (all values same as current)
        if (result.noChanges) {
          vscode.window.showInformationMessage(
            "No changes detected. All selected settings are already set to the specified values."
          );
          return;
        }

        if (!result.success) {
          vscode.window.showErrorMessage(
            `Failed to apply modifications: ${result.errors.join(", ")}`
          );
          return;
        }

        progress.report({
          increment: 100,
          message: "Modifications applied successfully!",
        });
        vscode.window.showInformationMessage(
          `Repository ${targetRepo} modified successfully.`
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
          `Error modifying repository: ${errorMessage}`
        );
      }
    }
  );
}

async function collectModifications(
  currentSettings: RepositorySettings,
  cancellationToken?: vscode.CancellationToken
): Promise<RepositorySettings | null> {
  // Check cancellation before starting
  if (cancellationToken?.isCancellationRequested) {
    return null;
  }

  const modifications: RepositorySettings = {};

  // Helper to add "Back" option to QuickPick
  function addBackOption<T extends { label: string }>(
    items: T[],
    canGoBack: boolean
  ): (T | { label: string; value: string })[] {
    if (!canGoBack) {
      return items;
    }
    return [{ label: "← Back", value: "back" }, ...items] as (
      | T
      | { label: string; value: string }
    )[];
  }

  // Helper function to prompt for a boolean setting (similar to create)
  const promptBooleanSetting = async (
    settingName: string,
    currentValue: boolean,
    canGoBack: boolean,
    stepNumber?: number,
    totalSteps?: number
  ): Promise<boolean | null> => {
    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    const options = [
      {
        label: currentValue ? "Yes" : "No",
        value: currentValue,
        description: `Current: ${currentValue ? "Yes" : "No"}`,
      },
      {
        label: currentValue ? "No" : "Yes",
        value: !currentValue,
        description: currentValue ? "Disable" : "Enable",
      },
    ];

    const allOptions = canGoBack
      ? [{ label: "← Back", value: "back" as const }, ...options]
      : options;

    const quickPick = vscode.window.createQuickPick();
    quickPick.items = allOptions.map((opt) => {
      if (opt.value === "back") {
        return { label: opt.label };
      }
      return {
        label: opt.label,
        description: opt.description,
      };
    });

    const stepText =
      stepNumber && totalSteps ? `Step ${stepNumber}/${totalSteps}: ` : "";
    quickPick.placeholder = `[Modify] ${stepText}${settingName} (current: ${
      currentValue ? "Yes" : "No"
    })`;
    quickPick.title = `[Modify] ${settingName}`;
    quickPick.ignoreFocusOut = true;

    // Set current value as active (skip back button if present)
    const currentOption = quickPick.items[canGoBack ? 1 : 0];
    quickPick.activeItems = [currentOption];

    const result = await new Promise<boolean | null | undefined>((resolve) => {
      let resolved = false;

      quickPick.onDidAccept(() => {
        if (resolved) {
          return;
        }
        const selected = quickPick.activeItems[0];
        if (selected.label === "← Back") {
          resolved = true;
          quickPick.dispose();
          resolve(null);
          return;
        }
        const option = options.find((opt) => opt.label === selected.label);
        resolved = true;
        quickPick.dispose();
        resolve(option?.value);
      });

      quickPick.onDidHide(() => {
        if (!resolved) {
          resolved = true;
          quickPick.dispose();
          resolve(undefined);
        }
      });

      quickPick.show();
    });

    if (result === null || result === undefined) {
      return null;
    }
    return result;
  };

  // Step identifiers
  enum Step {
    CATEGORY = "category",
    BASIC_DESCRIPTION = "basic_description",
    BASIC_VISIBILITY = "basic_visibility",
    FEATURES_WIKI = "features_wiki",
    FEATURES_ISSUES = "features_issues",
    FEATURES_PROJECTS = "features_projects",
    FEATURES_DISCUSSIONS = "features_discussions",
    PR_SQUASH = "pr_squash",
    PR_MERGE = "pr_merge",
    PR_REBASE = "pr_rebase",
    PR_AUTO = "pr_auto",
    PR_DELETE_BRANCH = "pr_delete_branch",
    PR_UPDATE_BRANCH = "pr_update_branch",
    GENERAL_SIGNOFF = "general_signoff",
    DONE = "done",
  }

  let currentStep: Step = Step.CATEGORY;
  let selectedCategory: string | undefined;

  // Get step sequence based on category
  function getStepSequence(category: string | undefined): Step[] {
    if (!category) {
      return [Step.CATEGORY, Step.DONE];
    }
    if (category === "basic") {
      return [
        Step.CATEGORY,
        Step.BASIC_DESCRIPTION,
        Step.BASIC_VISIBILITY,
        Step.DONE,
      ];
    }
    if (category === "features") {
      return [
        Step.CATEGORY,
        Step.FEATURES_WIKI,
        Step.FEATURES_ISSUES,
        Step.FEATURES_PROJECTS,
        Step.FEATURES_DISCUSSIONS,
        Step.DONE,
      ];
    }
    if (category === "pr") {
      return [
        Step.CATEGORY,
        Step.PR_SQUASH,
        Step.PR_MERGE,
        Step.PR_REBASE,
        Step.PR_AUTO,
        Step.PR_DELETE_BRANCH,
        Step.PR_UPDATE_BRANCH,
        Step.DONE,
      ];
    }
    if (category === "general") {
      return [Step.CATEGORY, Step.GENERAL_SIGNOFF, Step.DONE];
    }
    if (category === "all") {
      return [
        Step.CATEGORY,
        Step.BASIC_DESCRIPTION,
        Step.BASIC_VISIBILITY,
        Step.FEATURES_WIKI,
        Step.FEATURES_ISSUES,
        Step.FEATURES_PROJECTS,
        Step.FEATURES_DISCUSSIONS,
        Step.PR_SQUASH,
        Step.PR_MERGE,
        Step.PR_REBASE,
        Step.PR_AUTO,
        Step.PR_DELETE_BRANCH,
        Step.PR_UPDATE_BRANCH,
        Step.GENERAL_SIGNOFF,
        Step.DONE,
      ];
    }
    return [Step.CATEGORY, Step.DONE];
  }

  // Get current step number for display
  function getCurrentStepNumber(): number {
    const sequence = getStepSequence(selectedCategory);
    const index = sequence.indexOf(currentStep);
    return index >= 0 ? index + 1 : 1;
  }

  // Get total number of steps
  function getTotalSteps(): number {
    const sequence = getStepSequence(selectedCategory);
    return sequence.length - 1; // Exclude DONE
  }

  // Get next step in sequence
  function getNextStep(): Step {
    const sequence = getStepSequence(selectedCategory);
    const currentIndex = sequence.indexOf(currentStep);
    if (currentIndex >= 0 && currentIndex < sequence.length - 1) {
      return sequence[currentIndex + 1];
    }
    return Step.DONE;
  }

  // Move to next step
  function moveToNextStep(): void {
    currentStep = getNextStep();
  }

  // Move to previous step
  function moveToPreviousStep(): void {
    const sequence = getStepSequence(selectedCategory);
    const currentIndex = sequence.indexOf(currentStep);
    if (currentIndex > 0) {
      currentStep = sequence[currentIndex - 1];
    }
  }

  // Navigation loop
  while ((currentStep as Step) !== Step.DONE) {
    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    // Step: Category selection
    if (currentStep === Step.CATEGORY) {
      const categoryOptions = [
        {
          label: "Basic Settings",
          value: "basic",
          description: "Description and visibility",
        },
        {
          label: "Features",
          value: "features",
          description: "Wiki, Issues, Projects, Discussions",
        },
        {
          label: "Pull Request Settings",
          value: "pr",
          description: "Merge options and PR settings",
        },
        {
          label: "General Settings",
          value: "general",
          description: "Web commit signoff",
        },
        {
          label: "All Settings",
          value: "all",
          description: "Modify all settings",
        },
      ];

      const quickPick = vscode.window.createQuickPick();
      const allOptions = addBackOption(categoryOptions, false); // No back on first step
      quickPick.items = allOptions as vscode.QuickPickItem[];
      quickPick.placeholder = `[Modify] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Select category to modify`;
      quickPick.title = "[Modify] Category Selection";
      quickPick.ignoreFocusOut = true;

      const category = await new Promise<
        (typeof categoryOptions)[number] | undefined
      >((resolve) => {
        let resolved = false;

        quickPick.onDidAccept(() => {
          if (resolved) {
            return;
          }
          const selected = quickPick.activeItems[0] as vscode.QuickPickItem;
          if (selected?.label === "← Back") {
            resolved = true;
            quickPick.dispose();
            resolve(undefined);
            return;
          }
          const option = categoryOptions.find(
            (opt) => opt.label === selected?.label
          );
          resolved = true;
          quickPick.dispose();
          resolve(option);
        });

        quickPick.onDidHide(() => {
          if (!resolved) {
            resolved = true;
            quickPick.dispose();
            resolve(undefined);
          }
        });

        quickPick.show();
      });

      if (!category) {
        return null;
      }

      selectedCategory = category.value;
      moveToNextStep();
      continue;
    }

    // Step: Basic Description
    if (
      currentStep === Step.BASIC_DESCRIPTION &&
      (selectedCategory === "basic" || selectedCategory === "all")
    ) {
      const description = await vscode.window.showInputBox({
        prompt: "Enter new description (leave empty to keep current)",
        value: currentSettings.description || "",
        title: `[Modify] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Repository Description`,
        ignoreFocusOut: true,
        validateInput: () => null, // Allow empty
      });

      if (description === undefined) {
        // User cancelled or went back
        moveToPreviousStep();
        continue;
      }

      modifications.description = description;
      moveToNextStep();
      continue;
    }

    // Step: Basic Visibility
    if (
      currentStep === Step.BASIC_VISIBILITY &&
      (selectedCategory === "basic" || selectedCategory === "all")
    ) {
      const visibilityOptions = [
        {
          label: "Public",
          value: "public",
          description: "Visible to everyone",
        },
        {
          label: "Private",
          value: "private",
          description: "Only you and collaborators",
        },
        {
          label: "Internal",
          value: "internal",
          description: "Visible to organization members",
        },
      ];

      const quickPick = vscode.window.createQuickPick();
      const currentVisibility = currentSettings.visibility || "public";
      const currentOption =
        visibilityOptions.find((opt) => opt.value === currentVisibility) ||
        visibilityOptions[0];

      const allOptions = addBackOption(visibilityOptions, true);
      quickPick.items = allOptions as vscode.QuickPickItem[];
      quickPick.placeholder = `[Modify] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Repository Visibility (current: ${
        currentOption.label
      })`;
      quickPick.title = "[Modify] Repository Visibility";
      quickPick.ignoreFocusOut = true;

      // Set current value as active
      const activeOption =
        allOptions.find(
          (opt) => "value" in opt && opt.value === currentVisibility
        ) || allOptions[1]; // Skip back button
      quickPick.activeItems = [activeOption as vscode.QuickPickItem];

      const visibility = await new Promise<
        (typeof allOptions)[number] | undefined
      >((resolve) => {
        let resolved = false;

        quickPick.onDidAccept(() => {
          if (resolved) {
            return;
          }
          const selected = quickPick.activeItems[0] as vscode.QuickPickItem;
          if (selected?.label === "← Back") {
            resolved = true;
            quickPick.dispose();
            resolve(undefined);
            return;
          }
          const option = visibilityOptions.find(
            (opt) => opt.label === selected?.label
          );
          resolved = true;
          quickPick.dispose();
          resolve(option as (typeof allOptions)[number]);
        });

        quickPick.onDidHide(() => {
          if (!resolved) {
            resolved = true;
            quickPick.dispose();
            resolve(undefined);
          }
        });

        quickPick.show();
      });

      if (!visibility) {
        moveToPreviousStep();
        continue;
      }

      if ("value" in visibility) {
        modifications.visibility = visibility.value as
          | "public"
          | "private"
          | "internal";
      }
      moveToNextStep();
      continue;
    }

    // Step: Features - Wiki
    if (
      currentStep === Step.FEATURES_WIKI &&
      (selectedCategory === "features" || selectedCategory === "all")
    ) {
      const result = await promptBooleanSetting(
        "Enable Wikis",
        currentSettings.hasWiki ?? true,
        true,
        getCurrentStepNumber(),
        getTotalSteps()
      );

      if (result === null) {
        moveToPreviousStep();
        continue;
      }

      modifications.hasWiki = result;
      moveToNextStep();
      continue;
    }

    // Step: Features - Issues
    if (
      currentStep === Step.FEATURES_ISSUES &&
      (selectedCategory === "features" || selectedCategory === "all")
    ) {
      const result = await promptBooleanSetting(
        "Enable Issues",
        currentSettings.hasIssues ?? true,
        true,
        getCurrentStepNumber(),
        getTotalSteps()
      );

      if (result === null) {
        moveToPreviousStep();
        continue;
      }

      modifications.hasIssues = result;
      moveToNextStep();
      continue;
    }

    // Step: Features - Projects
    if (
      currentStep === Step.FEATURES_PROJECTS &&
      (selectedCategory === "features" || selectedCategory === "all")
    ) {
      const result = await promptBooleanSetting(
        "Enable Projects",
        currentSettings.hasProjects ?? true,
        true,
        getCurrentStepNumber(),
        getTotalSteps()
      );

      if (result === null) {
        moveToPreviousStep();
        continue;
      }

      modifications.hasProjects = result;
      moveToNextStep();
      continue;
    }

    // Step: Features - Discussions
    if (
      currentStep === Step.FEATURES_DISCUSSIONS &&
      (selectedCategory === "features" || selectedCategory === "all")
    ) {
      const result = await promptBooleanSetting(
        "Enable Discussions",
        currentSettings.hasDiscussions ?? false,
        true,
        getCurrentStepNumber(),
        getTotalSteps()
      );

      if (result === null) {
        moveToPreviousStep();
        continue;
      }

      modifications.hasDiscussions = result;
      moveToNextStep();
      continue;
    }

    // Step: PR - Squash Merge
    if (
      currentStep === Step.PR_SQUASH &&
      (selectedCategory === "pr" || selectedCategory === "all")
    ) {
      const result = await promptBooleanSetting(
        "Allow Squash Merging",
        currentSettings.allowSquashMerge ?? true,
        true,
        getCurrentStepNumber(),
        getTotalSteps()
      );

      if (result === null) {
        moveToPreviousStep();
        continue;
      }

      modifications.allowSquashMerge = result;
      moveToNextStep();
      continue;
    }

    // Step: PR - Merge Commit
    if (
      currentStep === Step.PR_MERGE &&
      (selectedCategory === "pr" || selectedCategory === "all")
    ) {
      const result = await promptBooleanSetting(
        "Allow Merge Commits",
        currentSettings.allowMergeCommit ?? true,
        true,
        getCurrentStepNumber(),
        getTotalSteps()
      );

      if (result === null) {
        moveToPreviousStep();
        continue;
      }

      modifications.allowMergeCommit = result;
      moveToNextStep();
      continue;
    }

    // Step: PR - Rebase Merge
    if (
      currentStep === Step.PR_REBASE &&
      (selectedCategory === "pr" || selectedCategory === "all")
    ) {
      const result = await promptBooleanSetting(
        "Allow Rebase Merging",
        currentSettings.allowRebaseMerge ?? true,
        true,
        getCurrentStepNumber(),
        getTotalSteps()
      );

      if (result === null) {
        moveToPreviousStep();
        continue;
      }

      modifications.allowRebaseMerge = result;
      moveToNextStep();
      continue;
    }

    // Step: PR - Auto Merge
    if (
      currentStep === Step.PR_AUTO &&
      (selectedCategory === "pr" || selectedCategory === "all")
    ) {
      const result = await promptBooleanSetting(
        "Allow Auto-Merge",
        currentSettings.allowAutoMerge ?? false,
        true,
        getCurrentStepNumber(),
        getTotalSteps()
      );

      if (result === null) {
        moveToPreviousStep();
        continue;
      }

      modifications.allowAutoMerge = result;
      moveToNextStep();
      continue;
    }

    // Step: PR - Delete Branch on Merge
    if (
      currentStep === Step.PR_DELETE_BRANCH &&
      (selectedCategory === "pr" || selectedCategory === "all")
    ) {
      const result = await promptBooleanSetting(
        "Automatically Delete Head Branches",
        currentSettings.deleteBranchOnMerge ?? false,
        true,
        getCurrentStepNumber(),
        getTotalSteps()
      );

      if (result === null) {
        moveToPreviousStep();
        continue;
      }

      modifications.deleteBranchOnMerge = result;
      moveToNextStep();
      continue;
    }

    // Step: PR - Allow Update Branch
    if (
      currentStep === Step.PR_UPDATE_BRANCH &&
      (selectedCategory === "pr" || selectedCategory === "all")
    ) {
      const result = await promptBooleanSetting(
        "Allow Update Branch",
        currentSettings.allowUpdateBranch ?? false,
        true,
        getCurrentStepNumber(),
        getTotalSteps()
      );

      if (result === null) {
        moveToPreviousStep();
        continue;
      }

      modifications.allowUpdateBranch = result;
      moveToNextStep();
      continue;
    }

    // Step: General - Web Commit Signoff
    if (
      currentStep === Step.GENERAL_SIGNOFF &&
      (selectedCategory === "general" || selectedCategory === "all")
    ) {
      const result = await promptBooleanSetting(
        "Require Sign-off on Web Commits",
        currentSettings.webCommitSignoffRequired ?? false,
        true,
        getCurrentStepNumber(),
        getTotalSteps()
      );

      if (result === null) {
        moveToPreviousStep();
        continue;
      }

      modifications.webCommitSignoffRequired = result;
      moveToNextStep();
      continue;
    }

    // If we reach here, move to next step
    moveToNextStep();
  }

  return Object.keys(modifications).length > 0 ? modifications : null;
}
