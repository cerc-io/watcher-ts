//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/tsconfig-template.handlebars';

/**
 * Writes the tsconfig.json file generated from a template to a stream.
 * @param outStream A writable output stream to write the tsconfig.json file to.
 */
export function exportTSConfig (outStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const tsconfig = template({});
  outStream.write(tsconfig);
}
