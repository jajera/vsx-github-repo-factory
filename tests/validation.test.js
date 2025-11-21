"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const validation_1 = require("../src/utils/validation");
describe('Validation Tests', () => {
    describe('validateBranchName', () => {
        it('should validate a valid branch name', () => {
            const result = (0, validation_1.validateBranchName)('feature-branch');
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });
        it('should reject empty branch name', () => {
            const result = (0, validation_1.validateBranchName)('');
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });
        it('should reject branch name with spaces', () => {
            const result = (0, validation_1.validateBranchName)('feature branch');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('invalid characters');
        });
        it('should reject branch name starting with dot', () => {
            const result = (0, validation_1.validateBranchName)('.branch');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('cannot start or end');
        });
        it('should reject branch name with consecutive dots', () => {
            const result = (0, validation_1.validateBranchName)('branch..name');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('consecutive dots');
        });
        it('should reject branch name exceeding 255 characters', () => {
            const longName = 'a'.repeat(256);
            const result = (0, validation_1.validateBranchName)(longName);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('255 characters');
        });
        it('should reject reserved branch names', () => {
            const result = (0, validation_1.validateBranchName)('.git');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('reserved');
        });
    });
    describe('generateBranchName', () => {
        it('should add issue number prefix when issue exists', () => {
            const result = (0, validation_1.generateBranchName)(1, 'first-release');
            expect(result).toBe('1-first-release');
        });
        it('should return base name when no issue number', () => {
            const result = (0, validation_1.generateBranchName)(undefined, 'first-release');
            expect(result).toBe('first-release');
        });
        it('should handle zero issue number', () => {
            const result = (0, validation_1.generateBranchName)(0, 'first-release');
            expect(result).toBe('first-release');
        });
    });
    describe('validateRepoName', () => {
        it('should validate a valid repository name', () => {
            const result = (0, validation_1.validateRepoName)('my-repo');
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });
        it('should reject empty repository name', () => {
            const result = (0, validation_1.validateRepoName)('');
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });
        it('should reject repository name exceeding 100 characters', () => {
            const longName = 'a'.repeat(101);
            const result = (0, validation_1.validateRepoName)(longName);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('100 characters');
        });
        it('should reject repository name starting with dot', () => {
            const result = (0, validation_1.validateRepoName)('.repo');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('start or end with a dot');
        });
        it('should reject repository name with consecutive dots', () => {
            const result = (0, validation_1.validateRepoName)('repo..name');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('consecutive dots');
        });
    });
});
//# sourceMappingURL=validation.test.js.map