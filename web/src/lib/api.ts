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
  has_recording: boolean;
  segments: Segment[];
}

export interface Course {
  id: number;
  code: string;
  title: string;
  term: string;
  instructor_name: string | null;
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

export function getLecture(id: number, token: string): Promise<LectureDetail> {
  return request<LectureDetail>(`/lectures/${id}`, authed(token, { cache: "no-store" }));
}

export async function downloadTranscript(
  lectureId: number,
  format: "txt" | "pdf",
  token: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/lectures/${lectureId}/transcript.${format}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(res.status, "Could not download the transcript.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lecture-${lectureId}-transcript.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function getQuestions(lectureId: number, token: string): Promise<Question[]> {
  return request<Question[]>(`/lectures/${lectureId}/questions`, authed(token, { cache: "no-store" }));
}

export function askQuestion(
  lectureId: number,
  input: QuestionInput,
  token: string,
): Promise<Question> {
  return request<Question>(
    `/lectures/${lectureId}/questions`,
    authed(token, { method: "POST", cache: "no-store", body: JSON.stringify(input) }),
  );
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

export interface LectureRecordMeta {
  course_id: number;
  title: string;
  week: number;
  duration_s: number;
}

export async function uploadLectureRecording(
  meta: LectureRecordMeta,
  recording: Blob,
  token: string,
): Promise<LectureSummary> {
  const form = new FormData();
  form.append("course_id", String(meta.course_id));
  form.append("title", meta.title);
  form.append("week", String(meta.week));
  form.append("duration_s", String(meta.duration_s));
  form.append("file", recording, "lecture.webm");
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/instructor/lectures/record`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* body wasn't JSON */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<LectureSummary>;
}

export function processLecture(lectureId: number, token: string): Promise<LectureSummary> {
  return request(`/instructor/lectures/${lectureId}/process`, authed(token, { method: "POST" }));
}

export async function fetchLectureRecording(lectureId: number, token: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/lectures/${lectureId}/recording`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
  if (!res.ok) throw new ApiError(res.status, "Could not load the recording.");
  return res.blob();
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
  end: string | null; // lectures/exams; assignments are deadlines
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

export interface SubmissionFile {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
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
  files: SubmissionFile[];
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

// Multipart upload: let the browser set the boundary, so no JSON Content-Type here.
export async function uploadSubmissionFile(
  assignmentId: number,
  file: File,
  token: string,
): Promise<SubmissionFile> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/assignments/${assignmentId}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* body wasn't JSON */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<SubmissionFile>;
}

export function deleteSubmissionFile(fileId: number, token: string): Promise<void> {
  return request(`/submission-files/${fileId}`, authed(token, { method: "DELETE" }));
}

// Files are private, so fetch with the token and stream to a download rather than a plain link.
export async function downloadSubmissionFile(
  fileId: number,
  filename: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/submission-files/${fileId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(res.status, "Could not download the file.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getSubmissions(assignmentId: number, token: string): Promise<Submission[]> {
  return request(`/instructor/assignments/${assignmentId}/submissions`, authed(token));
}

export function getCourseStudents(courseId: number, token: string): Promise<User[]> {
  return request(`/instructor/courses/${courseId}/students`, authed(token));
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

// --- Attendance (QR / code) ---
export interface AttendanceSession {
  id: number;
  lecture_id: number;
  code: string;
  expires_at: string;
}

export interface RosterStudent {
  id: number;
  full_name: string;
  email: string;
  present: boolean;
}

export interface AttendanceRoster {
  id: number;
  lecture_id: number;
  code: string;
  expires_at: string;
  students: RosterStudent[];
}

export function openAttendance(lectureId: number, token: string): Promise<AttendanceSession> {
  return request(`/instructor/lectures/${lectureId}/attendance`, authed(token, { method: "POST" }));
}

export function getAttendanceRoster(sessionId: number, token: string): Promise<AttendanceRoster> {
  return request(`/instructor/attendance/${sessionId}`, authed(token));
}

export function markAttendance(code: string, token: string): Promise<{ lecture_title: string }> {
  return request("/attendance/mark", authed(token, { method: "POST", body: JSON.stringify({ code }) }));
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

// --- Partner content API (external, API-key auth via X-API-Key) ---
export interface PartnerLecture {
  id: number;
  title: string;
  week: number;
  duration_s: number;
}

export interface PartnerCourse {
  id: number;
  code: string;
  title: string;
  term: string;
  lectures: PartnerLecture[];
}

export interface PartnerTranscript {
  lecture_id: number;
  title: string;
  segments: Segment[];
}

export interface PartnerUsageItem {
  method: string;
  path: string;
  status_code: number;
  created_at: string;
}

export interface PartnerUsage {
  partner: string;
  total: number;
  recent: PartnerUsageItem[];
}

function partnerRequest<T>(path: string, key: string): Promise<T> {
  return request<T>(`/partner/v1${path}`, { headers: { "X-API-Key": key }, cache: "no-store" });
}

export function partnerGetCourses(key: string): Promise<PartnerCourse[]> {
  return partnerRequest("/courses", key);
}

export function partnerGetTranscript(lectureId: number, key: string): Promise<PartnerTranscript> {
  return partnerRequest(`/lectures/${lectureId}/transcript`, key);
}

export function partnerGetUsage(key: string): Promise<PartnerUsage> {
  return partnerRequest("/usage", key);
}

export function adminPartnerUsage(partnerId: number, token: string): Promise<PartnerUsage> {
  return request(`/admin/partners/${partnerId}/usage`, authed(token));
}

// --- Analytics ---
export function recordEvent(lectureId: number, seconds: number, token: string): Promise<void> {
  return request(
    "/me/events",
    authed(token, { method: "POST", body: JSON.stringify({ lecture_id: lectureId, seconds }) }),
  );
}

export interface TopLecture {
  lecture_id: number;
  title: string;
  minutes: number;
}

export interface Analytics {
  active_minutes_week: number;
  active_students_week: number;
  total_minutes: number;
  partner_deliveries_week: number;
  top_lectures: TopLecture[];
}

export function adminAnalytics(token: string): Promise<Analytics> {
  return request("/admin/analytics", authed(token));
}

// --- Discussion forum ---
export interface DiscussionThread {
  id: number;
  title: string;
  author: string;
  reply_count: number;
  created_at: string;
}

export interface DiscussionReply {
  id: number;
  author: string;
  body: string;
  created_at: string;
}

export interface DiscussionThreadDetail {
  id: number;
  title: string;
  body: string;
  author: string;
  created_at: string;
  replies: DiscussionReply[];
}

export function getThreads(courseId: number, token: string): Promise<DiscussionThread[]> {
  return request(`/courses/${courseId}/threads`, authed(token));
}

export function createThread(
  courseId: number,
  payload: { title: string; body: string },
  token: string,
): Promise<DiscussionThreadDetail> {
  return request(`/courses/${courseId}/threads`, authed(token, { method: "POST", body: JSON.stringify(payload) }));
}

export function getThread(threadId: number, token: string): Promise<DiscussionThreadDetail> {
  return request(`/threads/${threadId}`, authed(token));
}

export function postReply(threadId: number, body: string, token: string): Promise<DiscussionThreadDetail> {
  return request(`/threads/${threadId}/replies`, authed(token, { method: "POST", body: JSON.stringify({ body }) }));
}

// --- Quizzes ---
export interface QuizSummary {
  id: number;
  title: string;
  question_count: number;
  total: number;
  best_score: number | null;
}

export interface QuizQuestionOut {
  id: number;
  prompt: string;
  options: string[];
}

export interface QuizDetail {
  id: number;
  title: string;
  questions: QuizQuestionOut[];
}

export interface QuestionResult {
  question_id: number;
  correct_index: number;
  chosen: number;
  is_correct: boolean;
}

export interface AttemptResult {
  score: number;
  total: number;
  results: QuestionResult[];
}

export function getQuizzes(courseId: number, token: string): Promise<QuizSummary[]> {
  return request(`/courses/${courseId}/quizzes`, authed(token));
}

export function getQuiz(quizId: number, token: string): Promise<QuizDetail> {
  return request(`/quizzes/${quizId}`, authed(token));
}

export function submitQuizAttempt(quizId: number, answers: number[], token: string): Promise<AttemptResult> {
  return request(`/quizzes/${quizId}/attempts`, authed(token, { method: "POST", body: JSON.stringify({ answers }) }));
}

export function createQuiz(
  courseId: number,
  payload: { title: string; questions: { prompt: string; options: string[]; correct_index: number }[] },
  token: string,
): Promise<QuizSummary> {
  return request(`/instructor/courses/${courseId}/quizzes`, authed(token, { method: "POST", body: JSON.stringify(payload) }));
}

export interface PartnerDailyUsage {
  date: string;
  count: number;
}

export function partnerGetDailyUsage(key: string): Promise<PartnerDailyUsage[]> {
  return partnerRequest("/usage/daily", key);
}
