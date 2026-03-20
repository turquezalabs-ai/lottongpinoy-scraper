// scrape_prize.js
const https = require('https');
const fs = require('fs');
const { JSDOM } = require('jsdom');

// Targeted URLs for the freshest jackpot updates
const GAME_URLS = {
    "6/58": "https://www.pcso.gov.ph/Games/Lotto/UltraLotto658.aspx",
    "6/55": "https://www.pcso.gov.ph/Games/Lotto/GrandLotto655.aspx",
    "6/49": "https://www.pcso.gov.ph/Games/Lotto/SuperLotto649.aspx",
    "6/45": "https://www.pcso.gov.ph/Games/Lotto/Megalotto645.aspx",
    "6/42": "https://www.pcso.gov.ph/Games/Lotto/Lotto642.aspx",
    "6D":   "https://www.pcso.gov.ph/Games/Lotto/6D.aspx",
    "4D":   "https://www.pcso.gov.ph/Games/Lotto/4D.aspx"
};

async function fetchPage(url) {
    return new Promise((resolve, reject) => {
        // Adding a timestamp to prevent GitHub Actions from hitting a cached version
        const fullUrl = `${url}?t=${Date.now()}`;
        https.get(fullUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

async function startScraping() {
    const results = {
        last_updated: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
        prizes: {}
    };

    console.log(`🚀 Starting Marketing Scrape: ${results.last_updated}`);

    for (const [game, url] of Object.entries(GAME_URLS)) {
        try {
            const html = await fetchPage(url);
            const dom = new JSDOM(html);
            
            // PCSO uses this specific ID for the jackpot amount on individual pages
            const prizeEl = dom.window.document.querySelector('#ctl00_MainContent_lblJackpot');
            
            if (prizeEl) {
                const prizeValue = prizeEl.textContent.trim();
                results.prizes[game] = prizeValue;
                console.log(`✅ ${game}: ${prizeValue}`);
            } else {
                results.prizes[game] = "TBA";
                console.log(`⚠️ ${game}: Prize element not found (TBA)`);
            }
        } catch (error) {
            console.error(`❌ Error scraping ${game}:`, error.message);
            results.prizes[game] = "Error";
        }
    }

    // Ensure the data folder exists before saving
    if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data');
    }

    fs.writeFileSync('./data/prizes.json', JSON.stringify(results, null, 4));
    console.log("\n📁 prizes.json saved for banner creation!");
}

startScraping();
