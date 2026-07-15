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
  rangeSelector.addEventListener('change', () => {
    fetchDashboardData(rangeSelector.value);
  });
  
  // Initialize Accordions
  initAccordions();
  
  // Initialize Login form submission logic
  initLogin();
  
  // Initial fetch (default to 1 day)
  fetchDashboardData('1');
});

// Navigation handling
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const panels = document.querySelectorAll('.dashboard-panel');
  const panelTitle = document.getElementById('panel-title');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Deactivate all nav items
      navItems.forEach(nav => nav.classList.remove('active'));
      // Activate clicked
      item.classList.add('active');
      
      // Hide all panels
      panels.forEach(p => p.classList.remove('active'));
      
      // Show targeted panel
      const targetId = item.getAttribute('data-target');
      const targetPanel = document.getElementById(`${targetId}-section`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
      
      // Update panel header title
      panelTitle.textContent = item.querySelector('span').textContent;
      
      // If we switched to a tab that contains canvas, resize them
      if (hrTimelineChart) hrTimelineChart.resize();
      if (stepsDailyChart) stepsDailyChart.resize();
    });
  });
}

// Fetch dashboard dataset
async function fetchDashboardData(days) {
  const syncText = document.getElementById('sync-text');
  syncText.textContent = "Syncing...";
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/health-summary?days=${days}`);
    if (!response.ok) {
      if (response.status === 401) {
        document.getElementById('login-overlay').style.display = 'flex';
      }
      throw new Error(`API error: ${response.status}`);
    }
    dashboardData = await response.json();
    
    // Hide login modal if we fetch successfully
    document.getElementById('login-overlay').style.display = 'none';
    
    // Update dashboard widgets
    updateDashboardUI(days);
    
    syncText.textContent = "Synced Live";
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    syncText.textContent = "Offline / Sync Failed";
  }
}

// Update UI elements with fetched data
function updateDashboardUI(days) {
  if (!dashboardData) return;
  
  // 1. User Info
  document.getElementById('user-id-val').textContent = dashboardData.user_id || "N/A";
  
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
      const overallAvg = Math.round(validAvg.reduce((a,b) => a+b, 0) / validAvg.length);
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

  // 4. Sleep Card & Panel
  const sleepVal = document.getElementById('stat-sleep-val');
  const sleepRhr = document.getElementById('stat-sleep-rhr');
  const sleepBadge = document.querySelector('.sleep-status');
  
  const sleepEmpty = document.getElementById('sleep-empty-view');
  const sleepContent = document.getElementById('sleep-content-view');
  
  if (days === '1') {
    const sl = todayRecord.sleep || {};
    const totalMin = (sl.deep_sleep_minutes || 0) + (sl.light_sleep_minutes || 0) + (sl.rem_sleep_minutes || 0);
    
    if (totalMin > 0) {
      const hrs = Math.floor(totalMin / 60);
      const mins = totalMin % 60;
      sleepVal.textContent = `${hrs}h ${mins}m`;
      sleepRhr.textContent = `Resting HR: ${sl.resting_heart_rate || "N/A"} bpm`;
      sleepBadge.textContent = "Recorded";
      
      // Update sleep stage visualizer
      sleepEmpty.style.display = "none";
      sleepContent.style.display = "block";
      document.getElementById('sleep-total-hrs').textContent = `${hrs}h ${mins}m`;
      
      document.getElementById('sleep-deep-val').textContent = `${sl.deep_sleep_minutes}m`;
      document.getElementById('sleep-light-val').textContent = `${sl.light_sleep_minutes}m`;
      document.getElementById('sleep-rem-val').textContent = `${sl.rem_sleep_minutes}m`;
      document.getElementById('sleep-awake-val').textContent = `${sl.awake_minutes}m`;
      
      document.getElementById('sleep-deep-bar').style.width = `${(sl.deep_sleep_minutes / totalMin) * 100}%`;
      document.getElementById('sleep-light-bar').style.width = `${(sl.light_sleep_minutes / totalMin) * 100}%`;
      document.getElementById('sleep-rem-bar').style.width = `${(sl.rem_sleep_minutes / totalMin) * 100}%`;
      document.getElementById('sleep-awake-bar').style.width = `${(sl.awake_minutes / totalMin) * 100}%`;
    } else {
      sleepVal.textContent = "N/A";
      sleepRhr.textContent = "No sleep recorded";
      sleepBadge.textContent = "No Sleep Data";
      sleepEmpty.style.display = "flex";
      sleepContent.style.display = "none";
    }
  } else {
    // Average sleep calculations
    let totalSleepMinsList = [];
    let avgDeep = 0, avgLight = 0, avgRem = 0, avgAwake = 0, avgRhr = 0, count = 0;
    
    daysList.forEach(d => {
      const sl = d.sleep || {};
      const t = (sl.deep_sleep_minutes || 0) + (sl.light_sleep_minutes || 0) + (sl.rem_sleep_minutes || 0);
      if (t > 0) {
        totalSleepMinsList.push(t);
        avgDeep += sl.deep_sleep_minutes || 0;
        avgLight += sl.light_sleep_minutes || 0;
        avgRem += sl.rem_sleep_minutes || 0;
        avgAwake += sl.awake_minutes || 0;
        avgRhr += sl.resting_heart_rate || 0;
        count++;
      }
    });
    
    if (count > 0) {
      const overallAvgMins = Math.round(totalSleepMinsList.reduce((a,b)=>a+b, 0) / count);
      const hrs = Math.floor(overallAvgMins / 60);
      const mins = overallAvgMins % 60;
      sleepVal.textContent = `${hrs}h ${mins}m`;
      sleepRhr.textContent = `Avg Resting HR: ${Math.round(avgRhr / count)} bpm`;
      sleepBadge.textContent = `Avg (${count} nights)`;
      
      // Update sleep stages panel with averages
      sleepEmpty.style.display = "none";
      sleepContent.style.display = "block";
      document.getElementById('sleep-total-hrs').textContent = `${hrs}h ${mins}m`;
      
      const dVal = Math.round(avgDeep / count);
      const lVal = Math.round(avgLight / count);
      const rVal = Math.round(avgRem / count);
      const aVal = Math.round(avgAwake / count);
      
      document.getElementById('sleep-deep-val').textContent = `${dVal}m`;
      document.getElementById('sleep-light-val').textContent = `${lVal}m`;
      document.getElementById('sleep-rem-val').textContent = `${rVal}m`;
      document.getElementById('sleep-awake-val').textContent = `${aVal}m`;
      
      const totalAvg = dVal + lVal + rVal;
      document.getElementById('sleep-deep-bar').style.width = `${(dVal / totalAvg) * 100}%`;
      document.getElementById('sleep-light-bar').style.width = `${(lVal / totalAvg) * 100}%`;
      document.getElementById('sleep-rem-bar').style.width = `${(rVal / totalAvg) * 100}%`;
      document.getElementById('sleep-awake-bar').style.width = `${(aVal / totalAvg) * 100}%`;
    } else {
      sleepVal.textContent = "N/A";
      sleepRhr.textContent = "No sleep recorded";
      sleepBadge.textContent = "No Sleep Data";
      sleepEmpty.style.display = "flex";
      sleepContent.style.display = "none";
    }
  }

  // 5. PAI & Body Battery Card
  const paiVal = document.getElementById('stat-pai-val');
  const batteryVal = document.getElementById('stat-battery-val');
  
  if (days === '1') {
    paiVal.textContent = todayRecord.pai_score ? Math.round(todayRecord.pai_score) : "N/A";
    batteryVal.textContent = todayRecord.average_body_battery ? `Body Battery: ${todayRecord.average_body_battery}%` : "Body Battery: N/A";
  } else {
    // Get latest valid PAI
    const latestPai = daysList.find(d => d.pai_score !== undefined)?.pai_score;
    paiVal.textContent = latestPai ? Math.round(latestPai) : "N/A";
    
    // Average battery
    const validBatteries = daysList.filter(d => d.average_body_battery !== undefined).map(d => d.average_body_battery);
    if (validBatteries.length > 0) {
      const avgBattery = Math.round(validBatteries.reduce((a,b) => a+b, 0) / validBatteries.length);
      batteryVal.textContent = `Avg Body Battery: ${avgBattery}%`;
    } else {
      batteryVal.textContent = "Body Battery: N/A";
    }
  }

  // 6. Blood Oxygen (SpO2) Spot Checks
  const spo2Low = document.getElementById('spo2-low');
  const spo2Avg = document.getElementById('spo2-avg');
  const spo2List = document.getElementById('spo2-recent-list');
  spo2List.innerHTML = '';
  
  let allSpo2 = [];
  daysList.forEach(d => {
    if (d.spo2_spot_checks) {
      allSpo2.push(...d.spo2_spot_checks);
    }
  });
  
  if (allSpo2.length > 0) {
    spo2Low.textContent = Math.min(...allSpo2) + "%";
    spo2Avg.textContent = Math.round(allSpo2.reduce((a,b)=>a+b, 0) / allSpo2.length) + "%";
    
    allSpo2.slice(0, 12).forEach(val => {
      const pill = document.createElement('div');
      pill.className = 'spo2-pill';
      pill.textContent = `${val}%`;
      spo2List.appendChild(pill);
    });
  } else {
    spo2Low.textContent = "N/A";
    spo2Avg.textContent = "N/A";
    spo2List.innerHTML = '<span style="font-size:13px; color:var(--text-secondary);">No SpO2 readings recorded in this period.</span>';
  }

  // 7. VO2 Max Panel
  const vo2Val = document.getElementById('vo2-value-display');
  const vo2Status = document.getElementById('vo2-status-display');
  
  const score = dashboardData.latest_vo2_max;
  if (score && score !== "N/A") {
    const numericScore = parseFloat(score);
    vo2Val.textContent = numericScore.toFixed(1);
    
    // Classify VO2 Max
    if (numericScore >= 48) {
      vo2Status.textContent = "Fitness Level: Excellent 🏃‍♂️";
      vo2Status.style.borderColor = "var(--accent-cyan)";
      vo2Status.style.color = "var(--accent-cyan)";
    } else if (numericScore >= 39) {
      vo2Status.textContent = "Fitness Level: Good 👍";
      vo2Status.style.borderColor = "var(--accent-green)";
      vo2Status.style.color = "var(--accent-green)";
    } else if (numericScore >= 33) {
      vo2Status.textContent = "Fitness Level: Fair ⚖️";
      vo2Status.style.borderColor = "var(--accent-amber)";
      vo2Status.style.color = "var(--accent-amber)";
    } else {
      vo2Status.textContent = "Fitness Level: Poor 🛌";
      vo2Status.style.borderColor = "var(--accent-rose)";
      vo2Status.style.color = "var(--accent-rose)";
    }
  } else {
    vo2Val.textContent = "N/A";
    vo2Status.textContent = "Fitness Level: Unknown";
    vo2Status.style.borderColor = "var(--card-border)";
    vo2Status.style.color = "var(--text-secondary)";
  }

  // 8. Workouts Table
  const tableBody = document.querySelector('#workout-table-body tbody');
  const workoutEmpty = document.getElementById('workouts-empty-view');
  tableBody.innerHTML = '';
  
  const workouts = dashboardData.workouts || [];
  if (workouts.length > 0) {
    workoutEmpty.style.display = "none";
    workouts.forEach(w => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${w.date}</strong></td>
        <td>${w.distance_km} km</td>
        <td>${w.duration_minutes} mins</td>
        <td>${w.avg_heart_rate} bpm</td>
        <td>${w.calories_burned} kcal</td>
        <td>${w.min_altitude}m - ${w.max_altitude}m</td>
      `;
      tableBody.appendChild(row);
    });
  } else {
    workoutEmpty.style.display = "block";
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

  // Logout button handling
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to sign out of your Zepp account?')) {
        try {
          await fetch(`${API_BASE_URL}/api/logout`, { method: 'POST' });
        } catch (error) {
          console.error("Logout request failed:", error);
        }
        window.location.reload();
      }
    });
  }
}
