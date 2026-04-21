import { Assessment, ContributorSignals, Tier } from './types';

const TIER_LABELS: Record<Tier, string> = {
  trusted: 'Trusted',
  familiar: 'Needs Review',
  caution: 'Risky',
  unknown: 'Unknown',
};

const TIER_BADGE_COLORS: Record<Tier, string> = {
  trusted: 'brightgreen',
  familiar: 'yellow',
  caution: 'orange',
  unknown: 'red',
};

export const COMMENT_MARKER = '<!-- firstlook-assessment -->';

function shieldsParam(text: string): string {
  return text
    .replace(/-/g, '--')
    .replace(/_/g, '__')
    .replace(/ /g, '_')
    .replace(/\//g, '%2F');
}

function shieldsBadge(label: string, value: string, color: string, style = 'flat-square'): string {
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
  if (days >= 30) {
    const m = Math.floor(days / 30);
    return m === 1 ? '1 month' : `${m} months`;
  }
  return days === 1 ? '1 day' : `${days} days`;
}

function activityLabel(activeMonths: number): string {
  if (activeMonths >= 10) return 'Active';
  if (activeMonths >= 6) return 'Regular';
  if (activeMonths >= 3) return 'Sporadic';
  return 'Minimal';
}

export function buildComment(assessment: Assessment): string {
  const { signals: s, tier, score, summary, patterns } = assessment;

  const tierBadge = shieldsBadge(TIER_LABELS[tier], `${score}%2F100`, TIER_BADGE_COLORS[tier], 'for--the--badge');

  const totalPRs = s.mergedPRs + s.closedPRs;
  const mergeRate = totalPRs > 0 ? Math.round((s.mergedPRs / totalPRs) * 100) : -1;

  const accountColor = s.accountAgeDays >= 365 ? 'blue' : s.accountAgeDays >= 180 ? 'blue' : s.accountAgeDays >= 30 ? 'orange' : 'red';
  const qualityColor = mergeRate >= 80 ? 'brightgreen' : mergeRate >= 50 ? 'yellow' : mergeRate >= 0 ? 'orange' : 'lightgrey';
  const activityColor = s.activeMonths >= 6 ? 'blue' : s.activeMonths >= 3 ? 'orange' : 'red';

  const qualityValue = mergeRate >= 0 ? `${mergeRate}%25 merged` : 'no history';
  const activityValue = `${activityLabel(s.activeMonths)} (${s.activeMonths}%2F${s.totalMonths} mo)`;

  const lines: string[] = [
    COMMENT_MARKER,
    '',
    `${tierBadge}`,
    '',
    `**${summary}**`,
    '',
    shieldsBadge('account', ageText(s.accountAgeDays), accountColor)
    + ' ' + shieldsBadge('quality', qualityValue, qualityColor)
    + ' ' + shieldsBadge('activity', activityValue, activityColor),
    '',
    shieldsBadge('repos', `${s.publicRepos}`, s.publicRepos >= 3 ? 'blue' : 'lightgrey')
    + ' ' + shieldsBadge('followers', `${s.followers}`, s.followers >= 3 ? 'blue' : 'lightgrey')
    + ' ' + shieldsBadge('unique mergers', `${s.uniqueMergers}`, s.uniqueMergers >= 1 ? 'blue' : 'lightgrey')
    + ' ' + shieldsBadge('100%2B%E2%98%85 repos', `${s.highStarRepos}`, s.highStarRepos >= 1 ? 'blue' : 'lightgrey')
    + ' ' + shieldsBadge('signed', s.commitsSigned ? 'yes' : 'no', s.commitsSigned ? 'brightgreen' : 'orange'),
  ];

  if (patterns.length > 0) {
    lines.push('');
    for (const p of patterns) {
      const color = p.severity === 'critical' ? 'red' : 'orange';
      lines.push(shieldsBadge(p.name, p.detail, color));
    }
  }

  if (s.securityFiles.length > 0) {
    lines.push('');
    for (const f of s.securityFiles.slice(0, 3)) {
      lines.push(shieldsBadge('security', f, 'red'));
    }
    if (s.securityFiles.length > 3) {
      lines.push(shieldsBadge('security', `+${s.securityFiles.length - 3} more`, 'red'));
    }
  }

  const details: string[] = [];
  if (s.profile.filledCount > 0) {
    const fields: string[] = [];
    if (s.profile.bio) fields.push('Bio');
    if (s.profile.company) fields.push('Company');
    if (s.profile.blog) fields.push('Blog');
    if (s.profile.twitter) fields.push('Twitter');
    if (s.profile.email) fields.push('Email');
    details.push(`Profile: ${fields.join(', ')}`);
  }
  if (s.codeReviews > 0) details.push(`Code reviews given: ${s.codeReviews}`);
  if (s.selfMergeCount > 0 || s.externalMergeCount > 0) {
    details.push(`Self-merged: ${s.selfMergeCount} | Externally merged: ${s.externalMergeCount}`);
  }
  const repoTotal = s.repoMergedPRs + s.repoClosedPRs;
  if (repoTotal > 0) {
    details.push(`This repo: ${s.repoMergedPRs} merged, ${s.repoClosedPRs} closed`);
  } else {
    details.push('This repo: First-time contributor');
  }

  lines.push(
    '',
    '<details>',
    '<summary>Details</summary>',
    '',
    details.map(d => `- ${d}`).join('\n'),
    '',
    '</details>',
    '',
    '<sub><a href="https://github.com/getagentseal/firstlook">firstlook</a></sub>',
  );

  return lines.join('\n');
}
