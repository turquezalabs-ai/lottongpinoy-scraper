                    const resultsOnPage = await page.evaluate((gameName) => {
                        const items = [];
                        const tables = document.querySelectorAll('table.has-fixed-layout');

                        tables.forEach(table => {
                            const th = table.querySelector('thead th:nth-child(2)');
                            if (!th) return;
                            
                            const d = new Date(th.innerText.trim());
                            if (isNaN(d)) return;
                            const date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

                            // ROBUST HELPER: Case-insensitive matching
                            const getValue = (label) => {
                                const rows = table.querySelectorAll('tbody tr');
                                for (const row of rows) {
                                    const cellText = row.cells[0].innerText.trim().toLowerCase();
                                    const searchLabel = label.toLowerCase();
                                    
                                    // Use includes, but case-insensitive
                                    if (cellText.includes(searchLabel)) {
                                        return row.cells[1].innerText.trim();
                                    }
                                }
                                return null;
                            };

                            const parseValue = (val) => {
                                if (!val) return { winners: '0', prize: 'N/A' };
                                // Regex: Matches "15 (₱86,666.66)" OR "1,218 (₱985.22)"
                                const match = val.match(/^([\d,]+)\s*\((.+?)\)$/);
                                if (match) return { winners: match[1].replace(/,/g, ''), prize: match[2] };
                                
                                // Fallback for simple numbers like "0"
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
