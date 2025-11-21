"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const validation_1 = require("../src/utils/validation");
describe('Utility Function Tests', () => {
    describe('generateBranchName', () => {
        it('should generate branch name with issue prefix', () => {
            const result = (0, validation_1.generateBranchName)(5, 'feature-branch');
            expect(result).toBe('5-feature-branch');
        });
        it('should return base name when issue number is undefined', () => {
            const result = (0, validation_1.generateBranchName)(undefined, 'main');
            expect(result).toBe('main');
        });
        it('should handle multiple digit issue numbers', () => {
            const result = (0, validation_1.generateBranchName)(123, 'release');
            expect(result).toBe('123-release');
        });
    });
});
//# sourceMappingURL=utils.test.js.map