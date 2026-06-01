import React, { useState } from 'react';
import { Student } from '../types';
import Modal from './Modal';
import { UserPlusIcon } from './Icons';

interface StudentManualEntryProps {
  onAddStudent: (student: Student) => Promise<boolean>; // Returns Promise<true> on success, Promise<false> on failure (e.g., duplicate)
}

const StudentManualEntry: React.FC<StudentManualEntryProps> = ({ onAddStudent }) => {
  const [newStudent, setNewStudent] = useState({ id: '', firstName: '', lastName: '' });
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewStudent(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!newStudent.id.trim() || !newStudent.firstName.trim() || !newStudent.lastName.trim()) {
      setError('Todos los campos son obligatorios.');
      return;
    }

    const success = await onAddStudent({
        id: newStudent.id.trim(),
        firstName: newStudent.firstName.trim(),
        lastName: newStudent.lastName.trim(),
    });

    if (success) {
        setNewStudent({ id: '', firstName: '', lastName: '' });
        setError('');
    } else {
        setError('Este estudiante ya está matriculado en esta materia.');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="id" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cédula de Identidad</label>
        <input type="text" id="id" name="id" value={newStudent.id} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombres</label>
            <input type="text" id="firstName" name="firstName" value={newStudent.firstName} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
        </div>
        <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Apellidos</label>
            <input type="text" id="lastName" name="lastName" value={newStudent.lastName} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
        </div>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex justify-end pt-2">
        <button onClick={handleSubmit} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Matricular Estudiante</button>
      </div>
    </div>
  );
};

export default StudentManualEntry;