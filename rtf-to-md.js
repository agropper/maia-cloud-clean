import fs from 'fs';

function convertRTFToMarkdown(inputPath, outputPath) {
    console.log('🚀 Starting RTF to Markdown conversion\n');
    
    // Read the cleaned RTF file
    const rtfContent = fs.readFileSync(inputPath, 'utf8');
    console.log(`📄 Input RTF file: ${rtfContent.length} characters`);
    
    // Helper: strip RTF control words to get visible text
    const stripRtfFormatting = (s) => s
        .replace(/\\'[0-9a-fA-F]{2}/g, '') // hex escapes
        .replace(/\\[a-z]+\d*/gi, '')     // control words like \fs24, \cf2, \f1
        .replace(/[{}]/g, '')
        .trim();
    
    // Helper: detect if line is a section heading
    function isSectionHead(line) {
        const visible = stripRtfFormatting(line).trim();
        if (!visible) return false;
        if (/:\s/.test(visible)) return false; // exclude metadata lines
        if (/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/.test(visible)) return false; // exclude date lines
        // Heuristics: larger font or bold typically used for heads
        const hasLargeFont = /\\fs3\d|\\fs[4-9]\d/.test(line);
        const isBold = /\\b(\b|\s)/.test(line);
        return hasLargeFont || isBold;
    }
    
    // Helper: detect if line is a date+provider line
    function isDateProviderLine(line) {
        const visible = stripRtfFormatting(line);
        return /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}.*(Mass General Brigham|CVS Health|Commonwealth of Massachusetts)/.test(visible);
    }
    
    // Helper: detect if line is an observation type (uses \cf2 formatting)
    function isObservationType(line) {
        return /\\cf2\s+[^\\]+$/.test(line) && !/:\s/.test(stripRtfFormatting(line));
    }
    
    // Helper: detect if line is metadata (contains colon)
    function isMetadata(line) {
        const visible = stripRtfFormatting(line);
        return /:\s/.test(visible);
    }
    
    // Helper: detect if line is a page separator
    function isPageSeparator(line) {
        return line.trim() === '<<< >>>';
    }
    
    const lines = rtfContent.split('\n');
    const mdLines = [];
    
    // Skip RTF header (first 10-15 lines)
    let startIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        if (stripRtfFormatting(lines[i]).startsWith('Adrian Gropper')) {
            startIndex = i;
            break;
        }
    }
    
    // First pass: collect patient info, sections, providers, and date ranges
    let patientName = '';
    let patientDOB = '';
    const sections = [];
    const sectionLineNumbers = [];
    const providers = new Set();
    const dateRanges = {};
    let markdownLineCount = 0; // Track actual markdown line count
    
    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        const visible = stripRtfFormatting(line);
        
        if (!visible) continue;
        
        // Extract patient name and DOB
        if (visible.startsWith('Adrian Gropper')) {
            patientName = visible;
        }
        if (visible.includes('Date of Birth:')) {
            patientDOB = visible;
        }
        
        // Collect sections and their line numbers
        if (isSectionHead(line)) {
            sections.push(visible);
            // Calculate line number in final markdown (summary block + processed content)
            const summaryBlockLines = 25; // Approximate lines in summary block
            const currentLine = markdownLineCount + summaryBlockLines + 1;
            sectionLineNumbers.push(currentLine);
        }
        
        // Track markdown lines we'll generate
        if (isSectionHead(line)) {
            markdownLineCount++; // Section header
        } else if (isDateProviderLine(line)) {
            markdownLineCount++; // Date+Provider line
            if (markdownLineCount > 1) markdownLineCount++; // Blank line before (except first)
        } else if (isObservationType(line)) {
            markdownLineCount++; // Observation type
        } else if (visible.trim() && !isPageSeparator(line)) {
            markdownLineCount++; // Other content lines
        }
        
        // Collect providers and date ranges
        if (isDateProviderLine(line)) {
            const providerMatch = visible.match(/(Mass General Brigham|CVS Health|Commonwealth of Massachusetts)/);
            if (providerMatch) {
                providers.add(providerMatch[1]);
            }
            
            const dateMatch = visible.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/);
            if (dateMatch) {
                const section = sections[sections.length - 1];
                if (section) {
                    if (!dateRanges[section]) {
                        dateRanges[section] = { first: dateMatch[0], last: dateMatch[0] };
                    } else {
                        dateRanges[section].last = dateMatch[0];
                    }
                }
            }
        }
    }
    
    // Generate summary block
    const summaryLines = [];
    summaryLines.push('<<< Contents Summary (added) >>>  ');
    summaryLines.push(`Patient Name: ${patientName}  `);
    summaryLines.push(`${patientDOB}  `);
    summaryLines.push('');
    
    // Add sections with actual line numbers and date ranges
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const lineNumber = sectionLineNumbers[i];
        const range = dateRanges[section] || { first: 'N/A', last: 'N/A' };
        summaryLines.push(`Line ${lineNumber} **${section}** ${range.first} to ${range.last}  `);
    }
    
    summaryLines.push('');
    summaryLines.push('Providers  ');
    for (const provider of Array.from(providers).sort()) {
        summaryLines.push(`        ${provider}  `);
    }
    summaryLines.push('');
    summaryLines.push('<<< End of added summary >>>  ');
    summaryLines.push('');
    
    // Add summary to markdown lines
    mdLines.push(...summaryLines);
    
    // Process content starting from patient name (second pass: convert to markdown)
    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        const visible = stripRtfFormatting(line);
        
        if (!visible) {
            mdLines.push(''); // preserve empty lines
            continue;
        }
        
        if (isPageSeparator(line)) {
            // Skip page separators - they're no longer relevant
            continue;
        }
        
        if (isSectionHead(line)) {
            // Convert section heading to Markdown H2
            mdLines.push(`## ${visible}`);
            continue;
        }
        
        if (isDateProviderLine(line)) {
            // Convert date+provider line to regular text (not bold)
            // Add blank line before Date+Provider to start new paragraph (except for first one)
            if (mdLines.length > 0 && mdLines[mdLines.length - 1].trim() !== '') {
                mdLines.push('');
            }
            mdLines.push(visible);
            // Don't add blank line after - keep Date+Provider and Observation Type in same paragraph
            continue;
        }
        
        if (isObservationType(line)) {
            // Convert observation type to bold text
            mdLines.push(`**${visible}**`);
            // Don't add blank line - keep Observation Type and metadata in same paragraph
            continue;
        }
        
        // For metadata lines, add two spaces to force line breaks
        if (/^(Author:|Category:|Created:|Status:)/.test(visible.trim())) {
            mdLines.push(visible.trim() + '  ');
            // Add blank line after Status: Current to separate observations
            if (visible.trim().startsWith('Status: Current')) {
                mdLines.push('');
            }
            continue;
        }
        
        // For any other line with a colon (metadata), add two spaces to force line breaks
        if (/:\s/.test(visible.trim()) && !isDateProviderLine(line) && !isObservationType(line)) {
            mdLines.push(visible.trim() + '  ');
            continue;
        }
        
        // For ANY line that is not a date+provider, section heading, or observation type
        // Add line breaks to all other lines
        if (!isDateProviderLine(line) && !isObservationType(line) && !isSectionHead(line) && 
            visible.trim() && !visible.trim().startsWith('##')) {
            mdLines.push(visible.trim() + '  ');
            continue;
        }
        
        // For ANY line that appears after a line that already has a line break
        // This ensures all metadata lines get proper formatting
        if (!isDateProviderLine(line) && !isObservationType(line) && !isSectionHead(line) && 
            visible.trim() && !visible.trim().startsWith('##') && 
            mdLines.length > 0 && 
            mdLines[mdLines.length - 1].endsWith('  ')) {
            mdLines.push(visible.trim() + '  ');
            continue;
        }
        
        // For all other lines, preserve as-is
        if (visible.trim()) {
            mdLines.push(visible.trim());
        }
    }
    
    // Join lines and clean up
    let markdown = mdLines.join('\n');
    
    // Clean up excessive blank lines but preserve structure
    markdown = markdown.replace(/\n{4,}/g, '\n\n\n');
    
    // Add spacing after each observation block (after Status: Current)
    markdown = markdown.replace(/(Status: Current)\n/g, '$1\n\n');
    
    // Remove the extra blank line between observation type and metadata
    markdown = markdown.replace(/(\*\*[^*]+\*\*)\n\n(Author:|Category:|Created:|Status:)/g, '$1\n$2');
    
    // Write output
    fs.writeFileSync(outputPath, markdown, 'utf8');
    
    console.log(`✅ Markdown conversion complete`);
    console.log(`📄 Output: ${outputPath}`);
    console.log(`📊 Lines processed: ${lines.length - startIndex}`);
    
    return {
        inputLines: lines.length,
        outputLines: markdown.split('\n').length,
        startIndex
    };
}

// Get command line arguments
const args = process.argv.slice(2);
const inputFile = args[0] || '/Users/adrian/Desktop/ag-test-STEP2-CLEANED.rtf';
const outputFile = args[1] || '/Users/adrian/Desktop/ag-test-CONVERTED.md';

console.log(`🚀 Starting RTF to Markdown conversion`);
console.log(`📄 Input: ${inputFile}`);
console.log(`📄 Output: ${outputFile}`);

try {
    const result = convertRTFToMarkdown(inputFile, outputFile);
    console.log('\n— CONVERSION SUMMARY —');
    console.log(`Input lines: ${result.inputLines}`);
    console.log(`Output lines: ${result.outputLines}`);
    console.log(`Start index: ${result.startIndex}`);
    console.log(`Output: ${outputFile}`);
} catch (err) {
    console.error('❌ Error:', err.message);
}
