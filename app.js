/* ═══════════════════════════════════════════════════════
   ATTEND AI — Frontend SPA
   ═══════════════════════════════════════════════════════ */

const API = '';  // same-origin; change to 'http://localhost:3001' if separate

const App = (() => {

  // ── State ───────────────────────────────────────────────
  let token = localStorage.getItem('att_token') || null;
  let user  = JSON.parse(localStorage.getItem('att_user') || 'null');
  let sseSource = null;
  let notifications = [];
  let charts = {};
  let currentView = 'dashboard';

  // ── API helper ──────────────────────────────────────────
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API + path, { headers, ...opts });
    if (res.status === 401) { logout(); return null; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ── Auth ─────────────────────────────────────────────────
  async function login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');

    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (!data) return;
      token = data.token;
      user  = data.user;
      localStorage.setItem('att_token', token);
      localStorage.setItem('att_user', JSON.stringify(user));
      showApp();
    } catch (e) {
      errEl.textContent = e.message || 'Login failed';
      errEl.classList.remove('hidden');
    }
  }

  function logout() {
    token = null; user = null;
    localStorage.removeItem('att_token');
    localStorage.removeItem('att_user');
    if (sseSource) { sseSource.close(); sseSource = null; }
    document.getElementById('login-page').classList.replace('hidden','active');
    document.getElementById('app-page').classList.add('hidden');
    document.getElementById('login-password').value = '';
  }

  function fillDemo(u, p) {
    document.getElementById('login-username').value = u;
    document.getElementById('login-password').value = p;
  }

  // ── App Shell ────────────────────────────────────────────
  function showApp() {
    document.getElementById('login-page').classList.replace('active','hidden');
    document.getElementById('app-page').classList.remove('hidden');

    // Populate user info
    document.getElementById('user-name').textContent = user.full_name;
    document.getElementById('user-role').textContent = user.role.toUpperCase();
    document.getElementById('user-avatar').textContent = user.full_name.split(' ').map(w=>w[0]).slice(0,2).join('');

    buildNav();
    startClock();
    connectSSE();
    navigate('dashboard');
  }

  function buildNav() {
    const nav = document.getElementById('sidebar-nav');
    nav.innerHTML = '';

    const adminLinks = [
      { id:'dashboard', icon:'📊', label:'Dashboard' },
      { id:'students',  icon:'👥', label:'Students' },
      { id:'courses',   icon:'📚', label:'Courses' },
      { id:'mark',      icon:'✅', label:'Mark Attendance' },
      { id:'livefeed',  icon:'📡', label:'Live Feed' },
    ];
    const facultyLinks = [
      { id:'dashboard', icon:'📊', label:'Dashboard' },
      { id:'students',  icon:'👥', label:'My Students' },
      { id:'mark',      icon:'✅', label:'Mark Attendance' },
      { id:'livefeed',  icon:'📡', label:'Live Feed' },
    ];
    const studentLinks = [
      { id:'mystats',   icon:'📈', label:'My Attendance' },
    ];

    const links = user.role === 'admin' ? adminLinks :
                  user.role === 'faculty' ? facultyLinks : studentLinks;

    links.forEach(link => {
      const el = document.createElement('div');
      el.className = 'nav-item';
      el.dataset.view = link.id;
      el.innerHTML = `<span class="nav-icon">${link.icon}</span><span>${link.label}</span>`;
      el.addEventListener('click', () => navigate(link.id));
      nav.appendChild(el);
    });
  }

  function navigate(view) {
    currentView = view;
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById(`view-${view}`);
    if (el) el.classList.remove('hidden');

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === view);
    });

    const titles = {
      dashboard: 'Dashboard', students: 'Students', courses: 'Courses',
      mark: 'Mark Attendance', livefeed: 'Live Feed', mystats: 'My Attendance'
    };
    document.getElementById('topbar-title').textContent = titles[view] || view;

    // Render view
    const renders = {
      dashboard: renderDashboard,
      students:  renderStudents,
      courses:   renderCourses,
      mark:      renderMarkAttendance,
      livefeed:  renderLiveFeed,
      mystats:   renderMyStats,
    };
    if (renders[view]) renders[view]();
  }

  // ── Clock ────────────────────────────────────────────────
  function startClock() {
    function tick() {
      const now = new Date();
      document.getElementById('topbar-time').textContent =
        now.toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' });
    }
    tick();
    setInterval(tick, 30000);
  }

  // ── SSE ──────────────────────────────────────────────────
  function connectSSE() {
    if (!token) return;
    const dot = document.getElementById('live-dot');
    const status = document.getElementById('live-status');

    sseSource = new EventSource(`${API}/api/live-feed?token=${encodeURIComponent(token)}`);

    sseSource.onopen = () => {
      dot.className = 'live-dot connected';
      status.textContent = 'LIVE';
    };

    sseSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'attendance_marked') {
          addNotification({ title:'Attendance Updated', meta:`Session #${data.session_id}`, type:'info' });
          if (currentView === 'livefeed') refreshLiveFeed();
          if (currentView === 'dashboard') renderDashboard();
        }
      } catch {}
    };

    sseSource.onerror = () => {
      dot.className = 'live-dot error';
      status.textContent = 'OFFLINE';
      setTimeout(connectSSE, 5000);
    };
  }

  function addNotification(n) {
    notifications.unshift({ ...n, ts: new Date() });
    const badge = document.getElementById('notif-badge');
    badge.classList.remove('hidden');
    badge.textContent = Math.min(notifications.length, 9);
  }

  function showNotifications() {
    const body = notifications.length === 0
      ? '<div class="empty-state">No notifications yet</div>'
      : `<div class="notif-list">${notifications.slice(0,15).map(n => `
          <div class="notif-item ${n.type||''}">
            <div class="notif-title">${n.title}</div>
            <div class="notif-meta">${n.meta || ''} · ${n.ts.toLocaleTimeString()}</div>
          </div>`).join('')}
        </div>`;

    document.getElementById('notif-badge').classList.add('hidden');
    notifications = [];
    openModal('Notifications', body);
  }

  // ── DASHBOARD ────────────────────────────────────────────
  async function renderDashboard() {
    const el = document.getElementById('view-dashboard');
    el.innerHTML = `<div class="loading-state">Loading dashboard…</div>`;

    try {
      const data = await api('/api/analytics/overview');
      if (!data) return;

      const { kpis, courseStats, weeklyTrend, riskDist, statusDist } = data;

      const riskMap = {};
      riskDist.forEach(r => riskMap[r.risk_flag] = r.count);

      el.innerHTML = `
        <div class="view-header">
          <div class="view-label">Real-time Overview</div>
          <h1 class="view-title">Analytics Dashboard</h1>
          <div class="view-desc">Live attendance metrics across all sections and courses</div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card blue">
            <div class="kpi-num">${kpis.totalStudents}</div>
            <div class="kpi-label">Total Students</div>
            <div class="kpi-sub">AIML · Sem II · Section A</div>
          </div>
          <div class="kpi-card purple">
            <div class="kpi-num">${kpis.totalSessions}</div>
            <div class="kpi-label">Sessions Held</div>
            <div class="kpi-sub">Across all courses</div>
          </div>
          <div class="kpi-card green">
            <div class="kpi-num">${kpis.avgAttendance}%</div>
            <div class="kpi-label">Avg. Attendance</div>
            <div class="kpi-sub">Overall percentage</div>
          </div>
          <div class="kpi-card red">
            <div class="kpi-num">${kpis.atRisk}</div>
            <div class="kpi-label">At-Risk Students</div>
            <div class="kpi-sub">Below 75% threshold</div>
          </div>
          <div class="kpi-card yellow">
            <div class="kpi-num">${riskMap['critical'] || 0}</div>
            <div class="kpi-label">Critical (&lt;65%)</div>
            <div class="kpi-sub">Immediate action needed</div>
          </div>
        </div>

        <div class="charts-row">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">Weekly Attendance Trend</div>
              <div class="chart-badge">LAST 8 WEEKS</div>
            </div>
            <div class="chart-wrap"><canvas id="trend-chart"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">Risk Distribution</div>
              <div class="chart-badge">STUDENTS</div>
            </div>
            <div class="chart-wrap"><canvas id="risk-chart"></canvas></div>
          </div>
        </div>

        <div class="data-table-wrap">
          <div class="data-table-header">
            <div class="data-table-title">Course-wise Performance</div>
            <div class="risk-legend">
              <div class="legend-item"><div class="legend-dot" style="background:var(--accent3)"></div>Safe (≥75%)</div>
              <div class="legend-item"><div class="legend-dot" style="background:var(--warn)"></div>Warning (65-74%)</div>
              <div class="legend-item"><div class="legend-dot" style="background:var(--danger)"></div>Critical (&lt;65%)</div>
            </div>
          </div>
          <table>
            <thead><tr>
              <th>Course</th><th>Code</th><th>Faculty</th><th>Attendance</th>
            </tr></thead>
            <tbody>
              ${courseStats.map(c => {
                const cls = c.avg_pct >= 75 ? 'safe' : c.avg_pct >= 65 ? 'warning' : 'critical';
                return `<tr>
                  <td class="td-name">${c.course_name}</td>
                  <td class="td-usn">${c.course_code}</td>
                  <td>${c.faculty_name || '—'}</td>
                  <td>
                    <div class="pct-bar">
                      <div class="pct-track"><div class="pct-fill ${cls}" style="width:${c.avg_pct}%"></div></div>
                      <div class="pct-val">${c.avg_pct}%</div>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Trend chart
      const trendCtx = document.getElementById('trend-chart').getContext('2d');
      if (charts.trend) charts.trend.destroy();
      charts.trend = new Chart(trendCtx, {
        type: 'line',
        data: {
          labels: weeklyTrend.map(w => w.week_start ? w.week_start.slice(5) : `W${w.week}`),
          datasets: [{
            label: 'Attendance %',
            data: weeklyTrend.map(w => w.pct),
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0,212,255,0.08)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#00d4ff',
            pointRadius: 4,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#64748b', font: { family: 'IBM Plex Mono', size: 10 } }, grid: { color: '#1e2d45' } },
            y: { ticks: { color: '#64748b', font: { family: 'IBM Plex Mono', size: 10 } }, grid: { color: '#1e2d45' }, min: 0, max: 100 }
          }
        }
      });

      // Risk doughnut
      const riskCtx = document.getElementById('risk-chart').getContext('2d');
      if (charts.risk) charts.risk.destroy();
      charts.risk = new Chart(riskCtx, {
        type: 'doughnut',
        data: {
          labels: ['Safe', 'Warning', 'Critical'],
          datasets: [{
            data: [riskMap['safe']||0, riskMap['warning']||0, riskMap['critical']||0],
            backgroundColor: ['rgba(16,185,129,0.7)', 'rgba(245,158,11,0.7)', 'rgba(239,68,68,0.7)'],
            borderColor: ['#10b981', '#f59e0b', '#ef4444'],
            borderWidth: 1,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#64748b', font: { family: 'IBM Plex Mono', size: 10 } } }
          },
          cutout: '65%'
        }
      });

    } catch (e) {
      el.innerHTML = `<div class="empty-state">Error loading dashboard: ${e.message}</div>`;
    }
  }

  // ── STUDENTS ─────────────────────────────────────────────
  async function renderStudents(search='', risk='', courseId='') {
    const el = document.getElementById('view-students');
    el.innerHTML = `
      <div class="view-header">
        <div class="view-label">Student Analytics</div>
        <h1 class="view-title">All Students</h1>
      </div>
      <div class="data-table-wrap">
        <div class="data-table-header">
          <div class="data-table-title">Student Roster</div>
          <div class="data-table-controls">
            <input class="search-input" id="student-search" placeholder="Search name or USN…" value="${search}" oninput="App.searchStudents()">
            <select class="filter-select" id="risk-filter" onchange="App.filterStudents()">
              <option value="">All Risk</option>
              <option value="safe"     ${risk==='safe'?'selected':''}>Safe</option>
              <option value="warning"  ${risk==='warning'?'selected':''}>Warning</option>
              <option value="critical" ${risk==='critical'?'selected':''}>Critical</option>
            </select>
            <button class="btn btn-primary btn-sm" onclick="App.exportStudents()">↓ Export</button>
          </div>
        </div>
        <div id="student-table-body"><div class="loading-state">Loading…</div></div>
      </div>
    `;

    await loadStudentTable(search, risk, courseId);
  }

  async function loadStudentTable(search='', risk='', courseId='') {
    const body = document.getElementById('student-table-body');
    if (!body) return;

    try {
      let url = '/api/analytics/students?';
      if (search) url += `search=${encodeURIComponent(search)}&`;
      if (risk)   url += `risk=${risk}&`;
      if (courseId) url += `course_id=${courseId}&`;

      const students = await api(url);
      if (!students) return;

      if (students.length === 0) {
        body.innerHTML = '<div class="empty-state">No students found</div>';
        return;
      }

      body.innerHTML = `
        <table>
          <thead><tr>
            <th>Name</th><th>USN</th><th>Section</th>
            <th>Avg. Attendance</th><th>Risk</th><th>Sessions</th><th>Action</th>
          </tr></thead>
          <tbody>
            ${students.map(s => {
              const pct = s.overall_pct || 0;
              const risk = pct >= 75 ? 'safe' : pct >= 65 ? 'warning' : 'critical';
              return `<tr>
                <td class="td-name">${s.full_name}</td>
                <td class="td-usn">${s.usn}</td>
                <td>${s.section}</td>
                <td>
                  <div class="pct-bar">
                    <div class="pct-track"><div class="pct-fill ${risk}" style="width:${pct}%"></div></div>
                    <div class="pct-val">${pct.toFixed(1)}%</div>
                  </div>
                </td>
                <td><span class="badge badge-${risk}">${risk.toUpperCase()}</span></td>
                <td>${s.total_attended || 0}/${s.total_sessions || 0}</td>
                <td><button class="btn btn-sm" onclick="App.viewStudent(${s.student_id})">View →</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      body.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  }

  let searchTimer;
  function searchStudents() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const s = document.getElementById('student-search')?.value || '';
      const r = document.getElementById('risk-filter')?.value || '';
      loadStudentTable(s, r);
    }, 300);
  }

  function filterStudents() {
    const s = document.getElementById('student-search')?.value || '';
    const r = document.getElementById('risk-filter')?.value || '';
    loadStudentTable(s, r);
  }

  async function viewStudent(id) {
    try {
      const data = await api(`/api/analytics/student/${id}`);
      if (!data) return;
      const { student, courseStats, recentAtt } = data;

      const initials = student.full_name.split(' ').map(w=>w[0]).slice(0,2).join('');
      const avgPct = courseStats.length ? (courseStats.reduce((a,b)=>a+b.attendance_pct,0)/courseStats.length).toFixed(1) : 0;
      const overallRisk = avgPct >= 75 ? 'safe' : avgPct >= 65 ? 'warning' : 'critical';

      const body = `
        <div class="student-detail-grid">
          <div class="student-profile-card">
            <div class="profile-avatar">${initials}</div>
            <div class="profile-name">${student.full_name}</div>
            <div class="profile-usn">${student.usn}</div>
            <span class="badge badge-${overallRisk}">${overallRisk.toUpperCase()} · ${avgPct}%</span>
            <div class="divider-h"></div>
            <div class="profile-fields">
              <div class="profile-field"><span class="profile-field-label">Dept</span><span class="profile-field-value">${student.dept_name}</span></div>
              <div class="profile-field"><span class="profile-field-label">Semester</span><span class="profile-field-value">${student.semester}</span></div>
              <div class="profile-field"><span class="profile-field-label">Section</span><span class="profile-field-value">${student.section}</span></div>
              <div class="profile-field"><span class="profile-field-label">Email</span><span class="profile-field-value" style="font-size:.6rem">${student.email}</span></div>
            </div>
          </div>

          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:.65rem;letter-spacing:.15em;color:var(--muted);text-transform:uppercase;margin-bottom:1rem;">Course-wise Stats</div>
            <div class="course-stats-list">
              ${courseStats.map(c => {
                const cls = c.attendance_pct >= 75 ? 'safe' : c.attendance_pct >= 65 ? 'warning' : 'critical';
                return `<div class="course-stat-row">
                  <div class="course-stat-top">
                    <div>
                      <div class="course-code">${c.course_code}</div>
                      <div class="course-name-text">${c.course_name}</div>
                    </div>
                    <span class="badge badge-${c.risk_flag}">${c.risk_flag.toUpperCase()}</span>
                  </div>
                  <div class="pct-bar">
                    <div class="pct-track"><div class="pct-fill ${cls}" style="width:${c.attendance_pct}%"></div></div>
                    <div class="pct-val">${c.attendance_pct.toFixed(1)}%</div>
                  </div>
                  <div style="font-family:'IBM Plex Mono',monospace;font-size:.6rem;color:var(--muted);margin-top:.4rem;">
                    ${c.attended} present / ${c.total_sessions} sessions
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="divider-h"></div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:.65rem;letter-spacing:.15em;color:var(--muted);text-transform:uppercase;margin-bottom:1rem;">Recent Activity (last 20)</div>
        <div style="display:flex;flex-wrap:wrap;gap:.4rem;">
          ${recentAtt.slice(0,20).map(a => `
            <div title="${a.course_code} · ${a.date}" style="
              width:28px;height:28px;border-radius:3px;
              background:${a.status==='present'?'rgba(16,185,129,.3)':a.status==='late'?'rgba(245,158,11,.3)':'rgba(239,68,68,.3)'};
              border:1px solid ${a.status==='present'?'var(--accent3)':a.status==='late'?'var(--warn)':'var(--danger)'};
              font-family:'IBM Plex Mono',monospace;font-size:.55rem;
              display:flex;align-items:center;justify-content:center;
              color:${a.status==='present'?'var(--accent3)':a.status==='late'?'var(--warn)':'var(--danger)'};
            ">${a.status[0].toUpperCase()}</div>
          `).join('')}
        </div>
      `;

      openModal(`${student.full_name} · ${student.usn}`, body);
    } catch (e) {
      openModal('Error', `<div class="empty-state">${e.message}</div>`);
    }
  }

  function exportStudents() {
    api('/api/analytics/students').then(students => {
      if (!students) return;
      const csv = [
        ['Name','USN','Section','Avg %','Risk','Present','Total'].join(','),
        ...students.map(s => [
          `"${s.full_name}"`, s.usn, s.section,
          (s.overall_pct||0).toFixed(1),
          s.overall_pct>=75?'safe':s.overall_pct>=65?'warning':'critical',
          s.total_attended||0, s.total_sessions||0
        ].join(','))
      ].join('\n');
      const a = document.createElement('a');
      a.href = 'data:text/csv,' + encodeURIComponent(csv);
      a.download = 'students_attendance.csv';
      a.click();
    });
  }

  // ── COURSES ──────────────────────────────────────────────
  async function renderCourses() {
    const el = document.getElementById('view-courses');
    el.innerHTML = `<div class="loading-state">Loading courses…</div>`;
    try {
      const courses = await api('/api/analytics/courses');
      if (!courses) return;

      el.innerHTML = `
        <div class="view-header">
          <div class="view-label">Course Analytics</div>
          <h1 class="view-title">All Courses</h1>
        </div>
        <div class="data-table-wrap">
          <div class="data-table-header">
            <div class="data-table-title">Course Performance</div>
          </div>
          <table>
            <thead><tr>
              <th>Course Name</th><th>Code</th><th>Faculty</th>
              <th>Sessions</th><th>Avg Attendance</th><th>Critical</th><th>Warning</th>
            </tr></thead>
            <tbody>
              ${courses.map(c => {
                const cls = (c.avg_attendance||0) >= 75 ? 'safe' : (c.avg_attendance||0) >= 65 ? 'warning' : 'critical';
                return `<tr>
                  <td class="td-name">${c.course_name}</td>
                  <td class="td-usn">${c.course_code}</td>
                  <td>${c.faculty_name || '—'}</td>
                  <td>${c.sessions_held || 0}</td>
                  <td>
                    <div class="pct-bar">
                      <div class="pct-track"><div class="pct-fill ${cls}" style="width:${c.avg_attendance||0}%"></div></div>
                      <div class="pct-val">${(c.avg_attendance||0).toFixed(1)}%</div>
                    </div>
                  </td>
                  <td><span style="color:var(--danger);font-family:'IBM Plex Mono',monospace;font-size:.7rem;">${c.critical_count||0}</span></td>
                  <td><span style="color:var(--warn);font-family:'IBM Plex Mono',monospace;font-size:.7rem;">${c.warning_count||0}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      el.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  }

  // ── MARK ATTENDANCE ──────────────────────────────────────
  let markData = { sessionId: null, students: [], status: {} };

  async function renderMarkAttendance() {
    const el = document.getElementById('view-mark');

    try {
      const sections = await api('/api/analytics/sections');
      if (!sections) return;

      el.innerHTML = `
        <div class="view-header">
          <div class="view-label">Faculty Tool</div>
          <h1 class="view-title">Mark Attendance</h1>
          <div class="view-desc">Select a section and date, then mark each student's status</div>
        </div>

        <div class="mark-controls">
          <div>
            <label style="font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.15em;color:var(--muted);display:block;margin-bottom:.4rem;">SECTION / COURSE</label>
            <select id="section-sel">
              <option value="">— Select Section —</option>
              ${sections.map(s => `<option value="${s.section_id}">${s.course_code} · ${s.course_name} · Sec ${s.section_label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.15em;color:var(--muted);display:block;margin-bottom:.4rem;">DATE</label>
            <input type="date" id="session-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div>
            <label style="font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.15em;color:var(--muted);display:block;margin-bottom:.4rem;">TIME SLOT</label>
            <select id="time-slot">
              <option>Morning</option>
              <option>Afternoon</option>
              <option>Evening</option>
            </select>
          </div>
          <div>
            <label style="font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.15em;color:var(--muted);display:block;margin-bottom:.4rem;">TOPIC</label>
            <input type="text" id="session-topic" placeholder="e.g. Normalization">
          </div>
        </div>

        <div class="mark-actions">
          <button class="btn btn-primary" onclick="App.loadSessionStudents()">Load Students →</button>
          <button class="btn" onclick="App.markAll('present')">✓ All Present</button>
          <button class="btn" onclick="App.markAll('absent')">✗ All Absent</button>
          <button class="btn btn-success" id="submit-att-btn" onclick="App.submitAttendance()" style="display:none">
            ↑ Submit Attendance
          </button>
        </div>

        <div id="att-table-wrap">
          <div class="empty-state">Select a section and click "Load Students"</div>
        </div>
      `;
    } catch (e) {
      el.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  }

  async function loadSessionStudents() {
    const sectionId = document.getElementById('section-sel')?.value;
    const date = document.getElementById('session-date')?.value;
    const slot = document.getElementById('time-slot')?.value;
    const topic = document.getElementById('session-topic')?.value;

    if (!sectionId || !date) {
      alert('Please select a section and date');
      return;
    }

    const wrap = document.getElementById('att-table-wrap');
    wrap.innerHTML = '<div class="loading-state">Creating session…</div>';

    try {
      // Create session
      const sess = await api('/api/attendance/sessions', {
        method: 'POST',
        body: JSON.stringify({ section_id: sectionId, date, time_slot: slot, topic })
      });

      markData.sessionId = sess.session_id;

      // Load students with existing attendance
      const data = await api(`/api/attendance/session/${sess.session_id}`);
      markData.students = data.records;
      markData.status = {};
      data.records.forEach(s => {
        markData.status[s.student_id] = s.status || 'present';
      });

      renderAttendanceTable(wrap);
      document.getElementById('submit-att-btn').style.display = 'inline-block';
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  }

  function renderAttendanceTable(container) {
    const p = Object.values(markData.status).filter(s=>s==='present').length;
    const a = Object.values(markData.status).filter(s=>s==='absent').length;
    const l = Object.values(markData.status).filter(s=>s==='late').length;
    const u = markData.students.length - p - a - l;

    container.innerHTML = `
      <div class="data-table-wrap">
        <div class="mark-summary">
          <div class="summary-item">Total: <span>${markData.students.length}</span></div>
          <div class="summary-item">Present: <span class="s-p">${p}</span></div>
          <div class="summary-item">Absent: <span class="s-a">${a}</span></div>
          <div class="summary-item">Late: <span class="s-l">${l}</span></div>
          <div class="summary-item">Unmarked: <span class="s-u">${u}</span></div>
        </div>
        ${markData.students.map(s => {
          const cur = markData.status[s.student_id] || 'present';
          return `<div class="att-row">
            <div class="att-usn">${s.usn}</div>
            <div class="att-name">${s.full_name}</div>
            <div class="att-btns">
              <button class="att-btn ${cur==='present'?'selected-present':''}" onclick="App.setStatus(${s.student_id},'present')">P</button>
              <button class="att-btn ${cur==='absent'?'selected-absent':''}"  onclick="App.setStatus(${s.student_id},'absent')">A</button>
              <button class="att-btn ${cur==='late'?'selected-late':''}"     onclick="App.setStatus(${s.student_id},'late')">L</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  function setStatus(studentId, status) {
    markData.status[studentId] = status;
    const wrap = document.getElementById('att-table-wrap');
    renderAttendanceTable(wrap);
  }

  function markAll(status) {
    if (markData.students.length === 0) return;
    markData.students.forEach(s => { markData.status[s.student_id] = status; });
    const wrap = document.getElementById('att-table-wrap');
    renderAttendanceTable(wrap);
  }

  async function submitAttendance() {
    if (!markData.sessionId) return;
    const attendances = markData.students.map(s => ({
      student_id: s.student_id,
      status: markData.status[s.student_id] || 'present'
    }));

    try {
      await api('/api/attendance/mark', {
        method: 'POST',
        body: JSON.stringify({ session_id: markData.sessionId, attendances })
      });
      addNotification({ title:'Attendance Submitted', meta:`${attendances.length} students · Session #${markData.sessionId}`, type:'info' });
      openModal('Success', `
        <div style="text-align:center;padding:2rem;">
          <div style="font-size:2.5rem;margin-bottom:1rem;">✅</div>
          <div style="font-size:1.1rem;font-weight:700;margin-bottom:.5rem;">Attendance Submitted</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:.75rem;color:var(--muted);">
            ${attendances.length} students marked for Session #${markData.sessionId}
          </div>
        </div>
      `);
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  // ── LIVE FEED ────────────────────────────────────────────
  async function renderLiveFeed() {
    const el = document.getElementById('view-livefeed');
    el.innerHTML = `
      <div class="view-header">
        <div class="view-label">Real-time Stream</div>
        <h1 class="view-title">Live Attendance Feed</h1>
        <div class="view-desc">Auto-refreshing stream of all attendance events</div>
      </div>
      <div class="live-feed-container">
        <div class="live-header">
          <div class="live-header-title">Activity Stream</div>
          <div class="live-pulse">
            <div class="live-pulse-dot"></div>LIVE
          </div>
          <button class="btn btn-sm" onclick="App.refreshLiveFeed()">↻ Refresh</button>
        </div>
        <div id="feed-list"><div class="loading-state">Loading feed…</div></div>
      </div>
    `;
    await refreshLiveFeed();
  }

  async function refreshLiveFeed() {
    const list = document.getElementById('feed-list');
    if (!list) return;
    try {
      const feed = await api('/api/attendance/live');
      if (!feed) return;

      if (feed.length === 0) {
        list.innerHTML = '<div class="empty-state">No attendance records yet</div>';
        return;
      }

      list.innerHTML = feed.map(item => `
        <div class="feed-item">
          <div class="feed-dot ${item.status}"></div>
          <div class="feed-content">
            <div class="feed-main">${item.student_name} <span style="color:var(--muted);font-weight:400">·</span> ${item.usn}</div>
            <div class="feed-meta">
              <span>${item.course_name}</span>
              <span>·</span>
              <span>${item.date}</span>
              <span>·</span>
              <span>${item.time_slot}</span>
              <span>·</span>
              <span class="badge badge-${item.status}">${item.status.toUpperCase()}</span>
            </div>
          </div>
          <div class="feed-time">${item.marked_at ? item.marked_at.slice(11,16) : ''}</div>
        </div>
      `).join('');
    } catch (e) {
      if (list) list.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  }

  // ── MY STATS (student) ────────────────────────────────────
  async function renderMyStats() {
    const el = document.getElementById('view-mystats');
    el.innerHTML = '<div class="loading-state">Loading your attendance…</div>';
    try {
      const data = await api('/api/attendance/my');
      if (!data) return;
      const { stats, records } = data;

      const avg = stats.length ? (stats.reduce((a,b)=>a+b.attendance_pct,0)/stats.length).toFixed(1) : 0;
      const risk = avg >= 75 ? 'safe' : avg >= 65 ? 'warning' : 'critical';

      el.innerHTML = `
        <div class="view-header">
          <div class="view-label">Student Portal</div>
          <h1 class="view-title">My Attendance</h1>
        </div>

        <div class="kpi-grid" style="max-width:600px">
          <div class="kpi-card ${risk==='safe'?'green':risk==='warning'?'yellow':'red'}">
            <div class="kpi-num">${avg}%</div>
            <div class="kpi-label">Overall Average</div>
          </div>
          <div class="kpi-card blue">
            <div class="kpi-num">${records.length}</div>
            <div class="kpi-label">Total Records</div>
          </div>
          <div class="kpi-card ${risk==='safe'?'green':'red'}">
            <div class="kpi-num">${risk.toUpperCase()}</div>
            <div class="kpi-label">Status</div>
          </div>
        </div>

        <div class="divider-h"></div>

        <div style="font-family:'IBM Plex Mono',monospace;font-size:.65rem;letter-spacing:.15em;color:var(--muted);text-transform:uppercase;margin-bottom:1rem;">Course Breakdown</div>
        <div class="course-stats-list" style="max-width:700px">
          ${stats.map(c => {
            const cls = c.attendance_pct >= 75 ? 'safe' : c.attendance_pct >= 65 ? 'warning' : 'critical';
            return `<div class="course-stat-row">
              <div class="course-stat-top">
                <div>
                  <div class="course-code">${c.course_code}</div>
                  <div class="course-name-text">${c.course_name}</div>
                </div>
                <span class="badge badge-${c.risk_flag}">${c.risk_flag.toUpperCase()}</span>
              </div>
              <div class="pct-bar">
                <div class="pct-track"><div class="pct-fill ${cls}" style="width:${c.attendance_pct}%"></div></div>
                <div class="pct-val">${c.attendance_pct.toFixed(1)}%</div>
              </div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:.6rem;color:var(--muted);margin-top:.4rem;">
                ${c.attended} attended / ${c.total_sessions} sessions
                ${c.risk_flag !== 'safe' ? `· <span style="color:var(--danger)">⚠ Need ${Math.ceil(c.total_sessions*0.75 - c.attended)} more sessions to reach 75%</span>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>

        <div class="divider-h"></div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:.65rem;letter-spacing:.15em;color:var(--muted);text-transform:uppercase;margin-bottom:1rem;">Recent Records</div>
        <div class="data-table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Course</th><th>Slot</th><th>Status</th></tr></thead>
            <tbody>
              ${records.slice(0,20).map(r => `
                <tr>
                  <td>${r.date}</td>
                  <td class="td-name">${r.course_name}</td>
                  <td>${r.time_slot}</td>
                  <td><span class="badge badge-${r.status}">${r.status.toUpperCase()}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      el.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  }

  // ── MODAL ────────────────────────────────────────────────
  function openModal(title, body) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  // ── SIDEBAR TOGGLE ────────────────────────────────────────
  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
  }

  // ── INIT ─────────────────────────────────────────────────
  function init() {
    if (token && user) showApp();
    // Enter key on login
    document.getElementById('login-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') login();
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    login, logout, fillDemo,
    navigate, toggleSidebar,
    viewStudent, exportStudents,
    searchStudents, filterStudents,
    loadSessionStudents, setStatus, markAll, submitAttendance,
    refreshLiveFeed,
    openModal, closeModal,
    showNotifications,
  };

})();
