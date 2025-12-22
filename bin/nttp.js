#!/usr/bin/env node

/**
 * NTTP CLI - Beautiful developer experience.
 * Commands:
 *   nttp setup      - Interactive setup wizard
 *   nttp dev        - Start development server
 *   nttp start      - Start production server
 *   nttp doctor     - Run diagnostics
 *   nttp test-db    - Test database connection
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const command = process.argv[2];

async function main() {
  switch (command) {
    case 'setup':
      await runSetup();
      break;

    case 'dev':
      runDev();
      break;

    case 'start':
      runStart();
      break;

    case 'doctor':
    case 'diagnostics':
      await runDiagnostics();
      break;

    case 'test-db':
    case 'test-connection':
      await testConnection();
      break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showHelp();
      break;

    case 'version':
    case '--version':
    case '-v':
      showVersion();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run "nttp help" for usage information.');
      process.exit(1);
  }
}

async function runSetup() {
  const { runSetupWizard } = await import('../dist/cli/setup.js');
  await runSetupWizard();
}

async function runDiagnostics() {
  const { runDiagnostics } = await import('../dist/cli/diagnostics.js');
  await runDiagnostics();
}

async function testConnection() {
  const { testConnection } = await import('../dist/cli/diagnostics.js');
  await testConnection();
}

function runDev() {
  console.log('🚀 Starting NTTP development server...\n');
  const child = spawn('npm', ['run', 'dev'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

function runStart() {
  console.log('🚀 Starting NTTP production server...\n');
  const child = spawn('npm', ['start'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

function showHelp() {
  console.log(`
╔═══════════════════════════════════════╗
║                                       ║
║   NTTP - Natural Text Transfer        ║
║   Protocol                            ║
║                                       ║
╚═══════════════════════════════════════╝

Usage: nttp <command>

Commands:
  setup              Interactive setup wizard
  dev                Start development server
  start              Start production server
  doctor             Run health diagnostics
  test-db            Test database connection
  help               Show this help message
  version            Show version number

Examples:
  $ nttp setup       Configure NTTP for the first time
  $ nttp dev         Start with hot reload
  $ nttp doctor      Troubleshoot configuration issues

Documentation: https://github.com/your-org/nttp
  `);
}

function showVersion() {
  import(`${projectRoot}/package.json`, {
    assert: { type: 'json' },
  }).then((pkg) => {
    console.log(`NTTP v${pkg.default.version}`);
  });
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
