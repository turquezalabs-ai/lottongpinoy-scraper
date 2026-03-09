// scrape.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'results.json');
const TARGET_URL = 'https://www.lottopcso.com/';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SAFETY_THRESHOLD = 5000;

(async () => {
    console.log("⚡ REAL-TIME SCRAPER STARTED (v2 - Multi-Game Support)");
    
    let currentData = [];
    
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

    if (initialCount > 0 && initialCount < SAFETY_THRESHOLD) {
        console.error(`❌ FAILSAFE TRIGGERED: Database size is ${initialCount}. Aborting.`);
        process.exit(1); 
    }

    const browser = await puppeteer.launch({ 
        headless: "new", 
        executablePath: '/opt/google/chrome/chrome', 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage' 
        ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    let newCount = 0;

    try {
        console.log(`🌐 Navigating to ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await wait(4000);

        const items = await page.evaluate(() => {
            const items = [];
            
            // Games that require TIME (2D, 3D, Swertres, EZ2)
            const timeGames = ['3D Lotto', 'Swertres', '2D Lotto', 'EZ2'];
            // Games that are DAILY (No specific time)
            const dailyGames = ['4D Lotto', '6D Lotto', 'Ultra Lotto 6/58', 'Grand Lotto 6/55', 'Super Lotto 6/49', 'Mega Lotto 6/45', 'Lotto 6/42'];
            
            const allGames = [...timeGames, ...dailyGames];

            // Normalize names (e.g., Swertres -> 3D Lotto)
            const normalizeGame = (name) => {
                if (name.includes('Swertres')) return '3D Lotto';
                if (name.includes('EZ2')) return '2D Lotto';
                return name;
            };

            const timeRegex = /(11:00 AM|11AM|2:00 PM|2PM|4:00 PM|4PM|9:00 PM|9PM)/i;
            const numRegex = /(\d{1,2}(-\d{1,2})+)/g; 

            let currentGame = null;
            let isTimeBased = false;

            // Helper to add item
            const addItem = (gameName, combination, timeLabel = '') => {
                // Avoid duplicates logic inside evaluate is simple; 
                // we just push, parent will handle global duplicate check
                items.push({
                    game: timeLabel ? `${gameName} ${timeLabel}` : gameName,
                    combination: combination,
                    prize: 'TBA',
                    winners: 'TBA',
                    date: new Date().toISOString().split('T')[0]
                });
            };

            // 1. Scan Table Rows
            const rows = document.querySelectorAll('tr, div.elementor-widget-container');

            rows.forEach(row => {
                const rowText = row.innerText;

                // A. Detect Game Name
                allGames.forEach(game => {
                    if (rowText.toLowerCase().includes(game.toLowerCase())) {
                        currentGame = normalizeGame(game);
                        isTimeBased = timeGames.includes(currentGame);
                    }
                });

                if (!currentGame) return;

                // B. Extract Numbers
                const numMatches = rowText.match(numRegex);
                if (!numMatches) return; // No numbers in this row

                const combination = numMatches[0]; // Take the first match

                // C. Logic Branch
                if (isTimeBased) {
                    // MUST find time for 2D/3D
                    const timeMatch = rowText.match(timeRegex);
                    if (timeMatch) {
                        let time = timeMatch[1].replace(':00', '').replace(' ', '').toUpperCase();
                        addItem(currentGame, combination, time);
                    }
                } else {
                    // NO TIME needed for 6D, 4D, etc.
                    // But we check if we already added this game today to avoid duplicates in the loop
                    const alreadyAdded = items.some(i => i.game === currentGame && i.date === new Date().toISOString().split('T')[0]);
                    if (!alreadyAdded) {
                        addItem(currentGame, combination);
                    }
                }
            });

            return items;
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

        if (newCount > 0) {
            currentData.sort((a, b) => {
                const getTs = (str) => {
                    const parts = str.split('-');
                    return parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2]);
                };
                return getTs(b.date) - getTs(a.date);
            });
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
            console.log(`💾 Database updated. Size: ${currentData.length} entries. (New: ${newCount})`);
        } else {
            console.log("ℹ️ No new entries added.");
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }

    await browser.close();
})();
