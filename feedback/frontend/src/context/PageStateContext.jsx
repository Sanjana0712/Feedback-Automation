import { createContext, useCallback, useContext, useRef, useState as useReactState } from "react";

const PageStateContext = createContext(null);

export function PageStateProvider({ children }) {
  const storeRef = useRef({});
  return <PageStateContext.Provider value={storeRef}>{children}</PageStateContext.Provider>;
}

export function usePersistedState(key, initialValue) {
  const storeRef = useContext(PageStateContext);
  if (!storeRef) {
    throw new Error("usePersistedState must be used within a <PageStateProvider>");
  }

  const [value, setValue] = useReactState(() => {
    if (Object.prototype.hasOwnProperty.call(storeRef.current, key)) {
      return storeRef.current[key];
    }
    const initial = typeof initialValue === "function" ? initialValue() : initialValue;
    storeRef.current[key] = initial;
    return initial;
  });

  const setPersistedValue = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        storeRef.current[key] = resolved;
        return resolved;
      });
    },
    [key, storeRef, setValue]
  );

  return [value, setPersistedValue];
}
