import React, { useState, useMemo, useEffect } from 'react';
import { Student, Subject, Evaluation, Grade, Enrollment } from './types';
import SubjectView from './components/SubjectView';
import Modal from './components/Modal';
import { PlusCircleIcon, BookOpenIcon, PencilIcon } from './components/Icons';

// This will be defined in index.html by sql.js
declare function initSqlJs(config: any): Promise<any>;

// ============== DB LOGIC START ==============
let db: any = null;
const DB_KEY = 'sqlite-db';
const MIGRATED_KEY = 'data-migrated-to-sqlite';

const createSchema = () => {
  if (!db) return;
  db.run(`CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, name TEXT, email TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, name TEXT, period TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS evaluations (id TEXT PRIMARY KEY, subjectId TEXT, corte INTEGER, name TEXT, percentage REAL, FOREIGN KEY(subjectId) REFERENCES subjects(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS enrollments (studentId TEXT, subjectId TEXT, PRIMARY KEY(studentId, subjectId), FOREIGN KEY(studentId) REFERENCES students(id), FOREIGN KEY(subjectId) REFERENCES subjects(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS grades (studentId TEXT, evaluationId TEXT, score REAL, PRIMARY KEY(studentId, evaluationId), FOREIGN KEY(studentId) REFERENCES students(id), FOREIGN KEY(evaluationId) REFERENCES evaluations(id))`);
};

const migrateFromLocalStorage = () => {
  console.log("Checking for data to migrate from localStorage...");
  try {
    const oldStudents = JSON.parse(window.localStorage.getItem('students') || '[]') as Student[];
    const oldSubjects = JSON.parse(window.localStorage.getItem('subjects') || '[]') as Omit<Subject, 'period'>[];
    const oldEvaluations = JSON.parse(window.localStorage.getItem('evaluations') || '[]') as Evaluation[];
    const oldGrades = JSON.parse(window.localStorage.getItem('grades') || '[]') as Grade[];
    const oldEnrollments = JSON.parse(window.localStorage.getItem('enrollments') || '[]') as Enrollment[];
    
    if (oldSubjects.length === 0 && oldStudents.length === 0) {
        console.log("No data to migrate.");
        window.localStorage.setItem(MIGRATED_KEY, 'true');
        return;
    }

    console.log("Migrating data...");
    db.exec("BEGIN TRANSACTION;");
    oldStudents.forEach((s) => db.run("INSERT OR IGNORE INTO students VALUES (?, ?, ?)", [s.id, s.name, s.email]));
    oldSubjects.forEach((s) => db.run("INSERT OR IGNORE INTO subjects VALUES (?, ?, ?)", [s.id, s.name, 'Sin Período']));
    oldEvaluations.forEach((e) => db.run("INSERT OR IGNORE INTO evaluations VALUES (?, ?, ?, ?, ?)", [e.id, e.subjectId, e.corte, e.name, e.percentage]));
    oldEnrollments.forEach((e) => db.run("INSERT OR IGNORE INTO enrollments VALUES (?, ?)", [e.studentId, e.subjectId]));
    oldGrades.forEach((g) => db.run("INSERT OR IGNORE INTO grades VALUES (?, ?, ?)", [g.studentId, g.evaluationId, g.score]));
    db.exec("COMMIT;");
    
    console.log("Migration complete.");
    window.localStorage.setItem(MIGRATED_KEY, 'true');
    ['students', 'subjects', 'evaluations', 'grades', 'enrollments'].forEach(key => window.localStorage.removeItem(key));
  } catch (e) {
    console.error("Migration failed:", e);
    db.exec("ROLLBACK;");
  }
};

const initDB = async () => {
  if (db) return;
  const SQL = await initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}` });
  const dbFromStorage = window.localStorage.getItem(DB_KEY);
  if (dbFromStorage) {
    const dbArray = dbFromStorage.split(',').map(s => parseInt(s, 10));
    db = new SQL.Database(new Uint8Array(dbArray));
  } else {
    db = new SQL.Database();
  }
  
  createSchema();
  // Simple migration for adding period column if it doesn't exist
  try {
    db.exec("SELECT period FROM subjects LIMIT 1");
  } catch (e) {
      console.log("Applying migration: Adding 'period' column to subjects.");
      db.exec("ALTER TABLE subjects ADD COLUMN period TEXT NOT NULL DEFAULT 'Sin Período'");
      saveDB();
  }

  if (!window.localStorage.getItem(MIGRATED_KEY)) {
      migrateFromLocalStorage();
  }
};

const saveDB = () => {
  const data = db.export();
  window.localStorage.setItem(DB_KEY, data.toString());
};

const parseResults = (stmt: any) => {
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

const dbGetSubjects = async (): Promise<Subject[]> => { await initDB(); return parseResults(db.prepare("SELECT * FROM subjects")) as Subject[]; };
const dbAddSubject = async (name: string, period: string): Promise<Subject> => { await initDB(); const s = { id: `subject-${Date.now()}`, name, period }; db.run("INSERT INTO subjects (id, name, period) VALUES (?, ?, ?)", [s.id, s.name, s.period]); saveDB(); return s; };
const dbUpdateSubject = async (subject: Subject): Promise<void> => { await initDB(); db.run("UPDATE subjects SET name = ?, period = ? WHERE id = ?", [subject.name, subject.period, subject.id]); saveDB(); };
const dbGetEnrolledStudentsForSubject = async (subjectId: string): Promise<Student[]> => { await initDB(); const stmt = db.prepare(`SELECT s.* FROM students s JOIN enrollments e ON s.id = e.studentId WHERE e.subjectId = ?`); stmt.bind([subjectId]); return parseResults(stmt) as Student[]; };
const dbGetEvaluationsForSubject = async (subjectId: string): Promise<Evaluation[]> => { await initDB(); const stmt = db.prepare("SELECT * FROM evaluations WHERE subjectId = ?"); stmt.bind([subjectId]); return parseResults(stmt) as Evaluation[]; };
const dbGetGradesForSubject = async (subjectId: string): Promise<Grade[]> => { await initDB(); const stmt = db.prepare(`SELECT g.* FROM grades g JOIN evaluations e ON g.evaluationId = e.id WHERE e.subjectId = ?`); stmt.bind([subjectId]); return (parseResults(stmt) as any[]).map(r => ({ ...r, score: r.score === undefined ? null : r.score })) as Grade[]; };
const dbAddOrUpdateStudents = async (studentsToAdd: Student[]) => { await initDB(); const stmt = db.prepare("INSERT OR REPLACE INTO students (id, name, email) VALUES (?, ?, ?)"); studentsToAdd.forEach(s => stmt.run([s.id, s.name, s.email])); stmt.free(); };

const dbEnrollStudents = async (studentsToEnroll: Student[], subjectId: string) => {
    await initDB();
    await dbAddOrUpdateStudents(studentsToEnroll);
    const enrollStmt = db.prepare("INSERT OR IGNORE INTO enrollments (studentId, subjectId) VALUES (?, ?)");
    studentsToEnroll.forEach(s => enrollStmt.run([s.id, subjectId]));
    enrollStmt.free();
    const subjectEvaluations = await dbGetEvaluationsForSubject(subjectId);
    if (subjectEvaluations.length > 0) {
        const gradeStmt = db.prepare("INSERT OR IGNORE INTO grades (studentId, evaluationId, score) VALUES (?, ?, ?)");
        studentsToEnroll.forEach(student => subjectEvaluations.forEach(ev => gradeStmt.run([student.id, ev.id, null])));
        gradeStmt.free();
    }
    saveDB();
};

const dbEnrollStudent = async (studentToEnroll: Student, subjectId: string): Promise<boolean> => {
    await initDB();
    const checkStmt = db.prepare("SELECT 1 FROM enrollments WHERE studentId = ? AND subjectId = ?");
    checkStmt.bind([studentToEnroll.id, subjectId]);
    const isEnrolled = checkStmt.step();
    checkStmt.free();
    if(isEnrolled) return false;
    await dbEnrollStudents([studentToEnroll], subjectId);
    return true;
};

const dbAddEvaluation = async (evaluationData: Omit<Evaluation, 'id' | 'subjectId'>, subjectId: string) => {
    await initDB();
    const newEval = { ...evaluationData, id: `eval-${Date.now()}`, subjectId };
    db.run("INSERT INTO evaluations (id, subjectId, corte, name, percentage) VALUES (?, ?, ?, ?, ?)", [newEval.id, newEval.subjectId, newEval.corte, newEval.name, newEval.percentage]);
    const enrolledStudents = await dbGetEnrolledStudentsForSubject(subjectId);
    if (enrolledStudents.length > 0) {
        const gradeStmt = db.prepare("INSERT INTO grades (studentId, evaluationId, score) VALUES (?, ?, ?)");
        enrolledStudents.forEach(student => gradeStmt.run([student.id, newEval.id, null]));
        gradeStmt.free();
    }
    saveDB();
};

const dbDeleteEvaluation = async (evaluationId: string) => {
    await initDB();
    db.exec("BEGIN TRANSACTION;");
    try {
        db.run("DELETE FROM grades WHERE evaluationId = ?", [evaluationId]);
        db.run("DELETE FROM evaluations WHERE id = ?", [evaluationId]);
        db.exec("COMMIT;");
        saveDB();
    } catch(e) {
        console.error("Failed to delete evaluation:", e);
        db.exec("ROLLBACK;");
    }
};

const dbUpdateGrade = async (studentId: string, evaluationId: string, score: number | null) => { await initDB(); db.run("UPDATE grades SET score = ? WHERE studentId = ? AND evaluationId = ?", [score, studentId, evaluationId]); saveDB(); };
// ============== DB LOGIC END ==============

function App() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectPeriod, setNewSubjectPeriod] = useState('');
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [currentStudents, setCurrentStudents] = useState<Student[]>([]);
  const [currentEvaluations, setCurrentEvaluations] = useState<Evaluation[]>([]);
  const [currentGrades, setCurrentGrades] = useState<Grade[]>([]);

  useEffect(() => {
    const loadInitialData = async () => {
      await initDB();
      const initialSubjects = await dbGetSubjects();
      setSubjects(initialSubjects);
      setIsLoading(false);
    };
    loadInitialData();
  }, []);
  
  useEffect(() => {
    const loadSubjectData = async () => {
      if (selectedSubjectId) {
        setIsLoading(true);
        const [students, evaluations, grades] = await Promise.all([
          dbGetEnrolledStudentsForSubject(selectedSubjectId),
          dbGetEvaluationsForSubject(selectedSubjectId),
          dbGetGradesForSubject(selectedSubjectId),
        ]);
        setCurrentStudents(students);
        setCurrentEvaluations(evaluations);
        setCurrentGrades(grades);
        setIsLoading(false);
      }
    };
    loadSubjectData();
  }, [selectedSubjectId]);

  const handleAddSubject = async () => {
    if (newSubjectName.trim() === '' || newSubjectPeriod.trim() === '') return;
    const newSubject = await dbAddSubject(newSubjectName.trim(), newSubjectPeriod.trim());
    setSubjects(prev => [...prev, newSubject]);
    setNewSubjectName('');
    setNewSubjectPeriod('');
  };

  const handleUpdateSubject = async (subjectToUpdate: Subject) => {
    if (!subjectToUpdate.name.trim() || !subjectToUpdate.period.trim()) return;
    await dbUpdateSubject(subjectToUpdate);
    setSubjects(prev => prev.map(s => s.id === subjectToUpdate.id ? subjectToUpdate : s));
    setEditingSubject(null);
  };

  const handleEnrollStudents = async (studentsToEnroll: Student[]) => {
    if (!selectedSubjectId) return;
    await dbEnrollStudents(studentsToEnroll, selectedSubjectId);
    const updatedStudents = await dbGetEnrolledStudentsForSubject(selectedSubjectId);
    const updatedGrades = await dbGetGradesForSubject(selectedSubjectId);
    setCurrentStudents(updatedStudents);
    setCurrentGrades(updatedGrades);
  };

  const handleEnrollStudent = async (studentToEnroll: Student): Promise<boolean> => {
    if (!selectedSubjectId) return false;
    const success = await dbEnrollStudent(studentToEnroll, selectedSubjectId);
    if(success){
      const updatedStudents = await dbGetEnrolledStudentsForSubject(selectedSubjectId);
      const updatedGrades = await dbGetGradesForSubject(selectedSubjectId);
      setCurrentStudents(updatedStudents);
      setCurrentGrades(updatedGrades);
    }
    return success;
  };

  const handleAddEvaluation = async (evaluationData: Omit<Evaluation, 'id' | 'subjectId'>) => {
    if (!selectedSubjectId) return;
    await dbAddEvaluation(evaluationData, selectedSubjectId);
    const updatedEvaluations = await dbGetEvaluationsForSubject(selectedSubjectId);
    const updatedGrades = await dbGetGradesForSubject(selectedSubjectId);
    setCurrentEvaluations(updatedEvaluations);
    setCurrentGrades(updatedGrades);
  };
  
  const handleDeleteEvaluation = async (evaluationId: string) => {
    if (!selectedSubjectId) return;
    await dbDeleteEvaluation(evaluationId);
    const updatedEvaluations = await dbGetEvaluationsForSubject(selectedSubjectId);
    const updatedGrades = await dbGetGradesForSubject(selectedSubjectId);
    setCurrentEvaluations(updatedEvaluations);
    setCurrentGrades(updatedGrades);
  };

  const handleUpdateGrade = async (studentId: string, evaluationId: string, score: number | null) => {
      await dbUpdateGrade(studentId, evaluationId, score);
      setCurrentGrades(prevGrades => {
          const newGrades = [...prevGrades];
          const gradeIndex = newGrades.findIndex(g => g.studentId === studentId && g.evaluationId === evaluationId);
          if (gradeIndex !== -1) {
              newGrades[gradeIndex] = { ...newGrades[gradeIndex], score };
          } else {
              newGrades.push({ studentId, evaluationId, score });
          }
          return newGrades;
      });
  };

  const selectedSubject = useMemo(() => subjects.find(s => s.id === selectedSubjectId), [subjects, selectedSubjectId]);
  
  const subjectsByPeriod = useMemo(() => {
    const sortedSubjects = [...subjects].sort((a, b) => b.period.localeCompare(a.period) || a.name.localeCompare(b.name));
    return sortedSubjects.reduce((acc, subject) => {
      const period = subject.period || 'Sin Período';
      if (!acc[period]) {
        acc[period] = [];
      }
      acc[period].push(subject);
      return acc;
    }, {} as Record<string, Subject[]>);
  }, [subjects]);

  if (isLoading && !selectedSubject) {
      return <div className="flex justify-center items-center h-screen text-gray-800 dark:text-gray-100"><p>Cargando base de datos...</p></div>;
  }

  if (selectedSubject) {
    return (
      <SubjectView
        subject={selectedSubject}
        students={currentStudents}
        evaluations={currentEvaluations}
        grades={currentGrades}
        onAddEvaluation={handleAddEvaluation}
        onUpdateGrade={handleUpdateGrade}
        onEnrollStudent={handleEnrollStudent}
        onEnrollStudents={handleEnrollStudents}
        onDeleteEvaluation={handleDeleteEvaluation}
        onBack={() => setSelectedSubjectId(null)}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-center text-gray-800 dark:text-gray-100">Evaluador de Notas Pro</h1>
        <p className="text-center text-gray-500 dark:text-gray-400 mt-2">Gestiona las calificaciones de tus estudiantes de forma sencilla y eficaz.</p>
      </header>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Agregar Nueva Materia</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <input
            type="text"
            value={newSubjectName}
            onChange={e => setNewSubjectName(e.target.value)}
            placeholder="Ej: Matemáticas I"
            className="sm:col-span-2 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <input
            type="text"
            value={newSubjectPeriod}
            onChange={e => setNewSubjectPeriod(e.target.value)}
            placeholder="Período (Ej: 2024-1)"
            className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="mt-4 flex justify-end">
            <button onClick={handleAddSubject} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors">
            <PlusCircleIcon className="w-5 h-5"/>
            <span>Agregar Materia</span>
            </button>
        </div>
      </div>

      <div className="space-y-8">
        {Object.entries(subjectsByPeriod).length > 0 ? (
          // FIX: Explicitly cast the result of Object.entries to resolve type inference issue.
          (Object.entries(subjectsByPeriod) as [string, Subject[]][]).map(([period, subjectList]) => (
            <div key={period}>
              <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">{period}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {subjectList.map(subject => (
                  <div
                    key={subject.id}
                    onClick={() => setSelectedSubjectId(subject.id)}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col items-center text-center relative"
                  >
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingSubject(subject); }}
                      className="absolute top-2 right-2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                      aria-label="Editar materia"
                    >
                        <PencilIcon className="w-4 h-4"/>
                    </button>
                    <BookOpenIcon className="w-12 h-12 text-blue-500 mb-4" />
                    <h4 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{subject.name}</h4>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-lg shadow">
            <p className="text-gray-500 dark:text-gray-400">Aún no has agregado ninguna materia.</p>
          </div>
        )}
      </div>

      {editingSubject && (
        <EditSubjectModal 
            subject={editingSubject}
            onClose={() => setEditingSubject(null)}
            onSave={handleUpdateSubject}
        />
      )}
    </div>
  );
}

interface EditSubjectModalProps {
    subject: Subject;
    onClose: () => void;
    onSave: (subject: Subject) => void;
}

const EditSubjectModal: React.FC<EditSubjectModalProps> = ({ subject, onClose, onSave }) => {
    const [name, setName] = useState(subject.name);
    const [period, setPeriod] = useState(subject.period);

    const handleSave = () => {
        onSave({ ...subject, name, period });
    };

    return (
        <Modal isOpen={true} onClose={onClose} title="Editar Materia">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre de la Materia</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Período Académico</label>
                    <input type="text" value={period} onChange={e => setPeriod(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Guardar Cambios</button>
                </div>
            </div>
        </Modal>
    );
};

export default App;