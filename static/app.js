// CaféPulse Vanilla Frontend Logic

document.addEventListener('DOMContentLoaded', () => {
  const isDashboard = window.location.pathname.includes('/dashboard');

  if (!isDashboard) {
    initCustomerPage();
  } else {
    initDashboardPage();
  }
});

// Customer Page
function initCustomerPage() {
  const form = document.getElementById('vibe-form');
  const vibeInput = document.getElementById('vibe-text');
  const nameInput = document.getElementById('display-name');
  const submitBtn = document.getElementById('submit-btn');
  const recCard = document.getElementById('rec-card');
  const recDrink = document.getElementById('rec-drink');
  const recReason = document.getElementById('rec-reason');
  const recMood = document.getElementById('rec-mood-badge');
  const quickBtns = document.querySelectorAll('.quick-btn');

  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      vibeInput.value = btn.getAttribute('data-vibe');
      vibeInput.focus();
    });
  });

  loadRecentCheckins();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vibe = vibeInput.value.trim();
    const name = nameInput.value.trim();

    if (!vibe) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳ Brewing your recommendation...</span>';

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vibe_text: vibe, display_name: name })
      });

      const data = await res.json();
      if (res.ok) {
        recDrink.textContent = data.recommendation.drink_recommendation;
        recReason.textContent = `"${data.recommendation.reason}"`;
        recMood.textContent = data.recommendation.mood_tag;
        recCard.classList.remove('hidden');

        const matchCard = document.getElementById('vibe-match-card');
        const matchText = document.getElementById('match-text');
        const matchBadge = document.getElementById('match-badge');

        if (matchCard && data.vibe_match && data.vibe_match.matched_name) {
          const m = data.vibe_match;
          matchText.innerHTML = `<strong>${escapeHtml(m.matched_name)}</strong> is also here — ${escapeHtml(m.conversation_starter)}`;
          if (matchBadge) matchBadge.textContent = m.matched_vibe || '';
          matchCard.classList.remove('hidden');
        } else if (matchCard) {
          matchCard.classList.add('hidden');
        }

        if (data.recent) {
          renderRecentList(data.recent);
        }
      } else {
        alert(data.error || 'Failed to submit vibe.');
      }
    } catch (err) {
      alert('Network error. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>✨ Tune My Vibe & Drink</span>';
    }
  });
}

async function loadRecentCheckins() {
  try {
    const res = await fetch('/api/recent-checkins');
    if (res.ok) {
      const data = await res.json();
      renderRecentList(data.checkins || []);
    }
  } catch (e) {
    console.error('Failed to load recent checkins:', e);
  }
}

function renderRecentList(list) {
  const container = document.getElementById('recent-list');
  const countBadge = document.getElementById('patron-count');
  if (countBadge) countBadge.textContent = `${list.length} active`;

  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<p class="empty-state">No patrons in the last 30 minutes yet. Be the first!</p>';
    return;
  }

  container.innerHTML = list.map(item => `
    <div class="checkin-item">
      <div class="checkin-top">
        <strong>${escapeHtml(item.display_name || 'Anonymous')}</strong>
        <span class="mood-tag tag-${item.mood_tag}">${item.mood_tag}</span>
      </div>
      <p class="checkin-vibe">"${escapeHtml(item.vibe_text)}"</p>
      <div class="checkin-drink">☕ Sipping: ${escapeHtml(item.drink_rec)}</div>
    </div>
  `).join('');
}

// Dashboard Page
function initDashboardPage() {
  let countdown = 30;
  const countdownEl = document.getElementById('countdown-text');
  const refreshBtn = document.getElementById('refresh-btn');
  const regenInsightBtn = document.getElementById('regen-insight-btn');

  loadDashboardStats();

  // Auto-refresh countdown every second
  setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = `Refreshing in ${countdown}s`;
    if (countdown <= 0) {
      countdown = 30;
      loadDashboardStats();
    }
  }, 1000);

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      countdown = 30;
      loadDashboardStats();
    });
  }

  if (regenInsightBtn) {
    regenInsightBtn.addEventListener('click', async () => {
      regenInsightBtn.disabled = true;
      regenInsightBtn.textContent = 'Updating...';
      try {
        const res = await fetch('/api/room-insight', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          document.getElementById('room-insight-text').textContent = `"${data.room_insight}"`;
        }
      } catch (err) {
        console.error(err);
      } finally {
        regenInsightBtn.disabled = false;
        regenInsightBtn.textContent = '↻ Update Insight';
      }
    });
  }
}

async function loadDashboardStats() {
  try {
    const res = await fetch('/api/dashboard-stats');
    if (res.ok) {
      const data = await res.json();
      
      // Update counts
      const counts = data.counts || { focus: 0, social: 0, relaxed: 0, energized: 0 };
      const total = data.total || 0;

      document.getElementById('count-focus').textContent = counts.focus || 0;
      document.getElementById('count-social').textContent = counts.social || 0;
      document.getElementById('count-relaxed').textContent = counts.relaxed || 0;
      document.getElementById('count-energized').textContent = counts.energized || 0;
      document.getElementById('total-patrons-gauge').textContent = `Total: ${total}`;

      // Update gauge segments
      const safeTotal = total > 0 ? total : 1;
      document.getElementById('bar-focus').style.width = `${((counts.focus || 0) / safeTotal) * 100}%`;
      document.getElementById('bar-social').style.width = `${((counts.social || 0) / safeTotal) * 100}%`;
      document.getElementById('bar-relaxed').style.width = `${((counts.relaxed || 0) / safeTotal) * 100}%`;
      document.getElementById('bar-energized').style.width = `${((counts.energized || 0) / safeTotal) * 100}%`;

      // Update insight
      if (data.room_insight) {
        document.getElementById('room-insight-text').textContent = `"${data.room_insight}"`;
      }

      // Update recent table
      renderDashboardTable(data.recent || []);
    }
  } catch (err) {
    console.error('Failed to load dashboard stats:', err);
  }
}

function renderDashboardTable(list) {
  const tbody = document.getElementById('table-body');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No check-ins yet.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${formatTime(item.timestamp)}</td>
      <td><strong>${escapeHtml(item.display_name || 'Anonymous')}</strong></td>
      <td><span class="mood-badge">${item.mood_tag}</span></td>
      <td>"${escapeHtml(item.vibe_text)}"</td>
      <td>${escapeHtml(item.drink_rec)}</td>
    </tr>
  `).join('');
}

function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
