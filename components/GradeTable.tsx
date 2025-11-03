import React, { useMemo, useCallback } from 'react';
import { Student, Evaluation, Grade } from '../types';
import { TrashIcon } from './Icons';

interface GradeTableProps {
  students: Student[];
  evaluations: Evaluation[];
  grades: Grade[];
  onUpdateGrade: (studentId: string, evaluationId: string, score: number | null) => void;
  onUnenrollStudent: (studentId: string) => void;
}

const GradeTable: React.FC<GradeTableProps> = ({ students, evaluations, grades, onUpdateGrade, onUnenrollStudent }) => {
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
  
  const sortedStudents = useMemo(() => [...students].sort((a, b) => a.name.localeCompare(b.name)), [students]);

  return (
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
                                    <input
                                        type="number"
                                        min="0"
                                        max="20"
                                        step="0.1"
                                        value={grade?.score ?? ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            onUpdateGrade(student.id, ev.id, val === '' ? null : Math.max(0, Math.min(20, parseFloat(val))));
                                        }}
                                        className="w-20 p-2 border rounded bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
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
  );
};

export default GradeTable;