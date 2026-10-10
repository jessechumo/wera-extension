import type { Applicant, JobDraft } from './types';

export interface WeraUser {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
}

/** A job as the Wera API returns it (the fields the extension uses). */
export interface WeraJob {
  id: number;
  company: string;
  title: string;
  url: string;
  location_raw: string | null;
  location_summary: string | null;
  stage: string;
  fit_score: number | null;
  estimated_score: number | null;
  verdict: string | null;
  reason: string | null;
  sponsorship: 'yes' | 'no' | 'unknown' | null;
  skills_matched: string[] | null;
  skills_missing: string[] | null;
  application_status: string | null;
  source: string;
}

export interface CoverLetter {
  body: string;
  edited: boolean;
}

export interface TailoredResume {
  headline: string;
  summary: string;
  skills: { group: string; items: string[] }[];
  experience: { title: string; company: string; dates: string; bullets: string[] }[];
  projects: { name: string; bullets: string[] }[];
  education: string[];
  changes: string[];
  missing_keywords: string[];
  dropped: string[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The Wera API, called from the side panel (an extension page with host
 * permission for the server, so no CORS) with the extension's bearer token.
 */
export class WeraApi {
  constructor(
    readonly server: string,
    private token = '',
    private readonly fetcher: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (init.body != null) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await this.fetcher(`${this.server}${path}`, { ...init, headers, credentials: 'omit' });
    } catch {
      throw new ApiError(0, `Can't reach Wera at ${this.server}`);
    }
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        msg = ((await res.json()) as { error?: string }).error ?? msg;
      } catch {
        // not JSON
      }
      throw new ApiError(res.status, msg);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async connect(email: string, password: string, name: string) {
    const r = await this.call<{ token: string; user: WeraUser }>('/api/ext/tokens', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    this.token = r.token;
    return r;
  }

  disconnect() {
    return this.call<void>('/api/ext/tokens/current', { method: 'DELETE' });
  }

  me() {
    return this.call<{ user: WeraUser }>('/api/auth/me');
  }

  lookup(url: string) {
    return this.call<{ job: WeraJob | null }>(`/api/ext/jobs/lookup?url=${encodeURIComponent(url)}`);
  }

  job(id: number) {
    return this.call<WeraJob>(`/api/jobs/${id}`);
  }

  extract(url: string, title: string, text: string) {
    return this.call<JobDraft & { is_job_posting: boolean }>('/api/ext/extract', {
      method: 'POST',
      body: JSON.stringify({ url, title, text }),
    });
  }

  addJob(d: JobDraft) {
    return this.call<WeraJob>('/api/ext/jobs', { method: 'POST', body: JSON.stringify(d) });
  }

  applicant() {
    return this.call<{ applicant: Applicant; saved: boolean }>('/api/applicant');
  }

  coverLetter(jobId: number) {
    return this.call<CoverLetter>(`/api/jobs/${jobId}/cover-letter`).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
  }

  writeCoverLetter(jobId: number, body?: string) {
    return this.call<CoverLetter>(`/api/jobs/${jobId}/cover-letter`, {
      method: body == null ? 'POST' : 'PUT',
      body: body == null ? undefined : JSON.stringify({ body }),
    });
  }

  tailorResume(jobId: number) {
    return this.call<TailoredResume>(`/api/jobs/${jobId}/tailored-resume`, { method: 'POST' });
  }

  answer(question: string, jobId: number | null, maxWords = 150) {
    return this.call<{ answer?: string; needs_input?: string }>('/api/ext/answer', {
      method: 'POST',
      body: JSON.stringify({ question, job_id: jobId ?? 0, max_words: maxWords }),
    });
  }

  /** The user's resume PDF as base64 (for attaching), or null if none. */
  async resumePdf(): Promise<{ name: string; base64: string } | null> {
    const res = await this.fetcher(`${this.server}/api/profile/resume/file?download=1`, {
      headers: { Authorization: `Bearer ${this.token}` },
      credentials: 'omit',
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new ApiError(res.status, 'could not load your resume');
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'resume.pdf';
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { name, base64: btoa(bin) };
  }

  dashboardUrl(path = '/') {
    return `${this.server}${path}`;
  }
}
