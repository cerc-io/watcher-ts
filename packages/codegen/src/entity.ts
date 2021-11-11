//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import yaml from 'js-yaml';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

import { getTsForSol, getPgForTs, getTsForGql } from './utils/type-mappings';
import { Param } from './utils/types';
import { parseSubgraphSchema } from './utils/subgraph';

const TEMPLATE_FILE = './templates/entity-template.handlebars';
const TABLES_DIR = './data/entities';

export class Entity {
  _entities: Array<any>;
  _templateString: string;

  constructor () {
    this._entities = [];
    this._templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  }

  /**
   * Creates an entity object from the query and stores to be passed to the template.
   * @param name Name of the query.
   * @param params Parameters to the query.
   * @param returnType Return type for the query.
   */
  addQuery (name: string, params: Array<Param>, returnType: string): void {
    // Check if the query is already added.
    if (this._entities.some(entity => entity.className.toLowerCase() === name.toLowerCase())) {
      return;
    }

    const entityObject: any = {
      className: '',
      indexOn: [],
      columns: [],
      imports: []
    };

    // eth_call mode: Capitalize first letter of entity name (balanceOf -> BalanceOf).
    // storage mode: Capiltalize second letter of entity name (_balances -> _Balances).
    entityObject.className = (name.charAt(0) === '_')
      ? `_${name.charAt(1).toUpperCase()}${name.slice(2)}`
      : `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

    entityObject.imports.push(
      {
        toImport: new Set(['Entity', 'PrimaryGeneratedColumn', 'Column', 'Index']),
        from: 'typeorm'
      }
    );

    const indexObject = {
      columns: ['blockHash', 'contractAddress'],
      unique: true
    };
    indexObject.columns = indexObject.columns.concat(
      params.map((param) => {
        return param.name;
      })
    );
    entityObject.indexOn.push(indexObject);

    entityObject.columns.push({
      name: 'id',
      tsType: 'number',
      columnType: 'PrimaryGeneratedColumn',
      columnOptions: []
    });
    entityObject.columns.push({
      name: 'blockHash',
      pgType: 'varchar',
      tsType: 'string',
      columnType: 'Column',
      columnOptions: [
        {
          option: 'length',
          value: 66
        }
      ]
    });
    entityObject.columns.push({
      name: 'blockNumber',
      pgType: 'integer',
      tsType: 'number',
      columnType: 'Column'
    });
    entityObject.columns.push({
      name: 'contractAddress',
      pgType: 'varchar',
      tsType: 'string',
      columnType: 'Column',
      columnOptions: [
        {
          option: 'length',
          value: 42
        }
      ]
    });

    entityObject.columns = entityObject.columns.concat(
      params.map((param) => {
        const name = param.name;

        const tsType = getTsForSol(param.type);
        assert(tsType);

        const pgType = getPgForTs(tsType);
        assert(pgType);

        const columnOptions = [];

        if (param.type === 'address') {
          columnOptions.push(
            {
              option: 'length',
              value: 42
            }
          );
        }

        return {
          name,
          pgType,
          tsType,
          columnType: 'Column',
          columnOptions
        };
      })
    );

    const tsReturnType = getTsForSol(returnType);
    assert(tsReturnType);

    const pgReturnType = getPgForTs(tsReturnType);
    assert(pgReturnType);

    entityObject.columns.push({
      name: 'value',
      pgType: pgReturnType,
      tsType: tsReturnType,
      columnType: 'Column',
      columnOptions: []
    });

    entityObject.columns.push({
      name: 'proof',
      pgType: 'text',
      tsType: 'string',
      columnType: 'Column',
      columnOptions: [
        {
          option: 'nullable',
          value: true
        }
      ]
    });

    entityObject.columns.forEach((column: any) => {
      if (column.tsType === 'bigint') {
        column.columnOptions.push(
          {
            option: 'transformer',
            value: 'bigintTransformer'
          }
        );

        const importObject = entityObject.imports.find((element: any) => {
          return element.from === '@vulcanize/util';
        });

        if (importObject) {
          importObject.toImport.add('bigintTransformer');
        } else {
          entityObject.imports.push(
            {
              toImport: new Set(['bigintTransformer']),
              from: '@vulcanize/util'
            }
          );
        }
      }
    });

    this._entities.push(entityObject);
  }

  /**
   * Writes the generated entity files in the given directory.
   * @param entityDir Directory to write the entities to.
   */
  exportEntities (entityDir: string, schemaTypes: string[], subgraphSchemaPath?: string): void {
    this._addEventEntity();
    this._addSyncStatusEntity();
    this._addContractEntity();
    this._addBlockProgressEntity();
    this._addIPLDBlockEntity();
    this._addHookStatusEntity();

    // Add subgraph entities if path provided.
    if (subgraphSchemaPath) {
      this._addSubgraphEntities(schemaTypes, subgraphSchemaPath);
    }

    const template = Handlebars.compile(this._templateString);
    this._entities.forEach(entityObj => {
      const entity = template(entityObj);
      const outStream: Writable = entityDir
        ? fs.createWriteStream(path.join(entityDir, `${entityObj.className}.ts`))
        : process.stdout;
      outStream.write(entity);
    });
  }

  _addEventEntity (): void {
    const entity = yaml.load(fs.readFileSync(path.resolve(__dirname, TABLES_DIR, 'Event.yaml'), 'utf8'));
    this._entities.push(entity);
  }

  _addSyncStatusEntity (): void {
    const entity = yaml.load(fs.readFileSync(path.resolve(__dirname, TABLES_DIR, 'SyncStatus.yaml'), 'utf8'));
    this._entities.push(entity);
  }

  _addContractEntity (): void {
    const entity = yaml.load(fs.readFileSync(path.resolve(__dirname, TABLES_DIR, 'Contract.yaml'), 'utf8'));
    this._entities.push(entity);
  }

  _addBlockProgressEntity (): void {
    const entity = yaml.load(fs.readFileSync(path.resolve(__dirname, TABLES_DIR, 'BlockProgress.yaml'), 'utf8'));
    this._entities.push(entity);
  }

  _addIPLDBlockEntity (): void {
    const entity = yaml.load(fs.readFileSync(path.resolve(__dirname, TABLES_DIR, 'IPLDBlock.yaml'), 'utf8'));
    this._entities.push(entity);
  }

  _addHookStatusEntity (): void {
    const entity = yaml.load(fs.readFileSync(path.resolve(__dirname, TABLES_DIR, 'HookStatus.yaml'), 'utf8'));
    this._entities.push(entity);
  }

  _addSubgraphEntities (schemaTypes: string[], subgraphSchemaPath: string): void {
    // Generate the subgraph schema DocumentNode.
    const subgraphSchemaDocument = parseSubgraphSchema(schemaTypes, subgraphSchemaPath);

    const subgraphTypeDefs = subgraphSchemaDocument.definitions;

    subgraphTypeDefs.forEach((def: any) => {
      // TODO Handle enum types.
      if (def.kind !== 'ObjectTypeDefinition') {
        return;
      }

      let entityObject: any = {
        className: def.name.value,
        indexOn: [],
        columns: [],
        imports: []
      };

      entityObject.imports.push(
        {
          toImport: new Set(['Entity', 'PrimaryColumn', 'Column']),
          from: 'typeorm'
        }
      );

      // Add common columns.
      entityObject.columns.push({
        name: 'id',
        pgType: 'varchar',
        tsType: 'string',
        columnType: 'PrimaryColumn',
        columnOptions: []
      });
      entityObject.columns.push({
        name: 'blockHash',
        pgType: 'varchar',
        tsType: 'string',
        columnType: 'PrimaryColumn',
        columnOptions: [
          {
            option: 'length',
            value: 66
          }
        ]
      });
      entityObject.columns.push({
        name: 'blockNumber',
        pgType: 'integer',
        tsType: 'number',
        columnType: 'Column'
      });

      // Add subgraph entity specific columns.
      entityObject = this._addSubgraphColumns(entityObject, def);

      // Add bigintTransformer column option if required.
      entityObject.columns.forEach((column: any) => {
        if (column.tsType === 'bigint') {
          column.columnOptions.push(
            {
              option: 'transformer',
              value: 'bigintTransformer'
            }
          );

          const importObject = entityObject.imports.find((element: any) => {
            return element.from === '@vulcanize/util';
          });

          if (importObject) {
            importObject.toImport.add('bigintTransformer');
          } else {
            entityObject.imports.push(
              {
                toImport: new Set(['bigintTransformer']),
                from: '@vulcanize/util'
              }
            );
          }
        }
      });

      this._entities.push(entityObject);
    });
  }

  _addSubgraphColumns (entityObject: any, def: any): any {
    def.fields.forEach((field: any) => {
      const name = field.name.value;

      // Filter out already added columns.
      if (['id', 'blockHash', 'blockNumber'].includes(name)) {
        return;
      }

      const columnObject: any = {
        name,
        columnOptions: []
      };

      const { typeName, array } = this._getTypeName(field.type);
      let tsType = getTsForGql(typeName);

      if (tsType) {
        // Handle basic array types.
        if (array) {
          columnObject.columnOptions.push({
            option: 'array',
            value: 'true'
          });

          columnObject.tsType = `${tsType}[]`;
        } else {
          columnObject.tsType = tsType;
        }
      } else {
        // TODO Handle array of custom types.
        tsType = typeName;
        columnObject.tsType = tsType;
      }

      const pgType = getPgForTs(tsType);

      // If basic type: create a column. If unknown: create a relation.
      if (pgType) {
        columnObject.columnType = 'Column';
        columnObject.pgType = pgType;
      } else {
        columnObject.columnType = 'ManyToOne';
        columnObject.lhs = '()';
        columnObject.rhs = tsType;

        entityObject.imports[0].toImport.add('ManyToOne');

        // Check if type import already added.
        const importObject = entityObject.imports.find((element: any) => {
          return element.from === `./${tsType}`;
        });

        if (!importObject) {
          entityObject.imports.push(
            {
              toImport: new Set([tsType]),
              from: `./${tsType}`
            }
          );
        }
      }

      entityObject.columns.push(columnObject);
    });

    return entityObject;
  }

  _getTypeName (typeNode: any): { typeName: string, array: boolean } {
    if (typeNode.kind === 'NamedType') {
      return { typeName: typeNode.name.value, array: false };
    } else if (typeNode.kind === 'ListType') {
      return { typeName: this._getTypeName(typeNode.type).typeName, array: true };
    } else {
      return this._getTypeName(typeNode.type);
    }
  }
}
