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
 * @param port Watcher server port.
 * @param outStream A writable output stream to write the README.md file to.
 */
export function exportReadme (
  folderName: string,
  config: { port: number, subgraphPath?: string },
  outStream: Writable
): void {
  const { port, subgraphPath } = config;
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  let subgraphRepoName;

  if (subgraphPath) {
    const subgraphRepoDir = path.dirname(subgraphPath);
    subgraphRepoName = path.basename(subgraphRepoDir);
  }

  const readmeString = template({
    folderName,
    port,
    subgraphRepoName
  });
  outStream.write(readmeString);
}
