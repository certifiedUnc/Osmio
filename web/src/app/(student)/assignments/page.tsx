"use client";

import { useCallback, useEffect, useState } from "react";

import { getMyAssignments, submitAssignment, type StudentAssignment } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AssignmentsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<StudentAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    getMyAssignments(token)
      .then(setItems)
      .catch(() => setError("Could not load your assignments."));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (!token) return null;
  if (error) return <main className="mx-auto max-w-3xl p-6 text-neutral-600">{error}</main>;
  if (!items) return <main className="mx-auto max-w-3xl p-6 text-sm text-neutral-400">Loading</main>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Assignments</h1>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">No assignments yet.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {items.map((a) => (
            <AssignmentCard key={a.id} assignment={a} token={token} onChange={load} />
          ))}
        </div>
      )}
    </main>
  );
}

function AssignmentCard({
  assignment,
  token,
  onChange,
}: {
  assignment: StudentAssignment;
  token: string;
  onChange: () => void;
}) {
  const sub = assignment.submission;
  const graded = sub != null && sub.score !== null;
  const [body, setBody] = useState(sub?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await submitAssignment(assignment.id, body.trim(), token);
      onChange();
    } catch {
      setErr("Could not submit. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-neutral-900">{assignment.title}</h2>
          <p className="text-xs text-neutral-500">
            Due {new Date(assignment.due_at).toLocaleString()} &middot; {assignment.max_score} points
          </p>
        </div>
        {graded && (
          <span className="shrink-0 rounded bg-green-100 px-2 py-0.5 text-sm font-medium text-green-800">
            {sub!.score} / {assignment.max_score}
          </span>
        )}
      </div>
      {assignment.description && (
        <p className="mt-2 text-sm text-neutral-600">{assignment.description}</p>
      )}

      {graded ? (
        <div className="mt-3 space-y-2 text-sm">
          {sub!.feedback && (
            <p className="rounded bg-neutral-50 p-2 text-neutral-700">
              <span className="font-medium">Feedback:</span> {sub!.feedback}
            </p>
          )}
          <p className="text-xs text-neutral-500">Your submission</p>
          <p className="whitespace-pre-wrap rounded border border-neutral-200 p-2 text-neutral-800">
            {sub!.body}
          </p>
        </div>
      ) : (
        <div className="mt-3">
          {sub && (
            <p className="mb-1 text-xs text-amber-700">Submitted, awaiting grade. You can resubmit below.</p>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Your answer"
            className="w-full resize-none rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !body.trim()}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {sub ? "Resubmit" : "Submit"}
            </button>
            {err && <span className="text-xs text-red-700">{err}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
