# Publishing Guide

This guide explains how to publish the GitHub Repo Factory extension to the Open VSX Registry.

## Automated Publishing (Recommended)

The extension is automatically published via GitHub Actions when you:

1. **Update the version** in `package.json`
2. **Update `CHANGELOG.md`** with the new version and changes
3. **Push to the `main` branch** or manually trigger the workflow

The workflow (`.github/workflows/publish-open-vsx.yml`) will:

- ✅ Run validation (lint, test, build)
- ✅ Package the extension
- ✅ Check if version already exists (skips if already published)
- ✅ Publish to Open VSX Registry (if `OVSX_PAT` secret is set)
- ✅ Create a GitHub release with the VSIX file

### Setup

1. **Create an Open VSX account** at [https://open-vsx.org/](https://open-vsx.org/)
2. **Create a personal access token** at [https://open-vsx.org/user-settings/tokens](https://open-vsx.org/user-settings/tokens)
3. **Add the token as a GitHub secret**:
   - Go to repository Settings → Secrets and variables → Actions
   - Add secret: `OVSX_PAT` with your token value

### Version Management

- Update version in `package.json` (e.g., `0.1.0` → `0.1.1`)
- Update `CHANGELOG.md` with changes
- Commit and push to `main` branch
- The workflow will automatically detect the new version and publish

**Note**: The workflow checks if a version tag already exists. If `v0.1.0` tag exists, it won't republish that version.

## Manual Publishing (Fallback)

If you need to publish manually (e.g., for testing):

1. **Build and package:**

   ```bash
   npm run compile
   npm run package
   ```

2. **Publish to Open VSX:**

   ```bash
   npx ovsx publish --packagePath *.vsix
   ```

   Or with token:

   ```bash
   npx ovsx publish --packagePath *.vsix -p <your-personal-access-token>
   ```

## Troubleshooting

- **Workflow not publishing**: Check if `OVSX_PAT` secret is set
- **Version already exists**: The workflow skips publishing if the version tag already exists
- **Publisher mismatch**: Ensure `package.json` publisher matches your Open VSX account username
