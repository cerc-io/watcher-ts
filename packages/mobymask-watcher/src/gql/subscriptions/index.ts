import fs from 'fs';
import path from 'path';

export const onEvent = fs.readFileSync(path.join(__dirname, 'onEvent.gql'), 'utf8');
