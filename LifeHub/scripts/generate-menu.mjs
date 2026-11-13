// Reproducible generator: python3 scripts/generate-menu.py
import { spawnSync } from 'node:child_process';
const result = spawnSync('python3', ['scripts/generate-menu.py'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
