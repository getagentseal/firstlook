import * as github from '@actions/github';
import { ContributorSignals } from './types';

type Octokit = ReturnType<typeof github.getOctokit>;

interface GraphQLResponse {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        weeks: Array<{
          contributionDays: Array<{
            contributionCount: number;
            date: string;
          }>;
        }>;
      };
      pullRequestReviewContributions: {
        totalCount: number;
      };
    };
    pullRequests: {
      nodes: Array<{
        mergedBy: { login: string } | null;
        repository: {
          nameWithOwner: string;
          stargazerCount: number;
          owner: { login: string };
        };
      }>;
    };
  };
}

const GRAPHQL_QUERY = `
  query($username: String!, $since: DateTime!) {
    user(login: $username) {
      contributionsCollection(from: $since) {
        contributionCalendar {
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
        pullRequestReviewContributions {
          totalCount
        }
      }
      pullRequests(first: 100, states: MERGED, orderBy: {field: CREATED_AT, direction: DESC}) {
        nodes {
          mergedBy {
            login
          }
          repository {
            nameWithOwner
            stargazerCount
            owner {
              login
            }
          }
        }
      }
    }
  }
`;

export async function gatherSignals(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  username: string,
  securityPaths: string[]
): Promise<ContributorSignals> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  const [userRes, mergedRes, closedRes, repoMergedRes, repoClosedRes, filesRes, commitsRes, graphql] =
    await Promise.all([
      octokit.rest.users.getByUsername({ username }),
      octokit.rest.search.issuesAndPullRequests({
        q: `author:${username} is:pr is:merged -repo:${owner}/${repo}`,
        per_page: 1,
      }),
      octokit.rest.search.issuesAndPullRequests({
        q: `author:${username} is:pr is:unmerged is:closed -repo:${owner}/${repo}`,
        per_page: 1,
      }),
      octokit.rest.search.issuesAndPullRequests({
        q: `author:${username} is:pr is:merged repo:${owner}/${repo}`,
        per_page: 1,
      }),
      octokit.rest.search.issuesAndPullRequests({
        q: `author:${username} is:pr is:unmerged is:closed repo:${owner}/${repo}`,
        per_page: 1,
      }),
      octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber }),
      octokit.rest.pulls.listCommits({ owner, repo, pull_number: prNumber }),
      octokit.graphql<GraphQLResponse>(GRAPHQL_QUERY, {
        username,
        since: since.toISOString(),
      }).catch(() => null),
    ]);

  const user = userRes.data;
  const created = new Date(user.created_at);
  const ageDays = Math.floor((Date.now() - created.getTime()) / 86_400_000);

  const profileFields = {
    bio: !!user.bio,
    company: !!user.company,
    blog: !!user.blog,
    twitter: !!user.twitter_username,
    email: !!user.email,
  };
  const filledCount = Object.values(profileFields).filter(Boolean).length;

  const allSigned =
    commitsRes.data.length > 0 &&
    commitsRes.data.every(c => c.commit.verification?.verified === true);

  const securityFiles = filesRes.data
    .map(f => f.filename)
    .filter(name => securityPaths.some(pattern => name.includes(pattern)));

  let activeMonths = 0;
  const totalMonths = 12;
  let uniqueMergers = 0;
  let selfMergeCount = 0;
  let externalMergeCount = 0;
  let highStarRepos = 0;
  let codeReviews = 0;

  if (graphql) {
    const days = graphql.user.contributionsCollection.contributionCalendar.weeks.flatMap(
      w => w.contributionDays,
    );
    const monthSet = new Set<string>();
    for (const day of days) {
      if (day.contributionCount > 0) {
        monthSet.add(day.date.substring(0, 7));
      }
    }
    activeMonths = monthSet.size;

    codeReviews =
      graphql.user.contributionsCollection.pullRequestReviewContributions.totalCount;

    const mergers = new Set<string>();
    const seenRepos = new Set<string>();
    for (const pr of graphql.user.pullRequests.nodes) {
      if (!pr.mergedBy) continue;
      const isOwnRepo = pr.repository.owner.login.toLowerCase() === username.toLowerCase();
      if (isOwnRepo) {
        selfMergeCount++;
      } else {
        externalMergeCount++;
        if (pr.mergedBy.login.toLowerCase() !== username.toLowerCase()) {
          mergers.add(pr.mergedBy.login);
        }
        if (!seenRepos.has(pr.repository.nameWithOwner)) {
          seenRepos.add(pr.repository.nameWithOwner);
          if (pr.repository.stargazerCount >= 100) {
            highStarRepos++;
          }
        }
      }
    }
    uniqueMergers = mergers.size;
  }

  return {
    username,
    avatarUrl: user.avatar_url,
    accountAgeDays: ageDays,
    accountCreated: user.created_at,
    publicRepos: user.public_repos,
    followers: user.followers,
    following: user.following,
    profile: { ...profileFields, filledCount },
    mergedPRs: mergedRes.data.total_count,
    closedPRs: closedRes.data.total_count,
    commitsSigned: allSigned,
    securityFiles,
    prFileCount: filesRes.data.length,
    activeMonths,
    totalMonths,
    uniqueMergers,
    selfMergeCount,
    externalMergeCount,
    highStarRepos,
    codeReviews,
    repoMergedPRs: repoMergedRes.data.total_count,
    repoClosedPRs: repoClosedRes.data.total_count,
  };
}
