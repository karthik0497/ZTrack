// Global states and chart instances
let hrTimelineChart = null;
let stepsDailyChart = null;
let dashboardData = null;

// API Base URL (dynamic origin for easier deployment)
const API_BASE_URL = window.location.origin;

document.addEventListener('DOMContentLoaded', () => {
  // Initialize UI navigation
  initNavigation();

  // Initialize time range selector listener
  const rangeSelector = document.getElementById('time-range-select');
  if (rangeSelector) {
    rangeSelector.addEventListener('change', () => {
      fetchDashboardData(rangeSelector.value);
    });
  }

  // Initialize Accordions
  initAccordions();

  // Initialize Login form submission logic
  initLogin();

  // Initialize Logout button event handling
  initLogout();

  // Initialize navigation drawer
  initDrawer();

  // Initial fetch (default to today)
  fetchDashboardData('today');
});

// Navigation handling
function initNavigation() {
  // Sidebar navigation is disabled; all metrics are displayed on a single unified page.
}

// Drawer toggle logic
function initDrawer() {
  const menuBtn = document.getElementById('menu-toggle-btn');
  const closeBtn = document.getElementById('drawer-close-btn');
  const drawer = document.getElementById('nav-drawer');
  const overlay = document.getElementById('drawer-overlay');

  if (!menuBtn || !drawer || !overlay) return;

  menuBtn.addEventListener('click', () => {
    drawer.classList.add('open');
    overlay.classList.add('open');
  });

  const closeDrawer = () => {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  };

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
}

// Fetch dashboard dataset
async function fetchDashboardData(period) {
  const appToken = localStorage.getItem('zepp_app_token');
  const userId = localStorage.getItem('zepp_user_id');

  if (!appToken || !userId) {
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('sync-text').textContent = "Sign In Required";
    return;
  }

  const syncText = document.getElementById('sync-text');
  syncText.textContent = "Syncing...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/health-summary?period=${period}`, {
      headers: {
        'X-App-Token': appToken,
        'X-User-Id': userId
      }
    });
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('zepp_app_token');
        localStorage.removeItem('zepp_user_id');
        document.getElementById('login-overlay').style.display = 'flex';
      }
      throw new Error(`API error: ${response.status}`);
    }
    dashboardData = await response.json();

    // Hide login modal if we fetch successfully
    document.getElementById('login-overlay').style.display = 'none';

    // Update dashboard widgets
    updateDashboardUI(period);

    syncText.textContent = "Synced Live";
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    syncText.textContent = "Offline / Sync Failed";
  }
}

// Update UI elements with fetched data
function updateDashboardUI(period) {
  if (!dashboardData) return;

  const days = (period === 'today') ? '1' : period;

  // 1. User Info
  const userIdVal = document.getElementById('user-id-val');
  if (userIdVal) {
    userIdVal.textContent = dashboardData.user_id || "N/A";
  }

  // Guard check: if we are on a details sub-page (and not overview dashboard), exit here
  if (!document.getElementById('stat-steps-val')) {
    return;
  }

  // Prepare daily data
  const daysList = dashboardData.days || [];
  const todayRecord = daysList[0] || {};

  // Update date subtitle
  const dateSubtitle = document.getElementById('date-subtitle');
  if (days === '1') {
    dateSubtitle.textContent = `Today: ${todayRecord.date || new Date().toISOString().split('T')[0]}`;
  } else {
    const oldestDate = daysList[daysList.length - 1]?.date || "N/A";
    const newestDate = daysList[0]?.date || "N/A";
    dateSubtitle.textContent = `Range: ${oldestDate} to ${newestDate} (${daysList.length} days)`;
  }

  // 2. Steps Card
  const totalSteps = daysList.reduce((sum, d) => sum + (d.steps || 0), 0);
  const totalDistMeters = daysList.reduce((sum, d) => sum + (d.distance_meters || 0), 0);
  const totalDistKm = (totalDistMeters / 1000).toFixed(2);

  const stepsVal = document.getElementById('stat-steps-val');
  const distVal = document.getElementById('stat-dist-val');
  const stepsProgress = document.getElementById('steps-progress-bar');

  if (days === '1') {
    stepsVal.textContent = todayRecord.steps?.toLocaleString() || "0";
    distVal.textContent = `${(todayRecord.distance_meters / 1000).toFixed(2)} km traveled`;
    const pct = Math.min((todayRecord.steps / 6000) * 100, 100);
    stepsProgress.style.width = `${pct}%`;
  } else {
    const avgSteps = Math.round(totalSteps / daysList.length);
    stepsVal.textContent = avgSteps.toLocaleString();
    distVal.textContent = `Total: ${totalSteps.toLocaleString()} steps | ${totalDistKm} km`;
    const pct = Math.min((avgSteps / 6000) * 100, 100);
    stepsProgress.style.width = `${pct}%`;
  }

  // 3. Heart Rate Card
  const hrVal = document.getElementById('stat-hr-val');
  const hrMinMax = document.getElementById('stat-hr-minmax');
  const hrBadge = document.querySelector('.hr-avg');

  if (days === '1') {
    const stats = todayRecord.hr_stats || {};
    if (stats.avg && stats.avg !== "N/A") {
      hrVal.innerHTML = `${stats.avg} <span class="unit">bpm</span>`;
      hrMinMax.textContent = `Min: ${stats.min} | Max: ${stats.max}`;
      hrBadge.textContent = "Resting RHR: " + (todayRecord.sleep?.resting_heart_rate || "N/A");
    } else {
      hrVal.textContent = "N/A";
      hrMinMax.textContent = "Min: N/A | Max: N/A";
      hrBadge.textContent = "No HR data today";
    }
  } else {
    // Aggregate over last X days
    let validMin = [];
    let validMax = [];
    let validAvg = [];
    daysList.forEach(d => {
      const s = d.hr_stats || {};
      if (s.min && s.min !== "N/A") validMin.push(s.min);
      if (s.max && s.max !== "N/A") validMax.push(s.max);
      if (s.avg && s.avg !== "N/A") validAvg.push(s.avg);
    });

    if (validAvg.length > 0) {
      const overallAvg = Math.round(validAvg.reduce((a, b) => a + b, 0) / validAvg.length);
      const overallMin = Math.min(...validMin);
      const overallMax = Math.max(...validMax);
      hrVal.innerHTML = `${overallAvg} <span class="unit">bpm</span>`;
      hrMinMax.textContent = `Min: ${overallMin} | Max: ${overallMax}`;
      hrBadge.textContent = `Avg over ${validAvg.length} days`;
    } else {
      hrVal.textContent = "N/A";
      hrMinMax.textContent = "Min: N/A | Max: N/A";
      hrBadge.textContent = "No HR data";
    }
  }

  // 4. Sleep Card
  const sleepVal = document.getElementById('stat-sleep-val');
  const sleepRhr = document.getElementById('stat-sleep-rhr');
  const sleepBadge = document.querySelector('.sleep-status');

  if (days === '1') {
    const sl = todayRecord.sleep || {};
    const totalMin = (sl.deep_sleep_minutes || 0) + (sl.light_sleep_minutes || 0) + (sl.rem_sleep_minutes || 0);

    if (totalMin > 0) {
      const hrs = Math.floor(totalMin / 60);
      const mins = totalMin % 60;
      sleepVal.textContent = `${hrs}h ${mins}m`;
      sleepRhr.textContent = `Resting HR: ${sl.resting_heart_rate || "N/A"} bpm`;
      sleepBadge.textContent = "Recorded";
    } else {
      sleepVal.textContent = "N/A";
      sleepRhr.textContent = "No sleep recorded";
      sleepBadge.textContent = "No Sleep Data";
    }
  } else {
    // Average sleep calculations
    let totalSleepMinsList = [];
    let avgRhr = 0, count = 0;

    daysList.forEach(d => {
      const sl = d.sleep || {};
      const t = (sl.deep_sleep_minutes || 0) + (sl.light_sleep_minutes || 0) + (sl.rem_sleep_minutes || 0);
      if (t > 0) {
        totalSleepMinsList.push(t);
        avgRhr += sl.resting_heart_rate || 0;
        count++;
      }
    });

    if (count > 0) {
      const overallAvgMins = Math.round(totalSleepMinsList.reduce((a, b) => a + b, 0) / count);
      const hrs = Math.floor(overallAvgMins / 60);
      const mins = overallAvgMins % 60;
      sleepVal.textContent = `${hrs}h ${mins}m`;
      sleepRhr.textContent = `Avg Resting HR: ${Math.round(avgRhr / count)} bpm`;
      sleepBadge.textContent = `Avg (${count} nights)`;
    } else {
      sleepVal.textContent = "N/A";
      sleepRhr.textContent = "No sleep recorded";
      sleepBadge.textContent = "No Sleep Data";
    }
  }

  // 5. Blood Oxygen (SpO2) Card
  const statSpo2Val = document.getElementById('stat-spo2-val');
  const statSpo2Badge = document.getElementById('stat-spo2-badge');

  let allSpo2 = [];
  daysList.forEach(d => {
    if (d.spo2_spot_checks) {
      allSpo2.push(...d.spo2_spot_checks);
    }
  });

  if (allSpo2.length > 0) {
    const sAvg = Math.round(allSpo2.reduce((a, b) => a + b, 0) / allSpo2.length);
    statSpo2Val.innerHTML = `${allSpo2[0]} <span class="unit">%</span>`;
    statSpo2Badge.textContent = `Avg: ${sAvg}%`;
  } else {
    statSpo2Val.textContent = "N/A";
    statSpo2Badge.textContent = "Avg: N/A";
  }

  // 6. Stress Card
  const statStressVal = document.getElementById('stat-stress-val');
  const statStressDesc = document.getElementById('stat-stress-desc');
  const statStressBadge = document.getElementById('stat-stress-badge');

  let allStressAvg = [];
  let allStressMax = [];
  daysList.forEach(d => {
    if (d.average_stress) allStressAvg.push(d.average_stress);
    if (d.max_stress) allStressMax.push(d.max_stress);
  });

  if (allStressAvg.length > 0) {
    const avgStress = Math.round(allStressAvg.reduce((a, b) => a + b, 0) / allStressAvg.length);
    const maxStress = Math.max(...allStressMax);
    statStressVal.textContent = avgStress;
    statStressDesc.textContent = `Max stress: ${maxStress}`;

    if (avgStress < 35) {
      statStressBadge.textContent = "Relaxed";
      statStressBadge.style.background = "rgba(0, 230, 118, 0.12)";
      statStressBadge.style.color = "#00e676";
    } else if (avgStress < 60) {
      statStressBadge.textContent = "Normal";
      statStressBadge.style.background = "rgba(2, 132, 199, 0.12)";
      statStressBadge.style.color = "var(--accent-cyan)";
    } else {
      statStressBadge.textContent = "High Stress";
      statStressBadge.style.background = "rgba(219, 39, 119, 0.12)";
      statStressBadge.style.color = "var(--accent-rose)";
    }
  } else {
    statStressVal.textContent = "N/A";
    statStressDesc.textContent = "Max stress: N/A";
    statStressBadge.textContent = "No data";
    statStressBadge.style.background = "rgba(0,0,0,0.05)";
    statStressBadge.style.color = "var(--text-secondary)";
  }

  // 7. VO2 Max Card
  const statVo2Val = document.getElementById('stat-vo2-val');
  const statVo2Badge = document.getElementById('stat-vo2-badge');

  const vo2Score = dashboardData.latest_vo2_max;
  if (vo2Score && vo2Score !== "N/A") {
    const numericScore = parseFloat(vo2Score);
    statVo2Val.textContent = numericScore.toFixed(1);

    if (numericScore >= 48) {
      statVo2Badge.textContent = "Excellent";
      statVo2Badge.style.background = "rgba(13, 148, 136, 0.12)";
      statVo2Badge.style.color = "var(--accent-green)";
    } else if (numericScore >= 39) {
      statVo2Badge.textContent = "Good";
      statVo2Badge.style.background = "rgba(2, 132, 199, 0.12)";
      statVo2Badge.style.color = "var(--accent-cyan)";
    } else if (numericScore >= 33) {
      statVo2Badge.textContent = "Fair";
      statVo2Badge.style.background = "rgba(234, 88, 12, 0.12)";
      statVo2Badge.style.color = "var(--accent-amber)";
    } else {
      statVo2Badge.textContent = "Poor";
      statVo2Badge.style.background = "rgba(219, 39, 119, 0.12)";
      statVo2Badge.style.color = "var(--accent-rose)";
    }
  } else {
    statVo2Val.textContent = "N/A";
    statVo2Badge.textContent = "Unknown";
    statVo2Badge.style.background = "rgba(0, 0, 0, 0.05)";
    statVo2Badge.style.color = "var(--text-secondary)";
  }

  // 6d. Calories Burned Card
  const statCaloriesVal = document.getElementById('stat-calories-val');
  const statCaloriesDesc = document.getElementById('stat-calories-desc');

  const totalCalories = daysList.reduce((sum, d) => sum + (d.calories_burned_kcal || 0), 0);
  if (days === '1') {
    statCaloriesVal.innerHTML = `${todayRecord.calories_burned_kcal || 0} <span class="unit">kcal</span>`;
    statCaloriesDesc.textContent = "Active energy burned today";
  } else {
    const avgCalories = Math.round(totalCalories / daysList.length);
    statCaloriesVal.innerHTML = `${avgCalories} <span class="unit">kcal</span>`;
    statCaloriesDesc.textContent = `Avg per day | Total: ${totalCalories.toLocaleString()} kcal`;
  }



  // 9. Render/Update Charts
  renderHeartRateChart(days, todayRecord, daysList);
  renderStepsChart(days, daysList);
}

// Render Heart Rate Timeline Chart
function renderHeartRateChart(days, todayRecord, daysList) {
  const ctx = document.getElementById('hrTimelineChart').getContext('2d');

  if (hrTimelineChart) {
    hrTimelineChart.destroy();
  }

  let labels = [];
  let datasets = [];

  if (days === '1') {
    // 1-Day View: Show minute-by-minute heart rate (grouped hourly to avoid clutter)
    const timeline = todayRecord.hr_timeline || [];

    // Group minutes into 15-minute averages
    const intervalMins = 15;
    const intervalsCount = 1440 / intervalMins;

    const values = new Array(intervalsCount).fill(null);
    const counts = new Array(intervalsCount).fill(0);

    timeline.forEach(t => {
      if (t.hr !== null) {
        const bucket = Math.floor(t.minute / intervalMins);
        if (bucket < intervalsCount) {
          values[bucket] = (values[bucket] || 0) + t.hr;
          counts[bucket]++;
        }
      }
    });

    const hrData = values.map((val, idx) => {
      return counts[idx] > 0 ? Math.round(val / counts[idx]) : null;
    });

    // Labels format: e.g. "02:00"
    for (let i = 0; i < intervalsCount; i++) {
      const totalMinutes = i * intervalMins;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      labels.push(timeStr);
    }

    datasets.push({
      label: 'Heart Rate (bpm)',
      data: hrData,
      borderColor: 'rgba(255, 8, 68, 1)',
      backgroundColor: 'rgba(255, 8, 68, 0.05)',
      fill: true,
      tension: 0.4,
      spanGaps: true,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4
    });
  } else {
    // Multi-Day View: Show Min, Max, and Avg Heart Rate trends per day
    const reversedDays = [...daysList].reverse();
    labels = reversedDays.map(d => d.date);

    const avgData = reversedDays.map(d => d.hr_stats?.avg === 'N/A' ? null : d.hr_stats?.avg);
    const maxData = reversedDays.map(d => d.hr_stats?.max === 'N/A' ? null : d.hr_stats?.max);
    const minData = reversedDays.map(d => d.hr_stats?.min === 'N/A' ? null : d.hr_stats?.min);

    datasets.push({
      label: 'Max HR',
      data: maxData,
      borderColor: 'rgba(255, 8, 68, 0.8)',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 5],
      tension: 0.3,
      spanGaps: true
    });
    datasets.push({
      label: 'Avg HR',
      data: avgData,
      borderColor: 'rgba(255, 8, 68, 1)',
      backgroundColor: 'rgba(255, 8, 68, 0.05)',
      fill: true,
      borderWidth: 3,
      tension: 0.3,
      spanGaps: true
    });
    datasets.push({
      label: 'Min HR',
      data: minData,
      borderColor: 'rgba(0, 242, 254, 0.8)',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 5],
      tension: 0.3,
      spanGaps: true
    });
  }

  hrTimelineChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#8e95a5', font: { family: 'Outfit', size: 12 } }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#8e95a5', font: { family: 'Outfit' }, maxTicksLimit: days === '1' ? 8 : 12 }
        },
        y: {
          min: 40,
          max: 200,
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#8e95a5', font: { family: 'Outfit' } }
        }
      }
    }
  });
}

// Render Daily Steps Bar Chart
function renderStepsChart(days, daysList) {
  const ctx = document.getElementById('stepsDailyChart').getContext('2d');

  if (stepsDailyChart) {
    stepsDailyChart.destroy();
  }

  const reversedDays = [...daysList].reverse();
  const labels = reversedDays.map(d => d.date.split('-').slice(1).join('/')); // Format: MM/DD
  const stepsData = reversedDays.map(d => d.steps || 0);

  stepsDailyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Steps Taken',
        data: stepsData,
        backgroundColor: 'rgba(0, 242, 254, 0.35)',
        borderColor: 'rgba(0, 242, 254, 1)',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#8e95a5', font: { family: 'Outfit' } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#8e95a5', font: { family: 'Outfit' } }
        }
      }
    }
  });
}

// Switch Metric Explanation Tabs
function switchExplainTab(tabId) {
  const tabs = document.querySelectorAll('.explain-tab-btn');
  const contents = document.querySelectorAll('.explain-tab-content');

  tabs.forEach(t => {
    t.classList.remove('active');
    if (t.outerHTML.includes(tabId)) {
      t.classList.add('active');
    }
  });

  contents.forEach(c => {
    c.classList.remove('active');
    if (c.id === tabId) {
      c.classList.add('active');
    }
  });
}

// Initialize accordion components in the detailed guide section
function initAccordions() {
  const headers = document.querySelectorAll('.accordion-header');
  headers.forEach(h => {
    h.addEventListener('click', () => {
      const item = h.parentElement;
      const isActive = item.classList.contains('active');

      // Close all accordions
      document.querySelectorAll('.accordion-item').forEach(i => i.classList.remove('active'));

      // Toggle current
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}

// Scroll to explain section and open specific tab
function showExplainer(metric) {
  // Activate explanation nav item
  const navItem = document.querySelector('.nav-item[data-target="pai-explain"]');
  if (navItem) navItem.click();
}

// Initialize Login overlay form submit handling
function initLogin() {
  const loginForm = document.getElementById('login-form');
  const loginOverlay = document.getElementById('login-overlay');
  const loginErrorMsg = document.getElementById('login-error-msg');
  const errorText = document.getElementById('error-text');
  const loginSubmitBtn = document.getElementById('login-submit-btn');

  if (!loginForm) return;

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    loginSubmitBtn.disabled = true;
    const btnTextSpan = loginSubmitBtn.querySelector('span');
    const originalText = btnTextSpan.textContent;
    btnTextSpan.textContent = 'Signing In...';
    loginErrorMsg.style.display = 'none';

    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Authentication failed');
      }

      const result = await response.json();
      localStorage.setItem('zepp_app_token', result.app_token);
      localStorage.setItem('zepp_user_id', result.user_id);

      // Hide login page, trigger refresh
      loginOverlay.style.display = 'none';
      fetchDashboardData(document.getElementById('time-range-select').value);
    } catch (error) {
      console.error("Login failed:", error);
      errorText.textContent = error.message;
      loginErrorMsg.style.display = 'flex';
    } finally {
      loginSubmitBtn.disabled = false;
      btnTextSpan.textContent = originalText;
    }
  });
}

// Initialize Logout handling
function initLogout() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Clear stored credentials immediately
      localStorage.removeItem('zepp_app_token');
      localStorage.removeItem('zepp_user_id');

      // Attempt to clear server-side session (fire-and-forget)
      try {
        await fetch(`${API_BASE_URL}/api/logout`, { method: 'POST' });
      } catch (error) {
        console.error("Logout request failed:", error);
      }

      // Redirect to clean URL (strip query params) to force login screen
      window.location.href = window.location.origin + window.location.pathname;
    });
  }
}
