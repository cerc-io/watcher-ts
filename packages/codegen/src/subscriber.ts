//
// Copyright 2022 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const SUBSCRIBER_TEMPLATE_FILE = './templates/subscriber-template.handlebars';

/**
 * Writes the subscriber file generated from template to a stream.
 * @param outStream A writable output stream to write the subscriber file to.
 */
export function exportSubscriber (subscriberOutStream: Writable): void {
  const subscriberTemplateString = fs.readFileSync(path.resolve(__dirname, SUBSCRIBER_TEMPLATE_FILE)).toString();
  const subscriberTemplate = Handlebars.compile(subscriberTemplateString);
  const subscriber = subscriberTemplate({});
  subscriberOutStream.write(subscriber);
}
