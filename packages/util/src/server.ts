import { Application } from 'express';
import { ApolloServer } from 'apollo-server-express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { ApolloServerPluginDrainHttpServer } from 'apollo-server-core';
import debug from 'debug';
import responseCachePlugin from 'apollo-server-plugin-response-cache';
import { InMemoryLRUCache } from '@apollo/utils.keyvaluecache';

import { TypeSource } from '@graphql-tools/utils';
import { makeExecutableSchema } from '@graphql-tools/schema';

import { DEFAULT_MAX_GQL_CACHE_SIZE } from './constants';
import { ServerConfig } from './config';

const log = debug('vulcanize:server');

export const createAndStartServerWithCache = async (
  app: Application,
  typeDefs: TypeSource,
  resolvers: any,
  serverConfig: ServerConfig
): Promise<ApolloServer> => {
  const host = serverConfig.host;
  const port = serverConfig.port;
  const gqlCacheConfig = serverConfig.gqlCache;

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

  // Setup in-memory GQL cache
  let gqlCache;
  if (gqlCacheConfig && gqlCacheConfig.enabled) {
    const maxSize = gqlCacheConfig.maxCacheSize ? gqlCacheConfig.maxCacheSize : DEFAULT_MAX_GQL_CACHE_SIZE;
    gqlCache = new InMemoryLRUCache({ maxSize });
  }

  const server = new ApolloServer({
    schema,
    csrfPrevention: true,
    cache: gqlCache,
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
      },
      // GQL response cache plugin
      responseCachePlugin()
    ]
  });
  await server.start();
  server.applyMiddleware({ app });

  httpServer.listen(port, host, () => {
    log(`Server is listening on ${host}:${port}${server.graphqlPath}`);
  });

  return server;
};

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
