/**
 * Quick project initialization
 */

import chalk from 'chalk';
import { runSetup } from './setup.js';

export async function runInit(): Promise<void> {
  console.log(chalk.bold.cyan('\n🚀 Initializing nttp in current project...\n'));
  await runSetup();
}
