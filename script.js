import { AppDB } from './db.js';

let currentUser = null;
let currentTab = 'mark-attendance';
let currentAttendanceState = {}; 
let currentStudentsCache = [];
let selectedRosterIds = new Set();
let activeExcusedStudentId = null;
let pendingConfirmCallback = null;

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('att-date').value = new Date().toISOString().split('T')[0];

    try {
        const statusMsg = await AppDB.initDB();
        updateNavbarStatus(statusMsg);
    } catch (err) {
        updateNavbarStatus("IndexedDB Init Error");
        showToast(err.message, 'error');
    }

    await populateDropdowns();
    checkSession();
    initEventListeners();
});

function updateNavbarStatus(msg) {
    const el = document.getElementById('db-status-text');
    if (el) el.innerText = msg;
}

function checkSession() {
    const saved = localStorage.getItem('attendx_active_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        renderUserNavbar();
        document.getElementById('view-login').classList.add('hidden');
        document.getElementById('app-nav-tabs').classList.remove('hidden');
        switchTab('mark-attendance');
    } else {
        renderUserNavbar();
        renderDemoTeachersList();
        document.getElementById('view-login').classList.remove('hidden');
        document.getElementById('app-nav-tabs').classList.add('hidden');
        hideAllViews();
    }
}

async function renderDemoTeachersList() {
    try {
        const teachers = await AppDB.getTeachers();
        const container = document.getElementById('demo-teachers-list');
        container.innerHTML = teachers.map(t => `
            <button type="button" data-email="${t.email}" class="demo-login-btn w-full p-2.5 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 rounded-lg text-left transition flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-zinc-900 dark:text-zinc-100">${t.name}</p>
                    <p class="text-[11px] text-zinc-500 dark:text-zinc-400">${t.department} • ${t.email}</p>
                </div>
                <i class="fa-solid fa-arrow-right-to-bracket text-zinc-400 text-xs" aria-hidden="true"></i>
            </button>
        `).join('');

        document.querySelectorAll('.demo-login-btn').forEach(btn => {
            btn.addEventListener('click', () => quickLogin(btn.getAttribute('data-email')));
        });
    } catch (err) {
        console.error(err);
    }
}

async function quickLogin(email) {
    const teachers = await AppDB.getTeachers();
    const found = teachers.find(t => t.email === email);
    if (found) {
        currentUser = found;
        localStorage.setItem('attendx_active_user', JSON.stringify(currentUser));
        checkSession();
        showToast(`Welcome back, ${currentUser.name}`);
        announceToScreenReader(`Signed in as ${currentUser.name}`);
    }
}

function logout() {
    localStorage.removeItem('attendx_active_user');
    currentUser = null;
    checkSession();
    showToast('Signed out successfully.');
    announceToScreenReader('Signed out successfully');
}

function renderUserNavbar() {
    const container = document.getElementById('user-navbar-container');
    if (currentUser) {
        container.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="w-8 h-8 rounded-full bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-bold text-xs flex items-center justify-center">
                    ${currentUser.name.split(' ').map(n=>n[0]).join('')}
                </div>
                <div class="hidden sm:block text-left">
                    <p class="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-none">${currentUser.name}</p>
                    <p class="text-[10px] text-zinc-500 leading-tight mt-0.5">${currentUser.department}</p>
                </div>
                <button type="button" id="btn-logout" title="Logout" aria-label="Logout" class="p-1.5 text-zinc-400 hover:text-rose-600 transition">
                    <i class="fa-solid fa-arrow-right-from-bracket text-xs" aria-hidden="true"></i>
                </button>
            </div>
        `;
        document.getElementById('btn-logout').addEventListener('click', logout);
    } else {
        container.innerHTML = `<span class="text-xs font-semibold text-zinc-400">Not Logged In</span>`;
    }
}

function hideAllViews() {
    ['mark-attendance', 'student-roster', 'reports-analytics'].forEach(id => {
        document.getElementById(`view-${id}`).classList.add('hidden');
    });
}

function switchTab(tabId) {
    currentTab = tabId;
    hideAllViews();

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('border-zinc-900', 'dark:border-zinc-100', 'text-zinc-900', 'dark:text-white');
        btn.classList.add('border-transparent', 'text-zinc-500', 'dark:text-zinc-400');
    });

    const activeBtn = document.getElementById(`tab-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.remove('border-transparent', 'text-zinc-500', 'dark:text-zinc-400');
        activeBtn.classList.add('border-zinc-900', 'dark:border-zinc-100', 'text-zinc-900', 'dark:text-white');
    }

    document.getElementById(`view-${tabId}`).classList.remove('hidden');

    if (tabId === 'mark-attendance') loadAttendanceSheet();
    if (tabId === 'student-roster') renderRosterTable();
    if (tabId === 'reports-analytics') renderAnalyticsView();
}

async function populateDropdowns() {
    const sections = await AppDB.getSections();
    const subjects = await AppDB.getSubjects();

    const attSubjectSelect = document.getElementById('att-subject-select');
    attSubjectSelect.innerHTML = subjects.map(s => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join('');

    const attSectionSelect = document.getElementById('att-section-select');
    attSectionSelect.innerHTML = sections.map(s => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join('');

    const rosterFilter = document.getElementById('roster-section-filter');
    rosterFilter.innerHTML = `<option value="ALL">All Sections</option>` + sections.map(s => `<option value="${s.id}">${s.code}</option>`).join('');

    const studentFormSec = document.getElementById('student-form-section');
    studentFormSec.innerHTML = sections.map(s => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join('');

    const bulkMoveSec = document.getElementById('bulk-target-section');
    bulkMoveSec.innerHTML = sections.map(s => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join('');

    document.getElementById('hist-filter-subject').innerHTML = `<option value="ALL">All Subjects</option>` + subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    document.getElementById('hist-filter-section').innerHTML = `<option value="ALL">All Sections</option>` + sections.map(s => `<option value="${s.id}">${s.code}</option>`).join('');
}

async function loadAttendanceSheet() {
    const sectionId = document.getElementById('att-section-select').value;
    const subjectId = document.getElementById('att-subject-select').value;
    const date = document.getElementById('att-date').value;

    if (!sectionId || !subjectId || !date) return;

    currentStudentsCache = await AppDB.getStudents(sectionId);
    const savedRecords = await AppDB.getAttendanceForDateAndSection(date, sectionId, subjectId);

    currentAttendanceState = {};
    currentStudentsCache.forEach(s => {
        const rec = savedRecords.find(r => r.studentId === s.id);
        currentAttendanceState[s.id] = {
            status: rec ? rec.status : 'present',
            reason: rec ? rec.excusedReason || '' : ''
        };
    });

    renderAttendanceSheetUI();
}

function renderAttendanceSheetUI() {
    const students = currentStudentsCache;
    const tbody = document.getElementById('attendance-table-body');

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-xs text-zinc-400">No students enrolled in this section.</td></tr>`;
    } else {
        tbody.innerHTML = students.map(s => {
            const stState = currentAttendanceState[s.id] || { status: 'present', reason: '' };
            const safeName = (s.name || '').replace(/'/g, "\\'");
            return `
                <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition">
                    <td class="px-6 py-3.5 font-mono text-xs font-semibold text-zinc-500 dark:text-zinc-400">${s.studentId}</td>
                    <td class="px-6 py-3.5 font-medium text-zinc-900 dark:text-zinc-100">${s.name}</td>
                    <td class="px-6 py-3.5 text-xs text-zinc-500 dark:text-zinc-400">${s.department}</td>
                    <td class="px-6 py-3.5 text-center">
                        <div class="inline-flex rounded-lg p-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 gap-1" role="group" aria-label="Attendance status options">
                            <button type="button" data-student="${s.id}" data-status="present" class="att-status-btn px-3 py-1 rounded-md text-xs font-medium transition ${stState.status === 'present' ? 'bg-emerald-600 text-white shadow-xs' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'}">Present</button>
                            <button type="button" data-student="${s.id}" data-status="absent" class="att-status-btn px-3 py-1 rounded-md text-xs font-medium transition ${stState.status === 'absent' ? 'bg-rose-600 text-white shadow-xs' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'}">Absent</button>
                            <button type="button" data-student="${s.id}" data-status="late" class="att-status-btn px-3 py-1 rounded-md text-xs font-medium transition ${stState.status === 'late' ? 'bg-amber-500 text-white shadow-xs' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'}">Late</button>
                            <button type="button" data-student="${s.id}" data-status="excused" data-name="${safeName}" class="att-excused-btn px-3 py-1 rounded-md text-xs font-medium transition ${stState.status === 'excused' ? 'bg-sky-600 text-white shadow-xs' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'}">Excused</button>
                        </div>
                    </td>
                    <td class="px-6 py-3.5 text-xs text-zinc-500 dark:text-zinc-400">
                        ${stState.reason ? `<span class="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${stState.reason}</span>` : '—'}
                    </td>
                </tr>
            `;
        }).join('');

        document.querySelectorAll('.att-status-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                setStatus(btn.getAttribute('data-student'), btn.getAttribute('data-status'));
            });
        });
        document.querySelectorAll('.att-excused-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                openExcusedModal(btn.getAttribute('data-student'), btn.getAttribute('data-name'));
            });
        });
    }

    updateAttendanceCounters();
}

function setStatus(studentId, status, reason = '') {
    currentAttendanceState[studentId] = { status, reason };
    renderAttendanceSheetUI();
}

function markAllStatus(status) {
    Object.keys(currentAttendanceState).forEach(stId => {
        currentAttendanceState[stId].status = status;
        if (status !== 'excused') currentAttendanceState[stId].reason = '';
    });
    renderAttendanceSheetUI();
}

function updateAttendanceCounters() {
    const list = Object.values(currentAttendanceState);
    const total = list.length;
    const present = list.filter(i => i.status === 'present').length;
    const absent = list.filter(i => i.status === 'absent').length;
    const late = list.filter(i => i.status === 'late').length;
    const excused = list.filter(i => i.status === 'excused').length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    document.getElementById('cnt-total').innerText = total;
    document.getElementById('cnt-present').innerText = present;
    document.getElementById('cnt-absent').innerText = absent;
    document.getElementById('cnt-late').innerText = late;
    document.getElementById('cnt-excused').innerText = excused;
    document.getElementById('cnt-rate').innerText = `${rate}%`;
}

async function saveCurrentAttendance() {
    const sectionId = document.getElementById('att-section-select').value;
    const subjectId = document.getElementById('att-subject-select').value;
    const date = document.getElementById('att-date').value;

    const records = Object.keys(currentAttendanceState).map(studentId => ({
        date,
        studentId,
        subjectId,
        sectionId,
        status: currentAttendanceState[studentId].status,
        excusedReason: currentAttendanceState[studentId].reason || '',
        timestamp: Date.now(),
        markedByTeacherId: currentUser ? currentUser.id : 't1'
    }));

    try {
        await AppDB.saveAttendance(records);
        showToast(`Saved attendance sheet for ${records.length} students!`);
        announceToScreenReader(`Attendance saved successfully. ${records.length} students updated.`);
    } catch (err) {
        showToast(`Failed to save attendance: ${err.message}`, 'error');
    }
}

function openExcusedModal(studentId, name) {
    activeExcusedStudentId = studentId;
    document.getElementById('excused-student-name').innerText = name;
    document.getElementById('custom-excused-note').value = currentAttendanceState[studentId]?.reason || '';
    document.getElementById('modal-excused-reason').classList.remove('hidden');
    document.getElementById('custom-excused-note').focus();
}

function closeExcusedModal() {
    document.getElementById('modal-excused-reason').classList.add('hidden');
    activeExcusedStudentId = null;
}

function saveExcusedReason() {
    const note = document.getElementById('custom-excused-note').value || 'Excused';
    if (activeExcusedStudentId) {
        setStatus(activeExcusedStudentId, 'excused', note);
    }
    closeExcusedModal();
}

async function renderRosterTable() {
    const search = document.getElementById('roster-search').value.toLowerCase();
    const sectionId = document.getElementById('roster-section-filter').value;
    const sections = await AppDB.getSections();

    let students = await AppDB.getStudents(sectionId);

    if (search) {
        students = students.filter(s => s.name.toLowerCase().includes(search) || s.studentId.toLowerCase().includes(search));
    }

    const tbody = document.getElementById('roster-table-body');
    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-xs text-zinc-400">No students found matching current filters.</td></tr>`;
    } else {
        tbody.innerHTML = students.map(s => {
            const isChecked = selectedRosterIds.has(s.id);
            const safeName = (s.name || '').replace(/'/g, "\\'");
            return `
                <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition">
                    <td class="p-4">
                        <input type="checkbox" data-student-id="${s.id}" ${isChecked ? 'checked' : ''} aria-label="Select student ${s.name}" class="roster-checkbox rounded border-zinc-300 text-zinc-900 focus:ring-zinc-800">
                    </td>
                    <td class="px-6 py-3.5 font-mono text-xs font-semibold text-zinc-500 dark:text-zinc-400">${s.studentId}</td>
                    <td class="px-6 py-3.5 font-medium text-zinc-900 dark:text-zinc-100">${s.name}</td>
                    <td class="px-6 py-3.5 text-xs text-zinc-500 dark:text-zinc-400">${s.department}</td>
                    <td class="px-6 py-3.5">
                        <select data-student-id="${s.id}" aria-label="Change section for ${s.name}" class="inline-section-select text-xs px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md font-medium text-zinc-800 dark:text-zinc-200">
                            ${sections.map(sec => `<option value="${sec.id}" ${sec.id === s.sectionId ? 'selected' : ''}>${sec.code}</option>`).join('')}
                        </select>
                    </td>
                    <td class="px-6 py-3.5 text-right space-x-2">
                        <button type="button" data-edit-id="${s.id}" data-code="${s.studentId}" data-name="${safeName}" data-dept="${s.department}" data-section="${s.sectionId}" aria-label="Edit student ${s.name}" class="edit-student-btn p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"><i class="fa-solid fa-pen-to-square text-xs" aria-hidden="true"></i></button>
                        <button type="button" data-delete-id="${s.id}" data-name="${safeName}" aria-label="Delete student ${s.name}" class="delete-student-btn p-1.5 text-zinc-400 hover:text-rose-600 transition"><i class="fa-solid fa-trash-can text-xs" aria-hidden="true"></i></button>
                    </td>
                </tr>
            `;
        }).join('');

        document.querySelectorAll('.roster-checkbox').forEach(cb => {
            cb.addEventListener('change', () => toggleRosterSelect(cb.getAttribute('data-student-id'), cb.checked));
        });
        document.querySelectorAll('.inline-section-select').forEach(sel => {
            sel.addEventListener('change', () => inlineChangeSection(sel.getAttribute('data-student-id'), sel.value));
        });
        document.querySelectorAll('.edit-student-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                openEditStudentModal(
                    btn.getAttribute('data-edit-id'),
                    btn.getAttribute('data-code'),
                    btn.getAttribute('data-name'),
                    btn.getAttribute('data-dept'),
                    btn.getAttribute('data-section')
                );
            });
        });
        document.querySelectorAll('.delete-student-btn').forEach(btn => {
            btn.addEventListener('click', () => confirmDeleteStudent(btn.getAttribute('data-delete-id'), btn.getAttribute('data-name')));
        });
    }

    updateBulkActionBar();
}

function toggleRosterSelect(id, checked) {
    if (checked) selectedRosterIds.add(id);
    else selectedRosterIds.delete(id);
    updateBulkActionBar();
}

function updateBulkActionBar() {
    const bar = document.getElementById('bulk-action-bar');
    const badge = document.getElementById('bulk-count-badge');
    badge.innerText = selectedRosterIds.size;
    if (selectedRosterIds.size > 0) {
        bar.classList.remove('hidden');
    } else {
        bar.classList.add('hidden');
    }
}

async function inlineChangeSection(studentId, newSectionId) {
    try {
        await AppDB.updateStudentSection(studentId, newSectionId);
        showToast('Student section updated inline!');
    } catch (err) {
        showToast(`Update failed: ${err.message}`, 'error');
    }
}

function openAddStudentModal() {
    document.getElementById('student-modal-title').innerText = 'Add New Student';
    document.getElementById('student-form-id').value = '';
    document.getElementById('student-form-code').value = 'STU-' + Math.floor(1000 + Math.random() * 9000);
    document.getElementById('student-form-name').value = '';
    document.getElementById('student-form-dept').value = 'Computer Science';
    document.getElementById('modal-student-form').classList.remove('hidden');
    document.getElementById('student-form-code').focus();
}

function openEditStudentModal(id, studentId, name, dept, sectionId) {
    document.getElementById('student-modal-title').innerText = 'Edit Student Info';
    document.getElementById('student-form-id').value = id;
    document.getElementById('student-form-code').value = studentId;
    document.getElementById('student-form-name').value = name;
    document.getElementById('student-form-dept').value = dept;
    document.getElementById('student-form-section').value = sectionId;
    document.getElementById('modal-student-form').classList.remove('hidden');
    document.getElementById('student-form-name').focus();
}

function closeStudentModal() {
    document.getElementById('modal-student-form').classList.add('hidden');
}

async function handleSaveStudent(e) {
    e.preventDefault();
    const id = document.getElementById('student-form-id').value;
    const studentId = document.getElementById('student-form-code').value.trim();
    const name = document.getElementById('student-form-name').value.trim();
    const department = document.getElementById('student-form-dept').value.trim();
    const sectionId = document.getElementById('student-form-section').value;

    try {
        await AppDB.saveStudent({ id: id || undefined, studentId, name, department, sectionId });
        closeStudentModal();
        renderRosterTable();
        showToast('Student saved to database successfully!');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function confirmDeleteStudent(id, name) {
    showConfirmModal("Delete Student", `Are you sure you want to permanently delete student "${name}"?`, async () => {
        try {
            await AppDB.deleteStudent(id);
            renderRosterTable();
            showToast('Student deleted.');
        } catch (err) {
            showToast(`Delete failed: ${err.message}`, 'error');
        }
    });
}

function confirmBulkDelete() {
    showConfirmModal("Delete Selected Students", `Delete ${selectedRosterIds.size} selected students from the database?`, async () => {
        try {
            await AppDB.bulkDeleteStudents(Array.from(selectedRosterIds));
            selectedRosterIds.clear();
            renderRosterTable();
            showToast('Selected students removed.');
        } catch (err) {
            showToast(`Bulk delete failed: ${err.message}`, 'error');
        }
    });
}

function openAddSectionModal() {
    document.getElementById('section-form-code').value = '';
    document.getElementById('section-form-name').value = '';
    document.getElementById('modal-section-form').classList.remove('hidden');
    document.getElementById('section-form-code').focus();
}

function closeSectionModal() {
    document.getElementById('modal-section-form').classList.add('hidden');
}

async function handleSaveSection(e) {
    e.preventDefault();
    const code = document.getElementById('section-form-code').value.trim();
    const name = document.getElementById('section-form-name').value.trim();

    try {
        await AppDB.saveSection({ code, name });
        await populateDropdowns();
        closeSectionModal();
        showToast(`Section "${code}" created successfully!`);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function openBulkMoveModal() {
    document.getElementById('modal-bulk-move').classList.remove('hidden');
}

function closeBulkMoveModal() {
    document.getElementById('modal-bulk-move').classList.add('hidden');
}

async function executeBulkMove() {
    const targetSection = document.getElementById('bulk-target-section').value;
    try {
        for (const studentId of selectedRosterIds) {
            await AppDB.updateStudentSection(studentId, targetSection);
        }
        selectedRosterIds.clear();
        closeBulkMoveModal();
        renderRosterTable();
        showToast('Transferred selected students to new section.');
    } catch (err) {
        showToast(`Transfer failed: ${err.message}`, 'error');
    }
}

async function renderAnalyticsView() {
    const logs = await AppDB.getAttendanceLogs();

    document.getElementById('ana-total-records').innerText = logs.length;

    const presentCount = logs.filter(l => l.status === 'present' || l.status === 'late').length;
    const rate = logs.length > 0 ? Math.round((presentCount / logs.length) * 100) : 0;
    document.getElementById('ana-avg-rate').innerText = `${rate}%`;

    const excusedCount = logs.filter(l => l.status === 'excused').length;
    document.getElementById('ana-excused-count').innerText = excusedCount;

    renderHistoryLogs();
}

async function renderHistoryLogs() {
    const logs = await AppDB.getAttendanceLogs();
    const students = await AppDB.getStudents();
    const subjects = await AppDB.getSubjects();
    const sections = await AppDB.getSections();

    const subjectFilter = document.getElementById('hist-filter-subject').value;
    const sectionFilter = document.getElementById('hist-filter-section').value;
    const statusFilter = document.getElementById('hist-filter-status').value;
    const dateFilter = document.getElementById('hist-filter-date').value;

    let filtered = logs.filter(l => {
        if (subjectFilter !== 'ALL' && l.subjectId !== subjectFilter) return false;
        if (sectionFilter !== 'ALL' && l.sectionId !== sectionFilter) return false;
        if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
        if (dateFilter && l.date !== dateFilter) return false;
        return true;
    });

    const tbody = document.getElementById('history-table-body');
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-xs text-zinc-400">No attendance logs matching search filters.</td></tr>`;
    } else {
        tbody.innerHTML = filtered.map(l => {
            const student = students.find(s => s.id === l.studentId) || { name: 'Unknown', studentId: 'N/A' };
            const subject = subjects.find(s => s.id === l.subjectId) || { code: l.subjectId };
            const section = sections.find(s => s.id === l.sectionId) || { code: l.sectionId };

            let badgeColor = 'bg-zinc-100 text-zinc-800';
            if (l.status === 'present') badgeColor = 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300';
            if (l.status === 'absent') badgeColor = 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300';
            if (l.status === 'late') badgeColor = 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300';
            if (l.status === 'excused') badgeColor = 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300';

            return `
                <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition">
                    <td class="px-6 py-3 font-mono text-xs text-zinc-500">${l.date}</td>
                    <td class="px-6 py-3 font-medium text-zinc-900 dark:text-zinc-100">${student.name} <span class="text-xs text-zinc-400 font-mono">(${student.studentId})</span></td>
                    <td class="px-6 py-3 text-xs text-zinc-600 dark:text-zinc-300">${subject.code}</td>
                    <td class="px-6 py-3 text-xs text-zinc-600 dark:text-zinc-300">${section.code}</td>
                    <td class="px-6 py-3">
                        <span class="px-2 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wider ${badgeColor}">${l.status}</span>
                    </td>
                    <td class="px-6 py-3 text-xs text-zinc-500">${l.excusedReason || '—'}</td>
                </tr>
            `;
        }).join('');
    }
}

async function exportToCSV() {
    const logs = await AppDB.getAttendanceLogs();
    const students = await AppDB.getStudents();
    const subjects = await AppDB.getSubjects();
    const sections = await AppDB.getSections();

    let csvContent = "data:text/csv;charset=utf-8,Date,Student_ID,Student_Name,Subject,Section,Status,Notes\n";

    logs.forEach(l => {
        const student = students.find(s => s.id === l.studentId) || { name: 'Unknown', studentId: 'N/A' };
        const subject = subjects.find(s => s.id === l.subjectId) || { code: l.subjectId };
        const section = sections.find(s => s.id === l.sectionId) || { code: l.sectionId };

        const row = `"${l.date}","${student.studentId}","${student.name}","${subject.code}","${section.code}","${l.status}","${l.excusedReason || ''}"`;
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();

    showToast('CSV Report exported successfully!');
}

async function exportDatabaseJSON() {
    const dbData = await AppDB.exportDatabaseJSON();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dbData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `attendx_database_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Full database JSON backup exported!');
}

function showConfirmModal(title, msg, onConfirm) {
    document.getElementById('confirm-modal-title').innerText = title;
    document.getElementById('confirm-modal-msg').innerText = msg;
    pendingConfirmCallback = onConfirm;
    document.getElementById('modal-confirm').classList.remove('hidden');
    document.getElementById('btn-confirm-cancel').focus();
}

function closeConfirmModal(result) {
    document.getElementById('modal-confirm').classList.add('hidden');
    if (result && pendingConfirmCallback) {
        pendingConfirmCallback();
    }
    pendingConfirmCallback = null;
}

function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgClass = type === 'error' ? 'bg-rose-900 text-white border-rose-700' : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-800 dark:border-zinc-200';
    toast.className = `${bgClass} text-xs px-4 py-2.5 rounded-lg shadow-xl border font-medium transition-all transform translate-y-2 opacity-0`;
    toast.innerText = msg;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function announceToScreenReader(message) {
    const announcer = document.getElementById('sr-announcer');
    if (announcer) {
        announcer.textContent = message;
    }
}

// Global Event Listeners Wiring
function initEventListeners() {
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        quickLogin(email);
    });

    document.getElementById('theme-toggle-btn').addEventListener('click', toggleDarkMode);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    document.getElementById('att-date').addEventListener('change', loadAttendanceSheet);
    document.getElementById('att-subject-select').addEventListener('change', loadAttendanceSheet);
    document.getElementById('att-section-select').addEventListener('change', loadAttendanceSheet);

    document.getElementById('btn-all-present').addEventListener('click', () => markAllStatus('present'));
    document.getElementById('btn-all-absent').addEventListener('click', () => markAllStatus('absent'));
    document.getElementById('btn-save-attendance').addEventListener('click', saveCurrentAttendance);

    document.getElementById('roster-search').addEventListener('input', renderRosterTable);
    document.getElementById('roster-section-filter').addEventListener('change', renderRosterTable);
    document.getElementById('select-all-students').addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('#roster-table-body input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = this.checked;
            toggleRosterSelect(cb.getAttribute('data-student-id'), this.checked);
        });
        if (!this.checked) selectedRosterIds.clear();
        updateBulkActionBar();
    });

    document.getElementById('btn-open-section-modal').addEventListener('click', openAddSectionModal);
    document.getElementById('btn-open-student-modal').addEventListener('click', openAddStudentModal);
    document.getElementById('btn-bulk-move').addEventListener('click', openBulkMoveModal);
    document.getElementById('btn-bulk-delete').addEventListener('click', confirmBulkDelete);

    document.getElementById('btn-close-section').addEventListener('click', closeSectionModal);
    document.getElementById('section-form').addEventListener('submit', handleSaveSection);

    document.getElementById('btn-close-student').addEventListener('click', closeStudentModal);
    document.getElementById('student-form').addEventListener('submit', handleSaveStudent);

    document.getElementById('btn-close-bulk-move').addEventListener('click', closeBulkMoveModal);
    document.getElementById('btn-execute-bulk-move').addEventListener('click', executeBulkMove);

    document.getElementById('btn-confirm-cancel').addEventListener('click', () => closeConfirmModal(false));
    document.getElementById('btn-confirm-proceed').addEventListener('click', () => closeConfirmModal(true));

    document.getElementById('btn-close-excused').addEventListener('click', closeExcusedModal);
    document.getElementById('btn-save-excused').addEventListener('click', saveExcusedReason);

    document.querySelectorAll('.preset-excused-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('custom-excused-note').value = btn.getAttribute('data-preset');
        });
    });

    document.getElementById('hist-filter-subject').addEventListener('change', renderHistoryLogs);
    document.getElementById('hist-filter-section').addEventListener('change', renderHistoryLogs);
    document.getElementById('hist-filter-status').addEventListener('change', renderHistoryLogs);
    document.getElementById('hist-filter-date').addEventListener('change', renderHistoryLogs);

    document.getElementById('btn-export-csv').addEventListener('click', exportToCSV);
    document.getElementById('btn-export-json').addEventListener('click', exportDatabaseJSON);

    // Global Esc Key Handler for Modals
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeExcusedModal();
            closeSectionModal();
            closeStudentModal();
            closeBulkMoveModal();
            closeConfirmModal(false);
        }
    });
}