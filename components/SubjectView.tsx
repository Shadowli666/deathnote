import React, { useState, useMemo, useCallback } from 'react';
import { Subject, Student, Evaluation, Grade } from '../types';
import GradeTable from './GradeTable';
import Modal from './Modal';
import StudentImport from './StudentImport';
import StudentManualEntry from './StudentManualEntry';
import { PlusCircleIcon, ArrowLeftIcon, UserPlusIcon, UploadCloudIcon, BarChartIcon, MailIcon, TrashIcon, PencilIcon } from './Icons';
import ReportsView from './ReportsView';

interface SubjectViewProps {
  subject: Subject;
  students: Student[]; // Enrolled students
  evaluations: Evaluation[];
  grades: Grade[];
  onAddEvaluation: (evaluation: Omit<Evaluation, 'id' | 'subjectId'>) => Promise<void>;
  onUpdateEvaluation: (evaluation: Evaluation) => Promise<void>;
  onUpdateGrade: (studentId: string, evaluationId: string, score: number | null) => void;
  onEnrollStudent: (student: Student) => Promise<boolean>;
  onEnrollStudents: (students: Student[]) => Promise<void>;
  onDeleteEvaluation: (evaluationId: string) => Promise<void>;
  onUnenrollStudent: (studentId: string) => Promise<void>;
  onBack: () => void;
}

const CORTE_PERCENTAGES = { 1: 30, 2: 30, 3: 40 };

const SubjectView: React.FC<SubjectViewProps> = ({ subject, students, evaluations, grades, onAddEvaluation, onUpdateEvaluation, onUpdateGrade, onEnrollStudent, onEnrollStudents, onDeleteEvaluation, onUnenrollStudent, onBack }) => {
  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isManualEntryModalOpen, setIsManualEntryModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [editingEvaluation, setEditingEvaluation] = useState<Evaluation | null>(null);

  const [newEval, setNewEval] = useState({ name: '', percentage: '', corte: '1' });
  const [error, setError] = useState('');

  const subjectEvaluations = useMemo(() => evaluations.filter(ev => ev.subjectId === subject.id), [evaluations, subject.id]);
  
  const totalPercentage = useMemo(() => {
    return subjectEvaluations.reduce((acc, ev) => acc + ev.percentage, 0);
  }, [subjectEvaluations]);

  const handleCloseEvalModal = () => {
    setIsEvalModalOpen(false);
    setEditingEvaluation(null);
    setError('');
    setNewEval({ name: '', percentage: '', corte: '1' });
  };

  const handleOpenAddEvalModal = () => {
    setEditingEvaluation(null);
    setNewEval({ name: '', percentage: '', corte: '1' });
    setError('');
    setIsEvalModalOpen(true);
  };
  
  const handleOpenEditEvalModal = (evaluation: Evaluation) => {
    setEditingEvaluation(evaluation);
    setNewEval({
      name: evaluation.name,
      percentage: String(evaluation.percentage),
      corte: String(evaluation.corte),
    });
    setError('');
    setIsEvalModalOpen(true);
  };

  const handleSaveEvaluation = async () => {
    const percentage = parseFloat(newEval.percentage);
    const corte = parseInt(newEval.corte, 10) as 1 | 2 | 3;

    if (!newEval.name.trim() || isNaN(percentage)) {
      setError('Nombre y porcentaje son requeridos.');
      return;
    }
    if (percentage <= 0) {
      setError('El porcentaje debe ser un número positivo.');
      return;
    }

    const percentageForThisCorte = subjectEvaluations
      .filter(ev => ev.corte === corte)
      .reduce((acc, ev) => {
        if (editingEvaluation && editingEvaluation.id === ev.id) {
          return acc; // No contar el valor anterior de la evaluación que se está editando
        }
        return acc + ev.percentage;
      }, 0);

    const maxPercentageForCorte = CORTE_PERCENTAGES[corte];

    if (percentageForThisCorte + percentage > maxPercentageForCorte) {
      setError(`El porcentaje para el Corte ${corte} no puede exceder ${maxPercentageForCorte}%. Disponible: ${(maxPercentageForCorte - percentageForThisCorte).toFixed(2)}%`);
      return;
    }

    const currentTotalWithoutEdited = totalPercentage - (editingEvaluation ? editingEvaluation.percentage : 0);
    if (currentTotalWithoutEdited + percentage > 100) {
        setError(`El porcentaje total de todos los cortes no puede exceder 100%. Disponible: ${(100 - currentTotalWithoutEdited).toFixed(2)}%`);
        return;
    }
    
    if (editingEvaluation) {
      await onUpdateEvaluation({
        ...editingEvaluation,
        name: newEval.name,
        percentage: percentage,
        corte: corte,
      });
    } else {
      await onAddEvaluation({
        name: newEval.name,
        percentage: percentage,
        corte: corte,
      });
    }

    handleCloseEvalModal();
  };
  
  const evaluationsByCorte = useMemo(() => {
    const cortes: { [key in 1 | 2 | 3]: Evaluation[] } = { 1: [], 2: [], 3: [] };
    subjectEvaluations.forEach(ev => cortes[ev.corte].push(ev));
    Object.values(cortes).forEach(evals => evals.sort((a,b) => a.name.localeCompare(b.name)));
    return cortes;
  }, [subjectEvaluations]);

  const getGrade = useCallback((studentId: string, evaluationId: string): Grade | undefined => {
      return grades.find(g => g.studentId === studentId && g.evaluationId === evaluationId);
  }, [grades]);

  const handleEmailByEvaluation = (evaluation: Evaluation) => {
    const subjectLine = `Calificaciones: ${evaluation.name} - ${subject.name}`;
    let body = `Hola,\n\nA continuación se presentan las calificaciones para la evaluación "${evaluation.name}" (${evaluation.percentage}%):\n\n`;
    const studentEmails = students.map(s => s.email).filter(Boolean);

    students.sort((a,b) => a.name.localeCompare(b.name)).forEach(student => {
        const grade = getGrade(student.id, evaluation.id);
        const score = grade?.score ?? 'N/P';
        body += `${student.name}: ${score}\n`;
    });

    body += "\nSaludos.";
    window.location.href = `mailto:?bcc=${studentEmails.join(',')}&subject=${encodeURIComponent(subjectLine)}&body=${encodeURIComponent(body)}`;
  };

  const handleEmailByCorte = (corte: 1 | 2 | 3) => {
      const corteEvals = evaluationsByCorte[corte];
      if (corteEvals.length === 0) {
          alert("No hay evaluaciones en este corte para enviar.");
          return;
      }

      const subjectLine = `Calificaciones Finales del Corte ${corte} - ${subject.name}`;
      let body = `Hola,\n\nA continuación se presentan las calificaciones finales para el Corte ${corte}:\n\n`;
      const studentEmails = students.map(s => s.email).filter(Boolean);

      students.sort((a,b) => a.name.localeCompare(b.name)).forEach(student => {
          const weightedSum = corteEvals.reduce((total, ev) => {
              const grade = getGrade(student.id, ev.id);
              const score = grade?.score ?? 0;
              return total + score * (ev.percentage / 100);
          }, 0);
          const totalPercentageInCorte = corteEvals.reduce((total, ev) => total + ev.percentage, 0);
          const normalizedGrade = totalPercentageInCorte > 0 ? weightedSum / (totalPercentageInCorte / 100) : 0;
          body += `${student.name}: ${normalizedGrade.toFixed(2)}\n`;
      });

      body += "\nSaludos.";
      window.location.href = `mailto:?bcc=${studentEmails.join(',')}&subject=${encodeURIComponent(subjectLine)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                  <ArrowLeftIcon className="w-6 h-6"/>
              </button>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">
                {subject.name}
                <span className="ml-3 text-xl font-normal text-gray-500 dark:text-gray-400">({subject.period})</span>
              </h1>
          </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-6 ml-16">
          <button
            onClick={handleOpenAddEvalModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors text-sm"
          >
            <PlusCircleIcon className="w-5 h-5" />
            Nueva Evaluación
          </button>
          <button
            onClick={() => setIsManualEntryModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-colors text-sm"
          >
            <UserPlusIcon className="w-5 h-5" />
            Matricular Estudiante
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition-colors text-sm"
          >
            <UploadCloudIcon className="w-5 h-5" />
            Importar Estudiantes (CSV)
          </button>
           <button
            onClick={() => setIsReportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg shadow hover:bg-purple-700 transition-colors text-sm"
          >
            <BarChartIcon className="w-5 h-5" />
            Ver Reportes
          </button>
      </div>

        <div className="mb-6 space-y-6">
            <div className="mb-4">
                <p className="text-gray-600 dark:text-gray-300">Porcentaje total de evaluaciones: {totalPercentage.toFixed(2)}% / 100%</p>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${totalPercentage}%`}}></div>
                </div>
            </div>
            
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Gestión de Evaluaciones</h2>
            {([1, 2, 3] as const).map(corteNum => {
                const corteEvals = evaluationsByCorte[corteNum];
                if (corteEvals.length === 0) return null;
                const cortePercentage = corteEvals.reduce((acc, ev) => acc + ev.percentage, 0);

                return (
                    <div key={corteNum} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                                Corte {corteNum}
                                <span className="ml-2 font-normal text-sm text-gray-500 dark:text-gray-400">
                                    ({cortePercentage.toFixed(2)}% / {CORTE_PERCENTAGES[corteNum]}%)
                                </span>
                            </h3>
                            <button
                                onClick={() => handleEmailByCorte(corteNum)}
                                className="flex items-center gap-2 px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors text-xs"
                                aria-label={`Enviar notas del corte ${corteNum}`}
                            >
                                <MailIcon className="w-4 h-4" />
                                <span>Enviar Notas del Corte</span>
                            </button>
                        </div>
                        <ul className="space-y-2">
                            {corteEvals.map(ev => (
                                <li key={ev.id} className="flex items-center justify-between p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                                    <div>
                                        <span className="font-medium text-gray-800 dark:text-gray-100">{ev.name}</span>
                                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">({ev.percentage}%)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleOpenEditEvalModal(ev)}
                                            className="p-1 text-gray-500 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors"
                                            aria-label={`Editar evaluación ${ev.name}`}
                                        >
                                            <PencilIcon className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleEmailByEvaluation(ev)}
                                            className="p-1 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                            aria-label={`Enviar notas por correo para ${ev.name}`}
                                        >
                                            <MailIcon className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (window.confirm(`¿Estás seguro de que deseas eliminar la evaluación "${ev.name}"? Esta acción no se puede deshacer.`)) {
                                                    onDeleteEvaluation(ev.id);
                                                }
                                            }}
                                            className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                            aria-label={`Eliminar evaluación ${ev.name}`}
                                        >
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )
            })}
            {subjectEvaluations.length === 0 && <p className="text-center text-gray-500 dark:text-gray-400 py-4">No hay evaluaciones creadas para esta materia.</p>}
        </div>

      {students.length > 0 ? (
        <GradeTable students={students} evaluations={subjectEvaluations} grades={grades} onUpdateGrade={onUpdateGrade} onUnenrollStudent={onUnenrollStudent} />
      ) : (
        <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-lg shadow mt-6">
          <p className="text-gray-500 dark:text-gray-400">No hay estudiantes matriculados en esta materia. Utiliza los botones de arriba para matricular o importar estudiantes.</p>
        </div>
      )}

      {/* Modal para Nueva/Editar Evaluación */}
      <Modal isOpen={isEvalModalOpen} onClose={handleCloseEvalModal} title={editingEvaluation ? "Editar Evaluación" : "Agregar Nueva Evaluación"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre de la Evaluación</label>
            <input type="text" value={newEval.name} onChange={e => setNewEval({...newEval, name: e.target.value})} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Porcentaje Ponderado (%)</label>
            <input type="number" value={newEval.percentage} onChange={e => setNewEval({...newEval, percentage: e.target.value})} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Corte</label>
            <select value={newEval.corte} onChange={e => setNewEval({...newEval, corte: e.target.value})} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
              <option value="1">Corte 1 (max {CORTE_PERCENTAGES[1]}%)</option>
              <option value="2">Corte 2 (max {CORTE_PERCENTAGES[2]}%)</option>
              <option value="3">Corte 3 (max {CORTE_PERCENTAGES[3]}%)</option>
            </select>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex justify-end pt-2">
            <button onClick={handleSaveEvaluation} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingEvaluation ? 'Guardar Cambios' : 'Agregar'}</button>
          </div>
        </div>
      </Modal>

      {/* Modal para Matrícula Manual */}
      <Modal isOpen={isManualEntryModalOpen} onClose={() => setIsManualEntryModalOpen(false)} title="Matricular Estudiante">
        <StudentManualEntry onAddStudent={async (student) => {
            const success = await onEnrollStudent(student);
            if(success) setIsManualEntryModalOpen(false);
            return success;
        }} />
      </Modal>

      {/* Modal para Importar CSV */}
      <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Importar Estudiantes desde CSV">
        <StudentImport onStudentsLoaded={(students) => {
            onEnrollStudents(students);
            setIsImportModalOpen(false);
        }} />
      </Modal>

      {isReportModalOpen && (
        <ReportsView 
            subject={subject}
            students={students}
            evaluations={subjectEvaluations}
            grades={grades}
            onClose={() => setIsReportModalOpen(false)}
        />
      )}
    </div>
  );
};

export default SubjectView;