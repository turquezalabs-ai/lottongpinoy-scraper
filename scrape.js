// scrape.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const https = require('https');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'results.json');
const LIVE_DATA_URL = 'https://lottong-pinoy.com/results.json'; // Your live site
const TARGET_URL = 'https://www.lottopcso.com/';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Download existing data
async function fetchExistingData(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } 
                catch (e) { resolve([]); }
            });
        }).on('error', () => resolve([]));
    });
}

(async () => {
    console.log("⚡ REAL-TIME SCRAPER STARTED");
    
    // 1. Load existing data
    let currentData = await fetchExistingData(LIVE_DATA_URL);
    console.log(`💾 Loaded ${currentData.length} existing entries.`);

    // 2. Prepare output folder
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

            const browser = await puppeteer.launch({ 
        headless: true, // 'new' can sometimes be buggy on CI, 'true' is safer
        executablePath: '/opt/google/chrome/chrome', // Path provided by browser-actions
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    let newCount = 0;

    try {
        console.log(`🌐 Navigating to ${TARGET_URL}`);
        
        // Go to site, wait for content
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await wait(3000); // Wait for results to render

        // 3. Extract Data from Text
        const results = await page.evaluate(() => {
            const items = [];
            // Get all text from the body
            const text = document.body.innerText;

            // Regex Strategy:
            // Find "3D Lotto 11AM: 1-2-3" or "Swertres 11AM: 1-2-3"
            // Supports 2D, 3D, 4D, 6D, and Major Games if listed
            
            // Pattern: (Game Name) (Time) : (Numbers)
            // Note: Handles common aliases like Swertres/EZ2
            const regex = /(3D|Swertres|2D|EZ2|4D|6D|Ultra Lotto|Grand Lotto|Super Lotto|Mega Lotto|Lotto)\s?(6\/58|6\/55|6\/49|6\/45|6\/42)?\s?(11AM|4PM|9PM|11:00 AM|4:00 PM|9:00 PM)?[:\s]+(\d{1,2}[-\s]\d{1,2}[-\s]\d{1,2}|\d{1,2}[-\s]\d{1,2})/gi;
            
            let match;
            while ((match = regex.exec(text)) !== null) {
                // Clean up Game Name
                let game = match[1].replace('Swertres', '3D').replace('EZ2', '2D');
                
                // If Major game, append the division (e.g., "Ultra Lotto 6/58")
                if(match[2]) game += ' ' + match[2];

                // Standardize Game Name for Database
                if(game === '3D') game = '3D Lotto';
                if(game === '2D') game = '2D Lotto';
                if(game === '4D') game = '4D Lotto';
                if(game === '6D') game = '6D Lotto';

                // Add time if found (for 2D/3D)
                if(match[3]) {
                    let time = match[3].replace(':00', '').replace(' ', ''); // Normalize
                    game += ' ' + time;
                }

                let numbers = match[4].replace(/\s/g, '-'); // Normalize spaces to dashes
                
                items.push({
                    game: game.trim(),
                    combination: numbers,
                    prize: '₱ TBA', // Not available in quick text
                    winners: 'TBA',
                    date: new Date().toISOString().split('T')[0] // Assume today
                });
            }
            return items;
        });

        console.log(`🔍 Found ${results.length} potential results.`);

        // 4. Merge & Save
        results.forEach(item => {
            // Check duplicates carefully
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

        // Sort Descending
        currentData.sort((a, b) => {
            const getTs = (str) => {
                const parts = str.split('-');
                return parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2]);
            };
            return getTs(b.date) - getTs(a.date);
        });

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));

        if (newCount > 0) console.log(`💾 Saved ${newCount} new entries.`);
        else console.log("✅ No new updates found.");

    } catch (error) {
        console.error("❌ Error:", error.message);
        // Save whatever we have to ensure FTP doesn't crash
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
    }

    await browser.close();
})();
