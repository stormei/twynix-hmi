# Repository controls

Files in this template do not configure remote settings. For each generated project:

- Choose visibility and a license deliberately. This template does not grant an
  open-source license or silently select one for your product.
- Enable Actions for the intended repositories and permit the pinned official
  actions used by CI. Keep default token permissions read-only.
- Run CI and require the unique `Required checks` status on the default branch,
  where the hosting plan supports it. It includes application verification when
  `project.json` declares the project configured.
- Use PRs for meaningful changes. Restrict force pushes and branch deletion.
  Select review rules compatible with the solo workflow and the risk policy.
- Enable secret scanning and push protection where available. Confirm the private
  vulnerability reporting route or document an alternative secure contact.
- Confirm Dependabot updates run. Add application package ecosystems after setup.
- Keep production secrets out of verification. If deployment is added, use a
  separate protected environment and explicit deployment authorization.
- Identify who can approve high-risk changes before accepting external users or
  handling sensitive data. If no qualified reviewer is available, keep the affected
  capability disabled or isolated until review occurs.

Record verified settings, plan restrictions and remaining gaps in the setup PR.
Do not claim protections are enforced merely because this checklist exists.

GitHub references: [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule),
[secure Actions](https://docs.github.com/en/actions/reference/security/secure-use),
[template creation](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template).
