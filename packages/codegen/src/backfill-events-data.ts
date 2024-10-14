//
// Copyright 2024 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/backfill-events-data-template.handlebars';

/**
 * Writes the backfill-events-data file generated from a template to a stream.
 * @param outStream A writable output stream to write the backfill-events-data file to.
 */
export function exportBackfillEventsData (outStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const content = template({});
  outStream.write(content);
}
