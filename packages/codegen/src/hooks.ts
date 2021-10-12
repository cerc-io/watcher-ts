//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const HOOKS_TEMPLATE_FILE = './templates/hooks-template.handlebars';

/**
 * Writes the hooks file generated from template to a stream.
 * @param outStream A writable output stream to write the hooks file to.
 */
export function exportHooks (hooksOutStream: Writable): void {
  const hooksTemplateString = fs.readFileSync(path.resolve(__dirname, HOOKS_TEMPLATE_FILE)).toString();
  const hooksTemplate = Handlebars.compile(hooksTemplateString);
  const hooks = hooksTemplate({});
  hooksOutStream.write(hooks);
}
