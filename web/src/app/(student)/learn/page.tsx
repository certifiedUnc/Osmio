"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getAnnouncements, getMyCourses, type Announcement, type Course } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LearnPage() {
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
      <h1 className="text-2xl font-semibold text-neutral-900">Your courses</h1>
      {courses.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">You are not enrolled in any courses yet.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} token={token} />
          ))}
        </div>
      )}
    </main>
  );
}

function CourseCard({ course, token }: { course: Course; token: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    getAnnouncements(course.id, token)
      .then(setAnnouncements)
      .catch(() => {});
  }, [course.id, token]);

  const published = course.lectures.filter((l) => l.published);

  return (
    <section className="rounded-lg border border-neutral-200">
      <header className="border-b border-neutral-200 px-4 py-3">
        <h2 className="font-semibold text-neutral-900">
          {course.code}: {course.title}
        </h2>
        <p className="text-xs text-neutral-500">{course.term}</p>
      </header>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Lectures</h3>
          {published.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">No published lectures yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {published.map((l) => (
                <li key={l.id}>
                  <Link href={`/lectures/${l.id}`} className="text-sm text-sky-700 hover:underline">
                    Week {l.week}: {l.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Announcements
          </h3>
          {announcements.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">No announcements.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {announcements.map((a) => (
                <li key={a.id}>
                  <p className="text-sm font-medium text-neutral-900">{a.title}</p>
                  <p className="text-sm text-neutral-600">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
