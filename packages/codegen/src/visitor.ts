//
// Copyright 2021 Vulcanize, Inc.
//

import { Writable } from 'stream';
import { Schema, Param } from './schema';

export class Visitor {
  _schema: Schema;

  constructor () {
    this._schema = new Schema();
  }

  /**
   * Visitor function for function definitions.
   * @param node ASTNode for a function definition.
   */
  functionDefinitionVisitor (node: any): void {
    if (node.stateMutability === 'view' && (node.visibility === 'external' || node.visibility === 'public')) {
      const name = node.name;
      const params = node.parameters.map((item: any) => {
        return { name: item.name, type: item.typeName.name };
      });

      // TODO Handle multiple return parameters and array return type.
      const returnType = node.returnParameters[0].typeName.name;

      this._schema.addQuery(name, params, returnType);
    }
  }

  /**
   * Visitor function for state variable declarations.
   * @param node ASTNode for a state variable declaration.
   */
  stateVariableDeclarationVisitor (node: any): void {
    // TODO Handle multiples variables in a single line.
    // TODO Handle array types.
    let name: string = node.variables[0].name;
    name = name.startsWith('_') ? name.substring(1) : name;

    const params: Param[] = [];

    let typeName = node.variables[0].typeName;
    let numParams = 0;

    // If the variable type is mapping, extract key as a param:
    // Eg. mapping(address => mapping(address => uint256)) private _allowances;
    while (typeName.type === 'Mapping') {
      params.push({ name: `key${numParams.toString()}`, type: typeName.keyType.name });
      typeName = typeName.valueType;
      numParams++;
    }

    const returnType = typeName.name;

    this._schema.addQuery(name, params, returnType);
  }

  /**
   * Visitor function for event definitions.
   * @param node ASTNode for an event definition.
   */
  eventDefinitionVisitor (node: any): void {
    const name = node.name;
    const params = node.parameters.map((item: any) => {
      return { name: item.name, type: item.typeName.name };
    });

    this._schema.addEventType(name, params);
  }

  /**
   * Writes schema to a stream.
   * @param outStream A writable output stream to write the schema to.
   */
  exportSchema (outStream: Writable): void {
    this._schema.exportSchema(outStream);
  }
}
