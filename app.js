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

    // --- Init ---
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

        // Martingale Bar Highlights
        renderMartingaleBars();

        // Pattern Analytics
        const analytics = window.tracker.getPatternAnalysis();
        statSwitch.textContent = `${analytics.switchProb}%`;
        statType.textContent = analytics.type;
        statStreak.textContent = analytics.maxStreak;

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
