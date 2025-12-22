/**
 * Beautiful CLI logger with colors and formatting.
 * Inspired by Next.js and Vercel's terminal output.
 */

import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import gradient from 'gradient-string';

const coolGradient = gradient(['#00F5FF', '#00D4FF', '#00B4FF']);
const successGradient = gradient(['#00ff88', '#00cc77']);
const errorGradient = gradient(['#ff4444', '#cc0000']);

/**
 * Print nttp banner.
 */
export function printBanner(): void {
  const banner = `
╔═══════════════════════════════════════╗
║                                       ║
║   ${coolGradient('nttp')}                             ║
║   ${chalk.gray('natural text to query')}             ║
║                                       ║
║   ${chalk.gray('Query databases with natural')}      ║
║   ${chalk.gray('language')}                           ║
║                                       ║
╚═══════════════════════════════════════╝
  `;
  console.log(banner);
}

/**
 * Success message.
 */
export function success(message: string): void {
  console.log(`${chalk.green('✔')} ${message}`);
}

/**
 * Error message.
 */
export function error(message: string, suggestion?: string): void {
  console.log(`${chalk.red('✖')} ${message}`);
  if (suggestion) {
    console.log(`  ${chalk.yellow('→')} ${chalk.dim(suggestion)}`);
  }
}

/**
 * Warning message.
 */
export function warn(message: string): void {
  console.log(`${chalk.yellow('⚠')} ${message}`);
}

/**
 * Info message.
 */
export function info(message: string): void {
  console.log(`${chalk.blue('ℹ')} ${message}`);
}

/**
 * Step message (for multi-step processes).
 */
export function step(current: number, total: number, message: string): void {
  console.log(`${chalk.cyan(`[${current}/${total}]`)} ${message}`);
}

/**
 * Create a spinner.
 */
export function spinner(text: string): ReturnType<typeof ora> {
  return ora({
    text,
    color: 'cyan',
    spinner: 'dots',
  }).start();
}

/**
 * Print a boxed message.
 */
export function box(message: string, title?: string): void {
  console.log(
    boxen(message, {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      title,
      titleAlignment: 'center',
    })
  );
}

/**
 * Print success box.
 */
export function successBox(message: string, title?: string): void {
  console.log(
    boxen(successGradient(message), {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'green',
      title,
      titleAlignment: 'center',
    })
  );
}

/**
 * Print error box.
 */
export function errorBox(message: string, title?: string): void {
  console.log(
    boxen(errorGradient(message), {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'red',
      title: title || 'Error',
      titleAlignment: 'center',
    })
  );
}

/**
 * Print code block.
 */
export function code(content: string, language?: string): void {
  const border = chalk.gray('─'.repeat(50));
  console.log(border);
  if (language) {
    console.log(chalk.gray(`# ${language}`));
  }
  console.log(chalk.cyan(content));
  console.log(border);
}

/**
 * Print a section header.
 */
export function section(title: string): void {
  console.log('');
  console.log(coolGradient(`▶ ${title}`));
  console.log(chalk.gray('─'.repeat(50)));
}

/**
 * Print empty line.
 */
export function newline(): void {
  console.log('');
}

/**
 * Print a table row.
 */
export function row(label: string, value: string, success: boolean = true): void {
  const icon = success ? chalk.green('✔') : chalk.red('✖');
  console.log(`  ${icon} ${chalk.bold(label)}: ${chalk.cyan(value)}`);
}

/**
 * Print link.
 */
export function link(text: string, url: string): void {
  console.log(`  ${chalk.blue('→')} ${text}: ${chalk.cyan.underline(url)}`);
}

/**
 * Gradient text.
 */
export function gradientText(text: string): string {
  return coolGradient(text);
}
