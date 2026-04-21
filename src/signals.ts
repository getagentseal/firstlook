import * as github from '@actions/github';
import { ContributorSignals } from './types';

type Octokit = ReturnType<typeof github.getOctokit>;

export async function gatherSignals(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  username: string,
  securityPaths: string[]
): Promise<ContributorSignals> {
  const [userRes, mergedRes, closedRes, filesRes, commitsRes] = await Promise.all([
    octokit.rest.users.getByUsername({ username }),
    octokit.rest.search.issuesAndPullRequests({
      q: `author:${username} is:pr is:merged -repo:${owner}/${repo}`,
      per_page: 1,
    }),
    octokit.rest.search.issuesAndPullRequests({
      q: `author:${username} is:pr is:unmerged is:closed -repo:${owner}/${repo}`,
      per_page: 1,
    }),
    octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber }),
    octokit.rest.pulls.listCommits({ owner, repo, pull_number: prNumber }),
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

  const allSigned = commitsRes.data.length > 0 &&
    commitsRes.data.every(c => c.commit.verification?.verified === true);

  const securityFiles = filesRes.data
    .map(f => f.filename)
    .filter(name => securityPaths.some(pattern => name.includes(pattern)));

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
  };
}
