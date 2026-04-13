const MARTINGALE_TABLES = {
    '100': [1, 1, 1, 3, 6, 12, 25, 50],
    '200': [1, 1, 2, 5, 11, 24, 50, 100],
    '300': [1, 2, 4, 8, 17, 36, 75, 150],
    '500': [2, 3, 6, 13, 28, 60, 125, 250],
    '1000': [3, 5, 12, 25, 55, 120, 250, 500],
    '1500': [5, 8, 18, 38, 83, 180, 375, 750],
    '2000': [6, 10, 24, 50, 110, 240, 500, 1000],
    '2500': [8, 13, 30, 63, 138, 300, 625, 1250],
    '3000': [9, 15, 36, 75, 165, 360, 750, 1500]
};

class RiskTracker {
    constructor() {
        this.reset();
        this.loadState();
    }

    reset() {
        this.balanceType = '1000';
        this.history = []; // Array of 'B' or 'S'
        this.betHistory = []; // Tracks if we bet: { predicted: 'B'|'S'|null, amount: number, won: boolean|null }
        this.currentLevel = 1;
        this.pnl = 0;
        this.sessionStartTime = Date.now();
        this.consecutiveLosses = 0;
        this.consecutiveWins = 0;
        this.recentLosses = 0; // for 2 consecutive losses rule
        this.stateHistory = []; // For undo
        this.saveState();
    }

    setBalance(val) {
        if (val !== this.balanceType && MARTINGALE_TABLES[val]) {
            this.balanceType = val;
            this.saveState();
        }
    }

    getCurrentBetAmount() {
        const table = MARTINGALE_TABLES[this.balanceType];
        // Ensure level is clamped between 1 and 8
        const lvl = Math.min(Math.max(1, this.currentLevel), 8);
        return table[lvl - 1];
    }

    getTable() {
        return MARTINGALE_TABLES[this.balanceType];
    }

    snapshot() {
        return {
            balanceType: this.balanceType,
            history: [...this.history],
            betHistory: [...this.betHistory],
            currentLevel: this.currentLevel,
            pnl: this.pnl,
            consecutiveLosses: this.consecutiveLosses,
            consecutiveWins: this.consecutiveWins,
            recentLosses: this.recentLosses
        };
    }

    restore(snap) {
        if (!snap) return;
        this.balanceType = snap.balanceType;
        this.history = [...snap.history];
        this.betHistory = [...snap.betHistory];
        this.currentLevel = snap.currentLevel;
        this.pnl = snap.pnl;
        this.consecutiveLosses = snap.consecutiveLosses;
        this.consecutiveWins = snap.consecutiveWins;
        this.recentLosses = snap.recentLosses;
        this.saveState();
    }

    undo() {
        if (this.stateHistory.length > 0) {
            const snap = this.stateHistory.pop();
            this.restore(snap);
            return true;
        }
        return false;
    }

    addResult(actualResult, predictedTarget = null) {
        this.stateHistory.push(this.snapshot());
        if (this.stateHistory.length > 20) this.stateHistory.shift();

        this.history.push(actualResult);
        if (this.history.length > 30) this.history.shift(); // Keep last 30

        let betRecord = { predicted: predictedTarget, amount: 0, won: null };

        if (predictedTarget === 'B' || predictedTarget === 'S') {
            const amt = this.getCurrentBetAmount();
            betRecord.amount = amt;
            if (actualResult === predictedTarget) {
                betRecord.won = true;
                this.pnl += (amt * 0.96); // Profit (approx 1.96x multiplier)
                this.currentLevel = 1;
                this.consecutiveWins++;
                this.consecutiveLosses = 0;
                this.recentLosses = 0;
            } else {
                betRecord.won = false;
                this.pnl -= amt; // Loss
                this.currentLevel++;
                this.consecutiveWins = 0;
                this.consecutiveLosses++;
                this.recentLosses = this.consecutiveLosses;
            }
        } else {
            // Cool down if waiting after losses
            if (this.recentLosses >= 2) {
                // Not betting means we are cooling down. We can decrease recentLosses count logically, 
                // but let's just let the AI handle wait rounds.
                // We shouldn't clear recentLosses immediately, but maybe gradually. 
            }
        }

        this.betHistory.push(betRecord);
        if (this.betHistory.length > 30) this.betHistory.shift();
        
        this.saveState();
    }

    getPatternAnalysis() {
        if (this.history.length < 5) {
            return { switchProb: 0, type: 'INSUFFICIENT', maxStreak: 0, confidence: 0 };
        }

        const recent = this.history.slice(-10); // Look at last 10
        let switches = 0;
        let maxStreak = 1;
        let currentStreak = 1;

        for (let i = 1; i < recent.length; i++) {
            if (recent[i] !== recent[i - 1]) {
                switches++;
                maxStreak = Math.max(maxStreak, currentStreak);
                currentStreak = 1;
            } else {
                currentStreak++;
            }
        }
        maxStreak = Math.max(maxStreak, currentStreak);

        const transitions = recent.length - 1;
        const switchProb = transitions > 0 ? (switches / transitions) * 100 : 0;

        let type = 'MIXED';
        let confidence = 50;

        if (switchProb > 65) {
            type = 'ALTERNATING';
            confidence = Math.min(95, switchProb);
        } else if (switchProb < 35) {
            type = 'STREAKY';
            confidence = Math.min(95, 100 - switchProb);
        }

        return {
            switchProb: Math.round(switchProb),
            type,
            maxStreak,
            confidence: Math.round(confidence)
        };
    }

    saveState() {
        const data = {
            balanceType: this.balanceType,
            pnl: this.pnl,
            currentLevel: this.currentLevel,
            history: this.history,
            sessionStartTime: this.sessionStartTime
        };
        localStorage.setItem('rng_pro_tracker_state', JSON.stringify(data));
    }

    loadState() {
        const saved = localStorage.getItem('rng_pro_tracker_state');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.balanceType = data.balanceType || '1000';
                this.pnl = data.pnl || 0;
                this.currentLevel = data.currentLevel || 1;
                this.history = data.history || [];
                this.sessionStartTime = data.sessionStartTime || Date.now();
            } catch(e) {
                console.error("Error loading state", e);
            }
        }
    }
}
window.tracker = new RiskTracker();
