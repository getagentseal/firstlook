import { Assessment, ContributorSignals, Tier } from './types';

const TIER_LABELS: Record<Tier, string> = {
  trusted: 'Trusted',
  familiar: 'Familiar',
  caution: 'Review Suggested',
  unknown: 'Unknown Contributor',
};

export const COMMENT_MARKER = '<!-- firstlook-assessment -->';

function ageText(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    return months > 0 ? `${years}y ${months}mo` : `${years}y`;
  }
  if (days >= 30) return `${Math.floor(days / 30)} months`;
  return `${days} days`;
}

function indicator(good: boolean): string {
  return good ? ':white_check_mark:' : ':warning:';
}

function profileText(profile: ContributorSignals['profile']): string {
  const fields: string[] = [];
  if (profile.bio) fields.push('Bio');
  if (profile.company) fields.push('Company');
  if (profile.blog) fields.push('Blog');
  if (profile.twitter) fields.push('Twitter');
  if (profile.email) fields.push('Email');
  return fields.length > 0 ? fields.join(', ') : 'None provided';
}

function mergeQualityText(s: ContributorSignals): string {
  const parts: string[] = [];
  if (s.uniqueMergers > 0) parts.push(`${s.uniqueMergers} unique mergers`);
  if (s.highStarRepos > 0) parts.push(`${s.highStarRepos} repos with 100+ stars`);
  if (parts.length > 0) return parts.join(', ');
  if (s.selfMergeCount > 0) return `${s.selfMergeCount} self-merged only`;
  return 'No merge data';
}

export function buildComment(assessment: Assessment): string {
  const { signals: s, tier, score, summary, patterns } = assessment;

  const rows = [
    `| **Account** | Created ${ageText(s.accountAgeDays)} ago | ${indicator(s.accountAgeDays >= 180)} |`,
    `| **Repos** | ${s.publicRepos} public | ${indicator(s.publicRepos >= 3)} |`,
    `| **Profile** | ${profileText(s.profile)} | ${indicator(s.profile.filledCount >= 1)} |`,
    `| **History** | ${s.mergedPRs} merged, ${s.closedPRs} rejected elsewhere | ${indicator(s.mergedPRs >= 3 && s.closedPRs <= s.mergedPRs)} |`,
    `| **Merge quality** | ${mergeQualityText(s)} | ${indicator(s.uniqueMergers >= 1 || s.highStarRepos >= 1)} |`,
    `| **Activity** | ${s.activeMonths}/${s.totalMonths} months active | ${indicator(s.activeMonths >= 3)} |`,
    `| **Followers** | ${s.followers} | ${indicator(s.followers >= 3)} |`,
    `| **Signed** | ${s.commitsSigned ? 'Yes' : 'No'} | ${indicator(s.commitsSigned)} |`,
  ];

  if (s.securityFiles.length > 0) {
    const fileList = s.securityFiles.slice(0, 5).map(f => `\`${f}\``).join(', ');
    const extra = s.securityFiles.length > 5 ? ` (+${s.securityFiles.length - 5} more)` : '';
    rows.push(`| **Security paths** | ${fileList}${extra} | :rotating_light: |`);
  }

  const lines = [
    COMMENT_MARKER,
    '### firstlook',
    '',
    '| Signal | Detail | |',
    '|--------|--------|---|',
    ...rows,
  ];

  if (patterns.length > 0) {
    lines.push('');
    for (const p of patterns) {
      const icon = p.severity === 'critical' ? ':rotating_light:' : ':warning:';
      lines.push(`${icon} **${p.name}** -- ${p.detail}`);
    }
  }

  lines.push('', `> **${TIER_LABELS[tier]}** (score: ${score}/100) -- ${summary}`);

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
