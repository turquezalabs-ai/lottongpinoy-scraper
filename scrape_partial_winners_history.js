const puppeteer = require('puppeteer');
const fs = require('fs');

// DEFINE YOUR GAMES HERE
const GAMES = [
    { name: 'Ultra Lotto 6/58', url: 'https://www.pcso.gov.ph/SearchLottoResult.aspx' },
    { name: 'Grand Lotto 6/55', url: 'https://www.pcso.gov.ph/SearchLottoResult.aspx' },
    { name: 'Super Lotto 6/49', url: 'https://www.pcso.gov.ph/SearchLottoResult.aspx' },
    { name: 'Mega Lotto 6/45', url: 'https://www.pcso.gov.ph/SearchLottoResult.aspx' },
    { name: 'Lotto 6/42', url: 'https://www.pcso.gov.ph/SearchLottoResult.aspx' },
    // Add 6D, 4D, 3D, 2D if needed
];

// WRAPPER: The code must be inside an async function
(async () => {
    const browser = await puppeteer.launch({ 
        headless: 'new', 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    const allData = [];

    try {
        for (const target of GAMES) {
            console.log(`Scraping ${target.name}...`);
            
            // 1. Go to the page
            await page.goto(target.url, { waitUntil: 'networkidle2' });

            // 2. Select game in dropdown (if PCSO site uses dropdown)
            // Note: PCSO site often requires selecting the game. 
            // You might need to adjust this selector based on the actual site structure.
            try {
                await page.select('select#cphContainer_ucSearchLotto_ddlGame', target.name); 
                await page.click('input[type="submit"]');
                await page.waitForSelector('table.has-fixed-layout', { timeout: 5000 });
            } catch (e) {
                console.log(`Could not select game or table not found for ${target.name}`);
                continue; 
            }

            // 3. Evaluate (Your fixed logic)
            const resultsOnPage = await page.evaluate((gameName) => {
                const items = [];
                const tables = document.querySelectorAll('table.has-fixed-layout');

                tables.forEach(table => {
                    const th = table.querySelector('thead th:nth-child(2)');
                    if (!th) return;
                    
                    const d = new Date(th.innerText.trim());
                    if (isNaN(d)) return;
                    const date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

                    // ROBUST HELPER
                    const getValue = (label) => {
                        const rows = table.querySelectorAll('tbody tr');
                        for (const row of rows) {
                            const cellText = row.cells[0].innerText.trim().toLowerCase();
                            const searchLabel = label.toLowerCase();
                            if (cellText.includes(searchLabel)) {
                                return row.cells[1].innerText.trim();
                            }
                        }
                        return null;
                    };

                    const parseValue = (val) => {
                        if (!val) return { winners: '0', prize: 'N/A' };
                        const match = val.match(/^([\d,]+)\s*\((.+?)\)$/);
                        if (match) return { winners: match[1].replace(/,/g, ''), prize: match[2] };
                        return { winners: val.replace(/,/g, ''), prize: 'N/A' };
                    };

                    const p2 = getValue('2nd Prize');
                    const p3 = getValue('3rd Prize');
                    const p4 = getValue('4th Prize');

                    items.push({
                        game: gameName,
                        date: date,
                        combination: getValue('Winning Combination'),
                        jackpot_prize: getValue('Jackpot Prize'),
                        jackpot_winners: getValue('Jackpot Winner'),
                        winners_2nd: parseValue(p2).winners,
                        prize_2nd: parseValue(p2).prize,
                        winners_3rd: parseValue(p3).winners,
                        prize_3rd: parseValue(p3).prize,
                        winners_4th: parseValue(p4).winners,
                        prize_4th: parseValue(p4).prize
                    });
                });
                return items;
            }, target.name);

            allData.push(...resultsOnPage);
        }

        // 4. Save to file
        fs.writeFileSync('partial_winners_history.json', JSON.stringify(allData, null, 2));
        console.log(`✅ Done! Saved ${allData.length} records.`);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await browser.close();
    }
})();
