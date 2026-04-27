import * as acorn from 'acorn';

export function parse(code: string): acorn.Node {
  return acorn.parse(code, {
    ecmaVersion: 2020,
    sourceType: 'script',
    locations: true,
  });
}
