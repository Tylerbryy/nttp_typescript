/**
 * Execute queries from CLI
 */

import 'dotenv/config';
import chalk from 'chalk';
import ora from 'ora';
import { NTTP } from '../NTTP.js';

export async function runQuery(
  text: string,
  options: { format: 'json' | 'table' }
): Promise<void> {
  const spinner = ora('Connecting to database...').start();

  try {
    // Load from .env
    const nttp = await NTTP.fromEnv();
    spinner.succeed('Connected');

    // Execute query
    spinner.start('Executing query...');
    const result = await nttp.query(text);
    spinner.succeed(
      `Query complete (${result.data.length} rows in ${result.executionTimeMs}ms)`
    );

    // Display results
    console.log(chalk.gray(`\nSQL: ${result.sql}`));
    console.log(
      chalk.gray(
        `Cache: ${result.cacheHit ? chalk.green('HIT') : chalk.yellow('MISS')}\n`
      )
    );

    if (options.format === 'json') {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.table(result.data);
    }

    await nttp.close();
  } catch (error) {
    spinner.fail('Query failed');
    const err = error as Error;
    console.error(chalk.red(`\n${err.message}\n`));

    if (!process.env.DATABASE_URL && !process.env.DATABASE_PATH) {
      console.log(chalk.yellow('💡 Tip: Run "npx nttp setup" first\n'));
    }

    process.exit(1);
  }
}
