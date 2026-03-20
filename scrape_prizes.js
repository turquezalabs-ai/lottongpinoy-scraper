// scrape_prizes.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'prizes.json');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// We scrape the specific Game Pages because the Homepage uses Images (JPG)
const GAMES = [
    { name: 'Ultra Lotto 6/58', url: 'https://www.pcso.gov.ph/Games/Lotto/UltraLotto658.aspx' },
    { name: 'Grand Lotto 6/55', url: 'https://www.pcso.gov.ph/Games/Lotto/GrandLotto655.aspx' },
    { name: 'Super Lotto 6/49', url: 'https://www.pcso.gov.ph/Games/Lotto/SuperLotto649.aspx' },
    { name: 'Mega Lotto 6/45', url: 'https://www.pcso.gov.ph/Games/Lotto/MegaLotto645.aspx' },
    { name: 'Lotto 6/42',    url: 'https://www.pcso.gov.ph/Games/Lotto/Lotto642.aspx' },
    { name: '6D Lotto',       url: 'https://www.pcso.gov.ph/Games/Lotto/6D.aspx' },
    { name: '4D Lotto',       url: 'https://www.pcso.gov.ph/Games/Lotto/4D.aspx' }
];

(async () => {
    console.log("💎 SCRAPING LIVE JACKPOTS FROM GAME PAGES...");

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    const browser = await puppeteer.launch({ 
        headless: "new", 
        executablePath: '/opt/google/chrome/chrome', 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    const livePrizes = {};

    try {
        for (const game of GAMES) {
            process.stdout.write(`🔍 ${game.name}... `);
            try {
                await page.goto(game.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await wait(2000); 

                const prize = await page.evaluate(() => {
                    // STRATEGY: Find the word "Jackpot" (or "Estimated") and grab the number next to it.
                    
                    // Method 1: Look for a specific ASP.NET Label ID (common in PCSO)
                    let el = document.querySelector('[id*="lblJackpot"], [id*="lblCurrentJackpot"], [id*="lblEstimate"]');
                    if (el && el.innerText.match(/\d/)) return el.innerText.trim();

                    // Method 2: Find "Jackpot" text in the page and take the sibling
                    const allElements = Array.from(document.querySelectorAll('td, span, div, b, p, h2, h3'));
                    for (const el of allElements) {
                        const txt = el.innerText.trim();
                        // Find the label "Jackpot:"
                        if (txt === 'Jackpot:' || txt === 'Jackpot' || txt === 'Estimated Jackpot:') {
                            // Check next sibling
                            if (el.nextElementSibling) {
                                const val = el.nextElementSibling.innerText.trim();
                                if (val.match(/\d/)) return val;
                            }
                            // Check parent's next sibling (common in table layouts)
                            if (el.parentElement && el.parentElement.nextElementSibling) {
                                const val = el.parentElement.nextElementSibling.innerText.trim();
                                if (val.match(/\d/)) return val;
                            }
                        }
                    }

                    return "N/A";
                });

                livePrizes[game.name] = prize;
                process.stdout.write(`✅ ${prize}\n`);
            } catch (e) {
                livePrizes[game.name] = "Error";
                process.stdout.write(`❌\n`);
            }
        }

        const finalOutput = {
            last_updated: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
            prizes: livePrizes
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 4));
        console.log("\n✅ SUCCESS! File saved.");
        console.table(livePrizes);

    } catch (error) {
        console.error("❌ Major Error:", error.message);
    } finally {
        await browser.close();
    }
})();
