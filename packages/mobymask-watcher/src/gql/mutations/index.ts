import fs from 'fs';
import path from 'path';

export const watchContract = fs.readFileSync(path.join(__dirname, 'watchContract.gql'), 'utf8');
