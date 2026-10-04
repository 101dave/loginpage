/**
 * ==========================================
 * DATABASE ENGINE (IndexedDB / Dexie.js)
 * ==========================================
 */
export const db = new Dexie('AttendanceSystemDB');

// Explicit Database Versioning & Migration Pipeline
db.version(1).stores({
    teachers: 'id, email, name, department',
    students: 'id, studentId, name, department, sectionId',
    sections: 'id, code, name',
    subjects: 'id, code, name',
    attendance_records: 'id, date, studentId, subjectId, sectionId, status'
});

export const AppDB = {
    async initDB() {
        try {
            await db.open();
            const teacherCount = await db.teachers.count();
            if (teacherCount === 0) {
                await this.seedInitialData();
            }
            return "JS IndexedDB Active";
        } catch (err) {
            console.error("Database Init Failed:", err);
            throw new Error("IndexedDB Init Error");
        }
    },

    // Initial Seed Data with Transaction Safety
    async seedInitialData() {
        await db.transaction('rw', db.teachers, db.students, db.sections, db.subjects, db.attendance_records, async () => {
            await db.teachers.clear();
            await db.students.clear();
            await db.sections.clear();
            await db.subjects.clear();
            await db.attendance_records.clear();

            const teachers = [
                { id: 't1', email: 'sarah.jenkins@university.edu', name: 'Prof. Sarah Jenkins', department: 'Computer Science', role: 'Department Head' },
                { id: 't2', email: 'mark.davis@university.edu', name: 'Prof. Mark Davis', department: 'Mathematics', role: 'Associate Professor' }
            ];

            const sections = [
                { id: 'sec-cs101', code: 'CS-101', name: 'Computer Science Sec A' },
                { id: 'sec-cs202', code: 'CS-202', name: 'Computer Science Sec B' },
                { id: 'sec-m101', code: 'MATH-101', name: 'Calculus & Algebra Sec 1' }
            ];

            const subjects = [
                { id: 'sub-alg', code: 'CS101-ALG', name: 'Algorithms & Data Structures' },
                { id: 'sub-web', code: 'CS202-WEB', name: 'Full-Stack Web Engineering' },
                { id: 'sub-mth', code: 'MTH101-CAL', name: 'Linear Algebra & Calculus' }
            ];

            const students = [
                { id: 'st-1', studentId: 'STU-1001', name: 'Alexander Vance', department: 'Computer Science', sectionId: 'sec-cs101' },
                { id: 'st-2', studentId: 'STU-1002', name: 'Beatrix Thorne', department: 'Computer Science', sectionId: 'sec-cs101' },
                { id: 'st-3', studentId: 'STU-1003', name: 'Cyrus Sterling', department: 'Computer Science', sectionId: 'sec-cs101' },
                { id: 'st-4', studentId: 'STU-1004', name: 'Diana Prince', department: 'Computer Science', sectionId: 'sec-cs101' },
                { id: 'st-5', studentId: 'STU-1005', name: 'Ethan Hunt', department: 'Computer Science', sectionId: 'sec-cs101' },
                { id: 'st-6', studentId: 'STU-2001', name: 'Fiona Gallagher', department: 'Computer Science', sectionId: 'sec-cs202' },
                { id: 'st-7', studentId: 'STU-2002', name: 'Gabriel Ross', department: 'Computer Science', sectionId: 'sec-cs202' },
                { id: 'st-8', studentId: 'STU-2003', name: 'Hannah Abbott', department: 'Computer Science', sectionId: 'sec-cs202' },
                { id: 'st-9', studentId: 'STU-3001', name: 'Ian Malcolm', department: 'Mathematics', sectionId: 'sec-m101' },
                { id: 'st-10', studentId: 'STU-3002', name: 'Julia Roberts', department: 'Mathematics', sectionId: 'sec-m101' }
            ];

            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            const attendanceRecords = [
                { id: 'att-1', date: yesterday, studentId: 'st-1', subjectId: 'sub-alg', sectionId: 'sec-cs101', status: 'present', excusedReason: '', timestamp: Date.now(), markedByTeacherId: 't1' },
                { id: 'att-2', date: yesterday, studentId: 'st-2', subjectId: 'sub-alg', sectionId: 'sec-cs101', status: 'present', excusedReason: '', timestamp: Date.now(), markedByTeacherId: 't1' },
                { id: 'att-3', date: yesterday, studentId: 'st-3', subjectId: 'sub-alg', sectionId: 'sec-cs101', status: 'absent', excusedReason: '', timestamp: Date.now(), markedByTeacherId: 't1' },
                { id: 'att-4', date: yesterday, studentId: 'st-4', subjectId: 'sub-alg', sectionId: 'sec-cs101', status: 'excused', excusedReason: 'Medical Note', timestamp: Date.now(), markedByTeacherId: 't1' },
                { id: 'att-5', date: yesterday, studentId: 'st-5', subjectId: 'sub-alg', sectionId: 'sec-cs101', status: 'late', excusedReason: '', timestamp: Date.now(), markedByTeacherId: 't1' }
            ];

            await db.teachers.bulkAdd(teachers);
            await db.sections.bulkAdd(sections);
            await db.subjects.bulkAdd(subjects);
            await db.students.bulkAdd(students);
            await db.attendance_records.bulkAdd(attendanceRecords);
        });
    },

    async getTeachers() { return await db.teachers.toArray(); },
    async getSections() { return await db.sections.toArray(); },
    async getSubjects() { return await db.subjects.toArray(); },

    async saveSection(sectionData) {
        if (!sectionData.code || !sectionData.name) throw new Error("Section code and name are required.");
        if (!sectionData.id) sectionData.id = 'sec-' + Date.now();
        await db.sections.put(sectionData);
        return sectionData;
    },

    async getStudents(sectionId = null) {
        if (sectionId && sectionId !== 'ALL') {
            return await db.students.where('sectionId').equals(sectionId).toArray();
        }
        return await db.students.toArray();
    },

    async saveStudent(studentData) {
        if (!studentData.studentId || !studentData.name) throw new Error("Student ID and Name are required.");
        // Validation check for duplicate Student IDs
        const existing = await db.students.where('studentId').equals(studentData.studentId).first();
        if (existing && existing.id !== studentData.id) {
            throw new Error(`Student ID ${studentData.studentId} already exists in database.`);
        }
        if (!studentData.id) studentData.id = 'st-' + Date.now();
        await db.students.put(studentData);
        return studentData;
    },

    async deleteStudent(studentId) {
        await db.transaction('rw', db.students, db.attendance_records, async () => {
            await db.students.delete(studentId);
            await db.attendance_records.where('studentId').equals(studentId).delete();
        });
    },

    async bulkDeleteStudents(studentIds) {
        await db.transaction('rw', db.students, db.attendance_records, async () => {
            await db.students.bulkDelete(studentIds);
            for (const id of studentIds) {
                await db.attendance_records.where('studentId').equals(id).delete();
            }
        });
    },

    async updateStudentSection(studentId, newSectionId) {
        await db.students.update(studentId, { sectionId: newSectionId });
    },

    async saveAttendance(records) {
        await db.transaction('rw', db.attendance_records, async () => {
            for (const rec of records) {
                const existing = await db.attendance_records
                    .where({ date: rec.date, studentId: rec.studentId, subjectId: rec.subjectId })
                    .first();

                if (existing) {
                    await db.attendance_records.update(existing.id, rec);
                } else {
                    if (!rec.id) rec.id = 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
                    await db.attendance_records.add(rec);
                }
            }
        });
    },

    async getAttendanceForDateAndSection(date, sectionId, subjectId) {
        return await db.attendance_records
            .where('date').equals(date)
            .filter(r => r.sectionId === sectionId && r.subjectId === subjectId)
            .toArray();
    },

    async getAttendanceLogs() {
        return await db.attendance_records.toArray();
    },

    async exportDatabaseJSON() {
        return {
            teachers: await db.teachers.toArray(),
            students: await db.students.toArray(),
            sections: await db.sections.toArray(),
            subjects: await db.subjects.toArray(),
            attendance_records: await db.attendance_records.toArray()
        };
    }
};