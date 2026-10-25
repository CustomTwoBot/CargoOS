// Convex document ids are one run of lowercase letters and digits, about 32 long. The recorded cases'
// ids ("case_A") carry a separator or a capital, so they never match.
export const looksLikeConvexId = (id: string) => /^[a-z0-9]{25,40}$/.test(id);
