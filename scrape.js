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

// SAFETY THRESHOLD:
// Your database is ~31,500 entries. If we ever load a file with less than 5000 entries,
// we assume the file is corrupt/incomplete and ABORT saving to prevent data loss.
const SAFETY_THRESHOLD = 5000;

(async () => {
    console.log("⚡ REAL-TIME SCRAPER STARTED");
    
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

    // --- ULTIMATE PROTECTION LOGIC ---
    
    // 1. Failsafe: If we loaded a tiny database (e.g., 4 entries), it means a previous run wiped it.
    // We MUST stop here. We refuse to save a tiny file over a massive database.
    if (initialCount > 0 && initialCount < SAFETY_THRESHOLD) {
        console.error(`❌ FAILSAFE TRIGGERED: Database size is ${initialCount}.`);
        console.error(`❌ This is below the safety threshold of ${SAFETY_THRESHOLD}.`);
        console.error("❌ The database appears corrupted or incomplete. Aborting to prevent overwrite.");
        console.error("❌ ACTION: Please restore 'results.json' from your backup (The 31,500 entry file).");
        process.exit(1); // Kill the job
    }

    // 2. If database is truly empty (0), we might be starting brand new, but we should be careful.
    if (initialCount === 0) {
        console.warn("⚠️ WARNING: No data loaded.");
        console.warn("⚠️ If this is a new installation, ignore this. If you had data, RESTORE BACKUP NOW.");
        // We allow continuing here ONLY if we are sure we want to build from scratch.
        // If you want to block empty starts too, uncomment the exit below:
        // process.exit(1);
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

        const { text, items } = await page.evaluate(() => {
            const text = document.body.innerText;
            const items = [];
            
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
                currentData.push(item
