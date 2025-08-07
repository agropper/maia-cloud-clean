import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Test pandoc PDF processing
async function testPandocPDF() {
  try {
    console.log('🔄 Testing pandoc PDF processing...');
    
    // Check if pandoc is available
    const { stdout: pandocVersion } = await execAsync('pandoc --version');
    console.log('✅ Pandoc version:', pandocVersion.split('\n')[0]);
    
    // Test with a sample PDF (you'll need to provide one)
    const testPDFPath = process.argv[2];
    
    if (!testPDFPath) {
      console.log('❌ Please provide a PDF file path as argument');
      console.log('Usage: node test-pandoc.js /path/to/your/pdf');
      return;
    }
    
    if (!fs.existsSync(testPDFPath)) {
      console.log('❌ PDF file not found:', testPDFPath);
      return;
    }
    
    console.log('📄 Testing with PDF:', testPDFPath);
    
    // Create output file path
    const outputPath = path.join('/tmp', `test-output-${Date.now()}.md`);
    
    // Run pandoc command
    const pandocCommand = `pandoc "${testPDFPath}" -f pdf -t markdown -o "${outputPath}" --wrap=none`;
    console.log('🔄 Running command:', pandocCommand);
    
    const { stdout, stderr } = await execAsync(pandocCommand);
    
    if (stderr) {
      console.warn('⚠️ Pandoc stderr:', stderr);
    }
    
    if (stdout) {
      console.log('📤 Pandoc stdout:', stdout);
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

testPandocPDF(); 