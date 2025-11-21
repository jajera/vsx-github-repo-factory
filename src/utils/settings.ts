import * as vscode from "vscode";
import { executeGhApi } from "./ghCli";
import { RepositorySettings } from "../types";

export async function applyRepositorySettings(
  repoName: string,
  settings: RepositorySettings,
  currentSettings?: RepositorySettings
): Promise<{ success: boolean; errors: string[]; noChanges?: boolean }> {
  const errors: string[] = [];

  try {
    // Extract owner and repo from repoName (format: owner/repo or just repo)
    const parts = repoName.split("/");
    const owner = parts.length > 1 ? parts[0] : undefined;
    const repo = parts.length > 1 ? parts[1] : parts[0];

    // Build API endpoint
    const endpoint = owner ? `repos/${owner}/${repo}` : `repos/${repo}`;

    // Build settings object for GitHub API, only including values that differ from current
    const apiSettings: Record<string, unknown> = {};

    if (settings.description !== undefined) {
      // Only include if it's different from current (or current is undefined)
      if (currentSettings === undefined || currentSettings.description !== settings.description) {
        apiSettings.description = settings.description;
      }
    }

    if (settings.visibility !== undefined) {
      if (currentSettings === undefined || currentSettings.visibility !== settings.visibility) {
        apiSettings.visibility = settings.visibility;
      }
    }

    if (settings.hasWiki !== undefined) {
      if (currentSettings === undefined || currentSettings.hasWiki !== settings.hasWiki) {
        apiSettings.has_wiki = settings.hasWiki;
      }
    }

    if (settings.hasIssues !== undefined) {
      if (currentSettings === undefined || currentSettings.hasIssues !== settings.hasIssues) {
        apiSettings.has_issues = settings.hasIssues;
      }
    }

    if (settings.hasProjects !== undefined) {
      if (currentSettings === undefined || currentSettings.hasProjects !== settings.hasProjects) {
        apiSettings.has_projects = settings.hasProjects;
      }
    }

    if (settings.hasDiscussions !== undefined) {
      if (currentSettings === undefined || currentSettings.hasDiscussions !== settings.hasDiscussions) {
        apiSettings.has_discussions = settings.hasDiscussions;
      }
    }

    if (settings.allowSquashMerge !== undefined) {
      if (currentSettings === undefined || currentSettings.allowSquashMerge !== settings.allowSquashMerge) {
        apiSettings.allow_squash_merge = settings.allowSquashMerge;
      }
    }

    if (settings.allowMergeCommit !== undefined) {
      if (currentSettings === undefined || currentSettings.allowMergeCommit !== settings.allowMergeCommit) {
        apiSettings.allow_merge_commit = settings.allowMergeCommit;
      }
    }

    if (settings.allowRebaseMerge !== undefined) {
      if (currentSettings === undefined || currentSettings.allowRebaseMerge !== settings.allowRebaseMerge) {
        apiSettings.allow_rebase_merge = settings.allowRebaseMerge;
      }
    }

    if (settings.allowAutoMerge !== undefined) {
      if (currentSettings === undefined || currentSettings.allowAutoMerge !== settings.allowAutoMerge) {
        apiSettings.allow_auto_merge = settings.allowAutoMerge;
      }
    }

    if (settings.deleteBranchOnMerge !== undefined) {
      if (currentSettings === undefined || currentSettings.deleteBranchOnMerge !== settings.deleteBranchOnMerge) {
        apiSettings.delete_branch_on_merge = settings.deleteBranchOnMerge;
      }
    }

    if (settings.allowUpdateBranch !== undefined) {
      if (currentSettings === undefined || currentSettings.allowUpdateBranch !== settings.allowUpdateBranch) {
        apiSettings.allow_update_branch = settings.allowUpdateBranch;
      }
    }

    if (settings.webCommitSignoffRequired !== undefined) {
      if (currentSettings === undefined || currentSettings.webCommitSignoffRequired !== settings.webCommitSignoffRequired) {
        apiSettings.web_commit_signoff_required =
          settings.webCommitSignoffRequired;
      }
    }

    // Check if there are any actual changes
    if (Object.keys(apiSettings).length === 0) {
      return {
        success: true,
        errors: [],
        noChanges: true,
      };
    }

    // Only make API call if there are settings to apply
    const result = await executeGhApi(endpoint, "PATCH", apiSettings);

    if (!result.success) {
      errors.push(`Failed to apply repository settings: ${result.stderr}`);
    }

    return {
      success: errors.length === 0,
      errors,
      noChanges: false,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Error applying repository settings: ${errorMessage}`);
    return {
      success: false,
      errors,
      noChanges: false,
    };
  }
}

export async function getRepositorySettings(
  repoName: string
): Promise<RepositorySettings | null> {
  try {
    const parts = repoName.split("/");
    const owner = parts.length > 1 ? parts[0] : undefined;
    const repo = parts.length > 1 ? parts[1] : parts[0];

    const endpoint = owner ? `repos/${owner}/${repo}` : `repos/${repo}`;
    const result = await executeGhApi(endpoint, "GET");

    if (!result.success || !result.data) {
      return null;
    }

    const data = result.data as Record<string, unknown>;

    return {
      description: data.description as string | undefined,
      visibility: data.visibility as
        | "public"
        | "private"
        | "internal"
        | undefined,
      hasWiki: data.has_wiki as boolean | undefined,
      hasIssues: data.has_issues as boolean | undefined,
      hasProjects: data.has_projects as boolean | undefined,
      hasDiscussions: data.has_discussions as boolean | undefined,
      allowSquashMerge: data.allow_squash_merge as boolean | undefined,
      allowMergeCommit: data.allow_merge_commit as boolean | undefined,
      allowRebaseMerge: data.allow_rebase_merge as boolean | undefined,
      allowAutoMerge: data.allow_auto_merge as boolean | undefined,
      deleteBranchOnMerge: data.delete_branch_on_merge as boolean | undefined,
      allowUpdateBranch: data.allow_update_branch as boolean | undefined,
      webCommitSignoffRequired: data.web_commit_signoff_required as
        | boolean
        | undefined,
    };
  } catch (error: unknown) {
    vscode.window.showErrorMessage(
      `Failed to fetch repository settings: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}
