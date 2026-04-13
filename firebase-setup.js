// ==========================================
// FIREBASE CONFIGURATION
// Replace with your actual Firebase config
// ==========================================
const firebaseConfig = {
    apiKey: "", // MUST BE FILLED IN PRODUCTION
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

let fbApp = null;
let fbAuth = null;
let fbDb = null;

try {
    if (firebaseConfig.apiKey && typeof firebase !== 'undefined') {
        fbApp = firebase.initializeApp(firebaseConfig);
        fbAuth = firebase.auth();
        fbDb = firebase.firestore();
        console.log("Firebase initialized successfully.");
    } else {
        console.warn("Firebase config is empty. Running in LOCAL MOCK Mode.");
    }
} catch (e) {
    console.error("Firebase init failed, running in LOCAL MOCK mode:", e);
}

window.fbDB = fbDb;
window.fbAuth = fbAuth;
