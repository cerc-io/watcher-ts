//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/readme-template.handlebars';

/**
 * Writes the README.md file generated from a template to a stream.
 * @param folderName Watcher folder name to be passed to the template.
 * @param contractName Input contract name given as title of the README.
 * @param outStream A writable output stream to write the README.md file to.
 */
export function exportReadme (folderName: string, contractName: string, outStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const readmeString = template({
    folderName,
    contractName
  });
  outStream.write(readmeString);
}
