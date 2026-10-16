# Release notes

Release notes are kept in the repo, one file per tag, so they are reviewed with the pull request instead of being typed into GitHub afterwards.

## Writing notes

Create `.github/releases/v<version>.md`:

```md
# v1.5.0 - Short summary of the release

### What's Changed

Intro paragraph: what is the headline of this release?

- **Feature**: what it does
- **Fix**: what was broken

**Full Changelog**: https://github.com/zpt0/Questcord/compare/v1.4.0...v1.5.0
```

- the first `# ` heading becomes the **release title**
- everything below it becomes the **release body**
- the footer (`**Full Changelog**: …`) is regenerated with the correct compare link, so it can be left out of the file
- the block from [install.md](install.md) is appended automatically, unless the notes already contain a `### Install` heading

## Sources

The `Release` workflow picks the notes up when a `v*` tag is pushed:

| source      | notes come from                                                  |
| ----------- | ---------------------------------------------------------------- |
| `auto`      | `v1.5.0.md` if it exists, otherwise the commit list (default)     |
| `file`      | `v1.5.0.md`, falling back to the notes of the base version        |
| `changelog` | the `## [1.5.0]` section of `CHANGELOG.md`                       |
| `commits`   | the commit list between the previous and the current tag          |

For prereleases (`v1.5.0-rc.1`) the base version file (`v1.5.0.md`) is used when no file for the tag exists, and the tag suffix must match `package.json` (`1.5.0`).

A manual run of the workflow (`workflow_dispatch`) can override the source (`auto`, `file`, `changelog`, `commits`) and whether the release is a prerelease (`auto`, `true`, `false`). In `auto` mode any tag with a suffix (`v1.5.0-rc.1`, `-beta`, `-alpha`) is published as a prerelease and never becomes the "Latest" release.

## Testing locally

```bash
TAG=v1.5.0 bash .github/releases/generate-notes.sh                 # uses the notes file
TAG=v1.5.0 NOTES_SOURCE=changelog bash .github/releases/generate-notes.sh
TAG=v1.5.0 NOTES_SOURCE=commits bash .github/releases/generate-notes.sh
```

Without `GITHUB_OUTPUT` the script prints the title, the prerelease flag and the body instead of writing workflow outputs.
