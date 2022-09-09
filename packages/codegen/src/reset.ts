//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const RESET_TEMPLATE_FILE = './templates/reset-template.handlebars';
const RESET_JQ_TEMPLATE_FILE = './templates/reset-job-queue-template.handlebars';
const RESET_STATE_TEMPLATE_FILE = './templates/reset-state-template.handlebars';
const RESET_IPLD_STATE_TEMPLATE_FILE = './templates/reset-ipld-state-template.handlebars';

export class Reset {
  _queries: Array<any>;
  _resetTemplateString: string;
  _resetJQTemplateString: string;
  _resetStateTemplateString: string;
  _resetIPLDStateTemplateString: string;

  constructor () {
    this._queries = [];
    this._resetTemplateString = fs.readFileSync(path.resolve(__dirname, RESET_TEMPLATE_FILE)).toString();
    this._resetJQTemplateString = fs.readFileSync(path.resolve(__dirname, RESET_JQ_TEMPLATE_FILE)).toString();
    this._resetStateTemplateString = fs.readFileSync(path.resolve(__dirname, RESET_STATE_TEMPLATE_FILE)).toString();
    this._resetIPLDStateTemplateString = fs.readFileSync(path.resolve(__dirname, RESET_IPLD_STATE_TEMPLATE_FILE)).toString();
  }

  /**
   * Stores the query to be passed to the template.
   * @param name Name of the query.
   */
  addQuery (name: string): void {
    // Check if the query is already added.
    if (this._queries.some(query => query.name === name)) {
      return;
    }

    const queryObject = {
      name,
      entityName: ''
    };

    // eth_call mode: Capitalize first letter of entity name (balanceOf -> BalanceOf).
    // storage mode: Capiltalize second letter of entity name (_balances -> _Balances).
    queryObject.entityName = (name.charAt(0) === '_')
      ? `_${name.charAt(1).toUpperCase()}${name.slice(2)}`
      : `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

    this._queries.push(queryObject);
  }

  addSubgraphEntities (subgraphSchemaDocument: any): void {
    const subgraphTypeDefs = subgraphSchemaDocument.definitions;

    subgraphTypeDefs.forEach((def: any) => {
      if (def.kind !== 'ObjectTypeDefinition') {
        return;
      }

      this._queries.push({
        entityName: def.name.value
      });
    });
  }

  /**
   * Writes the reset.ts, job-queue.ts, state.ts files generated from templates to respective streams.
   * @param outStream A writable output stream to write the database file to.
   */

  /**
   * Writes the reset.ts, job-queue.ts, state.ts files generated from templates to respective streams.
   * @param resetOutStream A writable output stream to write the reset file to.
   * @param resetJQOutStream A writable output stream to write the reset job-queue file to.
   * @param resetStateOutStream A writable output stream to write the reset state file to.
   * @param resetIPLDStateOutStream A writable output stream to write the reset IPLD state file to.
   */
  exportReset (resetOutStream: Writable, resetJQOutStream: Writable, resetStateOutStream: Writable, resetIPLDStateOutStream: Writable | undefined, subgraphPath: string): void {
    const resetTemplate = Handlebars.compile(this._resetTemplateString);
    const resetString = resetTemplate({});
    resetOutStream.write(resetString);

    const resetJQTemplate = Handlebars.compile(this._resetJQTemplateString);
    const resetJQString = resetJQTemplate({});
    resetJQOutStream.write(resetJQString);

    const resetStateTemplate = Handlebars.compile(this._resetStateTemplateString);
    const obj = {
      queries: this._queries,
      subgraphPath
    };
    const resetState = resetStateTemplate(obj);
    resetStateOutStream.write(resetState);

    if (resetIPLDStateOutStream) {
      const resetIPLDStateTemplate = Handlebars.compile(this._resetIPLDStateTemplateString);
      const resetIPLDStateString = resetIPLDStateTemplate({});
      resetIPLDStateOutStream.write(resetIPLDStateString);
    }
  }
}
