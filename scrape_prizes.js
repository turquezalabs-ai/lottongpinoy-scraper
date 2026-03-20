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
        executablePath: '/opt/google/chrome/chrome', // CRITICAL: Use system Chrome
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    try {
        console.log(`🌐 Navigating to ${TARGET_URL}...`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for any prize label to appear
        await page.waitForSelector('span[id*="lbl"]', { timeout: 10000 });

        const livePrizes = await page.evaluate(() => {
            const results = {};
            
            // MAPPING based on your Target IDs
            // We use [id$="..."] which means "ID ends with..." to handle ASP.NET prefixes.
            const mapping = {
                "Ultra Lotto 6/58": "lbl658",
                "Grand Lotto 6/55": "lbl655",
                "Super Lotto 6/49": "lbl649",
                "Mega Lotto 6/45": "lbl645",
                "Lotto 6/42": "lbl642",
                "6D Lotto": "lbl6D" 
            };

            for (const [gameName, idSuffix] of Object.entries(mapping)) {
                // Find the span element whose ID ends with our target ID
                const element = document.querySelector(`span[id$="${idSuffix}"]`);
                
                if (element) {
                    let text = element.innerText.trim();
                    results[gameName] = text;
                } else {
                    results[gameName] = "N/A";
                }
            }
            return results;
        });

        // Prepare Final Output
        const finalOutput = {
            last_updated: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
            prizes: livePrizes
        };

        // Save to file
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 4));
        console.log("✅ SUCCESS! Live prizes captured:");
        console.table(livePrizes);

    } catch (error) {
        console.error("❌ Live Scrape Failed:", error.message);
    } finally {
        await browser.close();
    }
})();
