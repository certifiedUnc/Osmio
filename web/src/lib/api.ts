// Minimal typed client for the osmio FastAPI backend.
// Isomorphic: these run in server components and in the browser.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Types mirror api/app/schemas.py. IDs are integers; created_at is an ISO string.

export interface Segment {
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface Question {
  id: number;
  timestamp_ms: number;
  author: string;
  body: string;
  created_at: string;
}

export interface QuestionInput {
  timestamp_ms: number;
  body: string;
  author?: string; // backend defaults to "Anonymous"
}

export interface LectureSummary {
  id: number;
  title: string;
  week: number;
  duration_s: number;
  status: string;
  published: boolean;
}

export type Role = "student" | "instructor" | "admin";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
}

export interface AuthResult {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  created_at: string;
}

export interface Partner {
  id: number;
  name: string;
  status: string;
}

export interface ApiKey {
  id: number;
  label: string;
  key_prefix: string;
  revoked: boolean;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
}

export interface Enrollment {
  id: number;
  course_id: number;
  student_id: number;
  student: User;
}

export interface License {
  id: number;
  course_id: number;
}

export interface LectureDetail extends LectureSummary {
  stream_uid: string;
  segments: Segment[];
}

export interface Course {
  id: number;
  code: string;
  title: string;
  term: string;
  lectures: LectureSummary[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }

  if (!res.ok) {
    // FastAPI errors look like { "detail": "..." }.
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) {
        detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      /* body wasn't JSON */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function getCourses(): Promise<Course[]> {
  return request<Course[]>("/courses", { next: { revalidate: 300 } });
}

export function getLecture(id: number): Promise<LectureDetail> {
  return request<LectureDetail>(`/lectures/${id}`, { next: { revalidate: 60 } });
}

export function transcriptUrl(lectureId: number, format: "txt" | "pdf"): string {
  return `${API_BASE}/lectures/${lectureId}/transcript.${format}`;
}

export function getQuestions(lectureId: number): Promise<Question[]> {
  return request<Question[]>(`/lectures/${lectureId}/questions`, { cache: "no-store" });
}

export function askQuestion(lectureId: number, input: QuestionInput): Promise<Question> {
  return request<Question>(`/lectures/${lectureId}/questions`, {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify(input),
  });
}

// Merge a bearer token into a request, and never cache authed reads.
function authed(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    cache: "no-store",
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  };
}

// --- Auth ---
export function login(email: string, password: string): Promise<AuthResult> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function register(email: string, password: string, full_name: string): Promise<AuthResult> {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name }),
  });
}

export function getMe(token: string): Promise<User> {
  return request("/auth/me", authed(token));
}

// --- Student / shared ---
export function getMyCourses(token: string): Promise<Course[]> {
  return request("/me/courses", authed(token));
}

export function getAnnouncements(courseId: number, token: string): Promise<Announcement[]> {
  return request(`/courses/${courseId}/announcements`, authed(token));
}

// --- Instructor ---
export interface LectureCreate {
  course_id: number;
  title: string;
  week: number;
  duration_s: number;
  stream_uid?: string;
  scheduled_at?: string; // ISO datetime
}

export function createLecture(payload: LectureCreate, token: string): Promise<LectureSummary> {
  return request("/instructor/lectures", authed(token, { method: "POST", body: JSON.stringify(payload) }));
}

export function processLecture(lectureId: number, token: string): Promise<LectureSummary> {
  return request(`/instructor/lectures/${lectureId}/process`, authed(token, { method: "POST" }));
}

export function postAnnouncement(
  courseId: number,
  payload: { title: string; body: string },
  token: string,
): Promise<Announcement> {
  return request(
    `/instructor/courses/${courseId}/announcements`,
    authed(token, { method: "POST", body: JSON.stringify(payload) }),
  );
}

export interface CalendarEvent {
  type: "lecture" | "assignment" | "exam";
  id: number;
  title: string;
  at: string; // ISO datetime
  course_id: number;
  course_code: string;
  link: string | null;
  cancelled: boolean;
}

export function getCalendar(token: string): Promise<CalendarEvent[]> {
  return request("/me/calendar", authed(token));
}

export interface Assignment {
  id: number;
  course_id: number;
  title: string;
  description: string;
  due_at: string;
  max_score: number;
}

export interface Exam {
  id: number;
  course_id: number;
  title: string;
  starts_at: string;
  duration_min: number;
}

export interface Submission {
  id: number;
  assignment_id: number;
  student_id: number;
  student: User;
  body: string;
  submitted_at: string;
  score: number | null;
  feedback: string;
  graded_at: string | null;
}

export interface StudentAssignment {
  id: number;
  course_id: number;
  title: string;
  description: string;
  due_at: string;
  max_score: number;
  submission: Submission | null;
}

export function createAssignment(
  courseId: number,
  payload: { title: string; description: string; due_at: string },
  token: string,
): Promise<Assignment> {
  return request(
    `/instructor/courses/${courseId}/assignments`,
    authed(token, { method: "POST", body: JSON.stringify(payload) }),
  );
}

export function createExam(
  courseId: number,
  payload: { title: string; starts_at: string; duration_min: number },
  token: string,
): Promise<Exam> {
  return request(
    `/instructor/courses/${courseId}/exams`,
    authed(token, { method: "POST", body: JSON.stringify(payload) }),
  );
}

export function updateLecture(
  lectureId: number,
  payload: { scheduled_at?: string; cancelled?: boolean },
  token: string,
): Promise<LectureSummary> {
  return request(`/instructor/lectures/${lectureId}`, authed(token, { method: "PATCH", body: JSON.stringify(payload) }));
}

export function updateAssignment(
  assignmentId: number,
  payload: { title?: string; due_at?: string },
  token: string,
): Promise<Assignment> {
  return request(`/instructor/assignments/${assignmentId}`, authed(token, { method: "PATCH", body: JSON.stringify(payload) }));
}

export function deleteAssignment(assignmentId: number, token: string): Promise<void> {
  return request(`/instructor/assignments/${assignmentId}`, authed(token, { method: "DELETE" }));
}

export function updateExam(
  examId: number,
  payload: { title?: string; starts_at?: string },
  token: string,
): Promise<Exam> {
  return request(`/instructor/exams/${examId}`, authed(token, { method: "PATCH", body: JSON.stringify(payload) }));
}

export function deleteExam(examId: number, token: string): Promise<void> {
  return request(`/instructor/exams/${examId}`, authed(token, { method: "DELETE" }));
}

// --- Assignment submissions + grading ---
export function getMyAssignments(token: string): Promise<StudentAssignment[]> {
  return request("/me/assignments", authed(token));
}

export function getCourseAssignments(courseId: number, token: string): Promise<Assignment[]> {
  return request(`/courses/${courseId}/assignments`, authed(token));
}

export function submitAssignment(
  assignmentId: number,
  body: string,
  token: string,
): Promise<Submission> {
  return request(
    `/assignments/${assignmentId}/submissions`,
    authed(token, { method: "POST", body: JSON.stringify({ body }) }),
  );
}

export function getSubmissions(assignmentId: number, token: string): Promise<Submission[]> {
  return request(`/instructor/assignments/${assignmentId}/submissions`, authed(token));
}

export function gradeSubmission(
  submissionId: number,
  payload: { score: number; feedback: string },
  token: string,
): Promise<Submission> {
  return request(
    `/instructor/submissions/${submissionId}/grade`,
    authed(token, { method: "POST", body: JSON.stringify(payload) }),
  );
}

// --- Admin ---
export function adminListUsers(token: string): Promise<User[]> {
  return request("/admin/users", authed(token));
}

export function adminCreateUser(
  payload: { email: string; password: string; full_name: string; role: Role },
  token: string,
): Promise<User> {
  return request("/admin/users", authed(token, { method: "POST", body: JSON.stringify(payload) }));
}

export function adminSetRole(userId: number, role: Role, token: string): Promise<User> {
  return request(`/admin/users/${userId}`, authed(token, { method: "PATCH", body: JSON.stringify({ role }) }));
}

export function adminListCourses(token: string): Promise<Course[]> {
  return request("/admin/courses", authed(token));
}

export function adminCreateCourse(
  payload: { code: string; title: string; term: string; instructor_id?: number },
  token: string,
): Promise<Course> {
  return request("/admin/courses", authed(token, { method: "POST", body: JSON.stringify(payload) }));
}

export function adminListEnrollments(courseId: number, token: string): Promise<Enrollment[]> {
  return request(`/admin/courses/${courseId}/enrollments`, authed(token));
}

export function adminEnroll(
  payload: { course_id: number; student_id: number },
  token: string,
): Promise<Enrollment> {
  return request("/admin/enrollments", authed(token, { method: "POST", body: JSON.stringify(payload) }));
}

export function adminUnenroll(enrollmentId: number, token: string): Promise<void> {
  return request(`/admin/enrollments/${enrollmentId}`, authed(token, { method: "DELETE" }));
}

export function adminListPartners(token: string): Promise<Partner[]> {
  return request("/admin/partners", authed(token));
}

export function adminCreatePartner(name: string, token: string): Promise<Partner> {
  return request("/admin/partners", authed(token, { method: "POST", body: JSON.stringify({ name }) }));
}

export function adminListKeys(partnerId: number, token: string): Promise<ApiKey[]> {
  return request(`/admin/partners/${partnerId}/keys`, authed(token));
}

export function adminCreateKey(partnerId: number, label: string, token: string): Promise<ApiKeyCreated> {
  return request(`/admin/partners/${partnerId}/keys`, authed(token, { method: "POST", body: JSON.stringify({ label }) }));
}

export function adminRevokeKey(partnerId: number, keyId: number, token: string): Promise<ApiKey> {
  return request(`/admin/partners/${partnerId}/keys/${keyId}/revoke`, authed(token, { method: "POST" }));
}

export function adminListLicenses(partnerId: number, token: string): Promise<License[]> {
  return request(`/admin/partners/${partnerId}/licenses`, authed(token));
}

export function adminGrantLicense(partnerId: number, courseId: number, token: string): Promise<License> {
  return request(`/admin/partners/${partnerId}/licenses`, authed(token, { method: "POST", body: JSON.stringify({ course_id: courseId }) }));
}

/** 754000 -> "12:34", 3_725_000 -> "1:02:05". */
export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
