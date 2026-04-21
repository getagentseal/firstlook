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

const TIER_DOTS: Record<Tier, string> = {
  trusted: '\ud83d\udfe2',
  familiar: '\ud83d\udfe1',
  caution: '\ud83d\udfe0',
  unknown: '\ud83d\udd34',
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
  if (days >= 30) return `${Math.floor(days / 30)} months`;
  return `${days} days`;
}

function ageQualifier(days: number): string {
  if (days >= 730) return 'Long-term presence';
  if (days >= 365) return 'Established';
  if (days >= 180) return 'Growing';
  return 'New account';
}

function activityLabel(activeMonths: number): string {
  if (activeMonths >= 10) return 'Active';
  if (activeMonths >= 6) return 'Regular';
  if (activeMonths >= 3) return 'Sporadic';
  return 'Minimal';
}

function activityQualifier(activeMonths: number): string {
  if (activeMonths >= 10) return 'Consistent activity';
  if (activeMonths >= 6) return 'Regular activity';
  if (activeMonths >= 3) return 'Sporadic activity';
  return 'Minimal activity';
}

export function buildComment(assessment: Assessment): string {
  const { signals: s, tier, score, summary, patterns } = assessment;

  const tierBadge = shieldsBadge(TIER_LABELS[tier], '', TIER_BADGE_COLORS[tier], 'for--the--badge');
  const scoreBadge = shieldsBadge('Trust_Score', `${score}%2F100`, TIER_BADGE_COLORS[tier]);

  const totalPRs = s.mergedPRs + s.closedPRs;
  const mergeRate = totalPRs > 0 ? Math.round((s.mergedPRs / totalPRs) * 100) : -1;
  const qualityValue = mergeRate >= 0 ? `${mergeRate}%` : 'N/A';
  const qualityDetail = totalPRs > 0
    ? `${s.mergedPRs} merged \u00b7 ${s.closedPRs} rejected`
    : 'No PRs yet';

  const lines: string[] = [
    COMMENT_MARKER,
    '',
    `### ${tierBadge}`,
    '',
    summary,
    '',
    `${scoreBadge} &nbsp; ${TIER_DOTS[tier]} ${tier === 'trusted' ? 'High' : tier === 'familiar' ? 'Medium' : 'Low'} confidence`,
    '',
    '---',
    '',
    '**Key Signals**',
    '',
    '| Account age | Contribution quality | Recent activity |',
    '|:---:|:---:|:---:|',
    `| **${ageText(s.accountAgeDays)}** | **${qualityValue}** | **${activityLabel(s.activeMonths)}** |`,
    `| ${ageQualifier(s.accountAgeDays)} | ${qualityDetail} | ${s.activeMonths}/${s.totalMonths} months |`,
  ];

  if (patterns.length > 0) {
    lines.push('', '---', '');
    for (const p of patterns) {
      const icon = p.severity === 'critical' ? '\ud83d\udea8' : '\u26a0\ufe0f';
      lines.push(`${icon} **${p.name}** -- ${p.detail}`);
    }
  }

  if (s.securityFiles.length > 0) {
    lines.push('');
    for (const f of s.securityFiles.slice(0, 3)) {
      lines.push(`\ud83d\udd12 Modifying security-critical file: \`${f}\``);
    }
    if (s.securityFiles.length > 3) {
      lines.push(`\ud83d\udd12 +${s.securityFiles.length - 3} more security-critical files`);
    }
  }

  lines.push(
    '',
    '| Repos | Followers | Unique mergers | 100+ \u2605 repos | Signed |',
    '|:---:|:---:|:---:|:---:|:---:|',
    `| **${s.publicRepos}** | **${s.followers}** | **${s.uniqueMergers}** | **${s.highStarRepos}** | **${s.commitsSigned ? '\u2713' : '\u2717'}** |`,
  );

  const details: string[] = [];
  if (s.profile.filledCount > 0) {
    const fields: string[] = [];
    if (s.profile.bio) fields.push('Bio');
    if (s.profile.company) fields.push('Company');
    if (s.profile.blog) fields.push('Blog');
    if (s.profile.twitter) fields.push('Twitter');
    if (s.profile.email) fields.push('Email');
    details.push(`- Profile: ${fields.join(', ')}`);
  }
  if (s.codeReviews > 0) details.push(`- Code reviews given: ${s.codeReviews}`);
  if (s.selfMergeCount > 0 || s.externalMergeCount > 0) {
    details.push(`- Self-merged: ${s.selfMergeCount} | Externally merged: ${s.externalMergeCount}`);
  }
  const repoTotal = s.repoMergedPRs + s.repoClosedPRs;
  if (repoTotal > 0) {
    details.push(`- This repo: ${s.repoMergedPRs} merged, ${s.repoClosedPRs} closed`);
  } else {
    details.push('- This repo: First-time contributor');
  }

  if (details.length > 0) {
    lines.push('', '<details>', '<summary>View full details</summary>', '', ...details, '', '</details>');
  }

  lines.push('', '<sub><a href="https://github.com/getagentseal/firstlook">firstlook</a></sub>');

  return lines.join('\n');
}
