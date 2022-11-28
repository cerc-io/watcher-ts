//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/config-template.handlebars';

/**
 * Writes the config file generated from a template to a stream.
 * @param watcherKind Watcher kind to be passed to the template.
 * @param port Port for the watcher server.
 * @param folderName Watcher folder name to be passed to the template.
 * @param outStream A writable output stream to write the config file to.
 */
export function exportConfig (watcherKind: string, port: number, folderName: string, outStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const config = template({
    watcherKind,
    port,
    folderName
  });
  outStream.write(config);
}
