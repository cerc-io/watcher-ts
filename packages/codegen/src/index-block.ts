//
// Copyright 2022 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/index-block-template.handlebars';

/**
 * Writes the index-block file generated from a template to a stream.
 * @param outStream A writable output stream to write the index-block file to.
 */
export function exportIndexBlock (outStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const indexBlock = template({});
  outStream.write(indexBlock);
}
