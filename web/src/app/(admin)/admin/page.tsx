"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  adminAnalytics,
  adminCreateCourse,
  adminCreateKey,
  adminCreatePartner,
  adminCreateUser,
  adminEnroll,
  adminGrantLicense,
  adminListCourses,
  adminListEnrollments,
  adminListKeys,
  adminListLicenses,
  adminListPartners,
  adminListUsers,
  adminPartnerUsage,
  adminRevokeKey,
  adminSetRole,
  adminUnenroll,
  type Analytics,
  type ApiKey,
  type ApiKeyCreated,
  type Course,
  type Enrollment,
  type License,
  type Partner,
  type PartnerUsage,
  type Role,
  type User,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const ROLES: Role[] = ["student", "instructor", "admin"];
const input = "rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500";
const btn = "rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40";

function msg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200">
      <header className="border-b border-neutral-200 px-4 py-3">
        <h2 className="font-semibold text-neutral-900">{title}</h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function AdminPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadUsers = useCallback(() => {
    if (token) adminListUsers(token).then(setUsers).catch(() => setLoadError("Could not load users."));
  }, [token]);
  const loadCourses = useCallback(() => {
    if (token) adminListCourses(token).then(setCourses).catch(() => setLoadError("Could not load courses."));
  }, [token]);

  useEffect(() => {
    loadUsers();
    loadCourses();
  }, [loadUsers, loadCourses]);

  if (!token) return null;

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Admin</h1>
      {loadError && <p className="text-sm text-red-700">{loadError}</p>}
      <AnalyticsSection token={token} />
      <UsersSection token={token} users={users} reload={loadUsers} />
      <CoursesSection token={token} courses={courses} users={users} reload={loadCourses} />
      <EnrollmentSection token={token} courses={courses} students={users.filter((u) => u.role === "student")} />
      <PartnersSection token={token} courses={courses} />
    </main>
  );
}

function AnalyticsSection({ token }: { token: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminAnalytics(token).then(setData).catch(() => setError("Could not load analytics."));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card title="Analytics">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          North-star: weekly active learning minutes across the app and the partner API.
        </p>
        <button type="button" onClick={load} className="text-xs text-neutral-500 hover:underline">
          Refresh
        </button>
      </div>
      {!data ? (
        <p className="mt-3 text-sm text-neutral-400">Loading</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Active minutes this week", value: data.active_minutes_week.toLocaleString(), hint: "internal watch-time" },
              { label: "Active students this week", value: String(data.active_students_week), hint: "" },
              { label: "Partner deliveries this week", value: String(data.partner_deliveries_week), hint: "lectures served via API" },
              { label: "Total minutes", value: data.total_minutes.toLocaleString(), hint: "all time" },
            ].map((s) => (
              <div key={s.label} className="rounded border border-neutral-200 p-3">
                <div className="text-2xl font-semibold text-neutral-900">{s.value}</div>
                <div className="mt-1 text-xs text-neutral-500">{s.label}</div>
                {s.hint && <div className="text-[11px] text-neutral-400">{s.hint}</div>}
              </div>
            ))}
          </div>
          {data.top_lectures.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Most-watched, last 30 days
              </p>
              <ul className="mt-1 space-y-1">
                {data.top_lectures.map((l) => (
                  <li key={l.lecture_id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-neutral-800">{l.title}</span>
                    <span className="shrink-0 font-medium text-neutral-500">{l.minutes} min</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </Card>
  );
}

function UsersSection({ token, users, reload }: { token: string; users: User[]; reload: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await adminCreateUser({ email: email.trim(), password, full_name: name.trim(), role }, token);
      setEmail("");
      setName("");
      setPassword("");
      reload();
    } catch (err) {
      setError(msg(err, "Could not create user (email may already exist)."));
    }
  }

  async function changeRole(userId: number, next: Role) {
    setError(null);
    try {
      await adminSetRole(userId, next, token);
      reload();
    } catch (err) {
      setError(msg(err, "Could not change role."));
    }
  }

  return (
    <Card title="Users">
      <ul className="divide-y divide-neutral-100">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between py-2">
            <span className="text-sm text-neutral-800">
              {u.full_name || u.email}
              <span className="ml-2 text-neutral-400">{u.email}</span>
            </span>
            <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value as Role)} className={input}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </li>
        ))}
        {users.length === 0 && <li className="py-2 text-sm text-neutral-400">No users yet.</li>}
      </ul>
      <form onSubmit={create} className="mt-4 flex flex-wrap items-center gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required className={`${input} flex-1`} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={input} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required className={input} />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={input}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="submit" className={btn}>
          Add user
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </Card>
  );
}

function CoursesSection({
  token,
  courses,
  users,
  reload,
}: {
  token: string;
  courses: Course[];
  users: User[];
  reload: () => void;
}) {
  const instructors = users.filter((u) => u.role === "instructor");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");
  const [instructorId, setInstructorId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await adminCreateCourse(
        {
          code: code.trim(),
          title: title.trim(),
          term: term.trim(),
          instructor_id: instructorId === "" ? undefined : instructorId,
        },
        token,
      );
      setCode("");
      setTitle("");
      setTerm("");
      reload();
    } catch (err) {
      setError(msg(err, "Could not create course (code may already exist)."));
    }
  }

  return (
    <Card title="Courses">
      <ul className="divide-y divide-neutral-100">
        {courses.map((c) => (
          <li key={c.id} className="py-2 text-sm text-neutral-800">
            {c.code}: {c.title} <span className="text-neutral-400">{c.term}</span>
          </li>
        ))}
        {courses.length === 0 && <li className="py-2 text-sm text-neutral-400">No courses yet.</li>}
      </ul>
      <form onSubmit={create} className="mt-4 flex flex-wrap items-center gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" required className={input} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required className={`${input} flex-1`} />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term" className={input} />
        <select value={instructorId} onChange={(e) => setInstructorId(e.target.value === "" ? "" : Number(e.target.value))} className={input}>
          <option value="">Instructor</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.full_name || i.email}
            </option>
          ))}
        </select>
        <button type="submit" className={btn}>
          Add course
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </Card>
  );
}

function EnrollmentSection({
  token,
  courses,
  students,
}: {
  token: string;
  courses: Course[];
  students: User[];
}) {
  const [courseId, setCourseId] = useState<number | "">("");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [studentId, setStudentId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(() => {
    if (courseId === "") {
      setEnrollments([]);
      return;
    }
    // Only the most recent request applies its result, so switching courses fast can't
    // let a slower earlier response overwrite the current selection.
    const id = ++reqId.current;
    adminListEnrollments(courseId, token)
      .then((data) => {
        if (id === reqId.current) setEnrollments(data);
      })
      .catch(() => {});
  }, [courseId, token]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (courseId === "" || studentId === "") return;
    setError(null);
    try {
      await adminEnroll({ course_id: courseId, student_id: studentId }, token);
      setStudentId("");
      load();
    } catch (err) {
      setError(msg(err, "Could not enroll student."));
    }
  }

  async function remove(enrollmentId: number) {
    setError(null);
    try {
      await adminUnenroll(enrollmentId, token);
      load();
    } catch (err) {
      setError(msg(err, "Could not remove student."));
    }
  }

  return (
    <Card title="Enrollment">
      <select value={courseId} onChange={(e) => setCourseId(e.target.value === "" ? "" : Number(e.target.value))} className={input}>
        <option value="">Select a course</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code}: {c.title}
          </option>
        ))}
      </select>

      {courseId !== "" && (
        <div className="mt-4">
          <ul className="divide-y divide-neutral-100">
            {enrollments.map((en) => (
              <li key={en.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-neutral-800">{en.student.full_name || en.student.email}</span>
                <button type="button" onClick={() => remove(en.id)} className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              </li>
            ))}
            {enrollments.length === 0 && <li className="py-2 text-sm text-neutral-400">No students enrolled.</li>}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <select value={studentId} onChange={(e) => setStudentId(e.target.value === "" ? "" : Number(e.target.value))} className={`${input} flex-1`}>
              <option value="">Add a student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || s.email}
                </option>
              ))}
            </select>
            <button type="button" onClick={add} disabled={studentId === ""} className={btn}>
              Enroll
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </div>
      )}
    </Card>
  );
}

function PartnersSection({ token, courses }: { token: string; courses: Course[] }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminListPartners(token).then(setPartners).catch(() => setError("Could not load partners."));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await adminCreatePartner(name.trim(), token);
      setName("");
      load();
    } catch (err) {
      setError(msg(err, "Could not create partner."));
    }
  }

  return (
    <Card title="Partners">
      <div className="space-y-4">
        {partners.map((p) => (
          <PartnerRow key={p.id} partner={p} token={token} courses={courses} />
        ))}
        {partners.length === 0 && <p className="text-sm text-neutral-400">No partners yet.</p>}
      </div>
      <form onSubmit={create} className="mt-4 flex items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Partner name" className={`${input} flex-1`} />
        <button type="submit" className={btn}>
          Add partner
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </Card>
  );
}

function PartnerRow({ partner, token, courses }: { partner: Partner; token: string; courses: Course[] }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [usage, setUsage] = useState<PartnerUsage | null>(null);
  const [freshKey, setFreshKey] = useState<ApiKeyCreated | null>(null);
  const [courseId, setCourseId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const refreshUsage = useCallback(() => {
    adminPartnerUsage(partner.id, token).then(setUsage).catch(() => {});
  }, [partner.id, token]);

  const load = useCallback(() => {
    adminListKeys(partner.id, token).then(setKeys).catch(() => {});
    adminListLicenses(partner.id, token).then(setLicenses).catch(() => {});
    refreshUsage();
  }, [partner.id, token, refreshUsage]);

  useEffect(() => {
    load();
  }, [load]);

  const courseLabel = (id: number) => {
    const c = courses.find((x) => x.id === id);
    return c ? `${c.code}: ${c.title}` : `course ${id}`;
  };

  async function createKey() {
    setError(null);
    try {
      const created = await adminCreateKey(partner.id, "", token);
      setFreshKey(created);
      load();
    } catch (err) {
      setError(msg(err, "Could not create key."));
    }
  }

  async function revoke(keyId: number) {
    setError(null);
    try {
      await adminRevokeKey(partner.id, keyId, token);
      load();
    } catch (err) {
      setError(msg(err, "Could not revoke key."));
    }
  }

  async function grant() {
    if (courseId === "") return;
    setError(null);
    try {
      await adminGrantLicense(partner.id, courseId, token);
      setCourseId("");
      load();
    } catch (err) {
      setError(msg(err, "Could not grant license."));
    }
  }

  return (
    <div className="rounded border border-neutral-200 p-3">
      <p className="font-medium text-neutral-900">{partner.name}</p>

      <div className="mt-2 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">API keys</p>
        <ul className="mt-1 space-y-1">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between">
              <span className="font-mono text-xs text-neutral-600">
                {k.key_prefix}… {k.label && `(${k.label})`} {k.revoked && <span className="text-red-600">revoked</span>}
              </span>
              {!k.revoked && (
                <button type="button" onClick={() => revoke(k.id)} className="text-xs text-red-600 hover:underline">
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
        <button type="button" onClick={createKey} className="mt-2 rounded border border-neutral-300 px-2 py-0.5 text-xs">
          Create key
        </button>
        {freshKey && (
          <p className="mt-2 break-all rounded bg-amber-50 p-2 font-mono text-xs text-amber-800">
            Copy now, shown once: {freshKey.key}
          </p>
        )}
      </div>

      <div className="mt-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Licensed courses</p>
        <ul className="mt-1 space-y-0.5">
          {licenses.map((l) => (
            <li key={l.id} className="text-xs text-neutral-600">
              {courseLabel(l.course_id)}
            </li>
          ))}
          {licenses.length === 0 && <li className="text-xs text-neutral-400">None</li>}
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <select value={courseId} onChange={(e) => setCourseId(e.target.value === "" ? "" : Number(e.target.value))} className={input}>
            <option value="">Grant a course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}: {c.title}
              </option>
            ))}
          </select>
          <button type="button" disabled={courseId === ""} onClick={grant} className="rounded border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-40">
            Grant
          </button>
        </div>
      </div>

      <div className="mt-3 text-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">API usage</p>
          <button type="button" onClick={refreshUsage} className="text-xs text-neutral-500 hover:underline">
            Refresh
          </button>
        </div>
        <p className="mt-1 text-neutral-800">
          <span className="font-semibold">{usage?.total ?? 0}</span> metered calls
        </p>
        {usage && usage.recent.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {usage.recent.slice(0, 6).map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 font-mono text-xs text-neutral-500">
                <span className="truncate">
                  {r.method} {r.path.replace("/partner/v1", "")}
                </span>
                <span className="shrink-0 text-neutral-400">
                  {new Date(r.created_at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
