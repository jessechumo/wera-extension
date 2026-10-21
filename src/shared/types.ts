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
  middle_name?: string;
  last_name: string;
  preferred_name: string;
  email: string;
  phone: string;
  address: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  linkedin: string;
  github: string;
  portfolio: string;
  twitter?: string;
  other_link?: string;
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
  willing_to_travel?: string;
  over_18?: string;
  citizenship?: string;
  visa_status?: string;
  security_clearance?: string;
  work_preference?: string;
  salary_expectation: string;
  start_date: string;
  notice_period?: string;
  languages?: string;
  how_heard: string;
  gender: string;
  pronouns: string;
  transgender?: string;
  sexual_orientation?: string;
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

/** Where a proposed value came from. */
export type ValueSource = 'details' | 'saved' | 'ai' | 'resume' | 'letter' | 'you';

/** How the panel groups a field. */
export type FieldGroup = 'details' | 'questions' | 'self_id' | 'documents' | 'consent' | 'other';

/** One field of the form page, with what Wera would enter (nothing is entered yet). */
export interface FieldPlan {
  id: string;
  label: string;
  purpose: FieldPurpose | null;
  /** The field's widget (see content/fields.ts FieldKind). */
  kind: string;
  /** Choices a dropdown, radio group or button pair offers. */
  options: string[];
  required: boolean;
  maxLength?: number;
  /** What the field shows now ('' when empty). */
  current: string;
  /** What Wera proposes ('' when it has nothing). */
  value: string;
  source: ValueSource | null;
  confidence?: 'high' | 'low';
  /** Why the value, or why there is none. */
  note?: string;
  group: FieldGroup;
}

/** The button that moves a multi-page application on. */
export interface NextButton {
  id: string;
  label: string;
  /** It submits the application: Wera never presses it. */
  final: boolean;
}

/** One page of a form, read but not changed. */
export interface PagePlan {
  fields: FieldPlan[];
  next: NextButton | null;
  /** Fields the site marks invalid (after a Next that did not go through). */
  errors: number;
}

/** An answer the user gave before, as the content script matches it. */
export interface KnownAnswer {
  question: string;
  answer: string;
}

/** One field to fill, with the value the user approved. */
export interface FillItem {
  id: string;
  value: string;
}

/** A field's value as the user left it (to learn answers from). */
export interface FieldSnapshot {
  id: string;
  label: string;
  purpose: FieldPurpose | null;
  kind: string;
  value: string;
}

/** One field's outcome after autofill. */
export interface FillResult {
  id: string;
  label: string;
  purpose: FieldPurpose | null;
  status: FillStatus;
  value?: string;
  note?: string;
  required: boolean;
  /** The field's character limit, when it has one (drafted answers fit it). */
  maxLength?: number;
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
  /** Changes when the page reloads or another page loads in the tab. */
  docId?: string;
  /** The page looks like a job posting or an application, even without job data. */
  jobLike?: boolean;
}

// Messages from the side panel to the content script.
export type ContentRequest =
  | { type: 'wera:read-page' }
  | { type: 'wera:scan'; applicant: Applicant; answers: KnownAnswer[]; resumeName?: string; coverLetter?: boolean }
  | { type: 'wera:apply'; items: FillItem[]; resume?: { name: string; base64: string }; coverLetter?: string; letterFile?: { name: string; base64: string }; pace?: number }
  | { type: 'wera:attach'; what: 'resume' | 'cover_letter'; file: { name: string; base64: string } }
  | { type: 'wera:snapshot' }
  | { type: 'wera:next' }
  | { type: 'wera:highlight'; id: string }
  | { type: 'wera:insert'; id: string; text: string }
  | { type: 'wera:insert-cover-letter'; text: string };

/** Sent by the page script to the side panel when the page changes on its own. */
export type ContentEvent =
  | { type: 'wera:form-changed'; fields: number }
  | { type: 'wera:fill-progress'; result: FillResult }
  | { type: 'wera:submitted' }
  | { type: 'wera:navigated'; url: string };
