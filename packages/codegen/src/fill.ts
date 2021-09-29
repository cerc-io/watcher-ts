//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/fill-template.handlebars';

/**
 * Writes the fill file generated from a template to a stream.
 * @param outStream A writable output stream to write the fill file to.
 */
export function exportFill (outStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const fill = template({});
  outStream.write(fill);
}
