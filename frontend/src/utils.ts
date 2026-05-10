/** Returns true for "positive" coded values: yes, probable, inferred, probable / inferred */
export const broadPos = (v: string | undefined): boolean =>
  ['yes', 'probable', 'inferred', 'probable / inferred'].includes(v || '');
