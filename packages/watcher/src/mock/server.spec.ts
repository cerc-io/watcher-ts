import 'mocha';
import { expect } from 'chai';
import _ from 'lodash';

import { GraphQLClient } from 'graphql-request';

import { queryBalanceOf, queryAllowance, queryEvents } from '../queries';

import { blocks } from './data';

const testCases = {
  'balanceOf': [],
  'allowance': [],
  'events': []
};

const blockHashes = _.keys(blocks);
blockHashes.forEach(blockHash => {
  const block = blocks[blockHash];
  const tokens = _.keys(block);
  tokens.forEach(token => {
    const tokenObj = block[token];

    // Event tests cases.
    testCases.events.push({
      blockHash,
      token,
      events: tokenObj.events
    });

    // Balance test cases.
    const balanceOfOwners = _.keys(tokenObj['balanceOf']);
    balanceOfOwners.forEach(owner => {
      testCases.balanceOf.push({
        blockHash,
        token,
        owner,
        balance: tokenObj.balanceOf[owner]
      });
    });

    // Allowance test cases.
    const allowanceOwners = _.keys(tokenObj['allowance']);
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

  const client = new GraphQLClient("http://localhost:3001/graphql");

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

      const resultEvents = result.events.map(record => record.event);
      expect(resultEvents.length).to.equal(testCase.events.length);

      resultEvents.forEach((resultEvent, index) => {
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
