import { expect } from "chai";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  createWorkspaceFile,
  createContextDirectories,
} from "../src/utils/workspace";

describe("Workspace Tests", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-test-"));
  });

  afterEach(async () => {
    // Clean up: remove the test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createWorkspaceFile", () => {
    it("should create a workspace file with correct name", async () => {
      const repoPath = path.join(testDir, "my-repo");
      await fs.mkdir(repoPath, { recursive: true });

      const workspacePath = await createWorkspaceFile(repoPath);

      expect(workspacePath).to.equal(
        path.join(repoPath, "my-repo.code-workspace")
      );
      expect(await fs.access(workspacePath)).to.not.throw;
    });

    it("should create workspace file with correct content", async () => {
      const repoPath = path.join(testDir, "test-repo");
      await fs.mkdir(repoPath, { recursive: true });

      const workspacePath = await createWorkspaceFile(repoPath);
      const content = await fs.readFile(workspacePath, "utf-8");
      const workspace = JSON.parse(content);

      expect(workspace).to.have.property("folders");
      expect(workspace.folders).to.be.an("array").with.length(1);
      expect(workspace.folders[0]).to.deep.equal({
        path: ".",
        name: "test-repo",
      });
      expect(workspace).to.have.property("settings");
      expect(workspace.settings).to.be.an("object");
    });

    it("should handle repo path with special characters", async () => {
      const repoPath = path.join(testDir, "repo-with-dashes");
      await fs.mkdir(repoPath, { recursive: true });

      const workspacePath = await createWorkspaceFile(repoPath);

      expect(workspacePath).to.contain("repo-with-dashes.code-workspace");
      expect(await fs.access(workspacePath)).to.not.throw;
    });

    it("should overwrite existing workspace file", async () => {
      const repoPath = path.join(testDir, "existing-repo");
      await fs.mkdir(repoPath, { recursive: true });
      const existingPath = path.join(repoPath, "existing-repo.code-workspace");
      await fs.writeFile(existingPath, "old content");

      await createWorkspaceFile(repoPath);

      const content = await fs.readFile(existingPath, "utf-8");
      const workspace = JSON.parse(content);
      expect(workspace.folders).to.be.an("array");
    });
  });

  describe("createContextDirectories", () => {
    it("should create .demo-context directory", async () => {
      await createContextDirectories(testDir);

      const demoContextPath = path.join(testDir, ".demo-context");
      const stats = await fs.stat(demoContextPath);
      expect(stats.isDirectory()).to.equal(true);
    });

    it("should create .cursor directory", async () => {
      await createContextDirectories(testDir);

      const cursorPath = path.join(testDir, ".cursor");
      const stats = await fs.stat(cursorPath);
      expect(stats.isDirectory()).to.equal(true);
    });

    it("should create context.md file in .cursor directory", async () => {
      await createContextDirectories(testDir);

      const contextPath = path.join(testDir, ".cursor", "context.md");
      const stats = await fs.stat(contextPath);
      expect(stats.isFile()).to.equal(true);
    });

    it("should create context.md with correct content", async () => {
      await createContextDirectories(testDir);

      const contextPath = path.join(testDir, ".cursor", "context.md");
      const content = await fs.readFile(contextPath, "utf-8");

      expect(content).to.contain("# Context");
      expect(content).to.contain(".demo-context/");
      expect(content).to.contain(".cursor/context.md");
    });

    it("should handle existing directories gracefully", async () => {
      // Create directories first
      await fs.mkdir(path.join(testDir, ".demo-context"), { recursive: true });
      await fs.mkdir(path.join(testDir, ".cursor"), { recursive: true });

      // Should not throw when directories already exist
      try {
        await createContextDirectories(testDir);
        expect(true).to.equal(true); // If we get here, it didn't throw
      } catch (error) {
        expect.fail("Should not throw when directories already exist");
      }
    });

    it("should create all required structure", async () => {
      await createContextDirectories(testDir);

      const demoContextPath = path.join(testDir, ".demo-context");
      const cursorPath = path.join(testDir, ".cursor");
      const contextPath = path.join(cursorPath, "context.md");

      expect(await fs.access(demoContextPath)).to.not.throw;
      expect(await fs.access(cursorPath)).to.not.throw;
      expect(await fs.access(contextPath)).to.not.throw;
    });
  });
});

