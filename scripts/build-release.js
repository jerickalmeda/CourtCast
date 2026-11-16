const fs = require('node:fs/promises');
const path = require('node:path');
const { minify } = require('terser');

async function buildRelease() {
  const projectRoot = path.resolve(__dirname, '..');
  const outputDirectory = path.join(projectRoot, 'dist');
  const packageJson = require(path.join(projectRoot, 'package.json'));
  const htmlPath = path.join(projectRoot, 'index.html');
  const source = await fs.readFile(path.join(projectRoot, 'app.js'), 'utf8');
  const html = await fs.readFile(htmlPath, 'utf8');
  const result = await minify(source, {
    compress: true,
    mangle: true,
    format: { comments: false },
  });

  if (!result.code) throw new Error('JavaScript minification produced no output.');

  const releaseHtml = html
    .replace(/href="style\.css(?:\?[^"]*)?"/, `href="style.css?v=${packageJson.version}"`)
    .replace(/src="app\.js(?:\?[^"]*)?"/, `src="app.min.js?v=${packageJson.version}"`);

  if (releaseHtml === html || /src="app\.js/.test(releaseHtml)) {
    throw new Error('Could not update the application asset references for the release build.');
  }

  await fs.mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDirectory, 'index.html'), releaseHtml),
    fs.writeFile(path.join(outputDirectory, 'app.min.js'), result.code),
    fs.copyFile(path.join(projectRoot, 'style.css'), path.join(outputDirectory, 'style.css')),
    fs.copyFile(path.join(projectRoot, 'Official NBA Horn SFX.mp3'), path.join(outputDirectory, 'Official NBA Horn SFX.mp3')),
  ]);
}

buildRelease().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});