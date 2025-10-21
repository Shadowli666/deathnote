export type Student = {
  id: string; // Cedula
  name: string;
  email: string;
};

export type Evaluation = {
  id: string;
  subjectId: string;
  corte: 1 | 2 | 3;
  name: string;
  percentage: number; // Stored as 0-100
};

export type Grade = {
  studentId: string;
  evaluationId: string;
  score: number | null; // 0-20
};

export type Subject = {
  id: string;
  name: string;
  period: string;
};

export type Enrollment = {
  studentId: string;
  subjectId: string;
};
