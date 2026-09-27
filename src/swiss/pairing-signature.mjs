// Code-point ordering keeps persisted signatures independent of locale.
export const compareStableIds = (left, right) => {
  const a = String(left);
  const b = String(right);
  return a === b ? 0 : a < b ? -1 : 1;
};

export const pairingSignature = (pairing) => JSON.stringify((pairing?.pairs ?? pairing)
  .map((pair) => [String(pair.a), String(pair.b)].sort(compareStableIds))
  .sort((left, right) => compareStableIds(JSON.stringify(left), JSON.stringify(right))));
