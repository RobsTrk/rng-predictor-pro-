class AuthManager {
    constructor() {
        this.user = null;
        this.userPlan = 'FREE'; // FREE, PRO, PREMIUM
        this.dailyPredictions = 0;
        this.lastPredictionDate = new Date().toISOString().split('T')[0];
        this.isMock = !window.fbAuth;

        this.initDOM();
        this.bindEvents();

        if (this.isMock) {
            this.loadMockState();
        } else {
            window.fbAuth.onAuthStateChanged(user => {
                if (user) {
                    this.user = user;
                    this.loadProfileFromFirestore();
                } else {
                    this.user = null;
                    this.userPlan = 'FREE';
                    this.updateUI();
                }
            });
        }
    }

    initDOM() {
        this.btnAuth = document.getElementById('btn-auth');
        this.userInfoText = document.getElementById('user-info-text');
        
        this.authModal = document.getElementById('auth-modal');
        this.authTitle = document.getElementById('auth-title');
        this.authEmail = document.getElementById('auth-email');
        this.authPassword = document.getElementById('auth-password');
        this.authError = document.getElementById('auth-error');
        this.btnSubmitAuth = document.getElementById('btn-submit-auth');
        this.btnCloseAuth = document.getElementById('btn-close-auth');
        this.authToggleLink = document.getElementById('auth-toggle-link');
        this.authPrefixText = document.getElementById('auth-toggle-text').childNodes[0];

        this.paywallModal = document.getElementById('paywall-modal');
        this.btnBuyPro = document.getElementById('btn-buy-pro');
        this.btnBuyPremium = document.getElementById('btn-buy-premium');
        this.btnClosePaywall = document.getElementById('btn-close-paywall');

        this.isLoginMode = true;
    }

    bindEvents() {
        this.btnAuth.addEventListener('click', () => {
            if (this.user) {
                if (confirm(`Logged in as ${this.user.email}\nPlan: ${this.userPlan}\n\nDo you want to log out?`)) {
                    this.logout();
                }
            } else {
                this.authModal.classList.add('open');
            }
        });

        this.btnCloseAuth.addEventListener('click', () => {
            this.authModal.classList.remove('open');
            this.authError.style.display = 'none';
        });

        this.authToggleLink.addEventListener('click', () => {
            this.isLoginMode = !this.isLoginMode;
            this.authTitle.textContent = this.isLoginMode ? 'Sign In' : 'Sign Up';
            this.btnSubmitAuth.textContent = this.isLoginMode ? 'Login' : 'Register';
            this.authPrefixText.textContent = this.isLoginMode ? "Don't have an account? " : "Already have an account? ";
            this.authToggleLink.textContent = this.isLoginMode ? "Sign Up" : "Sign In";
            this.authError.style.display = 'none';
        });

        this.btnSubmitAuth.addEventListener('click', () => {
            const email = this.authEmail.value.trim();
            const pass = this.authPassword.value.trim();
            if (!email || !pass) {
                this.showError("Email and password required.");
                return;
            }
            if (this.isLoginMode) {
                this.login(email, pass);
            } else {
                this.signup(email, pass);
            }
        });

        this.btnClosePaywall.addEventListener('click', () => {
            this.paywallModal.classList.remove('open');
        });

        this.btnBuyPro.addEventListener('click', () => this.handlePurchase('PRO'));
        this.btnBuyPremium.addEventListener('click', () => this.handlePurchase('PREMIUM'));
    }

    showError(msg) {
        this.authError.textContent = msg;
        this.authError.style.display = 'block';
    }

    async login(email, password) {
        try {
            if (this.isMock) {
                const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
                if (users[email] && users[email].password === password) {
                    this.user = { email, uid: email };
                    this.loadProfile(users[email].profile);
                    this.saveMockState();
                    this.authModal.classList.remove('open');
                } else {
                    this.showError("Invalid mock credentials.");
                }
            } else {
                await window.fbAuth.signInWithEmailAndPassword(email, password);
                this.authModal.classList.remove('open');
            }
        } catch (e) {
            this.showError(e.message);
        }
    }

    async signup(email, password) {
        try {
            if (this.isMock) {
                const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
                if (users[email]) {
                    this.showError("Mock user already exists.");
                    return;
                }
                const newProfile = { plan: 'FREE', dailyCount: 0, date: new Date().toISOString().split('T')[0] };
                users[email] = { password, profile: newProfile };
                localStorage.setItem('mock_users', JSON.stringify(users));
                
                this.user = { email, uid: email };
                this.loadProfile(newProfile);
                this.saveMockState();
                this.authModal.classList.remove('open');
            } else {
                const cred = await window.fbAuth.createUserWithEmailAndPassword(email, password);
                await window.fbDB.collection('users').doc(cred.user.uid).set({
                    plan: 'FREE',
                    dailyCount: 0,
                    date: new Date().toISOString().split('T')[0]
                });
                this.authModal.classList.remove('open');
            }
        } catch (e) {
            this.showError(e.message);
        }
    }

    async logout() {
        if (this.isMock) {
            this.user = null;
            this.saveMockState();
            this.updateUI();
        } else {
            await window.fbAuth.signOut();
        }
    }

    async handlePurchase(plan) {
        // Razorpay Mock Logic
        this.btnBuyPro.textContent = "Processing...";
        this.btnBuyPremium.textContent = "Processing...";
        
        setTimeout(async () => {
            alert(`Payment successful! Welcome to the ${plan} plan.`);
            this.userPlan = plan;
            
            if (this.isMock) {
                const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
                users[this.user.email].profile.plan = plan;
                localStorage.setItem('mock_users', JSON.stringify(users));
                this.saveMockState();
            } else {
                await window.fbDB.collection('users').doc(this.user.uid).update({ plan });
            }
            
            this.updateUI();
            this.paywallModal.classList.remove('open');
            
            this.btnBuyPro.textContent = "Subscribe";
            this.btnBuyPremium.textContent = "Subscribe";
        }, 1500);
    }

    checkDailyLimit() {
        if (this.userPlan === 'PRO' || this.userPlan === 'PREMIUM') return true;

        const today = new Date().toISOString().split('T')[0];
        if (this.lastPredictionDate !== today) {
            this.dailyPredictions = 0;
            this.lastPredictionDate = today;
            this.saveProfile();
        }

        if (this.dailyPredictions >= 10) {
            this.paywallModal.classList.add('open');
            return false; // Blocking the prediction
        }
        return true;
    }

    async incrementPrediction() {
        if (this.userPlan === 'PRO' || this.userPlan === 'PREMIUM') return;
        
        this.dailyPredictions++;
        this.saveProfile();
    }

    async loadProfileFromFirestore() {
        if (!this.user || this.isMock) return;
        const doc = await window.fbDB.collection('users').doc(this.user.uid).get();
        if (doc.exists) {
            this.loadProfile(doc.data());
        }
    }

    loadProfile(data) {
        this.userPlan = data.plan || 'FREE';
        this.dailyPredictions = data.dailyCount || 0;
        this.lastPredictionDate = data.date || new Date().toISOString().split('T')[0];
        this.updateUI();
    }

    async saveProfile() {
        if (!this.user) return;
        
        const updates = {
            dailyCount: this.dailyPredictions,
            date: this.lastPredictionDate,
            plan: this.userPlan
        };

        if (this.isMock) {
            const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
            if (users[this.user.email]) {
                users[this.user.email].profile = updates;
                localStorage.setItem('mock_users', JSON.stringify(users));
            }
        } else {
            await window.fbDB.collection('users').doc(this.user.uid).update(updates);
        }
    }

    // Mock State handling for browser persistence across reloads
    saveMockState() {
        if (this.user) {
            localStorage.setItem('mock_session', this.user.email);
        } else {
            localStorage.removeItem('mock_session');
        }
        this.updateUI();
    }

    loadMockState() {
        const session = localStorage.getItem('mock_session');
        if (session) {
            const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
            if (users[session]) {
                this.user = { email: session, uid: session };
                this.loadProfile(users[session].profile);
            }
        }
        this.updateUI();
    }

    updateUI() {
        if (this.user) {
            this.btnAuth.textContent = 'Account';
            this.userInfoText.style.display = 'block';
            this.userInfoText.textContent = `${this.userPlan} | ${this.user.email}`;
            
            // Highlight current plan in paywall automatically
            document.querySelectorAll('.pricing-card').forEach(card => card.classList.remove('highlighted'));
            if (this.userPlan === 'FREE') document.querySelectorAll('.pricing-card')[0].classList.add('highlighted');
            if (this.userPlan === 'PRO') document.querySelectorAll('.pricing-card')[1].classList.add('highlighted');
            if (this.userPlan === 'PREMIUM') document.querySelectorAll('.pricing-card')[2].classList.add('highlighted');
        } else {
            this.btnAuth.textContent = '👤 Login';
            this.userInfoText.style.display = 'none';
        }
    }
}

window.authManager = new AuthManager();
