//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const RESET_TEMPLATE_FILE = './templates/reset-template.handlebars';
const RESET_JQ_TEMPLATE_FILE = './templates/reset-job-queue-template.handlebars';
const RESET_WATCHER_TEMPLATE_FILE = './templates/reset-watcher-template.handlebars';
const RESET_STATE_TEMPLATE_FILE = './templates/reset-state-template.handlebars';

/**
 * Writes the reset.ts, job-queue.ts, watcher.ts, state.ts files generated from templates to respective streams.
 * @param resetOutStream A writable output stream to write the reset file to.
 * @param resetJQOutStream A writable output stream to write the reset job-queue file to.
 * @param resetWatcherOutStream A writable output stream to write the reset watcher file to.
 * @param resetStateOutStream A writable output stream to write the reset state file to.
 */
export function exportReset (resetOutStream: Writable, resetJQOutStream: Writable, resetWatcherOutStream: Writable, resetStateOutStream: Writable): void {
  const resetTemplateString = fs.readFileSync(path.resolve(__dirname, RESET_TEMPLATE_FILE)).toString();
  const resetTemplate = Handlebars.compile(resetTemplateString);
  const resetString = resetTemplate({});
  resetOutStream.write(resetString);

  const resetJQTemplateString = fs.readFileSync(path.resolve(__dirname, RESET_JQ_TEMPLATE_FILE)).toString();
  const resetJQTemplate = Handlebars.compile(resetJQTemplateString);
  const resetJQString = resetJQTemplate({});
  resetJQOutStream.write(resetJQString);

  const resetWatcherTemplateString = fs.readFileSync(path.resolve(__dirname, RESET_WATCHER_TEMPLATE_FILE)).toString();
  const resetWatcherTemplate = Handlebars.compile(resetWatcherTemplateString);
  const resetWatcher = resetWatcherTemplate({});
  resetWatcherOutStream.write(resetWatcher);

  const resetStateTemplateString = fs.readFileSync(path.resolve(__dirname, RESET_STATE_TEMPLATE_FILE)).toString();
  const resetStateTemplate = Handlebars.compile(resetStateTemplateString);
  const resetState = resetStateTemplate({});
  resetStateOutStream.write(resetState);
}
