import express, { Application, Request, Response } from 'express';
import { graphqlHTTP } from 'express-graphql';

import { schema } from './gql';

const app: Application = express();

// TODO: Accept CLI param for host and port.
const port: number = 3001;

app.use(
  '/graphql',
  graphqlHTTP({
    schema,
    graphiql: true,
  }),
);

app.get('/', (req: Request, res: Response) => {
  res.send('ERC20 Watcher');
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
