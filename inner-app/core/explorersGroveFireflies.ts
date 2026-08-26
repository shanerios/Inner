// Android and iOS composite Lottie's multiply blend mode differently over
// video. Preserve the source animation and normalize only its layer blending
// at runtime so the same fireflies render consistently on both platforms.
const source = require('../assets/animations/explorers-grove-fireflies.json');

export const explorersGroveFireflies = JSON.parse(
  JSON.stringify(source, (key, value) => (key === 'bm' && value === 1 ? 0 : value)),
);
