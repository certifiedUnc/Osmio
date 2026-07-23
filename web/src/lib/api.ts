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
  published: boolean;
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

  return res.json() as Promise<T>;
}

export function getCourses(): Promise<Course[]> {
  return request<Course[]>("/courses", { next: { revalidate: 300 } });
}

export function getLecture(id: number): Promise<LectureDetail> {
  return request<LectureDetail>(`/lectures/${id}`, { next: { revalidate: 60 } });
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
