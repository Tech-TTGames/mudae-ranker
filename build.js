const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');
const { minify: minifyHtml } = require('html-minifier-terser');

const distDir = path.join(__dirname, 'dist');

// 1. Wipe out any old build data and start fresh
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 2. Recursive function to crawl directories and optimize contents
async function processDirectory(srcDir, destDir) {
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    const files = fs.readdirSync(srcDir);
    for (const file of files) {
        const srcPath = path.join(srcDir, file);
        const destPath = path.join(destDir, file);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
            await processDirectory(srcPath, destPath);
        } else if (file.endsWith('.js')) {
            // Keep third-party minified vendor tools safe
            if (file.endsWith('.min.js')) {
                fs.copyFileSync(srcPath, destPath);
            } else {
                const code = fs.readFileSync(srcPath, 'utf8');
                const minified = await minify(code);
                fs.writeFileSync(destPath, minified.code);
            }
        } else if (file.endsWith('.css')) {
            const css = fs.readFileSync(srcPath, 'utf8');
            const minified = new CleanCSS().minify(css);
            fs.writeFileSync(destPath, minified.styles);
        } else {
            // Pass through assets as-is (images, text, licenses, etc.)
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// 3. Orchestrate the build steps
async function main() {
    console.log('🚀 Compiling and crushing Mudae Ranker production assets...');

    // Target all of your core development directories
    const targetDirs = ['Apps', 'Controllers', 'Directives', 'DnD', 'Services', 'Styles'];
    for (const dir of targetDirs) {
        const src = path.join(__dirname, dir);
        if (fs.existsSync(src)) {
            await processDirectory(src, path.join(distDir, dir));
        }
    }

    // Process and compress the main entry markup file
    const htmlPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(htmlPath)) {
        const html = fs.readFileSync(htmlPath, 'utf8');
        const minifiedHtml = await minifyHtml(html, {
            collapseWhitespace: true,
            removeComments: true,
            minifyJS: true,
            minifyCSS: true
        });
        fs.writeFileSync(path.join(distDir, 'index.html'), minifiedHtml);
    }

    console.log('✨ Optimization complete! Production assets pushed safely to /dist');
}

main().catch(console.error);