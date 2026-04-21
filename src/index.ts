import * as core from '@actions/core';
import * as github from '@actions/github';
import { gatherSignals } from './signals';
import { score } from './scorer';
import { buildComment, COMMENT_MARKER } from './comment';
import { Tier } from './types';

const TIER_COLORS: Record<Tier, string> = {
  trusted: '0e8a16',
  familiar: 'fbca04',
  caution: 'e4a221',
  unknown: 'd93f0b',
};

async function run(): Promise<void> {
  const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
  if (!token) {
    core.setFailed('No GitHub token. Set the github-token input or GITHUB_TOKEN env var.');
    return;
  }

  const context = github.context;
  if (!context.payload.pull_request) {
    core.info('Not a pull_request event -- skipping.');
    return;
  }

  const pr = context.payload.pull_request;
  const { owner, repo } = context.repo;
  const prNumber = pr.number;
  const username: string = pr.user.login;

  if (pr.user.type === 'Bot') {
    core.info(`Skipping bot: ${username}`);
    return;
  }

  const skipUsers = core.getInput('skip-users')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (skipUsers.includes(username.toLowerCase())) {
    core.info(`Skipping allow-listed user: ${username}`);
    return;
  }

  const octokit = github.getOctokit(token);

  if (core.getInput('skip-collaborators') !== 'false') {
    try {
      const { data: perm } = await octokit.rest.repos.getCollaboratorPermissionLevel({
        owner, repo, username,
      });
      if (['admin', 'maintain', 'write'].includes(perm.permission)) {
        core.info(`Skipping collaborator: ${username} (${perm.permission})`);
        return;
      }
    } catch {
      // Not a collaborator -- continue
    }
  }

  const securityPaths = core.getInput('security-paths')
    .split(',').map(s => s.trim()).filter(Boolean);
  const postComment = core.getInput('post-comment') !== 'false';
  const applyLabels = core.getInput('apply-labels') !== 'false';
  const labelPrefix = core.getInput('label-prefix') || 'firstlook';

  core.info(`Analyzing contributor: ${username}`);
  const signals = await gatherSignals(octokit, owner, repo, prNumber, username, securityPaths);
  const assessment = score(signals);
  core.info(`Result: ${assessment.tier} (score: ${assessment.score})`);

  core.setOutput('tier', assessment.tier);
  core.setOutput('score', assessment.score.toString());
  core.setOutput('account-age-days', signals.accountAgeDays.toString());

  if (postComment) {
    const body = buildComment(assessment);
    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      owner, repo, issue_number: prNumber, per_page: 100,
    });
    const existing = comments.find(c => c.body?.includes(COMMENT_MARKER));

    if (existing) {
      await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
      core.info('Updated existing comment.');
    } else {
      await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
      core.info('Posted assessment comment.');
    }
  }

  if (applyLabels) {
    const labelName = `${labelPrefix}: ${assessment.tier}`;

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
      if (label.name.startsWith(`${labelPrefix}:`) && label.name !== labelName) {
        await octokit.rest.issues.removeLabel({
          owner, repo, issue_number: prNumber, name: label.name,
        });
      }
    }

    await octokit.rest.issues.addLabels({
      owner, repo, issue_number: prNumber, labels: [labelName],
    });
    core.info(`Applied label: ${labelName}`);
  }
}

run().catch(err => {
  core.setFailed(err instanceof Error ? err.message : 'Unexpected error');
});
