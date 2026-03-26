const SCORE_CONTRACT_DEFAULTS = Object.freeze({ AEO: 0, GEO: 0, GLOBAL: 0 });

const normalizeBoundedScore = (value, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 1) return Math.round(Math.max(0, Math.min(max, numeric * max)));
  if (numeric > max && numeric <= 100) return Math.round((numeric / 100) * max);
  return Math.round(Math.max(0, Math.min(max, numeric)));
};

const normalizeScoreContract = (scores) => {
  const src = scores && typeof scores === 'object' ? scores : {};
  const aeoCandidate = src.AEO ?? src.aeo ?? src?.global?.AEO?.score ?? src?.categories?.AEO?.score;
  const geoCandidate = src.GEO ?? src.geo ?? src?.global?.GEO?.score ?? src?.categories?.GEO?.score;
  const globalCandidate = src.GLOBAL ?? src.global_score ?? src?.global?.score;

  const AEO = normalizeBoundedScore(aeoCandidate, 55);
  const GEO = normalizeBoundedScore(geoCandidate, 45);
  const GLOBAL = globalCandidate === undefined || globalCandidate === null
    ? Math.round(Math.max(0, Math.min(100, AEO + GEO)))
    : normalizeBoundedScore(globalCandidate, 100);

  return { AEO, GEO, GLOBAL };
};

const buildFlatScoreContract = (globalScore) => ({
  AEO: Math.round(Number(globalScore?.AEO?.score || 0) * 100) / 100,
  GEO: Math.round(Number(globalScore?.GEO?.score || 0) * 100) / 100,
  GLOBAL: Math.round(Number(globalScore?.score || 0) * 100) / 100
});

module.exports = {
  SCORE_CONTRACT_DEFAULTS,
  normalizeScoreContract,
  buildFlatScoreContract
};
