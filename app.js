document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const btnSettings = document.getElementById('btn-settings');
    const modalSettings = document.getElementById('settings-modal');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const inputApiKey = document.getElementById('api-key');

    const btnSmall = document.querySelector('.btn-small');
    const btnBig = document.querySelector('.btn-big');
    const historyChips = document.getElementById('history-chips');

    const predictionMain = document.getElementById('prediction-main');
    const confidenceCircle = document.getElementById('confidence-circle');
    const confidenceText = document.getElementById('confidence-text');
    const predictionReason = document.getElementById('prediction-reason');

    const phaseText = document.getElementById('phase-text');
    const lightRed = document.getElementById('light-red');
    const lightYellow = document.getElementById('light-yellow');
    const lightGreen = document.getElementById('light-green');

    const selectBalance = document.getElementById('balance-select');
    const sessionTimerStr = document.getElementById('session-timer');
    const pnlValue = document.getElementById('pnl-value');
    const pnlFill = document.getElementById('pnl-fill');
    const levelBars = document.getElementById('level-bars');
    const actionText = document.querySelector('.action-text');
    const actionBadge = document.querySelector('.action-badge');
    const actionBar = document.getElementById('action-bar');

    const statSwitch = document.getElementById('stat-switch');
    const statType = document.getElementById('stat-type');
    const statStreak = document.getElementById('stat-streak');
    const systemAlert = document.getElementById('system-alert');

    const btnReset = document.getElementById('btn-reset');
    const btnUndo = document.getElementById('btn-undo');

    // State Variables
    let currentPredictionRaw = 'WAIT'; 
    let currentPredictionTarget = null; // 'B', 'S' or null
    let timerInterval = null;
    let pnlChart = null;

    // --- Init ---
    initChart();
    initUI();

    // --- Events ---
    btnSettings.addEventListener('click', () => {
        inputApiKey.value = window.api.getApiKey() || '';
        modalSettings.classList.add('open');
    });

    btnCloseSettings.addEventListener('click', () => {
        modalSettings.classList.remove('open');
    });

    btnSaveSettings.addEventListener('click', () => {
        window.api.setApiKey(inputApiKey.value.trim());
        modalSettings.classList.remove('open');
        updateUI(); // May trigger new API prediction
    });

    selectBalance.addEventListener('change', (e) => {
        window.tracker.setBalance(e.target.value);
        renderMartingaleBars();
    });

    btnSmall.addEventListener('click', () => handleResult('S'));
    btnBig.addEventListener('click', () => handleResult('B'));

    btnReset.addEventListener('click', () => {
        if (confirm("Reset current session data?")) {
            window.tracker.reset();
            updateUI();
        }
    });

    btnUndo.addEventListener('click', () => {
        if (window.tracker.undo()) {
            updateUI();
        } else {
            alert("Nothing to undo.");
        }
    });

    // --- Core Logic ---
    async function handleResult(result) {
        // Record the physical step
        window.tracker.addResult(result, currentPredictionTarget);
        
        // Immediately set state to processing
        predictionMain.textContent = "WAIT";
        predictionMain.style.color = "var(--text-main)";
        predictionReason.textContent = "Analyzing latest data...";
        confidenceText.textContent = "0%";
        confidenceCircle.style.strokeDasharray = `0, 100`;

        updateUI(true); // render DOM synchronously without fresh prediction yet
        
        // Check Daily Limit (Phase 2 Paywall logic)
        if (!window.authManager || window.authManager.checkDailyLimit()) {
            // Await prediction
            const pred = await window.api.getPrediction(window.tracker);
            
            if (window.authManager && pred.prediction !== 'WAIT') {
                window.authManager.incrementPrediction();
            }

            currentPredictionTarget = null;
            if (pred.prediction === 'B' || pred.prediction === 'S') {
                currentPredictionTarget = pred.prediction;
            }

            renderPrediction(pred);
            renderActionLine(pred);
        } else {
            // Blocked by paywall
            predictionMain.textContent = "LIMIT";
            predictionMain.style.color = "var(--accent-red)";
            predictionReason.textContent = "Prediction limit reached. Upgrade required.";
            
            actionBar.className = 'action-bar stop';
            actionText.textContent = 'UPGRADE PLAN';
        }
    }

    function initChart() {
        const ctx = document.getElementById('pnl-chart').getContext('2d');
        pnlChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Start'],
                datasets: [{
                    label: 'Session PnL (₹)',
                    data: [0],
                    borderColor: '#00e5ff',
                    backgroundColor: 'rgba(0, 229, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { 
                        grid: { color: '#333' },
                        ticks: { color: '#888' }
                    }
                }
            }
        });
    }

    function initUI() {
        selectBalance.value = window.tracker.balanceType;
        renderMartingaleBars();
        startTimer();
        
        // On load, run fallback to get initial prompt
        const initPred = window.api.getPrediction(window.tracker).then(pred => {
            if (pred.prediction === 'B' || pred.prediction === 'S') {
                currentPredictionTarget = pred.prediction;
            }
            renderPrediction(pred);
            renderActionLine(pred);
        });

        updateUI();
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const ms = Date.now() - window.tracker.sessionStartTime;
            const totalSec = Math.floor(ms / 1000);
            const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
            const s = (totalSec % 60).toString().padStart(2, '0');
            sessionTimerStr.textContent = `${m}:${s}`;
        }, 1000);
    }

    function updateUI(skipPrediction = false) {
        const snap = window.tracker.snapshot();
        
        // History Chips
        historyChips.innerHTML = '';
        snap.history.forEach(res => {
            const div = document.createElement('div');
            div.className = `chip ${res}`;
            div.textContent = res;
            historyChips.appendChild(div);
        });
        historyChips.scrollLeft = historyChips.scrollWidth;

        // PnL
        const isPos = snap.pnl > 0;
        const isNeg = snap.pnl < 0;
        pnlValue.textContent = `₹${Math.abs(snap.pnl).toFixed(2)}`;
        if (isPos) {
            pnlValue.className = 'positive';
            pnlValue.textContent = `+₹${snap.pnl.toFixed(2)}`;
        } else if (isNeg) {
            pnlValue.className = 'negative';
            pnlValue.textContent = `-₹${Math.abs(snap.pnl).toFixed(2)}`;
        } else {
            pnlValue.className = 'neutral';
            pnlValue.textContent = `₹0.00`;
        }

        // PNL Bar Map: -500 to +500 roughly scales 0% to 100%. Center 50%
        let pnlScale = (snap.pnl + 500) / 1000;
        pnlScale = Math.max(0, Math.min(1, pnlScale)) * 100;
        pnlFill.style.width = `${pnlScale}%`;
        if (isPos) pnlFill.style.background = 'var(--accent-green)';
        else if (isNeg) pnlFill.style.background = 'var(--accent-red)';
        else pnlFill.style.background = 'var(--text-muted)';

        // Update Chart
        if (pnlChart) {
            pnlChart.data.labels = snap.pnlHistory.map((_, i) => i === 0 ? 'Start' : `R${i}`);
            pnlChart.data.datasets[0].data = snap.pnlHistory;
            
            const chartColor = isPos ? '#00ff66' : isNeg ? '#ff3366' : '#00e5ff';
            pnlChart.data.datasets[0].borderColor = chartColor;
            pnlChart.data.datasets[0].backgroundColor = chartColor + '22';
            pnlChart.update();
        }

        // Martingale Bar Highlights
        renderMartingaleBars();

        // Pattern Analytics
        const analytics = window.tracker.getPatternAnalysis();
        statSwitch.textContent = `${analytics.switchProb}%`;
        statType.textContent = analytics.type;
        statStreak.textContent = analytics.maxStreak;

        // Phase 4 Analytics
        const acc = snap.patternAccuracy || { altWins: 0, altTotal: 0, streakWins: 0, streakTotal: 0 };
        const altPct = acc.altTotal > 0 ? ((acc.altWins / acc.altTotal) * 100).toFixed(0) : '-';
        const strPct = acc.streakTotal > 0 ? ((acc.streakWins / acc.streakTotal) * 100).toFixed(0) : '-';
        const totWins = acc.altWins + acc.streakWins;
        const totTotal = acc.altTotal + acc.streakTotal;
        const totPct = totTotal > 0 ? ((totWins / totTotal) * 100).toFixed(0) : '-';

        document.getElementById('acc-alt').textContent = altPct === '-' ? '-' : altPct + '%';
        document.getElementById('acc-str').textContent = strPct === '-' ? '-' : strPct + '%';
        document.getElementById('acc-tot').textContent = totPct === '-' ? '-' : totPct + '%';

        // Phase 4 Stop Loss & Profit Limit Bars
        const STOP_LOSS = 30; // ₹30 limit
        const PROFIT_TARGET = 30;
        
        let slPct = Math.min(100, Math.max(0, snap.pnl < 0 ? (Math.abs(snap.pnl) / STOP_LOSS) * 100 : 0));
        let ptPct = Math.min(100, Math.max(0, snap.pnl > 0 ? (snap.pnl / PROFIT_TARGET) * 100 : 0));

        document.getElementById('sl-fill').style.width = slPct + '%';
        document.getElementById('sl-distance').textContent = slPct >= 100 ? 'HIT (-₹30)' : '₹' + (STOP_LOSS - Math.abs(snap.pnl < 0 ? snap.pnl : 0)).toFixed(0) + ' left';
        
        document.getElementById('pt-fill').style.width = ptPct + '%';
        document.getElementById('pt-distance').textContent = ptPct >= 100 ? 'HIT (+₹30)' : '₹' + (PROFIT_TARGET - (snap.pnl > 0 ? snap.pnl : 0)).toFixed(0) + ' to go';

        // Phase Traffic Light
        lightRed.classList.remove('active');
        lightYellow.classList.remove('active');
        lightGreen.classList.remove('active');

        if (snap.history.length < 5) {
            phaseText.textContent = "OBSERVING";
            lightYellow.classList.add('active');
        } else if (snap.currentLevel >= 4 || snap.recentLosses >= 2) {
            phaseText.textContent = "DANGER";
            lightRed.classList.add('active');
        } else {
            if (analytics.type === 'ALTERNATING' || analytics.type === 'STREAKY') {
                phaseText.textContent = "GOOD";
                lightGreen.classList.add('active');
            } else {
                phaseText.textContent = "NEUTRAL";
                lightYellow.classList.add('active');
            }
        }

        // System Alert text
        systemAlert.className = 'alert-box';
        if (snap.history.length < 5) {
            systemAlert.innerHTML = `<strong>SYSTEM:</strong> Please enter 5 rounds to initialize. (${snap.history.length}/5)`;
            systemAlert.classList.add('warn');
        } else if (snap.currentLevel >= 4) {
            systemAlert.innerHTML = `<strong>CRITICAL:</strong> Max risk level hit! STOP betting. Reset or wait.`;
            systemAlert.classList.add('danger');
        } else if (snap.recentLosses >= 2) {
            systemAlert.innerHTML = `<strong>WARNING:</strong> 2 consecutive losses. Wait 2 rounds to cool off.`;
            systemAlert.classList.add('danger');
        } else if (snap.consecutiveWins >= 5) {
            systemAlert.innerHTML = `<strong>PROFIT:</strong> 5 wins in a row! Consider taking profit.`;
            systemAlert.classList.add('safe');
        } else {
            systemAlert.innerHTML = `<strong>SAFE:</strong> Pattern healthy. Following system rules.`;
            systemAlert.classList.add('safe');
        }
    }

    function renderPrediction(pred) {
        if (!pred) return;
        
        let label = "WAIT";
        let color = "var(--text-main)";
        if (pred.prediction === 'B') {
            label = "BIG (5-9)";
            color = "var(--color-big)";
        } else if (pred.prediction === 'S') {
            label = "SMALL (0-4)";
            color = "var(--color-small)";
        }

        predictionMain.textContent = label;
        predictionMain.style.color = color;
        
        confidenceText.textContent = `${pred.confidence}%`;
        confidenceCircle.style.strokeDasharray = `${pred.confidence}, 100`;
        
        if (pred.confidence > 75) {
            confidenceCircle.style.stroke = "var(--accent-green)";
        } else if (pred.confidence > 45) {
            confidenceCircle.style.stroke = "var(--accent-yellow)";
        } else {
            confidenceCircle.style.stroke = "var(--accent-red)";
        }

        let sourceIcon = pred.source === 'api' ? '⚡ ' : '💻 ';
        predictionReason.innerHTML = `<strong>${sourceIcon}Reason:</strong> ${pred.reason}`;
    }

    function renderActionLine(pred) {
        const lvl = window.tracker.currentLevel;
        const amt = window.tracker.getCurrentBetAmount();

        actionBar.className = 'action-bar';
        
        if (lvl >= 4) {
            actionBar.classList.add('stop');
            actionText.textContent = 'STOP PLAYING';
            actionBadge.textContent = `L${lvl}`;
            return;
        }

        // Phase 4 Auto Stop-Loss and Profit Logic
        if (window.tracker.pnl <= -30) {
            actionBar.classList.add('stop');
            actionText.textContent = 'STOP-LOSS TRIGGERED!';
            actionBadge.textContent = `L${lvl}`;
            return;
        }

        if (window.tracker.pnl >= 30) {
            actionBar.classList.add('stop');
            actionBar.style.borderColor = 'var(--accent-green)';
            actionText.textContent = 'PROFIT ACHIEVED!';
            actionText.style.color = 'var(--accent-green)';
            actionBadge.textContent = `L${lvl}`;
            return;
        } else {
            actionBar.style.borderColor = ''; // reset potential modifications
            actionText.style.color = '';
        }

        if (pred.prediction === 'B' || pred.prediction === 'S') {
            actionBar.classList.add('bet');
            actionText.textContent = `BET ₹${amt} on ${pred.prediction === 'B' ? 'BIG' : 'SMALL'}`;
            actionBadge.textContent = `L${lvl}`;
        } else {
            actionBar.classList.add('wait');
            actionText.textContent = 'WAIT';
            actionBadge.textContent = `L${lvl}`;
        }
    }

    function renderMartingaleBars() {
        const table = window.tracker.getTable();
        const curLvl = window.tracker.currentLevel;
        levelBars.innerHTML = '';
        table.forEach((amt, idx) => {
            const levelNum = idx + 1;
            const div = document.createElement('div');
            div.className = `lvl-box`;
            if (levelNum === curLvl) {
                div.classList.add('active');
                if (curLvl >= 4) div.classList.add('danger');
            }
            div.innerHTML = `<div class="lvl-lbl">L${levelNum}</div><div class="lvl-amt">₹${amt}</div>`;
            levelBars.appendChild(div);
        });
    }

});
