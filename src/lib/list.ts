/**
 * `list` with `value` added (checked) or removed (unchecked), for arrays bound
 * to a group of checkboxes. Takes a Checkbox's raw `update:model-value`, where
 * anything other than `true` (false, 'indeterminate') means unticked.
 */
export function toggleInList<T>(list: T[], value: T, checked: boolean | 'indeterminate'): T[] {
  const rest = list.filter((entry) => entry !== value);
  return checked === true ? [...rest, value] : rest;
}
