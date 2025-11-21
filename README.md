# GitHub Repo Factory

[![CI](https://github.com/jajera/vsx-github-repo-factory/actions/workflows/ci.yml/badge.svg)](https://github.com/jajera/vsx-github-repo-factory/actions/workflows/ci.yml)

[![Release to Open VSX Registry](https://github.com/jajera/vsx-github-repo-factory/actions/workflows/publish-open-vsx.yml/badge.svg)](https://github.com/jajera/vsx-github-repo-factory/actions/workflows/publish-open-vsx.yml)

Automate GitHub repository creation, modification, and deletion with full VS Code integration.

## Features

### 🚀 Repository Creation

- Create repositories from templates or empty
- Organization and personal account selection
- Repository visibility configuration (public/private/internal)
- Advanced settings configuration
- Repository existence validation

### 📝 Issue & Branch Management

- Optional "First Release" issue creation
- Customizable issue title and description
- Automatic branch creation with issue number prefix
- Branch-to-issue linking in Development section
- Branch name validation

### ⚙️ Repository Modification

- Update repository settings
- Modify visibility, description, and features
- Configure pull request settings
- Manage repository features (Wiki, Issues, Projects, Discussions)
- Change detection (only applies actual changes)

### 🗑️ Repository Deletion

- Safe repository deletion with confirmation
- Searchable repository selection
- Organization and personal repository support

### 📁 Workspace Setup

- Optional `.code-workspace` file creation
- Context directory setup (`.demo-context/`, `.cursor/context.md`)
- Automatic workspace file generation

### 📊 Progress Indicators

- Visual feedback for all operations
- Step-by-step progress tracking
- Error handling and user feedback

## Getting Started

### Prerequisites

- **VS Code**: 1.74.0 or higher
- **GitHub CLI**: Installed and authenticated
  - Install from: <https://cli.github.com/>
  - Authenticate: `gh auth login`
  - **For delete operations**: Additional `delete_repo` scope required
    - Run: `gh auth refresh -h github.com -s delete_repo`

### Authentication Options

The extension works with any GitHub CLI authentication method. When running `gh auth login`, you have several options:

1. **Web Browser Authentication** (Recommended)
   - Choose "Login with a web browser" when prompted
   - Follow the browser flow to authenticate
   - No SSH key upload required

2. **Personal Access Token**
   - Choose "Paste an authentication token"
   - Create a token at: <https://github.com/settings/tokens>
   - Paste the token when prompted

3. **SSH Key Authentication**
   - Select SSH as your preferred protocol for Git operations
   - **Important**: If you already have SSH keys set up for Git, you can **Skip** the SSH key upload prompt
   - Your existing SSH keys will continue to work for Git operations
   - The CLI authentication (web browser or token) is separate from your Git SSH setup

**Note**: Your existing Git SSH keys and GitHub CLI authentication are independent. You can authenticate the CLI via web browser or token while still using SSH keys for Git operations. The extension only requires that `gh auth status` shows you're logged in.

### Quick Start

#### 1. Create a Repository

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "GitHub Repo Factory: Create Repository"
3. Follow the prompts:
   - Select owner (personal account or organization)
   - Enter repository name
   - Enter description
   - Select visibility (public/private/internal)
   - Configure optional features (template, issue, branch, workspace)

#### 2. Modify a Repository

1. Press `Ctrl+Shift+P`
2. Type "GitHub Repo Factory: Modify Repository"
3. Select repository from searchable list
4. Choose category to modify (Basic, Features, PR Settings, etc.)
5. Update settings as needed

#### 3. Delete a Repository

1. Press `Ctrl+Shift+P`
2. Type "GitHub Repo Factory: Delete Repository"
3. Select repository from searchable list
4. Confirm deletion

## Commands

| Command | Description |
|---------|-------------|
| `GitHub Repo Factory: Create Repository` | Create a new GitHub repository with optional template, issue, and branch |
| `GitHub Repo Factory: Modify Repository` | Update repository settings (visibility, features, PR settings, etc.) |
| `GitHub Repo Factory: Delete Repository` | Delete a repository with confirmation |

## Usage Examples

### Create Repository with Issue and Branch

```bash
# 1. Create repository
GitHub Repo Factory: Create Repository
→ Owner: jajera
→ Name: my-new-project
→ Description: A new project
→ Visibility: Private
→ Template: No
→ Create Issue: Yes
→ Issue Title: First Release
→ Create Branch: Yes
→ Branch Name: first-release

# Result:
# - Repository created: jajera/my-new-project
# - Issue #1 created: "First Release"
# - Branch created: 1-first-release (linked to issue)
```

### Create Repository from Template

```bash
# 1. Create from template
GitHub Repo Factory: Create Repository
→ Owner: my-org
→ Name: api-service
→ Template: node-express-template
→ Create Issue: No
→ Workspace Setup: No

# Result:
# - Repository created from template
# - Ready to clone and start coding
```

### Modify Repository Settings

```bash
# 1. Modify repository
GitHub Repo Factory: Modify Repository
→ Select: jajera/my-repo
→ Category: Pull Request Settings
→ Allow Auto-Merge: Yes
→ Delete Branch on Merge: Yes

# Result:
# - Only changed settings are applied
# - No unnecessary API calls if values unchanged
```

### Delete Repository

```bash
# 1. Delete repository
GitHub Repo Factory: Delete Repository
→ Search and select: jajera/old-repo
→ Confirm: Yes

# Result:
# - Repository deleted
# - Cannot be undone (GitHub requirement)
```

## Features in Detail

### Repository Creation

- **Template Support**: Create from existing GitHub templates
- **Organization Selection**: Choose personal account or any organization
- **Visibility Options**: Public, Private, or Internal
- **Advanced Settings**: Configure all repository features during creation
- **Validation**: Check if repository already exists before creation

### Issue & Branch Management

- **Issue Creation**: Optional "First Release" issue with custom title/description
- **Branch Naming**: Automatic issue number prefix (e.g., `1-first-release`)
- **Branch Linking**: Branches automatically linked to issues in Development section
- **Validation**: Branch names validated against Git rules

### Repository Modification

- **Category-Based**: Modify by category (Basic, Features, PR Settings, General)
- **Change Detection**: Only applies settings that differ from current values
- **All Settings**: Support for all GitHub repository settings
- **Searchable Selection**: Easy repository selection with search

### Repository Deletion

- **Safe Deletion**: Confirmation required before deletion
- **Searchable List**: Find repositories quickly
- **Organization Support**: Delete from any accessible organization

### Workspace Setup

- **Workspace File**: Creates `.code-workspace` for multi-root workspaces
- **Context Directories**: Sets up `.demo-context/` and `.cursor/context.md`
- **Optional**: Can be skipped if not needed

## Branch Naming Convention

When an issue is created and a branch is created, the branch name automatically uses the issue number as a prefix:

- Issue #1 + branch "first-release" → `1-first-release`
- Issue #5 + branch "feature" → `5-feature`
- Issue #123 + branch "bugfix" → `123-bugfix`

## Workspace Setup - Pros and Cons

The workspace setup creates three things:

1. **`.code-workspace` file** - VS Code workspace configuration
2. **`.demo-context/` directory** - For demo-specific context files
3. **`.cursor/context.md` file** - For Cursor AI context

### Pros

- **`.code-workspace`**:
  - Useful for multi-root workspaces (multiple folders in one workspace)
  - Can store project-specific VS Code settings
  - Makes it easy to reopen project with saved configuration
- **Context directories**:
  - Helpful if you use Cursor AI or similar AI coding assistants
  - Can store project documentation/context for AI tools
  - Provides structure for organizing project context

### Cons

- **`.code-workspace`**:
  - Most developers just open folders directly (don't need workspace files)
  - Adds an extra file to your repository
  - Not commonly used in most workflows
- **Context directories**:
  - Only useful if you actually use Cursor AI or similar tools
  - Adds directories/files that may never be used
  - Can clutter repository if not needed
  - Can always be created manually later if needed

### Recommendation

**Skip workspace setup** unless you:

- Specifically use VS Code workspace files for multi-root projects
- Use Cursor AI and want context files set up automatically
- Have a specific workflow that requires these files

For most users, these files are unnecessary and can be skipped.

## Repository Settings

The extension supports configuring all GitHub repository settings:

- **Basic Settings**: Description, visibility
- **Features**: Wikis, Issues, Projects, Discussions
- **Pull Request Settings**: Merge strategies, auto-merge, branch deletion, update branch
- **General Settings**: Web commit sign-off requirement

## Installation

### From Open VSX Registry

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "GitHub Repo Factory"
4. Click Install

### From VSIX File

1. Download the `.vsix` file from [Releases](https://github.com/jajera/vsx-github-repo-factory/releases)
2. Open VS Code
3. Go to Extensions (`Ctrl+Shift+X`)
4. Click "..." → "Install from VSIX..."
5. Select the downloaded file

## Troubleshooting

### GitHub CLI Issues

- **"gh: command not found"**: Install GitHub CLI from <https://cli.github.com/>
- **"You are not logged into any GitHub hosts"**: Run `gh auth login`
- **"403 Forbidden" (delete)**: Run `gh auth refresh -h github.com -s delete_repo`
- **"Repository already exists"**: Choose to skip, delete and recreate, or modify existing

### Repository Creation Issues

- **"Template not found"**: Verify template name and that you have access to it
- **"Invalid repository name"**: Repository names must be valid (no spaces, special chars)
- **"Permission denied"**: Check you have permission to create repos in the selected organization

### Branch Creation Issues

- **"Branch not linked to issue"**: Ensure issue was created first
- **"Invalid branch name"**: Branch names must follow Git naming rules
- **"Branch already exists"**: The extension handles existing branches gracefully

### Modification Issues

- **"No changes detected"**: All selected settings already match current values
- **"Failed to apply settings"**: Check repository permissions and GitHub API status

## Support

### Getting Help

- **Issues**: [GitHub Issues](https://github.com/jajera/vsx-github-repo-factory/issues)
- **Documentation**: See [PUBLISHING.md](./PUBLISHING.md) for publishing details

### Common Questions

- **Q**: Can I create repositories in organizations?
  **A**: Yes, you can select any organization you have access to.

- **Q**: Does it work with GitHub Enterprise?
  **A**: Yes, as long as `gh CLI` is configured for your Enterprise instance.

- **Q**: Can I modify multiple settings at once?
  **A**: Yes, use "All Settings" category to modify everything in one flow.

- **Q**: What happens if I cancel during creation?
  **A**: If repository was already created, you'll be prompted to keep or delete it.

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/jajera/vsx-github-repo-factory.git
cd vsx-github-repo-factory

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch
```

### Testing

```bash
# Run unit tests
npm test

# Run linter
npm run lint

# Test in VS Code
# Press F5 to launch Extension Development Host
```

### Manual Testing Checklist

- [ ] Create repository (empty)
- [ ] Create repository with template
- [ ] Create repository with issue
- [ ] Create repository with branch
- [ ] Create repository with issue + branch (verify issue number prefix)
- [ ] Test repository existence validation
- [ ] Test branch name validation
- [ ] Test delete repository (with confirmation)
- [ ] Test modify repository settings
- [ ] Test error handling (no gh CLI, not authenticated)

## Publishing

This extension is automatically published to the [Open VSX Registry](https://open-vsx.org/) when merging to the main branch. See [PUBLISHING.md](./PUBLISHING.md) for details.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for a complete list of changes.
