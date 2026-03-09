        // --- HTML TABLE PARSER (No Time Mapping) ---
        const items = await page.evaluate(() => {
            const results = [];
            const tables = document.querySelectorAll('table.has-fixed-layout');

            tables.forEach(table => {
                const th = table.querySelector('thead th');
                if (!th) return;
                
                let gameName = th.innerText.trim();
                
                // 1. NORMALIZE NAMES FIRST (So the filter works for all aliases)
                if (gameName.includes('Swertres')) gameName = '3D Lotto';
                if (gameName.includes('EZ2')) gameName = '2D Lotto';

                // 2. FILTER STRATEGY: Only Real-Time scrape 2D and 3D.
                // Skip 4D, 6D, and Major games.
                if (!gameName.includes('2D Lotto') && !gameName.includes('3D Lotto')) {
                    return; // Skip this table
                }
                
                const ths = table.querySelectorAll('thead th');
                let dateStr = ths.length > 1 ? ths[1].innerText.trim() : '';
                let dateFormatted = dateStr;
                const dateParts = new Date(dateStr);
                if (!isNaN(dateParts)) dateFormatted = dateParts.toISOString().split('T')[0];

                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 2) return;

                    const col1 = cells[0].innerText.trim();
                    const col2 = cells[1].innerText.trim();

                    if (col1.includes('Prize') || col1.includes('Winner')) return;
                    const isNumbers = /(\d{1,2}[-\s]\d{1,2})/.test(col2);
                    if (!isNumbers) return;

                    let timeRaw = col1; 
                    let numbers = col2.replace(/\s/g, '-');

                    // Convert "2:00 PM" -> "2PM"
                    let normalizedTime = timeRaw.replace(':00', '').replace(' ', '');

                    const finalGame = `${gameName} ${normalizedTime}`;

                    results.push({
                        game: finalGame,
                        combination: numbers,
                        prize: '₱ TBA',
                        winners: 'TBA',
                        date: dateFormatted
                    });
                });
            });

            return items;
        });
