# KasMate Web

The web interface uses the same KasMate API and MariaDB database as the desktop and Android apps. Sign in with an existing staff account, or register a teacher account that will be stored in the shared database.

## Run on the shared XAMPP host

1. Make sure Apache and MariaDB are running on the host and the API is installed at `D:\xampp\htdocs\KasMateAPI`.
2. From this repository, run `powershell -ExecutionPolicy Bypass -File .\publish-to-xampp.ps1`.
3. On any device connected to the same network, open `http://<XAMPP-host-IP>/KasMateWeb/`.

The browser derives the API address from the host used to open the website, so all devices use the same shared API. The web server's inbound TCP port 80 must be reachable from those devices.

## Shared account and data behavior

- Login and public teacher registration use `auth/login.php` and `auth/register.php`.
- Wali Kelas accounts can see and add records only for their assigned class. A teacher with no class can create one; the API assigns it to that teacher.
- The database Admin account is the global Bendahara and can access all classes.
- Classes, students, transactions, profile class assignment, and password changes are loaded or saved through the API. Theme and language preferences stay in the current browser.
- Class registration stores the school name in `classes.school_name`. Apply `ClassFinance/Database/015_add_class_school_name.sql` to the shared database before using this version of the web app.

## Pages and assets

- `index.html` — Home
- `about.html` — About
- `dashboard.html` — Shared classes and student records
- `transactions.html` — Shared transaction and expense history
- `settings.html` — Theme, language, account details, and password
- `login.html` — Shared API login
- `register.html` — Shared teacher registration
- `css/style.css` — Responsive styles
- `js/app.js` — Navigation, API integration, translation, and preferences
- `assets/kasmate-logo.png` — Logo
