import { ContributorSignals, Tier, Assessment, SuspiciousPattern } from './types';

export function score(signals: ContributorSignals): Assessment {
  let points = 0;

  if (signals.accountAgeDays >= 730) points += 20;
  else if (signals.accountAgeDays >= 365) points += 14;
  else if (signals.accountAgeDays >= 180) points += 8;
  else if (signals.accountAgeDays >= 30) points += 2;

  if (signals.publicRepos >= 20) points += 10;
  else if (signals.publicRepos >= 10) points += 7;
  else if (signals.publicRepos >= 3) points += 4;

  points += Math.min(signals.profile.filledCount * 2, 10);

  if (signals.mergedPRs >= 20) points += 15;
  else if (signals.mergedPRs >= 10) points += 11;
  else if (signals.mergedPRs >= 3) points += 7;
  else if (signals.mergedPRs >= 1) points += 3;

  const totalPRs = signals.mergedPRs + signals.closedPRs;
  if (totalPRs >= 5) {
    const mergeRate = signals.mergedPRs / totalPRs;
    if (mergeRate >= 0.8) points += 5;
    else if (mergeRate < 0.3) points -= 10;
  }

  if (signals.followers >= 50) points += 8;
  else if (signals.followers >= 10) points += 5;
  else if (signals.followers >= 3) points += 2;

  if (signals.commitsSigned) points += 5;

  if (signals.activeMonths >= 10) points += 10;
  else if (signals.activeMonths >= 6) points += 7;
  else if (signals.activeMonths >= 3) points += 4;
  else if (signals.activeMonths >= 1) points += 1;

  if (signals.uniqueMergers >= 5) points += 10;
  else if (signals.uniqueMergers >= 3) points += 7;
  else if (signals.uniqueMergers >= 1) points += 3;

  if (signals.highStarRepos >= 5) points += 10;
  else if (signals.highStarRepos >= 3) points += 7;
  else if (signals.highStarRepos >= 1) points += 4;

  if (signals.codeReviews >= 10) points += 5;
  else if (signals.codeReviews >= 3) points += 3;
  else if (signals.codeReviews >= 1) points += 1;

  if (signals.repoMergedPRs >= 5) points += 5;
  else if (signals.repoMergedPRs >= 1) points += 3;

  if (signals.securityFiles.length > 0) points -= 15;

  const patterns = detectPatterns(signals);
  for (const p of patterns) {
    points -= p.severity === 'critical' ? 15 : 5;
  }

  points = Math.max(0, Math.min(100, points));

  let tier: Tier;
  if (points >= 65) tier = 'trusted';
  else if (points >= 40) tier = 'familiar';
  else if (points >= 15) tier = 'caution';
  else tier = 'unknown';

  return { tier, score: points, signals, patterns, summary: buildSummary(tier, signals, patterns) };
}

function detectPatterns(signals: ContributorSignals): SuspiciousPattern[] {
  const patterns: SuspiciousPattern[] = [];
  const reposPerDay = signals.publicRepos / Math.max(signals.accountAgeDays, 1);

  if (reposPerDay > 5 && signals.publicRepos > 50) {
    patterns.push({
      name: 'Repo Spam',
      severity: 'critical',
      detail: `${signals.publicRepos} repos in ${signals.accountAgeDays} days (${reposPerDay.toFixed(1)}/day)`,
    });
  }

  if (signals.selfMergeCount > 0 && signals.externalMergeCount === 0 && signals.mergedPRs >= 5) {
    patterns.push({
      name: 'Self-Merge Only',
      severity: 'warning',
      detail: `${signals.selfMergeCount} self-merged PRs, 0 externally merged`,
    });
  }

  if (signals.accountAgeDays < 60 && signals.mergedPRs > 20) {
    patterns.push({
      name: 'High PR Volume',
      severity: 'warning',
      detail: `${signals.mergedPRs} merged PRs in ${signals.accountAgeDays} days`,
    });
  }

  if (signals.accountAgeDays > 365 && signals.activeMonths <= 2 && signals.totalMonths >= 6) {
    patterns.push({
      name: 'Dormant Reactivation',
      severity: 'warning',
      detail: `Active ${signals.activeMonths}/${signals.totalMonths} months despite ${Math.floor(signals.accountAgeDays / 365)}y account`,
    });
  }

  if (signals.publicRepos > 20 && signals.highStarRepos === 0 && signals.uniqueMergers === 0) {
    patterns.push({
      name: 'Low Quality Repos',
      severity: 'warning',
      detail: `${signals.publicRepos} repos but 0 with 100+ stars, 0 external mergers`,
    });
  }

  return patterns;
}

function buildSummary(
  tier: Tier,
  signals: ContributorSignals,
  patterns: SuspiciousPattern[],
): string {
  const hasCritical = patterns.some(p => p.severity === 'critical');
  const securityNote =
    signals.securityFiles.length > 0 ? ' Modifying security-critical files.' : '';

  if (hasCritical) {
    return `Suspicious patterns detected.${securityNote} Thorough review strongly recommended.`;
  }

  switch (tier) {
    case 'trusted':
      return 'Established contributor with a verified presence across GitHub.';
    case 'familiar':
      return 'Contributor with some history. Standard review recommended.';
    case 'caution':
      return `Limited history or new account.${securityNote || ' Review with extra care.'}`;
    case 'unknown':
      return `Very new or empty account.${securityNote || ' Thorough review recommended.'}`;
  }
}
