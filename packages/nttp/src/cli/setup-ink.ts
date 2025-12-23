/**
 * Setup command using Ink
 */

import React from 'react';
import { render } from 'ink';
import SetupWizard from './SetupWizard.js';

export async function runSetup(): Promise<void> {
  render(React.createElement(SetupWizard));
}
