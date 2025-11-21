import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";

const execAsync = promisify(exec);

export interface GhCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  data?: unknown;
  cancelled?: boolean;
}

export interface GhCommandOptions {
  json?: boolean;
  cancellationToken?: vscode.CancellationToken;
}

export async function executeGhCommand(
  command: string,
  options: GhCommandOptions = {}
): Promise<GhCommandResult> {
  // Check cancellation before starting
  if (options.cancellationToken?.isCancellationRequested) {
    return {
      success: false,
      stdout: "",
      stderr: "Operation cancelled",
      data: undefined,
      cancelled: true,
    };
  }

  try {
    const fullCommand = options.json ? `${command} --json` : command;

    // Use a promise that can be cancelled
    const execPromise = execAsync(fullCommand, {
      env: { ...process.env },
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    // Set up cancellation listener
    const cancellationListener =
      options.cancellationToken?.onCancellationRequested(() => {
        // Note: exec doesn't support direct cancellation, but we can mark it as cancelled
        // The process will continue, but we'll return cancelled status
      });

    const { stdout, stderr } = await execPromise;

    // Clean up listener
    cancellationListener?.dispose();

    // Check cancellation after execution
    if (options.cancellationToken?.isCancellationRequested) {
      return {
        success: false,
        stdout: stdout?.trim() || "",
        stderr: stderr?.trim() || "",
        data: undefined,
        cancelled: true,
      };
    }

    let data: unknown;
    if (options.json && stdout) {
      try {
        data = JSON.parse(stdout);
      } catch (parseError) {
        // If JSON parsing fails, return raw stdout
        data = stdout.trim();
      }
    }

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      data,
      cancelled: false,
    };
  } catch (error: unknown) {
    // Check if this was a cancellation
    if (options.cancellationToken?.isCancellationRequested) {
      return {
        success: false,
        stdout: "",
        stderr: "Operation cancelled",
        data: undefined,
        cancelled: true,
      };
    }

    const execError = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    return {
      success: false,
      stdout: execError.stdout?.trim() || "",
      stderr: execError.stderr?.trim() || String(error),
      data: undefined,
      cancelled: false,
    };
  }
}

export async function executeGhApi(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown
): Promise<GhCommandResult> {
  try {
    // For PATCH/POST with body, use spawn with stdin
    // For GET/DELETE, use exec with simple command
    if (body && (method === "PATCH" || method === "POST")) {
      // Use spawn to pipe JSON body through stdin
      const bodyJson = JSON.stringify(body);
      const args = ["api", endpoint, "-X", method, "--input", "-"];

      return new Promise<GhCommandResult>((resolve) => {
        const child = spawn("gh", args, {
          env: { ...process.env },
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (data) => {
          stdout += data.toString();
        });

        child.stderr?.on("data", (data) => {
          stderr += data.toString();
        });

        child.on("error", (error) => {
          resolve({
            success: false,
            stdout: "",
            stderr: String(error),
            data: undefined,
          });
        });

        child.on("close", (code) => {
          if (code !== 0) {
            resolve({
              success: false,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              data: undefined,
            });
            return;
          }

          let data: unknown;
          try {
            data = JSON.parse(stdout);
          } catch {
            data = stdout.trim();
          }

          resolve({
            success: true,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            data,
          });
        });

        // Write JSON body to stdin
        child.stdin?.write(bodyJson);
        child.stdin?.end();
      });
    } else {
      // For GET/DELETE or no body, use exec with simple command
      const command = `gh api ${endpoint} -X ${method}`;
      const { stdout, stderr } = await execAsync(command, {
        env: { ...process.env },
        maxBuffer: 10 * 1024 * 1024,
      });

      let data: unknown;
      try {
        data = JSON.parse(stdout);
      } catch {
        data = stdout.trim();
      }

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        data,
      };
    }
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string };
    return {
      success: false,
      stdout: execError.stdout?.trim() || "",
      stderr: execError.stderr?.trim() || String(error),
      data: undefined,
    };
  }
}

export async function checkGhCliInstalled(): Promise<boolean> {
  const result = await executeGhCommand("gh --version");
  return result.success;
}

export async function checkGhAuthenticated(): Promise<boolean> {
  const result = await executeGhCommand("gh auth status");
  return result.success;
}

export async function checkRepoExists(repoName: string): Promise<boolean> {
  // Use --json name to get minimal data, and parse JSON manually
  // Don't use json: true option since we already have --json in the command
  const result = await executeGhCommand(`gh repo view ${repoName} --json name`);
  // If command succeeded, parse the JSON response
  if (result.success && result.stdout) {
    try {
      const data = JSON.parse(result.stdout);
      // If we got valid JSON data, repo exists
      return data !== undefined && data !== null;
    } catch {
      // If JSON parsing fails, command might have succeeded but returned non-JSON
      // This shouldn't happen with --json flag, but handle it
      return false;
    }
  }
  // If command failed, repo doesn't exist
  return false;
}

export async function getCurrentUser(): Promise<string | null> {
  const result = await executeGhApi("user", "GET");
  if (!result.success || !result.data) {
    return null;
  }
  const user = result.data as { login?: string };
  return user.login || null;
}

export async function getUserOrganizations(): Promise<string[]> {
  const result = await executeGhApi("user/orgs", "GET");
  if (!result.success || !result.data) {
    return [];
  }
  const orgs = result.data as Array<{ login?: string }>;
  return orgs.map((org) => org.login || "").filter(Boolean);
}

export interface RepositoryInfo {
  name: string;
  fullName: string; // owner/repo
  description?: string;
  visibility?: string;
  isPrivate?: boolean;
}

export async function getUserRepositories(
  owner?: string,
  limit = 100
): Promise<RepositoryInfo[]> {
  try {
    // Use gh repo list to get repositories
    // Format: gh repo list [owner] --limit N --json name,nameWithOwner,description,visibility,isPrivate
    let command = `gh repo list`;
    if (owner) {
      command += ` ${owner}`;
    }
    command += ` --limit ${limit} --json name,nameWithOwner,description,visibility,isPrivate`;

    // Don't use json: true since we already have --json in the command
    const result = await executeGhCommand(command);

    if (!result.success || !result.stdout) {
      return [];
    }

    // Parse JSON from stdout
    interface GhRepoData {
      name?: string;
      nameWithOwner?: string;
      description?: string;
      visibility?: string;
      isPrivate?: boolean;
    }

    let repos: GhRepoData[];
    try {
      repos = JSON.parse(result.stdout);
    } catch (parseError) {
      console.error("Error parsing repository list JSON:", parseError);
      return [];
    }

    if (!Array.isArray(repos)) {
      repos = [repos];
    }

    return repos.map((repo: GhRepoData) => ({
      name: repo.name || "",
      fullName: repo.nameWithOwner || repo.name || "",
      description: repo.description || "",
      visibility: repo.visibility || (repo.isPrivate ? "private" : "public"),
      isPrivate: repo.isPrivate || false,
    }));
  } catch (error) {
    console.error("Error fetching repositories:", error);
    return [];
  }
}
