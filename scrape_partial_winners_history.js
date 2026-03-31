// scrape_partial_winners_history.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'partial_winners_history.json');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// NEW: Try PCSO Official First (Fastest), then fallback to LottoPCSO
const TARGETS = [
    // PRIORITY 1: PCSO Official (Updates Minutes After Draw)
    { url: 'https://www.pcso.gov.ph/SearchLottoResult.aspx', game: 'Ultra Lotto 6/58', source: 'PCSO' },
    { url: 'https://www.pcso.gov.ph/SearchLottoResult.aspx', game: 'Grand Lotto 6/55', source: 'PCSO' },
    { url: 'https://www.pcso.gov.ph/SearchLottoResult.aspx', game: 'Super Lotto 6/49', source: 'PCSO' },
    { url: 'https://www.pcso.gov.ph/SearchLottoResult.aspx', game: 'Mega Lotto 6/45', source: 'PCSO' },
    { url: 'https://www.pcso.gov.ph/SearchLottoResult.aspx', game: 'Lotto 6/42', source: 'PCSO' },

    // PRIORITY 2: Fallback (LottoPCSO) - Only runs if PCSO fails
    { url: 'https://www.lottopcso.com/6-58-lotto-result/', game: 'Ultra Lotto 6/58', source: 'LottoPCSO' },
    { url: 'https://www.lottopcso.com/6-55-lotto-result/', game: 'Grand Lotto 6/55', source: 'LottoPCSO' },
    { url: 'https://www.lottopcso.com/6-49-lotto-result/', game: 'Super Lotto 6/49', source: 'LottoPCSO' },
    { url: 'https://www.lottopcso.com/6-45-lotto-result/', game: 'Mega Lotto 6/45', source: 'LottoPCSO' },
    { url: 'https://www.lottopcso.com/6-42-lotto-result/', game: 'Lotto 6/42', source: 'LottoPCSO' }
];

(async () => {
    console.log("💎 Scraping Partial Winners (Dual Source Mode)...");

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    let currentData = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try { currentData = JSON.parse(fs.readFileSync(OUTPUT_FILE)); } 
        catch (e) { currentData = []; }
    }
    console.log(`💾 Loaded ${currentData.length} existing entries.`);

    const browser = await puppeteer.launch({ 
        headless: "new", 
        executablePath: '/opt/google/chrome/chrome', 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    let newItems = [];
    const processedGames = new Set(); // Track which games we got data for

    try {
        for (const target of TARGETS) {
            // OPTIMIZATION: If we already got data for this game from PCSO, skip the fallback
            if (processedGames.has(target.game)) {
                console.log(`⏩ Skipping ${target.game} (${target.source}) - Already updated.`);
                continue;
            }

            const page = await browser.newPage();
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
                else req.continue();
            });

            try {
                process.stdout.write(`🔍 ${target.game} (${target.source})... `);
                await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                
                // Specific logic based on source
                let details;
                if (target.source === 'PCSO') {
                    details = await scrapePCSO(page, target.game);
                } else {
                    details = await scrapeLottoPCSO(page);
                }
                
                await page.close();

                if (details) {
                    const exists = currentData.some(i => i.date === details.date && i.game === target.game);
                    if (!exists) {
                        process.stdout.write(`✅ NEW\n`);
                        newItems.push({
                            game: target.game,
                            date: details.date,
                            combination: details.combination,
                            jackpot_prize: details.jackpot_prize,
                            jackpot_winners: details.jackpot_winners,
                            winners_2nd: details.second.winners,
                            prize_2nd: details.second.prize,
                            winners_3rd: details.third.winners,
                            prize_3rd: details.third.prize,
                            winners_4th: details.fourth.winners,
                            prize_4th: details.fourth.prize
                        });
                        processedGames.add(target.game); // Mark as updated
                    } else {
                        process.stdout.write(`✔️ Exists\n`);
                        processedGames.add(target.game); // Mark as found (even if old)
                    }
                } else {
                    process.stdout.write(`❌ Parse Error\n`);
                }
            } catch (e) {
                process.stdout.write(`❌ Error: ${e.message.substring(0, 20)}\n`);
            }
        }

        if (newItems.length > 0) {
            const finalData = [...currentData, ...newItems];
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
            console.log(`💾 Done! Added ${newItems.length} new entries.`);
        } else {
            console.log(`💾 Done! No new entries found.`);
        }

    } catch (error) {
        console.error("❌ Fatal Error:", error.message);
    } finally {
        await browser.close();
    }
})();

// --- SCRAPER FUNCTIONS ---

// 1. Official PCSO Logic (Fastest Updater)
async function scrapePCSO(page, gameName) {
    // Note: PCSO site requires selecting the game from a dropdown
    // This is a simplified example; you might need to adjust selectors
    try {
        // Wait for the specific table structure PCSO uses
        await page.waitForSelector('table', { timeout: 5000 });
        
        return await page.evaluate((game) => {
            // PCSO scraping logic here...
            // This is a placeholder - PCSO site structure is complex
            // Often requires interacting with ASP.NET postbacks
            return null; // Return null for now to fallback to LottoPCSO automatically
        }, gameName);
    } catch (e) {
        return null;
    }
}

// 2. LottoPCSO Logic (Reliable Fallback)
async function scrapeLottoPCSO(page) {
    await wait(1000);
    return await page.evaluate(() => {
        const data = {};
        const table = document.querySelector('table.has-fixed-layout');
        if (!table) return null;

        const th = table.querySelector('thead th:nth-child(2)');
        if (!th) return null;
        const d = new Date(th.innerText.trim());
        if (isNaN(d)) return null;
        data.date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

        const getValue = (labelText) => {
            const rows = table.querySelectorAll('tbody tr');
            for (const row of rows) {
                if (row.cells[0].innerText.trim().includes(labelText)) return row.cells[1].innerText.trim();
            }
            return null;
        };

        const parseValue = (val) => {
            if (!val) return { winners: '0', prize: 'N/A' };
            const match = val.match(/^([\d,]+)\s*\((.+?)\)$/);
            if (match) return { winners: match[1].replace(/,/g, ''), prize: match[2] };
            return { winners: val.replace(/,/g, ''), prize: 'N/A' };
        };

        data.combination = getValue('Winning Combination');
        data.jackpot_prize = getValue('Jackpot Prize');
        data.jackpot_winners = getValue('Jackpot Winner');

        const p2 = getValue('2nd Prize');
        const p3 = getValue('3rd Prize');
        const p4 = getValue('4th Prize');

        data.second = parseValue(p2);
        data.third = parseValue(p3);
        data.fourth = parseValue(p4);
        return data;
    });
}
