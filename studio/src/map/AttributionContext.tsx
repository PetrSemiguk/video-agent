import { createContext, type ReactNode } from "react";

/** Episode renders one combined overlay outside scene-transition opacity. */
export const InlineAttributionContext = createContext(true);
export const CombinedAttributionScope = ({
  children,
}: {
  children: ReactNode;
}) => (
  <InlineAttributionContext.Provider value={false}>
    {children}
  </InlineAttributionContext.Provider>
);
