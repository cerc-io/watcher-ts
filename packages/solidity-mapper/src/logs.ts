import { JsonFragment } from "@ethersproject/abi"
import { utils } from "ethers";

interface EventNameTopic {
  [eventName: string]: string
}

/**
 * Function to get event name topics from abi.
 * @param abi
 */
export const getEventNameTopics = (abi: JsonFragment[]): EventNameTopic => {
  const eventFragments = abi.filter(({ type }) => type === 'event');

  return eventFragments.reduce((acc: EventNameTopic, { name, inputs }) => {
    if (inputs && name) {
      const inputParamsString = inputs.map(({ type }) => type)
        .join(',');

      const signature = utils.keccak256(utils.toUtf8Bytes(`${name}(${inputParamsString})`));
      acc[name] = signature;
    }

    return acc;
  }, {})
}
