const pages = ['home', 'about', 'dashboard', 'transactions', 'settings', 'login', 'register'];
let user = JSON.parse(sessionStorage.getItem('kasmateUser') || 'null');
let role = 'guru';
let language = localStorage.getItem('kasmateLanguage') || 'id';
let classes = JSON.parse(localStorage.getItem('kasmateClasses') || '[]');
let dbStudents = JSON.parse(localStorage.getItem('kasmateStudents') || '[]');
const students = [];
function saveSession(account) {
    user = account;
    sessionStorage.removeItem('kasmateToken');
    sessionStorage.setItem('kasmateUser', JSON.stringify(account))
}
async function hashLocalPassword(password, salt) {
    if (!window.crypto?.subtle) throw new Error(language === 'en' ? 'Secure local password storage is unavailable in this browser. Open this page through localhost.' : 'Penyimpanan sandi lokal yang aman tidak tersedia di browser ini. Buka halaman melalui localhost.');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + password));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}
function localUsers() {
    return JSON.parse(localStorage.getItem('kasmateLocalUsers') || '[]')
}
function storeLocalUsers(rows) {
    localStorage.setItem('kasmateLocalUsers', JSON.stringify(rows))
}
function money(value) {
    if (typeof value === 'number') return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'id-ID', {
        style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }
    ).format(value);
    if (value && typeof value === 'object') value = value.amount ?? value.balance ?? value.saldo ?? JSON.stringify(value);
    return value ?? '—'
}
let classLoadState = 'ready';
async function loadDashboardData() {
    classes = JSON.parse(localStorage.getItem('kasmateClasses') || '[]');
    dbStudents = JSON.parse(localStorage.getItem('kasmateStudents') || '[]').map(row => ['bendahara', 'admin'].includes(String(row.role || '').toLowerCase()) ? {
        ...row, role: 'bendahara', isAdmin: true, isTreasurer: true
    }
    : row);
    localStorage.setItem('kasmateStudents', JSON.stringify(dbStudents));
    classLoadState = 'ready';
    if(document.getElementById('apiConnection'))document.getElementById('apiConnection').textContent = language === 'en' ? 'Local mode' : 'Mode lokal';
    if(document.getElementById('apiBalance'))document.getElementById('apiBalance').textContent = money(Number(localStorage.getItem('kasmateBalance') || 0));
    if(document.getElementById('apiStudentCount'))document.getElementById('apiStudentCount').textContent = dbStudents.length;
    if(document.getElementById('apiTransactionCount'))document.getElementById('apiTransactionCount').textContent = JSON.parse(localStorage.getItem('kasmateTransactions') || '[]').length;
    document.querySelectorAll('.api-stats .stat small:not(#apiConnection)').forEach(el => el.textContent = language === 'en' ? 'On this device' : 'Di perangkat ini');
    const form = document.getElementById('studentRegistrationForm');
    if(form)form.hidden = !user || !['guru', 'teacher'].includes(String(user.role || 'guru').toLowerCase());
    populateStudentClassSelect();
    renderApiStudents(dbStudents);
    renderClasses();
    populateClassSelect();
    renderLocalHistories()
}
function renderLocalHistories() {
    const all = JSON.parse(localStorage.getItem('kasmateTransactions') || '[]'), savedExpenses = JSON.parse(localStorage.getItem('kasmateExpenses') || '[]');
    const expenses = savedExpenses.length ? savedExpenses : all.filter(item => /expense|pengeluaran|keluar|out/i.test(String(item.type ?? item.jenis ?? item.category ?? item.kategori ?? '')));
    renderHistoryList('transactionHistoryFullList', all, false, all.length || 1);
    renderHistoryList('expenseHistoryFullList', expenses, true, expenses.length || 1);
    const total = expenses.reduce((sum, item) => sum + Number(item.amount ?? item.jumlah ?? item.nominal ?? item.total ?? 0), 0), amount = document.getElementById('expenseHistoryTotal'), meta = document.getElementById('expenseHistoryMeta');
    if (amount) amount.textContent = money(total);
    if (meta) meta.textContent = language === 'en' ? expenses.length + ' local expense' + (expenses.length === 1 ? '' : 's') : expenses.length + ' pengeluaran lokal'
}
function renderHistoryList(id, items, isExpense, limit = 6) {
    const host = document.getElementById(id);
    if (!host) return;
    if (!items.length) {
        host.innerHTML = '<div class="history-empty">' + (language === 'en' ? (isExpense ? 'No local expenses yet.' : 'No local transactions yet.') : (isExpense ? 'Belum ada riwayat pengeluaran lokal.' : 'Belum ada riwayat transaksi lokal.')) + '</div>';
        return
    }
    host.replaceChildren();
    items.slice().reverse().slice(0, limit).forEach(item => {
        const row = document.createElement('article'); row.className = 'history-item' + (isExpense ? ' expense' : ''); const main = document.createElement('div'); main.className = 'history-item-main'; const title = document.createElement('strong'); title.textContent = item.description ?? item.keterangan ?? item.title ?? item.nama ?? item.name ?? (isExpense ? (language === 'en' ? 'Class expense' : 'Pengeluaran kas') : (language === 'en' ? 'Cash transaction' : 'Transaksi kas')); const meta = document.createElement('small'); meta.textContent = [item.date ?? item.tanggal ?? item.created_at ?? '', item.category ?? item.kategori ?? item.type ?? item.jenis ?? ''].filter(Boolean).join(' · '); main.append(title, meta); const amount = document.createElement('span'); amount.className = 'history-item-amount'; amount.textContent = money(Number(item.amount ?? item.jumlah ?? item.nominal ?? item.total ?? 0)); row.append(main, amount); host.append(row)
    }
    )
}
function roleLabel(value) {
    const labels = {
        siswa: language === 'en' ? 'Student' : 'Murid biasa', bendahara: language === 'en' ? 'Treasurer' : 'Bendahara'
    }
    ;
    return labels[String(value || 'siswa').toLowerCase()] || String(value)
}
function populateStudentClassSelect() {
    const select = document.getElementById('studentClass');
    if (!select) return;
    select.innerHTML = '<option value="">' + (language === 'en' ? 'Choose a local class' : 'Pilih kelas lokal') + '</option>' + classes.map(c => '<option value="' + String(c.id) + '">' + String(c.name).replaceAll('&', '&amp;').replaceAll('<', '&lt;') + '</option>').join('');
    select.disabled = !classes.length
}
function updateStudentRoleHelp() {
    const role = document.getElementById('studentRole')?.value, help = document.getElementById('studentRoleHelp');
    if (!help) return;
    help.textContent = role === 'bendahara' ? (language === 'en' ? 'Treasurers can manage class records and payments.' : 'Bendahara dapat mengelola data kelas dan pembayaran.') : (language === 'en' ? 'Regular students can view class information.' : 'Murid biasa dapat melihat informasi kelas.')
}
function renderApiStudents(rows) {
    const host = document.getElementById('apiStudents');
    if (!host) return;
    if (!rows.length) {
        host.textContent = language === 'en' ? 'No local student records yet.' : 'Belum ada data siswa lokal.';
        host.className = 'empty';
        return
    }
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>NIS</th><th>' + (language === 'en' ? 'NAME' : 'NAMA') + '</th><th>' + (language === 'en' ? 'CLASS' : 'KELAS') + '</th><th>' + (language === 'en' ? 'ROLE' : 'PERAN') + '</th></tr></thead>';
    const body = document.createElement('tbody');
    rows.forEach(row => {
        const tr = document.createElement('tr'); [row.nis ?? row.nim ?? row.id ?? '', row.name ?? row.nama ?? row.full_name ?? '', row.className ?? row.class ?? row.kelas ?? '', roleLabel(row.role)].forEach(value => {
            const td = document.createElement('td'); td.textContent = String(value ?? ''); tr.appendChild(td)
        }
        ); body.appendChild(tr)
    }
    );
    table.appendChild(body);
    host.className = 'table-wrap';
    host.replaceChildren(table)
}
function go(id) {
    if (!pages.includes(id)) id='home';
    if (user && ['login','register'].includes(id)) id='dashboard';
    if (['dashboard','transactions'].includes(id) && !user) id='login';
    const files={home:'index.html',about:'about.html',dashboard:'dashboard.html',transactions:'transactions.html',settings:'settings.html',login:'login.html',register:'register.html'};
    if ((location.pathname.split('/').pop()||'index.html')!==files[id]) { location.href=files[id]; return; }
    const page=document.querySelector('.page'); if(page){const sk=document.createElement('div');sk.className='skeleton-overlay';sk.innerHTML='<i class="skeleton-line"></i><i class="skeleton-line short"></i><i class="skeleton-card"></i>';page.appendChild(sk);setTimeout(()=>sk.remove(),360);}
    document.querySelectorAll('.nav [data-page]').forEach(link=>link.classList.toggle('active',link.dataset.page===id)); document.querySelector('.nav')?.classList.remove('open');
    if(id==='dashboard'&&user){const w=document.getElementById('welcome');if(w)w.textContent=(language==='en'?'Welcome, ':'Selamat datang, ')+user.name.split(' ')[0]+'!';}
    if(id==='settings')loadProfile(); if(id==='dashboard'&&user)loadDashboardData(); if(id==='transactions')renderLocalHistories(); window.scrollTo(0,0);updateNav();updateStudentRoleHelp();populateStudentClassSelect();
}

function updateNav() {
    const b = document.getElementById('accountBtn'), en = language === 'en';
    if(!b)return;
    b.textContent = user ? (en ? 'Log out' : 'Keluar') : (en ? 'Log in' : 'Masuk');
    b.onclick = accountAction;
    const dl=document.querySelector('[data-page="dashboard"]');if(dl)dl.textContent='Dashboard';
    const sl=document.querySelector('[data-page="settings"]');if(sl)sl.textContent=en?'Settings':'Pengaturan';
    const tl=document.querySelector('[data-page="transactions"]');if(tl)tl.textContent=en?'Transactions':'Transaksi';
    const al=document.querySelector('[data-page="about"]');if(al)al.textContent='About';
}
function accountAction() {
    if (user) {
        user = null;
        sessionStorage.removeItem('kasmateUser');
        sessionStorage.removeItem('kasmateToken');
        toast(language === 'en' ? 'You are signed out.' : 'Kamu berhasil keluar.');
        go('home')
    }
    else go('login')
}
const translations = {
    id: {
        transactionHistory: 'Riwayat transaksi', transactionHistoryDesc: 'Catatan transaksi kas yang tersimpan di perangkat ini.', expenseHistory: 'Riwayat pengeluaran', expenseHistoryDesc: 'Catatan pengeluaran dari kas kelas.', studentsTitle: 'Data siswa', studentsDesc: 'Daftar siswa pada kelas yang dipilih.', registerStudent: 'Daftarkan murid', studentName: 'Nama murid', studentNis: 'NIS', studentClass: 'Kelas', classRole: 'Peran dalam kelas', ordinaryStudent: 'Murid biasa', treasurerAdmin: 'Bendahara', saveStudent: 'Simpan murid', changePassword: 'Ubah kata sandi', currentPassword: 'Kata sandi saat ini', newPassword: 'Kata sandi baru', confirmPassword: 'Konfirmasi kata sandi baru', updatePassword: 'Ubah kata sandi', settingsEyebrow: 'Preferensi akun', settingsTitle: 'Pengaturan', settingsDesc: 'Atur tampilan, bahasa, dan informasi profilmu.', appearance: 'Tampilan', theme: 'Tema', themeDesc: 'Pilih tampilan yang nyaman untukmu.', light: 'Terang', dark: 'Gelap', lightDesc: 'Mode terang untuk siang hari', darkDesc: 'Mode gelap yang nyaman di mata', language: 'Bahasa', profile: 'Profil', name: 'Nama', role: 'Peran', class: 'Kelas', saveProfile: 'Simpan profil', teacherClass: 'Kelas yang diajar (Wali kelas)'
    }
    , en: {
        transactionHistory: 'Transaction history', transactionHistoryDesc: 'Cash transaction records saved on this device.', expenseHistory: 'Expense history', expenseHistoryDesc: 'Expenses recorded from the class fund.', studentsTitle: 'Students', studentsDesc: 'Students registered in your class.', registerStudent: 'Register a student', studentName: 'Student name', studentNis: 'Student ID', studentClass: 'Class', classRole: 'Class role', ordinaryStudent: 'Regular student', treasurerAdmin: 'Treasurer', saveStudent: 'Save student', changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password', confirmPassword: 'Confirm new password', updatePassword: 'Change password', settingsEyebrow: 'Account preferences', settingsTitle: 'Settings', settingsDesc: 'Choose your appearance, language, and profile details.', appearance: 'Appearance', theme: 'Theme', themeDesc: 'Choose the look that works for you.', light: 'Light', dark: 'Dark', lightDesc: 'Bright view for daytime', darkDesc: 'A softer view for low light', language: 'Language', profile: 'Profile', name: 'Name', role: 'Role', class: 'Class', saveProfile: 'Save profile', teacherClass: 'Class you teach (Homeroom teacher)'
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
    l.dataset.t = 'teacherClass';
    l.textContent = translations[language].teacherClass;
}
function loadProfile() {
    const form = document.getElementById('profileForm'), locked = document.getElementById('profileLocked');
    if(!form||!locked)return;
    form.style.display = user ? 'block' : 'none';
    locked.style.display = user ? 'none' : 'block';
    populateClassSelect();
    if (user) {
        document.getElementById('profileName').value = user.name || '';
        const byName = classes.find(c => c.name.toLowerCase() === String(user.className || '').toLowerCase());
        document.getElementById('profileClass').value = String(user.classId ?? byName?.id ?? user.className ?? '')
    }
    const ls=document.getElementById('languageSelect');if(ls)ls.value=language;
    setTheme(localStorage.getItem('kasmateTheme') || 'light');
    updateProfileClassLabel()
}
function populateClassSelect() {
    const select = document.getElementById('profileClass');
    if (!select) return;
    const selected = user?.classId ?? classes.find(c => c.name.toLowerCase() === String(user?.className || '').toLowerCase())?.id ?? user?.className ?? '';
    const prompt = classLoadState === 'loading' ? (language === 'en' ? 'Loading classes…' : 'Memuat kelas…') : classes.length ? (language === 'en' ? 'Select your class' : 'Pilih kelas yang diajar') : classLoadState === 'unavailable' ? (language === 'en' ? 'The API is not providing its class list yet' : 'API belum menyediakan daftar kelas') : (language === 'en' ? 'No classes available' : 'Belum ada kelas');
    const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    select.innerHTML = '<option value="">' + escape(prompt) + '</option>' + classes.map(c => '<option value="' + escape(c.id ?? c.name) + '">' + escape(c.name) + '</option>').join('');
    select.value = String(selected)
}
function pickRole(btn) {
    role = btn.dataset.role;
    document.querySelectorAll('.role-picks button').forEach(b => b.classList.toggle('selected', b === btn))
}
function showNotice(id, msg) {
    const n = document.getElementById(id);
    n.textContent = msg;
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
        showNotice('registerNotice', language === 'en' ? 'Password must be at least 8 characters.' : 'Kata sandi minimal 8 karakter.'); return
    }
    const accounts = localUsers(); if (accounts.some(a => a.username.toLowerCase() === username.toLowerCase())) {
        showNotice('registerNotice', language === 'en' ? 'That username is already registered.' : 'Username tersebut sudah terdaftar.'); return
    }
    try {
        const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''), passwordHash = await hashLocalPassword(password, salt), account = {
            id: crypto.randomUUID(), name, username, role: 'guru', classId: null, className: '', salt, passwordHash
        }
        ; accounts.push(account); storeLocalUsers(accounts); saveSession( {
            id: account.id, name, username, role: 'guru', classId: null, className: ''
        }
        ); showNotice('registerNotice', language === 'en' ? 'Local account created.' : 'Akun lokal berhasil dibuat.'); e.target.reset(); go('dashboard')
    }
    catch (error) {
        showNotice('registerNotice', error.message)
    }
}
);
document.getElementById('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault(); const fields = e.target.querySelectorAll('input'), username = fields[0].value.trim(), password = fields[1].value, account = localUsers().find(a => a.username.toLowerCase() === username.toLowerCase()); if (!account) {
        showNotice('loginNotice', language === 'en' ? 'Local account not found. Register first.' : 'Akun lokal tidak ditemukan. Silakan daftar terlebih dahulu.'); return
    }
    try {
        const passwordHash = await hashLocalPassword(password, account.salt); if (passwordHash !== account.passwordHash) {
            showNotice('loginNotice', language === 'en' ? 'Incorrect username or password.' : 'Username atau kata sandi salah.'); return
        }
        saveSession( {
            id: account.id, name: account.name, username: account.username, role: account.role || 'guru', classId: account.classId || null, className: account.className || ''
        }
        ); e.target.reset(); go('dashboard')
    }
    catch (error) {
        showNotice('loginNotice', error.message)
    }
}
);
document.getElementById('studentRole')?.addEventListener('change', updateStudentRoleHelp);
document.getElementById('studentRegistrationForm')?.addEventListener('submit', e => {
    e.preventDefault(); if (!user || !['guru', 'teacher'].includes(String(user.role || 'guru').toLowerCase())) return; const name = document.getElementById('studentName').value.trim(), nis = document.getElementById('studentNis').value.trim(), classId = document.getElementById('studentClass').value, role = document.getElementById('studentRole').value, selectedClass = classes.find(c => String(c.id) === classId); if (!name || !nis || !selectedClass) {
        showNotice('studentNotice', language === 'en' ? 'Enter the student details and choose a class.' : 'Lengkapi data murid dan pilih kelas.'); return
    }
    if (dbStudents.some(row => String(row.nis ?? '').toLowerCase() === nis.toLowerCase())) {
        showNotice('studentNotice', language === 'en' ? 'That student ID is already registered.' : 'NIS tersebut sudah terdaftar.'); return
    }
    const access = {
        isAdmin: role === 'bendahara', isTreasurer: role === 'bendahara'
    }
    ; dbStudents.push( {
        id: crypto.randomUUID(), nis, name, classId: selectedClass.id, className: selectedClass.name, role, ...access
    }
    ); localStorage.setItem('kasmateStudents', JSON.stringify(dbStudents)); const c = classes.findIndex(item => String(item.id) === classId); if (c >= 0) classes[c].students = dbStudents.filter(row => String(row.classId) === classId).length; localStorage.setItem('kasmateClasses', JSON.stringify(classes)); document.getElementById('apiStudentCount').textContent = dbStudents.length; renderApiStudents(dbStudents); renderClasses(); e.target.reset(); populateStudentClassSelect(); updateStudentRoleHelp(); showNotice('studentNotice', language === 'en' ? 'Student saved on this device.' : 'Murid berhasil disimpan di perangkat ini.')
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
        const accounts = localUsers(), index = accounts.findIndex(a => a.id === user.id); if (index < 0) throw new Error(language === 'en' ? 'Local account not found.' : 'Akun lokal tidak ditemukan.'); if (await hashLocalPassword(old, accounts[index].salt) !== accounts[index].passwordHash) throw new Error(language === 'en' ? 'Current password is incorrect.' : 'Kata sandi saat ini tidak sesuai.'); const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''); accounts[index].salt = salt; accounts[index].passwordHash = await hashLocalPassword(next, salt); storeLocalUsers(accounts); e.target.reset(); showNotice('passwordNotice', language === 'en' ? 'Password updated locally.' : 'Kata sandi lokal berhasil diubah.')
    }
    catch (error) {
        showNotice('passwordNotice', error.message)
    }
}
);
document.getElementById('profileForm')?.addEventListener('submit', e => {
    e.preventDefault(); if (!user) {
        go('login'); return
    }
    const name = document.getElementById('profileName').value.trim(), choice = document.getElementById('profileClass').value, chosen = classes.find(c => String(c.id ?? c.name) === choice); user.name = name; user.classId = chosen?.id ?? null; user.className = chosen?.name || ''; sessionStorage.setItem('kasmateUser', JSON.stringify(user)); const accounts = localUsers(), index = accounts.findIndex(a => a.id === user.id); if (index >= 0) {
        accounts[index].name = name; accounts[index].classId = user.classId; accounts[index].className = user.className; storeLocalUsers(accounts)
    }
    showNotice('profileNotice', language === 'en' ? 'Profile saved on this device.' : 'Profil disimpan di perangkat ini.')
}
);
function renderClasses() {
    const host = document.getElementById('classGrid');
    if (!host) return;
    host.innerHTML = classes.length ? classes.map(c => '<article class="class-card"><div class="top"><span class="pill green">' + (language === 'en' ? 'Local' : 'Lokal') + '</span></div><h3>' + c.name + '</h3><p>' + c.students + ' siswa</p></article>').join('') : '<div class="empty">' + (language === 'en' ? 'No local classes yet. Create one to get started.' : 'Belum ada kelas lokal. Buat kelas untuk memulai.') + '</div>'
}
function renderStudents() {
    if (!document.getElementById('studentRows')) return;
    const q = (document.getElementById('studentSearch')?.value || '').toLowerCase(), f = document.getElementById('paymentFilter')?.value || 'all';
    const rows = students.filter(s => s.join(' ').toLowerCase().includes(q) && (f === 'all' || f === s[3]));
    document.getElementById('studentRows').innerHTML = rows.map(s => `<tr><td><strong>${s[0]}</strong></td><td>${s[1]}</td><td>${s[2]}</td><td><span class="pill ${s[3] === 'Sudah bayar' ? 'green' : 'red'}">${s[3]}</span></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Tidak ada siswa yang cocok.</td></tr>'
}
function deleteClass(index) {
    const item = classes[index];
    if (!item || item.createdBy !== user?.username) {
        toast('Kamu hanya dapat menghapus kelas milik akunmu.');
        return
    }
    if (!confirm('Hapus kelas ' + item.name + '?')) return;
    classes.splice(index, 1);
    localStorage.setItem('kasmateClasses', JSON.stringify(classes));
    renderClasses();
    toast('Kelas berhasil dihapus.')
}
function openModal() {
    document.getElementById('modalBack')&&(document.getElementById('modalBack').style.display='grid')
}
function closeModal() {
    document.getElementById('modalBack')&&(document.getElementById('modalBack').style.display='none')
}
function addClass() {
    if (!user) {
        go('login');
        return
    }
    if (classes.some(c => c.createdBy === user.username)) {
        toast('Satu akun hanya dapat mendaftarkan satu kelas.');
        closeModal();
        return
    }
    const name=document.getElementById('newClassName')?.value.trim()||'',school=document.getElementById('newSchool')?.value.trim()||'';
    if (!name || !school) {
        toast('Lengkapi nama kelas dan sekolah.');
        return
    }
    classes.unshift( {
        id: crypto.randomUUID(), name, school, year:document.getElementById('newYear')?.value||'', students: 0, balance: 0, active: true, createdBy: user.username
    }
    );
    localStorage.setItem('kasmateClasses', JSON.stringify(classes));
    closeModal();
    renderClasses();
    toast('Kelas ' + name + ' berhasil didaftarkan.');
    if(document.getElementById('newClassName'))document.getElementById('newClassName').value='';
    if(document.getElementById('newSchool'))document.getElementById('newSchool').value=''
}
let toastTimer;
function toast(msg) {
    const t = document.getElementById('toast');
    if(!t)return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.style.display = 'none', 2600)
}
renderClasses();renderStudents();setTheme(localStorage.getItem('kasmateTheme')||'light');setLanguage(language);updateNav();
const current=({'':'home','index.html':'home','about.html':'about','dashboard.html':'dashboard','transactions.html':'transactions','settings.html':'settings','login.html':'login','register.html':'register'})[location.pathname.split('/').pop()]||'home';
if(['dashboard','transactions'].includes(current)&&!user)go('login');else if(user&&['login','register'].includes(current))go('dashboard');else{document.querySelector('[data-page="'+current+'"]')?.classList.add('active');if(current==='settings')loadProfile();if(current==='dashboard'&&user)loadDashboardData();if(current==='transactions')renderLocalHistories();}
