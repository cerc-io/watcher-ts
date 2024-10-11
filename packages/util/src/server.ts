import { Application } from 'express';
import { ApolloServer, ExpressContext } from 'apollo-server-express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import {
  ApolloServerPluginDrainHttpServer,
  ApolloServerPluginLandingPageLocalDefault
} from 'apollo-server-core';
import debug from 'debug';
import responseCachePlugin from 'apollo-server-plugin-response-cache';
import { InMemoryLRUCache } from '@apollo/utils.keyvaluecache';
import queue from 'express-queue';
import jayson from 'jayson';
import { json as jsonParser } from 'body-parser';

import { TypeSource } from '@graphql-tools/utils';
import { makeExecutableSchema } from '@graphql-tools/schema';

import { DEFAULT_MAX_GQL_CACHE_SIZE } from './constants';
import { ServerConfig } from './config';
import { PaymentsManager, paymentsPlugin } from './payments';

const log = debug('vulcanize:server');

const DEFAULT_GQL_PATH = '/graphql';
const DEFAULT_ETH_RPC_PATH = '/rpc';

export const createAndStartServer = async (
  app: Application,
  typeDefs: TypeSource,
  resolvers: any,
  ethRPCHandlers: any,
  serverConfig: ServerConfig,
  paymentsManager?: PaymentsManager
): Promise<ApolloServer> => {
  const {
    host,
    port,
    gql: {
      cache: gqlCacheConfig,
      maxSimultaneousRequests,
      maxRequestQueueLimit,
      path: gqlPath = DEFAULT_GQL_PATH
    }
  } = serverConfig;

  app.use(queue({ activeLimit: maxSimultaneousRequests || 1, queuedLimit: maxRequestQueueLimit || -1 }));

  // Create HTTP server
  const httpServer = createServer(app);

  // Create the schema
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Create our WebSocket server using the HTTP server we just set up.
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: gqlPath
  });
  const serverCleanup = useServer({ schema }, wsServer);

  // Setup in-memory GQL cache
  let gqlCache;
  if (gqlCacheConfig && gqlCacheConfig.enabled) {
    const maxSize = gqlCacheConfig.maxCacheSize ? gqlCacheConfig.maxCacheSize : DEFAULT_MAX_GQL_CACHE_SIZE;
    gqlCache = new InMemoryLRUCache({ maxSize });
  }

  const server = new ApolloServer({
    context: (expressContext: ExpressContext) => {
      return expressContext;
    },
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
      // Custom payments plugin
      paymentsPlugin(paymentsManager),
      // GQL response cache plugin
      responseCachePlugin(),
      ApolloServerPluginLandingPageLocalDefault({ embed: true })
    ]
  });

  await server.start();

  const rpcPath = serverConfig.ethRPC?.path ?? DEFAULT_ETH_RPC_PATH;
  const rpcEnabled = serverConfig.ethRPC?.enabled;

  // Apply GraphQL middleware
  const applyGraphQLMiddleware = () => {
    console.log('applyGraphQLMiddleware');
    server.applyMiddleware({
      app,
      path: gqlPath
    });
  };

  // Apply RPC middleware
  const applyRPCMiddleware = () => {
    console.log('applyRPCMiddleware');
    if (!rpcEnabled) {
      return;
    }

    // Create a JSON-RPC server to handle ETH RPC calls
    const rpcServer = jayson.Server(ethRPCHandlers);

    // Mount the JSON-RPC server to rpcPath
    app.use(
      rpcPath,
      jsonParser(),
      (req: any, res: any, next: () => void) => {
        // Convert all GET requests to POST to avoid getting rejected by jayson server middleware
        if (jayson.Utils.isMethod(req, 'GET')) {
          req.method = 'POST';
        }
        next();
      },
      rpcServer.middleware()
    );
  };

  // Apply middlewares based on path specificity
  if (isPathMoreSpecific(rpcPath, gqlPath)) {
    applyRPCMiddleware();
    applyGraphQLMiddleware();
  } else {
    applyGraphQLMiddleware();
    applyRPCMiddleware();
  }

  httpServer.listen(port, host, () => {
    log(`GQL server is listening on http://${host}:${port}${gqlPath}`);

    if (rpcEnabled) {
      log(`ETH JSON RPC server is listening on http://${host}:${port}${rpcPath}`);
    }
  });

  return server;
};

// Determine which path is more specific (more segments)
function isPathMoreSpecific (path1: string, path2: string) {
  const path1Segments = path1.split('/').filter(segment => segment !== '');
  const path2Segments = path2.split('/').filter(segment => segment !== '');

  return path1Segments.length > path2Segments.length;
}
