// Types shared by the side panel, the content script and the API client.

/** A job as read off a page, edited by the user before saving. */
export interface JobDraft {
  url: string;
  company: string;
  title: string;
  location: string;
  work_mode: '' | 'remote' | 'hybrid' | 'onsite';
  employment_type: string;
  department: string;
  salary: string;
  industry: string;
  description: string;
  /** Where the fields came from. */
  source: 'page-data' | 'ai' | 'manual';
}

/** Application details (mirrors the API's applicant). */
export interface Applicant {
  first_name: string;
  last_name: string;
  preferred_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  linkedin: string;
  github: string;
  portfolio: string;
  current_company: string;
  current_title: string;
  years_experience: string;
  school: string;
  degree: string;
  major: string;
  graduation_year: string;
  gpa: string;
  authorized_to_work: string;
  needs_sponsorship: string;
  willing_to_relocate: string;
  salary_expectation: string;
  start_date: string;
  how_heard: string;
  gender: string;
  pronouns: string;
  race: string;
  hispanic: string;
  veteran: string;
  disability: string;
}

export type ApplicantKey = keyof Applicant;

/** What a form field is for. */
export type FieldPurpose =
  | ApplicantKey
  | 'full_name'
  | 'authorized_no_sponsorship'
  | 'location'
  | 'resume'
  | 'cover_letter'
  | 'question'
  | 'consent';

export type FillStatus = 'filled' | 'already' | 'review' | 'skipped' | 'question';

/** One field's outcome after autofill. */
export interface FillResult {
  id: string;
  label: string;
  purpose: FieldPurpose | null;
  status: FillStatus;
  value?: string;
  note?: string;
  required: boolean;
}

/** What the content script reports about the page. */
export interface PageInfo {
  url: string;
  title: string;
  text: string;
  draft: JobDraft | null;
  hasForm: boolean;
  /** The page says the application went through ("Thank you for applying"). */
  submitted?: boolean;
  /** Other sites whose embedded frames look like an application form (Wera needs access to fill them). */
  frameOrigins?: string[];
}

// Messages from the side panel to the content script.
export type ContentRequest =
  | { type: 'wera:read-page' }
  | { type: 'wera:fill'; applicant: Applicant; resume?: { name: string; base64: string }; coverLetter?: string }
  | { type: 'wera:insert'; id: string; text: string }
  | { type: 'wera:insert-cover-letter'; text: string };

/** Sent by the page script to the side panel when the page changes on its own. */
export type ContentEvent =
  | { type: 'wera:form-changed'; fields: number }
  | { type: 'wera:submitted' };
