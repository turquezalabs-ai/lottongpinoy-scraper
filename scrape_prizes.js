const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Use Stealth to bypass PCSO firewall
puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'prizes.json');
const TARGET_URL = 'https://www.pcso.gov.ph/';

(async () => {
    console.log("💎 SCRAPING LIVE ESTIMATED JACKPOTS...");

    // Ensure directory exists for your FTP upload
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const browser = await puppeteer.launch({ 
        headless: "new", 
        // Picks up the path from your GitHub YAML environment
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-gpu', 
            '--disable-dev-shm-usage'
        ]
    });

    const page = await browser.newPage();
    
    // Set a desktop-class viewport to trigger the full jackpot ticker
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    try {
        console.log(`🌐 Navigating to ${TARGET_URL}...`);
        
        // Wait for network to be quiet so the ticker scripts can finish fetching data
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 90000 });

        console.log("⏳ Pinpointing live jackpot data (Waiting for numbers)...");
        
        /**
         * PINPOINT LOGIC: 
         * We wait for the 6/49 label specifically to contain a digit (\d).
         * This prevents 'N/A' results caused by scraping before the JS ticker populates.
         */
        await page.waitForFunction(
            () => {
                const el = document.querySelector('span[id*="lbl649"]');
                return el && /\d/.test(el.innerText); 
            },
            { timeout: 45000 }
        );

        const livePrizes = await page.evaluate(() => {
            const results = {};
            
            // Mapping specific to the rolling homepage labels
            const mapping = {
                "Ultra Lotto 6/58": "lbl658",
                "Grand Lotto 6/55": "lbl655",
                "Super Lotto 6/49": "lbl649",
                "Mega Lotto 6/45": "lbl645",
                "Lotto 6/42": "lbl642",
                "6D Lotto": "lbl6D" 
            };

            for (const [gameName, idSuffix] of Object.entries(mapping)) {
                // Find span where ID contains our target (bypasses ASP.NET prefixes)
                const element = document.querySelector(`span[id*="${idSuffix}"]`);
                
                if (element && element.innerText.trim() !== "") {
                    // This captures the fresh, increased jackpot for your banners
                    results[gameName] = element.innerText.trim();
                } else {
                    results[gameName] = "TBA";
                }
            }
            return results;
        });

        const finalOutput = {
            last_updated: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
            prizes: livePrizes
        };

        // Write the JSON for your FTP-Deploy-Action
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 4));
        
        console.log("✅ SUCCESS! Fresh rolling prizes captured:");
        console.table(livePrizes);

    } catch (error) {
        console.error("❌ Live Scrape Failed:", error.message);
        
        // Optional: Save a screenshot to the data folder for debugging via FTP
        if (fs.existsSync(OUTPUT_DIR)) {
            await page.screenshot({ path: path.join(OUTPUT_DIR, 'latest_error.png') });
        }
    } finally {
        await browser.close();
    }
})();
