export { colors } from "./colors";
export { radius } from "./radius";
export { shadows } from "./shadows";
export { spacing } from "./spacing";
export { typography } from "./typography";

export {
  getScreenHorizontalPadding,
  isCompactWidth,
  isWideWidth,
  layout
} from "./layout";

import { colors } from "./colors";
import { layout } from "./layout";
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
  layout,
} as const;
