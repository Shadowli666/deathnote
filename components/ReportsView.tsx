import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Subject, Student, Evaluation, Grade } from '../types';
import { DownloadIcon } from './Icons';

declare var Chart: any;
declare var jspdf: any;
declare var html2canvas: any;

interface ReportsViewProps {
  subject: Subject;
  students: Student[];
  evaluations: Evaluation[];
  grades: Grade[];
  onClose: () => void;
}

type Stats = {
    average: number;
    highest: number;
    lowest: number;
    passed: number;
    failed: number;
    passRate: number;
    distribution: number[];
    approvedStudents: { name: string; score: number }[];
    failedStudents: { name: string; score: number }[];
};

type ActiveTab = 'general' | 'corte1' | 'corte2' | 'corte3' | 'evaluations' | 'export';

const ReportsView: React.FC<ReportsViewProps> = ({ subject, students, evaluations, grades, onClose }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('general');
    const [selectedEvaluationId, setSelectedEvaluationId] = useState<string>('');
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<any>(null);
    const reportContentRef = useRef<HTMLDivElement>(null);

    // Set the first evaluation as default for the 'evaluations' tab
    useEffect(() => {
        if (evaluations.length > 0) {
            setSelectedEvaluationId(evaluations[0].id);
        }
    }, [evaluations]);

    const getGrade = useCallback((studentId: string, evaluationId: string): Grade | undefined => {
        return grades.find(g => g.studentId === studentId && g.evaluationId === evaluationId);
    }, [grades]);

    const calculateStats = useCallback((studentScores: { name: string; score: number }[], passingGrade = 10): Stats => {
        if (studentScores.length === 0) {
            return { average: 0, highest: 0, lowest: 0, passed: 0, failed: 0, passRate: 0, distribution: [0,0,0,0,0], approvedStudents: [], failedStudents: [] };
        }

        const scores = studentScores.map(s => s.score);
        const average = scores.reduce((a, b) => a + b, 0) / scores.length;
        const highest = Math.max(...scores);
        const lowest = Math.min(...scores);
        const passed = scores.filter(s => s >= passingGrade).length;
        const failed = scores.length - passed;
        const passRate = (passed / scores.length) * 100;
        
        const distribution = [0, 0, 0, 0, 0]; // Ranges: 0-3.9, 4-7.9, 8-11.9, 12-15.9, 16-20
        scores.forEach(score => {
            if (score < 4) distribution[0]++;
            else if (score < 8) distribution[1]++;
            else if (score < 12) distribution[2]++;
            else if (score < 16) distribution[3]++;
            else distribution[4]++;
        });
        
        const approvedStudents = studentScores.filter(s => s.score >= passingGrade).sort((a,b) => b.score - a.score);
        const failedStudents = studentScores.filter(s => s.score < passingGrade).sort((a,b) => b.score - a.score);

        return {
            average: parseFloat(average.toFixed(2)),
            highest: parseFloat(highest.toFixed(2)),
            lowest: parseFloat(lowest.toFixed(2)),
            passed,
            failed,
            passRate: parseFloat(passRate.toFixed(2)),
            distribution,
            approvedStudents,
            failedStudents,
        };
    }, []);

    const allStats = useMemo(() => {
        // Final grade stats
        const finalGrades = students.map(student => {
            const finalGrade = evaluations.reduce((total, ev) => {
                const grade = getGrade(student.id, ev.id);
                return total + (grade?.score ?? 0) * (ev.percentage / 100);
            }, 0);
            return { name: student.name, score: finalGrade };
        });

        // Term (Corte) stats, normalized to 20 points
        const cortes: { [key: number]: {name: string, score: number}[] } = { 1: [], 2: [], 3: [] };
        students.forEach(student => {
            ([1, 2, 3] as const).forEach(corteNum => {
                const corteEvals = evaluations.filter(ev => ev.corte === corteNum);
                if (corteEvals.length > 0) {
                    const corteTotal = corteEvals.reduce((total, ev) => {
                         const grade = getGrade(student.id, ev.id);
                         return total + (grade?.score ?? 0) * (ev.percentage / 100);
                    }, 0);
                    const totalPercentage = corteEvals.reduce((p, ev) => p + ev.percentage, 0);
                    // Normalize the score to a 0-20 scale for the term report
                    const normalizedScore = totalPercentage > 0 ? (corteTotal / (totalPercentage / 100)) : 0;
                    cortes[corteNum].push({ name: student.name, score: normalizedScore });
                }
            });
        });

        // Individual evaluation stats (raw score 0-20)
        const evaluationStats = evaluations.reduce((acc, ev) => {
            const studentScores = students.map(student => ({
                name: student.name,
                score: getGrade(student.id, ev.id)?.score ?? 0,
            }));
            acc[ev.id] = calculateStats(studentScores);
            return acc;
        }, {} as Record<string, Stats>);

        return {
            general: calculateStats(finalGrades),
            corte1: calculateStats(cortes[1]),
            corte2: calculateStats(cortes[2]),
            corte3: calculateStats(cortes[3]),
            evaluations: evaluationStats,
        };
    }, [students, evaluations, grades, getGrade, calculateStats]);

    const currentStats = useMemo(() => {
        if (activeTab === 'evaluations' && selectedEvaluationId) return allStats.evaluations[selectedEvaluationId];
        if (activeTab === 'general' || activeTab === 'corte1' || activeTab === 'corte2' || activeTab === 'corte3') {
            return allStats[activeTab];
        }
        return null;
    }, [activeTab, selectedEvaluationId, allStats]);

    useEffect(() => {
        if (chartRef.current && currentStats) {
            if (chartInstance.current) chartInstance.current.destroy();
            
            const ctx = chartRef.current.getContext('2d');
            chartInstance.current = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['0-3.9', '4-7.9', '8-11.9', '12-15.9', '16-20'],
                    datasets: [{
                        label: 'Nº de Estudiantes',
                        data: currentStats.distribution,
                        backgroundColor: 'rgba(59, 130, 246, 0.5)',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 1
                    }]
                },
                options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
            });
        }
    }, [currentStats]);
    
    const handleExportPDF = () => {
        if (!reportContentRef.current) return;
        const { jsPDF } = jspdf;
        html2canvas(reportContentRef.current, { scale: 2 }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 5, 5, pdfWidth-10, pdfHeight-10);
            const evalName = activeTab === 'evaluations' && selectedEvaluationId ? evaluations.find(e => e.id === selectedEvaluationId)?.name.replace(/\s+/g, '_') : activeTab;
            pdf.save(`reporte_${subject.name.replace(/\s+/g, '_')}_${evalName}.pdf`);
        });
    };

    const handleDownloadCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        const headers = ["Cedula", "Nombre", "Correo"];
        const corteEvals: Evaluation[][] = [[], [], []];
        evaluations.sort((a,b)=> a.corte - b.corte || a.name.localeCompare(b.name)).forEach(ev => corteEvals[ev.corte-1].push(ev));
        
        corteEvals.forEach((evals, i) => {
            if(evals.length > 0) {
                evals.forEach(ev => headers.push(`"${ev.name} (${ev.percentage}%)"`));
                headers.push(`Total Corte ${i+1}`);
            }
        });
        headers.push("Nota Final");
        csvContent += headers.join(",") + "\n";
        
        students.sort((a,b) => a.name.localeCompare(b.name)).forEach(student => {
            const row = [student.id, `"${student.name}"`, student.email];
            let finalGrade = 0;
            corteEvals.forEach((evals) => {
                if(evals.length > 0) {
                    let corteTotal = 0;
                    evals.forEach(ev => {
                        const grade = getGrade(student.id, ev.id);
                        const score = grade?.score ?? 0;
                        corteTotal += score * (ev.percentage / 100);
                        row.push(score.toFixed(2));
                    });
                    row.push(corteTotal.toFixed(2));
                    finalGrade += corteTotal;
                }
            });
            row.push(finalGrade.toFixed(2));
            csvContent += row.join(",") + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `calificaciones_detalladas_${subject.name.replace(/\s+/g, '_')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const ReportDetails = ({ stats }: { stats: Stats | null }) => {
        if (!stats) {
            return <div className="text-center py-10"><p className="text-gray-500 dark:text-gray-400">Selecciona una evaluación para ver sus estadísticas.</p></div>;
        }
        if (students.length === 0) {
             return <div className="text-center py-10"><p className="text-gray-500 dark:text-gray-400">No hay datos suficientes para generar este reporte.</p></div>;
        }
        return (
             <div ref={reportContentRef} className="p-4 bg-white dark:bg-gray-800">
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <StatCard title="Promedio" value={stats.average} />
                    <StatCard title="Nota Más Alta" value={stats.highest} />
                    <StatCard title="Nota Más Baja" value={stats.lowest} />
                    <StatCard title="Aprobados (>= 10)" value={`${stats.passed} de ${stats.passed + stats.failed}`} />
                    <StatCard title="Reprobados (< 10)" value={`${stats.failed} de ${stats.passed + stats.failed}`} />
                    <StatCard title="Tasa de Aprobación" value={`${stats.passRate}%`} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-100">Distribución de Calificaciones</h3>
                        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"><canvas ref={chartRef}></canvas></div>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-semibold mb-2 text-green-600 dark:text-green-400">Aprobados ({stats.approvedStudents.length})</h3>
                            <StudentList students={stats.approvedStudents} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold mb-2 text-red-600 dark:text-red-400">Reprobados ({stats.failedStudents.length})</h3>
                            <StudentList students={stats.failedStudents} />
                        </div>
                    </div>
                </div>
            </div>
        )
    };

    const renderContent = () => {
        if (activeTab === 'export') {
            return (
                <div className="text-center p-8">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Exportar Datos Detallados</h3>
                    <p className="mb-6 text-gray-600 dark:text-gray-400">Descarga un archivo CSV con todas las calificaciones, incluyendo cada evaluación, los totales por corte y la nota final de cada estudiante.</p>
                    <button onClick={handleDownloadCSV} className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-colors mx-auto">
                        <DownloadIcon className="w-5 h-5" />
                        Descargar CSV Completo
                    </button>
                </div>
            )
        }
        if (activeTab === 'evaluations') {
            return (
                <div className="p-4">
                    <select
                        value={selectedEvaluationId}
                        onChange={e => setSelectedEvaluationId(e.target.value)}
                        className="w-full max-w-sm mb-4 p-2 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">-- Selecciona una Evaluación --</option>
                        {([1, 2, 3] as const).map(corteNum => {
                            const corteEvals = evaluations.filter(ev => ev.corte === corteNum);
                            if (corteEvals.length === 0) return null;
                            return (
                                <optgroup key={corteNum} label={`Corte ${corteNum}`}>
                                    {corteEvals.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                                </optgroup>
                            );
                        })}
                    </select>
                    <ReportDetails stats={currentStats} />
                </div>
            );
        }
        
        return <ReportDetails stats={currentStats} />
    };

    const TabButton = ({ id, label }: { id: ActiveTab, label: string}) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === id ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
        >{label}</button>
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-6xl m-4 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-start p-4 border-b dark:border-gray-700 flex-shrink-0">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Reportes: {subject.name}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{subject.period}</p>
                  </div>
                  <button onClick={onClose} className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
                
                <div className="flex border-b dark:border-gray-700 flex-shrink-0 flex-wrap">
                    <TabButton id="general" label="Resumen General" />
                    <TabButton id="corte1" label="Corte 1" />
                    <TabButton id="corte2" label="Corte 2" />
                    <TabButton id="corte3" label="Corte 3" />
                    <TabButton id="evaluations" label="Por Evaluación" />
                    <TabButton id="export" label="Exportar Datos" />
                </div>
                
                <div className="overflow-y-auto flex-grow bg-gray-50 dark:bg-gray-900">
                    {renderContent()}
                </div>

                <div className="flex justify-end p-4 border-t dark:border-gray-700 flex-shrink-0">
                    {activeTab !== 'export' && currentStats && students.length > 0 && (
                        <button onClick={handleExportPDF} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors">
                            <DownloadIcon className="w-5 h-5" />
                            Exportar Vista a PDF
                        </button>
                    )}
                     <button onClick={onClose} className="ml-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500">Cerrar</button>
                </div>
            </div>
        </div>
    );
};

const StatCard: React.FC<{ title: string; value: string | number }> = ({ title, value }) => (
    <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg shadow">
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{value}</p>
    </div>
);

const StudentList: React.FC<{ students: {name: string, score: number}[] }> = ({ students }) => (
    <div className="bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg max-h-60 overflow-y-auto">
        {students.length > 0 ? (
            <ul className="divide-y dark:divide-gray-600">
                {students.map(s => (
                    <li key={s.name} className="flex justify-between items-center p-2">
                        <span className="text-sm text-gray-700 dark:text-gray-300">{s.name}</span>
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{s.score.toFixed(2)}</span>
                    </li>
                ))}
            </ul>
        ) : (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 p-4">No hay estudiantes en esta categoría.</p>
        )}
    </div>
);

export default ReportsView;