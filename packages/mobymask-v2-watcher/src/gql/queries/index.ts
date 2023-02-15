import fs from 'fs';
import path from 'path';

export const events = fs.readFileSync(path.join(__dirname, 'events.gql'), 'utf8');
export const eventsInRange = fs.readFileSync(path.join(__dirname, 'eventsInRange.gql'), 'utf8');
export const multiNonce = fs.readFileSync(path.join(__dirname, 'multiNonce.gql'), 'utf8');
export const _owner = fs.readFileSync(path.join(__dirname, '_owner.gql'), 'utf8');
export const isRevoked = fs.readFileSync(path.join(__dirname, 'isRevoked.gql'), 'utf8');
export const isPhisher = fs.readFileSync(path.join(__dirname, 'isPhisher.gql'), 'utf8');
export const isMember = fs.readFileSync(path.join(__dirname, 'isMember.gql'), 'utf8');
export const getStateByCID = fs.readFileSync(path.join(__dirname, 'getStateByCID.gql'), 'utf8');
export const getState = fs.readFileSync(path.join(__dirname, 'getState.gql'), 'utf8');
