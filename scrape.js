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

async function fetchExistingData(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } 
                catch (e) { 
                    console.log("⚠️ Could not parse live data (File might be empty).");
                    resolve([]); 
                }
            });
        }).on('error', (e) => {
            console.log(`❌ Network Error loading data: ${e.message}`);
            resolve([]);
        });
    });
}

(async () => {
    console.log("⚡ REAL-TIME SCRAPER STARTED");
    
    let currentData = await fetchExistingData(LIVE_DATA_URL);
    console.log(`💾 Loaded ${currentData.length} existing entries.`);

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

        const results = await page.evaluate(() => {
            const items = [];
            const text = document.body.innerText;
            
            // --- DEBUG ---
            // console.log(text.substring(0, 1000)); // Optional: comment out once working

            // --- SMART PARSER (State Machine) ---
            // 1. Split text into lines
            const lines = text.split('\n');
            
            let currentGame = null;
            
            // 2. Define what we are looking for
            const gameNames = [
                '3D Lotto', 'Swertres', '2D Lotto', 'EZ2', 
                '4D Lotto', '6D Lotto', 
                'Ultra Lotto 6/58', 'Grand Lotto 6/55', 'Super Lotto 6/49', 
                'Mega Lotto 6/45', 'Lotto 6/42'
            ];
            
            const timePattern = /(2:00 PM|4:00 PM|9:00 PM|11:00 AM|2PM|4PM|9PM|11AM)/i;
            const numPattern = /(\d{1,2}[-\s]\d{1,2}(?:[-\s]\d{1,2})*)/; // Matches 1-2, 1-2-3, 1-2-3-4-5-6

            // 3. Iterate lines
            lines.forEach(line => {
                const cleanLine = line.trim();
                if (!cleanLine) return;

                // A. Check if this line is a Game Header
                // We check if the line contains one of our game names
                gameNames.forEach(game => {
                    if (cleanLine.includes(game)) {
                        currentGame = game;
                        // Normalize names
                        if (currentGame === 'Swertres') currentGame = '3D Lotto';
                        if (currentGame === 'EZ2') currentGame = '2D Lotto';
                    }
                });

                // B. Check if this line is a Result (Time + Numbers)
                // Must have a time AND numbers
                const hasTime = timePattern.test(cleanLine);
                const numMatch = cleanLine.match(numPattern);

                if (hasTime && numMatch && currentGame) {
                    let time = cleanLine.match(timePattern)[1].replace(':00', '').replace(' ', ''); // "2:00 PM" -> "2PM"
                    let numbers = numMatch[1].replace(/\s/g, '-'); // "1 2 3" -> "1-2-3"

                    items.push({
                        game: `${currentGame} ${time}`,
                        combination: numbers,
                        prize: '₱ TBA',
                        winners: 'TBA',
                        date: new Date().toISOString().split('T')[0]
                    });
                }
            });

            return items;
        });

        console.log(`🔍 Found ${results.length} potential results.`);

        if (results.length > 0) {
            results.forEach(item => {
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
        } else {
            console.log("⚠️ No results found. Check website format.");
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
    }

    await browser.close();
})();
