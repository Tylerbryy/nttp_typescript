/**
 * Setup using Ink (interactive) or CLI (non-interactive)
 */

import React from 'react';
import { render } from 'ink';
import SetupWizard from './SetupWizard.js';
import { runNonInteractiveSetup } from './setup-non-interactive.js';

interface SetupOptions {
  nonInteractive?: boolean;
  databaseType?: string;
  databaseUrl?: string;
  databasePath?: string;
  llmProvider?: string;
  llmModel?: string;
  llmApiKey?: string;
  redisUrl?: string;
  enableL2Cache?: boolean;
  embeddingApiKey?: string;
}

export async function runSetup(options: SetupOptions = {}): Promise<void> {
  // Check if running in non-interactive mode
  if (options.nonInteractive) {
    runNonInteractiveSetup({
      databaseType: options.databaseType,
      databaseUrl: options.databaseUrl,
      databasePath: options.databasePath,
      llmProvider: options.llmProvider,
      llmModel: options.llmModel,
      llmApiKey: options.llmApiKey,
      redisUrl: options.redisUrl,
      enableL2Cache: options.enableL2Cache,
      embeddingApiKey: options.embeddingApiKey,
    });
  } else {
    // Run interactive Ink wizard
    render(React.createElement(SetupWizard));
  }
}
