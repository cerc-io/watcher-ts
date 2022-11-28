//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const FILL_TEMPLATE_FILE = './templates/fill-template.handlebars';

/**
 * Writes the fill file generated from a template to a stream.
 * @param fillOutStream A writable output stream to write the fill file to.
 */
export function exportFill (fillOutStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, FILL_TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const fill = template({});
  fillOutStream.write(fill);
}
