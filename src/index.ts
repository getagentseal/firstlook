import * as core from '@actions/core';
import * as github from '@actions/github';
import { gatherSignals } from './signals';
import { score } from './scorer';
import { buildComment, COMMENT_MARKER } from './comment';
import { Tier, Assessment } from './types';

type Octokit = ReturnType<typeof github.getOctokit>;

const TIER_COLORS: Record<Tier, string> = {
  trusted: '0e8a16',
  familiar: 'fbca04',
  caution: 'e4a221',
  unknown: 'd93f0b',
};

const TIER_ORDER: Record<string, number> = {
  unknown: 0,
  caution: 1,
  familiar: 2,
  trusted: 3,
};

interface Config {
  securityPaths: string[];
  postComment: boolean;
  applyLabels: boolean;
  labelPrefix: string;
  failOn: string;
  trustedOrgs: string[];
  skipUsers: string[];
  skipCollaborators: boolean;
}

function loadConfig(): Config {
  return {
    securityPaths: core.getInput('security-paths').split(',').map(s => s.trim()).filter(Boolean),
    postComment: core.getInput('post-comment') !== 'false',
    applyLabels: core.getInput('apply-labels') !== 'false',
    labelPrefix: core.getInput('label-prefix') || 'firstlook',
    failOn: core.getInput('fail-on') || 'none',
    trustedOrgs: core.getInput('trusted-orgs').split(',').map(s => s.trim()).filter(Boolean),
    skipUsers: core.getInput('skip-users').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    skipCollaborators: core.getInput('skip-collaborators') !== 'false',
  };
}

async function assessPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  username: string,
  userType: string,
  config: Config,
): Promise<Assessment | null> {
  const tag = `[#${prNumber}]`;

  if (userType === 'Bot') {
    core.info(`${tag} Skipping bot: ${username}`);
    return null;
  }

  if (config.skipUsers.includes(username.toLowerCase())) {
    core.info(`${tag} Skipping allow-listed user: ${username}`);
    return null;
  }

  if (config.skipCollaborators) {
    try {
      const { data: perm } = await octokit.rest.repos.getCollaboratorPermissionLevel({
        owner, repo, username,
      });
      if (['admin', 'maintain', 'write'].includes(perm.permission)) {
        core.info(`${tag} Skipping collaborator: ${username} (${perm.permission})`);
        return null;
      }
    } catch {
      // Not a collaborator
    }
  }

  for (const org of config.trustedOrgs) {
    try {
      await octokit.rest.orgs.checkMembershipForUser({ org, username });
      core.info(`${tag} ${username} is in trusted org ${org} -- skipping.`);
      return null;
    } catch {
      // Not a member
    }
  }

  core.info(`${tag} Analyzing: ${username}`);
  const signals = await gatherSignals(octokit, owner, repo, prNumber, username, config.securityPaths);
  const assessment = score(signals);
  core.info(`${tag} Result: ${assessment.tier} (score: ${assessment.score})`);

  if (assessment.patterns.length > 0) {
    core.warning(`${tag} Suspicious: ${assessment.patterns.map(p => p.name).join(', ')}`);
  }

  if (config.postComment) {
    const body = buildComment(assessment);
    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      owner, repo, issue_number: prNumber, per_page: 100,
    });
    const existing = comments.find(c => c.body?.includes(COMMENT_MARKER));

    if (existing) {
      await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    } else {
      await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
    }
  }

  if (config.applyLabels) {
    const labelName = `${config.labelPrefix}: ${assessment.tier}`;

    try {
      await octokit.rest.issues.getLabel({ owner, repo, name: labelName });
    } catch {
      await octokit.rest.issues.createLabel({
        owner, repo, name: labelName, color: TIER_COLORS[assessment.tier],
      });
    }

    const { data: prLabels } = await octokit.rest.issues.listLabelsOnIssue({
      owner, repo, issue_number: prNumber,
    });
    for (const label of prLabels) {
      if (label.name.startsWith(`${config.labelPrefix}:`) && label.name !== labelName) {
        await octokit.rest.issues.removeLabel({
          owner, repo, issue_number: prNumber, name: label.name,
        });
      }
    }

    await octokit.rest.issues.addLabels({
      owner, repo, issue_number: prNumber, labels: [labelName],
    });
  }

  return assessment;
}

interface ScanResult {
  prNumber: number;
  username: string;
  tier: string;
  score: number;
  patterns: number;
}

async function writeSummary(results: ScanResult[]): Promise<void> {
  const tierEmoji: Record<string, string> = {
    trusted: '🟢', familiar: '🟡', caution: '🟠', unknown: '🔴',
  };

  await core.summary
    .addHeading('firstlook -- Scan Results', 2)
    .addTable([
      [
        { data: 'PR', header: true },
        { data: 'Author', header: true },
        { data: 'Tier', header: true },
        { data: 'Score', header: true },
        { data: 'Flags', header: true },
      ],
      ...results.map(r => [
        `#${r.prNumber}`,
        r.username,
        `${tierEmoji[r.tier] || ''} ${r.tier}`,
        `${r.score}/100`,
        r.patterns > 0 ? `${r.patterns} suspicious` : '-',
      ]),
    ])
    .write();
}

async function run(): Promise<void> {
  const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
  if (!token) {
    core.setFailed('No GitHub token. Set the github-token input or GITHUB_TOKEN env var.');
    return;
  }

  const { owner, repo } = github.context.repo;
  const octokit = github.getOctokit(token);
  const config = loadConfig();

  if (github.context.eventName === 'pull_request') {
    const pr = github.context.payload.pull_request!;
    const assessment = await assessPR(
      octokit, owner, repo, pr.number, pr.user.login, pr.user.type, config,
    );
    if (assessment) {
      core.setOutput('tier', assessment.tier);
      core.setOutput('score', assessment.score.toString());
      core.setOutput('account-age-days', assessment.signals.accountAgeDays.toString());

      if (config.failOn !== 'none' && TIER_ORDER[assessment.tier] <= (TIER_ORDER[config.failOn] ?? -1)) {
        core.setFailed(
          `Contributor tier "${assessment.tier}" is at or below fail-on threshold "${config.failOn}".`,
        );
      }
    }
    return;
  }

  if (github.context.eventName === 'workflow_dispatch') {
    const prNumberInput = core.getInput('pr-number');

    if (prNumberInput) {
      const num = parseInt(prNumberInput, 10);
      core.info(`Scanning PR #${num}...`);
      const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: num });
      const assessment = await assessPR(
        octokit, owner, repo, pr.number, pr.user!.login, pr.user!.type ?? 'User', config,
      );
      if (assessment) {
        core.setOutput('tier', assessment.tier);
        core.setOutput('score', assessment.score.toString());
        core.setOutput('account-age-days', assessment.signals.accountAgeDays.toString());
        await writeSummary([{
          prNumber: pr.number,
          username: pr.user!.login,
          tier: assessment.tier,
          score: assessment.score,
          patterns: assessment.patterns.length,
        }]);
      }
      return;
    }

    core.info('Scanning all open PRs...');
    const prs = await octokit.paginate(octokit.rest.pulls.list, {
      owner, repo, state: 'open', per_page: 100,
    });
    core.info(`Found ${prs.length} open PRs.`);

    const results: ScanResult[] = [];
    for (let i = 0; i < prs.length; i++) {
      const pr = prs[i];
      const assessment = await assessPR(
        octokit, owner, repo, pr.number, pr.user!.login, pr.user!.type ?? 'User', config,
      );
      if (assessment) {
        results.push({
          prNumber: pr.number,
          username: pr.user!.login,
          tier: assessment.tier,
          score: assessment.score,
          patterns: assessment.patterns.length,
        });
      }
      core.info(`Progress: ${i + 1}/${prs.length}`);
    }

    await writeSummary(results);
    core.info(`Done. Assessed ${results.length} PRs.`);
    return;
  }

  core.info(`Unsupported event: ${github.context.eventName} -- skipping.`);
}

run().catch(err => {
  core.setFailed(err instanceof Error ? err.message : 'Unexpected error');
});
