//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/types-template.handlebars';

export class Types {
  _types: Array<any>;
  _templateString: string;

  constructor () {
    this._types = [];
    this._templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  }

  /**
   * Writes the generated types files from a template to a stream.
   * @param outStream A writable output stream to write the types file to.
   */
  exportTypes (outStream: Writable): void {
    const template = Handlebars.compile(this._templateString);
    const obj = {
      types: this._types
    };
    const database = template(obj);
    outStream.write(database);
  }

  addSubgraphTypes (subgraphSchemaDocument: any): void {
    const subgraphTypeDefs = subgraphSchemaDocument.definitions;

    subgraphTypeDefs.forEach((def: any) => {
      if (def.kind !== 'EnumTypeDefinition') {
        return;
      }

      const typeObject: any = {
        name: def.name.value,
        values: def.values.map((value: any) => value.name.value)
      };

      this._types.push(typeObject);
    });
  }
}
