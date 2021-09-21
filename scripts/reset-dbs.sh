#!/usr/bin/env bash

echo WARNING: This will reset all the databases used by the watchers.
read -p "Do you want to continue? (y/n)" choice
if [[ $choice =~ ^(Y|y| ) ]]
then
  sudo -i -u postgres bash << EOF
  export PGPASSWORD=postgres

  dropdb erc20-watcher
  dropdb address-watcher
  dropdb uni-watcher
  dropdb uni-info-watcher

  createdb erc20-watcher
  createdb address-watcher
  createdb uni-watcher
  createdb uni-info-watcher

  psql -d erc20-watcher-job-queue -c "delete from pgboss.job;"
  psql -d address-watcher-job-queue -c "delete from pgboss.job;"
  psql -d uni-watcher-job-queue -c "delete from pgboss.job;"
  psql -d uni-info-watcher-job-queue -c "delete from pgboss.job;"
EOF
else
  echo "Abort."
fi
