"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  createAssignment,
  createExam,
  getCourseAssignments,
  getMyCourses,
  openAttendance,
  postAnnouncement,
  type Assignment,
  type Course,
  type LectureSummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

import { LectureRecorder } from "./LectureRecorder";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Recorded",
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
      <Link href="/teach" className="text-sm text-neutral-500 hover:text-neutral-800">
        &larr; Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Manage courses</h1>
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
  const [opError, setOpError] = useState<string | null>(null);

  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const [asgTitle, setAsgTitle] = useState("");
  const [asgDue, setAsgDue] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [examStart, setExamStart] = useState("");
  const [assessMsg, setAssessMsg] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const loadAssignments = useCallback(() => {
    getCourseAssignments(course.id, token)
      .then(setAssignments)
      .catch(() => {});
  }, [course.id, token]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const router = useRouter();
  async function takeAttendance(lectureId: number) {
    setOpError(null);
    try {
      const session = await openAttendance(lectureId, token);
      router.push(`/teach/attendance/${session.id}`);
    } catch {
      setOpError("Could not start attendance.");
    }
  }

  function openProcessing(lectureId: number) {
    router.push(`/teach/lectures/${lectureId}/processing`);
  }

  async function submitAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (posting || !annTitle.trim() || !annBody.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      await postAnnouncement(course.id, { title: annTitle.trim(), body: annBody.trim() }, token);
      setAnnTitle("");
      setAnnBody("");
      setPosted(true);
    } catch {
      setPostError("Could not post announcement. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  async function submitAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!asgTitle.trim() || !asgDue) return;
    setAssessMsg(null);
    try {
      await createAssignment(
        course.id,
        { title: asgTitle.trim(), description: "", due_at: new Date(asgDue).toISOString() },
        token,
      );
      setAsgTitle("");
      setAsgDue("");
      setAssessMsg("Assignment deadline added.");
      loadAssignments();
    } catch {
      setAssessMsg("Could not add assignment.");
    }
  }

  async function submitExam(e: React.FormEvent) {
    e.preventDefault();
    if (!examTitle.trim() || !examStart) return;
    setAssessMsg(null);
    try {
      await createExam(
        course.id,
        { title: examTitle.trim(), starts_at: new Date(examStart).toISOString(), duration_min: 60 },
        token,
      );
      setExamTitle("");
      setExamStart("");
      setAssessMsg("Exam added.");
    } catch {
      setAssessMsg("Could not add exam.");
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
        <h2 className="font-semibold text-neutral-900">
          {course.code}: {course.title}
        </h2>
        <Link href={`/teach/courses/${course.id}`} className="text-sm font-medium text-indigo-600 hover:underline">
          Open course page
        </Link>
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
                      onClick={() => openProcessing(l.id)}
                      className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white"
                    >
                      Process
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => takeAttendance(l.id)}
                    className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50"
                  >
                    Attendance
                  </button>
                </span>
              </li>
            ))}
            {lectures.length === 0 && (
              <li className="py-2 text-sm text-neutral-400">No lectures yet.</li>
            )}
          </ul>

          <LectureRecorder
            courseId={course.id}
            token={token}
            onCreated={(l) => {
              setLectures((prev) => [...prev, l]);
              openProcessing(l.id);
            }}
          />
          {opError && <p className="mt-2 text-xs text-red-700">{opError}</p>}
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
              {postError && <span className="text-xs text-red-700">{postError}</span>}
            </div>
          </form>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Assignments and exams
          </h3>
          {assignments.length > 0 && (
            <ul className="mt-2 divide-y divide-neutral-100">
              {assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-neutral-800">{a.title}</span>
                  <Link
                    href={`/teach/assignments/${a.id}`}
                    className="text-xs text-sky-700 hover:underline"
                  >
                    Grade
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={submitAssignment} className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={asgTitle}
              onChange={(e) => setAsgTitle(e.target.value)}
              placeholder="Assignment title"
              className="min-w-[10rem] flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
            />
            <input
              type="datetime-local"
              value={asgDue}
              onChange={(e) => setAsgDue(e.target.value)}
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={!asgTitle.trim() || !asgDue}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Add deadline
            </button>
          </form>
          <form onSubmit={submitExam} className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              placeholder="Exam title"
              className="min-w-[10rem] flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
            />
            <input
              type="datetime-local"
              value={examStart}
              onChange={(e) => setExamStart(e.target.value)}
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={!examTitle.trim() || !examStart}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Add exam
            </button>
          </form>
          {assessMsg && <p className="mt-2 text-xs text-neutral-600">{assessMsg}</p>}
        </div>
      </div>
    </section>
  );
}
