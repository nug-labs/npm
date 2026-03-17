import type { Strain, StrainDataset } from "./types";

/**
 * Normalizes a user-facing search string for case-insensitive matching.
 *
 * @param value Raw search value.
 * @returns Trimmed lowercase string.
 */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Checks whether any alias on a strain matches the provided predicate.
 *
 * @param strain Strain being inspected.
 * @param predicate Callback used to test each alias.
 * @returns `true` when an alias matches.
 */
function matchesAlias(strain: Strain, predicate: (alias: string) => boolean): boolean {
  return Array.isArray(strain.akas) && strain.akas.some((alias) => predicate(alias));
}

/**
 * Performs an exact, case-insensitive lookup against `name` and `akas`.
 *
 * @param dataset Dataset to search.
 * @param name Exact strain or alias to resolve.
 * @returns A single matching strain or `null`.
 */
export function findExactStrain(dataset: StrainDataset, name: string): Strain | null {
  const query = normalize(name);
  if (!query) {
    return null;
  }

  const match = dataset.find((strain) => {
    if (normalize(strain.name) === query) {
      return true;
    }

    return matchesAlias(strain, (alias) => normalize(alias) === query);
  });

  return match ?? null;
}

/**
 * Performs a case-insensitive partial match against `name` and `akas`.
 *
 * @param dataset Dataset to search.
 * @param query Partial query to match.
 * @returns All matching strains.
 */
export function findMatchingStrains(dataset: StrainDataset, query: string): Strain[] {
  const normalized = normalize(query);
  if (!normalized) {
    return [...dataset];
  }

  return dataset.filter((strain) => {
    if (normalize(strain.name).includes(normalized)) {
      return true;
    }

    return matchesAlias(strain, (alias) => normalize(alias).includes(normalized));
  });
}
