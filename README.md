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

jobs:
  assess:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: getagentseal/firstlook@v1
```

No configuration needed. It works out of the box.

## What you get

Every PR gets a comment like this:

> ### firstlook
>
> | Signal | Detail | |
> |--------|--------|---|
> | **Account** | Created 4y 2mo ago | :white_check_mark: |
> | **Repos** | 36 public | :white_check_mark: |
> | **Profile** | Bio, Company, Blog | :white_check_mark: |
> | **History** | 89 merged PRs elsewhere | :white_check_mark: |
> | **Followers** | 142 | :white_check_mark: |
> | **Signed** | Yes | :white_check_mark: |
>
> **Trusted** (score: 92/100) -- Established contributor with a verified presence across GitHub.

And a label like `firstlook: trusted` gets applied to the PR.

When something needs attention:

> ### firstlook
>
> | Signal | Detail | |
> |--------|--------|---|
> | **Account** | Created 12 days ago | :warning: |
> | **Repos** | 0 public | :warning: |
> | **Profile** | None provided | :warning: |
> | **History** | 0 merged PRs elsewhere | :warning: |
> | **Followers** | 0 | :warning: |
> | **Signed** | No | :warning: |
> | **Security paths** | `.github/workflows/ci.yml` | :rotating_light: |
>
> **Unknown Contributor** (score: 0/100) -- Very new or empty account. Touching security-critical paths -- thorough review strongly recommended.

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
- **Contribution history** -- merged PRs to other repositories (excludes your repo)
- **Followers** -- community recognition
- **Commit signatures** -- whether commits in this PR are signed and verified
- **Security-critical files** -- whether the PR touches CI, lockfiles, build scripts, or dependency manifests

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
    id: fl
  - name: Gate on trust tier
    if: steps.fl.outputs.tier == 'unknown'
    run: |
      echo "::error::PR author is an unknown contributor. Manual approval required."
      exit 1
```

## What it skips

- **Bot accounts** -- dependabot, renovate, etc. are skipped automatically
- **Repo collaborators** -- users with write, maintain, or admin access are skipped by default
- **Allow-listed users** -- anyone in the `skip-users` list

## Built by

[AgentSeal](https://agentseal.org) -- security tooling for the AI agent ecosystem.

Born from maintaining [CodeBurn](https://github.com/getagentseal/codeburn), where every PR from an unknown account meant 5 minutes of manual profile checking. firstlook automates the first 60 seconds of that process.

## License

MIT
