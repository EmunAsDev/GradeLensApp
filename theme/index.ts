export { colors } from "./colors";

export { spacing } from "./spacing";

export { radius } from "./radius";

export { typography } from "./typography";

export { shadows } from "./shadows";

import { colors } from "./colors";
import { radius } from "./radius";
import { shadows } from "./shadows";
import { spacing } from "./spacing";
import { typography } from "./typography";

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  shadows,
} as const;
