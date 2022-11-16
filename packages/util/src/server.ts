import { TypeSource } from '@graphql-tools/utils';
import { Application } from 'express';
import { ApolloServer } from 'apollo-server-express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { ApolloServerPluginDrainHttpServer } from 'apollo-server-core';
import debug from 'debug';

import { makeExecutableSchema } from '@graphql-tools/schema';

const log = debug('vulcanize:server');

export const createAndStartServer = async (
  app: Application,
  typeDefs: TypeSource,
  resolvers: any,
  endPoint: { host: string, port: number }
): Promise<ApolloServer> => {
  // Create HTTP server
  const httpServer = createServer(app);

  // Create the schema
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Create our WebSocket server using the HTTP server we just set up.
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql'
  });
  const serverCleanup = useServer({ schema }, wsServer);

  const server = new ApolloServer({
    schema,
    csrfPrevention: true,
    plugins: [
      // Proper shutdown for the HTTP server
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Proper shutdown for the WebSocket server
      {
        async serverWillStart () {
          return {
            async drainServer () {
              await serverCleanup.dispose();
            }
          };
        }
      }
    ]
  });
  await server.start();
  server.applyMiddleware({ app });

  httpServer.listen(endPoint.port, endPoint.host, () => {
    log(`Server is listening on ${endPoint.host}:${endPoint.port}${server.graphqlPath}`);
  });

  return server;
};
