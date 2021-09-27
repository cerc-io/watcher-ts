//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/events-template.handlebars';

/**
 * Writes the events file generated from a template to a stream.
 * @param outStream A writable output stream to write the events file to.
 */
export function exportEvents (outStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const events = template({});
  outStream.write(events);
}
