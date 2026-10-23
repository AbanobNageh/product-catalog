import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The version in package.json, read once at startup. Swagger and /healthz
 * show it, so a rollout shows which version each pod is running.
 * src/common and dist/common are both two levels below package.json.
 */
export const APP_VERSION = (
  JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
  ) as { version: string }
).version;
