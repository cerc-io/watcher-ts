//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const CHECKPOINT_TEMPLATE_FILE = './templates/checkpoint-template.handlebars';
const CREATE_TEMPLATE_FILE = './templates/checkpoint-create-template.handlebars';
const VERIFY_TEMPLATE_FILE = './templates/checkpoint-verify-template.handlebars';

/**
 * Writes the checkpoint file generated from a template to a stream.
 * @param outStream A writable output stream to write the checkpoint file to.
 */
export function exportCheckpoint (checkpointOutStream: Writable, checkpointCreateOutStream: Writable, checkpointVerifyOutStream: Writable | undefined, subgraphPath: string): void {
  const checkpointTemplateString = fs.readFileSync(path.resolve(__dirname, CHECKPOINT_TEMPLATE_FILE)).toString();
  const checkpointTemplate = Handlebars.compile(checkpointTemplateString);
  const checkpoint = checkpointTemplate({ subgraphPath });
  checkpointOutStream.write(checkpoint);

  const createCheckpointTemplateString = fs.readFileSync(path.resolve(__dirname, CREATE_TEMPLATE_FILE)).toString();
  const createCheckpointTemplate = Handlebars.compile(createCheckpointTemplateString);
  const createCheckpoint = createCheckpointTemplate({ subgraphPath });
  checkpointCreateOutStream.write(createCheckpoint);

  if (checkpointVerifyOutStream) {
    const verifyCheckpointTemplateString = fs.readFileSync(path.resolve(__dirname, VERIFY_TEMPLATE_FILE)).toString();
    const verifyCheckpointTemplate = Handlebars.compile(verifyCheckpointTemplateString);
    const verifyCheckpointString = verifyCheckpointTemplate({});
    checkpointVerifyOutStream.write(verifyCheckpointString);
  }
}
