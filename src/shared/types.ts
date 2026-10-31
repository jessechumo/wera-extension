// Types shared by the side panel, the content script and the API client.
import type { Trap, TrapKind } from './traps';

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
/** A field of one job or one school in a repeating section ("Work Experience 2", "Education"). */
export type EntryPurpose =
  | 'exp_title' | 'exp_company' | 'exp_location' | 'exp_start' | 'exp_end' | 'exp_current' | 'exp_description'
  | 'edu_school' | 'edu_degree' | 'edu_major' | 'edu_start' | 'edu_end' | 'edu_gpa';

export type FieldPurpose =
  | ApplicantKey
  | EntryPurpose
  | 'full_name'
  | 'authorized_no_sponsorship'
  | 'location'
  | 'skills'
  | 'phone_type'
  | 'phone_code'
  | 'resume'
  | 'cover_letter'
  | 'question'
  | 'consent'
  /** Today's date, as a signed form asks for it ("Date", "Today's date"). */
  | 'today'
  /** "Have you worked for us before?": answered from the resume's employers. */
  | 'previously_employed'
  /** "Are you currently located in the US?": answered from the country in the details. */
  | 'in_country'
  /** "Are you a Singapore citizen?": answered from the citizenship in the details. */
  | 'citizen_of'
  /** "Do you consider yourself LGBTQ+?": answered from orientation and gender identity. */
  | 'lgbtq'
  /** Who referred the user: only they know (never asked of the AI). */
  | 'referral';

/** One job from the resume, as the Wera API sends it. */
export interface Experience {
  title: string;
  company: string;
  location?: string;
  /** "2022-01", or "2022" when only the year is known. */
  start?: string;
  end?: string;
  current: boolean;
  description?: string;
}

/** One school from the resume. */
export interface Education {
  school: string;
  degree?: string;
  /** high_school | associate | bachelor | master | doctorate */
  level?: string;
  major?: string;
  location?: string;
  start?: string;
  end?: string;
  gpa?: string;
}

/** Everything a form can be filled from: the details, plus the resume's jobs, schools and skills. */
export type Profile = Applicant & { experience?: Experience[]; education?: Education[]; skills?: string[] };

export type FillStatus = 'filled' | 'already' | 'review' | 'skipped' | 'question';

/** Where a proposed value came from. */
export type ValueSource = 'details' | 'profile' | 'saved' | 'ai' | 'resume' | 'letter' | 'you';

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
  /** In a job or school block: which one (0 is the first on the page). */
  entry?: number;
  /** The field is a trap: Wera leaves it to the user (see shared/traps.ts). */
  trap?: TrapKind;
  /** The form asks for the applicant's own words here: Wera does not draft it. */
  ownWords?: boolean;
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
  /** Sections with fewer job or school blocks than the resume has, and an Add button to make more. */
  adders?: { section: 'experience' | 'education'; missing: number; frameId?: number }[];
  /** The application system Wera recognized (Workday, Greenhouse...). */
  site?: string;
  /** Where the user is in a multi-step application. */
  step?: { name: string; index: number; total: number };
  /** The page wants something first (a Workday account): what to do. */
  gate?: string;
  /** What this page holds for catching or steering AI tools, for the user to see. */
  traps?: Trap[];
}

/** An answer the user gave before, as the content script matches it. */
export interface KnownAnswer {
  question: string;
  answer: string;
  /** The company whose form it was given on. */
  company?: string;
}

/** One field to fill, with the value the user approved. */
export interface FillItem {
  id: string;
  value: string;
  /** The field's label and kind when read: finds it again if the page re-rendered it (Ashby does after each answer). */
  label?: string;
  kind?: string;
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
  /** The application system Wera recognized, the step the user is on, and what it wants first (see PagePlan). */
  site?: string;
  step?: { name: string; index: number; total: number };
  gate?: string;
  /** What the page says to AI tools, hidden or not (taken out of text and draft). */
  traps?: Trap[];
}

/** A file to put in a form's upload (a PDF). */
export interface FileData {
  name: string;
  base64: string;
}

/** What the panel asks each frame to read the form with. */
export interface ScanRequest {
  profile: Profile;
  answers: KnownAnswer[];
  /** The resume file Wera can attach. */
  resumeName?: string;
  /** A cover letter is written for this job. */
  coverLetter?: boolean;
  /** The company the application is for (answers "Have you worked here before?"). */
  company?: string;
}

/** The values the panel asks a frame to fill. */
export interface ApplyRequest {
  items: FillItem[];
  resume?: FileData;
  coverLetter?: string;
  letterFile?: FileData;
  /** Pause between fields (ms). */
  pace?: number;
}

// Messages from the background (for the panel) to the page script in one frame.
export type ContentRequest =
  | { type: 'wera:read-page' }
  | { type: 'wera:scan'; req: ScanRequest }
  | { type: 'wera:apply'; req: ApplyRequest }
  | { type: 'wera:snapshot' }
  | { type: 'wera:add-entries'; section: 'experience' | 'education'; count: number }
  | { type: 'wera:next' }
  | { type: 'wera:highlight'; id: string }
  /** The choices custom dropdowns offer (opened and closed again), by field id. */
  | { type: 'wera:options'; ids: string[] }
  /** The frame's recent log (for Copy diagnostics). */
  | { type: 'wera:log' };

/** Sent by the page script to the side panel when the page changes on its own. */
export type ContentEvent =
  | { type: 'wera:form-changed'; fields: number }
  | { type: 'wera:fill-progress'; result: FillResult }
  | { type: 'wera:submitted' }
  | { type: 'wera:navigated'; url: string };
