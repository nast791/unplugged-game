/** Разыменовать $name / name из vars. */
export const resolveVar = (value, vars = {}) => {
  if (typeof value !== 'string') return value;
  if (value.startsWith('$')) {
    return vars[value.slice(1)];
  }
  if (Object.prototype.hasOwnProperty.call(vars, value)) {
    return vars[value];
  }
  return value;
};

export default resolveVar;
