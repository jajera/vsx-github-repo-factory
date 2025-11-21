import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
import {
  executeGhCommand,
  executeGhApi,
  checkGhCliInstalled,
  checkGhAuthenticated,
  checkRepoExists,
  getCurrentUser,
  getUserOrganizations,
} from "../utils/ghCli";
import { executeGitCommand } from "../utils/git";
import {
  validateRepoName,
  validateBranchName,
  generateBranchName,
} from "../utils/validation";
import {
  createWorkspaceFile,
  createContextDirectories,
} from "../utils/workspace";
import { applyRepositorySettings } from "../utils/settings";
import { CreateRepoOptions, IssueResult, RepositorySettings } from "../types";

// Helper function to handle cancellation after repository creation
async function handleCancellationAfterCreation(
  fullRepoName: string
): Promise<void> {
  const action = await vscode.window.showWarningMessage(
    `Repository ${fullRepoName} was created but the operation was cancelled. What would you like to do?`,
    "Keep Repository",
    "Delete Repository"
  );

  if (action === "Delete Repository") {
    const { deleteRepository } = await import("./delete");
    const deleted = await deleteRepository(fullRepoName, true); // silent mode
    if (deleted) {
      vscode.window.showInformationMessage(
        `Repository ${fullRepoName} has been deleted.`
      );
    } else {
      vscode.window.showWarningMessage(
        `Failed to delete repository ${fullRepoName}. You may need to delete it manually.`
      );
    }
  } else {
    vscode.window.showInformationMessage(
      `Repository ${fullRepoName} has been kept.`
    );
  }
}

export async function createRepository(): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Creating GitHub Repository",
      cancellable: true,
    },
    async (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
      token: vscode.CancellationToken
    ) => {
      try {
        // Check dependencies
        progress.report({ increment: 0, message: "Checking dependencies..." });
        if (token.isCancellationRequested) {
          return;
        }

        if (!(await checkGhCliInstalled())) {
          vscode.window.showErrorMessage(
            "GitHub CLI (gh) is not installed. Please install it from https://cli.github.com/"
          );
          return;
        }

        if (!(await checkGhAuthenticated())) {
          vscode.window.showErrorMessage(
            "GitHub CLI is not authenticated. Please run: gh auth login\n(You can use SSH keys by selecting the SSH option during authentication)"
          );
          return;
        }

        // Collect user inputs
        progress.report({
          increment: 10,
          message: "Collecting repository information...",
        });
        if (token.isCancellationRequested) {
          return;
        }

        const options = await collectUserInputs(token);
        if (!options) {
          return; // User cancelled
        }

        // Double-check cancellation after input collection
        if (token.isCancellationRequested) {
          return;
        }

        // Validate repository name
        const repoValidation = validateRepoName(options.name);
        if (!repoValidation.valid) {
          vscode.window.showErrorMessage(
            `Invalid repository name: ${repoValidation.error}`
          );
          return;
        }

        // Build full repository name (owner/repo)
        const fullRepoName = options.owner
          ? `${options.owner}/${options.name}`
          : options.name;

        // Check if repository exists
        progress.report({
          increment: 20,
          message: "Checking if repository exists...",
        });
        if (token.isCancellationRequested) {
          return;
        }

        const repoExists = await checkRepoExists(fullRepoName);
        if (repoExists) {
          const action = await vscode.window.showWarningMessage(
            `Repository ${fullRepoName} already exists. What would you like to do?`,
            "Skip",
            "Delete and Recreate",
            "Modify Existing"
          );

          if (!action || action === "Skip") {
            vscode.window.showInformationMessage(
              "Repository creation cancelled."
            );
            return;
          }

          if (action === "Delete and Recreate") {
            // Import and call delete function
            const { deleteRepository } = await import("./delete");
            const deleted = await deleteRepository(fullRepoName, true); // silent mode
            if (!deleted) {
              vscode.window.showErrorMessage(
                "Failed to delete existing repository."
              );
              return;
            }
          } else if (action === "Modify Existing") {
            // Import and call modify function
            const { modifyRepository } = await import("./modify");
            await modifyRepository(fullRepoName);
            return;
          }
        }

        // Create repository
        progress.report({ increment: 30, message: "Creating repository..." });
        if (token.isCancellationRequested) {
          return;
        }

        let createCommand = `gh repo create ${fullRepoName} --${options.visibility} --description "${options.description}"`;
        if (options.template) {
          createCommand += ` --template ${options.template}`;
        } else {
          // Add README and license only when not using a template
          if (options.addReadme) {
            createCommand += ` --add-readme`;
          }
          if (options.license && options.license !== "none") {
            createCommand += ` --license ${options.license}`;
          }
        }

        const createResult = await executeGhCommand(createCommand, {
          cancellationToken: token,
        });

        // Check if operation was cancelled
        if (createResult.cancelled || token.isCancellationRequested) {
          vscode.window.showInformationMessage(
            "Repository creation cancelled."
          );
          return;
        }

        if (!createResult.success) {
          vscode.window.showErrorMessage(
            `Failed to create repository: ${createResult.stderr}`
          );
          return;
        }

        // Track if repository was created (for cleanup on cancellation)
        const repositoryCreated = true;

        // Track errors for all operations
        const errors: string[] = [];

        // Apply advanced settings if configured
        if (options.settings) {
          progress.report({
            increment: 40,
            message: "Applying repository settings...",
          });
          if (token.isCancellationRequested) {
            // Repository was created, offer to delete it
            if (repositoryCreated) {
              await handleCancellationAfterCreation(fullRepoName);
            }
            return;
          }

          const settingsResult = await applyRepositorySettings(
            fullRepoName,
            options.settings
          );
          if (!settingsResult.success && settingsResult.errors.length > 0) {
            errors.push(...settingsResult.errors);
          }
        }

        // Create issue if requested
        let issueNumber: number | undefined;
        if (options.createIssue) {
          progress.report({ increment: 50, message: "Creating issue..." });
          if (token.isCancellationRequested) {
            if (repositoryCreated) {
              await handleCancellationAfterCreation(fullRepoName);
            }
            return;
          }

          const issueResult = await createIssue(
            fullRepoName,
            options.issueTitle || "First Release",
            options.issueBody || "First Release"
          );
          if (issueResult.result) {
            issueNumber = issueResult.result.number;
          } else {
            const errorMsg = issueResult.error
              ? `Failed to create issue: ${issueResult.error}`
              : "Failed to create issue";
            errors.push(errorMsg);
          }
        }

        // Create branch if requested (using gh issue develop to link to issue)
        if (options.createBranch) {
          // Validate issueNumber if it exists
          let validIssueNumber: number | undefined;
          if (issueNumber !== undefined) {
            const n = Number(issueNumber);
            if (!Number.isFinite(n) || n <= 0) {
              errors.push(`Invalid issue number: ${issueNumber}`);
            } else {
              validIssueNumber = n;
            }
          }

          if (validIssueNumber) {
            progress.report({
              increment: 60,
              message: "Creating branch linked to issue...",
            });
            if (token.isCancellationRequested) {
              if (repositoryCreated) {
                await handleCancellationAfterCreation(fullRepoName);
              }
              return;
            }

            const branchName = generateBranchName(
              validIssueNumber,
              options.branchName || "first-release"
            );
            const branchValidation = validateBranchName(branchName);
            if (!branchValidation.valid) {
              errors.push(`Invalid branch name: ${branchValidation.error}`);
            } else {
              // Ensure fullRepoName is in owner/repo format (no .git, no URL)
              const cleanRepoName = fullRepoName
                .replace(/\.git$/, "")
                .replace(/^https?:\/\/github\.com\//, "");

              // Debug logging
              console.log(
                `Linking: repo=${cleanRepoName} issue=${validIssueNumber} branch=${branchName}`
              );

              // Use gh issue develop to create branch and link it to the issue
              const branchResult = await createBranchLinkedToIssue(
                cleanRepoName,
                validIssueNumber,
                branchName
              );
              if (!branchResult.success) {
                errors.push(
                  `Failed to create branch: ${
                    branchResult.error || "Unknown error"
                  }`
                );
              }
            }
          } else {
            // If branch is requested but no issue, create branch without linking
            progress.report({ increment: 60, message: "Creating branch..." });
            if (token.isCancellationRequested) {
              if (repositoryCreated) {
                await handleCancellationAfterCreation(fullRepoName);
              }
              return;
            }

            const branchName = options.branchName || "first-release";
            const branchValidation = validateBranchName(branchName);
            if (!branchValidation.valid) {
              errors.push(`Invalid branch name: ${branchValidation.error}`);
            } else {
              const branchResult = await createBranch(fullRepoName, branchName);
              if (!branchResult.success) {
                errors.push(
                  `Failed to create branch: ${
                    branchResult.error || "Unknown error"
                  }`
                );
              }
            }
          }
        }

        // Clone repository only if workspace setup is requested
        let repoPath: string | undefined;
        if (options.setupWorkspace) {
          progress.report({ increment: 80, message: "Cloning repository..." });
          if (token.isCancellationRequested) {
            if (repositoryCreated) {
              await handleCancellationAfterCreation(fullRepoName);
            }
            return;
          }
          const cloneResult = await cloneRepository(fullRepoName);
          if (cloneResult.path) {
            repoPath = cloneResult.path;
          } else {
            const errorMsg = cloneResult.error
              ? `Failed to clone repository: ${cloneResult.error}`
              : "Failed to clone repository for workspace setup";
            errors.push(errorMsg);
          }
        }

        // Setup workspace (optional)
        if (options.setupWorkspace && repoPath) {
          progress.report({
            increment: 90,
            message: "Setting up workspace...",
          });
          if (token.isCancellationRequested) {
            return;
          }

          await createContextDirectories(repoPath);
          const workspacePath = await createWorkspaceFile(repoPath);

          progress.report({ increment: 100, message: "Opening workspace..." });
          try {
            await vscode.commands.executeCommand(
              "vscode.openFolder",
              vscode.Uri.file(workspacePath),
              false // Don't force new window
            );
          } catch (error: unknown) {
            // If opening workspace fails, show info message but don't fail the operation
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            errors.push(`Failed to open workspace: ${errorMessage}`);
            if (errors.length > 0) {
              vscode.window.showWarningMessage(
                `Repository ${fullRepoName} created successfully! Workspace file created at: ${workspacePath}. ` +
                  `You can open it manually. Some operations failed: ${errors.join(
                    ", "
                  )}`
              );
            } else {
              vscode.window.showInformationMessage(
                `Repository ${fullRepoName} created successfully! Workspace file created at: ${workspacePath}. ` +
                  `You can open it manually.`
              );
            }
            return; // Exit early since we've shown the message
          }
        } else {
          // No workspace setup requested, show standard success message
          progress.report({ increment: 100, message: "Complete!" });
          if (errors.length > 0) {
            vscode.window.showWarningMessage(
              `Repository ${fullRepoName} created successfully, but some operations failed: ${errors.join(
                ", "
              )}`
            );
          } else {
            vscode.window.showInformationMessage(
              `Repository ${fullRepoName} created successfully!`
            );
          }
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
          `Error creating repository: ${errorMessage}`
        );
      }
    }
  );
}

async function collectUserInputs(
  cancellationToken?: vscode.CancellationToken
): Promise<CreateRepoOptions | null> {
  // Check cancellation before starting
  if (cancellationToken?.isCancellationRequested) {
    return null;
  }

  // Get current user and organizations for owner selection
  const currentUser = await getCurrentUser();
  const organizations = await getUserOrganizations();

  // Check cancellation after async operations
  if (cancellationToken?.isCancellationRequested) {
    return null;
  }

  // Step identifiers for better maintainability
  enum Step {
    OWNER = "owner",
    NAME = "name",
    DESCRIPTION = "description",
    VISIBILITY = "visibility",
    TEMPLATE = "template",
    README = "readme",
    LICENSE = "license",
    ISSUE = "issue",
    BRANCH = "branch",
    WORKSPACE = "workspace",
    ADVANCED = "advanced",
    DONE = "done",
  }

  // State to store collected values
  interface StepState {
    selectedOwner?: { label: string; value: string };
    name?: string;
    description?: string;
    visibility?: "public" | "private" | "internal";
    useTemplate?: { label: string };
    template?: string;
    addReadme?: { label: string };
    license?: string;
    createIssue?: { label: string };
    issueTitle?: string;
    issueBody?: string;
    createBranch?: { label: string };
    branchName?: string;
    setupWorkspace?: { label: string };
    advancedConfig?: { label: string };
    settings?: RepositorySettings;
  }
  const state: StepState = {};

  let currentStep: Step = Step.OWNER;

  // Get the sequence of steps based on whether template is used
  function getStepSequence(): Step[] {
    const baseSteps = [
      Step.OWNER,
      Step.NAME,
      Step.DESCRIPTION,
      Step.VISIBILITY,
      Step.TEMPLATE,
    ];

    if (state.template) {
      // With template: skip README and LICENSE
      return [
        ...baseSteps,
        Step.ISSUE,
        Step.BRANCH,
        Step.WORKSPACE,
        Step.ADVANCED,
        Step.DONE,
      ];
    } else {
      // Without template: include README and LICENSE
      return [
        ...baseSteps,
        Step.README,
        Step.LICENSE,
        Step.ISSUE,
        Step.BRANCH,
        Step.WORKSPACE,
        Step.ADVANCED,
        Step.DONE,
      ];
    }
  }

  // Get current step number for display (1-based)
  function getCurrentStepNumber(): number {
    const sequence = getStepSequence();
    const index = sequence.indexOf(currentStep);
    return index >= 0 ? index + 1 : 1;
  }

  // Get total number of steps
  function getTotalSteps(): number {
    return getStepSequence().length - 1; // Exclude DONE
  }

  // Get next step in sequence
  function getNextStep(): Step {
    const sequence = getStepSequence();
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
    const sequence = getStepSequence();
    const currentIndex = sequence.indexOf(currentStep);
    if (currentIndex > 0) {
      currentStep = sequence[currentIndex - 1];
    }
  }

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

  // Build owner options (user first, then orgs) - defined before loop
  const ownerOptions: Array<{
    label: string;
    value: string;
    description?: string;
  }> = [];
  if (currentUser) {
    ownerOptions.push({
      label: `${currentUser} (Personal)`,
      value: currentUser,
      description: "Your personal account",
    });
  }
  organizations.forEach((org) => {
    ownerOptions.push({
      label: org,
      value: org,
      description: "Organization",
    });
  });

  // Navigation loop
  while ((currentStep as Step) !== Step.DONE) {
    // Check cancellation at the start of each loop iteration
    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    // Step: Owner selection
    if ((currentStep as Step) === Step.OWNER) {
      const selectedOwner = await vscode.window.showQuickPick(ownerOptions, {
        placeHolder: `Select owner (default: ${currentUser || "your account"})`,
        title: `[Basic] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Select Owner`,
        ignoreFocusOut: true,
      });
      if (!selectedOwner) {
        return null;
      }
      state.selectedOwner = selectedOwner;
      moveToNextStep();
      continue;
    }

    // Step: Repository name
    if ((currentStep as Step) === Step.NAME) {
      const owner = state.selectedOwner?.value;
      if (!owner) {
        // This shouldn't happen as owner is selected in step 1, but handle it
        vscode.window.showErrorMessage(
          "Owner not selected. Please go back and select an owner."
        );
        moveToPreviousStep();
        continue;
      }

      let name: string | undefined;
      let shouldProceed = false;

      while (!shouldProceed) {
        name = await vscode.window.showInputBox({
          prompt: `[Basic] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Enter repository name`,
          placeHolder: "my-repo",
          title: "[Basic] Repository Name",
          value: state.name,
          ignoreFocusOut: true,
          validateInput: async (value) => {
            if (!value || value.trim().length === 0) {
              return "Repository name is required";
            }
            const validation = validateRepoName(value);
            if (!validation.valid) {
              return validation.error || "Invalid repository name";
            }

            // Check if repository already exists - show error in input box
            const fullRepoName = `${owner}/${value}`;
            const exists = await checkRepoExists(fullRepoName);
            if (exists) {
              return `Repository ${fullRepoName} already exists. Please choose a different name.`;
            }

            return null; // Validation passed
          },
        });

        if (name === undefined) {
          // User pressed Escape - cancel entire operation
          return null;
        }
        if (name === "") {
          // Empty string - validation should prevent this, but handle it anyway
          continue;
        }

        // If we get here, validation passed (repository doesn't exist)
        shouldProceed = true;
      }

      if (name) {
        state.name = name;
        moveToNextStep();
        continue;
      }
    }

    // Step: Description
    if ((currentStep as Step) === Step.DESCRIPTION) {
      if (cancellationToken?.isCancellationRequested) {
        return null;
      }
      const description = await vscode.window.showInputBox({
        prompt: `[Basic] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Enter repository description (optional, leave empty to skip)`,
        placeHolder: "Repository description",
        title: "[Basic] Repository Description",
        value: state.description,
        ignoreFocusOut: true,
      });
      if (description === undefined) {
        // User pressed Escape - cancel entire operation
        return null;
      }
      // Empty string is allowed for description (it's optional)
      state.description = description || "";
      moveToNextStep();
      continue;
    }

    // Step: Visibility
    if ((currentStep as Step) === Step.VISIBILITY) {
      if (cancellationToken?.isCancellationRequested) {
        return null;
      }
      const visibilityOptions = [
        {
          label: "Private",
          value: "private",
          description: "Only you and collaborators",
        },
        {
          label: "Public",
          value: "public",
          description: "Visible to everyone",
        },
        {
          label: "Internal",
          value: "internal",
          description: "Visible to organization members",
        },
      ];

      // Use createQuickPick to set Private as active item
      const quickPick = vscode.window.createQuickPick();
      const allOptions = addBackOption(
        visibilityOptions,
        getCurrentStepNumber() > 1
      );
      quickPick.items = allOptions as vscode.QuickPickItem[];
      quickPick.placeholder = `[Basic] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Select repository visibility (default: Private)`;
      quickPick.title = "[Basic] Repository Visibility";
      quickPick.ignoreFocusOut = true;

      // Find Private option
      const privateOption = allOptions.find(
        (opt) => "value" in opt && opt.value === "private"
      ) as vscode.QuickPickItem | undefined;

      const visibility = await new Promise<
        (typeof allOptions)[number] | undefined
      >((resolve) => {
        let resolved = false;

        quickPick.onDidAccept(() => {
          if (resolved) {
            return;
          }
          const selected = quickPick
            .activeItems[0] as (typeof allOptions)[number];
          // If "← Back" is selected, default to Private (since Private should be the default)
          if (selected && selected.label === "← Back" && privateOption) {
            resolved = true;
            quickPick.dispose();
            resolve(privateOption as (typeof allOptions)[number]);
            return;
          }
          resolved = true;
          quickPick.dispose();
          resolve(selected);
        });

        quickPick.onDidHide(() => {
          if (!resolved) {
            resolved = true;
            quickPick.dispose();
            resolve(undefined);
          }
        });

        quickPick.show();
        // Set Private as active after showing
        if (privateOption) {
          setTimeout(() => {
            try {
              quickPick.activeItems = [privateOption];
            } catch {
              // Picker may have been disposed
            }
          }, 10);
        }
      });

      if (!visibility) {
        return null;
      }
      if (visibility.label === "← Back") {
        moveToPreviousStep();
        continue;
      }
      const selectedValue =
        "value" in visibility ? visibility.value : undefined;
      if (selectedValue) {
        state.visibility = selectedValue as "public" | "private" | "internal";
      }
      moveToNextStep();
      continue;
    }

    // Step: Template selection
    if ((currentStep as Step) === Step.TEMPLATE) {
      if (cancellationToken?.isCancellationRequested) {
        return null;
      }
      const templateOptions = [
        { label: "No", description: "Create empty repository" },
        { label: "Yes", description: "Create from a template repository" },
      ];

      // Use createQuickPick to set No as active item
      const quickPick = vscode.window.createQuickPick();
      const allOptions = addBackOption(
        templateOptions,
        getCurrentStepNumber() > 1
      );
      quickPick.items = allOptions as vscode.QuickPickItem[];
      quickPick.placeholder = `[Setup] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Create from template? (default: No)`;
      quickPick.title = "[Setup] Template Selection";
      quickPick.ignoreFocusOut = true;

      // Find No option
      const noOption = allOptions.find((opt) => opt.label === "No") as
        | vscode.QuickPickItem
        | undefined;

      const useTemplate = await new Promise<
        (typeof allOptions)[number] | undefined
      >((resolve) => {
        let resolved = false;

        quickPick.onDidAccept(() => {
          if (resolved) {
            return;
          }
          const selected = quickPick
            .activeItems[0] as (typeof allOptions)[number];
          // If "← Back" is selected, default to No (since No should be the default)
          if (selected && selected.label === "← Back" && noOption) {
            resolved = true;
            quickPick.dispose();
            resolve(noOption as (typeof allOptions)[number]);
            return;
          }
          resolved = true;
          quickPick.dispose();
          resolve(selected);
        });

        quickPick.onDidHide(() => {
          if (!resolved) {
            resolved = true;
            quickPick.dispose();
            resolve(undefined);
          }
        });

        quickPick.show();
        // Set No as active after showing
        if (noOption) {
          setTimeout(() => {
            try {
              quickPick.activeItems = [noOption];
            } catch {
              // Picker may have been disposed
            }
          }, 10);
        }
      });

      if (!useTemplate) {
        return null;
      }
      if (useTemplate.label === "← Back") {
        moveToPreviousStep();
        continue;
      }
      state.useTemplate = useTemplate;

      if (useTemplate.label === "Yes") {
        const templateInput = await vscode.window.showInputBox({
          prompt: "[Setup] Enter template repository (format: owner/repo)",
          placeHolder: "owner/template-repo",
          title: "[Setup] Template Repository",
          value: state.template,
          ignoreFocusOut: true,
        });
        if (templateInput === undefined) {
          // User cancelled, stay on this step
          continue;
        }
        state.template = templateInput;
        // Skip README and License steps when using template
        state.addReadme = { label: "No" };
        state.license = undefined;
        // Move to Issue step (next step after template when template is used)
        currentStep = Step.ISSUE;
        continue;
      } else {
        state.template = undefined;
        // Continue to README step (next step after template when no template)
        currentStep = Step.README;
        continue;
      }
    }

    // Step: Add README (only if no template)
    if ((currentStep as Step) === Step.README) {
      if (cancellationToken?.isCancellationRequested) {
        return null;
      }
      const readmeOptions = [
        { label: "No", description: "Skip README creation" },
        { label: "Yes", description: "Add a README file" },
      ];

      // Use createQuickPick to set No as active item
      const quickPick = vscode.window.createQuickPick();
      const allOptions = addBackOption(
        readmeOptions,
        getCurrentStepNumber() > 1
      );
      quickPick.items = allOptions as vscode.QuickPickItem[];
      quickPick.placeholder = `[Setup] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Add README file? (default: No)`;
      quickPick.title = "[Setup] README Creation";
      quickPick.ignoreFocusOut = true;

      // Find No option
      const noOption = allOptions.find((opt) => opt.label === "No") as
        | vscode.QuickPickItem
        | undefined;

      const addReadme = await new Promise<
        (typeof allOptions)[number] | undefined
      >((resolve) => {
        let resolved = false;

        quickPick.onDidAccept(() => {
          if (resolved) {
            return;
          }
          const selected = quickPick
            .activeItems[0] as (typeof allOptions)[number];
          if (selected && selected.label === "← Back" && noOption) {
            resolved = true;
            quickPick.dispose();
            resolve(noOption as (typeof allOptions)[number]);
            return;
          }
          resolved = true;
          quickPick.dispose();
          resolve(selected);
        });

        quickPick.onDidHide(() => {
          if (!resolved) {
            resolved = true;
            quickPick.dispose();
            resolve(undefined);
          }
        });

        quickPick.show();
        if (noOption) {
          setTimeout(() => {
            try {
              quickPick.activeItems = [noOption];
            } catch {
              // Picker may have been disposed
            }
          }, 10);
        }
      });

      if (!addReadme) {
        return null;
      }
      if (addReadme.label === "← Back") {
        moveToPreviousStep();
        continue;
      }
      state.addReadme = addReadme;
      moveToNextStep();
      continue;
    }

    // Step: License selection (only if no template)
    if ((currentStep as Step) === Step.LICENSE) {
      const licenseOptions = [
        { label: "None", value: "none", description: "No license" },
        { label: "MIT", value: "mit", description: "MIT License" },
        {
          label: "Apache-2.0",
          value: "apache-2.0",
          description: "Apache License 2.0",
        },
        {
          label: "GPL-3.0",
          value: "gpl-3.0",
          description: "GNU General Public License v3.0",
        },
        {
          label: "BSD-3-Clause",
          value: "bsd-3-clause",
          description: "BSD 3-Clause License",
        },
        {
          label: "BSD-2-Clause",
          value: "bsd-2-clause",
          description: "BSD 2-Clause License",
        },
        {
          label: "LGPL-3.0",
          value: "lgpl-3.0",
          description: "GNU Lesser General Public License v3.0",
        },
        {
          label: "AGPL-3.0",
          value: "agpl-3.0",
          description: "GNU Affero General Public License v3.0",
        },
        {
          label: "MPL-2.0",
          value: "mpl-2.0",
          description: "Mozilla Public License 2.0",
        },
        {
          label: "Unlicense",
          value: "unlicense",
          description: "The Unlicense",
        },
      ];

      // Use createQuickPick to set None as active item
      const quickPick = vscode.window.createQuickPick();
      const allOptions = addBackOption(
        licenseOptions,
        getCurrentStepNumber() > 1
      );
      quickPick.items = allOptions as vscode.QuickPickItem[];
      quickPick.placeholder = `[Setup] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Select license (default: None)`;
      quickPick.title = "[Setup] License Selection";
      quickPick.ignoreFocusOut = true;

      // Find None option
      const noneOption = allOptions.find((opt) => opt.value === "none") as
        | vscode.QuickPickItem
        | undefined;

      const license = await new Promise<
        (typeof allOptions)[number] | undefined
      >((resolve) => {
        let resolved = false;

        quickPick.onDidAccept(() => {
          if (resolved) {
            return;
          }
          const selected = quickPick
            .activeItems[0] as (typeof allOptions)[number];
          if (selected && selected.label === "← Back" && noneOption) {
            resolved = true;
            quickPick.dispose();
            resolve(noneOption as (typeof allOptions)[number]);
            return;
          }
          resolved = true;
          quickPick.dispose();
          resolve(selected);
        });

        quickPick.onDidHide(() => {
          if (!resolved) {
            resolved = true;
            quickPick.dispose();
            resolve(undefined);
          }
        });

        quickPick.show();
        if (noneOption) {
          setTimeout(() => {
            try {
              quickPick.activeItems = [noneOption];
            } catch {
              // Picker may have been disposed
            }
          }, 10);
        }
      });

      if (!license) {
        return null;
      }
      if (license.label === "← Back") {
        moveToPreviousStep();
        continue;
      }
      const selectedLicense = "value" in license ? license.value : undefined;
      if (selectedLicense && selectedLicense !== "none") {
        state.license = selectedLicense;
      } else {
        state.license = undefined;
      }
      moveToNextStep();
      continue;
    }

    // Step: Issue creation
    if ((currentStep as Step) === Step.ISSUE) {
      if (cancellationToken?.isCancellationRequested) {
        return null;
      }
      const issueOptions = [
        { label: "No", description: "Skip issue creation" },
        { label: "Yes", description: "Create a 'First Release' issue" },
      ];

      // Use createQuickPick to set No as active item
      const quickPick = vscode.window.createQuickPick();
      const allOptions = addBackOption(
        issueOptions,
        getCurrentStepNumber() > 1
      );
      quickPick.items = allOptions as vscode.QuickPickItem[];
      quickPick.placeholder = `[Optional] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Create 'First Release' issue? (default: No)`;
      quickPick.title = "[Optional] Issue Creation";
      quickPick.ignoreFocusOut = true;

      // Find No option
      const noOption = allOptions.find((opt) => opt.label === "No") as
        | vscode.QuickPickItem
        | undefined;

      const createIssue = await new Promise<
        (typeof allOptions)[number] | undefined
      >((resolve) => {
        let resolved = false;

        quickPick.onDidAccept(() => {
          if (resolved) {
            return;
          }
          const selected = quickPick
            .activeItems[0] as (typeof allOptions)[number];
          // If "← Back" is selected, default to No (since No should be the default)
          if (selected && selected.label === "← Back" && noOption) {
            resolved = true;
            quickPick.dispose();
            resolve(noOption as (typeof allOptions)[number]);
            return;
          }
          resolved = true;
          quickPick.dispose();
          resolve(selected);
        });

        quickPick.onDidHide(() => {
          if (!resolved) {
            resolved = true;
            quickPick.dispose();
            resolve(undefined);
          }
        });

        quickPick.show();
        // Set No as active after showing
        if (noOption) {
          setTimeout(() => {
            try {
              quickPick.activeItems = [noOption];
            } catch {
              // Picker may have been disposed
            }
          }, 10);
        }
      });

      if (!createIssue) {
        return null;
      }
      if (createIssue.label === "← Back") {
        moveToPreviousStep();
        continue;
      }
      if ("description" in createIssue) {
        state.createIssue = createIssue;
      }

      if (createIssue.label === "Yes") {
        const issueTitle = await vscode.window.showInputBox({
          prompt: "[Optional] Enter issue title",
          value: state.issueTitle || "First Release",
          placeHolder: "First Release",
          title: "[Optional] Issue Title",
          ignoreFocusOut: true,
        });
        if (issueTitle === undefined) {
          continue; // Stay on this step
        }
        state.issueTitle = issueTitle;

        const issueBody = await vscode.window.showInputBox({
          prompt: "[Optional] Enter issue description",
          value: state.issueBody || "First Release",
          placeHolder: "First Release",
          title: "[Optional] Issue Description",
          ignoreFocusOut: true,
        });
        if (issueBody === undefined) {
          continue; // Stay on this step
        }
        state.issueBody = issueBody;
      } else {
        state.issueTitle = undefined;
        state.issueBody = undefined;
      }
      moveToNextStep();
      continue;
    }

    // Step: Branch creation
    if ((currentStep as Step) === Step.BRANCH) {
      if (cancellationToken?.isCancellationRequested) {
        return null;
      }
      // If issue creation was skipped, skip branch creation automatically
      if (state.createIssue?.label === "No") {
        state.createBranch = { label: "No" };
        state.branchName = undefined;
        // Move to Workspace step
        currentStep = Step.WORKSPACE;
        continue;
      }

      // Otherwise, show branch creation prompt with Yes as default
      const branchOptions = [
        {
          label: "Yes",
          description: "Create a new branch (e.g., first-release)",
        },
        { label: "No", description: "Skip branch creation" },
      ];

      // Use createQuickPick to set Yes as active item
      const quickPick = vscode.window.createQuickPick();
      const allOptions = addBackOption(
        branchOptions,
        getCurrentStepNumber() > 1
      );
      quickPick.items = allOptions as vscode.QuickPickItem[];
      quickPick.placeholder = `[Optional] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Create branch? (default: Yes)`;
      quickPick.title = "[Optional] Branch Creation";
      quickPick.ignoreFocusOut = true;

      // Find Yes option
      const yesOption = allOptions.find((opt) => opt.label === "Yes") as
        | vscode.QuickPickItem
        | undefined;

      const createBranch = await new Promise<
        (typeof allOptions)[number] | undefined
      >((resolve) => {
        let resolved = false;

        quickPick.onDidAccept(() => {
          if (resolved) {
            return;
          }
          const selected = quickPick
            .activeItems[0] as (typeof allOptions)[number];
          // If "← Back" is selected, default to Yes (since Yes should be the default)
          if (selected && selected.label === "← Back" && yesOption) {
            resolved = true;
            quickPick.dispose();
            resolve(yesOption as (typeof allOptions)[number]);
            return;
          }
          resolved = true;
          quickPick.dispose();
          resolve(selected);
        });

        quickPick.onDidHide(() => {
          if (!resolved) {
            resolved = true;
            quickPick.dispose();
            resolve(undefined);
          }
        });

        quickPick.show();
        // Set Yes as active after showing
        if (yesOption) {
          setTimeout(() => {
            try {
              quickPick.activeItems = [yesOption];
            } catch {
              // Picker may have been disposed
            }
          }, 10);
        }
      });

      if (!createBranch) {
        return null;
      }
      if (createBranch.label === "← Back") {
        moveToPreviousStep();
        continue;
      }
      if ("description" in createBranch) {
        state.createBranch = createBranch;
      }

      if (createBranch.label === "Yes") {
        const branchName = await vscode.window.showInputBox({
          prompt:
            "[Optional] Enter branch name (will be prefixed with issue number if issue is created)",
          value: state.branchName || "first-release",
          placeHolder: "first-release",
          title: "[Optional] Branch Name",
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Branch name is required";
            }
            const validation = validateBranchName(value);
            return validation.valid ? null : validation.error;
          },
        });
        if (branchName === undefined) {
          // User cancelled branch name input - stay on step 7 to allow retry
          continue;
        }
        state.branchName = branchName;
      } else {
        // User selected "No" - skip branch creation
        state.branchName = undefined;
      }
      // Move to next step
      moveToNextStep();
      continue;
    }

    // Step: Workspace setup
    if ((currentStep as Step) === Step.WORKSPACE) {
      if (cancellationToken?.isCancellationRequested) {
        return null;
      }
      const workspaceOptions = [
        { label: "No", description: "Skip workspace setup (recommended)" },
        {
          label: "Yes",
          description: "Create .code-workspace file and context directories",
        },
      ];

      // Use createQuickPick to set No as active item
      const quickPick = vscode.window.createQuickPick();
      const allOptions = addBackOption(
        workspaceOptions,
        getCurrentStepNumber() > 1
      );
      quickPick.items = allOptions as vscode.QuickPickItem[];
      quickPick.placeholder = `[Optional] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Set up workspace file and context directories? (default: No)`;
      quickPick.title = "[Optional] Workspace Setup";
      quickPick.ignoreFocusOut = true;

      // Find No option
      const noOption = allOptions.find((opt) => opt.label === "No") as
        | vscode.QuickPickItem
        | undefined;

      const setupWorkspace = await new Promise<
        (typeof allOptions)[number] | undefined
      >((resolve) => {
        let resolved = false;

        quickPick.onDidAccept(() => {
          if (resolved) {
            return;
          }
          const selected = quickPick
            .activeItems[0] as (typeof allOptions)[number];
          // If "← Back" is selected, default to No (since No should be the default)
          if (selected && selected.label === "← Back" && noOption) {
            resolved = true;
            quickPick.dispose();
            resolve(noOption as (typeof allOptions)[number]);
            return;
          }
          resolved = true;
          quickPick.dispose();
          resolve(selected);
        });

        quickPick.onDidHide(() => {
          if (!resolved) {
            resolved = true;
            quickPick.dispose();
            resolve(undefined);
          }
        });

        quickPick.show();
        // Set No as active after showing
        if (noOption) {
          setTimeout(() => {
            try {
              quickPick.activeItems = [noOption];
            } catch {
              // Picker may have been disposed
            }
          }, 10);
        }
      });

      if (!setupWorkspace) {
        return null;
      }
      if (setupWorkspace.label === "← Back") {
        moveToPreviousStep();
        continue;
      }
      if ("description" in setupWorkspace) {
        state.setupWorkspace = setupWorkspace;
      }
      moveToNextStep();
      continue;
    }

    // Step: Advanced configuration
    if ((currentStep as Step) === Step.ADVANCED) {
      if (cancellationToken?.isCancellationRequested) {
        return null;
      }
      const advancedOptions = [
        { label: "No", description: "Use default settings" },
        {
          label: "Yes",
          description: "Enable issues, projects, merge options, etc.",
        },
      ];

      // Use createQuickPick to set No as active item
      const quickPick = vscode.window.createQuickPick();
      const allOptions = addBackOption(
        advancedOptions,
        getCurrentStepNumber() > 1
      );
      quickPick.items = allOptions as vscode.QuickPickItem[];
      quickPick.placeholder = `[Advanced] Step ${getCurrentStepNumber()}/${getTotalSteps()}: Configure advanced repository settings? (default: No)`;
      quickPick.title = "[Advanced] Advanced Settings";
      quickPick.ignoreFocusOut = true;

      // Find No option
      const noOption = allOptions.find((opt) => opt.label === "No") as
        | vscode.QuickPickItem
        | undefined;

      const advancedConfig = await new Promise<
        (typeof allOptions)[number] | undefined
      >((resolve) => {
        let resolved = false;

        quickPick.onDidAccept(() => {
          if (resolved) {
            return;
          }
          const selected = quickPick
            .activeItems[0] as (typeof allOptions)[number];
          // If "← Back" is selected, default to No (since No should be the default)
          if (selected && selected.label === "← Back" && noOption) {
            resolved = true;
            quickPick.dispose();
            resolve(noOption as (typeof allOptions)[number]);
            return;
          }
          resolved = true;
          quickPick.dispose();
          resolve(selected);
        });

        quickPick.onDidHide(() => {
          if (!resolved) {
            resolved = true;
            quickPick.dispose();
            resolve(undefined);
          }
        });

        quickPick.show();
        // Set No as active after showing
        if (noOption) {
          setTimeout(() => {
            try {
              quickPick.activeItems = [noOption];
            } catch {
              // Picker may have been disposed
            }
          }, 10);
        }
      });

      if (!advancedConfig) {
        return null;
      }
      if (advancedConfig.label === "← Back") {
        moveToPreviousStep();
        continue;
      }
      if ("description" in advancedConfig) {
        state.advancedConfig = advancedConfig;
      }

      let settings: RepositorySettings | undefined;
      if (advancedConfig.label === "Yes") {
        // Prompt for each advanced setting with GitHub defaults
        settings = {};

        // Helper function to prompt for a boolean setting
        // Returns: boolean value if selected, null if back, undefined if cancelled
        const promptBooleanSetting = async (
          settingName: string,
          description: string,
          defaultValue: boolean,
          canGoBack: boolean
        ): Promise<boolean | null> => {
          if (cancellationToken?.isCancellationRequested) {
            return null;
          }

          const options = [
            {
              label: defaultValue ? "Yes" : "No",
              value: defaultValue,
              description: `Default: ${defaultValue ? "Yes" : "No"}`,
            },
            {
              label: defaultValue ? "No" : "Yes",
              value: !defaultValue,
              description: defaultValue ? "Disable" : "Enable",
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
          quickPick.placeholder = `[Advanced] ${settingName} (default: ${
            defaultValue ? "Yes" : "No"
          })`;
          quickPick.title = `[Advanced] ${settingName}`;
          quickPick.ignoreFocusOut = true;

          // Set default as active (skip back button if present)
          const defaultOption = quickPick.items[canGoBack ? 1 : 0];
          quickPick.activeItems = [defaultOption];

          const result = await new Promise<boolean | null | undefined>(
            (resolve) => {
              let resolved = false;

              quickPick.onDidAccept(() => {
                if (resolved) {
                  return;
                }
                const selected = quickPick.activeItems[0];
                if (selected.label === "← Back") {
                  resolved = true;
                  quickPick.dispose();
                  resolve(null); // Return null to indicate back
                  return;
                }
                const option = options.find(
                  (opt) => opt.label === selected.label
                );
                resolved = true;
                quickPick.dispose();
                resolve(option?.value);
              });

              quickPick.onDidHide(() => {
                if (!resolved) {
                  resolved = true;
                  quickPick.dispose();
                  resolve(undefined); // Return undefined if cancelled
                }
              });

              quickPick.show();
            }
          );

          if (result === null) {
            return null; // Back was selected
          }
          if (result === undefined) {
            return null; // Cancelled - treat as back
          }
          return result;
        };

        // GitHub defaults (matching GitHub's repository defaults)
        // Prompt for each setting with back navigation support
        let settingIndex = 0;
        const settingPrompts: Array<{
          name: string;
          description: string;
          defaultValue: boolean;
          key: keyof RepositorySettings;
        }> = [
          {
            name: "Enable Issues",
            description: "Allow users to create issues in this repository",
            defaultValue: true,
            key: "hasIssues",
          },
          {
            name: "Enable Projects",
            description: "Allow users to create projects in this repository",
            defaultValue: true,
            key: "hasProjects",
          },
          {
            name: "Enable Wiki",
            description: "Allow users to create and edit wiki pages",
            defaultValue: true,
            key: "hasWiki",
          },
          {
            name: "Enable Discussions",
            description: "Allow users to create discussions in this repository",
            defaultValue: false,
            key: "hasDiscussions",
          },
          {
            name: "Allow Squash Merge",
            description: "Allow squash merging pull requests",
            defaultValue: true,
            key: "allowSquashMerge",
          },
          {
            name: "Allow Merge Commit",
            description: "Allow merge commits when merging pull requests",
            defaultValue: true,
            key: "allowMergeCommit",
          },
          {
            name: "Allow Rebase Merge",
            description: "Allow rebase merging pull requests",
            defaultValue: true,
            key: "allowRebaseMerge",
          },
          {
            name: "Allow Auto Merge",
            description: "Allow auto-merge for pull requests",
            defaultValue: false,
            key: "allowAutoMerge",
          },
          {
            name: "Delete Branch on Merge",
            description:
              "Automatically delete head branches after merging pull requests",
            defaultValue: false,
            key: "deleteBranchOnMerge",
          },
          {
            name: "Allow Update Branch",
            description:
              "Allow users to update branches that are behind base branch",
            defaultValue: false,
            key: "allowUpdateBranch",
          },
          {
            name: "Require Web Commit Signoff",
            description:
              "Require signoff for commits made via the web interface",
            defaultValue: false,
            key: "webCommitSignoffRequired",
          },
        ];

        while (settingIndex < settingPrompts.length) {
          const prompt = settingPrompts[settingIndex];
          // Always show back button on all prompts
          const canGoBack = true;

          const result = await promptBooleanSetting(
            prompt.name,
            prompt.description,
            prompt.defaultValue,
            canGoBack
          );

          if (result === null) {
            // Back was selected or cancelled
            if (settingIndex > 0) {
              settingIndex--; // Go back to previous setting
              continue;
            } else {
              // At first setting, going back should exit advanced config
              // Reset to "No" for advanced config
              state.advancedConfig = { label: "No" };
              settings = undefined;
              break;
            }
          } else {
            // Value was selected
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (settings as Record<string, boolean | undefined>)[prompt.key] =
              result;
            settingIndex++;
          }
        }
      }
      state.settings = settings;

      // All steps completed, build and return the result
      if (!state.name || !state.selectedOwner || !state.visibility) {
        return null; // Required fields missing
      }

      return {
        name: state.name,
        description: state.description || "",
        visibility: state.visibility,
        owner: state.selectedOwner.value,
        template: state.template,
        addReadme: state.addReadme?.label === "Yes",
        license: state.license,
        createIssue: state.createIssue?.label === "Yes",
        issueTitle: state.issueTitle,
        issueBody: state.issueBody,
        createBranch: state.createBranch?.label === "Yes",
        branchName: state.branchName,
        setupWorkspace: state.setupWorkspace?.label === "Yes",
        settings: state.settings,
      };
    }
  }

  return null; // Should not reach here
}

async function createIssue(
  repoName: string,
  title: string,
  body: string
): Promise<{ result: IssueResult | null; error?: string }> {
  // gh issue create doesn't support --json flag, so we need to get the issue URL from output
  // and then fetch the issue number from the URL or use gh api to get issue details
  const command = `gh issue create --repo ${repoName} --title "${title}" --body "${body}"`;
  const result = await executeGhCommand(command);

  if (!result.success) {
    let errorMsg = result.stderr || result.stdout || "Unknown error";

    // Provide more helpful error messages
    if (errorMsg.includes("disabled") || errorMsg.includes("not enabled")) {
      errorMsg = `Issues are disabled for repository ${repoName}. Enable issues in repository settings.`;
    } else if (errorMsg.includes("not found") || errorMsg.includes("404")) {
      errorMsg = `Repository ${repoName} not found or you don't have access to it.`;
    } else if (errorMsg.includes("permission") || errorMsg.includes("403")) {
      errorMsg = `Permission denied. You may not have permission to create issues in ${repoName}.`;
    }

    return { result: null, error: errorMsg };
  }

  // Parse the output to extract issue URL
  // gh issue create outputs something like: "https://github.com/owner/repo/issues/123"
  const output = result.stdout || result.stderr || "";
  const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);

  if (!urlMatch) {
    // If we can't parse the URL, try to get the issue number from the repo
    // by fetching the latest issue
    try {
      // Convert repoName (owner/repo) to API endpoint format
      const apiResult = await executeGhApi(
        `repos/${repoName}/issues?state=all&per_page=1&sort=created&direction=desc`,
        "GET"
      );
      if (apiResult.success && apiResult.data) {
        const issues = Array.isArray(apiResult.data)
          ? apiResult.data
          : [apiResult.data];
        if (issues.length > 0) {
          const latestIssue = issues[0] as { number: number; html_url: string };
          return {
            result: {
              number: latestIssue.number,
              url: latestIssue.html_url,
            },
          };
        }
      }
    } catch {
      // Fall through to error
    }

    return {
      result: null,
      error:
        "Issue created but could not retrieve issue details. Check the repository for the new issue.",
    };
  }

  const issueUrl = urlMatch[0];
  // Extract issue number from URL (e.g., https://github.com/owner/repo/issues/123 -> 123)
  const numberMatch = issueUrl.match(/\/issues\/(\d+)/);
  const issueNumber = numberMatch ? parseInt(numberMatch[1], 10) : null;

  if (!issueNumber) {
    return {
      result: null,
      error: "Issue created but could not parse issue number from URL.",
    };
  }

  return {
    result: {
      number: issueNumber,
      url: issueUrl,
    },
  };
}

async function cloneRepository(
  repoName: string
): Promise<{ path: string | null; error?: string }> {
  // Get user's home directory or workspace folder
  const homeDir = os.homedir();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const baseDir = workspaceFolder || path.join(homeDir, "workspace");

  // Extract repo name from full name (owner/repo or just repo)
  const repoParts = repoName.split("/");
  const repoDirName = repoParts.length > 1 ? repoParts[1] : repoParts[0];
  const clonePath = path.join(baseDir, repoDirName);

  // Check if directory already exists
  if (fs.existsSync(clonePath)) {
    // Check if it's already a git repository
    if (fs.existsSync(path.join(clonePath, ".git"))) {
      // Directory exists and is a git repo, we can use it
      return { path: clonePath };
    } else {
      return {
        path: null,
        error: `Directory ${clonePath} already exists and is not a git repository`,
      };
    }
  }

  const cloneCommand = `gh repo clone ${repoName} ${clonePath}`;

  const result = await executeGitCommand(cloneCommand);
  if (!result.success) {
    let errorMsg = result.stderr || result.stdout || "Unknown error";

    // Provide more helpful error messages
    if (
      errorMsg.includes("already exists") ||
      errorMsg.includes("destination path")
    ) {
      errorMsg = `Directory ${clonePath} already exists. Please remove it or choose a different location.`;
    } else if (errorMsg.includes("permission denied")) {
      errorMsg = `Permission denied. Cannot clone to ${clonePath}. Check directory permissions.`;
    } else if (errorMsg.includes("not found") || errorMsg.includes("404")) {
      errorMsg = `Repository ${repoName} not found or you don't have access to it.`;
    }

    return { path: null, error: errorMsg };
  }

  return { path: clonePath };
}

async function createBranch(
  repoName: string,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  // Get the default branch name using gh API
  const repoInfo = await executeGhApi(`repos/${repoName}`, "GET");
  if (!repoInfo.success || !repoInfo.data) {
    return {
      success: false,
      error: `Failed to get repository information: ${
        repoInfo.stderr || "Unknown error"
      }`,
    };
  }

  const repoData = repoInfo.data as { default_branch?: string };
  const defaultBranch = repoData.default_branch || "main";

  // Get the SHA of the default branch
  const branchInfo = await executeGhApi(
    `repos/${repoName}/git/ref/heads/${defaultBranch}`,
    "GET"
  );
  if (!branchInfo.success || !branchInfo.data) {
    return {
      success: false,
      error: `Failed to get default branch SHA: ${
        branchInfo.stderr || "Unknown error"
      }`,
    };
  }

  const branchData = branchInfo.data as { object?: { sha?: string } };
  const sha = branchData.object?.sha;
  if (!sha) {
    return {
      success: false,
      error: "Could not get SHA from default branch",
    };
  }

  // Create the new branch using GitHub API
  const createBranchResult = await executeGhApi(
    `repos/${repoName}/git/refs`,
    "POST",
    {
      ref: `refs/heads/${branchName}`,
      sha: sha,
    }
  );

  if (!createBranchResult.success) {
    const errorMsg = createBranchResult.stderr || "Unknown error";
    return {
      success: false,
      error: `Failed to create branch: ${errorMsg}`,
    };
  }

  return { success: true };
}

async function createBranchLinkedToIssue(
  repoName: string,
  issueNumber: number,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  // Use gh issue develop to create branch and link it to the issue
  // This automatically links the branch in the Development section
  // Format: gh issue develop <number> -R <owner/repo> --name <branch>
  try {
    const args = [
      "issue",
      "develop",
      String(issueNumber),
      "-R",
      repoName,
      "--name",
      branchName,
    ];

    const { stderr } = await execFileAsync("gh", args, {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    // If there's stderr but command succeeded, log it but don't fail
    if (stderr && stderr.trim()) {
      console.log(`gh issue develop stderr: ${stderr}`);
    }

    return { success: true };
  } catch (error: unknown) {
    const execError = error as {
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    const errorMsg =
      execError.stderr ||
      execError.stdout ||
      execError.message ||
      "Unknown error";

    // Provide more helpful error messages
    if (errorMsg.includes("not found") || errorMsg.includes("404")) {
      return {
        success: false,
        error: `Issue #${issueNumber} not found in repository ${repoName}: ${errorMsg}`,
      };
    } else if (errorMsg.includes("permission") || errorMsg.includes("403")) {
      return {
        success: false,
        error: `Permission denied. You may not have permission to create branch for issue #${issueNumber}: ${errorMsg}`,
      };
    } else if (
      errorMsg.includes("disabled") ||
      errorMsg.includes("not enabled")
    ) {
      return {
        success: false,
        error: `Issues are disabled for repository ${repoName}: ${errorMsg}`,
      };
    } else if (errorMsg.includes("already exists")) {
      return {
        success: false,
        error: `Branch ${branchName} already exists: ${errorMsg}`,
      };
    }

    return {
      success: false,
      error: `Failed to create branch linked to issue: ${errorMsg}`,
    };
  }
}
