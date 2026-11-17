## Problem and resulting behavior

Describe the trigger, expected outcome and what changes. Link the issue or task
when applicable. State scope boundaries if needed.

## Acceptance and verification

List acceptance criteria with verified, failed or untested status. Include the
commands actually executed and their results. Link relevant CI or other evidence.
Separate existing failures from new regressions and explain untested paths.

## Review record

- Author review: [complete / pending]
- Separate AI review: [complete / unavailable / not needed for this change]
- Another qualified human: [complete / pending / not required by risk policy]
- High-risk areas: [none, or describe security, sensitive-data, migration or safety impact]
- Remaining findings and limitations: [details]

For setup changes, include strict validation, clean-install results and the real
first-feature smoke test. Identify application checks separately from foundation
checks. For CI or command changes, inspect credentials, permissions and execution
boundaries. Link migration recovery or rollback evidence when relevant.

Record who or what performed any additional review. Required high-risk human review
must be completed before merge or release; AI review does not replace it.

## Completion checklist

- [ ] Scope and resulting behavior match the acceptance criteria.
- [ ] The full diff has been inspected and relevant checks have run.
- [ ] Failure evidence, baseline debt and verification gaps are recorded honestly.
- [ ] Required review is complete and critical findings are resolved.
- [ ] Documentation and compatibility or recovery notes are updated where needed.
- [ ] Document, SVG, legacy scripts and ThingsBoard contracts are preserved or authorized changes explained.
- [ ] Verification uses isolated services and synthetic equipment, without production credentials.

Deployment, if applicable, is a separately authorized action.
