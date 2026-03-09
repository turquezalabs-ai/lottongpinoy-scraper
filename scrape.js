// scrape.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const https = require('https');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'results.json');
const LIVE_DATA_URL = 'https://lottong-pinoy.com/results.json';
const TARGET_URL = 'https://www.lottopcso.com/';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));


(async () => {
        console.log("⚡ REAL-TIME SCRAPER STARTED");
    
    // SWITCH: Read from Local Repo instead of Live URL
    // This avoids the Hostinger Firewall Timeout issue.
    let currentData = [];
    
    // Ensure folder exists
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const rawData = fs.readFileSync(OUTPUT_FILE);
            currentData = JSON.parse(rawData);
            console.log(`💾 Loaded ${currentData.length} entries from Local Repo.`);
        } catch (e) {
            console.log("⚠️ Error reading local file. Starting fresh.");
            currentData = [];
        }
    } else {
        console.log("⚠️ No local data file found. Starting fresh.");
    }

    const initialCount = currentData.length;

    // --- FAILSAFE ---
    if (initialCount === 0) {
        console.error("❌ FAILSAFE: No data loaded after retries. Aborting workflow.");
        process.exit(1); // KILLS THE JOB. Prevents FTP step from running.
    }

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    const browser = await puppeteer.launch({ 
        headless: true,
        executablePath: '/opt/google/chrome/chrome', 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    let newCount = 0;

    try {
        console.log(`🌐 Navigating to ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await wait(4000);

        const { text, items } = await page.evaluate(() => {
            const text = document.body.innerText;
            const items = [];
            
            // ... (Keep the Smart Parser logic from previous message) ...
            // For brevity, I am using the previous parser logic:
            const lines = text.split('\n');
            let currentGame = null;
            const gameNames = ['3D Lotto', 'Swertres', '2D Lotto', 'EZ2', '4D Lotto', '6D Lotto', 'Ultra Lotto 6/58', 'Grand Lotto 6/55', 'Super Lotto 6/49', 'Mega Lotto 6/45', 'Lotto 6/42'];
            const timePattern = /(2:00 PM|4:00 PM|9:00 PM|11:00 AM|2PM|4PM|9PM|11AM)/i;
            const numPattern = /(\d{1,2}[-\s]\d{1,2}(?:[-\s]\d{1,2})*)/;

            lines.forEach(line => {
                const cleanLine = line.trim();
                if (!cleanLine) return;
                gameNames.forEach(game => {
                    if (cleanLine.includes(game)) {
                        currentGame = game;
                        if (currentGame === 'Swertres') currentGame = '3D Lotto';
                        if (currentGame === 'EZ2') currentGame = '2D Lotto';
                    }
                });

                const hasTime = timePattern.test(cleanLine);
                const numMatch = cleanLine.match(numPattern);

                if (hasTime && numMatch && currentGame) {
                    let time = cleanLine.match(timePattern)[1].replace(':00', '').replace(' ', '');
                    let numbers = numMatch[1].replace(/\s/g, '-');
                    items.push({
                        game: `${currentGame} ${time}`,
                        combination: numbers,
                        prize: '₱ TBA',
                        winners: 'TBA',
                        date: new Date().toISOString().split('T')[0]
                    });
                }
            });
            return { text, items };
        });

        console.log(`🔍 Found ${items.length} potential results.`);

        items.forEach(item => {
            const exists = currentData.some(i => 
                i.date === item.date && 
                i.game === item.game && 
                i.combination === item.combination
            );

            if (!exists) {
                currentData.push(item);
                newCount++;
                console.log(`   ✅ NEW: ${item.game} - ${item.combination}`);
            }
        });

        currentData.sort((a, b) => {
            const getTs = (str) => {
                const parts = str.split('-');
                return parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2]);
            };
            return getTs(b.date) - getTs(a.date);
        });

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        console.log(`💾 Saved ${newCount} new entries.`);

    } catch (error) {
        console.error("❌ Error:", error.message);
        // Exit with error code so GitHub knows it failed
        process.exit(1);
    }

    await browser.close();
})();
