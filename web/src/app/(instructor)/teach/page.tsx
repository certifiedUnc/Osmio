"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  createLecture,
  getLecture,
  getMyCourses,
  postAnnouncement,
  processLecture,
  type Course,
  type LectureSummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  normalizing: "Normalizing audio",
  transcribing: "Transcribing",
  review: "In review",
  published: "Published",
  failed: "Failed",
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "failed"
      ? "bg-red-100 text-red-700"
      : status === "published"
        ? "bg-green-100 text-green-700"
        : "bg-amber-100 text-amber-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${tone}`}>{STATUS_LABEL[status] ?? status}</span>
  );
}

export default function TeachPage() {
  const { token } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getMyCourses(token)
      .then(setCourses)
      .catch(() => setError("Could not load your courses."));
  }, [token]);

  if (!token) return null;
  if (error) return <main className="mx-auto max-w-3xl p-6 text-neutral-600">{error}</main>;
  if (!courses) return <main className="mx-auto max-w-3xl p-6 text-sm text-neutral-400">Loading</main>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Teaching</h1>
      {courses.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">You are not assigned to any courses.</p>
      ) : (
        <div className="mt-6 space-y-8">
          {courses.map((c) => (
            <CoursePanel key={c.id} course={c} token={token} />
          ))}
        </div>
      )}
    </main>
  );
}

function CoursePanel({ course, token }: { course: Course; token: string }) {
  const [lectures, setLectures] = useState<LectureSummary[]>(course.lectures);
  const [title, setTitle] = useState("");
  const [week, setWeek] = useState(1);
  const [duration, setDuration] = useState(60);
  const [adding, setAdding] = useState(false);

  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  const poll = useCallback((lectureId: number) => {
    let tries = 0;
    const tick = async () => {
      tries += 1;
      try {
        const l = await getLecture(lectureId);
        setLectures((prev) =>
          prev.map((x) => (x.id === lectureId ? { ...x, status: l.status, published: l.published } : x)),
        );
        if (l.status !== "published" && l.status !== "failed" && tries < 12) {
          setTimeout(tick, 1500);
        }
      } catch {
        /* stop polling */
      }
    };
    setTimeout(tick, 1000);
  }, []);

  async function addLecture(e: React.FormEvent) {
    e.preventDefault();
    if (adding || !title.trim()) return;
    setAdding(true);
    try {
      const l = await createLecture(
        { course_id: course.id, title: title.trim(), week, duration_s: duration },
        token,
      );
      setLectures((prev) => [...prev, l]);
      setTitle("");
    } finally {
      setAdding(false);
    }
  }

  async function runPipeline(lectureId: number) {
    setLectures((prev) =>
      prev.map((x) => (x.id === lectureId ? { ...x, status: "uploaded", published: false } : x)),
    );
    await processLecture(lectureId, token);
    poll(lectureId);
  }

  async function submitAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (posting || !annTitle.trim() || !annBody.trim()) return;
    setPosting(true);
    try {
      await postAnnouncement(course.id, { title: annTitle.trim(), body: annBody.trim() }, token);
      setAnnTitle("");
      setAnnBody("");
      setPosted(true);
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200">
      <header className="border-b border-neutral-200 px-4 py-3">
        <h2 className="font-semibold text-neutral-900">
          {course.code}: {course.title}
        </h2>
      </header>
      <div className="space-y-5 p-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Lectures</h3>
          <ul className="mt-2 divide-y divide-neutral-100">
            {lectures.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-neutral-800">
                  Week {l.week}: {l.title}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={l.status} />
                  {l.published ? (
                    <Link href={`/lectures/${l.id}`} className="text-xs text-sky-700 hover:underline">
                      View
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => runPipeline(l.id)}
                      className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white"
                    >
                      Process
                    </button>
                  )}
                </span>
              </li>
            ))}
            {lectures.length === 0 && (
              <li className="py-2 text-sm text-neutral-400">No lectures yet.</li>
            )}
          </ul>

          <form onSubmit={addLecture} className="mt-3 flex flex-wrap items-end gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Lecture title"
              className="min-w-[12rem] flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
            />
            <label className="text-xs text-neutral-500">
              Week
              <input
                type="number"
                min={1}
                value={week}
                onChange={(e) => setWeek(Number(e.target.value))}
                className="ml-1 w-16 rounded border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-neutral-500">
              Seconds
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="ml-1 w-20 rounded border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={adding || !title.trim()}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Add lecture
            </button>
          </form>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Post announcement
          </h3>
          <form onSubmit={submitAnnouncement} className="mt-2 space-y-2">
            <input
              value={annTitle}
              onChange={(e) => {
                setAnnTitle(e.target.value);
                setPosted(false);
              }}
              placeholder="Title"
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
            />
            <textarea
              value={annBody}
              onChange={(e) => {
                setAnnBody(e.target.value);
                setPosted(false);
              }}
              placeholder="Message"
              rows={2}
              className="w-full resize-none rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={posting || !annTitle.trim() || !annBody.trim()}
                className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Post
              </button>
              {posted && <span className="text-xs text-green-700">Posted.</span>}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
