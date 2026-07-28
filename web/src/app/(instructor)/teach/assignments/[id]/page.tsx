"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

import { downloadSubmissionFile, fmtFileSize, getSubmissions, gradeSubmission, type Submission } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function GradeAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const assignmentId = Number(id);
  const { token } = useAuth();
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    getSubmissions(assignmentId, token)
      .then(setSubs)
      .catch(() => setError("Could not load submissions."));
  }, [token, assignmentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!token) return null;
  if (error) return <main className="mx-auto max-w-3xl p-6 text-neutral-600">{error}</main>;
  if (!subs) return <main className="mx-auto max-w-3xl p-6 text-sm text-neutral-400">Loading</main>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/teach" className="text-sm text-neutral-500 hover:text-neutral-800">
        &larr; Teaching
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Submissions</h1>
      {subs.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">No submissions yet.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {subs.map((s) => (
            <SubmissionCard key={s.id} submission={s} token={token} onGraded={load} />
          ))}
        </div>
      )}
    </main>
  );
}

function SubmissionCard({
  submission,
  token,
  onGraded,
}: {
  submission: Submission;
  token: string;
  onGraded: () => void;
}) {
  const [score, setScore] = useState(submission.score !== null ? String(submission.score) : "");
  const [feedback, setFeedback] = useState(submission.feedback);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const n = Number(score);
    if (score === "" || Number.isNaN(n) || busy) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      await gradeSubmission(submission.id, { score: n, feedback: feedback.trim() }, token);
      setSaved(true);
      onGraded();
    } catch {
      setErr("Could not save the grade.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-neutral-900">
          {submission.student.full_name || submission.student.email}
        </p>
        <span className="text-xs text-neutral-500">
          submitted {new Date(submission.submitted_at).toLocaleString()}
        </span>
      </div>
      {submission.body && (
        <p className="mt-2 whitespace-pre-wrap rounded border border-neutral-200 p-2 text-sm text-neutral-800">
          {submission.body}
        </p>
      )}
      {submission.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {submission.files.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => downloadSubmissionFile(f.id, f.filename, token).catch(() => {})}
              className="inline-flex items-center gap-1.5 rounded border border-neutral-200 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-neutral-50"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
              {f.filename} <span className="text-neutral-400">({fmtFileSize(f.size_bytes)})</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-neutral-500">
          Score
          <input
            type="number"
            min={0}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="ml-1 w-20 rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <input
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Feedback (optional)"
          className="min-w-[12rem] flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || score === ""}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Save grade
        </button>
        {saved && <span className="text-xs text-green-700">Saved.</span>}
        {err && <span className="text-xs text-red-700">{err}</span>}
      </div>
    </section>
  );
}
