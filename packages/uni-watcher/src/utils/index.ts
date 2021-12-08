//
// Copyright 2021 Vulcanize, Inc.
//

import { Client as UniClient } from '../client';

export const watchEvent = async (uniClient: UniClient, eventType: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const subscription = await uniClient.watchEvents((value: any) => {
          if (value.event.__typename === eventType) {
            if (subscription) {
              subscription.unsubscribe();
            }
            resolve(value);
          }
        });
      } catch (error) {
        reject(error);
      }
    })();
  });
};
