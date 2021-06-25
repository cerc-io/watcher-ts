# Address Watcher

## Setup

Enable the `pgcrypto` extension on the database (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro).

Example:

```
postgres@tesla:~$ psql -U postgres -h localhost job-queue
Password for user postgres:
psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

job-queue=# CREATE EXTENSION pgcrypto;
CREATE EXTENSION
job-queue=# exit
```
