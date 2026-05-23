
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Student, Subject, Evaluation, Grade } from './types';
import SubjectView from './components/SubjectView';
import Modal from './components/Modal';
import { PlusCircleIcon, BookOpenIcon, PencilIcon, DownloadIcon, MoonIcon, SunIcon } from './components/Icons';
import {
  dbAddEvaluation,
  dbAddSubject,
  dbDeleteEvaluation,
  dbEnrollStudent,
  dbEnrollStudents,
  dbGetEnrolledStudentsForSubject,
  dbGetEvaluationsForSubject,
  dbGetGradesForSubject,
  dbGetSubjects,
  dbUnenrollStudent,
  dbUpdateEvaluation,
  dbUpdateGrade,
  dbUpdateStudent,
  dbUpdateSubject,
  dbUpdateSubjectsOrder,
  ensureServerDataMigration,
  exportDatabaseFile,
} from './services/dbApi';

const THEME_STORAGE_KEY = 'deathnote-theme';

const getInitialTheme = () => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectPeriod, setNewSubjectPeriod] = useState('');
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const draggedSubjectId = useRef<string | null>(null);

  const [currentStudents, setCurrentStudents] = useState<Student[]>([]);
  const [currentEvaluations, setCurrentEvaluations] = useState<Evaluation[]>([]);
  const [currentGrades, setCurrentGrades] = useState<Grade[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        await ensureServerDataMigration();
        const initialSubjects = await dbGetSubjects();
        setSubjects(initialSubjects);
      } catch (error) {
        console.error("Error loading initial data:", error);
      } finally {
        setIsLoading(false);
      }
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
    setSubjects(prev => prev.map(s => s.id === subjectToUpdate.id ? { ...s, name: subjectToUpdate.name, period: subjectToUpdate.period } : s));
    setEditingSubject(null);
  };
    
  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    draggedSubjectId.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault();
    if (id !== draggedSubjectId.current) {
      setDragOverId(id);
    }
  };
    
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverId(null);
  };
    
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    const draggedId = draggedSubjectId.current;
    if (!draggedId || draggedId === targetId) {
      return;
    }
    const draggedIndex = subjects.findIndex(s => s.id === draggedId);
    const targetIndex = subjects.findIndex(s => s.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newSubjects = [...subjects];
    const [draggedItem] = newSubjects.splice(draggedIndex, 1);
    newSubjects.splice(targetIndex, 0, draggedItem);
    
    setSubjects(newSubjects);
    await dbUpdateSubjectsOrder(newSubjects);
  };

  const handleDragEnd = () => {
    draggedSubjectId.current = null;
    setDraggingId(null);
    setDragOverId(null);
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

  const handleUnenrollStudent = async (studentId: string) => {
      if (!selectedSubjectId) return;
      await dbUnenrollStudent(studentId, selectedSubjectId);
      const updatedStudents = await dbGetEnrolledStudentsForSubject(selectedSubjectId);
      const updatedGrades = await dbGetGradesForSubject(selectedSubjectId);
      setCurrentStudents(updatedStudents);
      setCurrentGrades(updatedGrades);
  };

    const handleUpdateStudent = async (originalId: string, student: Student): Promise<boolean> => {
      if (!selectedSubjectId) return false;
      const success = await dbUpdateStudent(originalId, student);
      if (!success) return false;
      const updatedStudents = await dbGetEnrolledStudentsForSubject(selectedSubjectId);
      const updatedGrades = await dbGetGradesForSubject(selectedSubjectId);
      setCurrentStudents(updatedStudents);
      setCurrentGrades(updatedGrades);
      return true;
    };

  const handleAddEvaluation = async (evaluationData: Omit<Evaluation, 'id' | 'subjectId'>) => {
    if (!selectedSubjectId) return;
    await dbAddEvaluation(evaluationData, selectedSubjectId);
    const updatedEvaluations = await dbGetEvaluationsForSubject(selectedSubjectId);
    const updatedGrades = await dbGetGradesForSubject(selectedSubjectId);
    setCurrentEvaluations(updatedEvaluations);
    setCurrentGrades(updatedGrades);
  };
  
  const handleUpdateEvaluation = async (evaluation: Evaluation) => {
      if (!selectedSubjectId) return;
      await dbUpdateEvaluation(evaluation);
      const updatedEvaluations = await dbGetEvaluationsForSubject(selectedSubjectId);
      setCurrentEvaluations(updatedEvaluations);
  };

  const handleDeleteEvaluation = async (evaluationId: string) => {
    if (!selectedSubjectId) return;
    await dbDeleteEvaluation(evaluationId);
    const updatedEvaluations = await dbGetEvaluationsForSubject(selectedSubjectId);
    const updatedGrades = await dbGetGradesForSubject(selectedSubjectId);
    setCurrentEvaluations(updatedEvaluations);
    setCurrentGrades(updatedGrades);
  };

    const handleUpdateGrade = async (studentId: string, evaluationId: string, gradeData: Pick<Grade, 'score' | 'observation'>) => {
      const normalizedObservation = gradeData.observation?.trim() ?? '';
      await dbUpdateGrade(studentId, evaluationId, gradeData.score, normalizedObservation);
      setCurrentGrades(prevGrades => {
          const newGrades = [...prevGrades];
          const gradeIndex = newGrades.findIndex(g => g.studentId === studentId && g.evaluationId === evaluationId);
          if (gradeIndex !== -1) {
          newGrades[gradeIndex] = { ...newGrades[gradeIndex], score: gradeData.score, observation: normalizedObservation };
          } else {
          newGrades.push({ studentId, evaluationId, score: gradeData.score, observation: normalizedObservation });
          }
          return newGrades;
      });
  };

  const selectedSubject = useMemo(() => subjects.find(s => s.id === selectedSubjectId), [subjects, selectedSubjectId]);

  const toggleTheme = () => {
    setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark');
  };
  
  const subjectsByPeriod = useMemo(() => {
    return subjects.reduce((acc, subject) => {
      const period = subject.period || 'Sin Período';
      if (!acc[period]) acc[period] = [];
      acc[period].push(subject);
      return acc;
    }, {} as Record<string, Subject[]>);
  }, [subjects]);

  if (isLoading && !selectedSubject) {
      return (
        <div className="min-h-screen bg-gray-100 text-gray-900 transition-colors dark:bg-gray-900 dark:text-gray-100">
          <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
          <div className="flex h-screen items-center justify-center">
            <p>Cargando base de datos...</p>
          </div>
        </div>
      );
  }

  if (selectedSubject) {
    return (
      <div className="min-h-screen bg-gray-100 text-gray-900 transition-colors dark:bg-gray-900 dark:text-gray-100">
        <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
        <SubjectView
          subject={selectedSubject}
          students={currentStudents}
          evaluations={currentEvaluations}
          grades={currentGrades}
          onAddEvaluation={handleAddEvaluation}
          onUpdateEvaluation={handleUpdateEvaluation}
          onUpdateGrade={handleUpdateGrade}
          onEnrollStudent={handleEnrollStudent}
          onEnrollStudents={handleEnrollStudents}
          onDeleteEvaluation={handleDeleteEvaluation}
          onUpdateStudent={handleUpdateStudent}
          onUnenrollStudent={handleUnenrollStudent}
          onBack={() => setSelectedSubjectId(null)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 transition-colors dark:bg-gray-900 dark:text-gray-100">
      <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-center sm:text-left">
          <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100">Evaluador de Notas Pro</h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Gestiona las calificaciones de tus estudiantes de forma sencilla y eficaz.</p>
        </div>
        <div className="flex justify-center sm:justify-end">
          <button 
            onClick={exportDatabaseFile}
            className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            title="Exportar base de datos para DBeaver"
          >
            <DownloadIcon className="w-4 h-4" />
            Exportar .sqlite
          </button>
        </div>
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
        {Object.keys(subjectsByPeriod).length > 0 ? (
          Object.keys(subjectsByPeriod).map((period) => {
            const subjectList = subjectsByPeriod[period];
            return (
              <div key={period}>
                <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">{period}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {subjectList.map(subject => (
                    <div
                      key={subject.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, subject.id)}
                      onDragEnter={(e) => handleDragEnter(e, subject.id)}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, subject.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedSubjectId(subject.id)}
                      className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 cursor-grab hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col items-center text-center relative
                                ${draggingId === subject.id ? 'opacity-40' : 'opacity-100'}
                                ${dragOverId === subject.id ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-800' : ''}`}
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
            )
          })
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
      </div>
  );
}

    interface ThemeToggleButtonProps {
      theme: 'light' | 'dark';
      onToggle: () => void;
    }

    const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({ theme, onToggle }) => {
      const isDarkMode = theme === 'dark';

      return (
        <button
          type="button"
          onClick={onToggle}
          title={isDarkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-label={isDarkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-lg transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          {isDarkMode ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          <span>{isDarkMode ? 'Modo claro' : 'Modo oscuro'}</span>
        </button>
      );
    };

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
                    <label htmlFor="edit-subject-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre de la Materia</label>
                    <input id="edit-subject-name" title="Nombre de la materia" placeholder="Ej: Matemáticas I" type="text" value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
                </div>
                <div>
                    <label htmlFor="edit-subject-period" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Período Académico</label>
                    <input id="edit-subject-period" title="Período académico" placeholder="Ej: 2026-1" type="text" value={period} onChange={e => setPeriod(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
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