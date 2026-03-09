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

// SAFETY THRESHOLD
const SAFETY_THRESHOLD = 5000;

(async () => {
    console.log("⚡ REAL-TIME SCRAPER STARTED (DOM PARSER)");
    
    // 1. Read from Local Repo
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

    if (initialCount === 0) {
        console.warn("⚠️ WARNING: No data loaded.");
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

        // ==========================================================
        // NEW LOGIC: DOM ROW PARSER
        // Instead of reading text, we iterate through HTML Table Rows (TR)
        // This ensures we catch EVERY draw (11AM, 4PM, 9PM) separately.
        // ==========================================================
        const items = await page.evaluate(() => {
            const items = [];
            
            // Game Names to look for
            const gameKeywords = [
                '3D Lotto', 'Swertres', 
                '2D Lotto', 'EZ2', 
                '4D Lotto', '6D Lotto', 
                'Ultra Lotto 6/58', 'Grand Lotto 6/55', 
                'Super Lotto 6/49', 'Mega Lotto 6/45', 'Lotto 6/42'
            ];
            
            // Normalize names
            const normalizeGame = (name) => {
                if (name.includes('Swertres')) return '3D Lotto';
                if (name.includes('EZ2')) return '2D Lotto';
                return name;
            };

            // Regex for Time and Numbers
            const timeRegex = /(11:00 AM|11AM|2:00 PM|2PM|4:00 PM|4PM|9:00 PM|9PM)/i;
            const numRegex = /(\d{1,2}(-\d{1,2})+)/g; // Matches "1-2-3" or "12-45"

            let currentGame = null;

            // 1. Find all Table Rows (most common for lotto results)
            const rows = document.querySelectorAll('tr');

            rows.forEach(row => {
                const rowText = row.innerText;

                // Check if this row defines a Game Name
                gameKeywords.forEach(game => {
                    if (rowText.toLowerCase().includes(game.toLowerCase())) {
                        currentGame = normalizeGame(game);
                    }
                });

                // If we have a game context, look for results in this row
                if (currentGame) {
                    // Check for Time
                    const timeMatch = rowText.match(timeRegex);
                    // Check for Numbers (Global match to find all if multiple in row)
                    const numMatches = rowText.match(numRegex);

                    if (timeMatch && numMatches) {
                        let time = timeMatch[1].replace(':00', '').replace(' ', '').toUpperCase(); // Normalize to "11AM"
                        
                        // Use the first number match found in the row
                        let combination = numMatches[0]; 
                        
                        items.push({
                            game: `${currentGame} ${time}`,
                            combination: combination,
                            prize: 'TBA',
                            winners: 'TBA',
                            date: new Date().toISOString().split('T')[0]
                        });
                    }
                }
            });

            // 2. Fallback: Check for Div Cards (some sites use divs)
            const cards = document.querySelectorAll('.result-card, .card, .elementor-widget-container');
            cards.forEach(card => {
                const cardText = card.innerText;
                
                gameKeywords.forEach(game => {
                    if (cardText.toLowerCase().includes(game.toLowerCase())) {
                        currentGame = normalizeGame(game);
                    }
                });

                if (currentGame) {
                    const timeMatch = cardText.match(timeRegex);
                    const numMatch = cardText.match(numRegex);
                    
                    if (timeMatch && numMatch) {
                        let time = timeMatch[1].replace(':00', '').replace(' ', '').toUpperCase();
                        let combination = numMatch[0]; // First match
                        
                        items.push({
                            game: `${currentGame} ${time}`,
                            combination: combination,
                            prize: 'TBA',
                            winners: 'TBA',
                            date: new Date().toISOString().split('T')[0]
                        });
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
