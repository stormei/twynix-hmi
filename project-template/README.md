# AI project foundation

A platform-neutral GitHub repository template for solo, AI-assisted development.
It provides engineering instructions and a repeatable workflow. Application code,
runtime choices and executable CI are established during project setup.

## Included files

| File                                            | Purpose                                            |
| ----------------------------------------------- | -------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                          | Shared engineering rules and project configuration |
| [STARTUP_PROMPT.md](STARTUP_PROMPT.md)          | Prompt for configuring a new or existing project   |
| [CONTRIBUTING.md](CONTRIBUTING.md)              | Solo development, verification and review workflow |
| [CHANGELOG.md](CHANGELOG.md)                    | Foundation version and changes                     |
| [PR template](.github/pull_request_template.md) | Change description, evidence and review record     |

## Prepare the template repository

1. Copy this directory's contents, including `.github`, to a separate repository
   root. Do not copy the surrounding host project or its Git history.
2. Review the files and choose repository visibility and a license appropriate to
   your intended use. No license is selected by this template.
3. After explicit authorization, commit and push the reviewed files.
4. Enable **Template repository** in the repository settings.
5. Test the setup by creating a disposable project from the template and following
   the startup instructions. This end-to-end exercise remains a publishing check.

These files do not configure remote repository settings or create a release tag.

## Start a project

1. Use the GitHub template to create a new repository. For an existing repository,
   compare and integrate these files without overwriting established instructions.
2. Open the project in your AI development tool and paste the prompt from
   [STARTUP_PROMPT.md](STARTUP_PROMPT.md).
3. Supply the product goal, boundaries and critical technology choices. Complete
   the configuration in `AGENTS.md`; document unknowns rather than guessing.
4. Establish reproducible installation, development and verification commands.
   Add CI that runs the same required checks once the toolchain is chosen. Keep
   permissions minimal, test environments isolated and deployment separately authorized.
5. Run the setup and checks from a clean environment. Record evidence and any gaps.
6. Replace this README with the project's purpose, setup, commands and limitations.
   Retain the foundation provenance below. Archive setup guidance if still useful.

For multiple AI tools, point their instruction entry points to `AGENTS.md` rather
than maintaining separate copies of the engineering rules.

## Repository controls

Once CI exists, configure passing required checks on the default branch where
supported by the repository's plan. Use short-lived branches and pull requests
for meaningful changes. Routine solo work does not require another person's
approval. High-risk work follows the human review requirement in `AGENTS.md`.
Repository settings must be configured for each generated project; these Markdown
files do not enforce them.

## Foundation maintenance

Foundation version: **1.0.0** (initial local draft; no release tag created).

When publishing, record the template repository URL and exact source commit in
this README. Generated projects should retain the source URL, version and commit.

Template updates are not automatically propagated to generated projects. Review
useful changes, apply them in a focused PR and update the recorded provenance.
Preserve project-specific decisions. Maintain shared rules here as the canonical
source; use additional stack-specific starters only when repeated needs justify them.
