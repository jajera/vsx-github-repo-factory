import { expect } from "chai";
import {
  validateBranchName,
  generateBranchName,
  validateRepoName,
} from "../src/utils/validation";

describe("Validation Tests", () => {
  describe("validateBranchName", () => {
    it("should validate a valid branch name", () => {
      const result = validateBranchName("feature-branch");
      expect(result.valid).to.equal(true);
      expect(result.error).to.be.undefined;
    });

    it("should reject empty branch name", () => {
      const result = validateBranchName("");
      expect(result.valid).to.equal(false);
      expect(result.error).to.not.be.undefined;
    });

    it("should reject branch name with spaces", () => {
      const result = validateBranchName("feature branch");
      expect(result.valid).to.equal(false);
      expect(result.error).to.contain("invalid characters");
    });

    it("should reject branch name starting with dot", () => {
      const result = validateBranchName(".branch");
      expect(result.valid).to.equal(false);
      expect(result.error).to.contain("cannot start or end");
    });

    it("should reject branch name with consecutive dots", () => {
      const result = validateBranchName("branch..name");
      expect(result.valid).to.equal(false);
      expect(result.error).to.contain("consecutive dots");
    });

    it("should reject branch name exceeding 255 characters", () => {
      const longName = "a".repeat(256);
      const result = validateBranchName(longName);
      expect(result.valid).to.equal(false);
      expect(result.error).to.contain("255 characters");
    });

    it("should reject reserved branch names", () => {
      const result = validateBranchName("refs");
      expect(result.valid).to.equal(false);
      expect(result.error).to.contain("reserved");
    });
  });

  describe("generateBranchName", () => {
    it("should add issue number prefix when issue exists", () => {
      const result = generateBranchName(1, "first-release");
      expect(result).to.equal("1-first-release");
    });

    it("should return base name when no issue number", () => {
      const result = generateBranchName(undefined, "first-release");
      expect(result).to.equal("first-release");
    });

    it("should handle zero issue number", () => {
      const result = generateBranchName(0, "first-release");
      expect(result).to.equal("first-release");
    });
  });

  describe("validateRepoName", () => {
    it("should validate a valid repository name", () => {
      const result = validateRepoName("my-repo");
      expect(result.valid).to.equal(true);
      expect(result.error).to.be.undefined;
    });

    it("should reject empty repository name", () => {
      const result = validateRepoName("");
      expect(result.valid).to.equal(false);
      expect(result.error).to.not.be.undefined;
    });

    it("should reject repository name exceeding 100 characters", () => {
      const longName = "a".repeat(101);
      const result = validateRepoName(longName);
      expect(result.valid).to.equal(false);
      expect(result.error).to.contain("100 characters");
    });

    it("should reject repository name starting with dot", () => {
      const result = validateRepoName(".repo");
      expect(result.valid).to.equal(false);
      expect(result.error).to.contain("start or end with a dot");
    });

    it("should reject repository name with consecutive dots", () => {
      const result = validateRepoName("repo..name");
      expect(result.valid).to.equal(false);
      expect(result.error).to.contain("consecutive dots");
    });
  });
});
