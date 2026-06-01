import { DatabaseSync } from 'node:sqlite';

const dbPath = './data/deathnote.sqlite';
const db = new DatabaseSync(dbPath);

const subjectId = 'subject-1778533780243-30a16abd';
const evaluationId = 'eval-1778869685917-4d0e34c4';

const rawData = `Albert Gutierrez|20|Resolvió los ejercicios en archivos separados en lugar de uno solo.
Allan Parra|18|Invirtió las fórmulas matemáticas para la conversión de temperatura.
Angel Diaz|20|
Carlos Zambrano|20|
David Valero|20|Resolvió los ejercicios correctamente, en archivos separados.
Diego Acevedo|19|Lógica matemática correcta pero omitió parámetros en algunas funciones e imprimió en lugar de retornar.
Direl Rodriguez|20|
Francisco Bozo|20|
Isabel Melendez|19|Impresión directa dentro de la función en lugar de usar retornos en algunos ejercicios.
Juan Solarte|20|
Luis Gutierrez|20|Resolvió los ejercicios correctamente, en archivos separados.
Luis Urribarri|20|
Marcos Cabrera|20|
Maria Marquez|20|`;

const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Get enrolled students
const enrolled = db.prepare(`SELECT s.id, s.name FROM students s JOIN enrollments e ON s.id = e.studentId WHERE e.subjectId = ?`).all(subjectId);

const nameDict = {};
for (const s of enrolled) {
    nameDict[normalize(s.name)] = s.id;
}

const lines = rawData.split('\n');
const insertGrade = db.prepare(`INSERT INTO grades (studentId, evaluationId, score, observation) VALUES (?, ?, ?, ?) ON CONFLICT(studentId, evaluationId) DO UPDATE SET score=excluded.score, observation=excluded.observation`);

const insertStudent = db.prepare(`INSERT INTO students (id, name) VALUES (?, ?)`);
const enrollStudent = db.prepare(`INSERT INTO enrollments (studentId, subjectId) VALUES (?, ?)`);

for (const line of lines) {
    if (!line.trim()) continue;
    let [name, score, obs] = line.split('|');
    obs = obs || '';
    const norm = normalize(name);
    
    let sid = nameDict[norm];
    if (!sid) {
        // Create new student
        console.log(`Student not found: ${name}. Creating new record.`);
        sid = `tmp-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        insertStudent.run(sid, name.trim());
        enrollStudent.run(sid, subjectId);
        nameDict[norm] = sid; // ensure we use the same ID if it appears again
    }

    insertGrade.run(sid, evaluationId, parseFloat(score), obs.trim());
    console.log(`Inserted grade for ${name}: ${score}`);
}

console.log("Done!");
