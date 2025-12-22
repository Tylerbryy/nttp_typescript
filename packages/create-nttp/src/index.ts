#!/usr/bin/env node

/**
 * create-nttp - Scaffold a new NTTP project
 * Like create-next-app, but for NTTP
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir, writeFile, cp } from 'fs/promises';
import { existsSync } from 'fs';
import prompts from 'prompts';
import ora from 'ora';
import chalk from 'chalk';
import gradient from 'gradient-string';
import { spawn } from 'child_process';

const coolGradient = gradient(['#00F5FF', '#00D4FF', '#00B4FF']);

async function main() {
  console.log(`
╔═══════════════════════════════════════╗
║                                       ║
║   ${coolGradient('NTTP - Natural Text Transfer')}    ║
║   ${coolGradient('Protocol')}                         ║
║                                       ║
╚═══════════════════════════════════════╝
  `);

  const projectName = process.argv[2] || await promptProjectName();

  if (!projectName) {
    console.error(chalk.red('✖ Project name is required'));
    process.exit(1);
  }

  const projectPath = join(process.cwd(), projectName);

  // Check if directory exists
  if (existsSync(projectPath)) {
    console.error(chalk.red(`✖ Directory ${projectName} already exists`));
    process.exit(1);
  }

  // Get configuration
  const config = await promptConfiguration();

  // Create project
  await createProject(projectPath, projectName, config);

  console.log('');
  console.log(chalk.green('✔ Success! Created NTTP project at:'));
  console.log(chalk.cyan(`  ${projectPath}`));
  console.log('');
  console.log('Next steps:');
  console.log(chalk.cyan(`  cd ${projectName}`));
  console.log(chalk.cyan('  npm run dev'));
  console.log('');
}

async function promptProjectName(): Promise<string> {
  const { name } = await prompts({
    type: 'text',
    name: 'name',
    message: 'Project name:',
    initial: 'my-nttp-api',
  });
  return name;
}

async function promptConfiguration() {
  return await prompts([
    {
      type: 'select',
      name: 'template',
      message: 'Which template would you like to use?',
      choices: [
        { title: 'Standalone API (Fastify server)', value: 'fastify' },
        { title: 'Library only (use programmatically)', value: 'library' },
      ],
      initial: 0,
    },
    {
      type: 'select',
      name: 'database',
      message: 'Which database will you use?',
      choices: [
        { title: 'SQLite (easiest)', value: 'sqlite3' },
        { title: 'PostgreSQL', value: 'pg' },
        { title: 'MySQL', value: 'mysql2' },
        { title: 'SQL Server', value: 'mssql' },
      ],
      initial: 0,
    },
    {
      type: 'confirm',
      name: 'installDeps',
      message: 'Install dependencies now?',
      initial: true,
    },
  ]);
}

async function createProject(path: string, name: string, config: any) {
  const spinner = ora('Creating project...').start();

  try {
    // Create directory
    await mkdir(path, { recursive: true });

    // Create package.json
    const packageJson = generatePackageJson(name, config);
    await writeFile(join(path, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Create .env.example
    const envExample = generateEnvExample(config.database);
    await writeFile(join(path, '.env.example'), envExample);

    // Create README.md
    const readme = generateReadme(name, config);
    await writeFile(join(path, 'README.md'), readme);

    // Create .gitignore
    const gitignore = `node_modules/\ndist/\n.env\n*.db\n.DS_Store\n`;
    await writeFile(join(path, '.gitignore'), gitignore);

    // Create tsconfig.json
    const tsconfig = generateTsConfig();
    await writeFile(join(path, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

    // Create source files based on template
    await mkdir(join(path, 'src'), { recursive: true });

    if (config.template === 'fastify') {
      await createFastifyTemplate(path, config.database);
    } else {
      await createLibraryTemplate(path, config.database);
    }

    spinner.succeed('Project created!');

    // Install dependencies
    if (config.installDeps) {
      const installSpinner = ora('Installing dependencies...').start();
      await installDependencies(path);
      installSpinner.succeed('Dependencies installed!');
    }

  } catch (error: any) {
    spinner.fail('Failed to create project');
    console.error(error.message);
    process.exit(1);
  }
}

function generatePackageJson(name: string, config: any) {
  const dependencies: Record<string, string> = {
    'nttp': '^1.0.0',
  };

  // Add database driver
  if (config.database === 'sqlite3') {
    dependencies['better-sqlite3'] = '^9.6.0';
  } else if (config.database === 'pg') {
    dependencies['pg'] = '^8.13.1';
  } else if (config.database === 'mysql2') {
    dependencies['mysql2'] = '^3.11.5';
  } else if (config.database === 'mssql') {
    dependencies['mssql'] = '^11.0.1';
  }

  if (config.template === 'fastify') {
    dependencies['@nttp/fastify'] = '^1.0.0';
    dependencies['fastify'] = '^4.26.2';
    dependencies['dotenv'] = '^16.4.5';
  }

  return {
    name,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js',
    },
    dependencies,
    devDependencies: {
      '@types/node': '^20.12.7',
      'typescript': '^5.4.5',
      'tsx': '^4.7.2',
    },
  };
}

function generateEnvExample(database: string) {
  let content = `ANTHROPIC_API_KEY=sk-ant-...\n\n`;

  if (database === 'sqlite3') {
    content += `DATABASE_TYPE=sqlite3\nDATABASE_PATH=./nttp.db\n`;
  } else if (database === 'pg') {
    content += `DATABASE_TYPE=pg\nDATABASE_URL=postgresql://user:password@localhost:5432/dbname\n`;
  } else if (database === 'mysql2') {
    content += `DATABASE_TYPE=mysql2\nDATABASE_URL=mysql://user:password@localhost:3306/dbname\n`;
  } else if (database === 'mssql') {
    content += `DATABASE_TYPE=mssql\nDATABASE_URL=Server=localhost,1433;Database=dbname;User Id=user;Password=password\n`;
  }

  return content;
}

function generateReadme(name: string, config: any) {
  return `# ${name}

Natural language database queries powered by NTTP and Claude AI.

## Setup

1. Copy \`.env.example\` to \`.env\` and add your Anthropic API key:
\`\`\`bash
cp .env.example .env
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Start development server:
\`\`\`bash
npm run dev
\`\`\`

## Usage

${config.template === 'fastify' ?
`### API Endpoints

- \`POST /query\` - Execute natural language query
- \`GET /docs\` - Interactive API documentation

### Example Request

\`\`\`bash
curl -X POST http://localhost:3000/query \\
  -H "Content-Type: application/json" \\
  -d '{"query": "get all active users"}'
\`\`\``
:
`### Programmatic Usage

\`\`\`typescript
import { NTTP } from 'nttp';

const nttp = new NTTP({ /* config */ });
await nttp.init();

const users = await nttp.query("get all active users");
console.log(users.data);
\`\`\``
}

## Documentation

- [NTTP Documentation](https://github.com/your-org/nttp)
- [Claude AI](https://anthropic.com)
`;
}

function generateTsConfig() {
  return {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
  };
}

async function createFastifyTemplate(path: string, database: string) {
  const code = `import Fastify from 'fastify';
import nttpPlugin from '@nttp/fastify';
import dotenv from 'dotenv';

dotenv.config();

const fastify = Fastify({ logger: true });

// Register NTTP plugin
await fastify.register(nttpPlugin, {
  database: {
    client: '${database === 'sqlite3' ? 'better-sqlite3' : database}',
    connection: ${database === 'sqlite3'
      ? '{ filename: process.env.DATABASE_PATH }'
      : 'process.env.DATABASE_URL'
    },
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log('🚀 NTTP API running at http://localhost:3000');
    console.log('📖 API docs at http://localhost:3000/docs');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
`;

  await writeFile(join(path, 'src', 'index.ts'), code);
}

async function createLibraryTemplate(path: string, database: string) {
  const code = `import { NTTP } from 'nttp';
import dotenv from 'dotenv';

dotenv.config();

const nttp = new NTTP({
  database: {
    client: '${database === 'sqlite3' ? 'better-sqlite3' : database}',
    connection: ${database === 'sqlite3'
      ? '{ filename: process.env.DATABASE_PATH }'
      : 'process.env.DATABASE_URL'
    },
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },
});

async function main() {
  // Initialize NTTP
  await nttp.init();

  // Example: Query database with natural language
  const result = await nttp.query("get all users");
  console.log('Query result:', result.data);

  // Example: Explain without executing
  const explanation = await nttp.explain("show pending orders");
  console.log('Generated SQL:', explanation.sql);

  // Close connection
  await nttp.close();
}

main().catch(console.error);
`;

  await writeFile(join(path, 'src', 'index.ts'), code);
}

async function installDependencies(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const npm = spawn('npm', ['install'], {
      cwd: path,
      stdio: 'pipe',
    });

    npm.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install failed with code ${code}`));
      }
    });

    npm.on('error', reject);
  });
}

main().catch((error) => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});
