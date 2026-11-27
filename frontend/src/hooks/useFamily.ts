import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFamily, saveFamily } from "../lib/api";
import { EMPTY_HOUSEHOLD, fromDto, toDto, type Household } from "../lib/household";

export type FamilyStatus = "idle" | "loading" | "saving" | "saved" | "error";

const SAVE_DELAY_MS = 600;

/**
 * The signed-in account's family, loaded from and saved to the server (debounced).
 * Guests (userId null) always get an empty family and cannot change it: adding family
 * members needs an account, and the server enforces that too.
 */
export function useFamily(userId: number | null) {
  const [owner, setOwner] = useState(userId);
  const [household, setHousehold] = useState<Household>(EMPTY_HOUSEHOLD);
  const [status, setStatus] = useState<FamilyStatus>(userId === null ? "idle" : "loading");
  const [error, setError] = useState("");
  const dirty = useRef(false);

  // A different account (or a log-out): start from an empty family, never the previous one's.
  if (owner !== userId) {
    setOwner(userId);
    setHousehold(EMPTY_HOUSEHOLD);
    setStatus(userId === null ? "idle" : "loading");
    setError("");
  }

  useEffect(() => {
    dirty.current = false;
    if (userId === null) return;
    const controller = new AbortController();
    fetchFamily(controller.signal).then(
      (dto) => {
        if (dirty.current) return; // the user already started editing; keep their changes
        setHousehold(fromDto(dto));
        setStatus("idle");
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not load your family.");
      },
    );
    return () => controller.abort();
  }, [userId]);

  useEffect(() => {
    if (userId === null || !dirty.current) return;
    let live = true;
    const timer = window.setTimeout(() => {
      setStatus("saving");
      saveFamily(toDto(household)).then(
        () => live && setStatus("saved"),
        (err: unknown) => {
          if (!live) return;
          setStatus("error");
          setError(err instanceof Error ? err.message : "Could not save your family.");
        },
      );
    }, SAVE_DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [household, userId]);

  const update = useCallback(
    (next: Household) => {
      if (userId === null) return;
      dirty.current = true;
      setError("");
      setHousehold(next);
    },
    [userId],
  );

  return { household, update, status, error };
}
