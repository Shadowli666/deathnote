import React, { useState, useMemo } from 'react';
import { Subject, Student, Evaluation, Grade } from '../types';
import GradeTable from './GradeTable';
import Modal from './Modal';
import StudentImport from './StudentImport';
import StudentManualEntry from './StudentManualEntry';
import { PlusCircleIcon, ArrowLeftIcon, UserPlusIcon, UploadCloudIcon } from './Icons';

interface SubjectViewProps {
  subject: Subject;
  students: Student[]; // Enrolled students
  evaluations: Evaluation[];
  grades: Grade[];
  onAddEvaluation: (evaluation: Omit<Evaluation, 'id' | 'subjectId'>) => Promise<void>;
  onUpdateGrade: (studentId: string, evaluationId: string, score: number | null) => void;
  onEnrollStudent: (student: Student) => Promise<boolean>;
  onEnrollStudents: (students: Student[]) => Promise<void>;
  onBack: () => void;
}

const SubjectView: React.FC<SubjectViewProps> = ({ subject, students, evaluations, grades, onAddEvaluation, onUpdateGrade, onEnrollStudent, onEnrollStudents, onBack }) => {
  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isManualEntryModalOpen, setIsManualEntryModalOpen] = useState(false);

  const [newEval, setNewEval] = useState({ name: '', percentage: '', corte: '1' });
  const [error, setError] = useState('');

  const subjectEvaluations = useMemo(() => evaluations.filter(ev => ev.subjectId === subject.id), [evaluations, subject.id]);
  
  const totalPercentage = useMemo(() => {
    return subjectEvaluations.reduce((acc, ev) => acc + ev.percentage, 0);
  }, [subjectEvaluations]);

  const handleAddEvaluation = async () => {
    const percentage = parseFloat(newEval.percentage);
    if (!newEval.name.trim() || isNaN(percentage)) {
      setError('Nombre y porcentaje son requeridos.');
      return;
    }
    if (percentage <= 0 || percentage > 100) {
      setError('El porcentaje debe estar entre 1 y 100.');
      return;
    }
    if (totalPercentage + percentage > 100) {
        setError(`El porcentaje total no puede exceder 100%. Restante: ${(100 - totalPercentage).toFixed(2)}%`);
        return;
    }
    
    await onAddEvaluation({
      name: newEval.name,
      percentage: percentage,
      corte: parseInt(newEval.corte, 10) as 1 | 2 | 3,
    });

    setNewEval({ name: '', percentage: '', corte: '1' });
    setError('');
    setIsEvalModalOpen(false);
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
            onClick={() => setIsEvalModalOpen(true)}
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
      </div>


        <div className="mb-4 ml-16">
            <p className="text-gray-600 dark:text-gray-300">Porcentaje total de evaluaciones: {totalPercentage.toFixed(2)}%</p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${totalPercentage}%`}}></div>
            </div>
        </div>

      {students.length > 0 ? (
        <GradeTable students={students} evaluations={subjectEvaluations} grades={grades} onUpdateGrade={onUpdateGrade} />
      ) : (
        <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-lg shadow mt-6">
          <p className="text-gray-500 dark:text-gray-400">No hay estudiantes matriculados en esta materia. Utiliza los botones de arriba para matricular o importar estudiantes.</p>
        </div>
      )}

      {/* Modal para Nueva Evaluación */}
      <Modal isOpen={isEvalModalOpen} onClose={() => setIsEvalModalOpen(false)} title="Agregar Nueva Evaluación">
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
              <option value="1">Corte 1</option>
              <option value="2">Corte 2</option>
              <option value="3">Corte 3</option>
            </select>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex justify-end pt-2">
            <button onClick={handleAddEvaluation} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Agregar</button>
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
    </div>
  );
};

export default SubjectView;