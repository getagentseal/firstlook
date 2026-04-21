# firstlook

Know who's opening pull requests before you review them.

**firstlook** is a GitHub Action that profiles PR contributors and posts a trust assessment on every pull request. It checks account age, contribution history, profile signals, commit signatures, and whether the PR touches security-critical files -- then leaves a clear summary right on the PR.

The xz-utils backdoor was merged by an account that spent two years building credibility through small, legitimate contributions. GitHub's built-in "first-time contributor" label wouldn't have caught it. firstlook gives you the full picture in seconds.

## Quick start

Create `.github/workflows/firstlook.yml`:

```yaml
name: firstlook
on:
  pull_request:
    types: [opened, reopened, synchronize]
  workflow_dispatch:
    inputs:
      pr-number:
        description: 'PR number to scan (leave empty to scan all open PRs)'
        required: false
        type: string

jobs:
  assess:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: getagentseal/firstlook@v1
        with:
          pr-number: ${{ inputs.pr-number }}
```

No configuration needed. It works out of the box.

New PRs are assessed automatically. For existing PRs, go to **Actions > firstlook > Run workflow** -- leave the PR number empty to scan every open PR at once, or enter a number to scan one.

## What you get

Every PR gets a comment like this:

> ### firstlook
>
> | Signal | Detail | |
> |--------|--------|---|
> | **Account** | Created 4y 2mo ago | :white_check_mark: |
> | **Repos** | 36 public | :white_check_mark: |
> | **Profile** | Bio, Company, Blog | :white_check_mark: |
> | **History** | 89 merged, 3 rejected elsewhere | :white_check_mark: |
> | **Merge quality** | 5 unique mergers, 3 repos with 100+ stars | :white_check_mark: |
> | **Activity** | 10/12 months active | :white_check_mark: |
> | **Followers** | 142 | :white_check_mark: |
> | **Signed** | Yes | :white_check_mark: |
>
> **Trusted** (score: 88/100) -- Established contributor with a verified presence across GitHub.

A label like `firstlook: trusted` gets applied, and a collapsible Details section shows merger breakdown, repo-specific history, and code review count.

When something needs attention:

> ### firstlook
>
> | Signal | Detail | |
> |--------|--------|---|
> | **Account** | Created 42 days ago | :warning: |
> | **Repos** | 928 public | :warning: |
> | **Profile** | Bio | :warning: |
> | **History** | 2 merged, 0 rejected elsewhere | :warning: |
> | **Merge quality** | 2 self-merged only | :warning: |
> | **Activity** | 1/12 months active | :warning: |
> | **Followers** | 56 | :white_check_mark: |
> | **Signed** | No | :warning: |
>
> :rotating_light: **Repo Spam** -- 928 repos in 42 days (22.1/day)
>
> **Unknown Contributor** (score: 0/100) -- Suspicious patterns detected. Thorough review strongly recommended.

## Trust tiers

| Tier | Score | Meaning |
|------|-------|---------|
| **Trusted** | 65+ | Established account, verified presence, broad contribution history |
| **Familiar** | 40-64 | Some history and profile signals. Standard review |
| **Caution** | 15-39 | Limited history or newer account. Extra scrutiny recommended |
| **Unknown** | 0-14 | Very new or empty account. Thorough review needed |

## Signals checked

- **Account age** -- how long the GitHub account has existed
- **Public repos** -- number of public repositories
- **Profile completeness** -- bio, company, blog, twitter, email
- **Contribution history** -- merged and rejected PRs to other repositories
- **Merge quality** -- unique maintainers who merged their PRs, contributions to repos with 100+ stars
- **Activity consistency** -- how many of the last 12 months had any GitHub activity
- **Code reviews** -- reviews given to other contributors
- **Repo history** -- returning contributor or first-timer in your repo
- **Followers** -- community recognition
- **Commit signatures** -- whether commits in this PR are signed and verified
- **Security-critical files** -- whether the PR touches CI, lockfiles, build scripts, or dependency manifests

## Suspicious pattern detection

Cross-signal rules that catch gaming attempts individual metrics would miss:

- **Repo Spam** -- hundreds of repos created in days (bot/automation accounts)
- **Self-Merge Only** -- all PRs self-merged, no external validation
- **High PR Volume** -- excessive merged PRs on a very new account
- **Dormant Reactivation** -- old account with activity only in the last few weeks
- **Low Quality Repos** -- many repos but none with meaningful stars, no external mergers

## Configuration

All inputs are optional. Defaults work for most projects.

```yaml
- uses: getagentseal/firstlook@v1
  with:
    # Token for GitHub API calls (default: automatic)
    github-token: ${{ secrets.GITHUB_TOKEN }}

    # Paths treated as security-critical (comma-separated substrings)
    security-paths: '.github/workflows/,package.json,Makefile,Dockerfile,scripts/'

    # Prefix for PR labels (default: firstlook)
    label-prefix: 'firstlook'

    # Post assessment comment (default: true)
    post-comment: 'true'

    # Apply trust-tier labels (default: true)
    apply-labels: 'true'

    # Skip repo collaborators with write+ access (default: true)
    skip-collaborators: 'true'

    # Usernames to always skip (comma-separated)
    skip-users: 'dependabot,renovate'

    # Org members to auto-trust (comma-separated org names)
    trusted-orgs: 'my-org'

    # Fail the check when tier is at or below this level (default: none)
    # Options: unknown, caution, familiar, none
    fail-on: 'unknown'
```

## Outputs

Use outputs in downstream workflow steps:

```yaml
steps:
  - uses: getagentseal/firstlook@v1
    id: fl
  - run: echo "Tier is ${{ steps.fl.outputs.tier }}"
```

| Output | Description |
|--------|-------------|
| `tier` | `trusted`, `familiar`, `caution`, or `unknown` |
| `score` | Numeric score (0-100) |
| `account-age-days` | Account age in days |

### Block merges on untrusted contributors

```yaml
- uses: getagentseal/firstlook@v1
  with:
    fail-on: 'unknown'
```

Or use outputs for custom logic:

```yaml
- uses: getagentseal/firstlook@v1
  id: fl
- name: Gate on trust tier
  if: steps.fl.outputs.tier == 'unknown' || steps.fl.outputs.tier == 'caution'
  run: |
    echo "::error::PR author needs manual approval (tier: ${{ steps.fl.outputs.tier }})"
    exit 1
```

### Scan all existing PRs on install

Go to **Actions > firstlook > Run workflow** and leave PR number empty. Every open PR gets assessed and you see a summary table in the job output.

## What it skips

- **Bot accounts** -- dependabot, renovate, etc. are skipped automatically
- **Repo collaborators** -- users with write, maintain, or admin access are skipped by default
- **Trusted org members** -- anyone in orgs listed in `trusted-orgs`
- **Allow-listed users** -- anyone in the `skip-users` list

## Built by

[AgentSeal](https://agentseal.org) -- security tooling for the AI agent ecosystem.

Born from maintaining [CodeBurn](https://github.com/getagentseal/codeburn), where every PR from an unknown account meant 5 minutes of manual profile checking. firstlook automates the first 60 seconds of that process.

## License

MIT
