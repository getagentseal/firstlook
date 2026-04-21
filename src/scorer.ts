import { ContributorSignals, Tier, Assessment } from './types';

export function score(signals: ContributorSignals): Assessment {
  let points = 0;

  if (signals.accountAgeDays >= 730) points += 25;
  else if (signals.accountAgeDays >= 365) points += 18;
  else if (signals.accountAgeDays >= 180) points += 10;
  else if (signals.accountAgeDays >= 30) points += 3;

  if (signals.publicRepos >= 20) points += 15;
  else if (signals.publicRepos >= 10) points += 10;
  else if (signals.publicRepos >= 3) points += 5;

  points += signals.profile.filledCount * 3;

  if (signals.mergedPRs >= 20) points += 25;
  else if (signals.mergedPRs >= 10) points += 18;
  else if (signals.mergedPRs >= 3) points += 10;
  else if (signals.mergedPRs >= 1) points += 5;

  if (signals.followers >= 50) points += 10;
  else if (signals.followers >= 10) points += 6;
  else if (signals.followers >= 3) points += 3;

  if (signals.commitsSigned) points += 10;

  if (signals.securityFiles.length > 0) points -= 15;

  points = Math.max(0, Math.min(100, points));

  let tier: Tier;
  if (points >= 65) tier = 'trusted';
  else if (points >= 40) tier = 'familiar';
  else if (points >= 15) tier = 'caution';
  else tier = 'unknown';

  return { tier, score: points, signals, summary: buildSummary(tier, signals) };
}

function buildSummary(tier: Tier, signals: ContributorSignals): string {
  const securityNote = signals.securityFiles.length > 0
    ? ' Modifying security-critical files -- review with extra care.'
    : '';

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
