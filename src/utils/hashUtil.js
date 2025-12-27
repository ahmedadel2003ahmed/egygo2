import bcrypt from 'bcrypt';

/**
 * Hash a plain text value
 */
export const hash = async (value) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(value, salt);
};

/**
 * Compare a plain text value with a hash
 */
export const compare = async (value, hashedValue) => {
  return await bcrypt.compare(value, hashedValue);
};
