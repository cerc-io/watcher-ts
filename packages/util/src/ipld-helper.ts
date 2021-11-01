import _ from 'lodash';

export const updateStateForElementaryType = (initialObject: any, stateVariable: string, value: string): any => {
  const object = _.cloneDeep(initialObject);
  const path = ['state', stateVariable];

  return _.set(object, path, value);
};

export const updateStateForMappingType = (initialObject: any, stateVariable: string, keys: string[], value: string): any => {
  const object = _.cloneDeep(initialObject);
  keys.unshift('state', stateVariable);

  // Use _.setWith() with Object as customizer as _.set() treats numeric value in path as an index to an array.
  return _.setWith(object, keys, value, Object);
};
