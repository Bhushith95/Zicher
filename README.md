# AttendAI — AI-Based Attendance Analytics System

**Jyothy Institute of Technology · AIML Department · 2026–27**
Developed by: Bhushith M (1JT24AI007) & Mohammed Tauheed (1JT24AI400)
Guide: Dr. Madhu B.R., HoD — AI & ML

---

## Project Structure

```
attendance-system/
├── backend/
│   ├── db/
│   │   ├── database.js      # SQLite schema (3NF)
│   │   └── seed.js          # Demo data seeder
│   ├── middleware/
│   │   └── auth.js          # JWT auth + RBAC
│   ├── routes/
│   │   ├── auth.js          # Login / me
│   │   ├── attendance.js    # Mark, sessions, live feed, SSE
│   │   └── analytics.js     # Dashboard KPIs, students, courses
│   ├── server.js            # Express app + SSE live feed
│   └── package.json
│
└── frontend/
    └── public/
        ├── index.html       # SPA shell
        ├── css/app.css      # Full stylesheet
        └── js/app.js        # SPA logic (vanilla JS)
```

---

## Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Backend    | Node.js · Express.js              |
| Database   | SQLite 3 (via better-sqlite3)     |
| Auth       | JWT (jsonwebtoken) · bcryptjs     |
| Live Feed  | Server-Sent Events (SSE)          |
| Frontend   | Vanilla HTML/CSS/JS · Chart.js    |
| Fonts      | Space Mono · Syne · IBM Plex Mono |

---

## Setup & Run

### Prerequisites
- Node.js v18+

### Steps

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Seed the database (creates attendance.db with demo data)
npm run seed

# 3. Start the server
npm start
# → http://localhost:3001
```

### Demo Credentials

| Role    | Username  | Password     |
|---------|-----------|--------------|
| Admin   | admin     | admin123     |
| Faculty | faculty1  | faculty123   |
| Faculty | faculty2  | faculty123   |
| Student | bhushith  | student123   |
| Student | tauheed   | student123   |
| Student | priya     | student123   |

---

## Features

### Faculty / Admin Dashboard
- 📊 Real-time KPI cards (students, sessions, avg attendance, at-risk count)
- 📈 Weekly attendance trend chart (Chart.js)
- 🍩 Risk distribution doughnut chart
- 📋 Course-wise performance table

### Mark Attendance
- Select section/course, date, time slot, topic
- One-click "All Present" / "All Absent"
- Per-student P/A/L toggles
- Live summary bar (present/absent/late count)
- Submits via REST API, broadcasts SSE event

### Live Feed
- Real-time stream via Server-Sent Events (SSE)
- Auto-updates when attendance is marked
- Shows student name, USN, course, date, slot, status

### Students View
- Full roster with attendance %, risk badge, progress bars
- Search by name or USN
- Filter by risk (safe/warning/critical)
- Click any student → detailed modal with per-course stats + heatmap
- CSV export

### Courses View
- All courses with faculty, sessions held, avg attendance, at-risk counts

### Student Portal
- Students log in and see only their own attendance
- Per-course breakdown with "sessions needed to reach 75%" warning

---

## Database Schema (3NF)

```
Users → Student / Faculty
Department → Student, Faculty, Course
Course → Section → Session → Attendance
Student ← Student_Stats
AuditLog (all key actions logged)
```

### RBAC
| Role    | Attendance | Analytics | User Mgmt |
|---------|-----------|-----------|-----------|
| Admin   | Full CRUD | Full      | Full      |
| Faculty | Own section | Own     | None      |
| Student | Own (read) | None    | None      |

---

## API Endpoints

```
POST   /api/auth/login              Login
GET    /api/auth/me                 Current user

GET    /api/analytics/overview      Dashboard KPIs + charts
GET    /api/analytics/students      Student list (search/filter)
GET    /api/analytics/student/:id   Student detail
GET    /api/analytics/courses       Course breakdown
GET    /api/analytics/sections      Faculty's sections
GET    /api/analytics/heatmap       Absence heatmap data

GET    /api/attendance/sessions     Session list
POST   /api/attendance/sessions     Create session
GET    /api/attendance/session/:id  Session attendance detail
POST   /api/attendance/mark         Mark/update attendance
GET    /api/attendance/live         Recent feed (last 30)
GET    /api/attendance/my           Student's own records

GET    /api/live-feed?token=...     SSE stream
```
