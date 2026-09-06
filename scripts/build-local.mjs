import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const major=Number(process.versions.node.split('.')[0]);
if(major<24){console.error('Bitte Node.js 24 oder neuer installieren.');process.exit(1);}
const result=spawnSync(process.execPath,['node_modules/vinext/dist/cli.js','build'],{
 cwd:root,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'},
});
if(result.error){console.error(result.error.message);process.exit(1);}process.exit(result.status??1);
