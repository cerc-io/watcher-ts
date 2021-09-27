//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

import { getTsForSol, getPgForTs } from './utils/type-mappings';
import { Param } from './utils/types';

const TEMPLATE_FILE = './templates/entity-template.handlebars';

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
      // Capitalize the first letter of name.
      className: `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
      indexOn: [],
      columns: [],
      imports: []
    };

    entityObject.imports.push(
      {
        toImport: ['Entity', 'PrimaryGeneratedColumn', 'Column', 'Index'],
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

        // Use bigintTransformer for bigint types.
        if (tsType === 'bigint') {
          columnOptions.push(
            {
              option: 'transformer',
              value: 'bigintTransformer'
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
      columnType: 'Column'
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

    this._entities.push(entityObject);
  }

  /**
   * Writes the generated entity files in the given directory.
   * @param entityDir Directory to write the entities to.
   */
  exportEntities (entityDir: string): void {
    this._addEventEntity();
    this._addSyncStatusEntity();
    this._addContractEntity();
    this._addBlockProgressEntity();

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
    const entity: any = {
      className: 'Event',
      indexOn: [],
      columns: [],
      imports: []
    };

    entity.imports.push(
      {
        toImport: ['Entity', 'PrimaryGeneratedColumn', 'Column', 'Index', 'ManyToOne'],
        from: 'typeorm'
      },
      {
        toImport: ['BlockProgress'],
        from: './BlockProgress'
      }
    );

    entity.indexOn.push(
      {
        columns: ['block', 'contract']
      },
      {
        columns: ['block', 'contract', 'eventName']
      }
    );

    entity.columns.push({
      name: 'block',
      tsType: 'BlockProgress',
      columnType: 'ManyToOne',
      lhs: '()',
      rhs: 'BlockProgress'
    });

    entity.columns.push({
      name: 'txHash',
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

    entity.columns.push({
      name: 'index',
      pgType: 'integer',
      tsType: 'number',
      columnType: 'Column'
    });

    entity.columns.push({
      name: 'contract',
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

    entity.columns.push({
      name: 'eventName',
      pgType: 'varchar',
      tsType: 'string',
      columnType: 'Column',
      columnOptions: [
        {
          option: 'length',
          value: 256
        }
      ]
    });

    entity.columns.push({
      name: 'eventInfo',
      pgType: 'text',
      tsType: 'string',
      columnType: 'Column'
    });

    entity.columns.push({
      name: 'extraInfo',
      pgType: 'text',
      tsType: 'string',
      columnType: 'Column'
    });

    entity.columns.push({
      name: 'proof',
      pgType: 'text',
      tsType: 'string',
      columnType: 'Column'
    });

    this._entities.push(entity);
  }

  _addSyncStatusEntity (): void {
    const entity: any = {
      className: 'SyncStatus',
      implements: 'SyncStatusInterface',
      indexOn: [],
      columns: [],
      imports: []
    };

    entity.imports.push({
      toImport: ['Entity', 'PrimaryGeneratedColumn', 'Column'],
      from: 'typeorm'
    });

    entity.imports.push({
      toImport: ['SyncStatusInterface'],
      from: '@vulcanize/util'
    });

    entity.columns.push({
      name: 'chainHeadBlockHash',
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

    entity.columns.push({
      name: 'chainHeadBlockNumber',
      pgType: 'integer',
      tsType: 'number',
      columnType: 'Column'
    });

    entity.columns.push({
      name: 'latestIndexedBlockHash',
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

    entity.columns.push({
      name: 'latestIndexedBlockNumber',
      pgType: 'integer',
      tsType: 'number',
      columnType: 'Column'
    });

    entity.columns.push({
      name: 'latestCanonicalBlockHash',
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

    entity.columns.push({
      name: 'latestCanonicalBlockNumber',
      pgType: 'integer',
      tsType: 'number',
      columnType: 'Column'
    });

    this._entities.push(entity);
  }

  _addContractEntity (): void {
    const entity: any = {
      className: 'Contract',
      indexOn: [],
      columns: [],
      imports: []
    };

    entity.imports.push({
      toImport: ['Entity', 'PrimaryGeneratedColumn', 'Column', 'Index'],
      from: 'typeorm'
    });

    entity.indexOn.push(
      {
        columns: ['address'],
        unique: true
      }
    );

    entity.columns.push({
      name: 'address',
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

    entity.columns.push({
      name: 'kind',
      pgType: 'varchar',
      tsType: 'string',
      columnType: 'Column',
      columnOptions: [
        {
          option: 'length',
          value: 8
        }
      ]
    });

    entity.columns.push({
      name: 'startingBlock',
      pgType: 'integer',
      tsType: 'number',
      columnType: 'Column'
    });

    this._entities.push(entity);
  }

  _addBlockProgressEntity (): void {
    const entity: any = {
      className: 'BlockProgress',
      implements: 'BlockProgressInterface',
      indexOn: [],
      columns: [],
      imports: []
    };

    entity.imports.push({
      toImport: ['Entity', 'PrimaryGeneratedColumn', 'Column', 'Index'],
      from: 'typeorm'
    });

    entity.imports.push({
      toImport: ['BlockProgressInterface'],
      from: '@vulcanize/util'
    });

    entity.indexOn.push(
      {
        columns: ['blockHash'],
        unique: true
      },
      {
        columns: ['blockNumber']
      },
      {
        columns: ['parentHash']
      }
    );

    entity.columns.push({
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

    entity.columns.push({
      name: 'parentHash',
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

    entity.columns.push({
      name: 'blockNumber',
      pgType: 'integer',
      tsType: 'number',
      columnType: 'Column'
    });

    entity.columns.push({
      name: 'blockTimestamp',
      pgType: 'integer',
      tsType: 'number',
      columnType: 'Column'
    });

    entity.columns.push({
      name: 'numEvents',
      pgType: 'integer',
      tsType: 'number',
      columnType: 'Column'
    });

    entity.columns.push({
      name: 'numProcessedEvents',
      pgType: 'integer',
      tsType: 'number',
      columnType: 'Column'
    });

    entity.columns.push({
      name: 'lastProcessedEventIndex',
      pgType: 'integer',
      tsType: 'number',
      columnType: 'Column'
    });

    entity.columns.push({
      name: 'isComplete',
      pgType: 'boolean',
      tsType: 'boolean',
      columnType: 'Column'
    });

    entity.columns.push({
      name: 'isPruned',
      pgType: 'boolean',
      tsType: 'boolean',
      columnType: 'Column',
      columnOptions: [
        {
          option: 'default',
          value: false
        }
      ]
    });

    this._entities.push(entity);
  }
}
