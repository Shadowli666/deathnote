import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';

const app = express();
const port = Number(process.env.PORT || 3101);
const dataDir = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'deathnote.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

// Helper to simulate better-sqlite3's transaction method
db.transaction = (fn) => {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
};

const createSchema = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      firstName TEXT NOT NULL DEFAULT '',
      lastName TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT 'Sin Período',
      ordering INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      subjectId TEXT NOT NULL,
      corte INTEGER NOT NULL,
      name TEXT NOT NULL,
      percentage REAL NOT NULL,
      FOREIGN KEY(subjectId) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      studentId TEXT NOT NULL,
      subjectId TEXT NOT NULL,
      PRIMARY KEY(studentId, subjectId),
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(subjectId) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS grades (
      studentId TEXT NOT NULL,
      evaluationId TEXT NOT NULL,
      score REAL,
      observation TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(studentId, evaluationId),
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(evaluationId) REFERENCES evaluations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attendance (
      subjectId TEXT NOT NULL,
      studentId TEXT NOT NULL,
      date TEXT NOT NULL,
      present INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(subjectId, studentId, date),
      FOREIGN KEY(subjectId) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE
    );
  `);

  const studentColumns = db.prepare("PRAGMA table_info(students)").all();
  const hasFirstName = studentColumns.some((column) => column.name === 'firstName');
  
  if (!hasFirstName) {
    db.exec(`
      ALTER TABLE students ADD COLUMN firstName TEXT NOT NULL DEFAULT '';
      ALTER TABLE students ADD COLUMN lastName TEXT NOT NULL DEFAULT '';
    `);

    try {
      const hasName = studentColumns.some((column) => column.name === 'name');
      if (hasName) {
        const students = db.prepare("SELECT id, name FROM students").all();
        const updateStmt = db.prepare("UPDATE students SET firstName = ?, lastName = ? WHERE id = ?");
        
        db.transaction(() => {
          for (const s of students) {
            const parts = s.name.trim().split(/\s+/);
            let firstName = '';
            let lastName = '';
            
            if (parts.length === 1) {
              firstName = parts[0];
            } else if (parts.length === 2) {
              firstName = parts[0];
              lastName = parts[1];
            } else {
              lastName = parts.slice(-2).join(' ');
              firstName = parts.slice(0, -2).join(' ');
            }
            updateStmt.run(firstName, lastName, s.id);
          }
        })();
      }
    } catch (e) {
      console.error("Migration failed:", e);
    }
  }

  const gradeColumns = db.prepare('PRAGMA table_info(grades)').all();
  const hasObservation = gradeColumns.some((column) => column.name === 'observation');
  if (!hasObservation) {
    db.exec("ALTER TABLE grades ADD COLUMN observation TEXT NOT NULL DEFAULT ''");
  }
};

createSchema();

app.use(express.json({ limit: '10mb' }));

const createId = (prefix) => `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

const getCounts = () => ({
  subjects: db.prepare('SELECT COUNT(*) AS count FROM subjects').get().count,
  students: db.prepare('SELECT COUNT(*) AS count FROM students').get().count,
});

const getSubjectEvaluations = () => db.prepare('SELECT * FROM evaluations WHERE subjectId = ? ORDER BY corte ASC, name ASC');
const getSubjectStudents = () => db.prepare(`
  SELECT s.*
  FROM students s
  JOIN enrollments e ON s.id = e.studentId
  WHERE e.subjectId = ?
  ORDER BY s.lastName ASC, s.firstName ASC, s.id ASC
`);
const getSubjectGrades = () => db.prepare(`
  SELECT g.studentId, g.evaluationId, g.score, g.observation
  FROM grades g
  JOIN evaluations e ON g.evaluationId = e.id
  WHERE e.subjectId = ?
`);
const getSubjectAttendanceByDate = () => db.prepare(`
  SELECT subjectId, studentId, date, present
  FROM attendance
  WHERE subjectId = ? AND date = ?
`);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/subjects', (_req, res) => {
  const subjects = db.prepare('SELECT * FROM subjects ORDER BY ordering ASC').all();
  res.json(subjects);
});

app.post('/api/subjects', (req, res) => {
  const { name, period } = req.body ?? {};
  if (!name || !period) {
    res.status(400).json({ error: 'name and period are required' });
    return;
  }

  const maxOrder = db.prepare('SELECT COALESCE(MAX(ordering), -1) AS maxOrder FROM subjects').get().maxOrder;
  const subject = {
    id: createId('subject'),
    name,
    period,
    ordering: maxOrder + 1,
  };

  db.prepare('INSERT INTO subjects (id, name, period, ordering) VALUES (?, ?, ?, ?)')
    .run(subject.id, subject.name, subject.period, subject.ordering);

  res.status(201).json(subject);
});

app.put('/api/subjects/:id', (req, res) => {
  const { id } = req.params;
  const { name, period } = req.body ?? {};
  db.prepare('UPDATE subjects SET name = ?, period = ? WHERE id = ?').run(name, period, id);
  res.status(204).end();
});

app.put('/api/subjects/order', (req, res) => {
  const { subjects } = req.body ?? {};
  if (!Array.isArray(subjects)) {
    res.status(400).json({ error: 'subjects array is required' });
    return;
  }

  const updateOrder = db.transaction((items) => {
    const stmt = db.prepare('UPDATE subjects SET ordering = ? WHERE id = ?');
    items.forEach((subject, index) => {
      stmt.run(index, subject.id);
    });
  });

  updateOrder(subjects);
  res.status(204).end();
});

app.get('/api/subjects/:subjectId/students', (req, res) => {
  res.json(getSubjectStudents().all(req.params.subjectId));
});

app.get('/api/subjects/:subjectId/evaluations', (req, res) => {
  res.json(getSubjectEvaluations().all(req.params.subjectId));
});

app.get('/api/subjects/:subjectId/grades', (req, res) => {
  res.json(getSubjectGrades().all(req.params.subjectId));
});

const upsertStudents = db.prepare('INSERT INTO students (id, firstName, lastName) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET firstName = excluded.firstName, lastName = excluded.lastName');

app.put('/api/students/:originalId', (req, res) => {
  const { originalId } = req.params;
  const { id, firstName, lastName } = req.body ?? {};

  if (!id || !firstName) {
    res.status(400).json({ error: 'id and firstName are required' });
    return;
  }

  if (originalId !== id) {
    const exists = db.prepare('SELECT 1 FROM students WHERE id = ? LIMIT 1').get(id);
    if (exists) {
      res.json({ success: false });
      return;
    }
  }

  const updateStudent = db.transaction(() => {
    if (originalId === id) {
      db.prepare('UPDATE students SET firstName = ?, lastName = ? WHERE id = ?').run(firstName, lastName || '', originalId);
      return;
    }

    db.prepare('INSERT INTO students (id, firstName, lastName) VALUES (?, ?, ?)').run(id, firstName, lastName || '');
    db.prepare('UPDATE enrollments SET studentId = ? WHERE studentId = ?').run(id, originalId);
    db.prepare('UPDATE grades SET studentId = ? WHERE studentId = ?').run(id, originalId);
    db.prepare('UPDATE attendance SET studentId = ? WHERE studentId = ?').run(id, originalId);
    db.prepare('DELETE FROM students WHERE id = ?').run(originalId);
  });

  updateStudent();
  res.json({ success: true });
});

app.post('/api/subjects/:subjectId/enrollments/bulk', (req, res) => {
  const { subjectId } = req.params;
  const { students } = req.body ?? {};
  if (!Array.isArray(students)) {
    res.status(400).json({ error: 'students array is required' });
    return;
  }

  const enroll = db.transaction((items) => {
    const enrollStmt = db.prepare('INSERT OR IGNORE INTO enrollments (studentId, subjectId) VALUES (?, ?)');
    const gradeStmt = db.prepare("INSERT OR IGNORE INTO grades (studentId, evaluationId, score, observation) VALUES (?, ?, NULL, '')");
    const evaluations = getSubjectEvaluations().all(subjectId);

    for (const student of items) {
      upsertStudents.run(student.id, student.firstName, student.lastName || '');
      enrollStmt.run(student.id, subjectId);
      for (const evaluation of evaluations) {
        gradeStmt.run(student.id, evaluation.id);
      }
    }
  });

  enroll(students);
  res.status(204).end();
});

app.post('/api/subjects/:subjectId/enrollments', (req, res) => {
  const { subjectId } = req.params;
  const { student } = req.body ?? {};
  if (!student?.id || !student?.firstName) {
    res.status(400).json({ error: 'student is required' });
    return;
  }

  const exists = db.prepare('SELECT 1 FROM enrollments WHERE studentId = ? AND subjectId = ? LIMIT 1').get(student.id, subjectId);
  if (exists) {
    res.json({ success: false });
    return;
  }

  upsertStudents.run(student.id, student.firstName, student.lastName || '');
  db.prepare('INSERT INTO enrollments (studentId, subjectId) VALUES (?, ?)').run(student.id, subjectId);

  const gradeStmt = db.prepare("INSERT OR IGNORE INTO grades (studentId, evaluationId, score, observation) VALUES (?, ?, NULL, '')");
  for (const evaluation of getSubjectEvaluations().all(subjectId)) {
    gradeStmt.run(student.id, evaluation.id);
  }

  res.json({ success: true });
});

app.delete('/api/subjects/:subjectId/enrollments/:studentId', (req, res) => {
  const { subjectId, studentId } = req.params;
  const removeEnrollment = db.transaction(() => {
    db.prepare('DELETE FROM grades WHERE studentId = ? AND evaluationId IN (SELECT id FROM evaluations WHERE subjectId = ?)').run(studentId, subjectId);
    db.prepare('DELETE FROM enrollments WHERE studentId = ? AND subjectId = ?').run(studentId, subjectId);
  });

  removeEnrollment();
  res.status(204).end();
});

app.post('/api/subjects/:subjectId/evaluations', (req, res) => {
  const { subjectId } = req.params;
  const { corte, name, percentage } = req.body ?? {};
  const evaluation = { id: createId('eval'), subjectId, corte, name, percentage };

  const createEvaluation = db.transaction(() => {
    db.prepare('INSERT INTO evaluations (id, subjectId, corte, name, percentage) VALUES (?, ?, ?, ?, ?)')
      .run(evaluation.id, evaluation.subjectId, evaluation.corte, evaluation.name, evaluation.percentage);

    const gradeStmt = db.prepare("INSERT OR IGNORE INTO grades (studentId, evaluationId, score, observation) VALUES (?, ?, NULL, '')");
    for (const student of getSubjectStudents().all(subjectId)) {
      gradeStmt.run(student.id, evaluation.id);
    }
  });

  createEvaluation();
  res.status(201).json(evaluation);
});

app.put('/api/evaluations/:evaluationId', (req, res) => {
  const { evaluationId } = req.params;
  const { corte, name, percentage } = req.body ?? {};
  db.prepare('UPDATE evaluations SET corte = ?, name = ?, percentage = ? WHERE id = ?').run(corte, name, percentage, evaluationId);
  res.status(204).end();
});

app.delete('/api/evaluations/:evaluationId', (req, res) => {
  const { evaluationId } = req.params;
  const removeEvaluation = db.transaction(() => {
    db.prepare('DELETE FROM grades WHERE evaluationId = ?').run(evaluationId);
    db.prepare('DELETE FROM evaluations WHERE id = ?').run(evaluationId);
  });

  removeEvaluation();
  res.status(204).end();
});

app.put('/api/grades', (req, res) => {
  const { studentId, evaluationId, score, observation = '' } = req.body ?? {};
  db.prepare('UPDATE grades SET score = ?, observation = ? WHERE studentId = ? AND evaluationId = ?').run(score, observation, studentId, evaluationId);
  res.status(204).end();
});

app.get('/api/subjects/:subjectId/attendance', (req, res) => {
  const { subjectId } = req.params;
  const { date } = req.query;

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'valid date query param is required (YYYY-MM-DD)' });
    return;
  }

  const records = getSubjectAttendanceByDate().all(subjectId, date).map((record) => ({
    ...record,
    present: Boolean(record.present),
  }));

  res.json(records);
});

app.put('/api/subjects/:subjectId/attendance/:date', (req, res) => {
  const { subjectId, date } = req.params;
  const { entries } = req.body ?? {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'valid date param is required (YYYY-MM-DD)' });
    return;
  }

  if (!Array.isArray(entries)) {
    res.status(400).json({ error: 'entries array is required' });
    return;
  }

  const saveAttendance = db.transaction((items) => {
    db.prepare('DELETE FROM attendance WHERE subjectId = ? AND date = ?').run(subjectId, date);
    const insertStmt = db.prepare('INSERT INTO attendance (subjectId, studentId, date, present) VALUES (?, ?, ?, ?)');
    for (const entry of items) {
      if (!entry?.studentId) continue;
      insertStmt.run(subjectId, entry.studentId, date, entry.present ? 1 : 0);
    }
  });

  saveAttendance(entries);
  res.status(204).end();
});

app.post('/api/migrations/import-local-data', (req, res) => {
  const { students = [], subjects = [], evaluations = [], grades = [], enrollments = [] } = req.body ?? {};
  const counts = getCounts();

  if (counts.subjects > 0 || counts.students > 0) {
    res.json({ imported: false, skipped: true });
    return;
  }

  const importData = db.transaction(() => {
    for (const student of students) {
      if (student.firstName) {
        upsertStudents.run(student.id, student.firstName, student.lastName || '');
      } else if (student.name) {
        const parts = student.name.trim().split(/\s+/);
        let f = '', l = '';
        if (parts.length === 1) f = parts[0];
        else if (parts.length === 2) { f = parts[0]; l = parts[1]; }
        else { l = parts.slice(-2).join(' '); f = parts.slice(0, -2).join(' '); }
        upsertStudents.run(student.id, f, l);
      }
    }

    const insertSubject = db.prepare('INSERT OR IGNORE INTO subjects (id, name, period, ordering) VALUES (?, ?, ?, ?)');
    subjects.forEach((subject, index) => {
      insertSubject.run(subject.id, subject.name, subject.period || 'Sin Período', subject.ordering ?? index);
    });

    const insertEvaluation = db.prepare('INSERT OR IGNORE INTO evaluations (id, subjectId, corte, name, percentage) VALUES (?, ?, ?, ?, ?)');
    for (const evaluation of evaluations) {
      insertEvaluation.run(evaluation.id, evaluation.subjectId, evaluation.corte, evaluation.name, evaluation.percentage);
    }

    const insertEnrollment = db.prepare('INSERT OR IGNORE INTO enrollments (studentId, subjectId) VALUES (?, ?)');
    for (const enrollment of enrollments) {
      insertEnrollment.run(enrollment.studentId, enrollment.subjectId);
    }

    const insertGrade = db.prepare("INSERT OR IGNORE INTO grades (studentId, evaluationId, score, observation) VALUES (?, ?, ?, ?)");
    for (const grade of grades) {
      insertGrade.run(grade.studentId, grade.evaluationId, grade.score ?? null, typeof grade.observation === 'string' ? grade.observation : '');
    }
  });

  importData();
  res.json({ imported: true, skipped: false });
});

app.get('/api/export', (_req, res) => {
  db.exec('PRAGMA wal_checkpoint(FULL)');
  const fileBuffer = fs.readFileSync(dbPath);
  res.setHeader('Content-Type', 'application/x-sqlite3');
  res.setHeader('Content-Disposition', `attachment; filename="deathnote_${new Date().toISOString().split('T')[0]}.sqlite"`);
  res.send(fileBuffer);
});

app.listen(port, () => {
  console.log(`SQLite server running on http://127.0.0.1:${port}`);
});