const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

let lastCallTime = 0;
const CACHE = {};

function getApiKey() {
    return localStorage.getItem("rng_gemini_key");
}

function setApiKey(key) {
    if (!key) {
        localStorage.removeItem("rng_gemini_key");
    } else {
        localStorage.setItem("rng_gemini_key", key);
    }
}

// Fallback logic if API failed, no key, or limited
function analyzeJSFallback(tracker) {
    const p = tracker.getPatternAnalysis();
    const lastResult = tracker.history[tracker.history.length - 1];
    
    let prediction = 'WAIT';
    let reason = "Pattern unclear or insufficient data.";

    if (tracker.history.length < 5) {
        reason = "Observing game patterns. Needs 5 rounds.";
    } else if (tracker.consecutiveLosses >= 2) {
        reason = "2 losses hit. Cooling down.";
    } else if (tracker.currentLevel > 3) {
        reason = "Max risk level reached! Reassess.";
    } else {
        if (p.type === 'ALTERNATING') {
            prediction = lastResult === 'B' ? 'S' : 'B';
            reason = "Strong alternating pattern detected.";
        } else if (p.type === 'STREAKY') {
            prediction = lastResult; // follow
            reason = "Following current strong streak.";
        } else {
            reason = "Mixed signals. Waiting for clearer trend.";
        }
    }

    return {
        prediction,
        confidence: p.confidence,
        reason,
        source: 'local'
    };
}

async function getPrediction(tracker) {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.log("No API key, using JS fallback");
        return analyzeJSFallback(tracker);
    }

    // Rate Limit: 2 seconds
    const now = Date.now();
    if (now - lastCallTime < 2000) {
        console.log("Rate limited, using JS fallback");
        return analyzeJSFallback(tracker);
    }

    // Cache logic: hash the last 15 results + level
    const historyStr = tracker.history.slice(-15).join('');
    const cacheKey = `${tracker.currentLevel}_${historyStr}`;
    
    // If waiting or needing data, skip Gemini entirely to save requests
    if (tracker.history.length < 5) {
        return analyzeJSFallback(tracker);
    }

    // Strict exit rules (Don't waste API if we must force wait)
    if (tracker.currentLevel >= 4 || tracker.consecutiveLosses >= 2) {
        return analyzeJSFallback(tracker);
    }

    if (CACHE[cacheKey]) {
        console.log("Using cached prediction");
        return CACHE[cacheKey];
    }
    
    lastCallTime = now;

    const prompt = `You are an expert probability analyst for a Big/Small (0-4=Small, 5-9=Big) colour prediction game.
My explicit rules:
1. Try to find alternating or streaky patterns.
2. If the pattern is chaotic, recommend WAIT.
3. Current Martingale Level is ${tracker.currentLevel}. We abort if we reach Level 4.
4. History sequence: [${tracker.history.join(', ')}] (Latest is rightmost).

Analyze the sequence. Reply strictly in valid JSON format only, with no markdown code blocks and no extra text.
Format:
{
  "prediction": "B", "S", or "WAIT",
  "confidence": <integer from 0 to 100>,
  "reason": "<short reasoning in 1 sentence>"
}`;

    try {
        const response = await fetch(`${API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.2, // Low temp for more deterministic output
                }
            })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        let textResult = data.candidates[0].content.parts[0].text;
        
        // Cleanup text in case Gemini wraps in ```json
        textResult = textResult.replace(/```json/g, '').replace(/```/g, '').trim();

        const resultObj = JSON.parse(textResult);

        // Limit confidence to UI constraints (say max 95%)
        if (resultObj.confidence > 95) resultObj.confidence = 95;

        resultObj.source = 'api';
        CACHE[cacheKey] = resultObj;

        return resultObj;

    } catch (err) {
        console.error("Gemini API Error:", err);
        return analyzeJSFallback(tracker);
    }
}

window.api = {
    getApiKey,
    setApiKey,
    getPrediction
};
