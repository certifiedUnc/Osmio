import Link from "next/link";

import { getCourses } from "@/lib/api";

export default async function Home() {
  let courses;
  try {
    courses = await getCourses();
  } catch {
    return (
      <main className="mx-auto max-w-2xl p-10 text-center text-neutral-600">
        Could not reach the API. Start it with <code>docker compose up</code>.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">osmio</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Lectures with synchronized transcripts and timestamped questions.
      </p>

      <div className="mt-8 space-y-8">
        {courses.map((course) => (
          <section key={course.id}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {course.code} &middot; {course.title}
            </h2>
            <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200">
              {course.lectures.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/lectures/${l.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
                  >
                    <span className="text-sm text-neutral-900">
                      Week {l.week}: {l.title}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {Math.max(1, Math.round(l.duration_s / 60))} min
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
