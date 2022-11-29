#!/bin/bash

# Check the command line argument value exists or not
if [ $1 != "" ]; then

# Change to script file directory
scriptDir=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
cd "$scriptDir"

# Set package versions
sed -i "s/\"@cerc-io\/cli.*/\"@cerc-io\/cli\": \"^${1}\",/" ../src/templates/package-template.handlebars
sed -i "s/\"@cerc-io\/ipld-eth-client.*/\"@cerc-io\/ipld-eth-client\": \"^${1}\",/" ../src/templates/package-template.handlebars
sed -i "s/\"@cerc-io\/solidity-mapper.*/\"@cerc-io\/solidity-mapper\": \"^${1}\",/" ../src/templates/package-template.handlebars
sed -i "s/\"@cerc-io\/util.*/\"@cerc-io\/util\": \"^${1}\",/" ../src/templates/package-template.handlebars
sed -i "s/\"@cerc-io\/graph-node.*/\"@cerc-io\/graph-node\": \"^${1}\",/" ../src/templates/package-template.handlebars

fi
