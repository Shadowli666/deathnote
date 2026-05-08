import React, { useState, useMemo, useCallback } from 'react';
import { Subject, Student, Evaluation, Grade } from '../types';
import GradeTable from './GradeTable';
import Modal from './Modal';
import StudentImport from './StudentImport';
import StudentManualEntry from './StudentManualEntry';
import { PlusCircleIcon, ArrowLeftIcon, UserPlusIcon, UploadCloudIcon, BarChartIcon, TrashIcon, PencilIcon } from './Icons';
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
  onUpdateStudent: (originalId: string, student: Student) => Promise<boolean>;
  onUnenrollStudent: (studentId: string) => Promise<void>;
  onBack: () => void;
}

const CORTE_PERCENTAGES = { 1: 30, 2: 30, 3: 40 };

const SubjectView: React.FC<SubjectViewProps> = ({ subject, students, evaluations, grades, onAddEvaluation, onUpdateEvaluation, onUpdateGrade, onEnrollStudent, onEnrollStudents, onDeleteEvaluation, onUpdateStudent, onUnenrollStudent, onBack }) => {
  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isManualEntryModalOpen, setIsManualEntryModalOpen] = useState(false);
  const [isEditStudentModalOpen, setIsEditStudentModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [editingEvaluation, setEditingEvaluation] = useState<Evaluation | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editStudentForm, setEditStudentForm] = useState({ id: '', name: '' });
  const [studentEditError, setStudentEditError] = useState('');

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

  const handleOpenEditStudentModal = (student: Student) => {
    setEditingStudent(student);
    setEditStudentForm({ id: student.id, name: student.name });
    setStudentEditError('');
    setIsEditStudentModalOpen(true);
  };

  const handleCloseEditStudentModal = () => {
    setIsEditStudentModalOpen(false);
    setEditingStudent(null);
    setEditStudentForm({ id: '', name: '' });
    setStudentEditError('');
  };

  const handleSaveStudent = async () => {
    if (!editingStudent) return;

    if (!editStudentForm.id.trim() || !editStudentForm.name.trim()) {
      setStudentEditError('Cédula y nombre son obligatorios.');
      return;
    }

    const success = await onUpdateStudent(editingStudent.id, {
      ...editingStudent,
      id: editStudentForm.id.trim(),
      name: editStudentForm.name.trim(),
    });

    if (!success) {
      setStudentEditError('La cédula ingresada ya existe.');
      return;
    }

    handleCloseEditStudentModal();
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

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
                <button onClick={onBack} title="Volver a materias" className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
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
                <progress
                  className="w-full h-2.5 rounded-full overflow-hidden [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-bar]:dark:bg-gray-700 [&::-webkit-progress-value]:bg-blue-600 [&::-moz-progress-bar]:bg-blue-600"
                  max={100}
                  value={Math.min(totalPercentage, 100)}
                  title="Porcentaje total de evaluaciones"
                />
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
        <GradeTable
          students={students}
          evaluations={subjectEvaluations}
          grades={grades}
          onUpdateGrade={onUpdateGrade}
          onEditStudent={handleOpenEditStudentModal}
          onUnenrollStudent={onUnenrollStudent}
        />
      ) : (
        <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-lg shadow mt-6">
          <p className="text-gray-500 dark:text-gray-400">No hay estudiantes matriculados en esta materia. Utiliza los botones de arriba para matricular o importar estudiantes.</p>
        </div>
      )}

      {/* Modal para Nueva/Editar Evaluación */}
      <Modal isOpen={isEvalModalOpen} onClose={handleCloseEvalModal} title={editingEvaluation ? "Editar Evaluación" : "Agregar Nueva Evaluación"}>
        <div className="space-y-4">
          <div>
            <label htmlFor="evaluation-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre de la Evaluación</label>
            <input id="evaluation-name" title="Nombre de la evaluación" placeholder="Ej: Parcial 1" type="text" value={newEval.name} onChange={e => setNewEval({...newEval, name: e.target.value})} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
          </div>
          <div>
            <label htmlFor="evaluation-percentage" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Porcentaje Ponderado (%)</label>
            <input id="evaluation-percentage" title="Porcentaje ponderado" placeholder="Ej: 20" type="number" value={newEval.percentage} onChange={e => setNewEval({...newEval, percentage: e.target.value})} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
          </div>
          <div>
            <label htmlFor="evaluation-corte" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Corte</label>
            <select id="evaluation-corte" title="Corte de la evaluación" value={newEval.corte} onChange={e => setNewEval({...newEval, corte: e.target.value})} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
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

      <Modal isOpen={isEditStudentModalOpen} onClose={handleCloseEditStudentModal} title="Editar Estudiante">
        <div className="space-y-4">
          <div>
            <label htmlFor="edit-student-id" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cédula de Identidad</label>
            <input
              id="edit-student-id"
              title="Cédula de identidad"
              placeholder="Ej: V12345678"
              type="text"
              value={editStudentForm.id}
              onChange={e => setEditStudentForm(prev => ({ ...prev, id: e.target.value }))}
              className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label htmlFor="edit-student-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre Completo</label>
            <input
              id="edit-student-name"
              title="Nombre completo"
              placeholder="Ej: Ana Pérez"
              type="text"
              value={editStudentForm.name}
              onChange={e => setEditStudentForm(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {studentEditError && <p className="text-red-500 text-sm">{studentEditError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={handleCloseEditStudentModal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500">Cancelar</button>
            <button onClick={handleSaveStudent} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Guardar Cambios</button>
          </div>
        </div>
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