/**
 * Quick project initialization
 */

import 'dotenv/config';
import { runSetup } from './setup-ink.js';

export async function runInit(): Promise<void> {
  console.log('\n🚀 Initializing nttp in current project...\n');
  await runSetup();
}
