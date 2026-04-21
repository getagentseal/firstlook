import { Assessment, ContributorSignals, Tier } from './types';

const TIER_LABELS: Record<Tier, string> = {
  trusted: 'TRUSTED',
  familiar: 'FAMILIAR',
  caution: 'REVIEW SUGGESTED',
  unknown: 'UNKNOWN',
};

const TIER_BADGE_COLORS: Record<Tier, string> = {
  trusted: 'brightgreen',
  familiar: 'yellow',
  caution: 'orange',
  unknown: 'red',
};

const TIER_ALERT: Record<Tier, string> = {
  trusted: 'NOTE',
  familiar: 'TIP',
  caution: 'WARNING',
  unknown: 'CAUTION',
};

export const COMMENT_MARKER = '<!-- firstlook-assessment -->';

function shieldsParam(text: string): string {
  return text
    .replace(/-/g, '--')
    .replace(/_/g, '__')
    .replace(/ /g, '_')
    .replace(/\//g, '%2F');
}

function badge(label: string, value: string, color: string, style = 'flat-square'): string {
  const l = shieldsParam(label);
  const v = shieldsParam(value);
  return `![${label}](https://img.shields.io/badge/${l}-${v}-${color}?style=${style})`;
}

function ageText(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    return months > 0 ? `${years}y ${months}mo` : `${years}y`;
  }
  if (days >= 30) return `${Math.floor(days / 30)} months`;
  return `${days} days`;
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
}

function signalBadges(s: ContributorSignals): string[] {
  const badges: string[] = [];

  badges.push(badge('account', ageText(s.accountAgeDays),
    s.accountAgeDays >= 365 ? 'blue' : s.accountAgeDays >= 180 ? 'blue' : s.accountAgeDays >= 30 ? 'orange' : 'red'));

  badges.push(badge('repos', `${s.publicRepos}`,
    s.publicRepos >= 3 ? 'blue' : s.publicRepos >= 1 ? 'orange' : 'red'));

  badges.push(badge('merged', `${s.mergedPRs}`,
    s.mergedPRs >= 10 ? 'brightgreen' : s.mergedPRs >= 3 ? 'blue' : s.mergedPRs >= 1 ? 'orange' : 'red'));

  badges.push(badge('rejected', `${s.closedPRs}`,
    s.closedPRs === 0 ? 'blue' : s.closedPRs <= s.mergedPRs ? 'orange' : 'red'));

  badges.push(badge('unique mergers', `${s.uniqueMergers}`,
    s.uniqueMergers >= 3 ? 'brightgreen' : s.uniqueMergers >= 1 ? 'blue' : 'lightgrey'));

  badges.push(badge('100%2B%E2%98%85 repos', `${s.highStarRepos}`,
    s.highStarRepos >= 3 ? 'brightgreen' : s.highStarRepos >= 1 ? 'blue' : 'lightgrey'));

  badges.push(badge('activity', `${s.activeMonths}/${s.totalMonths} mo`,
    s.activeMonths >= 6 ? 'blue' : s.activeMonths >= 3 ? 'blue' : s.activeMonths >= 1 ? 'orange' : 'red'));

  badges.push(badge('followers', `${s.followers}`,
    s.followers >= 10 ? 'blue' : s.followers >= 3 ? 'blue' : 'lightgrey'));

  badges.push(badge('signed', s.commitsSigned ? 'yes' : 'no',
    s.commitsSigned ? 'brightgreen' : 'orange'));

  if (s.profile.filledCount > 0) {
    const fields: string[] = [];
    if (s.profile.bio) fields.push('bio');
    if (s.profile.company) fields.push('co');
    if (s.profile.blog) fields.push('blog');
    if (s.profile.twitter) fields.push('tw');
    if (s.profile.email) fields.push('email');
    badges.push(badge('profile', fields.join(' '), 'blue'));
  }

  for (const f of s.securityFiles.slice(0, 3)) {
    badges.push(badge('security', f, 'red'));
  }
  if (s.securityFiles.length > 3) {
    badges.push(badge('security', `+${s.securityFiles.length - 3} more`, 'red'));
  }

  return badges;
}

export function buildComment(assessment: Assessment): string {
  const { signals: s, tier, score, summary, patterns } = assessment;

  const tierBadge = badge(TIER_LABELS[tier], `${score}%2F100`, TIER_BADGE_COLORS[tier], 'for--the--badge');
  const bar = scoreBar(score);
  const badges = signalBadges(s);

  const lines: string[] = [
    COMMENT_MARKER,
    '',
    `### firstlook &nbsp; ${tierBadge}`,
    '',
    `\`${bar}\``,
    '',
    badges.join(' '),
  ];

  if (patterns.length > 0) {
    lines.push('');
    for (const p of patterns) {
      const alertType = p.severity === 'critical' ? 'CAUTION' : 'WARNING';
      lines.push(`> [!${alertType}]`, `> **${p.name}** -- ${p.detail}`, '');
    }
  }

  lines.push('', `> [!${TIER_ALERT[tier]}]`, `> ${summary}`);

  const details: string[] = [];
  if (s.codeReviews > 0) details.push(`- Code reviews given: ${s.codeReviews}`);
  if (s.selfMergeCount > 0 || s.externalMergeCount > 0) {
    details.push(`- Self-merged: ${s.selfMergeCount} | Externally merged: ${s.externalMergeCount}`);
  }
  if (s.highStarRepos > 0)
    details.push(`- Contributed to ${s.highStarRepos} repos with 100+ stars`);
  const repoTotal = s.repoMergedPRs + s.repoClosedPRs;
  if (repoTotal > 0) {
    details.push(`- This repo: ${s.repoMergedPRs} merged, ${s.repoClosedPRs} closed`);
  } else {
    details.push('- This repo: First-time contributor');
  }

  if (details.length > 0) {
    lines.push('', '<details>', '<summary>Details</summary>', '', ...details, '', '</details>');
  }

  lines.push('', '<sub><a href="https://github.com/getagentseal/firstlook">firstlook</a></sub>');

  return lines.join('\n');
}
