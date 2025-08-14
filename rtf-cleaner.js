import fs from 'fs';

function cleanRTF(inputPath, outputPathStep2) {
    console.log('🚀 Starting RTF cleaning process - Step 1 & 2 (provider markers only)\n');
    
    // Read input
    const originalContent = fs.readFileSync(inputPath, 'utf8');
    let content = originalContent;
    const originalLines = originalContent.split('\n');
    console.log(`📄 Input file: ${originalLines.length} lines, ${originalContent.length} characters`);

    // Helper: strip common RTF control words to get visible text
    const stripRtfFormatting = (s) => s
        .replace(/\\'[0-9a-fA-F]{2}/g, '') // hex escapes
        .replace(/\\[a-z]+\d*/gi, '')     // control words like \fs24, \cf2, \f1
        .replace(/[{}]/g, '')
        .trim();

    // -------------------------------
    // STEP 1A: Fix malformed unicode 'E'
    // -------------------------------
    const malformedE1 = /\\uc0\\u63333\s*/g;
    const malformedE2 = /\\u63333\s*/g;
    const eFixCount = ((content.match(malformedE1) || []).length) + ((content.match(malformedE2) || []).length);
    content = content.replace(malformedE1, 'E');
    content = content.replace(malformedE2, 'E');
    console.log(`✅ Unicode 'E' fixes applied: ${eFixCount}`);

    // -------------------------------
    // STEP 1B: Detect Constant Head (patient-dependent) and insert page separators (<<< >>>)
    // -------------------------------
    const lines = content.split('\n');

    // Detect patient name and DOB near the top
    let patientName = '';
    let dobLineFull = '';
    let isCombinedFormat = false;
    
    for (let i = 0; i < lines.length; i++) {
        const norm = stripRtfFormatting(lines[i]);
        // Check for combined format: "A X year old male/female"
        if (/^A \d+ year old (male|female)/.test(norm)) {
            patientName = norm;
            dobLineFull = norm; // Use same line for both
            isCombinedFormat = true;
            break;
        }
        // Check for traditional format: "Date of Birth:"
        if (norm.startsWith('Date of Birth:')) {
            let p = i - 1;
            while (p >= 0 && stripRtfFormatting(lines[p]) === '') p--;
            if (p >= 0) patientName = stripRtfFormatting(lines[p]);
            dobLineFull = norm;
            isCombinedFormat = false;
            break;
        }
    }
    
    if (!patientName || !dobLineFull) throw new Error('Could not detect Constant Head (patient name and DOB)');
    console.log(`👤 Detected patient name: ${patientName}`);
    console.log(`📅 Detected DOB line: ${dobLineFull}`);
    console.log(`📋 Format type: ${isCombinedFormat ? 'Combined' : 'Traditional'}`);

    const isDOBLine = (line) => {
        if (isCombinedFormat) {
            return /^A \d+ year old (male|female)/.test(stripRtfFormatting(line));
        }
        return stripRtfFormatting(line).startsWith('Date of Birth:');
    };
    const isNameLine = (line) => stripRtfFormatting(line) === patientName;

    // Find page heads: name line followed by DOB line (or combined line)
    const pageHeadIndices = [];
    for (let i = 0; i < lines.length; i++) {
        if (isNameLine(lines[i])) {
            if (isCombinedFormat) {
                // For combined format (like "A 73 year old male"), this is both name and DOB
                pageHeadIndices.push(i);
            } else {
                // For traditional format, look for following DOB line
                let j = i + 1;
                while (j < lines.length && stripRtfFormatting(lines[j]) === '') j++;
                if (j < lines.length && isDOBLine(lines[j])) pageHeadIndices.push(i);
            }
        }
    }
    
    if (pageHeadIndices.length === 0) {
        console.log(`⚠️ No page heads detected - continuing without page separation`);
    } else {
        console.log(`✅ Detected page heads: ${pageHeadIndices.length}`);
    }

    const separatorPage = '<<< >>>';
    const pageHeadSet = new Set(pageHeadIndices);
    const rebuilt = [];
    let pageCounter = 0;
    const rawFmtOnlyRegex = /^\s*(\\[a-z]+\d*\s*)+\\?\s*$/;

    // Only process page separators if page heads were detected
    if (pageHeadIndices.length > 0) {
        for (let i = 0; i < lines.length; i++) {
            if (pageHeadSet.has(i)) {
                if (pageCounter > 0) {
                    while (rebuilt.length > 0) {
                        const prev = rebuilt[rebuilt.length - 1];
                        if (prev.trim() === '') { rebuilt.pop(); continue; }
                        const stripped = stripRtfFormatting(prev);
                        if (stripped === '' || stripped === 'Health' || rawFmtOnlyRegex.test(prev)) { rebuilt.pop(); continue; }
                        break;
                    }
                    pageCounter++;
                    rebuilt.push(separatorPage);
                    // skip name + following DOB for subsequent pages
                    let j = i + 1; while (j < lines.length && stripRtfFormatting(lines[j]) === '') j++;
                    if (j < lines.length && isDOBLine(lines[j])) { i = j; continue; }
                    continue;
                } else {
                    pageCounter++;
                    rebuilt.push(lines[i]);
                    continue;
                }
            }
            rebuilt.push(lines[i]);
        }
        content = rebuilt.join('\n');
        console.log(`✅ Page separators inserted: ${Math.max(0, pageCounter - 1)}`);
    } else {
        // No page heads detected, use original content
        content = lines.join('\n');
        console.log(`ℹ️ No page separators inserted - using original content structure`);
    }

    // STEP 1C: Remove header/footer artifacts
    let cleanedLines = [];
    let removedCount = 0;
    const footerLinePatterns = [
        /Continued on Page \d+/, /Page \d+ of 125/,
        /^This summary displays certain health information/,
        /^accurately reflect your medical history\./,
        /^accurately reflect your medical history/,
        /^professional medical judgment\./,
        /^professional medical judgment/,
        /^Please consult with your healthcare provider/,
    ];
    for (const line of content.split('\n')) {
        if (/Continued from Page \d+/.test(line)) { removedCount++; continue; }
        let isFooter = false; for (const pat of footerLinePatterns) { if (pat.test(line)) { isFooter = true; break; } }
        if (isFooter) { removedCount++; continue; }
        cleanedLines.push(line);
    }
    // isolate page separator lines (only if page heads were detected)
    if (pageHeadIndices.length > 0) {
        const isolated = [];
        const lines2 = cleanedLines.slice();
        for (let idx = 0; idx < lines2.length; idx++) {
            const line = lines2[idx];
            if (line.trim() === separatorPage) {
                while (isolated.length > 0) {
                    const prev = isolated[isolated.length - 1];
                    if (prev.trim() === '') { isolated.pop(); continue; }
                    const stripped = stripRtfFormatting(prev);
                    if (stripped === '' || stripped === 'Health' || rawFmtOnlyRegex.test(prev)) { isolated.pop(); continue; }
                    break;
                }
                isolated.push(separatorPage);
            } else {
                isolated.push(line);
            }
        }
        content = isolated.join('\n');
    }
    console.log(`✅ Header/footer lines removed: ${removedCount}`);

    // -------------------------------
    // STEP 2 (revised): Observation demarcations and date markers
    // - Insert `<<Obs>>` to demarcate each observation (immediately around locations)
    // - Insert `<<Date>>` immediately before each location line
    // - For top-of-section lines that contain bunched dates followed by an inline provider,
    //   split the line so that dates remain on the previous line, then add `<<Date>>`, `<<Obs>>`, and the provider on the following line
    // - Remove legacy marker lines before re-inserting
    // -------------------------------
    console.log('🔧 STEP 2 (revised): Inserting <<Obs>> and <<Date>> markers ...');

    // Provider/location identification heuristics
    const providerChunkRegex = /\\cf(?<color>\d+)\s+([^\\]+)\\/; // capture first provider-like chunk
    const providerLineRegex = /^\\cf(?<color>\d+)\s+([^\\]+)\\$/; // entire line is provider chunk
    const locationKeywordRegex = /(Brigham|Mass\s+General|Hospital|Health|Medical|Center|Clinic|Partners|Primary\s+Care|MGH|BWH|Beth\s+Israel|Lahey|Tufts|Mount\s+Sinai|UCSF|Mayo|Cleveland\s+Clinic)/i;
    const nonProviderHeadRegex = /(Date of Birth|Clinical Notes|Telephone Encounter|Progress Notes|Allergies|Immunizations|Medications|Lab Results|Health\b|Past Medical History|Family History|Social History)/i;

    const monthRe = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
    const dateInlineRegex = new RegExp(`${monthRe}\\s+\\d{1,2},\\s+\\d{4}`);

    function isLikelyProviderFromChunk(line) {
        const m = providerChunkRegex.exec(line);
        if (!m) return false;
        const color = m.groups && m.groups.color ? m.groups.color : null;
        const raw = m[2] || '';
        const text = stripRtfFormatting(raw);
        if (!text) return false;
        if (nonProviderHeadRegex.test(text)) return false;
        // Prefer color 3 for providers in this document
        if (color && color !== '3') return false;
        if (text.includes(':')) return false; // exclude metadata lines
        return locationKeywordRegex.test(text);
    }

    function isWholeLineProvider(line) {
        const m = providerLineRegex.exec(line);
        if (!m) return false;
        const color = m.groups && m.groups.color ? m.groups.color : null;
        const raw = m[2] || '';
        const text = stripRtfFormatting(raw);
        if (!text) return false;
        if (nonProviderHeadRegex.test(text)) return false;
        if (color && color !== '3') return false;
        if (text.includes(':')) return false;
        return locationKeywordRegex.test(text);
    }

    // Start with lines and drop any prior marker-only lines we may have inserted earlier
    let linesStep1 = content.split('\n');
    linesStep1 = linesStep1.filter((ln) => !/^<<(Date|Obs)>>$/.test(ln.trim()) && ln.trim() !== '<<>>');

    const outStep2 = [];
    let obsMarkersInserted = 0;
    let dateMarkersInserted = 0;
    let inlineSplits = 0;

    for (let idx = 0; idx < linesStep1.length; idx++) {
        const ln = linesStep1[idx];
        const visible = stripRtfFormatting(ln);

        const isWholeProvider = isWholeLineProvider(ln);
        const hasInlineProvider = isLikelyProviderFromChunk(ln);
        const hasDate = dateInlineRegex.test(visible);

        if (isWholeProvider) {
            // Normal case: provider/location occupies the whole line
            if (outStep2[outStep2.length - 1] !== '<<Obs>>') {
                outStep2.push('<<Obs>>');
                obsMarkersInserted++;
            }
            outStep2.push('<<Date>>');
            dateMarkersInserted++;
            outStep2.push(ln);
            continue;
        }

        if (hasInlineProvider && hasDate) {
            // Top-of-section bunched dates line: split into dates then markers then provider
            const match = providerChunkRegex.exec(ln);
            if (match && typeof match.index === 'number') {
                const splitIndex = match.index;
                const datesPart = ln.slice(0, splitIndex);
                const providerPart = ln.slice(splitIndex);
                outStep2.push(datesPart.trimEnd());
                outStep2.push('<<Date>>');
                dateMarkersInserted++;
                outStep2.push('<<Obs>>');
                obsMarkersInserted++;
                outStep2.push(providerPart);
                inlineSplits++;
                continue;
            }
        }

        outStep2.push(ln);
    }

    content = outStep2.join('\n')
        // Normalize any stray legacy generic markers if any survived elsewhere
        .replace(/^<<>>$/gm, '<<Obs>>');

    console.log(`✅ Markers inserted — <<Obs>>: ${obsMarkersInserted}, <<Date>>: ${dateMarkersInserted}, inline splits: ${inlineSplits}`);

    // -------------------------------
    // STEP 3: Move dates to precede corresponding <<Date>> markers
    // - Detect top-of-section date list lines (contain 2 or more dates, exclude metadata with colons)
    // - Remove those lines and queue the dates in order, preserving their RTF body formatting prefix (e.g., \fs20 )
    // - For each following <<Date>> marker, insert the next date with its captured prefix immediately before it
    // -------------------------------
    console.log('🔧 STEP 3: Moving dates to precede <<Date>> markers ...');

    const monthToken = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
    const dateTokenGlobal = new RegExp(`${monthToken}\\s+\\d{1,2},\\s+\\d{4}`, 'g');
    const dateTokenSingle = new RegExp(`${monthToken}\\s+\\d{1,2},\\s+\\d{4}`);

    // Extract leading RTF control words prefix (e.g., "\\fs20 \\cf2 ")
    function extractRtfPrefix(line) {
        const m = line.match(/^\s*((?:\\'[0-9a-fA-F]{2}|\\[a-zA-Z]+-?\d*|\{\}|[{}])(?:\s+)*)+/);
        if (m && m[0]) {
            return m[0].replace(/[{}]/g, '');
        }
        // Fallback: body text formatting
        return '\\fs20 ';
    }

    const linesStep2 = content.split('\n');
    const outStep3 = [];
    let pendingDates = []; // array of { text, prefix }
    let dateListLinesRemoved = 0;
    let datesInsertedBeforeMarkers = 0;

    const isMarker = (s) => /^(<<Date>>|<<Obs>>|<<< >>>)$/.test(s.trim());

    for (let i = 0; i < linesStep2.length; i++) {
        const line = linesStep2[i];
        const visible = stripRtfFormatting(line);

        // Identify a dates list line: 2 or more date tokens, no colon metadata, not a marker
        if (!isMarker(line) && !/:\s/.test(visible) && dateTokenSingle.test(visible)) {
            const allDates = visible.match(dateTokenGlobal) || [];
            if (allDates.length >= 2) {
                const prefix = extractRtfPrefix(line);
                for (const d of allDates) pendingDates.push({ text: d, prefix });
                dateListLinesRemoved++;
                continue; // drop this line (we are moving these dates)
            }
        }

        // When encountering a <<Date>> marker and we have queued dates, insert next date before it
        if (line.trim() === '<<Date>>' && pendingDates.length > 0) {
            const next = pendingDates.shift();
            outStep3.push(`${next.prefix}${next.text}`);
            datesInsertedBeforeMarkers++;
            outStep3.push(line);
            continue;
        }

        // Reset date queue conservatively at page boundaries
        if (line.trim() === '<<< >>>') {
            pendingDates = [];
            outStep3.push(line);
            continue;
        }

        outStep3.push(line);
    }

    content = outStep3.join('\n');

    console.log(`✅ Dates moved — lists removed: ${dateListLinesRemoved}, dates inserted: ${datesInsertedBeforeMarkers}`);

    // -------------------------------
    // STEP 4: Remove markers and leave date followed by provider
    // - Handle patterns:
    //   A) <date line>, <<Date>>, [optional <<Obs>>], <provider line>
    //   B) <<Obs>>, <date line>, <<Date>>, <provider line>
    // - Output should be: <date line> then <provider line>
    // - Remove any remaining standalone <<Date>>/<<Obs>> marker lines
    // -------------------------------
    console.log('🔧 STEP 4: Removing markers and pairing date with provider ...');

    const linesStep3 = content.split('\n');
    const outStep4 = [];

    function isDateLine(line) {
        const text = stripRtfFormatting(line);
        return dateTokenSingle.test(text) && !/:\s/.test(text);
    }

    for (let i = 0; i < linesStep3.length; i++) {
        const a = linesStep3[i] || '';
        const b = linesStep3[i + 1] || '';
        const c = linesStep3[i + 2] || '';
        const d = linesStep3[i + 3] || '';

        // Pattern A: date, <<Date>>, [<<Obs>>], provider
        if (isDateLine(a) && b.trim() === '<<Date>>') {
            if (c.trim() === '<<Obs>>' && isWholeLineProvider(d)) {
                outStep4.push(a);
                outStep4.push(d);
                i += 3;
                continue;
            }
            if (isWholeLineProvider(c)) {
                outStep4.push(a);
                outStep4.push(c);
                i += 2;
                continue;
            }
        }

        // Pattern C (variant of A): date, <<Obs>>, <<Date>>, provider
        if (isDateLine(a) && b.trim() === '<<Obs>>' && c.trim() === '<<Date>>' && isWholeLineProvider(d)) {
            outStep4.push(a);
            outStep4.push(d);
            i += 3;
            continue;
        }

        // Pattern B: <<Obs>>, date, <<Date>>, provider
        if (a.trim() === '<<Obs>>' && isDateLine(b) && c.trim() === '<<Date>>' && isWholeLineProvider(d)) {
            outStep4.push(b);
            outStep4.push(d);
            i += 3;
            continue;
        }

        // Drop standalone markers
        if (a.trim() === '<<Date>>' || a.trim() === '<<Obs>>') {
            continue;
        }

        outStep4.push(a);
    }

    // Remove any stray marker-only lines that might persist
    content = outStep4.join('\n').replace(/^<<(Date|Obs)>>$/gm, '');

    // Ensure final closing brace exists
    if (!content.trim().endsWith('}')) content = content.trimEnd() + '\n}';

    // Write STEP 2 output
    fs.writeFileSync(outputPathStep2, content, 'utf8');

    // Report
    const finalLines = content.split('\n').length;
    const finalChars = content.length;
    console.log(`📄 Final (Step 1 + provider markers) lines: ${finalLines}, chars: ${finalChars}`);

    // -------------------------------
    // STEP 5: Merge date + provider on one line and bullet the observation type
    // - Combine: <date line> + <provider line> -> "<date> <provider>" on one line
    // - Add an asterisk "* " at the start of the next line (observation type), after any RTF control prefix
    // - Do not bullet metadata lines (lines containing a colon), section heads, or providers
    // -------------------------------
    console.log('🔧 STEP 5: Merging date+provider and adding bullets ...');

    const linesStep4 = content.split('\n');
    const outStep5 = [];

    function insertBulletAfterRtfPrefix(line) {
        const visible = stripRtfFormatting(line);
        if (/^(•|\*)\s/.test(visible)) return line; // already bulleted
        const m = line.match(/^((?:\\'[0-9a-fA-F]{2}|\\[a-zA-Z]+-?\d*|\{\}|[{}])(?:\s+)*)+/);
        if (m && m[0]) {
            const prefix = m[0].replace(/[{}]/g, '');
            const rest = line.slice(m[0].length);
            return `${prefix}* ${rest}`;
        }
        return `* ${line}`;
    }

    for (let i = 0; i < linesStep4.length; i++) {
        const dateLine = linesStep4[i] || '';
        const providerLine = linesStep4[i + 1] || '';

        if (isDateLine(dateLine) && isWholeLineProvider(providerLine)) {
            const dateTextMatch = (stripRtfFormatting(dateLine).match(dateTokenSingle) || [])[0] || stripRtfFormatting(dateLine);
            const datePrefix = extractRtfPrefix(dateLine);
            const merged = `${datePrefix}${dateTextMatch} ${providerLine.trimStart()}`;
            outStep5.push(merged);
            i += 1; // consumed provider line as well

            // Bullet the next non-empty, non-separator, non-provider, non-date, non-metadata line
            const nextIdx = i + 1;
            if (nextIdx < linesStep4.length) {
                const nextLine = linesStep4[nextIdx];
                const vis = stripRtfFormatting(nextLine);
                const isMetadata = /:\s/.test(vis);
                const isHead = /^(Clinical Notes|Allergies|Immunizations|Medications|Lab Results|Past Medical History|Family History|Social History)\b/.test(vis);
                if (vis.trim() && nextLine.trim() !== '<<< >>>' && !isWholeLineProvider(nextLine) && !isDateLine(nextLine) && !isMetadata && !isHead) {
                    // Don't add asterisk - let Markdown converter handle bold formatting
                    outStep5.push(nextLine);
                    i += 1;
                }
            }
            continue;
        }

        outStep5.push(dateLine);
    }

    content = outStep5.join('\n');

    // -------------------------------
    // STEP 6: Deduplicate section headings across pages
    // - Keep '<<< >>>' separators
    // - Detect any section heading (large font or bold, no colon, not a date)
    // - Keep only the first occurrence when a heading appears; drop repeats until the heading changes
    // -------------------------------
    console.log('🔧 STEP 6: Deduplicating section headings ...');

    function isSectionHead(line) {
        const visible = stripRtfFormatting(line).trim();
        if (!visible) return false;
        if (/:\s/.test(visible)) return false; // exclude metadata lines
        if (dateTokenSingle.test(visible)) return false; // exclude date lines
        // Heuristics: larger font or bold typically used for heads
        const hasLargeFont = /\\fs3\d|\\fs[4-9]\d/.test(line);
        const isBold = /\\b(\b|\s)/.test(line);
        // Avoid provider lines
        if (isWholeLineProvider(line)) return false;
        return hasLargeFont || isBold;
    }

    const linesStep5 = content.split('\n');
    const outStep6 = [];
    let lastHead = '';

    for (let i = 0; i < linesStep5.length; i++) {
        const ln = linesStep5[i];
        if (ln.trim() === '<<< >>>') {
            outStep6.push(ln);
            continue;
        }
        if (isSectionHead(ln)) {
            const headText = stripRtfFormatting(ln).trim();
            if (headText.toLowerCase() === lastHead.toLowerCase()) {
                continue; // duplicate; skip
            } else {
                lastHead = headText;
                outStep6.push(ln);
                continue;
            }
        }
        outStep6.push(ln);
    }

    content = outStep6.join('\n');

    // -------------------------------
    // STEP 7: Remove page separators and clean up whitespace
    // - Remove all "<<< >>>" lines
    // - Clean up excessive blank lines around where separators were
    // - Prepare for clean Markdown conversion
    // -------------------------------
    console.log('🔧 STEP 7: Removing page separators and cleaning whitespace ...');

    const linesStep6 = content.split('\n');
    const outStep7 = [];
    let removedSeparators = 0;

    for (let i = 0; i < linesStep6.length; i++) {
        const line = linesStep6[i];
        
        if (line.trim() === '<<< >>>') {
            removedSeparators++;
            continue; // skip separator line
        }
        
        // Skip excessive blank lines around where separators were
        if (line.trim() === '') {
            const prev = outStep7[outStep7.length - 1];
            if (prev && prev.trim() === '') {
                continue; // skip consecutive blank lines
            }
        }
        
        outStep7.push(line);
    }

    content = outStep7.join('\n');

    console.log(`✅ Page separators removed: ${removedSeparators}`);

    // -------------------------------
    // STEP 8: Remove trailing backslashes from lines
    // - Clean up RTF control characters that appear at line endings
    // - Especially important for section headings that become Markdown headers
    // -------------------------------
    console.log('🔧 STEP 8: Removing trailing backslashes ...');

    const linesStep7 = content.split('\n');
    const outStep8 = [];
    let backslashesRemoved = 0;

    for (let i = 0; i < linesStep7.length; i++) {
        let line = linesStep7[i];
        const original = line;
        
        // Remove trailing backslashes (common RTF line endings)
        line = line.replace(/\\+$/, '');
        
        if (line !== original) {
            backslashesRemoved++;
        }
        
        outStep8.push(line);
    }

    content = outStep8.join('\n');

    console.log(`✅ Trailing backslashes removed: ${backslashesRemoved}`);

    // -------------------------------
    // STEP 9: Ensure metadata lines are properly separated
    // - Fix metadata lines that might be running together
    // - Ensure Author, Category, Created, Status each appear on separate lines
    // -------------------------------
    console.log('🔧 STEP 9: Ensuring metadata line separation ...');

    const linesStep8 = content.split('\n');
    const outStep9 = [];
    let metadataLinesFixed = 0;

    for (let i = 0; i < linesStep8.length; i++) {
        let line = linesStep8[i];
        const visible = stripRtfFormatting(line);
        
        // Check if line contains multiple metadata fields
        if (/Author:|Category:|Created:|Status:/.test(visible)) {
            // Split if multiple metadata fields are on one line
            const parts = visible.split(/(Author:|Category:|Created:|Status:)/);
            if (parts.length > 2) {
                // Reconstruct with proper line breaks
                let reconstructed = '';
                for (let j = 0; j < parts.length; j++) {
                    if (parts[j].trim()) {
                        if (j > 0 && /^(Author:|Category:|Created:|Status:)/.test(parts[j])) {
                            reconstructed += '\n' + parts[j];
                        } else {
                            reconstructed += parts[j];
                        }
                    }
                }
                if (reconstructed !== visible) {
                    metadataLinesFixed++;
                    // Split the reconstructed line and add each part
                    const splitParts = reconstructed.split('\n');
                    for (const part of splitParts) {
                        if (part.trim()) {
                            outStep9.push(part.trim());
                        }
                    }
                    continue;
                }
            }
        }
        
        // Also ensure single metadata fields are properly formatted
        if (/^(Author:|Category:|Created:|Status:)/.test(visible)) {
            outStep9.push(line);
            continue;
        }
        
        outStep9.push(line);
    }

    content = outStep9.join('\n');

    console.log(`✅ Metadata line separation fixed: ${metadataLinesFixed}`);

    // Persist final output after Step 9
    fs.writeFileSync(outputPathStep2, content, 'utf8');

    return {
        patientName,
        dobLineFull,
        pagesDetected: pageHeadIndices.length,
        separatorsInserted: Math.max(0, pageCounter - 1),
        eFixCount,
        removedCount,
        insertedMarkers: obsMarkersInserted + dateMarkersInserted + inlineSplits,
    };
}

// Get command line arguments
const args = process.argv.slice(2);
const inputFile = args[0] || '/Users/adrian/Desktop/ag-test.rtf';
const outputFile = args[1] || inputFile.replace('.rtf', '-STEP2-CLEANED.rtf');

console.log(`🚀 Starting RTF cleaning process`);
console.log(`📄 Input: ${inputFile}`);
console.log(`📄 Output: ${outputFile}`);

try {
    const res = cleanRTF(inputFile, outputFile);
    console.log('\n— STEP 1 + provider markers SUMMARY —');
    console.log(`Patient: ${res.patientName}`);
    console.log(`DOB: ${res.dobLineFull}`);
    console.log(`Pages detected: ${res.pagesDetected}`);
    console.log(`Separators inserted: ${res.separatorsInserted}`);
    console.log(`Unicode 'E' fixed: ${res.eFixCount}`);
    console.log(`Header/footer lines removed: ${res.removedCount}`);
    console.log(`Provider markers inserted: ${res.insertedMarkers}`);
    console.log(`Output: ${outputFile}`);
} catch (err) {
    console.error('❌ Error:', err.message);
}
