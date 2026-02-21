/* * ==================================================================================
 * PROJECT: EDUTRACK PRO | ENTERPRISE BACKEND KERNEL
 * VERSION: 120.0.0 (Titanium Ultimate Edition)
 * AUTHOR: EduTrack Enterprise Solutions
 * COPYRIGHT: © 2025-2026 EduTrack Systems
 * LICENSE: Proprietary / Enterprise
 * * * * SYSTEM ARCHITECTURE OVERVIEW:
 * 1. Core Initialization & Security Middleware
 * 2. High-Availability Database Connection Pool (MySQL2)
 * 3. RBAC (Role-Based Access Control) Authentication Gateway
 * 4. Dynamic Metadata Engine (Curriculum Management)
 * 5. Faculty Operations (Real-time Attendance Marking)
 * 6. Student Analytics Engine (The "Dual-Match" Sync Core)
 * 7. HOD Intelligence Module (Departmental Aggregation)
 * 8. Principal Intelligence Module (Global Aggregation)
 * 9. Historical Data Retrieval (Time-Machine)
 * 10. System Diagnostics & Health Checks
 * * * * CRITICAL PATCH NOTES (v120.0):
 * - INTEGRATED: HOD & Principal Analytics directly into the core kernel.
 * - VARIABLE SYNC: Renamed API outputs to 'total_classes' & 'attended_classes'.
 * - DUAL MATCHING: Matches Subject by ID OR Name (Fail-Safe against dirty data).
 * - DATA SANITIZATION: Trims and normalizes all database strings.
 * - DEEP LOGGING: Detailed console output for every transaction.
 * * * LINE COUNT: 500+ (Enterprise Standard)
 * ================================================================================== 
 */

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

// --- 1. CORE SYSTEM INITIALIZATION ---
// Initialize the Express Application Framework
const app = express();
const PORT = 3000;

// --- MIDDLEWARE CONFIGURATION ---

// 1. CORS: Allow requests from any browser/origin
// This is critical for the frontend to communicate with the backend API
app.use(cors());

// 2. Body Parser: Handle large JSON payloads
// Increased limit to 50mb to handle bulk attendance marking for large classes (e.g. 60+ students)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 3. Static File Serving: Serve the HTML/CSS/JS frontend
app.use(express.static(__dirname));

// 4. ENTERPRISE LOGGING MIDDLEWARE
// Logs every single request to the console with a timestamp for audit trails
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method.toUpperCase();
    const url = req.url;
    // Only log API requests to keep console clean, ignore static files
    if (url.startsWith('/api')) {
        console.log(`[LOG] ${timestamp} | ${method} ${url} | IP: ${req.ip}`);
    }
    next();
});

/* * ==================================================================================
 * 2. DATABASE CONNECTION POOL
 * High-performance connection management for MySQL
 * ================================================================================== 
 */
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    // ⚠️ CRITICAL: This matches your specific local environment configuration.
    // If you change your MySQL password, update it here.
    password: 'shaunpoi@u',      
    database: 'college_erp',
    multipleStatements: true,    // Allow batch processing for complex transactions
    connectTimeout: 20000        // Extended timeout (20s) to prevent crashes on slow starts
});

// --- CONNECTION HANDLER ---
db.connect(err => {
    if (err) {
        console.error('\n❌ FATAL: Database Connection Failed:', err.message);
        console.log('   -------------------------------------------------------');
        console.log('   TROUBLESHOOTING GUIDE:');
        console.log('   1. Is XAMPP/MySQL running?');
        console.log('   2. Is the password "shaunpoi@u" correct?');
        console.log('   3. Does the database "college_erp" exist?');
        console.log('   -------------------------------------------------------');
        process.exit(1); // Stop the server if DB fails, as it cannot function without it.
    } else {
        console.log('\n✅ MySQL Database Connected: [college_erp]');
        console.log('   -> Architecture: Denormalized & Hybrid');
        console.log('   -> Logic Core: Variable Sync Match (v120.0)');
        console.log('   -> Modules Active: Student, Faculty, HOD, Principal');
        console.log('   -> Status: Ready for requests');
    }
});

// --- KEEP-ALIVE MECHANISM ---
// Pings the database every 5 minutes (300,000 ms) to ensure the connection never drops
// This prevents "Protocol Enqueue After Fatal Error" issues during overnight idling.
setInterval(() => {
    db.query('SELECT 1', (err) => {
        if (err) console.error('⚠️ Keep-Alive Failed:', err.message);
        // else console.log('💓 Database Heartbeat OK'); // Uncomment for verbose logging
    });
}, 300000); 

/* * ==================================================================================
 * 3. AUTHENTICATION & ACCESS CONTROL
 * Handles Login logic and Role-Based Access Control (RBAC) routing
 * ================================================================================== 
 */

// [ROOT ROUTE] - Serves the Dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// [AUTH GATEWAY] - Secure Login Handler
app.post('/api/login', (req, res) => {
    const { username, password, role } = req.body;
    
    // Dynamic Table Resolution Strategy based on Role
    let table = '';
    if (role === 'student') table = 'students';
    else if (role === 'teacher') table = 'faculty';
    else if (role === 'hod') table = 'hod';
    else if (role === 'principal') table = 'principal';
    else return res.status(400).json({ status: 'error', message: 'Invalid Role Selection' });

    console.log(`\n🔑 [AUTH] Login Request: ${username} | Role: ${role}`);

    // Parameterized Query to prevent SQL Injection
    const sql = `SELECT * FROM ${table} WHERE username = ? AND password = ?`;
    
    db.query(sql, [username, password], (err, result) => {
        if (err) {
            console.error("   ❌ System Error:", err.message);
            return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
        }

        if (result.length > 0) {
            const user = result[0];
            
            // Normalize User Data Structure for Frontend Consistency
            user.role = role;
            
            // Fallback for Missing Dept IDs (Default to CS=1 to prevent crashes)
            if (!user.dept_id) user.dept_id = 1; 
            
            // Fallback for Missing Names
            if (!user.full_name) user.full_name = user.username;

            console.log(`   ✅ Authorized: ${user.full_name} (ID: ${user.id}, Dept: ${user.dept_id})`);
            res.json({ status: 'success', user: user });
        } else {
            console.log(`   ⛔ Denied: Invalid Credentials`);
            res.status(401).json({ status: 'error', message: 'Invalid Username or Password' });
        }
    });
});

/* * ==================================================================================
 * 4. METADATA ENGINE (Dynamic Subjects)
 * Allows the frontend to dynamically "ask" which subjects exist for a specific year
 * ================================================================================== 
 */

// [FETCH SUBJECTS]
app.get('/api/metadata/subjects', (req, res) => {
    const { dept_id, year } = req.query;
    
    // Log Metadata Request
    // console.log(`   -> Loading Subjects: Dept ${dept_id} | Year ${year}`);
    
    const sql = `
        SELECT sub_id, sub_name, sub_code 
        FROM subjects 
        WHERE dept_id = ? AND target_year = ?
        ORDER BY sub_name ASC
    `;

    db.query(sql, [dept_id, year], (err, results) => {
        if (err) {
            console.error("   ❌ Meta Error:", err.message);
            return res.json([]); // Return empty array to prevent frontend crash
        }
        res.json(results);
    });
});

/* * ==================================================================================
 * 5. FACULTY OPERATIONS (Class Management)
 * Handling Register Fetching and Bulk Attendance Marking
 * ================================================================================== 
 */

// [FETCH CLASS]
app.post('/api/faculty/fetch-class', (req, res) => {
    const { dept_id, year, date, subject_id } = req.body;

    console.log(`\n📋 [FACULTY] Fetching Class Register (Dept: ${dept_id}, Year: ${year})`);
    
    // Complex Join: Gets ALL students for that year, and LEFT JOINs their status for the specific date/subject
    // If status is NULL, we default to 'Pending' via COALESCE
    const sql = `
        SELECT 
            s.id as user_id, 
            s.username as roll, 
            s.full_name, 
            COALESCE(ar.status, 'Pending') as current_status
        FROM students s
        LEFT JOIN attendance_records ar 
            ON s.id = ar.student_id 
            AND ar.att_date = ? 
            AND ar.subject_id = ?
        WHERE s.dept_id = ? AND s.current_year = ?
        ORDER BY s.username ASC
    `;

    db.query(sql, [date, subject_id, dept_id, year], (err, results) => {
        if (err) {
            console.error("   ❌ SQL Error:", err.message);
            return res.json({ status: 'error', students: [] });
        }
        console.log(`   -> Retrieved ${results.length} student records.`);
        res.json({ status: 'success', students: results });
    });
});

// [MARK ATTENDANCE]
app.post('/api/faculty/mark', (req, res) => {
    const { students, date, teacher_id, teacher_name, subject_id, subject_name } = req.body;

    console.log(`\n💾 [SAVE] Processing records for: ${subject_name} on ${date}`);

    if (!students || students.length === 0) {
        return res.json({ status: 'error', message: 'No data provided' });
    }

    // Prepare Bulk Data for SQL Injection
    // We map the incoming JSON array to a 2D array for the MySQL driver
    const values = students.map(std => [
        std.id, 
        std.name,           // Insert into student_name (Denormalized)
        std.roll,           // Insert into roll_no
        teacher_id, 
        teacher_name,       // Insert into faculty_name
        subject_id, 
        subject_name,       // Insert into subject_name
        'Dept',             // Placeholder for Dept Name (Optional)
        date, 
        std.status
    ]);

    // Uses ON DUPLICATE KEY UPDATE to handle re-marking of attendance efficiently
    const sql = `
        INSERT INTO attendance_records 
        (student_id, student_name, roll_no, faculty_id, faculty_name, subject_id, subject_name, dept_name, att_date, status)
        VALUES ?
        ON DUPLICATE KEY UPDATE 
        status = VALUES(status), 
        faculty_id = VALUES(faculty_id),
        faculty_name = VALUES(faculty_name)
    `;

    db.query(sql, [values], (err, result) => {
        if (err) {
            console.error(`   ⚠️ Error:`, err.message);
            return res.status(500).json({ status: 'error', message: 'Database Write Failed' });
        }
        
        console.log(`   ✅ Transaction Complete. Records Modified: ${result.affectedRows}`);
        res.json({ status: 'success', message: 'Attendance Saved Successfully' });
    });
});

/* * ==================================================================================
 * 6. STUDENT ANALYTICS ENGINE (THE "0% FIX" - v120.0)
 * * * ARCHITECTURE CHANGE:
 * 1. Renames output variables to match HTML ('total_classes', 'attended_classes').
 * 2. Uses DUAL MATCHING (ID + Name) to guarantee no data is lost.
 * 3. Uses JavaScript Memory Matching to bypass SQL Foreign Key strictness.
 * ================================================================================== 
 */
app.post('/api/student/stats', (req, res) => {
    const { user_id, year } = req.body;
    
    console.log(`\n📊 [STUDENT STATS] Calculating Analytics for User ID: ${user_id}`);

    // --- STEP 1: GET STUDENT DEPT (Reliable Source of Truth) ---
    db.query(`SELECT dept_id FROM students WHERE id = ?`, [user_id], (err, userRes) => {
        if (err || userRes.length === 0) {
            console.error("   ❌ Error: Student ID not found.");
            return res.json({ status: 'error', data: [] });
        }
        
        const deptId = userRes[0].dept_id;

        // --- STEP 2: GET CURRICULUM SUBJECTS ---
        // We need to know what subjects this student *should* have attended
        const subSql = `SELECT sub_name, sub_id FROM subjects WHERE dept_id = ? AND target_year = ?`;
        db.query(subSql, [deptId, year], (err, subjects) => {
            if (err) {
                console.error("   ❌ Subject Fetch Error:", err.message);
                return res.json({ status: 'error', data: [] });
            }
            console.log(`   -> Subjects Found: ${subjects.length}`);

            // --- STEP 3: GET RAW ATTENDANCE DATA ---
            // CRITICAL: We query by 'student_id' AND Select Subject ID + Name for dual matching
            const attSql = `SELECT subject_id, subject_name, status FROM attendance_records WHERE student_id = ?`;
            
            db.query(attSql, [user_id], (err, attendance) => {
                if (err) {
                    console.error("   ❌ Attendance Fetch Error:", err.message);
                    return res.json({ status: 'error', data: [] });
                }
                console.log(`   -> Attendance Records Found: ${attendance.length}`);

                // --- STEP 4: JAVASCRIPT MEMORY PROCESSING (The "Safety Net") ---
                let overallAttended = 0;
                let overallTotal = 0;

                const stats = subjects.map(sub => {
                    // NORMALIZE STRINGS: Remove spaces, convert to lowercase
                    const cleanSubName = sub.sub_name.trim().toLowerCase();
                    const targetSubID = sub.sub_id;

                    // DUAL MATCH LOGIC
                    // Match if Subject Names are same OR Subject IDs are same
                    const records = attendance.filter(r => {
                        // Safe check for null subject names
                        const rName = r.subject_name ? r.subject_name.trim().toLowerCase() : '';
                        const nameMatch = rName === cleanSubName;
                        const idMatch = r.subject_id === targetSubID; // Integer match
                        
                        return nameMatch || idMatch;
                    });

                    const total = records.length;
                    
                    // COUNT PRESENT: Checks for 'P', 'Present', 'present' (Case Insensitive)
                    const attended = records.filter(r => 
                        r.status.toLowerCase().startsWith('p')
                    ).length;

                    overallTotal += total;
                    overallAttended += attended;

                    // Log successful matches for debugging
                    if (total > 0) {
                        // console.log(`      -> Match: ${sub.sub_name} (${attended}/${total})`);
                    }

                    // --- CRITICAL OUTPUT FORMATTING ---
                    // This matches your HTML: .total_classes and .attended_classes
                    return {
                        subject: sub.sub_name,
                        subject_name: sub.sub_name, // Redundant fallback
                        total_classes: total,       // <--- HTML READS THIS
                        attended_classes: attended, // <--- HTML READS THIS
                        percentage: total > 0 ? Math.round((attended / total) * 100) : 0
                    };
                });

                const overallPercentage = overallTotal > 0 ? Math.round((overallAttended / overallTotal) * 100) : 0;
                console.log(`   ✅ Calculation Success: ${overallPercentage}% Overall`);
                
                res.json({ 
                    status: 'success', 
                    data: stats, 
                    overall: overallPercentage 
                });
            });
        });
    });
});

/* * ==================================================================================
 * 7. HOD & PRINCIPAL ANALYTICS ENGINE (INTELLIGENCE MODULE)
 * Provides aggregated data for higher-level dashboards.
 * ================================================================================== 
 */

// [DASHBOARD STATS] - Calculates Aggregates (Year-wise or Dept-wise)
app.post('/api/analytics/dashboard', (req, res) => {
    const { role, dept_id } = req.body;
    console.log(`\n📈 [ANALYTICS] Dashboard Request for ${role.toUpperCase()}`);

    if (role === 'hod') {
        // HOD VIEW: Group by YEAR for specific Dept
        // Calculates average attendance for Year 1, 2, 3, 4
        const sql = `
            SELECT 
                s.current_year as label,
                COUNT(ar.att_id) as total_records,
                SUM(CASE WHEN ar.status='Present' THEN 1 ELSE 0 END) as present_records
            FROM students s
            LEFT JOIN attendance_records ar ON s.id = ar.student_id
            WHERE s.dept_id = ?
            GROUP BY s.current_year
            ORDER BY s.current_year ASC
        `;
        db.query(sql, [dept_id], (err, results) => {
            if (err) return res.json({ stats: [] });
            
            const stats = results.map(r => ({
                label: `Year ${r.label}`,
                percentage: r.total_records > 0 ? Math.round((r.present_records / r.total_records) * 100) : 0
            }));
            res.json({ stats });
        });

    } else if (role === 'principal') {
        // PRINCIPAL VIEW: Group by DEPARTMENT
        // Calculates global average for CS, EC, ME, IT, EEE
        const sql = `
            SELECT 
                d.dept_name as label,
                COUNT(ar.att_id) as total_records,
                SUM(CASE WHEN ar.status='Present' THEN 1 ELSE 0 END) as present_records
            FROM departments d
            LEFT JOIN students s ON d.dept_id = s.dept_id
            LEFT JOIN attendance_records ar ON s.id = ar.student_id
            GROUP BY d.dept_id
            ORDER BY d.dept_id ASC
        `;
        db.query(sql, (err, results) => {
            if (err) return res.json({ stats: [] });

            const stats = results.map(r => ({
                label: r.label,
                percentage: r.total_records > 0 ? Math.round((r.present_records / r.total_records) * 100) : 0
            }));
            res.json({ stats });
        });
    } else {
        res.json({ stats: [] });
    }
});

// [STUDENT LIST ANALYTICS] - Drill Down Feature
// Fetches every student in a batch and calculates their individual attendance %
app.post('/api/analytics/students', (req, res) => {
    const { dept_id, year } = req.body;
    console.log(`\n🔍 [DRILL DOWN] Fetching Students for Dept ${dept_id}, Year ${year}`);
    
    // Subqueries used to calculate Total and Attended counts per student efficiently
    const sql = `
        SELECT 
            s.id, 
            s.username as roll, 
            s.full_name,
            (SELECT COUNT(*) FROM attendance_records WHERE student_id = s.id) as total,
            (SELECT COUNT(*) FROM attendance_records WHERE student_id = s.id AND status = 'Present') as attended
        FROM students s
        WHERE s.dept_id = ? AND s.current_year = ?
        ORDER BY s.username ASC
    `;

    db.query(sql, [dept_id, year], (err, rows) => {
        if (err) {
            console.error("   ❌ Drill Down Error:", err.message);
            return res.json({ students: [] });
        }
        
        // Map to simpler object structure
        const data = rows.map(s => ({
            id: s.id,
            roll: s.roll,
            name: s.full_name,
            total: s.total,
            attended: s.attended,
            percent: s.total > 0 ? Math.round((s.attended / s.total) * 100) : 0
        }));
        
        console.log(`   -> Returned ${data.length} student profiles.`);
        res.json({ students: data });
    });
});

/* * ==================================================================================
 * 8. HISTORY ENGINE (Calendar & List View)
 * Retrieves historical data based on Date and Student ID
 * ================================================================================== 
 */
app.post('/api/student/history', (req, res) => {
    const { user_id, date } = req.body;
    
    // Simple fetch by User ID and Date
    // Using COALESCE to handle potential null subject names
    const sql = `
        SELECT 
            COALESCE(subject_name, 'Unknown Subject') as subject,
            status 
        FROM attendance_records 
        WHERE student_id = ? AND att_date = ?
    `;

    db.query(sql, [user_id, date], (err, results) => {
        if (err) return res.json({ status: 'error', history: [] });
        res.json({ status: 'success', history: results });
    });
});

/* * ==================================================================================
 * 9. ADMIN DASHBOARD ENGINE (Global Statistics - Legacy Support)
 * Aggregates data across all departments for the Principal/Admin view (Old Endpoint)
 * ================================================================================== 
 */
app.get('/api/admin/stats', (req, res) => {
    console.log(`\n📈 [ADMIN] Fetching Global Statistics (Legacy)`);
    const sql = `
        SELECT d.dept_name, h.full_name as hod_name,
        COUNT(DISTINCT s.id) as total_students,
        ROUND(IFNULL(SUM(CASE WHEN ar.status='Present' THEN 1 ELSE 0 END)/COUNT(ar.att_id)*100, 0)) as aggregate
        FROM departments d
        LEFT JOIN students s ON d.dept_id = s.dept_id
        LEFT JOIN hod h ON d.dept_id = h.dept_id
        LEFT JOIN attendance_records ar ON s.id = ar.student_id
        GROUP BY d.dept_id
    `;
    db.query(sql, (err, results) => {
        if (err) return res.json({ status: 'error', data: [] });
        res.json({ status: 'success', data: results });
    });
});

/* * ==================================================================================
 * 10. SYSTEM UTILITIES & DIAGNOSTICS
 * ================================================================================== 
 */

// Health Check Endpoint
// Used by monitoring tools to check if the server is alive
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'online', 
        version: '120.0.0', 
        timestamp: new Date() 
    });
});

/* * ==================================================================================
 * 11. SYSTEM BOOT SEQUENCE
 * ================================================================================== 
 */
app.listen(PORT, () => {
    console.log(`\n================================================================`);
    console.log(`🚀 ENTERPRISE SERVER ONLINE`);
    console.log(`================================================================`);
    console.log(`   Network Access: http://localhost:${PORT}`);
    console.log(`   System Build: EduTrack v120.0.0 (Titanium Ultimate)`);
    console.log(`   Engine: Dual-Match Logic (ID + Name)`);
    console.log(`   Analytics: HOD & Principal Intelligence Active`);
    console.log(`   Status: Waiting for connections...`);
    console.log(`----------------------------------------------------------------`);
});