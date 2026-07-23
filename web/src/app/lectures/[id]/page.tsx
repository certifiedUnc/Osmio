import Link from "next/link";

import { ApiError, getLecture, getQuestions } from "@/lib/api";
import LecturePlayer from "@/components/LecturePlayer";

// Next 16: params is async.
export default async function LecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lectureId = Number(id);
  if (!Number.isInteger(lectureId)) {
    return <main className="mx-auto max-w-2xl p-10 text-center text-neutral-600">Lecture not found.</main>;
  }

  let lecture;
  try {
    lecture = await getLecture(lectureId);
  } catch (err) {
    const msg =
      err instanceof ApiError && err.status === 404
        ? "Lecture not found."
        : "Could not load this lecture. Is the API running?";
    return <main className="mx-auto max-w-2xl p-10 text-center text-neutral-600">{msg}</main>;
  }

  // A questions hiccup should not blank the player and transcript.
  const questions = await getQuestions(lectureId).catch(() => []);

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-800">
        &larr; All lectures
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-neutral-900">{lecture.title}</h1>
      <p className="mb-4 text-sm text-neutral-500">Week {lecture.week}</p>
      <LecturePlayer lecture={lecture} initialQuestions={questions} />
    </main>
  );
}
