import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Test pdftotext PDF processing
async function testPdfToText() {
  try {
    console.log('🔄 Testing pdftotext PDF processing...');
    
    // Check if pdftotext is available
    const { stdout: pdftotextVersion } = await execAsync('pdftotext -v');
    console.log('✅ pdftotext version:', pdftotextVersion.split('\n')[0]);
    
    // Test with a sample PDF (you'll need to provide one)
    const testPDFPath = process.argv[2];
    
    if (!testPDFPath) {
      console.log('❌ Please provide a PDF file path as argument');
      console.log('Usage: node test-pdftotext.js /path/to/your/pdf');
      return;
    }
    
    if (!fs.existsSync(testPDFPath)) {
      console.log('❌ PDF file not found:', testPDFPath);
      return;
    }
    
    console.log('📄 Testing with PDF:', testPDFPath);
    
    // Create output file path
    const outputPath = path.join('/tmp', `test-output-${Date.now()}.txt`);
    
    // Run pdftotext command
    const pdftotextCommand = `pdftotext "${testPDFPath}" "${outputPath}"`;
    console.log('🔄 Running command:', pdftotextCommand);
    
    const { stdout, stderr } = await execAsync(pdftotextCommand);
    
    if (stderr) {
      console.warn('⚠️ pdftotext stderr:', stderr);
    }
    
    if (stdout) {
      console.log('📤 pdftotext stdout:', stdout);
    }
    
    // Check if output file was created
    if (fs.existsSync(outputPath)) {
      const content = fs.readFileSync(outputPath, 'utf8');
      console.log('✅ Success! Output file created:', outputPath);
      console.log('📊 Content length:', content.length);
      console.log('📄 First 500 characters:');
      console.log(content.substring(0, 500));
      
      // Clean up
      fs.unlinkSync(outputPath);
    } else {
      console.log('❌ Output file not created');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testPdfToText();
