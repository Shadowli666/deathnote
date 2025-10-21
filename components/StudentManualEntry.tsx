import React, { useState } from 'react';
import { Student } from '../types';
import Modal from './Modal';
import { UserPlusIcon } from './Icons';

interface StudentManualEntryProps {
  onAddStudent: (student: Student) => Promise<boolean>; // Returns Promise<true> on success, Promise<false> on failure (e.g., duplicate)
}

const StudentManualEntry: React.FC<StudentManualEntryProps> = ({ onAddStudent }) => {
  const [newStudent, setNewStudent] = useState({ id: '', name: '', email: '' });
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewStudent(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!newStudent.id.trim() || !newStudent.name.trim() || !newStudent.email.trim()) {
      setError('Todos los campos son obligatorios.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(newStudent.email)) {
      setError('Por favor, introduce un correo electrónico válido.');
      return;
    }

    const success = await onAddStudent({
        id: newStudent.id.trim(),
        name: newStudent.name.trim(),
        email: newStudent.email.trim(),
    });

    if (success) {
        setNewStudent({ id: '', name: '', email: '' });
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
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre Completo</label>
        <input type="text" id="name" name="name" value={newStudent.name} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Correo Electrónico</label>
        <input type="email" id="email" name="email" value={newStudent.email} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex justify-end pt-2">
        <button onClick={handleSubmit} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Matricular Estudiante</button>
      </div>
    </div>
  );
};

export default StudentManualEntry;