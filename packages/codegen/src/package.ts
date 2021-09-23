//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/package-template.handlebars';

/**
 * Writes the package.json file generated from a template to a stream.
 * @param folderName Watcher folder name to be passed to the template.
 * @param outStream A writable output stream to write the package.json file to.
 */
export function exportPackage (folderName: string, outStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const packageString = template({
    folderName
  });
  outStream.write(packageString);
}
