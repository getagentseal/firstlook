export interface ContributorSignals {
  username: string;
  avatarUrl: string;
  accountAgeDays: number;
  accountCreated: string;
  publicRepos: number;
  followers: number;
  following: number;
  profile: {
    bio: boolean;
    company: boolean;
    blog: boolean;
    twitter: boolean;
    email: boolean;
    filledCount: number;
  };
  mergedPRs: number;
  closedPRs: number;
  commitsSigned: boolean;
  securityFiles: string[];
  prFileCount: number;
  activeMonths: number;
  totalMonths: number;
  uniqueMergers: number;
  selfMergeCount: number;
  externalMergeCount: number;
  highStarRepos: number;
  codeReviews: number;
  repoMergedPRs: number;
  repoClosedPRs: number;
}

export type Tier = 'trusted' | 'familiar' | 'caution' | 'unknown';

export interface SuspiciousPattern {
  name: string;
  severity: 'critical' | 'warning';
  detail: string;
}

export interface Assessment {
  tier: Tier;
  score: number;
  signals: ContributorSignals;
  patterns: SuspiciousPattern[];
  summary: string;
}
