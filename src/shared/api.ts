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

export interface Coverage {
  matched: string[];
  missing: string[];
  percent: number;
}

/** A resume document (the fields the extension uses; data stays opaque). */
export interface ResumeDoc {
  id: number;
  title: string;
  job_id: number | null;
  data: unknown;
  layout: unknown;
  fit: { one_page: boolean; summary: string } | null;
  notes: string[];
  coverage?: Coverage;
}

export interface JobKeywords {
  keywords: string[];
  coverage: Coverage | null;
  /** The base resume, or null when the user has not set one up. */
  resume_id: number | null;
}

/** A file to attach to an application form. */
export interface ResumeFile {
  name: string;
  base64: string;
  /** Which resume it is: tailored to this job, the main one, or the uploaded file. */
  kind: 'tailored' | 'base' | 'upload';
}

/** A company's H-1B filings and what it offered for titles like a job's. */
export interface JobH1B {
  matched: boolean;
  filings: number;
  new_hires: number;
  wage_median: number | null;
  similar: { title: string; wage_from: number | null; wage_to: number | null; level: string; place: string }[];
  similar_low: number | null;
  similar_high: number | null;
  level: string;
}

export type ApplicationStatus = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'not_interested';

/** POSTs that only compute something (nothing in Wera changes). */
const READ_ONLY = /^\/api\/(ext\/(extract|answer|tokens)|resumes\/preview)/;

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
    /** Called after a request that changed the user's data (the panel tells the dashboard). */
    private readonly onChange?: (path: string) => void,
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
    if (init.method && init.method !== 'GET' && !READ_ONLY.test(path)) this.onChange?.(path);
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

  /** Sets the job's status in the tracker (notes stay as they are). */
  setStatus(jobId: number, status: ApplicationStatus) {
    return this.call<WeraJob>(`/api/jobs/${jobId}/application`, { method: 'PUT', body: JSON.stringify({ status }) });
  }

  h1b(jobId: number) {
    return this.call<JobH1B>(`/api/jobs/${jobId}/h1b`);
  }

  jobKeywords(jobId: number) {
    return this.call<JobKeywords>(`/api/jobs/${jobId}/keywords`);
  }

  /** The resume tailored to this job, or null if there is none yet. */
  async jobResume(jobId: number): Promise<ResumeDoc | null> {
    try {
      return await this.call<ResumeDoc>(`/api/jobs/${jobId}/resume`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }

  tailorResume(jobId: number) {
    return this.call<{ resume: ResumeDoc; coverage_before: Coverage }>(`/api/jobs/${jobId}/resume`, { method: 'POST' });
  }

  /** Renders a resume document to SVG pages. */
  previewResume(doc: ResumeDoc) {
    return this.call<{ pages: string[]; measure: { pages: number; fill: number } }>('/api/resumes/preview', {
      method: 'POST',
      body: JSON.stringify({ data: doc.data, layout: doc.layout }),
    });
  }

  /**
   * Drafts an answer to an application question, for the saved job, or
   * else for the posting on the page (company, title, description).
   */
  answer(question: string, jobId: number | null, maxWords = 150, posting?: { company: string; title: string; description: string }) {
    return this.call<{ answer?: string; needs_input?: string }>('/api/ext/answer', {
      method: 'POST',
      body: JSON.stringify({
        question, job_id: jobId ?? 0, max_words: maxWords,
        ...(jobId == null && posting ? { company: posting.company, title: posting.title, description: posting.description.slice(0, 8000) } : {}),
      }),
    });
  }

  /** Saves application details (all of them; merge before calling). */
  saveApplicant(a: Applicant) {
    return this.call<{ applicant: Applicant; saved: boolean }>('/api/applicant', { method: 'PUT', body: JSON.stringify(a) });
  }

  private async download(path: string): Promise<{ name: string; base64: string } | null> {
    const res = await this.fetcher(`${this.server}${path}`, {
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

  /** A resume PDF by document id. */
  async resumeDocPdf(id: number) {
    return this.download(`/api/resumes/${id}/pdf?download=1`);
  }

  /**
   * The best resume to attach for a job: the copy tailored to it, else
   * the main resume, else the uploaded file; null if there is none.
   */
  async resumeFile(jobId: number | null): Promise<ResumeFile | null> {
    const { resumes } = await this.call<{ resumes: { id: number; job_id: number | null }[] }>('/api/resumes').catch(() => ({ resumes: [] }));
    const doc = (jobId != null && resumes.find((r) => r.job_id === jobId)) || resumes.find((r) => r.job_id == null);
    if (doc) {
      const f = await this.resumeDocPdf(doc.id).catch(() => null);
      if (f) return { ...f, kind: doc.job_id == null ? 'base' : 'tailored' };
    }
    const up = await this.download('/api/profile/resume/file?download=1');
    return up && { ...up, kind: 'upload' };
  }

  dashboardUrl(path = '/') {
    return `${this.server}${path}`;
  }
}
