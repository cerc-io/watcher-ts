import Decimal from 'decimal.js';
import { ValueTransformer } from 'typeorm';

export const decimalTransformer: ValueTransformer = {
  to: (value?: Decimal) => {
    if (value) {
      return value.toString();
    }

    return value;
  },
  from: (value?: string) => {
    if (value) {
      return new Decimal(value);
    }

    return value;
  }
};
