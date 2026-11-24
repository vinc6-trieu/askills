import YAML from "yaml";

export const repositoryName = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/;
export const gitSha = /^[0-9a-f]{40}$/;
export interface GitHubRepo {
  full_name: string;
  stargazers_count: number;
  license: { spdx_id: string } | null;
}

export interface GitEntry {
  path: string;
  sha: string;
  type: string;
  mode: string;
  size?: number;
}

export interface GitTree {
  sha: string;
  tree: GitEntry[];
  truncated: boolean;
}

export class GitHubRateLimit extends Error {}

export class GitHubSkills {
  private readonly trees = new Map<string, Promise<GitTree>>();
  private readonly rateLimits = new Map<string, GitHubRateLimit>();
  private readonly deadline = AbortSignal.timeout(45_000);

  constructor(private readonly request: typeof fetch = fetch) {}

  private async get<T>(endpoint: string): Promise<T> {
    const resource = endpoint.startsWith("/search/") ? "search" : "core";
    const limited = this.rateLimits.get(resource);
    if (limited) throw limited;
    this.deadline.throwIfAborted();
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "askills-discovery" };
    const token = process.env.ASKILLS_GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await this.request(`https://api.github.com${endpoint}`, {
      headers, redirect: "error", signal: AbortSignal.any([this.deadline, AbortSignal.timeout(8_000)])
    });
    if (!response.ok) {
      const error = new Error(`GitHub HTTP ${response.status} for ${endpoint}`);
      if (response.status === 429 || (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")))) {
        const limit = new GitHubRateLimit(`GitHub ${resource} rate limit reached. Retry later or set ASKILLS_GITHUB_TOKEN.`);
        this.rateLimits.set(resource, limit);
        throw limit;
      }
      throw error;
    }
    return await response.json() as T;
  }

  async search(): Promise<GitHubRepo[]> {
    const query = new URLSearchParams({
      q: "skills in:name is:public topic:agent-skills stars:>=50 archived:false fork:false", sort: "stars", order: "desc", per_page: "5"
    });
    const result = await this.get<{items: GitHubRepo[]; incomplete_results?: boolean}>(`/search/repositories?${query}`);
    if (result.incomplete_results) throw new Error("GitHub repository search was incomplete. Retry later.");
    return result.items.filter(repo => repositoryName.test(repo.full_name) && repo.stargazers_count >= 50);
  }

  async head(repo: string): Promise<string> {
    const { sha } = await this.get<{sha: string}>(`/repos/${repo}/commits/HEAD`);
    if (!gitSha.test(sha)) throw new Error(`Invalid commit returned for ${repo}`);
    return sha;
  }

  tree(repo: string, commit: string): Promise<GitTree> {
    const endpoint = `/repos/${repo}/git/trees/${commit}?recursive=1`;
    let result = this.trees.get(endpoint);
    if (!result) {
      result = this.get<GitTree>(endpoint).then(tree => {
        if (tree.truncated) throw new Error(`GitHub returned an incomplete tree for ${repo}@${commit}`);
        return tree;
      });
      this.trees.set(endpoint, result);
    }
    return result;
  }

  async descriptor(repo: string, commit: string, file: string) {
    const location = file.split("/").map(encodeURIComponent).join("/");
    const url = `https://raw.githubusercontent.com/${repo}/${commit}/${location}`;
    // Public immutable content uses the CDN and needs no API credentials.
    const response = await this.request(url, {
      redirect: "error", signal: AbortSignal.any([this.deadline, AbortSignal.timeout(8_000)])
    });
    if (!response.ok) throw new Error(`GitHub raw content HTTP ${response.status} for ${repo}/${file}`);
    const content = await response.text();
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
    if (!header || !content.slice(header[0].length).trim()) return;
    try {
      const fields = YAML.parse(header[1]);
      if (typeof fields?.name !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(fields.name)) return;
      if (typeof fields.description !== "string") return;
      const description = fields.description.replace(/[\p{C}\s]+/gu, " ").trim();
      if (description) return { name: fields.name, description };
    } catch {
      // A malformed remote candidate does not prevent checking other skills.
    }
  }
}
