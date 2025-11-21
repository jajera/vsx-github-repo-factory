export interface RepositorySettings {
  description?: string;
  visibility?: "public" | "private" | "internal";
  hasWiki?: boolean;
  hasIssues?: boolean;
  hasProjects?: boolean;
  hasDiscussions?: boolean;
  allowSquashMerge?: boolean;
  allowMergeCommit?: boolean;
  allowRebaseMerge?: boolean;
  allowAutoMerge?: boolean;
  deleteBranchOnMerge?: boolean;
  allowUpdateBranch?: boolean;
  webCommitSignoffRequired?: boolean;
}

export interface CreateRepoOptions {
  name: string;
  description: string;
  visibility: "public" | "private" | "internal";
  owner?: string; // Organization or user (defaults to current user)
  template?: string;
  addReadme?: boolean;
  license?: string;
  createIssue?: boolean;
  issueTitle?: string;
  issueBody?: string;
  createBranch?: boolean;
  branchName?: string;
  setupWorkspace?: boolean;
  settings?: RepositorySettings;
}

export interface IssueResult {
  number: number;
  url: string;
}
