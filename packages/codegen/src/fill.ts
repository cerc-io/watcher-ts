//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const FILL_TEMPLATE_FILE = './templates/fill-template.handlebars';
const FILL_STATE_TEMPLATE_FILE = './templates/fill-state-template.handlebars';

/**
 * Writes the fill file generated from a template to a stream.
 * @param fillOutStream A writable output stream to write the fill file to.
 * @param fillStateOutStream A writable output stream to write the fill state file to.
 */
export function exportFill (fillOutStream: Writable, fillStateOutStream: Writable | undefined, subgraphPath: string): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, FILL_TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const fill = template({ subgraphPath });
  fillOutStream.write(fill);

  if (fillStateOutStream) {
    const templateString = fs.readFileSync(path.resolve(__dirname, FILL_STATE_TEMPLATE_FILE)).toString();
    const template = Handlebars.compile(templateString);
    const fillState = template({});
    fillStateOutStream.write(fillState);
  }
}
