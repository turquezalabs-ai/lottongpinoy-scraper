// scrape_prizes.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'prizes.json');
const TARGET_URL = 'https://www.pcso.gov.ph/';

(async () => {
    console.log("💎 SCRAPING LIVE ESTIMATED JACKPOTS...");

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    const browser = await puppeteer.launch({ 
        headless: "new", 
        executablePath: '/opt/google/chrome/chrome', 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    try {
        console.log(`🌐 Navigating to ${TARGET_URL}...`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 }); // Wait for network to settle

        // CRITICAL: Wait for the text content inside the span to exist
        console.log("⏳ Waiting for live data to inject...");
        
        // We wait until one of the spans has text content (meaning the script has run)
        await page.waitForFunction(() => {
            const el = document.querySelector('span[id$="lbl655"]'); // Check Grand Lotto as a proxy
            return el && el.innerText.trim().length > 0;
        }, { timeout: 15000 });

        const livePrizes = await page.evaluate(() => {
            const results = {};
            
            const mapping = {
                "Ultra Lotto 6/58": "lbl658",
                "Grand Lotto 6/55": "lbl655",
                "Super Lotto 6/49": "lbl649",
                "Mega Lotto 6/45": "lbl645",
                "Lotto 6/42": "lbl642",
                "6D Lotto": "lbl6D" 
            };

            for (const [gameName, idSuffix] of Object.entries(mapping)) {
                // Find the span whose ID ends with the target
                const element = document.querySelector(`span[id$="${idSuffix}"]`);
                
                if (element) {
                    let text = element.innerText.trim();
                    // Check if it actually looks like money (not empty or &nbsp;)
                    if (text && text !== ' ') {
                        results[gameName] = text;
                    } else {
                        results[gameName] = "Loading...";
                    }
                } else {
                    results[gameName] = "Not Found";
                }
            }
            return results;
        });

        const finalOutput = {
            last_updated: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
            prizes: livePrizes
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 4));
        console.log("✅ SUCCESS! Live prizes captured:");
        console.table(livePrizes);

    } catch (error) {
        console.error("❌ Live Scrape Failed:", error.message);
    } finally {
        await browser.close();
    }
})();
