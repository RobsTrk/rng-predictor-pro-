document.addEventListener('DOMContentLoaded', () => {
    const btnBacktest = document.getElementById('btn-backtest');
    const modalBacktest = document.getElementById('backtest-modal');
    const btnCloseBacktest = document.getElementById('btn-close-backtest');
    const exportDataJson = document.getElementById('export-data-json');
    const btnCopyData = document.getElementById('btn-copy-data');
    const backtestInput = document.getElementById('backtest-input');
    const btnRunBacktest = document.getElementById('btn-run-backtest');
    const backtestResults = document.getElementById('backtest-results');

    // Make sure elements exist before binding
    if (!btnBacktest || !modalBacktest) return;

    btnBacktest.addEventListener('click', () => {
        exportDataJson.value = window.tracker ? window.tracker.exportData() : '';
        modalBacktest.classList.add('open');
    });

    btnCloseBacktest.addEventListener('click', () => {
        modalBacktest.classList.remove('open');
        backtestResults.style.display = 'none';
        backtestInput.value = '';
    });

    btnCopyData.addEventListener('click', () => {
        exportDataJson.select();
        document.execCommand('copy');
        btnCopyData.textContent = "Copied!";
        setTimeout(() => btnCopyData.textContent = "Copy", 2000);
    });

    btnRunBacktest.addEventListener('click', () => {
        const raw = backtestInput.value.toUpperCase();
        // Extract strictly B or S from whatever garbage user pastes
        const sequence = [];
        for (let i = 0; i < raw.length; i++) {
            if (raw[i] === 'B' || raw[i] === 'S') sequence.push(raw[i]);
        }

        if (sequence.length < 5) {
            alert("Need at least 5 rounds (B or S) to backtest.");
            return;
        }

        btnRunBacktest.textContent = "Running...";
        setTimeout(() => {
            runBacktestSimulation(sequence);
            btnRunBacktest.textContent = "Run Strategy";
        }, 300); // Tiny delay for UX
    });

    function runBacktestSimulation(sequence) {
        // Create an isolated tracker
        const bt = new window.RiskTracker(); // Since RiskTracker is global
        bt.setBalance(window.tracker ? window.tracker.balanceType : '1000'); 

        let wins = 0;
        let losses = 0;
        let maxLvl = 1;

        for (let i = 0; i < sequence.length; i++) {
            const actual = sequence[i];
            
            // Run pure JS logic to determine prediction
            const p = bt.getPatternAnalysis();
            const lastResult = bt.history.length > 0 ? bt.history[bt.history.length - 1] : null;
            
            let prediction = null; 
            if (bt.history.length >= 5 && bt.consecutiveLosses < 2 && bt.currentLevel <= 3) {
                if (p.type === 'ALTERNATING') {
                    prediction = lastResult === 'B' ? 'S' : 'B';
                } else if (p.type === 'STREAKY') {
                    prediction = lastResult; // follow streak
                }
            }

            bt.addResult(actual, prediction);

            maxLvl = Math.max(maxLvl, bt.currentLevel);
            const r = bt.betHistory[bt.betHistory.length - 1];
            if (r.won === true) wins++;
            else if (r.won === false) losses++;
        }

        // Show Results
        document.getElementById('bt-rounds').textContent = sequence.length;
        
        const pnl = bt.pnl;
        const pnlEl = document.getElementById('bt-pnl');
        pnlEl.textContent = pnl >= 0 ? `+₹${pnl.toFixed(2)}` : `-₹${Math.abs(pnl).toFixed(2)}`;
        pnlEl.style.color = pnl > 0 ? "var(--accent-green)" : pnl < 0 ? "var(--accent-red)" : "inherit";
        
        document.getElementById('bt-wl').textContent = `${wins} / ${losses}`;
        
        const lvlEl = document.getElementById('bt-max-lvl');
        lvlEl.textContent = `L${maxLvl}`;
        lvlEl.style.color = maxLvl >= 4 ? "var(--accent-red)" : "inherit";

        backtestResults.style.display = 'block';
    }
});
