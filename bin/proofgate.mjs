#!/usr/bin/env node
import { runCheck } from '../src/cli.mjs';

try {
  process.exitCode = await runCheck(process.argv.slice(2));
} catch (e) {
  console.error(`proofgate 异常退出: ${e.message}`);
  process.exitCode = 2;
}
