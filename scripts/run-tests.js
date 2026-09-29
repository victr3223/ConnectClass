import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
const tests = readdirSync("test").filter((name)=>name.endsWith(".test.js")).map((name)=>`test/${name}`);
const result = spawnSync(process.execPath,["--test","--test-concurrency=1",...(process.argv.includes("--coverage")?["--experimental-test-coverage"]:[]),...tests],{stdio:"inherit",windowsHide:true});
process.exitCode = result.status ?? 1;
