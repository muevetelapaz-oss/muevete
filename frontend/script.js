/* ══════════════════════════════════════════════════════════
   Muevete CRM – Full Frontend Script
   ══════════════════════════════════════════════════════════ */

const API = '/api';
const GYM_CHECKIN_TOKEN = 'MUEVETE-GYM-CHECKIN';
let currentRole = null;   // 'admin' | 'client'
let allClients = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let attCalendar = null;
let attClientId = null;
let attClientPlan = null;
let mainCalendar = null;
let clientAttCalendar = null;
let hoursChart = null;
let daysChart = null;
let clientProfileData = null;
let gymQrCodeInstance = null;
let lastScanTimestamp = null;
let scanPollInterval = null;
let clientHtml5QrScanner = null;
let clientScannerRunning = false;

/* ─── Login ────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  const savedRole = localStorage.getItem('muevete_role');
  if (savedRole) {
    enterApp(savedRole);
  } else {
    showLogin();
  }

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed', err));
  }
});

function showLogin() {
  document.getElementById('login-screen').style.display = 'block';
  document.getElementById('main-app').style.display = 'none';
  document.body.classList.add('login-mode');
  document.body.classList.remove('app-mode');
}

document.getElementById('login-form').addEventListener('submit', e => {
  e.preventDefault();
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  const btn = document.getElementById('login-submit');
  btn.classList.add('is-loading');
  btn.textContent = 'Verificando…';

  setTimeout(() => {
    if (user === 'admin' && pass === 'admin123') {
      enterApp('admin');
    } else if (user === 'cliente' && pass === 'cliente123') {
      enterApp('client');
    } else {
      errEl.style.display = 'block';
      btn.classList.remove('is-loading');
      btn.textContent = 'Entrar al sistema';
    }
  }, 400);
});

function enterApp(role) {
  currentRole = role;
  localStorage.setItem('muevete_role', role);
  
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = '';
  document.body.classList.remove('login-mode');
  document.body.classList.add('app-mode');

  const btn = document.getElementById('login-submit');
  btn.classList.remove('is-loading');
  btn.textContent = 'Entrar al sistema';

  if (role === 'admin') {
    document.getElementById('admin-nav').style.display = '';
    document.getElementById('mobile-nav').style.display = 'flex';
    document.getElementById('admin-content').style.display = '';
    document.getElementById('client-content').style.display = 'none';
    document.getElementById('user-role-text').textContent = 'Panel Administrador';
    const profileBtn = document.getElementById('client-profile-btn');
    if (profileBtn) profileBtn.style.display = 'none';
    
    // Restore last view if exists
    const lastView = localStorage.getItem('muevete_last_view');
    if (lastView && lastView !== 'dashboard') {
      switchView(lastView);
    }

    loadAllData();
    startScanNotificationPolling();
  } else {
    document.getElementById('admin-nav').style.display = 'none';
    document.getElementById('client-nav').style.display = '';
    document.getElementById('mobile-nav').style.display = 'none';
    document.getElementById('client-mobile-nav').style.display = 'flex';
    document.getElementById('admin-content').style.display = 'none';
    document.getElementById('client-content').style.display = '';
    document.getElementById('user-role-text').textContent = 'Portal del Cliente';
    const profileBtn = document.getElementById('client-profile-btn');
    if (profileBtn) profileBtn.style.display = 'inline-flex';
    loadClientView();
  }
  lucide.createIcons();
}

function logout() {
  currentRole = null;
  localStorage.removeItem('muevete_role');
  localStorage.removeItem('muevete_last_view');
  if (scanPollInterval) { clearInterval(scanPollInterval); scanPollInterval = null; }
  lastScanTimestamp = null;
  gymQrCodeInstance = null;
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('admin-nav').style.display = 'none';
  document.getElementById('client-nav').style.display = 'none';
  document.getElementById('mobile-nav').style.display = 'none';
  document.getElementById('client-mobile-nav').style.display = 'none';
  const profileBtn = document.getElementById('client-profile-btn');
  if (profileBtn) profileBtn.style.display = 'none';
  showLogin();
}

/* ─── Dark Mode ────────────────────────────────────────── */
function toggleDarkMode() {
  document.body.classList.toggle('dark');
  document.documentElement.classList.toggle('dark');
  const icon = document.getElementById('theme-icon');
  if (document.body.classList.contains('dark')) {
    icon.setAttribute('data-lucide', 'sun');
  } else {
    icon.setAttribute('data-lucide', 'moon');
  }
  lucide.createIcons();
}

/* ─── Navigation ───────────────────────────────────────── */
function switchView(viewName, btn) {
  localStorage.setItem('muevete_last_view', viewName);
  document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + viewName).classList.remove('hidden');
  
  // Update both desktop and mobile buttons
  document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(b => {
    b.classList.remove('active');
  });
  
  // Highlight the clicked button
  if (btn) {
    btn.classList.add('active');
  } else {
    // If no btn provided (e.g. on load), find the buttons for this view and mark active
    document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(b => {
      if (b.getAttribute('onclick')?.includes(viewName)) {
        b.classList.add('active');
      }
    });
  }
  
  // Sync the other one
  if (btn) {
    const isMobile = btn.classList.contains('mobile-nav-btn');
    const selector = isMobile ? '.nav-btn' : '.mobile-nav-btn';
    document.querySelectorAll(selector).forEach(b => {
      if (b.getAttribute('onclick')?.includes(viewName)) {
        b.classList.add('active');
      }
    });
  }

  if (viewName === 'birthday') {
    initBirthdayCalendar();
    setTimeout(() => mainCalendar?.updateSize(), 100);
  }
  if (viewName === 'schedule') loadAdminScheduleView();
  if (viewName === 'qr') loadGymQRCode();
  if (viewName === 'instagram') loadInstagramPosts(0, 'admin-instagram-feed');
  
  // Scroll to top on view change
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─── Admin: Load All Data ─────────────────────────────── */
async function loadAllData() {
  await loadClients();
  loadDashboard();
}

/* ─── Dashboard ────────────────────────────────────────── */
async function loadDashboard() {
  try {
    loadScheduleOverview(); // Load schedule notifications and who's coming

    const res = await fetch(`${API}/dashboard-stats`);
    const data = await res.json();

    document.getElementById('stat-total-clients').textContent = data.total_clients;
    document.getElementById('stat-avg-attendance').textContent = data.average_attendance;

    // Top clients
    const topEl = document.getElementById('top-clients-list');
    if (data.top_clients.length === 0) {
      topEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.88rem; text-align:center; padding:1rem">Sin datos aún</p>';
    } else {
      topEl.innerHTML = data.top_clients.map((c, i) => `
        <div class="stats-item">
          <span class="stats-item-name">${i + 1}. ${c.name}</span>
          <span class="stats-item-value">${c.count} clases</span>
        </div>
      `).join('');
    }

    // Birthdays
    const bdayEl = document.getElementById('dash-birthday-list');
    if (data.upcoming_birthdays.length === 0) {
      bdayEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.88rem; text-align:center; padding:1rem">Sin cumpleaños próximos</p>';
    } else {
      bdayEl.innerHTML = data.upcoming_birthdays.map(b => `
        <div class="stats-item">
          <span class="stats-item-name">🎂 ${b.name}</span>
          <span class="stats-item-value">${b.days_left === 0 ? '¡HOY!' : 'en ' + b.days_left + ' día(s)'}</span>
        </div>
      `).join('');
    }

    // Charts
    renderDaysChart(data.attendance_by_day);

  } catch (err) {
    console.error('Dashboard error:', err);
  }
}


function renderDaysChart(data) {
  const ctx = document.getElementById('days-chart');
  if (!ctx) return;
  if (daysChart) daysChart.destroy();
  daysChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.day),
      datasets: [{
        label: 'Asistencias',
        data: data.map(d => d.count),
        backgroundColor: 'rgba(219,39,119,0.5)',
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

/* ─── Clients ──────────────────────────────────────────── */
async function loadClients() {
  try {
    const res = await fetch(`${API}/clients`);
    allClients = await res.json();
    renderClientsTable();
  } catch (err) {
    console.error('Load clients error:', err);
  }
}

function getFilteredClients() {
  const q = (document.getElementById('client-search')?.value || '').toLowerCase();
  if (!q) return allClients;
  return allClients.filter(c =>
    c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)
  );
}

function renderClientsTable() {
  const filtered = getFilteredClients();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageClients = filtered.slice(start, start + PAGE_SIZE);

  const tbody = document.getElementById('clients-table-body');
  if (pageClients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:3rem">No se encontraron clientes</td></tr>';
  } else {
    tbody.innerHTML = pageClients.map((c, idx) => {
      const num = start + idx + 1;
      const attendanceCount = (c.attendances || []).length;
      const planLimit = getPlanLimit(c.plan);
      const limitText = planLimit === Infinity ? '∞' : planLimit;
      const birthDisplay = c.birth_date ? formatBirthDate(c.birth_date) : '—';

      return `<tr>
        <td><strong>#${num}</strong></td>
        <td>
          <div style="font-weight:600">${c.name}</div>
          <div style="font-size:0.76rem;color:var(--text-muted)">${c.phone || '—'}</div>
        </td>
        <td><span class="badge badge-plan">${c.plan}</span></td>
        <td style="font-size:0.82rem">${birthDisplay}</td>
        <td>
          <span style="font-weight:700; color: ${attendanceCount >= planLimit && planLimit !== Infinity ? 'var(--accent)' : 'var(--primary)'}">${attendanceCount}</span>
          <span style="color:var(--text-muted);font-size:0.78rem">/ ${limitText}</span>
        </td>
        <td>
          <div style="display:flex;gap:0.35rem; flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" onclick="openAttendanceModal(${c.id})" title="Gestionar asistencias">
              <i data-lucide="calendar-days" style="width:14px;height:14px"></i>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openEditModal(${c.id})" title="Editar cliente">
              <i data-lucide="edit" style="width:14px;height:14px"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  document.getElementById('page-indicator').textContent = `Página ${currentPage} de ${totalPages}`;
  lucide.createIcons();
}

function getPlanLimit(plan) {
  if (!plan) return 8;
  const p = plan.toLowerCase();
  if (p.includes('ilimitado')) return Infinity;
  const match = p.match(/(\d+)/);
  return match ? parseInt(match[1]) : 8;
}

function formatBirthDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function handleSearch() {
  currentPage = 1;
  renderClientsTable();
}

function prevPage() {
  if (currentPage > 1) { currentPage--; renderClientsTable(); }
}

function nextPage() {
  const filtered = getFilteredClients();
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  if (currentPage < totalPages) { currentPage++; renderClientsTable(); }
}

/* ─── Add Client Form ──────────────────────────────────── */
document.getElementById('add-client-form').addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    name: document.getElementById('name').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    plan: document.getElementById('plan').value,
    start_date: document.getElementById('start_date').value || null,
    birth_date: document.getElementById('birth_date').value || null,
  };

  try {
    const res = await fetch(`${API}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      e.target.reset();
      await loadClients();
      loadDashboard();
    }
  } catch (err) {
    console.error('Add client error:', err);
  }
});

/* ─── Edit Client Modal ────────────────────────────────── */
function openEditModal(clientId) {
  const client = allClients.find(c => c.id === clientId);
  if (!client) return;

  document.getElementById('edit-id').value = client.id;
  document.getElementById('edit-name').value = client.name;
  document.getElementById('edit-phone').value = client.phone || '';
  document.getElementById('edit-plan').value = client.plan;
  document.getElementById('edit-start').value = client.start_date || '';
  document.getElementById('edit-birth').value = client.birth_date || '';

  document.getElementById('edit-modal').style.display = 'flex';
  lucide.createIcons();
}

function closeModal() {
  document.getElementById('edit-modal').style.display = 'none';
}

document.getElementById('edit-client-form').addEventListener('submit', async e => {
  e.preventDefault();
  const clientId = document.getElementById('edit-id').value;
  const payload = {
    name: document.getElementById('edit-name').value.trim(),
    phone: document.getElementById('edit-phone').value.trim(),
    plan: document.getElementById('edit-plan').value,
    start_date: document.getElementById('edit-start').value || null,
    birth_date: document.getElementById('edit-birth').value || null,
  };

  try {
    const res = await fetch(`${API}/clients/${clientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      closeModal();
      await loadClients();
      loadDashboard();
    }
  } catch (err) {
    console.error('Edit client error:', err);
  }
});

function confirmDeleteClient() {
  const clientId = document.getElementById('edit-id').value;
  if (!clientId) return;
  if (!confirm('¿Estás seguro de eliminar este cliente permanentemente? Se borrarán también sus asistencias.')) return;
  deleteClient(clientId);
}

async function deleteClient(clientId) {
  try {
    const res = await fetch(`${API}/clients/${clientId}`, { method: 'DELETE' });
    if (res.ok) {
      closeModal();
      await loadClients();
      loadDashboard();
    }
  } catch (err) {
    console.error('Delete client error:', err);
  }
}

/* ─── Attendance Modal ─────────────────────────────────── */
function openAttendanceModal(clientId) {
  const client = allClients.find(c => c.id === clientId);
  if (!client) return;

  attClientId = clientId;
  attClientPlan = client.plan;
  document.getElementById('att-client-name').textContent = client.name;
  document.getElementById('new-att-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('att-limit-warning').style.display = 'none';

  document.getElementById('attendance-modal').style.display = 'flex';
  lucide.createIcons();
  loadAttendanceCalendar(clientId);
}

function closeAttendanceModal() {
  document.getElementById('attendance-modal').style.display = 'none';
  attClientId = null;
  loadClients(); // refresh table
}

async function loadAttendanceCalendar(clientId) {
  try {
    const res = await fetch(`${API}/clients/${clientId}/attendances`);
    const attendances = await res.json();

    const events = attendances.map(a => ({
      id: String(a.id),
      title: a.attendance_time ? `✓ ${a.attendance_time}` : '✓ Asistencia',
      start: a.attendance_date,
      allDay: true,
      backgroundColor: '#7c3aed',
      borderColor: '#7c3aed',
    }));

    const calEl = document.getElementById('att-calendar');
    if (attCalendar) attCalendar.destroy();

    const isMobile = window.innerWidth < 768;

    attCalendar = new FullCalendar.Calendar(calEl, {
      initialView: 'dayGridMonth',
      locale: 'es',
      headerToolbar: {
        left: 'prev',
        center: 'title',
        right: 'next'
      },
      height: 'auto',
      aspectRatio: 1.1,
      handleWindowResize: true,
      expandRows: false,
      events: events,
      eventClick: function(info) {
        if (confirm('¿Eliminar esta asistencia?')) {
          deleteAttendance(parseInt(info.event.id));
        }
      }
    });
    attCalendar.render();

    // Check limit
    const limit = getPlanLimit(attClientPlan);
    const count = attendances.length;
    if (limit !== Infinity && count >= limit) {
      document.getElementById('att-limit-warning').style.display = 'block';
      document.getElementById('btn-add-att').disabled = true;
    } else {
      document.getElementById('att-limit-warning').style.display = 'none';
      document.getElementById('btn-add-att').disabled = false;
    }

  } catch (err) {
    console.error('Attendance calendar error:', err);
  }
}

async function addCustomAttendance() {
  if (!attClientId) return;
  const dateVal = document.getElementById('new-att-date').value;
  if (!dateVal) return;

  try {
    const res = await fetch(`${API}/attendances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: attClientId,
        attendance_date: dateVal,
        attendance_time: new Date().toTimeString().slice(0, 5),
      }),
    });
    if (res.ok) {
      loadAttendanceCalendar(attClientId);
    }
  } catch (err) {
    console.error('Add attendance error:', err);
  }
}

async function deleteAttendance(attId) {
  try {
    const res = await fetch(`${API}/attendances/${attId}`, { method: 'DELETE' });
    if (res.ok && attClientId) {
      loadAttendanceCalendar(attClientId);
    }
  } catch (err) {
    console.error('Delete attendance error:', err);
  }
}

/* ─── Birthday Calendar ────────────────────────────────── */
async function initBirthdayCalendar() {
  try {
    const res = await fetch(`${API}/calendar-events`);
    const events = await res.json();

    const calEvents = events.map(ev => ({
      title: ev.title,
      start: ev.start,
      allDay: ev.allDay,
      className: ev.type === 'birthday' ? 'event-birthday' : 'event-reminder',
    }));

    const calEl = document.getElementById('calendar');
    if (mainCalendar) mainCalendar.destroy();
    
    const isMobile = window.innerWidth < 768;

    mainCalendar = new FullCalendar.Calendar(calEl, {
      initialView: 'dayGridMonth',
      locale: 'es',
      headerToolbar: {
        left: 'prev',
        center: 'title',
        right: 'next'
      },
      height: 'auto',
      aspectRatio: 1.1,
      handleWindowResize: true,
      expandRows: false,
      stickyHeaderDates: false,
      events: calEvents,
    });
    mainCalendar.render();

    // Upcoming list
    loadUpcomingBirthdays();

  } catch (err) {
    console.error('Birthday calendar error:', err);
  }
}

async function loadUpcomingBirthdays() {
  try {
    const res = await fetch(`${API}/dashboard-stats`);
    const data = await res.json();
    const listEl = document.getElementById('upcoming-list');
    if (data.upcoming_birthdays.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">No hay cumpleaños próximos registrados.</p>';
    } else {
      listEl.innerHTML = data.upcoming_birthdays.map(b => `
        <div class="upcoming-item">
          <span class="upcoming-name">🎂 ${b.name}</span>
          <span class="upcoming-date">${b.days_left === 0 ? '¡Hoy!' : 'en ' + b.days_left + ' día(s)'}</span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Upcoming birthdays error:', err);
  }
}

/* ══════════════════════════════════════════════════════════
   SCHEDULE – Admin View
   ══════════════════════════════════════════════════════════ */

async function loadAdminScheduleView() {
  await Promise.all([
    loadAdminScheduleBoard(),
    loadScheduleOverview(),
  ]);
}

/* ── Schedule Form (Admin) ─────────────────────────────── */
document.getElementById('schedule-form').addEventListener('submit', async e => {
  e.preventDefault();

  const editId = document.getElementById('schedule-id').value;
  const payload = {
    title: document.getElementById('schedule-title').value.trim(),
    day_of_week: parseInt(document.getElementById('schedule-day').value),
    start_time: document.getElementById('schedule-start').value,
    end_time: document.getElementById('schedule-end').value || null,
    capacity: parseInt(document.getElementById('schedule-capacity').value) || 12,
    instructor: document.getElementById('schedule-instructor').value.trim() || null,
    notes: document.getElementById('schedule-notes').value.trim() || null,
    color: document.getElementById('schedule-color').value || '#7c3aed',
    is_active: true,
  };

  try {
    let res;
    if (editId) {
      res = await fetch(`${API}/schedules/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(`${API}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    if (res.ok) {
      resetScheduleForm();
      loadAdminScheduleView();
    }
  } catch (err) {
    console.error('Schedule form error:', err);
  }
});

function resetScheduleForm() {
  document.getElementById('schedule-id').value = '';
  document.getElementById('schedule-title').value = '';
  document.getElementById('schedule-day').value = '0';
  document.getElementById('schedule-start').value = '';
  document.getElementById('schedule-end').value = '';
  document.getElementById('schedule-capacity').value = '12';
  document.getElementById('schedule-instructor').value = '';
  document.getElementById('schedule-notes').value = '';
  document.getElementById('schedule-color').value = '#7c3aed';
}

function editSchedule(scheduleId, scheduleData) {
  document.getElementById('schedule-id').value = scheduleId;
  document.getElementById('schedule-title').value = scheduleData.title;
  document.getElementById('schedule-day').value = scheduleData.day_of_week;
  document.getElementById('schedule-start').value = scheduleData.start_time;
  document.getElementById('schedule-end').value = scheduleData.end_time || '';
  document.getElementById('schedule-capacity').value = scheduleData.capacity;
  document.getElementById('schedule-instructor').value = scheduleData.instructor || '';
  document.getElementById('schedule-notes').value = scheduleData.notes || '';
  document.getElementById('schedule-color').value = scheduleData.color || '#7c3aed';

  // Scroll to form
  document.getElementById('schedule-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openReservationsModal(reservations, title) {
  document.getElementById('res-modal-title').textContent = title;
  const listEl = document.getElementById('res-modal-list');
  if (reservations.length === 0) {
    listEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:1rem">Nadie se ha anotado todavía.</p>';
  } else {
    listEl.innerHTML = reservations.map(r => `
      <div class="stats-item">
        <span class="stats-item-name" style="font-weight:600">👤 ${r.client_name}</span>
        <span class="stats-item-value">${r.phone || ''}</span>
      </div>
    `).join('');
  }
  document.getElementById('reservations-modal').style.display = 'flex';
}

function closeReservationsModal() {
  document.getElementById('reservations-modal').style.display = 'none';
}

async function deleteSchedule(scheduleId) {
  if (!confirm('¿Eliminar este horario y todas sus reservas?')) return;
  try {
    const res = await fetch(`${API}/schedules/${scheduleId}`, { method: 'DELETE' });
    if (res.ok) {
      loadAdminScheduleView();
    }
  } catch (err) {
    console.error('Delete schedule error:', err);
  }
}

/* ── Admin Schedule Board (weekly view) ────────────────── */
const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function renderTimetable(schedules, boardEl, isClient, clientId) {
  if (schedules.length === 0) {
    boardEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:2rem;">No hay horarios configurados.</p>';
    return;
  }

  // Get unique start times (rows)
  const uniqueTimes = [...new Set(schedules.map(s => s.start_time))].sort();

  // Check how many days we need (at least Lunes-Sábado, including Domingo if it has classes)
  const hasSunday = schedules.some(s => s.day_of_week === 6);
  const numDays = hasSunday ? 7 : 6;
  const daysColumns = hasSunday ? DAY_NAMES : DAY_NAMES.slice(0, 6);

  let html = `<div class="timetable-wrapper">
    <div class="timetable-grid" style="grid-template-columns: 80px repeat(${numDays}, 1fr);">`;

  // Header row
  html += `<div class="timetable-header">Hora</div>`;
  daysColumns.forEach(day => {
    html += `<div class="timetable-header">${day}</div>`;
  });

  // Time rows
  uniqueTimes.forEach(time => {
    // Time label
    html += `<div class="timetable-time-label">${time}</div>`;

    // Days cells
    for (let day = 0; day < numDays; day++) {
      html += `<div class="timetable-cell">`;

      const daySlots = schedules.filter(s => s.day_of_week === day && s.start_time === time);

      daySlots.forEach(slot => {
        const color = slot.color || '#7c3aed';
        html += `<div class="timetable-slot" style="border-left-color: ${color}">
          <div class="timetable-slot-title" style="color: ${color}">${slot.title}</div>
          ${slot.instructor ? `<div style="font-size:0.7rem; color:var(--text-muted); margin-top:-0.15rem">${slot.instructor}</div>` : ''}
          `;

        if (isClient) {
          const alreadyReserved = slot.reservations && slot.reservations.some(r => r.client_id === clientId);

          html += `<div class="timetable-slot-meta">
            <span>${slot.reserved_count} ingreso(s)</span>
          </div>
          <div class="schedule-action-btns">`;

          if (alreadyReserved) {
            const myRes = slot.reservations.find(r => r.client_id === clientId);
            html += `<button class="btn btn-danger btn-sm" style="flex:1" onclick="cancelClientReservation(${myRes?.id}, ${clientId})">Cancelar</button>
            <span style="font-size:0.65rem;color:var(--primary);font-weight:700;display:flex;align-items:center;padding:0 0.2rem">✓</span>`;
          } else {
            html += `<button class="btn btn-primary btn-sm" style="flex:1; background:${color}" onclick="makeClientReservation(${slot.id}, '${slot.reservation_date}', ${clientId})">Anotarme</button>`;
          }
          html += `</div>`; // .schedule-action-btns
        } else {
          // Admin view
          html += `<div class="timetable-slot-meta" style="cursor:pointer" onclick='openReservationsModal(${JSON.stringify(slot.reservations || []).replace(/'/g, "&apos;")}, "${slot.title}")'>
            <span style="text-decoration: underline; color: var(--primary); font-weight:700">${slot.reserved_count} ingreso(s)</span>
          </div>
          <div class="schedule-action-btns">
            <button class="btn btn-secondary btn-sm" style="flex:1; padding:0.2rem; font-size: 0.65rem" onclick='editSchedule(${slot.id}, ${JSON.stringify({
              title: slot.title,
              day_of_week: slot.day_of_week,
              start_time: slot.start_time,
              end_time: slot.end_time,
              capacity: slot.capacity,
              instructor: slot.instructor,
              notes: slot.notes,
              color: slot.color,
            }).replace(/'/g, "&apos;")})'><i data-lucide="edit" style="width:12px;height:12px;margin-right:2px"></i> Editar</button>
            <button class="btn btn-danger btn-sm" style="flex:1; padding:0.2rem; font-size: 0.65rem" onclick="deleteSchedule(${slot.id})"><i data-lucide="trash-2" style="width:12px;height:12px;margin-right:2px"></i> Borrar</button>
          </div>`;
        }

        html += `</div>`; // .timetable-slot
      });

      html += `</div>`; // .timetable-cell
    }
  });

  html += `</div></div>`; // .timetable-grid, .timetable-wrapper
  boardEl.innerHTML = html;
  lucide.createIcons();
}

async function loadAdminScheduleBoard() {
  try {
    const res = await fetch(`${API}/schedules`);
    const schedules = await res.json();
    const boardEl = document.getElementById('admin-schedule-board');
    renderTimetable(schedules, boardEl, false, null);
  } catch (err) {
    console.error('Admin schedule board error:', err);
  }
}

/* ── Schedule Overview (notifications + who's coming) ──── */
async function loadScheduleOverview() {
  try {
    const res = await fetch(`${API}/schedule-overview?days_ahead=7`);
    const data = await res.json();

    // Note: the #schedule-notifications panel is owned by the QR entry poll
    // (renderScanNotifications); we no longer write class-reservation
    // notifications here to avoid the two functions overwriting each other.

    // Who's coming
    const comingEl = document.getElementById('admin-coming-list');
    if (data.upcoming.length === 0) {
      comingEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:1rem">No hay reservas para los próximos días</p>';
    } else {
      comingEl.innerHTML = data.upcoming.map(item => {
        const clientsList = item.clients.map(c =>
          `<span style="display:inline-flex;align-items:center;gap:0.25rem;padding:0.15rem 0.45rem;background:rgba(var(--primary-rgb),0.08);border-radius:999px;font-size:0.72rem;font-weight:600;margin:0.15rem">${c.name}</span>`
        ).join('');

        return `<div class="reservation-summary" style="margin-bottom:0.65rem">
          <strong style="color:var(--primary);font-size:0.9rem">${item.title}</strong>
          <small>${item.day_name} ${item.reservation_date} · ${item.start_time}${item.end_time ? ' – ' + item.end_time : ''}</small>
          <div style="margin-top:0.45rem;display:flex;flex-wrap:wrap;gap:0.2rem">${clientsList}</div>
          <div style="margin-top:0.3rem;font-size:0.72rem;color:var(--text-muted)">${item.reserved_count}/${item.capacity} reservas</div>
        </div>`;
      }).join('');
    }

  } catch (err) {
    console.error('Schedule overview error:', err);
  }
}


/* ══════════════════════════════════════════════════════════
   CLIENT VIEW
   ══════════════════════════════════════════════════════════ */

async function loadClientView() {
  // For demo purposes, find a client to act as "the logged in client"
  try {
    const res = await fetch(`${API}/clients`);
    const clients = await res.json();
    
    if (clients.length === 0) {
      document.getElementById('client-profile-loading').innerHTML =
        '<p style="color:var(--text-muted)">No hay perfil disponible aún.</p>';
      return;
    }

    // Use the first client as the demo client
    clientProfileData = clients[0];
    renderClientProfile(clientProfileData);
    loadClientAttendanceCalendar(clientProfileData.id);
    loadClientScheduleBoard(clientProfileData.id);
    loadClientReservations(clientProfileData.id);

  } catch (err) {
    console.error('Client view error:', err);
  }
}

function renderClientProfile(client) {
  document.getElementById('client-profile-loading').style.display = 'none';
  document.getElementById('client-profile-form').style.display = '';
  document.getElementById('client-name').value = client.name;
  document.getElementById('client-phone').value = client.phone || '';
  document.getElementById('client-birth-date').value = client.birth_date || '';
  document.getElementById('client-plan-badge').textContent = client.plan;
  document.getElementById('client-start-date').textContent = client.start_date || '—';

  // Update avatar with client's name
  const avatar = document.getElementById('client-profile-avatar');
  if (avatar) {
    avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(client.name)}&background=7c3aed&color=fff&bold=true&size=72`;
  }
}

document.getElementById('client-profile-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!clientProfileData) return;

  const payload = {
    name: document.getElementById('client-name').value.trim(),
    phone: document.getElementById('client-phone').value.trim(),
    plan: clientProfileData.plan,
    start_date: clientProfileData.start_date || null,
    birth_date: document.getElementById('client-birth-date').value || null,
  };

  try {
    const res = await fetch(`${API}/clients/${clientProfileData.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const fb = document.getElementById('client-profile-feedback');
      fb.textContent = '✓ Datos guardados';
      fb.style.display = '';
      fb.style.color = 'var(--primary)';
      setTimeout(() => { fb.style.display = 'none'; }, 3000);
    }
  } catch (err) {
    console.error('Client profile save error:', err);
  }
});

async function loadClientAttendanceCalendar(clientId) {
  try {
    const res = await fetch(`${API}/clients/${clientId}/attendances`);
    const attendances = await res.json();

    const events = attendances.map(a => ({
      title: a.attendance_time ? `✓ ${a.attendance_time}` : '✓',
      start: a.attendance_date,
      allDay: true,
      backgroundColor: '#7c3aed',
      borderColor: '#7c3aed',
    }));

    const calEl = document.getElementById('client-att-calendar');
    if (clientAttCalendar) clientAttCalendar.destroy();
    clientAttCalendar = new FullCalendar.Calendar(calEl, {
      initialView: 'dayGridMonth',
      locale: 'es',
      headerToolbar: { left: 'prev', center: 'title', right: 'next' },
      height: 'auto',
      events: events,
    });
    clientAttCalendar.render();

  } catch (err) {
    console.error('Client attendance calendar error:', err);
  }
}

/* ── Client Schedule Board (sign up to classes) ────────── */
async function loadClientScheduleBoard(clientId) {
  try {
    const res = await fetch(`${API}/schedules`);
    const schedules = await res.json();
    const boardEl = document.getElementById('client-schedule-board');
    renderTimetable(schedules, boardEl, true, clientId);
  } catch (err) {
    console.error('Client schedule board error:', err);
  }
}

async function makeClientReservation(scheduleId, reservationDate, clientId) {
  try {
    const res = await fetch(`${API}/schedule-reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schedule_id: scheduleId,
        client_id: clientId,
        reservation_date: reservationDate,
      }),
    });
    if (res.ok) {
      loadClientScheduleBoard(clientId);
      loadClientReservations(clientId);
    } else {
      const err = await res.json();
      alert(err.detail || 'Error al reservar');
    }
  } catch (err) {
    console.error('Make reservation error:', err);
  }
}

async function cancelClientReservation(reservationId, clientId) {
  if (!confirm('¿Cancelar esta reserva?')) return;
  try {
    const res = await fetch(`${API}/schedule-reservations/${reservationId}`, { method: 'DELETE' });
    if (res.ok) {
      loadClientScheduleBoard(clientId);
      loadClientReservations(clientId);
    }
  } catch (err) {
    console.error('Cancel reservation error:', err);
  }
}

async function loadClientReservations(clientId) {
  try {
    const res = await fetch(`${API}/clients/${clientId}/schedule-reservations`);
    const reservations = await res.json();

    const listEl = document.getElementById('client-reservations-list');
    if (reservations.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:1rem">No tienes reservas activas.</p>';
    } else {
      listEl.innerHTML = reservations.map(r => `
        <div class="reservation-summary" style="margin-bottom:0.55rem">
          <strong style="color:var(--primary)">${r.schedule.title}</strong>
          <small>${r.schedule.day_name} ${r.reservation_date} · ${r.schedule.start_time}${r.schedule.end_time ? ' – ' + r.schedule.end_time : ''}</small>
          ${r.schedule.instructor ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.2rem">🏋️ ${r.schedule.instructor}</div>` : ''}
          <div style="margin-top:0.45rem">
            <button class="btn btn-danger btn-sm" onclick="cancelClientReservation(${r.id}, ${clientId})">Cancelar</button>
          </div>
        </div>
      `).join('');
    }

  } catch (err) {
    console.error('Client reservations error:', err);
  }
}

/* ─── Client Profile Modal ────────────────────────────── */
function openClientProfileModal() {
  document.getElementById('client-profile-modal').style.display = 'flex';
}

function closeClientProfileModal() {
  document.getElementById('client-profile-modal').style.display = 'none';
}

/* ══════════════════════════════════════════════════════════
   QR CODE – Single gym check-in QR
   ══════════════════════════════════════════════════════════ */

function loadGymQRCode() {
  const container = document.getElementById('gym-qr-container');
  if (!container) return;
  container.innerHTML = '';
  gymQrCodeInstance = null;
  gymQrCodeInstance = new QRCode(container, {
    text: GYM_CHECKIN_TOKEN,
    width: 260,
    height: 260,
    colorDark: '#7c3aed',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

/* ══════════════════════════════════════════════════════════
   SCAN NOTIFICATIONS – Real-time admin alerts
   ══════════════════════════════════════════════════════════ */

function startScanNotificationPolling() {
  if (scanPollInterval) clearInterval(scanPollInterval);
  pollScanNotifications(); // immediate first load
  scanPollInterval = setInterval(pollScanNotifications, 5000);
}

async function pollScanNotifications() {
  if (currentRole !== 'admin') return;
  try {
    const res = await fetch(`${API}/scan-notifications`);
    const notifications = await res.json();

    if (notifications.length > 0) {
      const newest = notifications[0].scanned_at;
      if (lastScanTimestamp === null) {
        lastScanTimestamp = newest;
      } else if (newest > lastScanTimestamp) {
        const newOnes = notifications.filter(n => n.scanned_at > lastScanTimestamp);
        lastScanTimestamp = newest;
        newOnes.forEach(n => {
          showScanToast(n.client_name, n.schedule_title, n.scanned_at.slice(11, 16));
        });
      }
    }
    renderScanNotifications(notifications);
  } catch { /* silent */ }
}

let lastScanRenderSig = null;

function renderScanNotifications(scans) {
  const notifEl = document.getElementById('schedule-notifications');
  if (!notifEl) return;

  const top = scans.slice(0, 8);

  // Skip the DOM update when nothing changed, so the panel doesn't flicker on every poll.
  const sig = top.map(n => `${n.id}|${n.scanned_at}|${n.schedule_title || ''}`).join(',');
  if (sig === lastScanRenderSig) return;
  lastScanRenderSig = sig;

  const scanHtml = top.map(n => {
    const time = n.scanned_at.slice(11, 16);
    const schedule = n.schedule_title ? ` · ${n.schedule_title}` : '';
    return `<div class="stats-item scan-notif-item">
      <span class="stats-item-name" style="font-size:0.82rem">
        <span class="scan-badge">QR</span> ${n.client_name} ingresó${schedule}
      </span>
      <span class="stats-item-value" style="font-size:0.7rem">${time}</span>
    </div>`;
  }).join('');

  notifEl.innerHTML = scanHtml || '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:1rem">Sin entradas hoy</p>';
}

function showScanToast(clientName, scheduleTitle, scanTime) {
  const toast = document.createElement('div');
  toast.className = 'scan-toast';
  toast.innerHTML = `
    <div class="scan-toast-icon">📱</div>
    <div class="scan-toast-body">
      <strong>${clientName}</strong>
      <span>${scheduleTitle ? scheduleTitle + ' · ' : ''}${scanTime}</span>
    </div>
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('visible'));
  });
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

/* ─── Client View Navigation ─────────────────────────── */
function switchClientView(viewName, btn) {
  // Stop any active scanner when switching away
  if (viewName !== 'escanear') stopClientScanner();

  // Hide all client views
  document.querySelectorAll('.client-view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById('client-view-' + viewName);
  if (target) target.classList.remove('hidden');

  if (viewName === 'escanear') startClientScanner();
  if (viewName === 'posts') loadInstagramPosts(0);

  // Update all nav buttons (both desktop and mobile)
  document.querySelectorAll('.client-nav-btn, #client-nav .nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
    // Sync the other nav
    document.querySelectorAll('.client-nav-btn, #client-nav .nav-btn').forEach(b => {
      if (b !== btn && b.getAttribute('onclick')?.includes(viewName)) b.classList.add('active');
    });
  } else {
    document.querySelectorAll('.client-nav-btn, #client-nav .nav-btn').forEach(b => {
      if (b.getAttribute('onclick')?.includes(viewName)) b.classList.add('active');
    });
  }

  // Re-render calendar when switching to asistencia
  if (viewName === 'asistencia' && clientAttCalendar) {
    setTimeout(() => clientAttCalendar.updateSize(), 100);
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════════════════════════════════════════════════
   CLIENT QR SCANNER – Scan gym QR from logged-in account
   ══════════════════════════════════════════════════════════ */

function startClientScanner() {
  if (clientScannerRunning) return;
  const readerEl = document.getElementById('client-qr-reader');
  if (!readerEl) return;

  readerEl.innerHTML = '';
  document.getElementById('client-scan-result').style.display = 'none';
  document.getElementById('client-scan-error').style.display = 'none';
  document.getElementById('client-scan-restart').style.display = 'none';

  if (typeof Html5Qrcode === 'undefined') {
    showClientScanError('No se pudo cargar el escáner. Recarga la página.');
    return;
  }

  clientHtml5QrScanner = new Html5Qrcode('client-qr-reader');
  Html5Qrcode.getCameras().then(cameras => {
    if (!cameras || cameras.length === 0) {
      showClientScanError('No se encontró ninguna cámara en este dispositivo.');
      return;
    }
    const cameraId = cameras.find(c => /back|rear|environment/i.test(c.label))?.id || cameras[cameras.length - 1].id;
    clientHtml5QrScanner.start(
      cameraId,
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decodedText) => {
        if (clientScannerRunning) {
          clientScannerRunning = false;
          clientHtml5QrScanner.stop().then(() => processClientScan(decodedText)).catch(console.error);
        }
      },
      () => {}
    ).then(() => {
      clientScannerRunning = true;
    }).catch(err => {
      showClientScanError('No se pudo acceder a la cámara. Verifica los permisos.');
      console.error('Client scanner start error:', err);
    });
  }).catch(err => {
    showClientScanError('Error accediendo a cámaras: ' + err);
  });
}

function stopClientScanner() {
  clientScannerRunning = false;
  if (clientHtml5QrScanner) {
    try { clientHtml5QrScanner.stop().catch(() => {}); } catch {}
    clientHtml5QrScanner = null;
  }
  const reader = document.getElementById('client-qr-reader');
  if (reader) reader.innerHTML = '';
}

function showClientScanError(msg) {
  const el = document.getElementById('client-scan-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  document.getElementById('client-scan-restart').style.display = '';
}

async function processClientScan(token) {
  const cleanToken = (token || '').trim();
  if (cleanToken !== GYM_CHECKIN_TOKEN) {
    showClientScanError('QR no válido. Asegúrate de escanear el QR de la academia.');
    return;
  }
  if (!clientProfileData || !clientProfileData.id) {
    showClientScanError('No se pudo identificar tu perfil. Recarga la página.');
    return;
  }

  try {
    const res = await fetch(`${API}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientProfileData.id }),
    });
    const data = await res.json();
    const resultEl = document.getElementById('client-scan-result');

    if (res.ok) {
      resultEl.innerHTML = `
        <div class="qr-success-card">
          <div class="qr-success-check">✓</div>
          <h3>¡Bienvenido ${data.client_name}!</h3>
          <span class="badge badge-plan" style="margin:0.25rem auto">${data.plan}</span>
          ${data.schedule ? `<p class="qr-success-schedule"><strong>${data.schedule.title}</strong> · ${data.schedule.start_time}</p>` : ''}
          <p class="qr-success-time">${data.attendance_created ? 'Ingreso registrado' : 'Ya registrado hoy'} · ${data.scan_time}</p>
        </div>
      `;
      resultEl.style.display = 'block';
      document.getElementById('client-scan-restart').style.display = '';
    } else {
      showClientScanError(data.detail || 'Error al registrar ingreso');
    }
  } catch {
    showClientScanError('Error de conexión con el servidor');
  }
}

/* ══════════════════════════════════════════════════════════
   INSTAGRAM POSTS FEED
   ══════════════════════════════════════════════════════════ */

async function loadInstagramPosts(skip, containerId = 'instagram-feed') {
  const feed = document.getElementById(containerId);
  const moreBtn = document.getElementById('load-more-container');
  if (moreBtn) moreBtn.style.display = 'none';

  try {
    const res = await fetch('/api/instagram-feed');
    if (!res.ok) throw new Error('feed ' + res.status);
    const data = await res.json();

    if (!data.posts || data.posts.length === 0) {
      feed.innerHTML = '<p class="empty-msg">Sin publicaciones aún</p>';
      return;
    }

    renderInstagramFeed(data.posts, containerId);
  } catch (err) {
    feed.innerHTML = '<p class="error-msg">Error al cargar publicaciones de Instagram</p>';
  }
}

function renderInstagramFeed(posts, containerId = 'instagram-feed') {
  const feed = document.getElementById(containerId);
  feed.innerHTML = posts.map(post => {
    const imgSrc = `/api/instagram-image?url=${encodeURIComponent(post.thumbnail_url || post.image_url)}`;
    const caption = (post.caption || '').substring(0, 100) + ((post.caption || '').length > 100 ? '...' : '');
    const icon = post.is_video ? 'play' : (post.is_carousel ? 'copy' : 'instagram');

    return `
      <div class="instagram-post" onclick="openInstagramPost('${post.shortcode}')">
        <img class="instagram-post-media" src="${imgSrc}" alt="Post" loading="lazy">
        <div class="instagram-post-overlay">
          <div class="instagram-post-icon"><i data-lucide="${icon}"></i></div>
        </div>
        <div class="instagram-post-caption">${caption}</div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function openInstagramPost(shortcode) {
  const webUrl = `https://www.instagram.com/p/${shortcode}/`;
  if (/mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent)) {
    window.location.href = `instagram://media?shortcode=${shortcode}`;
    setTimeout(() => { window.location.href = webUrl; }, 800);
  } else {
    window.open(webUrl, '_blank');
  }
}

function openInstagramLink(_) {
  openInstagramPost('');
}

function loadMorePosts() {
  loadInstagramPosts(0);
}

function showPushNotificationForInstagram() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.ready.then(reg => {
      if (reg.active) {
        reg.active.postMessage({ action: 'notify', title: 'Muevete', message: 'Abriendo Instagram...' });
      }
    });
  }
}

/* ══════════════════════════════════════════════════════════
   ADMIN INSTAGRAM MANAGEMENT
   ══════════════════════════════════════════════════════════ */

function openInstagramModal() {
  document.getElementById('instagram-modal').style.display = 'flex';
  document.getElementById('instagram-form').reset();
}

function closeInstagramModal() {
  document.getElementById('instagram-modal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('instagram-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const image = document.getElementById('instagram-image').value;
      const video = document.getElementById('instagram-video').value;
      const caption = document.getElementById('instagram-caption').value;

      try {
        const res = await fetch('/api/instagram-posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: image,
            video_url: video || null,
            caption: caption,
          }),
        });

        if (res.ok) {
          closeInstagramModal();
          loadAdminInstagramPosts();
          showNotification('Publicación creada exitosamente', 'success');
        } else {
          showNotification('Error al crear la publicación', 'error');
        }
      } catch (err) {
        showNotification('Error de conexión', 'error');
      }
    });
  }
});

async function loadAdminInstagramPosts() {
  const container = document.getElementById('admin-instagram-list');
  if (!container) return;

  try {
    const res = await fetch('/api/instagram-posts?limit=50');
    const data = await res.json();

    if (data.posts.length === 0) {
      container.innerHTML = '<p class="empty-msg">Sin publicaciones aún</p>';
      return;
    }

    container.innerHTML = data.posts.map(post => {
      const mediaUrl = post.video_url || post.image_url;
      const mediaType = post.video_url ? 'video' : 'image';
      const date = new Date(post.posted_at).toLocaleDateString('es-ES');

      return `
        <div class="card" style="padding:1rem; text-align:center; position:relative">
          ${mediaType === 'video' ? `<video src="${mediaUrl}" style="width:100%; height:150px; object-fit:cover; border-radius:8px;" muted></video>` : `<img src="${mediaUrl}" style="width:100%; height:150px; object-fit:cover; border-radius:8px;" alt="Post">`}
          <p style="font-size:0.85rem; color:var(--text-muted); margin:0.5rem 0 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${post.caption.substring(0, 30)}</p>
          <small style="color:var(--text-muted); display:block; margin-top:0.3rem">${date}</small>
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteInstagramPost(${post.id})" style="margin-top:0.5rem; width:100%">Eliminar</button>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<p class="error-msg">Error al cargar publicaciones</p>';
  }
}

async function deleteInstagramPost(postId) {
  if (!confirm('¿Eliminar esta publicación?')) return;

  try {
    const res = await fetch(`/api/instagram-posts/${postId}`, { method: 'DELETE' });
    if (res.ok) {
      loadAdminInstagramPosts();
      showNotification('Publicación eliminada', 'success');
    } else {
      showNotification('Error al eliminar', 'error');
    }
  } catch (err) {
    showNotification('Error de conexión', 'error');
  }
}
