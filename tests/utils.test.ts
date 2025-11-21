import { expect } from "chai";
import { generateBranchName } from "../src/utils/validation";

describe("Utility Function Tests", () => {
  describe("generateBranchName", () => {
    it("should generate branch name with issue prefix", () => {
      const result = generateBranchName(5, "feature-branch");
      expect(result).to.equal("5-feature-branch");
    });

    it("should return base name when issue number is undefined", () => {
      const result = generateBranchName(undefined, "main");
      expect(result).to.equal("main");
    });

    it("should handle multiple digit issue numbers", () => {
      const result = generateBranchName(123, "release");
      expect(result).to.equal("123-release");
    });
  });
});
