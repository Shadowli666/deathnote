import initSqlJs from 'sql.js';
import { AttendanceRecord, Enrollment, Evaluation, Grade, Student, Subject } from '../types';

const DB_KEY = 'sqlite-db';
const LEGACY_MIGRATED_KEY = 'data-migrated-to-sqlite';
const SERVER_MIGRATED_KEY = 'data-migrated-to-server';

type LegacyPayload = {
  students: Student[];
  subjects: Subject[];
  evaluations: Evaluation[];
  grades: Grade[];
  enrollments: Enrollment[];
};

const apiFetch = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

const parseResults = (stmt: any) => {
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
};

const hasLegacyJsonData = () => {
  return ['students', 'subjects', 'evaluations', 'grades', 'enrollments'].some((key) => {
    const rawValue = window.localStorage.getItem(key);
    return Boolean(rawValue && rawValue !== '[]');
  });
};

const loadLegacySqliteData = async (): Promise<LegacyPayload | null> => {
  const rawDatabase = window.localStorage.getItem(DB_KEY);
  if (!rawDatabase) {
    return null;
  }

  const SQL = await initSqlJs({
    locateFile: (file) => (file.endsWith('.wasm') ? '/sqljs/sql-wasm.wasm' : `/sqljs/${file}`),
  });

  const dbArray = rawDatabase.split(',').map((value) => Number.parseInt(value, 10));
  const database = new SQL.Database(new Uint8Array(dbArray));

  const subjectsColumns = parseResults(database.prepare('PRAGMA table_info(subjects)')).map((column: any) => column.name);
  const hasPeriod = subjectsColumns.includes('period');
  const hasOrdering = subjectsColumns.includes('ordering');

  const subjectQuery = hasPeriod && hasOrdering
    ? 'SELECT id, name, period, ordering FROM subjects ORDER BY ordering ASC'
    : 'SELECT id, name, "Sin Período" AS period, rowid - 1 AS ordering FROM subjects ORDER BY rowid ASC';

  const students = parseResults(database.prepare('SELECT id, name FROM students')) as Student[];
  const subjects = parseResults(database.prepare(subjectQuery)).map((subject: any) => ({
    ...subject,
    ordering: Number(subject.ordering ?? 0),
  })) as Subject[];
  const evaluations = parseResults(database.prepare('SELECT id, subjectId, corte, name, percentage FROM evaluations')) as Evaluation[];
  const enrollments = parseResults(database.prepare('SELECT studentId, subjectId FROM enrollments')) as Enrollment[];
  const gradesColumns = parseResults(database.prepare('PRAGMA table_info(grades)')).map((column: any) => column.name);
  const hasObservation = gradesColumns.includes('observation');
  const gradesQuery = hasObservation
    ? 'SELECT studentId, evaluationId, score, observation FROM grades'
    : 'SELECT studentId, evaluationId, score, "" AS observation FROM grades';

  const grades = parseResults(database.prepare(gradesQuery)).map((grade: any) => ({
    ...grade,
    score: grade.score === undefined ? null : grade.score,
    observation: typeof grade.observation === 'string' ? grade.observation : '',
  })) as Grade[];

  database.close();

  return { students, subjects, evaluations, grades, enrollments };
};

const loadLegacyJsonData = (): LegacyPayload | null => {
  if (!hasLegacyJsonData()) {
    return null;
  }

  const students = JSON.parse(window.localStorage.getItem('students') || '[]') as Student[];
  const oldSubjects = JSON.parse(window.localStorage.getItem('subjects') || '[]') as Array<Pick<Subject, 'id' | 'name'>>;
  const evaluations = JSON.parse(window.localStorage.getItem('evaluations') || '[]') as Evaluation[];
  const grades = JSON.parse(window.localStorage.getItem('grades') || '[]') as Grade[];
  const enrollments = JSON.parse(window.localStorage.getItem('enrollments') || '[]') as Enrollment[];

  const subjects = oldSubjects.map((subject, index) => ({
    ...subject,
    period: 'Sin Período',
    ordering: index,
  }));

  return {
    students,
    subjects,
    evaluations,
    grades: grades.map((grade) => ({
      ...grade,
      observation: typeof grade.observation === 'string' ? grade.observation : '',
    })),
    enrollments,
  };
};

const clearLegacyLocalData = () => {
  [DB_KEY, LEGACY_MIGRATED_KEY, 'students', 'subjects', 'evaluations', 'grades', 'enrollments'].forEach((key) => {
    window.localStorage.removeItem(key);
  });
  window.localStorage.setItem(SERVER_MIGRATED_KEY, 'true');
};

export const ensureServerDataMigration = async () => {
  if (window.localStorage.getItem(SERVER_MIGRATED_KEY) === 'true') {
    return;
  }

  const payload = (await loadLegacySqliteData()) ?? loadLegacyJsonData();
  if (!payload) {
    return;
  }

  const response = await apiFetch<{ imported: boolean; skipped: boolean }>('/api/migrations/import-local-data', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (response.imported) {
    clearLegacyLocalData();
    return;
  }

  if (response.skipped) {
    window.localStorage.setItem(SERVER_MIGRATED_KEY, 'true');
  }
};

export const exportDatabaseFile = async () => {
  const response = await fetch('/api/export');
  if (!response.ok) {
    throw new Error('No se pudo exportar la base de datos.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `deathnote_${new Date().toISOString().split('T')[0]}.sqlite`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const dbGetSubjects = () => apiFetch<Subject[]>('/api/subjects');

export const dbAddSubject = (name: string, period: string) => apiFetch<Subject>('/api/subjects', {
  method: 'POST',
  body: JSON.stringify({ name, period }),
});

export const dbUpdateSubject = (subject: Subject) => apiFetch<void>(`/api/subjects/${subject.id}`, {
  method: 'PUT',
  body: JSON.stringify({ name: subject.name, period: subject.period }),
});

export const dbUpdateSubjectsOrder = (subjects: Subject[]) => apiFetch<void>('/api/subjects/order', {
  method: 'PUT',
  body: JSON.stringify({ subjects }),
});

export const dbGetEnrolledStudentsForSubject = (subjectId: string) => apiFetch<Student[]>(`/api/subjects/${subjectId}/students`);

export const dbGetEvaluationsForSubject = (subjectId: string) => apiFetch<Evaluation[]>(`/api/subjects/${subjectId}/evaluations`);

export const dbGetGradesForSubject = (subjectId: string) => apiFetch<Grade[]>(`/api/subjects/${subjectId}/grades`);

export const dbUpdateStudent = async (originalId: string, updatedStudent: Student): Promise<boolean> => {
  const response = await apiFetch<{ success: boolean }>(`/api/students/${encodeURIComponent(originalId)}`, {
    method: 'PUT',
    body: JSON.stringify(updatedStudent),
  });

  return response.success;
};

export const dbEnrollStudents = (students: Student[], subjectId: string) => apiFetch<void>(`/api/subjects/${subjectId}/enrollments/bulk`, {
  method: 'POST',
  body: JSON.stringify({ students }),
});

export const dbEnrollStudent = async (student: Student, subjectId: string): Promise<boolean> => {
  const response = await apiFetch<{ success: boolean }>(`/api/subjects/${subjectId}/enrollments`, {
    method: 'POST',
    body: JSON.stringify({ student }),
  });

  return response.success;
};

export const dbUnenrollStudent = (studentId: string, subjectId: string) => apiFetch<void>(`/api/subjects/${subjectId}/enrollments/${encodeURIComponent(studentId)}`, {
  method: 'DELETE',
});

export const dbAddEvaluation = (evaluationData: Omit<Evaluation, 'id' | 'subjectId'>, subjectId: string) => apiFetch<Evaluation>(`/api/subjects/${subjectId}/evaluations`, {
  method: 'POST',
  body: JSON.stringify(evaluationData),
});

export const dbUpdateEvaluation = (evaluation: Evaluation) => apiFetch<void>(`/api/evaluations/${evaluation.id}`, {
  method: 'PUT',
  body: JSON.stringify({ corte: evaluation.corte, name: evaluation.name, percentage: evaluation.percentage }),
});

export const dbDeleteEvaluation = (evaluationId: string) => apiFetch<void>(`/api/evaluations/${evaluationId}`, {
  method: 'DELETE',
});

export const dbUpdateGrade = (studentId: string, evaluationId: string, score: number | null, observation: string) => apiFetch<void>('/api/grades', {
  method: 'PUT',
  body: JSON.stringify({ studentId, evaluationId, score, observation }),
});

export const dbGetAttendanceForSubject = (subjectId: string, date: string) => {
  const params = new URLSearchParams({ date });
  return apiFetch<AttendanceRecord[]>(`/api/subjects/${subjectId}/attendance?${params.toString()}`);
};

export const dbSaveAttendanceForSubject = (
  subjectId: string,
  date: string,
  entries: Array<{ studentId: string; present: boolean }>,
) => apiFetch<void>(`/api/subjects/${subjectId}/attendance/${encodeURIComponent(date)}`, {
  method: 'PUT',
  body: JSON.stringify({ entries }),
});
