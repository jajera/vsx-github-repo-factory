import * as fs from "fs/promises";
import * as path from "path";

export async function createWorkspaceFile(repoPath: string): Promise<string> {
  const workspacePath = path.join(
    repoPath,
    `${path.basename(repoPath)}.code-workspace`
  );

  const workspaceContent = {
    folders: [
      {
        path: ".",
        name: path.basename(repoPath),
      },
    ],
    settings: {},
  };

  await fs.writeFile(workspacePath, JSON.stringify(workspaceContent, null, 2));
  return workspacePath;
}

export async function createContextDirectories(
  repoPath: string
): Promise<void> {
  const demoContextPath = path.join(repoPath, ".demo-context");
  const cursorPath = path.join(repoPath, ".cursor");
  const cursorContextPath = path.join(cursorPath, "context.md");

  // Create .demo-context directory
  try {
    await fs.mkdir(demoContextPath, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore
  }

  // Create .cursor directory
  try {
    await fs.mkdir(cursorPath, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore
  }

  // Create context.md file
  const contextContent = `# Context

This directory contains context files for the repository.

## Structure

- \`.demo-context/\`: Demo-specific context files
- \`.cursor/context.md\`: Cursor AI context file

`;
  await fs.writeFile(cursorContextPath, contextContent);
}
