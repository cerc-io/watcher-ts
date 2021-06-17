import 'mocha';
import { expect } from 'chai';
import _ from 'lodash';

import { GraphQLClient } from 'graphql-request';

import {
  queryName,
  querySymbol,
  queryDecimals,
  queryTotalSupply,
  queryBalanceOf,
  queryAllowance,
  queryEvents
} from '../queries';

import { blocks, tokens as tokenInfo } from './data';

const testCases: {
  balanceOf: any[],
  allowance: any[],
  events: any[],
  tokens: any[]
} = {
  balanceOf: [],
  allowance: [],
  events: [],
  tokens: []
};

const blockHashes = _.keys(blocks);
blockHashes.forEach(blockHash => {
  const block = blocks[blockHash];
  const tokens = _.keys(block);
  tokens.forEach(token => {
    const tokenObj = block[token];

    // Token info test cases.
    testCases.tokens.push({
      blockHash,
      token,
      info: tokenInfo[token]
    });

    // Event test cases.
    testCases.events.push({
      blockHash,
      token,
      events: tokenObj.events
    });

    // Balance test cases.
    const balanceOfOwners = _.keys(tokenObj.balanceOf);
    balanceOfOwners.forEach(owner => {
      testCases.balanceOf.push({
        blockHash,
        token,
        owner,
        balance: tokenObj.balanceOf[owner]
      });
    });

    // Allowance test cases.
    const allowanceOwners = _.keys(tokenObj.allowance);
    allowanceOwners.forEach(owner => {
      const allowanceObj = tokenObj.allowance[owner];
      const spenders = _.keys(allowanceObj);
      spenders.forEach(spender => {
        testCases.allowance.push({
          blockHash,
          token,
          owner,
          spender,
          allowance: allowanceObj[spender]
        });
      });
    });
  });
});

describe('server', () => {
  const client = new GraphQLClient('http://localhost:3001/graphql');

  it('query token info', async () => {
    const tests = testCases.tokens;
    expect(tests.length).to.be.greaterThan(0);

    for (let i = 0; i < tests.length; i++) {
      const testCase = tests[i];

      // Token totalSupply.
      let result = await client.request(queryTotalSupply, testCase);
      expect(result.totalSupply.value).to.equal(testCase.info.totalSupply);
      expect(result.totalSupply.proof.data).to.equal('');

      // Token name.
      result = await client.request(queryName, testCase);
      expect(result.name.value).to.equal(testCase.info.name);
      expect(result.name.proof.data).to.equal('');

      // Token symbol.
      result = await client.request(querySymbol, testCase);
      expect(result.symbol.value).to.equal(testCase.info.symbol);
      expect(result.symbol.proof.data).to.equal('');

      // Token decimals.
      result = await client.request(queryDecimals, testCase);
      expect(result.decimals.value).to.equal(testCase.info.decimals);
      expect(result.decimals.proof.data).to.equal('');
    }
  });

  it('query balanceOf', async () => {
    const tests = testCases.balanceOf;
    expect(tests.length).to.be.greaterThan(0);

    for (let i = 0; i < tests.length; i++) {
      const testCase = tests[i];
      const result = await client.request(queryBalanceOf, testCase);

      expect(result.balanceOf.value).to.equal(testCase.balance);

      // TODO: Check proof.
      expect(result.balanceOf.proof.data).to.equal('');
    }
  });

  it('query allowance', async () => {
    const tests = testCases.allowance;
    expect(tests.length).to.be.greaterThan(0);

    for (let i = 0; i < tests.length; i++) {
      const testCase = tests[i];
      const result = await client.request(queryAllowance, testCase);

      expect(result.allowance.value).to.equal(testCase.allowance);

      // TODO: Check proof.
      expect(result.allowance.proof.data).to.equal('');
    }
  });

  it('query events', async () => {
    const tests = testCases.events;
    expect(tests.length).to.be.greaterThan(0);

    for (let i = 0; i < tests.length; i++) {
      const testCase = tests[i];
      const result = await client.request(queryEvents, testCase);

      const resultEvents = result.events.map((record: any) => record.event);
      expect(resultEvents.length).to.equal(testCase.events.length);

      resultEvents.forEach((resultEvent: any, index: number) => {
        const { name, ...testCaseEvent } = testCase.events[index];

        if (name === 'Transfer') {
          expect(resultEvent.__typename).to.equal('TransferEvent');
        } else if (name === 'Approval') {
          expect(resultEvent.__typename).to.equal('ApprovalEvent');
        }

        expect(resultEvent).to.include(testCaseEvent);
      });

      // TODO: Check proof.
    }
  });
});
