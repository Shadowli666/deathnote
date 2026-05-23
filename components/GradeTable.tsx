import React, { useMemo, useCallback, useState } from 'react';
import { Student, Evaluation, Grade } from '../types';
import { TrashIcon, PencilIcon, NoteIcon } from './Icons';
import Modal from './Modal';

interface GradeTableProps {
  students: Student[];
  evaluations: Evaluation[];
  grades: Grade[];
  onUpdateGrade: (studentId: string, evaluationId: string, gradeData: Pick<Grade, 'score' | 'observation'>) => Promise<void>;
  onEditStudent: (student: Student) => void;
  onUnenrollStudent: (studentId: string) => void;
}

const GradeTable: React.FC<GradeTableProps> = ({ students, evaluations, grades, onUpdateGrade, onEditStudent, onUnenrollStudent }) => {
  const [editingGrade, setEditingGrade] = useState<{ student: Student; evaluation: Evaluation; grade?: Grade } | null>(null);
  const [observationDraft, setObservationDraft] = useState('');
  const evaluationsByCorte = useMemo(() => {
    const cortes: { [key in 1 | 2 | 3]: Evaluation[] } = { 1: [], 2: [], 3: [] };
    evaluations.forEach(ev => cortes[ev.corte].push(ev));
    cortes[1].sort((a,b) => a.name.localeCompare(b.name));
    cortes[2].sort((a,b) => a.name.localeCompare(b.name));
    cortes[3].sort((a,b) => a.name.localeCompare(b.name));
    return cortes;
  }, [evaluations]);

  const getGrade = useCallback((studentId: string, evaluationId: string): Grade | undefined => {
      return grades.find(g => g.studentId === studentId && g.evaluationId === evaluationId);
  }, [grades]);
  
  const calculateWeightedCorteSum = useCallback((studentId: string, corte: 1 | 2 | 3) => {
    const corteEvals = evaluationsByCorte[corte];
    if (corteEvals.length === 0) return 0;
    return corteEvals.reduce((total, ev) => {
      const grade = getGrade(studentId, ev.id);
      const score = grade?.score ?? 0;
      return total + score * (ev.percentage / 100);
    }, 0);
  }, [evaluationsByCorte, getGrade]);

  const calculateNormalizedCorteGrade = useCallback((studentId: string, corte: 1 | 2 | 3) => {
    const corteEvals = evaluationsByCorte[corte];
    if (corteEvals.length === 0) return 0;
    
    const weightedSum = calculateWeightedCorteSum(studentId, corte);
    const totalPercentageInCorte = corteEvals.reduce((total, ev) => total + ev.percentage, 0);
    
    if (totalPercentageInCorte === 0) return 0;

    // Normalize the grade to a 0-20 scale
    return weightedSum / (totalPercentageInCorte / 100);
  }, [evaluationsByCorte, calculateWeightedCorteSum]);


  const renderHeaders = () => {
    const headers: React.ReactElement[] = [];
    ([1, 2, 3] as const).forEach(corteNum => {
      if (evaluationsByCorte[corteNum].length > 0) {
        evaluationsByCorte[corteNum].forEach(ev => {
          headers.push(
            <th key={ev.id} className="p-3 text-sm font-semibold tracking-wide text-left sticky top-0 bg-gray-100 dark:bg-gray-700">
              {ev.name}<br/><span className="font-normal text-xs text-gray-500 dark:text-gray-400">({ev.percentage}%)</span>
            </th>
          );
        });
        headers.push(
          <th key={`total-corte-${corteNum}`} className="p-3 text-sm font-bold tracking-wide text-left sticky top-0 bg-gray-200 dark:bg-gray-600">
            Total Corte {corteNum}
          </th>
        );
      }
    });
    return headers;
  };
  
  const sortedStudents = useMemo(() => {
    const getLastName = (name: string) => name.substring(name.indexOf(' ') + 1);
    return [...students].sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name)));
  }, [students]);

  const handleOpenObservationModal = (student: Student, evaluation: Evaluation, grade?: Grade) => {
    setEditingGrade({ student, evaluation, grade });
    setObservationDraft(grade?.observation ?? '');
  };

  const handleCloseObservationModal = () => {
    setEditingGrade(null);
    setObservationDraft('');
  };

  const handleSaveObservation = async () => {
    if (!editingGrade) return;

    await onUpdateGrade(editingGrade.student.id, editingGrade.evaluation.id, {
      score: editingGrade.grade?.score ?? null,
      observation: observationDraft,
    });

    handleCloseObservationModal();
  };

  return (
    <>
    <div className="overflow-auto rounded-lg shadow-md mt-6">
      <table className="w-full border-collapse bg-white dark:bg-gray-800 text-left text-sm text-gray-500 dark:text-gray-400">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th scope="col" className="p-3 text-sm font-semibold tracking-wide text-left sticky top-0 left-0 bg-gray-100 dark:bg-gray-700 z-10">Estudiante</th>
            <th scope="col" className="p-3 text-sm font-semibold tracking-wide text-left sticky top-0 bg-gray-100 dark:bg-gray-700">Cédula</th>
            <th scope="col" className="p-3 text-sm font-semibold tracking-wide text-left sticky top-0 bg-gray-100 dark:bg-gray-700">Acciones</th>
            {renderHeaders()}
            <th scope="col" className="p-3 text-sm font-bold tracking-wide text-left sticky top-0 bg-gray-200 dark:bg-gray-600">Nota Final</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {sortedStudents.map(student => {
            const weightedCorte1 = calculateWeightedCorteSum(student.id, 1);
            const weightedCorte2 = calculateWeightedCorteSum(student.id, 2);
            const weightedCorte3 = calculateWeightedCorteSum(student.id, 3);
            const finalGrade = weightedCorte1 + weightedCorte2 + weightedCorte3;

            return (
              <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="p-3 font-medium text-gray-700 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-800 z-10">{student.name}</td>
                <td className="p-3">{student.id}</td>
                <td className="p-3">
                  <button
                    onClick={() => onEditStudent(student)}
                    className="p-1 text-gray-500 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors"
                    aria-label={`Editar a ${student.name}`}
                  >
                    <PencilIcon className="w-5 h-5" />
                  </button>
                    <button
                        onClick={() => {
                            if (window.confirm(`¿Estás seguro de que deseas eliminar a ${student.name} de esta materia? Se borrarán todas sus calificaciones.`)) {
                                onUnenrollStudent(student.id);
                            }
                        }}
                        className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        aria-label={`Eliminar a ${student.name}`}
                    >
                        <TrashIcon className="w-5 h-5" />
                    </button>
                </td>
                {([1, 2, 3] as const).map(corteNum => (
                    <React.Fragment key={`${student.id}-corte-${corteNum}`}>
                        {evaluationsByCorte[corteNum].map(ev => {
                            const grade = getGrade(student.id, ev.id);
                            return (
                                <td key={`${student.id}-${ev.id}`} className="p-1">
                                    <div className="flex items-center gap-1">
                                      <input
                                        title={`Nota de ${student.name} en ${ev.name}`}
                                        placeholder="0-20"
                                        type="number"
                                        min="0"
                                        max="20"
                                        step="0.1"
                                        value={grade?.score ?? ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            void onUpdateGrade(student.id, ev.id, {
                                              score: val === '' ? null : Math.max(0, Math.min(20, parseFloat(val))),
                                              observation: grade?.observation ?? '',
                                            });
                                        }}
                                        className="w-20 p-2 border rounded bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleOpenObservationModal(student, ev, grade)}
                                        className={`inline-flex h-10 w-10 items-center justify-center rounded border transition-colors ${grade?.observation?.trim() ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40' : 'border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
                                        title={grade?.observation?.trim() ? grade.observation : `Añadir observación para ${student.name} en ${ev.name}`}
                                        aria-label={grade?.observation?.trim() ? `Editar observación de ${student.name} en ${ev.name}` : `Añadir observación para ${student.name} en ${ev.name}`}
                                      >
                                        <NoteIcon className="h-4 w-4" />
                                      </button>
                                    </div>
                                </td>
                            );
                        })}
                        {evaluationsByCorte[corteNum].length > 0 && (
                            <td className="p-3 font-bold bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                               {calculateNormalizedCorteGrade(student.id, corteNum).toFixed(2)}
                            </td>
                        )}
                    </React.Fragment>
                ))}
                <td className="p-3 font-bold bg-gray-100 dark:bg-gray-600 text-blue-600 dark:text-blue-400">{finalGrade.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <Modal
      isOpen={Boolean(editingGrade)}
      onClose={handleCloseObservationModal}
      title={editingGrade ? `Observación: ${editingGrade.student.name}` : 'Observación'}
    >
      {editingGrade && (
        <div className="space-y-4">
          <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-200">
            <p className="font-medium">{editingGrade.evaluation.name}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Nota actual: {editingGrade.grade?.score ?? 'Sin nota'}</p>
          </div>
          <div>
            <label htmlFor="grade-observation" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notas u observaciones</label>
            <textarea
              id="grade-observation"
              title="Notas u observaciones"
              placeholder="Campo opcional"
              value={observationDraft}
              onChange={(e) => setObservationDraft(e.target.value)}
              rows={4}
              className="mt-1 block w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={handleCloseObservationModal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500">Cancelar</button>
            <button onClick={() => void handleSaveObservation()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Guardar</button>
          </div>
        </div>
      )}
    </Modal>
    </>
  );
};

export default GradeTable;