//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const RC_TEMPLATE_FILE = './templates/eslintrc-template.handlebars';
const IGNORE_TEMPLATE_FILE = './templates/eslintignore-template.handlebars';

/**
 * Writes the .eslintrc.json and .eslintignore file generated from a template to respective streams.
 * @param rcOutStream A writable output stream to write the .eslintrc.json file to.
 * @param ignoreOutStream A writable output stream to write the .eslintignore file to.
 */
export function exportLint (rcOutStream: Writable, ignoreOutStream: Writable): void {
  const rcTemplateString = fs.readFileSync(path.resolve(__dirname, RC_TEMPLATE_FILE)).toString();
  const rcTemplate = Handlebars.compile(rcTemplateString);
  const rcString = rcTemplate({});
  rcOutStream.write(rcString);

  const ignoreTemplateString = fs.readFileSync(path.resolve(__dirname, IGNORE_TEMPLATE_FILE)).toString();
  const ignoreTemplate = Handlebars.compile(ignoreTemplateString);
  const ignoreString = ignoreTemplate({});
  ignoreOutStream.write(ignoreString);
}
