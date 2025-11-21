export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateBranchName(branchName: string): ValidationResult {
  if (!branchName || branchName.trim().length === 0) {
    return { valid: false, error: "Branch name cannot be empty" };
  }

  // Git branch naming rules
  // - Cannot contain spaces
  // - Cannot contain consecutive dots (..)
  // - Cannot start or end with dot, slash, or backslash
  // - Cannot contain special characters except: - _ . /
  // - Maximum length is 255 characters
  // - Cannot be certain reserved names

  const trimmed = branchName.trim();

  if (trimmed.length > 255) {
    return {
      valid: false,
      error: "Branch name exceeds maximum length of 255 characters",
    };
  }

  if (
    trimmed.startsWith(".") ||
    trimmed.endsWith(".") ||
    trimmed.startsWith("/") ||
    trimmed.endsWith("/") ||
    trimmed.startsWith("\\") ||
    trimmed.endsWith("\\")
  ) {
    return {
      valid: false,
      error: "Branch name cannot start or end with . / or \\",
    };
  }

  if (trimmed.includes("..")) {
    return {
      valid: false,
      error: "Branch name cannot contain consecutive dots (..)",
    };
  }

  // Check for invalid characters (allow alphanumeric, -, _, ., /)
  const validPattern = /^[a-zA-Z0-9._/-]+$/;
  if (!validPattern.test(trimmed)) {
    return {
      valid: false,
      error:
        "Branch name contains invalid characters. Only alphanumeric, -, _, ., and / are allowed",
    };
  }

  // Check for reserved names
  const reservedNames = [".git", "HEAD", "refs"];
  if (reservedNames.includes(trimmed.toLowerCase())) {
    return { valid: false, error: `Branch name '${trimmed}' is reserved` };
  }

  return { valid: true };
}

export function generateBranchName(
  issueNumber: number | undefined,
  baseName: string
): string {
  if (issueNumber !== undefined && issueNumber > 0) {
    return `${issueNumber}-${baseName}`;
  }
  return baseName;
}

export function validateRepoName(repoName: string): ValidationResult {
  if (!repoName || repoName.trim().length === 0) {
    return { valid: false, error: "Repository name cannot be empty" };
  }

  const trimmed = repoName.trim();

  // GitHub repository name rules
  // - 1-100 characters
  // - Alphanumeric, -, _, and . characters
  // - Cannot start or end with a dot
  // - Cannot contain consecutive dots

  if (trimmed.length > 100) {
    return {
      valid: false,
      error: "Repository name exceeds maximum length of 100 characters",
    };
  }

  if (trimmed.startsWith(".") || trimmed.endsWith(".")) {
    return {
      valid: false,
      error: "Repository name cannot start or end with a dot",
    };
  }

  if (trimmed.includes("..")) {
    return {
      valid: false,
      error: "Repository name cannot contain consecutive dots (..)",
    };
  }

  const validPattern = /^[a-zA-Z0-9._-]+$/;
  if (!validPattern.test(trimmed)) {
    return {
      valid: false,
      error:
        "Repository name contains invalid characters. Only alphanumeric, -, _, and . are allowed",
    };
  }

  return { valid: true };
}
