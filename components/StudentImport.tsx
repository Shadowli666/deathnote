
import React, { useState, useRef } from 'react';
import { Student } from '../types';
import { UploadCloudIcon } from './Icons';

interface StudentImportProps {
  onStudentsLoaded: (students: Student[]) => void;
}

const StudentImport: React.FC<StudentImportProps> = ({ onStudentsLoaded }) => {
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFeedback(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length <= 1) {
        throw new Error('El archivo CSV está vacío o solo contiene la cabecera.');
      }
      
      const students: Student[] = lines.slice(1).map((line, index) => {
        const [id, name, email] = line.split(',').map(item => item.trim());
        if (!id || !name || !email) {
          throw new Error(`Error en la línea ${index + 2}: Faltan datos. El formato debe ser cedula,nombre,correo.`);
        }
        return { id, name, email };
      });
      
      onStudentsLoaded(students);
      setFeedback({ message: `${students.length} estudiantes cargados exitosamente.`, type: 'success' });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error al procesar el archivo.';
        setFeedback({ message: errorMessage, type: 'error' });
    } finally {
        if(fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Cargar Estudiantes (CSV)</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">El archivo debe tener el formato: <code className="bg-gray-200 dark:bg-gray-700 p-1 rounded text-xs">cedula,nombre,correo</code> con una cabecera.</p>
      <input
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        ref={fileInputRef}
      />
      {feedback && (
        <p className={`mt-3 text-sm ${feedback.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {feedback.message}
        </p>
      )}
    </div>
  );
};

export default StudentImport;
