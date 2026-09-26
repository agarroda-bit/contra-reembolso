// Publica la carpeta dist/ en la rama gh-pages (GitHub Pages en modo "rama").
// Uso: npm run deploy   (hace el build antes). No reescribe historia: añade un commit encima.
import { execSync } from 'node:child_process';
import { cpSync, rmSync, existsSync, writeFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GH = `-c credential.helper= -c "credential.helper=!gh auth git-credential"`;
const sh = (cmd, cwd) => execSync(cmd, { stdio: 'inherit', cwd });
const out = (cmd, cwd) => execSync(cmd, { encoding: 'utf8', cwd }).trim();

if (!existsSync('dist/index.html')) throw new Error('Falta dist/: ejecuta npm run build');
const remote = out('git remote get-url origin');
const sha = out('git rev-parse --short HEAD');
const msg = out('git log -1 --format=%s').replace(/"/g, "'");
const dir = mkdtempSync(join(tmpdir(), 'cr-pages-'));
try {
  const exists = out(`git ${GH} ls-remote --heads ${remote} gh-pages`) !== '';
  if (exists) {
    sh(`git ${GH} clone -q --depth 1 --branch gh-pages ${remote} .`, dir);
  } else {
    sh(`git init -q -b gh-pages`, dir);
    sh(`git remote add origin ${remote}`, dir);
  }
  for (const f of readdirSync(dir)) if (f !== '.git') rmSync(join(dir, f), { recursive: true, force: true });
  cpSync('dist', dir, { recursive: true });
  writeFileSync(join(dir, '.nojekyll'), '');
  writeFileSync(join(dir, 'version.txt'), `${sha}\n`);
  sh(`git add -A`, dir);
  sh(`git -c user.name=agarroda-bit -c user.email=331665130+agarroda-bit@users.noreply.github.com commit -q --allow-empty -m "Publicar ${sha}: ${msg}"`, dir);
  sh(`git ${GH} push -q origin gh-pages`, dir);
  console.log(`Publicado ${sha} en gh-pages`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
