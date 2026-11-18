const pages = ['home', 'about', 'dashboard', 'transactions', 'settings', 'login', 'register'];
const devServerPorts = new Set(['3000', '5173', '5500']);
const apiOrigin = new URL(location.protocol === 'file:' ? 'http://10.199.241.182' : location.origin);
if (devServerPorts.has(location.port)) apiOrigin.port = '';
const API_BASE = new URL('/KasMateAPI', apiOrigin).toString();
let apiToken = sessionStorage.getItem('kasmateToken') || '';
let user = null;
try { user = JSON.parse(sessionStorage.getItem('kasmateUser') || 'null'); } catch { sessionStorage.removeItem('kasmateUser'); }
if (!apiToken) user = null;
let language = localStorage.getItem('kasmateLanguage') || 'id';
let classes = [];
let dbStudents = [];
let dbTransactions = [];
let selectedClassId = null;
let classLoadState = 'idle';

function sharedAppUrl() {
    if (location.protocol === 'file:') return 'http://10.199.241.182/KasMateWeb/';
    const origin = new URL(location.origin);
    if (devServerPorts.has(location.port)) origin.port = '';
    return new URL('/KasMateWeb/', origin).toString()
}
function normalizeRole(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['wali_kelas', 'walikelas', 'teacher', 'guru'].includes(raw)) return 'guru';
    if (['bendahara', 'treasurer', 'admin', 'administrator'].includes(raw)) return 'bendahara';
    return raw || 'guru'
}
function accountFromAuth(data, username) {
    const profile = data.user || data.profile || data;
    const rawRole = profile.role || data.role || 'wali_kelas';
    return {
        id: profile.id ?? data.id ?? null,
        name: profile.name || data.name || username,
        username: profile.username || data.username || username,
        role: normalizeRole(rawRole),
        databaseRole: String(rawRole),
        classId: profile.classId ?? profile.class_id ?? data.classId ?? data.class_id ?? null,
        className: profile.className || profile.class_name || ''
    }
}
function saveSession(token, account) {
    apiToken = token;
    user = account;
    classes = [];
    dbStudents = [];
    dbTransactions = [];
    selectedClassId = account.classId ?? null;
    classLoadState = 'idle';
    sessionStorage.setItem('kasmateToken', token);
    sessionStorage.setItem('kasmateUser', JSON.stringify(account))
}
async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && apiToken) headers.Authorization = 'Bearer ' + apiToken;
    let response;
    try {
        response = await fetch(API_BASE + '/' + path.replace(/^\/+/, ''), {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body)
        });
    } catch {
        throw new Error(language === 'en'
            ? 'Could not reach KasMate. Make sure the shared XAMPP host is online and open ' + sharedAppUrl()
            : 'Tidak dapat terhubung ke KasMate. Pastikan komputer XAMPP bersama aktif dan buka ' + sharedAppUrl())
    }
    let result;
    try { result = await response.json(); }
    catch {
        throw new Error(language === 'en'
            ? 'KasMate API returned an unreadable response (' + response.status + '). Open the shared web app at ' + sharedAppUrl()
            : 'API KasMate mengirim respons yang tidak terbaca (' + response.status + '). Buka aplikasi web bersama di ' + sharedAppUrl())
    }
    if (!response.ok || result.success === false) {
        const error = new Error(result.error || result.message || 'Request failed (' + response.status + ').');
        error.status = response.status;
        throw error
    }
    return result.data ?? result
}
function money(value) {
    if (typeof value === 'number') return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'id-ID', {
        style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(value);
    if (value && typeof value === 'object') value = value.amount ?? value.balance ?? value.saldo ?? JSON.stringify(value);
    return value ?? '—'
}
function currentRole() { return normalizeRole(user?.role) }
function canManageAllClasses() { return !!user && currentRole() === 'bendahara' }
function canCreateClass() { return canManageAllClasses() || (!!user && currentRole() === 'guru' && !user.classId) }

async function loadDashboardData() {
    if (!apiToken || !user) return;
    const connection = document.getElementById('apiConnection');
    if (connection) { connection.textContent = ''; connection.hidden = true; }
    classLoadState = 'loading';
    try {
        const snapshot = await apiRequest('desktop/snapshot.php');
        const classRows = Array.isArray(snapshot.classes) ? snapshot.classes : [];
        dbStudents = (Array.isArray(snapshot.students) ? snapshot.students : []).map(student => ({
            ...student,
            id: student.id ?? student.studentId,
            classId: student.classId ?? student.class_id ?? null,
            name: student.name ?? student.nama ?? '',
            nis: student.nis ?? ''
        }));
        dbTransactions = (Array.isArray(snapshot.transactions) ? snapshot.transactions : []).map(transaction => ({
            ...transaction,
            classId: transaction.classId ?? transaction.class_id ?? null,
            amount: Number(transaction.amount) || 0
        }));
        classes = classRows.map(item => {
            const id = item.id ?? item.classId ?? item.class_id;
            return {
                ...item,
                id,
                name: String(item.name ?? item.className ?? '').trim(),
                school: String(item.schoolName ?? item.school_name ?? ''),
                year: String(item.academicYear ?? item.academic_year ?? ''),
                students: dbStudents.filter(student => String(student.classId) === String(id)).length
            }
        }).filter(item => item.id !== undefined && item.id !== null && item.name);
        const currentStaff = (Array.isArray(snapshot.staff) ? snapshot.staff : []).find(item => String(item.id) === String(user.id));
        if (currentStaff) {
            user.classId = currentStaff.classId ?? null;
            user.className = classes.find(item => String(item.id) === String(user.classId))?.name || '';
            sessionStorage.setItem('kasmateUser', JSON.stringify(user))
        }
        if (!classes.some(item => String(item.id) === String(selectedClassId))) {
            const assignedClass = classes.find(item => String(item.id) === String(user.classId));
            selectedClassId = assignedClass?.id ?? classes[0]?.id ?? null
        }
        dbStudents = dbStudents.map(student => ({
            ...student,
            className: classes.find(item => String(item.id) === String(student.classId))?.name || ''
        }));
        classLoadState = classes.length ? 'ready' : 'empty';
        updateStudentRegistrationAvailability();
        populateStudentClassSelect();
        renderClasses();
        renderApiStudents(dbStudents);
        renderSharedHistories();
        updateSelectedClassSummary();
        populateClassSelect();
        if (document.getElementById('settings')) loadProfile();
        if (connection) { connection.textContent = ''; connection.hidden = true; }
    } catch (error) {
        classes = [];
        dbStudents = [];
        dbTransactions = [];
        classLoadState = 'unavailable';
        updateStudentRegistrationAvailability();
        renderClasses();
        renderApiStudents(dbStudents);
        renderSharedHistories();
        updateSelectedClassSummary();
        populateStudentClassSelect();
        populateClassSelect();
        if (connection) {
            connection.textContent = (language === 'en' ? 'Connection failed: ' : 'Koneksi gagal: ') + error.message;
            connection.hidden = false;
        }
        if (error.status === 401 || /token|unauthorized|access token/i.test(error.message)) {
            clearSession();
            toast(language === 'en' ? 'Session expired. Please log in again.' : 'Sesi berakhir. Silakan masuk kembali.', 'error');
            go('login')
        }
    }
}
function clearSession() {
    apiToken = '';
    user = null;
    selectedClassId = null;
    sessionStorage.removeItem('kasmateToken');
    sessionStorage.removeItem('kasmateUser');
    updateNav()
}
function updateSelectedClassSummary() {
    const visibleStudents = dbStudents.filter(student => String(student.classId ?? '') === String(selectedClassId));
    const visibleTransactions = dbTransactions.filter(transaction => String(transaction.classId ?? '') === String(selectedClassId));
    const balance = visibleTransactions.reduce((total, transaction) => {
        if (transaction.affectsKas === false || transaction.affectsKas === 0 || transaction.affectsKas === '0') return total;
        const incoming = ['masuk', 'income'].includes(String(transaction.type || '').toLowerCase());
        return total + (incoming ? transaction.amount : -transaction.amount)
    }, 0);
    const balanceEl = document.getElementById('apiBalance');
    const studentCount = document.getElementById('apiStudentCount');
    const transactionCount = document.getElementById('apiTransactionCount');
    const expenseTotal = document.getElementById('expenseHistoryTotal');
    if (balanceEl) balanceEl.textContent = money(balance);
    if (studentCount) studentCount.textContent = String(visibleStudents.length);
    if (transactionCount) transactionCount.textContent = String(visibleTransactions.length);
    const expenses = visibleTransactions.reduce((total, transaction) => {
        if (transaction.affectsKas === false || transaction.affectsKas === 0 || transaction.affectsKas === '0') return total;
        return ['keluar', 'expense', 'outgoing'].includes(String(transaction.type || '').toLowerCase())
            ? total + Math.abs(transaction.amount) : total
    }, 0);
    if (expenseTotal) expenseTotal.textContent = money(expenses);
    updateDashboardClassDetails(visibleStudents);
}
function updateDashboardClassDetails(visibleStudents) {
    const intro = document.getElementById('dashboardIntro');
    const introCopy = document.getElementById('dashboardIntroCopy');
    const details = document.getElementById('dashboardClassDetails');
    if (!details) return;
    const selectedClass = user ? classes.find(item => String(item.id) === String(selectedClassId)) : null;
    const showDetails = !!selectedClass;
    if (intro) intro.classList.toggle('has-class-details', showDetails);
    if (introCopy) introCopy.hidden = showDetails;
    if (details) details.hidden = !showDetails;
    if (!selectedClass) return;

    const count = visibleStudents.length;
    const formattedCount = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'id-ID').format(count);
    document.getElementById('dashboardClassName').textContent = selectedClass.name;
    document.getElementById('dashboardClassYear').textContent = (language === 'en' ? 'Academic year ' : 'Tahun ajaran ') + (selectedClass.year || '—');
    document.getElementById('dashboardClassStudentsLabel').textContent = language === 'en' ? 'STUDENTS' : 'SISWA';
    document.getElementById('dashboardClassStudents').textContent = formattedCount;
}
function renderSharedHistories() {
    const all = dbTransactions
        .filter(item => !selectedClassId || String(item.classId) === String(selectedClassId))
        .slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const expenses = all.filter(item => ['keluar', 'expense', 'outgoing'].includes(String(item.type || '').toLowerCase()));
    renderHistoryList('transactionHistoryFullList', all, false, all.length || 1);
    renderHistoryList('expenseHistoryFullList', expenses, true, expenses.length || 1)
}
function renderHistoryList(id, items, isExpense, limit = 6) {
    const host = document.getElementById(id);
    if (!host) return;
    if (!items.length) {
        host.innerHTML = '<div class="history-empty">' + (language === 'en'
            ? (isExpense ? 'No shared expenses yet.' : 'No shared transactions yet.')
            : (isExpense ? 'Belum ada riwayat pengeluaran bersama.' : 'Belum ada riwayat transaksi bersama.')) + '</div>';
        return
    }
    host.replaceChildren();
    items.slice(0, limit).forEach(item => {
        const row = document.createElement('article');
        row.className = 'history-item' + (isExpense ? ' expense' : '');
        const main = document.createElement('div'); main.className = 'history-item-main';
        const title = document.createElement('strong');
        title.textContent = item.description || (isExpense
            ? (language === 'en' ? 'Class expense' : 'Pengeluaran kas')
            : (language === 'en' ? 'Cash transaction' : 'Transaksi kas'));
        const meta = document.createElement('small');
        const date = new Date(item.createdAt || '');
        const dateText = Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
        meta.textContent = [dateText, item.type, item.method].filter(Boolean).join(' · ');
        main.append(title, meta);
        const amount = document.createElement('span'); amount.className = 'history-item-amount';
        amount.textContent = (isExpense ? '− ' : '+ ') + money(Math.abs(Number(item.amount) || 0));
        row.append(main, amount); host.append(row)
    })
}
function populateStudentClassSelect() {
    const select = document.getElementById('studentClass');
    if (!select) return;
    const prompt = classLoadState === 'loading'
        ? (language === 'en' ? 'Loading classes…' : 'Memuat kelas…')
        : classes.length ? (language === 'en' ? 'Choose a class' : 'Pilih kelas')
            : (language === 'en' ? 'No classes available' : 'Belum ada kelas');
    select.replaceChildren(new Option(prompt, ''));
    classes.forEach(item => select.add(new Option(item.name, String(item.id))));
    if (classes.some(item => String(item.id) === String(selectedClassId))) select.value = String(selectedClassId);
    select.disabled = !classes.length || (currentRole() === 'guru' && classes.length === 1)
}
function updateStudentRoleHelp() {
    const help = document.getElementById('studentRoleHelp');
    if (help) help.textContent = language === 'en'
        ? 'The database Admin account is the Bendahara for all classes.'
        : 'Akun Admin pada database adalah Bendahara untuk semua kelas.'
}
function renderApiStudents(rows) {
    const host = document.getElementById('apiStudents');
    if (!host) return;
    const visible = (rows || []).filter(row => String(row.classId ?? '') === String(selectedClassId));
    if (!selectedClassId) {
        host.textContent = language === 'en' ? 'Choose a class to view students.' : 'Pilih kelas untuk melihat data siswa.';
        host.className = 'empty';
        return
    }
    if (!visible.length) {
        host.textContent = language === 'en' ? 'No students in this class yet.' : 'Belum ada siswa di kelas ini.';
        host.className = 'empty';
        return
    }
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    (language === 'en' ? ['Student ID', 'Name', 'Class'] : ['NIS', 'Nama', 'Kelas']).forEach(label => {
        const th = document.createElement('th'); th.textContent = label.toUpperCase(); headRow.append(th)
    });
    head.append(headRow); table.append(head);
    const body = document.createElement('tbody');
    visible.forEach(row => {
        const tr = document.createElement('tr');
        [row.nis || '—', row.name || '', row.className || ''].forEach(value => {
            const td = document.createElement('td'); td.textContent = String(value ?? ''); tr.append(td)
        });
        body.append(tr)
    });
    table.append(body); host.className = 'table-wrap'; host.replaceChildren(table)
}
function go(id) {
    if (!pages.includes(id)) id = 'home';
    if (user && ['login', 'register'].includes(id)) id = 'dashboard';
    if (['dashboard', 'transactions'].includes(id) && !user) id = 'login';
    const files = { home: 'index.html', about: 'about.html', dashboard: 'dashboard.html', transactions: 'transactions.html', settings: 'settings.html', login: 'login.html', register: 'register.html' };
    if ((location.pathname.split('/').pop() || 'index.html') !== files[id]) { location.href = files[id]; return; }
    const page = document.querySelector('.page'); if (page) { const sk = document.createElement('div'); sk.className = 'skeleton-overlay'; sk.innerHTML = '<i class="skeleton-line"></i><i class="skeleton-line short"></i><i class="skeleton-card"></i>'; page.appendChild(sk); setTimeout(() => sk.remove(), 360); }
    document.querySelectorAll('.nav [data-page]').forEach(link => link.classList.toggle('active', link.dataset.page === id)); document.querySelector('.nav')?.classList.remove('open');
    if (id === 'dashboard' && user) { const w = document.getElementById('welcome'); if (w) w.textContent = (language === 'en' ? 'Welcome, ' : 'Selamat datang, ') + String(user.name || user.username || '').split(' ')[0] + '!'; }
    if (['dashboard', 'transactions', 'settings'].includes(id) && user) loadDashboardData();
    if (id === 'settings') loadProfile();
    if (id === 'transactions') renderSharedHistories();
    window.scrollTo(0, 0); updateNav(); updateStudentRoleHelp(); populateStudentClassSelect();
}

function updateNav() {
    const b = document.getElementById('accountBtn'), en = language === 'en';
    if (!b) return;
    b.textContent = user ? (en ? 'Log out' : 'Keluar') : (en ? 'Log in' : 'Masuk');
    b.onclick = accountAction;
    const dl = document.querySelector('[data-page="dashboard"]'); if (dl) dl.textContent = 'Dashboard';
    const sl = document.querySelector('[data-page="settings"]'); if (sl) sl.textContent = en ? 'Settings' : 'Pengaturan';
    const tl = document.querySelector('[data-page="transactions"]'); if (tl) tl.textContent = en ? 'Transactions' : 'Transaksi';
    const al = document.querySelector('[data-page="about"]'); if (al) al.textContent = 'About';
    const homeLink = document.querySelector('.nav [data-page="home"]');
    const aboutLink = document.querySelector('.nav [data-page="about"]');
    const dashboardLink = document.querySelector('.nav [data-page="dashboard"]');
    if (homeLink) homeLink.hidden = !!user;
    if (aboutLink) aboutLink.hidden = !!user;
    if (dashboardLink) dashboardLink.hidden = !user;
    const transactionsLink = document.querySelector('[data-page="transactions"]');
    if (transactionsLink) transactionsLink.hidden = !user;
    const createClass = document.getElementById('classCreateBtn');
    if (createClass) createClass.hidden = !!user && !canCreateClass();
    updateStudentRegistrationAvailability();
    const closeStudentDialogButton = document.getElementById('closeStudentDialog');
    if (closeStudentDialogButton) closeStudentDialogButton.setAttribute('aria-label', language === 'en' ? 'Close student registration' : 'Tutup pendaftaran murid');
}
function updateStudentRegistrationAvailability() {
    const button = document.getElementById('studentRegisterBtn');
    if (button) button.hidden = !user || !['guru', 'bendahara'].includes(currentRole()) || !classes.length;
}
function accountAction() {
    if (user) {
        apiRequest('auth/logout.php', { method: 'POST', body: {} }).catch(() => { });
        clearSession();
        classes = []; dbStudents = []; dbTransactions = [];
        toast(language === 'en' ? 'You are signed out.' : 'Kamu berhasil keluar.', 'success');
        go('home')
    }
    else go('login')
}
const translations = {
    id: {
        transactionHistory: 'Riwayat transaksi', transactionHistoryDesc: 'Catatan transaksi kas dari database bersama.', expenseHistory: 'Riwayat pengeluaran', expenseHistoryDesc: 'Catatan pengeluaran dari kas kelas.', studentsTitle: 'Data siswa', studentsDesc: 'Daftar siswa pada kelas yang dipilih.', registerStudent: 'Daftarkan murid', studentName: 'Nama murid', studentNis: 'NIS', studentClass: 'Kelas', classRole: 'Peran dalam kelas', ordinaryStudent: 'Murid biasa', treasurerAdmin: 'Bendahara', saveStudent: 'Simpan murid', changePassword: 'Ubah kata sandi', currentPassword: 'Kata sandi saat ini', newPassword: 'Kata sandi baru', confirmPassword: 'Konfirmasi kata sandi baru', updatePassword: 'Ubah kata sandi', settingsEyebrow: 'Preferensi akun', settingsTitle: 'Pengaturan', settingsDesc: 'Atur tampilan, bahasa, dan informasi profilmu.', appearance: 'Tampilan', theme: 'Tema', themeDesc: 'Pilih tampilan yang nyaman untukmu.', light: 'Terang', dark: 'Gelap', lightDesc: 'Mode terang untuk siang hari', darkDesc: 'Mode gelap yang nyaman di mata', language: 'Bahasa', profile: 'Profil', name: 'Nama', role: 'Peran', class: 'Kelas', saveProfile: 'Simpan profil', teacherClass: 'Kelas yang diajar (Wali kelas)'
    }
    , en: {
        transactionHistory: 'Transaction history', transactionHistoryDesc: 'Cash transaction records from the shared database.', expenseHistory: 'Expense history', expenseHistoryDesc: 'Expenses recorded from the class fund.', studentsTitle: 'Students', studentsDesc: 'Students registered in your class.', registerStudent: 'Register a student', studentName: 'Student name', studentNis: 'Student ID', studentClass: 'Class', classRole: 'Class role', ordinaryStudent: 'Regular student', treasurerAdmin: 'Treasurer', saveStudent: 'Save student', changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password', confirmPassword: 'Confirm new password', updatePassword: 'Change password', settingsEyebrow: 'Account preferences', settingsTitle: 'Settings', settingsDesc: 'Choose your appearance, language, and profile details.', appearance: 'Appearance', theme: 'Theme', themeDesc: 'Choose the look that works for you.', light: 'Light', dark: 'Dark', lightDesc: 'Bright view for daytime', darkDesc: 'A softer view for low light', language: 'Language', profile: 'Profile', name: 'Name', role: 'Role', class: 'Class', saveProfile: 'Save profile', teacherClass: 'Class you teach (Homeroom teacher)'
    }
}
    ;
const enText = {
    "Ubah kata sandi": "Change password", "Kata sandi saat ini": "Current password", "Kata sandi baru": "New password", "Konfirmasi kata sandi baru": "Confirm new password", "Kata sandi saat ini tidak sesuai.": "Current password is incorrect.", "Konfirmasi kata sandi baru belum cocok.": "New passwords do not match.", "Kata sandi berhasil diubah.": "Password updated.", "Kas kelas,": "Class funds,", "lebih tertata.": "better organized.", "Kelola uang kas, catat iuran, dan pantau saldo kelas dalam satu tempat. Biar urusan kas jadi jelas untuk semua.": "Manage class funds, record contributions, and track balances in one place. Keep everything clear for everyone.", "Mulai kelola kas": "Start managing funds", "Kenali Kasmate": "Discover Kasmate", "Semua urusan kas, satu tempat": "All class funds, in one place", "Ruang untuk setiap kelas": "A space for every class", "Data siswa yang rapi": "Organized student records", "Peran yang jelas": "Clear responsibilities", "Urusan kas kelas,": "Class funds,", "lebih tenang.": "with less hassle.", "Kasmate membantu kelas mencatat iuran, memahami arus kas, dan bekerja sama dengan lebih transparan.": "Kasmate helps classes track contributions, understand cash flow, and work together transparently.", "Rapi untuk bendahara.": "Organized for treasurers.", "Jelas untuk semua.": "Clear for everyone.", "Transparan": "Transparent", "Praktis": "Practical", "Bersama": "Together", "Catatan teratur": "Organized records", "Kelas lebih kompak": "A closer class", "Selamat datang!": "Welcome!", "Ringkasan kas kelasmu.": "Your class fund overview.", "Kelola ruang kelas dan data siswa dari satu tempat.": "Manage classes and student records in one place.", "Kelasmu, tertata.": "Your class, organized.", "Buat kelas untuk mulai mengelola kas bersama.": "Create a class to start managing funds together.", "Daftar kelas": "Classes", "Pilih kelas yang ingin dikelola.": "Choose a class to manage.", "Cari nama kelas atau sekolah…": "Search class or school…", "Semua tahun ajaran": "All school years", "Data siswa": "Students", "Daftar siswa pada kelas yang dipilih.": "Student list for the selected class.", "Pilih kelas untuk melihat data siswa.": "Choose a class to view students.", "Tidak ada kelas, ": "No classes yet, ", "buat kelas": "create a class", "Buat akun baru": "Create an account", "Nama lengkap": "Full name", "Kata sandi": "Password", "Minimal 8 karakter": "At least 8 characters", "Kelas": "Class", "Daftar gratis": "Create account", "Masuk": "Log in", "Senang bertemu lagi!": "Welcome back!", "Masukkan email dan kata sandi akunmu.": "Enter your username and password.", "Daftar sekarang": "Register", "Panel admin": "Admin panel", "Kelola data pengguna dan kelas di Kasmate.": "Manage users and classes in Kasmate.", "Guru / Bendahara": "Teacher / Treasurer", "Pengaturan": "Settings", "Atur tampilan, bahasa, dan informasi profilmu.": "Manage your appearance, language, and profile.", "Tampilan": "Appearance", "Tema": "Theme", "Pilih tampilan yang nyaman untukmu.": "Choose a look that feels right.", "Terang": "Light", "Gelap": "Dark", "Bahasa": "Language", "Profil": "Profile", "Nama": "Name", "Kelas yang diajar (Wali kelas)": "Class taught (Homeroom teacher)", "Simpan profil": "Save profile", "Keluar": "Log out", "Batal": "Cancel", "Daftarkan kelas": "Register a class", "Buat ruang baru untuk mengelola kas kelas.": "Create a new space to manage class funds.", "Nama sekolah": "School name", "Tahun ajaran": "School year", "Buat kelas": "Create class", "Home": "Home", "About": "About", "Admin": "Admin", "Settings": "Settings", "Aktif": "Active", "Arsip": "Archived", "Hapus": "Delete", "Tidak ada kelas yang cocok dengan pencarian.": "No classes match your search."
}
    ;
Object.assign(enText, {
    "Ringkasan Kas": "Fund Summary", "Saldo saat ini": "Current balance", "Saldo tampil setelah data tersedia": "Balance will appear when data is available", "Iuran tercatat": "Contributions recorded", "Menunggu data kas": "Waiting for fund data", "Dirancang untuk kelas yang kompak": "Made for close-knit classes", "Alat sederhana untuk membuat pengelolaan kas kelas terasa lebih ringan dan transparan.": "Simple tools for easier, more transparent class fund management.", "Buat kelas dan kelola kebutuhan kasnya secara terpisah, dengan informasi yang selalu mudah ditemukan.": "Create a class and manage its funds separately, with information that is easy to find.", "Lihat anggota kelas, status iuran, dan informasi siswa dalam satu daftar yang praktis.": "View class members, contribution status, and student details in one convenient list.", "Berikan akses sesuai tanggung jawab: admin, bendahara, atau anggota kelas.": "Assign access by responsibility: administrator, treasurer, or class member.", "KASMATE · CLASS FUND, MADE CLEAR": "KASMATE · CLASS FUNDS, MADE CLEAR", "Semua informasi kas dapat ditata dalam satu tempat.": "Keep all class fund details organized in one place.", "Setiap orang memahami tanggung jawabnya.": "Everyone understands their responsibilities.", "Informasi yang mudah diakses membantu semua anggota bekerja sama.": "Easy-to-access information helps everyone work together.", "Belum punya kelas?": "Don't have a class yet?", "Daftar anggota kelas": "Class members", "Pengguna terdaftar": "Registered users", "Menunggu database": "Waiting for database", "Kelas aktif": "Active classes", "Guru & bendahara": "Teachers & treasurers", "Menunggu tinjauan": "Pending review", "User records will appear here after local accounts are created.": "User data will appear after the database is connected.", "Data kelas": "Class data", "Lihat dan kelola ruang kelas": "View and manage class spaces", "Masuk atau daftar untuk melihat dan mengubah profilmu.": "Log in or register to view and edit your profile.", "Mode terang": "Light mode", "Mode gelap": "Dark mode", "Senang bertemu lagi!": "Welcome back!", "Masuk dan lanjutkan kelola kas kelasmu dengan lebih praktis.": "Log in to continue managing your class funds.", "Masuk ke Kasmate": "Log in to Kasmate", "Masukkan email dan kata sandi akunmu.": "Enter your email and password.", "Buat akun untuk bergabung atau membuat ruang kelas pertamamu.": "Create an account to join or set up your first class.", "✓ Catatan kas lebih rapi": "✓ Organized fund records", "✓ Informasi mudah dipantau": "✓ Easy-to-follow information", "✓ Peran dan akses jelas": "✓ Clear roles and access", "Isi informasi berikut untuk mulai menggunakan Kasmate.": "Enter your details to start using Kasmate.", "Nama kamu": "Your name", "Contoh: XI PPLG 2": "Example: XI PPLG 2", "Contoh: SMK Telkom Bandung": "Example: SMK Telkom Bandung", "Minimal 8 karakter": "At least 8 characters", "Daftarkan kelas": "Create a class", "Buat ruang baru untuk mengelola kas kelas.": "Create a space to manage class funds.", "Nama kelas": "Class name", "Nama sekolah": "School name", "Tahun ajaran": "School year", "Tidak ada kelas yang cocok dengan pencarian.": "No classes match your search.", "Tidak ada siswa yang cocok.": "No students match your search.", "Belum ada data siswa. Data akan tersedia setelah database dihubungkan.": "No student data yet. Records will appear after the database is connected.", "Aktif": "Active", "Arsip": "Archived", "Buka →": "Open →", "Hapus": "Delete", "Satu akun hanya dapat mendaftarkan satu kelas.": "Each account can register only one class.", "Kamu hanya dapat menghapus kelas milik akunmu.": "You can only delete a class owned by your account.", "Kelas berhasil dihapus.": "Class deleted.", "Lengkapi nama kelas dan sekolah.": "Enter both the class and school names.", "Masuk atau daftar untuk membuka halaman ini.": "Log in or register to open this page.", "Masuk atau daftar untuk membuka dashboard.": "Log in or register to open the dashboard.", "Halaman admin hanya untuk guru dan bendahara.": "The admin page is for teachers and treasurers only.", "Kamu berhasil keluar.": "You are logged out.", "Berhasil masuk ke Kasmate.": "You are logged in to Kasmate.", "Akun berhasil dibuat. Selamat datang di Kasmate!": "Account created. Welcome to Kasmate!", "Profil berhasil disimpan.": "Profile saved.", "Tidak ada kelas, ": "No classes, ", "buat kelas": "create a class", "Siswa": "Student", "Bendahara": "Treasurer", "Guru": "Teacher", "Batal": "Cancel", "Data kelas akan tampil setelah terhubung ke database.": "Class data will appear after the database is connected.", "Aktivitas kas": "Fund activity", "Kelas saya": "My class", "Pilih kelas": "Choose a class", "Daftar gratis": "Create account", "Belum punya akun?": "Don't have an account?", "Sudah punya akun?": "Already have an account?", "Email": "Email", "Saldo kas": "Class balance", "Belum bayar": "Unpaid", "Sudah bayar": "Paid", "Contoh: XI PPLG 2": "Example: XI PPLG 2", "Contoh: XI IPA 2": "Example: XI PPLG 2", "Contoh: SMA Nusantara": "Example: SMK Telkom Bandung"
}
);
Object.assign(enText, {
    'Log in to Kasmate': 'Log in to Kasmate', 'Masukkan username dan kata sandi akunmu.': 'Enter your username and password.', 'Masukkan kata sandi': 'Enter your password', 'Daftar sekarang': 'Register now', "Belum punya akun?": "Don't have an account?", 'Masuk atau daftar untuk melihat dan mengubah profilmu.': 'Log in or register to view and edit your profile.', 'Ubah kata sandi': 'Change password', 'Kata sandi saat ini': 'Current password', 'Kata sandi baru': 'New password', 'Konfirmasi kata sandi baru': 'Confirm new password', 'Ubah': 'Change password', 'Kata sandi dan ulangi kata sandi tidak cocok.': 'Passwords do not match.', 'Kata sandi berhasil diubah.': 'Password updated.', 'Senang bertemu lagi!': 'Welcome back!', 'Masuk dan lanjutkan kelola kas kelasmu dengan lebih praktis.': 'Log in to keep managing your class funds with ease.', 'Kas kelas,': 'Class funds,', 'lebih tertata.': 'better organized.', 'Kelola uang kas, catat iuran, dan pantau saldo kelas dalam satu tempat. Biar urusan kas jadi jelas untuk semua.': 'Manage class funds, record contributions, and track balances in one place. Keep everything clear for everyone.', 'Mulai kelola kas': 'Start managing funds', 'Kenali Kasmate': 'Discover Kasmate', 'Dirancang untuk kelas yang kompak': 'Designed for close-knit classes', 'Ringkasan Kas': 'Fund summary', 'Aktif': 'Active', 'Saldo saat ini': 'Current balance', 'Saldo tampil setelah data tersedia': 'Balance will appear when data is available', 'Iuran tercatat': 'Contributions recorded', 'Menunggu data kas': 'Waiting for fund data', 'Semua urusan kas, satu tempat': 'All class funds, in one place', 'Alat sederhana untuk membuat pengelolaan kas kelas terasa lebih ringan dan transparan.': 'Simple tools for easier, more transparent class fund management.', 'Ruang untuk setiap kelas': 'A space for every class', 'Buat kelas dan kelola kebutuhan kasnya secara terpisah, dengan informasi yang selalu mudah ditemukan.': 'Manage each class and its funds separately, with information that is always easy to find.', 'Data siswa yang rapi': 'Organized student records', 'Lihat anggota kelas, status iuran, dan informasi siswa dalam satu daftar yang praktis.': 'View class members, contribution status, and student details in one convenient list.', 'Peran yang jelas': 'Clear responsibilities', 'Berikan akses sesuai tanggung jawab: admin, bendahara, atau anggota kelas.': 'Assign access by responsibility: administrator, treasurer, or class member.', 'KASMATE · CLASS FUND, MADE CLEAR': 'KASMATE · CLASS FUNDS, MADE CLEAR', 'Urusan kas kelas,': 'Class funds,', 'lebih tenang.': 'with less hassle.', 'Kasmate membantu kelas mencatat iuran, memahami arus kas, dan bekerja sama dengan lebih transparan.': 'Kasmate helps classes track contributions, understand cash flow, and work together transparently.', 'Mulai bersama Kasmate': 'Get started with Kasmate', 'Rapi untuk bendahara.': 'Organized for treasurers.', 'Jelas untuk semua.': 'Clear for everyone.', 'Satu ruang bersama untuk setiap kelas.': 'One shared space for every class.', 'Transparan': 'Transparent', 'Praktis': 'Practical', 'Bersama': 'Together', 'Catatan teratur': 'Organized records', 'Semua informasi kas dapat ditata dalam satu tempat.': 'Keep all class fund details organized in one place.', 'Setiap orang memahami tanggung jawabnya.': 'Everyone understands their responsibilities.', 'Kelas lebih kompak': 'A closer class', 'Informasi yang mudah diakses membantu semua anggota bekerja sama.': 'Easy-to-access information helps everyone work together.', 'Kelola ruang kelas dan data siswa dari satu tempat.': 'Manage classes and student records in one place.', 'Kelasmu, tertata.': 'Your class, organized.', 'Buat kelas untuk mulai mengelola kas bersama.': 'Create a class to start managing funds together.', 'Daftar siswa pada kelas yang dipilih.': 'Student list for the selected class.', 'Belum dimuat': 'Not loaded yet', 'Di perangkat ini': 'On this device', 'Username': 'Username', 'Nama lengkap': 'Full name', 'Kata sandi': 'Password', 'Minimal 8 karakter': 'At least 8 characters', 'Isi informasi berikut untuk mulai menggunakan Kasmate.': 'Enter your details to start using Kasmate.', 'Kas kelas kompak dimulai dari sini.': 'Class funds start here.', 'Buat akun untuk bergabung atau membuat ruang kelas pertamamu.': 'Create an account to join or start your first class.', 'Catatan kas lebih rapi': 'Clearer fund records', 'Informasi mudah dipantau': 'Easy-to-follow information', 'Peran dan akses jelas': 'Clear roles and access', 'Sudah punya akun?': 'Already have an account?', 'Masuk': 'Log in', 'Buat akun baru': 'Create an account', 'Daftar gratis': 'Create account', 'Ulangi kata sandi': 'Confirm password', 'Lihat kata sandi': 'Show password', 'Sembunyikan kata sandi': 'Hide password'
}
);
const languageOriginals = new WeakMap();
function setLanguage(value) {
    language = value;
    localStorage.setItem('kasmateLanguage', language);
    document.documentElement.lang = language;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while (n = w.nextNode()) {
        if (!languageOriginals.has(n)) languageOriginals.set(n, n.nodeValue);
        const original = languageOriginals.get(n), trim = original.trim(), normalized = trim.replace(/\s+/g, ' ');
        n.nodeValue = original.replace(trim, value === 'en' ? (enText[normalized] || normalized) : trim)
    }
    document.querySelectorAll('[data-t]').forEach(el => {
        const key = el.dataset.t; el.textContent = translations[language][key] || key
    }
    );
    document.querySelectorAll('input[placeholder]').forEach(el => {
        if (!el.dataset.idPlaceholder) el.dataset.idPlaceholder = el.placeholder; const source = el.dataset.idPlaceholder; el.placeholder = value === 'en' ? (enText[source] || source) : source
    }
    );
    updateNav()
}
function setTheme(value) {
    const dark = value === 'dark', switchEl = document.getElementById('themeSwitch'), label = document.getElementById('themeModeLabel');
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('kasmateTheme', dark ? 'dark' : 'light');
    if (switchEl) {
        switchEl.setAttribute('aria-checked', String(dark));
        switchEl.setAttribute('aria-label', language === 'en' ? 'Theme: ' + (dark ? 'dark' : 'light') : 'Tema: ' + (dark ? 'gelap' : 'terang'))
    }
    if (label) label.textContent = translations[language]?.[dark ? 'dark' : 'light'] || (dark ? 'Gelap' : 'Terang')
}
function toggleTheme() {
    setTheme(document.body.classList.contains('dark') ? 'light' : 'dark')
}
function updateProfileClassLabel() {
    const l = document.getElementById('profileClassLabel');
    if (!l) return;
    l.dataset.t = 'teacherClass';
    l.textContent = canManageAllClasses()
        ? (language === 'en' ? 'Class access (Admin / Treasurer)' : 'Akses kelas (Admin / Bendahara)')
        : translations[language].teacherClass;
}
function loadProfile() {
    const form = document.getElementById('profileForm'), locked = document.getElementById('profileLocked');
    if (!form || !locked) return;
    form.style.display = user ? 'block' : 'none';
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) passwordForm.style.display = user ? 'block' : 'none';
    locked.style.display = user ? 'none' : 'block';
    populateClassSelect();
    if (user) {
        document.getElementById('profileName').value = user.name || '';
        const byName = classes.find(c => c.name.toLowerCase() === String(user.className || '').toLowerCase());
        if (!canManageAllClasses()) document.getElementById('profileClass').value = String(user.classId ?? byName?.id ?? user.className ?? '')
        document.getElementById('profileName').readOnly = true;
        document.getElementById('profileClass').disabled = true;
        const saveButton = form.querySelector('[type="submit"]');
        if (saveButton) saveButton.hidden = true;
        showNotice('profileNotice', language === 'en'
            ? 'Account name and class assignment are managed in the shared KasMate database.'
            : 'Nama akun dan penempatan kelas dikelola di database KasMate bersama.', 'warning');
    }
    const ls = document.getElementById('languageSelect'); if (ls) ls.value = language;
    setTheme(localStorage.getItem('kasmateTheme') || 'light');
    updateProfileClassLabel()
}
function populateClassSelect() {
    const select = document.getElementById('profileClass');
    if (!select) return;
    if (canManageAllClasses()) {
        select.replaceChildren(new Option(language === 'en' ? 'All classes' : 'Semua kelas', 'all'));
        select.value = 'all';
        select.disabled = true;
        return
    }
    const selected = user?.classId ?? classes.find(c => c.name.toLowerCase() === String(user?.className || '').toLowerCase())?.id ?? user?.className ?? '';
    const prompt = classLoadState === 'loading' ? (language === 'en' ? 'Loading classes…' : 'Memuat kelas…') : classes.length ? (language === 'en' ? 'Select your class' : 'Pilih kelas yang diajar') : classLoadState === 'unavailable' ? (language === 'en' ? 'The API is not providing its class list yet' : 'API belum menyediakan daftar kelas') : (language === 'en' ? 'No classes available' : 'Belum ada kelas');
    const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    select.innerHTML = '<option value="">' + escape(prompt) + '</option>' + classes.map(c => '<option value="' + escape(c.id ?? c.name) + '">' + escape(c.name) + '</option>').join('');
    select.value = String(selected);
    select.disabled = true
}
function showNotice(id, msg, type = 'error') {
    const n = document.getElementById(id);
    if (!n) return;
    const severity = ['error', 'warning', 'success'].includes(type) ? type : 'error';
    n.textContent = msg;
    n.classList.remove('notice-error', 'notice-warning', 'notice-success');
    n.classList.add('notice-' + severity);
    n.setAttribute('role', severity === 'error' ? 'alert' : 'status');
    n.setAttribute('aria-live', severity === 'error' ? 'assertive' : 'polite');
    n.style.display = 'block'
}
document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordToggle); if (!input) return; const showing = input.type === 'password'; input.type = showing ? 'text' : 'password'; button.setAttribute('aria-pressed', String(showing)); button.setAttribute('aria-label', showing ? (language === 'en' ? 'Hide password' : 'Sembunyikan kata sandi') : (language === 'en' ? 'Show password' : 'Lihat kata sandi')); button.innerHTML = showing ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a14.6 14.6 0 0 1-3.2 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 3.3-.5"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
}
));
document.getElementById('registerForm')?.addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(e.target), name = String(f.get('name') || '').trim(), username = String(f.get('username') || '').trim(), password = String(f.get('password') || ''), confirmPassword = String(f.get('confirmPassword') || ''); if (password !== confirmPassword) {
        showNotice('registerNotice', language === 'en' ? 'Passwords do not match.' : 'Kata sandi dan ulangi kata sandi tidak cocok.'); return
    }
    if (password.length < 8) {
        showNotice('registerNotice', language === 'en' ? 'Password must be at least 8 characters.' : 'Kata sandi minimal 8 karakter.', 'warning'); return
    }
    const button = e.currentTarget.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
        await apiRequest('auth/register.php', { method: 'POST', auth: false, body: { name, username, password } });
        const login = await apiRequest('auth/login.php', { method: 'POST', auth: false, body: { username, password } });
        if (!login.token) throw new Error(language === 'en' ? 'The API did not return a login token.' : 'API tidak mengirim token masuk.');
        saveSession(login.token, accountFromAuth(login, username));
        e.target.reset();
        go('dashboard')
    }
    catch (error) {
        showNotice('registerNotice', error.message)
    } finally {
        if (button) button.disabled = false
    }
}
);
document.getElementById('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault(); const fields = e.target.querySelectorAll('input'), username = fields[0].value.trim(), password = fields[1].value;
    const button = e.currentTarget.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
        const data = await apiRequest('auth/login.php', { method: 'POST', auth: false, body: { username, password } });
        if (!data.token) throw new Error(language === 'en' ? 'The API did not return a login token.' : 'API tidak mengirim token masuk.');
        saveSession(data.token, accountFromAuth(data, username));
        e.target.reset();
        go('dashboard')
    }
    catch (error) {
        showNotice('loginNotice', error.message)
    } finally {
        if (button) button.disabled = false
    }
}
);
document.getElementById('studentRole')?.addEventListener('change', updateStudentRoleHelp);
document.getElementById('studentRegistrationForm')?.addEventListener('submit', async e => {
    e.preventDefault(); if (!user || !['guru', 'bendahara'].includes(currentRole())) return;
    const name = document.getElementById('studentName').value.trim();
    const nis = document.getElementById('studentNis').value.trim();
    const classId = document.getElementById('studentClass').value;
    const selectedClass = classes.find(c => String(c.id) === classId);
    if (!name || !selectedClass) {
        showNotice('studentNotice', language === 'en' ? 'Enter the student details and choose a class.' : 'Lengkapi data murid dan pilih kelas.', 'warning'); return
    }
    if (nis && dbStudents.some(row => String(row.nis ?? '').toLowerCase() === nis.toLowerCase())) {
        showNotice('studentNotice', language === 'en' ? 'That student ID is already registered.' : 'NIS tersebut sudah terdaftar.'); return
    }
    const button = e.currentTarget.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
        await apiRequest('students/create.php', {
            method: 'POST', body: { classId: Number(classId), nama: name, nis, owed: 0 }
        });
        e.target.reset();
        await loadDashboardData();
        closeStudentDialog();
        toast(language === 'en' ? 'Student added to the shared database.' : 'Siswa ditambahkan ke database bersama.', 'success')
    } catch (error) {
        showNotice('studentNotice', error.message)
    } finally {
        if (button) button.disabled = false
    }
}
);
document.getElementById('passwordForm')?.addEventListener('submit', async e => {
    e.preventDefault(); if (!user) {
        go('login'); return
    }
    const old = document.getElementById('currentPassword').value, next = document.getElementById('newPassword').value, confirmNew = document.getElementById('confirmPassword').value; if (next !== confirmNew) {
        showNotice('passwordNotice', language === 'en' ? 'New passwords do not match.' : 'Konfirmasi kata sandi baru belum cocok.'); return
    }
    try {
        await apiRequest('auth/update_profile.php', {
            method: 'POST', body: { currentPassword: old, username: user.username, newPassword: next }
        });
        e.target.reset(); showNotice('passwordNotice', language === 'en' ? 'Password updated in the shared database.' : 'Kata sandi diperbarui di database bersama.', 'success')
    }
    catch (error) {
        showNotice('passwordNotice', error.message)
    }
}
);
document.getElementById('profileForm')?.addEventListener('submit', e => {
    e.preventDefault();
    if (!user) go('login');
});
function renderClasses() {
    const host = document.getElementById('classGrid');
    if (!host) return;
    host.hidden = !!user && classes.length <= 1;
    host.classList.toggle('class-picker', !!user && classes.length > 1);
    host.replaceChildren();
    if (!classes.length) {
        const empty = document.createElement('div'); empty.className = 'empty';
        empty.textContent = classLoadState === 'unavailable'
            ? (language === 'en' ? 'Class data is unavailable until the shared database reconnects.' : 'Data kelas akan muncul setelah database bersama tersambung.')
            : (language === 'en' ? 'No classes yet. Create one to get started.' : 'Belum ada kelas. Buat kelas untuk memulai.');
        host.append(empty);
        return
    }
    classes.forEach(item => {
        const card = document.createElement('article');
        card.className = 'class-card' + (String(item.id) === String(selectedClassId) ? ' selected' : '');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-pressed', String(String(item.id) === String(selectedClassId)));
        card.setAttribute('aria-label', (language === 'en' ? 'Select class ' : 'Pilih kelas ') + item.name);
        const title = document.createElement('h3'); title.textContent = item.name;
        if (user) {
            card.append(title);
        } else {
            const year = document.createElement('p');
            year.className = 'class-year';
            year.textContent = (language === 'en' ? 'Academic year ' : 'Tahun ajaran ') + (item.year || '—');
            const footer = document.createElement('div'); footer.className = 'class-foot';
            const studentMetric = document.createElement('div'); studentMetric.className = 'class-metric';
            const studentLabel = document.createElement('small'); studentLabel.textContent = language === 'en' ? 'STUDENTS' : 'SISWA';
            const studentValue = document.createElement('strong');
            const studentCount = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'id-ID').format(item.students);
            studentValue.textContent = studentCount + (language === 'en'
                ? (item.students === 1 ? ' student' : ' students')
                : ' siswa');
            studentMetric.append(studentLabel, studentValue);
            const balanceMetric = document.createElement('div'); balanceMetric.className = 'class-metric class-cash';
            const balanceLabel = document.createElement('small'); balanceLabel.textContent = language === 'en' ? 'CLASS CASH' : 'SALDO KAS';
            const balanceValue = document.createElement('strong');
            balanceValue.textContent = 'Rp ' + classBalance(item.id).toLocaleString('id-ID', { maximumFractionDigits: 0 });
            balanceMetric.append(balanceLabel, balanceValue);
            footer.append(studentMetric, balanceMetric);
            card.append(title, year, footer);
        }
        card.addEventListener('click', () => setSelectedClass(item.id));
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedClass(item.id); }
        });
        host.append(card)
    })
}
function classBalance(classId) {
    return dbTransactions
        .filter(transaction => String(transaction.classId ?? '') === String(classId))
        .reduce((total, transaction) => {
            if (transaction.affectsKas === false || transaction.affectsKas === 0 || transaction.affectsKas === '0') return total;
            const incoming = ['masuk', 'income'].includes(String(transaction.type || '').toLowerCase());
            return total + (incoming ? transaction.amount : -transaction.amount)
        }, 0)
}
function setSelectedClass(classId) {
    selectedClassId = classId;
    renderClasses();
    renderApiStudents(dbStudents);
    renderSharedHistories();
    updateSelectedClassSummary();
    populateStudentClassSelect()
}
function openStudentDialog() {
    if (!user) { go('login'); return; }
    if (!['guru', 'bendahara'].includes(currentRole()) || !classes.length) return;
    populateStudentClassSelect();
    const notice = document.getElementById('studentNotice');
    if (notice) {
        notice.style.display = 'none';
        notice.classList.remove('notice-error', 'notice-warning', 'notice-success');
    }
    document.getElementById('studentDialog')?.showModal();
}
function closeStudentDialog() {
    const dialog = document.getElementById('studentDialog');
    if (dialog?.open) dialog.close();
}
function openModal() {
    if (!user) { go('login'); return; }
    if (!canCreateClass()) {
        toast(language === 'en'
            ? 'This teacher is already assigned to a class. Ask the Admin/Bendahara to register another class.'
            : 'Guru ini sudah ditetapkan ke kelas. Minta Admin/Bendahara mendaftarkan kelas lain.', 'warning');
        return
    }
    const modal = document.getElementById('modalBack');
    if (modal) modal.style.display = 'grid'
}
function closeModal() {
    document.getElementById('modalBack') && (document.getElementById('modalBack').style.display = 'none')
}
async function addClass() {
    if (!user) {
        go('login');
        return
    }
    if (!canCreateClass()) {
        toast(language === 'en' ? 'This account cannot create another class.' : 'Akun ini tidak dapat mendaftarkan kelas lain.', 'warning');
        return
    }
    const name = document.getElementById('newClassName')?.value.trim() || '', school = document.getElementById('newSchool')?.value.trim() || '';
    if (!name || !school) {
        toast(language === 'en' ? 'Enter the class and school names.' : 'Lengkapi nama kelas dan sekolah.', 'warning');
        return
    }
    const year = document.getElementById('newYear')?.value || '';
    const button = document.querySelector('#modalBack .primary');
    if (button) button.disabled = true;
    try {
        const created = await apiRequest('classes/create.php', {
            method: 'POST', body: { name, schoolName: school, academicYear: year }
        });
        selectedClassId = created.id ?? created.classId ?? created.class_id ?? null;
        closeModal();
        document.getElementById('newClassName').value = '';
        document.getElementById('newSchool').value = '';
        await loadDashboardData();
        toast(language === 'en' ? 'Class registered in the shared database.' : 'Kelas didaftarkan di database bersama.', 'success')
    } catch (error) {
        toast(error.message, 'error')
    } finally {
        if (button) button.disabled = false
    }
}
let toastTimer;
function toast(msg, type = 'info') {
    const t = document.getElementById('toast');
    if (!t) return;
    const severity = ['error', 'warning', 'success'].includes(type) ? type : 'info';
    t.textContent = msg;
    t.classList.remove('toast-error', 'toast-warning', 'toast-success');
    if (severity !== 'info') t.classList.add('toast-' + severity);
    t.setAttribute('role', severity === 'error' ? 'alert' : 'status');
    t.setAttribute('aria-live', severity === 'error' ? 'assertive' : 'polite');
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.style.display = 'none', 2600)
}
renderClasses(); setTheme(localStorage.getItem('kasmateTheme') || 'light'); setLanguage(language); updateNav(); updateStudentRoleHelp();
document.getElementById('languageSelect')?.addEventListener('change', event => {
    setLanguage(event.target.value);
    renderClasses(); renderApiStudents(dbStudents); renderSharedHistories(); updateSelectedClassSummary();
    updateStudentRoleHelp();
    if (document.getElementById('profileForm')) loadProfile();
});
const current = ({ '': 'home', 'index.html': 'home', 'about.html': 'about', 'dashboard.html': 'dashboard', 'transactions.html': 'transactions', 'settings.html': 'settings', 'login.html': 'login', 'register.html': 'register' })[location.pathname.split('/').pop()] || 'home';
if (['dashboard', 'transactions'].includes(current) && !user) go('login');
else if (user && ['login', 'register'].includes(current)) go('dashboard');
else {
    document.querySelector('[data-page="' + current + '"]')?.classList.add('active');
    if (['dashboard', 'transactions', 'settings'].includes(current) && user) loadDashboardData();
    if (current === 'settings') loadProfile();
    if (current === 'transactions') renderSharedHistories();
}
