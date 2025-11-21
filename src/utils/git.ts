import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function executeGitCommand(
  command: string,
  cwd?: string
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      env: { ...process.env },
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string };
    return {
      success: false,
      stdout: execError.stdout?.trim() || "",
      stderr: execError.stderr?.trim() || String(error),
    };
  }
}
