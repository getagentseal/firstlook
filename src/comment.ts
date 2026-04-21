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

export function buildComment(assessment: Assessment): string {
  const { signals: s, tier, score, summary } = assessment;

  const rows = [
    `| **Account** | Created ${ageText(s.accountAgeDays)} ago | ${indicator(s.accountAgeDays >= 180)} |`,
    `| **Repos** | ${s.publicRepos} public | ${indicator(s.publicRepos >= 3)} |`,
    `| **Profile** | ${profileText(s.profile)} | ${indicator(s.profile.filledCount >= 2)} |`,
    `| **History** | ${s.mergedPRs} merged, ${s.closedPRs} rejected elsewhere | ${indicator(s.mergedPRs >= 3 && s.closedPRs <= s.mergedPRs)} |`,
    `| **Followers** | ${s.followers} | ${indicator(s.followers >= 3)} |`,
    `| **Signed** | ${s.commitsSigned ? 'Yes' : 'No'} | ${indicator(s.commitsSigned)} |`,
  ];

  if (s.securityFiles.length > 0) {
    const fileList = s.securityFiles.slice(0, 5).map(f => `\`${f}\``).join(', ');
    const extra = s.securityFiles.length > 5 ? ` (+${s.securityFiles.length - 5} more)` : '';
    rows.push(`| **Security paths** | ${fileList}${extra} | :rotating_light: |`);
  }

  return [
    COMMENT_MARKER,
    '### firstlook',
    '',
    '| Signal | Detail | |',
    '|--------|--------|---|',
    ...rows,
    '',
    `> **${TIER_LABELS[tier]}** (score: ${score}/100) -- ${summary}`,
    '',
    '<sub><a href="https://github.com/getagentseal/firstlook">firstlook</a></sub>',
  ].join('\n');
}
