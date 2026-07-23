"use client";

import { useState } from "react";

import { ApiError, askQuestion, formatTimestamp, type Question } from "@/lib/api";

type QuestionItem = Question & { pending?: boolean };

interface Props {
  lectureId: number;
  initialQuestions: Question[];
  currentTimeMs: number;
  onSeek: (ms: number) => void;
}

// Keep the list ordered by timestamp_ms to match the API's ordering.
function insertSorted(list: QuestionItem[], q: QuestionItem): QuestionItem[] {
  return [...list, q].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
}

export default function QnaPanel({ lectureId, initialQuestions, currentTimeMs, onSeek }: Props) {
  const [questions, setQuestions] = useState<QuestionItem[]>(initialQuestions);
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || submitting) return;

    const timestamp_ms = currentTimeMs;
    const name = author.trim() || "Anonymous";
    const tempId = -Date.now(); // negative id can't collide with real rows

    const optimistic: QuestionItem = {
      id: tempId,
      timestamp_ms,
      author: name,
      body: trimmed,
      created_at: new Date().toISOString(),
      pending: true,
    };

    setQuestions((prev) => insertSorted(prev, optimistic));
    setBody("");
    setError(null);
    setSubmitting(true);

    try {
      const saved = await askQuestion(lectureId, { timestamp_ms, body: trimmed, author: name });
      setQuestions((prev) => insertSorted(prev.filter((q) => q.id !== tempId), saved));
    } catch (err) {
      // Roll back and restore the draft, but only if the user hasn't started a new one.
      setQuestions((prev) => prev.filter((q) => q.id !== tempId));
      setBody((current) => (current.length === 0 ? trimmed : current));
      setError(err instanceof ApiError ? err.message : "Could not post your question.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label="Questions" className="flex h-full min-h-0 flex-col rounded-lg border border-neutral-200">
      <header className="border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">Questions</h2>
      </header>

      <ol className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto">
        {questions.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-neutral-500">
            No questions yet. Ask about this moment in the lecture.
          </li>
        ) : (
          questions.map((q) => (
            <li key={q.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => onSeek(q.timestamp_ms)}
                  title="Jump to this moment"
                  className="mt-0.5 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs tabular-nums text-neutral-700 hover:bg-neutral-200"
                >
                  {formatTimestamp(q.timestamp_ms)}
                </button>
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap break-words text-sm text-neutral-900">{q.body}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {q.author}
                    {q.pending && <span className="ml-2 italic text-neutral-400">posting</span>}
                  </p>
                </div>
              </div>
            </li>
          ))
        )}
      </ol>

      <form onSubmit={handleSubmit} className="border-t border-neutral-200 p-3">
        {error && (
          <p role="alert" className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
            {error}
          </p>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit(e as unknown as React.FormEvent);
          }}
          placeholder="Ask a question about this point in the lecture"
          rows={2}
          className="w-full resize-none rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
        />
        <div className="mt-2 flex items-center gap-2">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name (optional)"
            className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
          />
          <button
            type="submit"
            disabled={submitting || body.trim().length === 0}
            className="shrink-0 rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {submitting ? "Posting" : `Ask at ${formatTimestamp(currentTimeMs)}`}
          </button>
        </div>
      </form>
    </section>
  );
}
