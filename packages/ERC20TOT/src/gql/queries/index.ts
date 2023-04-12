import fs from 'fs';
import path from 'path';

export const events = fs.readFileSync(path.join(__dirname, 'events.gql'), 'utf8');
export const eventsInRange = fs.readFileSync(path.join(__dirname, 'eventsInRange.gql'), 'utf8');
export const totalSupply = fs.readFileSync(path.join(__dirname, 'totalSupply.gql'), 'utf8');
export const balanceOf = fs.readFileSync(path.join(__dirname, 'balanceOf.gql'), 'utf8');
export const allowance = fs.readFileSync(path.join(__dirname, 'allowance.gql'), 'utf8');
export const name = fs.readFileSync(path.join(__dirname, 'name.gql'), 'utf8');
export const symbol = fs.readFileSync(path.join(__dirname, 'symbol.gql'), 'utf8');
export const decimals = fs.readFileSync(path.join(__dirname, 'decimals.gql'), 'utf8');
export const _balances = fs.readFileSync(path.join(__dirname, '_balances.gql'), 'utf8');
export const _allowances = fs.readFileSync(path.join(__dirname, '_allowances.gql'), 'utf8');
export const _totalSupply = fs.readFileSync(path.join(__dirname, '_totalSupply.gql'), 'utf8');
export const _name = fs.readFileSync(path.join(__dirname, '_name.gql'), 'utf8');
export const _symbol = fs.readFileSync(path.join(__dirname, '_symbol.gql'), 'utf8');
export const getSyncStatus = fs.readFileSync(path.join(__dirname, 'getSyncStatus.gql'), 'utf8');
export const getStateByCID = fs.readFileSync(path.join(__dirname, 'getStateByCID.gql'), 'utf8');
export const getState = fs.readFileSync(path.join(__dirname, 'getState.gql'), 'utf8');
