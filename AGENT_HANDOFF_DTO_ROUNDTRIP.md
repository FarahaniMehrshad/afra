# Agent Handoff: DTO ↔ WPF/EXE JSON Round-Trip

**Date:** 2026-08-12  
**Repo:** `c:\codes\AFRA_V2`  
**Prior chat transcript:** `C:\Users\Mehrshad\.cursor\projects\c-codes-AFRA-V2\agent-transcripts\26b87618-b2d7-4cd6-90a9-fe4fc6104e63\26b87618-b2d7-4cd6-90a9-fe4fc6104e63.jsonl`  
**Debug log:** `.cursor\debug-26b876.log` (session id `26b876`)  
**Journey used for testing:** `20260810_153328_Each_operation_on_a_table_is_recorded_as_its_own_configuration` (AFRA DB / docker)

---

## 1. Goal (user intent)

Make **DTO → WPF + EXE JSON** conversion produce **exact match** (after noise normalization) against the real next-step documents in a recorded journey.

Workflow on the **Testing** page (`Page = 'test'`):

1. User picks a **base step** `N`.
2. System builds a DTO from step `N+1` using **UI Impact `merge:across`** seed fields.
3. System converts that DTO against base step `N` docs → generated WPF/EXE.
4. Diff generated vs original step `N+1` docs.
5. Logs a rich summary to `.cursor\debug-26b876.log` for diagnosis.

Success criterion: **`wpf.match === true` and `exe.match === true`** (diffCount 0) for every consecutive pair.

---

## 2. Architecture (pipeline)

```
UI Impact (merge:across)
        │
        ▼
buildImpactDtoFromStep(nextStep)     → DTO (relative shape)
        │
        ▼
buildDtoDiffPlan({ dto, baseWpf, baseExe, entries, acrossEntries, maxStep })
        │  produces OperationPlan { wpf, exe } with FieldOp + ElementOp
        ▼
applyOperationPlan(...)              → post-apply docs + writtenPaths
        │
        ▼
replayDerivedChanges(...)            → fill derived metadata (HasLength, IDs, …)
        │
        ▼
canonicalStringify + normalizeNoise  → text diff vs expected next-step docs
```

### Key files

| File | Role |
|------|------|
| `src/services/dto.diffPlan.ts` | **Primary workhorse.** Diff DTO vs base → plan; sibling fanout; history carryover; **identity alignment (new, buggy)** |
| `src/services/dto.applyPlan.ts` | Apply field/element ops; returns `writtenPaths` |
| `src/services/dto.deriveReplay.ts` | Replay UI-impact derived events onto new/modified elements |
| `src/services/impact.service.ts` | UI field impact + merge modes (`off` / `within` / `across`) |
| `src/services/impactDto.service.ts` | Build DTO from impact seeds + step values |
| `src/services/impactDto.paths.ts` | Path helpers: `toRelativeSegments`, `flattenLeaves`, `setConcrete`, … |
| `src/hooks/useTestRun.ts` | Testing page orchestration + probes + noise normalize + debug ingest |
| `src/hooks/useConvertDto.ts` | Apply DTO page (user-facing convert) |
| `src/types/convert.ts` | `OperationPlan`, `FieldOp`, `ElementOp` |
| `src/types/journey.ts` | `Page` includes `'test'` |

Untracked / dirty of note from earlier: `src\services\dto.diffPlan.ts` has been heavily edited throughout this work.

---

## 3. Important concepts

### Variants
- **WPF** and **EXE** are two JSON shapes for the same UI journey.
- `merge:across` collapses equivalent UI events across variants into one seed (representative + siblings).

### Canonical paths
- Array indices / `#guid` / `@Type:i` normalized to `[]` for grouping.
- DTO paths are **relative** (plugin/link prefix stripped). Absolute paths in docs keep `BoardModel/Plugins/$values/N/...` or EXE `PluginCommands/...`.

### SiblingBridge / CanonicalBridge
- Built from `acrossEntries` merge clusters.
- Used by `fanoutAdds`, `fanoutRemoves`, `fanoutModifies`, `fanoutFieldAddsOrRemoves` to project ops onto every equivalent sibling scope (WPF↔EXE, Execution↔Validation, InputFields↔Columns↔Caption, etc.).

### Element vs field ops
- **ElementOp** add/remove whole array elements (columns, rows).
- **FieldOp** add/remove/modify individual leaves.
- Buckets promote “all leaves of an element are add/remove” → one ElementOp.

### Scalar-array-of-arrays (`Table.Rows/[]/[]`)
- Innermost `[]` = cell; owning element for add/remove is the **row** (outer `[]`).
- `owningElement` walks one wildcard up when trailing structure is `[]/[]`.
- `fanoutAdds` for these scopes resolves the **grandparent** (`Table.Rows`) and lets applier `smallestUnusedIndex` append rows.
- Partial cell append/truncate on existing rows must stay **field** ops, not whole-row element ops (see §5).

### Derived replay
- After apply, historical derived changes for the same UI kind (add/modify/remove) are replayed onto the target element.
- `writtenPaths` guards DTO-authored values from being overwritten.
- `pickTemplate` is **value-aware** (match `event.to` to DTO seed value) so Float adds don’t get Guid templates (`HasLength=false`).

### Noise normalization (test diffs only)
In `useTestRun.ts` `normalizeNoise`:
- GUIDs → `<guid>` (except zero GUID)
- `RND[A-Z0-9]{8,}` → `<rnd-col>`
- ISO timestamps → `<ts>`

### History carryover
`applyHistoryCarryover` emits modify ops for uncovered derived MODIFY history (e.g. Persian `TrimType.Title` = `"انتخاب نشده"`) when base still has `""`.

---

## 4. What already works (verified before identity-pairing)

These were **exact match** on both variants after the row/fanout work (log L138–L160 era):

| Transition | Label | Status (pre–identity-pairing) |
|------------|-------|-------------------------------|
| 1→2 … 11→12 | column adds, renames, row cell edits | ✅ 0/0 |
| 12→13 | `delete-middle-row` | ✅ 0/0 (row-level bucketing + `fanoutRemoves`) |
| 14→15 | `add-guid-column` | ✅ 0/0 (partial-row cell field adds + `fanoutFieldAddsOrRemoves`) |
| 15→16 | (earlier) | WPF ✅; EXE had 2 diffs once |

### Fixes that landed and should be kept

1. **Value-aware derived template pick** (`dto.deriveReplay.ts`)
2. **Sibling fanout for element ADDs** (`fanoutAdds`) + context-aware parent resolution
3. **`deriveCanonicalAbsPrefix`** so adds land on correct plugin (not always Plugins[0])
4. **`writtenPaths` + `derivedHideNoise`** so metadata lands without wiping DTO values
5. **`fanoutModifies`** with trailing consecutive `[]` index matching (row+col for cells)
6. **Scalar row ADD** via grandparent + per-seed dedup
7. **`owningElement` row-level bucketing** for `[]/[]`
8. **`fanoutRemoves`** for cross-variant element deletes
9. **Partial-row promotion guard**: don’t promote to whole-row ADD/REMOVE if the other side still has that row array (fixes Guid-column cell append regression)
10. **`fanoutFieldAddsOrRemoves`**: project cell-level field add/remove across variants
11. **`resolveArrayIndexForSeg`**: `@Type:i` is positional index, not “nth of type”

---

## 5. Open problem: delete-middle-column (13→14) + identity pairing

### Symptom (before identity pairing)
Position pairing: DTO `[CityName, Population, Active]` vs base `[CityName, Population, AreaKm2, Active]` produced:

- MODIFY col2 AreaKm2 → Active (title/type)
- REMOVE col3

Result: Frankenstein col2 (Active title + AreaKm2 `Id` / `HasLength` / `ColumnName` / `Order`).  
Diffs stabilized around **WPF 10 / EXE 10** (L158/L162): `HasLength`, `HasScale`, `HasDecimalSpliter`, `HasGroup`, `ColumnName4` vs `ColumnName3`, `Order` 3 vs 2.

### Intended fix: identity-preserving element alignment
Implemented in `buildVariantPlan` in `dto.diffPlan.ts`:

- Per scope (`entryPrefix + scopeCanon`), compute `dtoIdx → alignedIdx`
- Score = DTO-leaf exact matches / DTO leaf count (DTO-anchored)
- Greedy assign score ≥ 0.5
- Rewrite DTO leaf indices at the scope’s last `[]` before pathKey pairing
- Skip scalar/array-valued scopes (sample element not a plain object) so Rows stay position-based

Helpers: `getOrComputeAlignment`, `computeElementAlignment`, `groupLeavesUnderScope`, `dtoOverlapScore`, `rewriteAlignedIndex`, …

### Alignment bugs found (and patched 2026-08-12, awaiting re-verify)

Root causes of L164/L166 regressions:

1. **Score ≥ 0.5 false positives** — compact DTOs often share `Length:null`/`Scale:null` (2/4 leaves = 0.5) and wrongly paired Boolean↔Text. Fix: require an exact **identity leaf** match (`Title`/`Caption`/`OutputTitle`/…) and score **> 0.5**.
2. **Synthetic index for unmatched DTO elements** — append-at-end remapped new col from dto idx 2 → synthetic 3; applier plants at `smallestUnusedIndex=2` while field/seed paths pointed at 3 / `getAtPath(dto, …/3)` was `{}`. Fix: unmatched keeps `dtoIdx` when free.
3. **Base leaf grouping ignored `entryPrefix`** — could merge same relative paths across plugins. Fix: filter by abs prefix.
4. **`dtoElement` after rewrite** — use `dtoSourceIndex` (pre-alignment) when seeding ADD elements.

**Awaiting user Testing re-run** for 1→2, 12→13, 13→14, 14→15.

---

## 6. How to verify

1. Open app → **Testing** page.
2. Load the journey above.
3. Run base steps of interest (at least **1, 12, 13, 14, 15**).
4. Read `.cursor\debug-26b876.log` — message `"test round-trip summary"`.
5. Quick PowerShell summary:

```powershell
Select-String -Path .cursor\debug-26b876.log -Pattern '"baseStep":\d+,"baseLabel"' |
  Select-Object -Last 20 | ForEach-Object {
    $line = Get-Content .cursor\debug-26b876.log | Select-Object -Index ($_.LineNumber - 1)
    $bs = if ($line -match '"baseStep":(\d+)') { $matches[1] } else { '?' }
    $ns = if ($line -match '"nextStep":(\d+)') { $matches[1] } else { '?' }
    $wm = if ($line -match '"wpf":\{"match":(true|false),"diffCount":(\d+)') { "wpf=$($matches[1])/$($matches[2])" } else { '?' }
    $em = if ($line -match '"exe":\{"match":(true|false),"diffCount":(\d+)') { "exe=$($matches[1])/$($matches[2])" } else { '?' }
    "L$($_.LineNumber): base=$bs next=$ns $wm $em"
  }
```

Useful probe fields inside each summary:
- `probes.wpfLeafDiffs` / `exeLeafDiffs` — exact paths
- `probes.wpfDriftContext` — base / postApply / generated / expected
- `wpf.elementOps` / `fieldOps` — what the planner emitted
- `warnings` — skipped non-JSON derived literals

Also look for ingest `"post-fanout element summary"` from `dto.diffPlan.ts` (`runId: seeded-fanout`).

---

## 7. Suggested next steps (priority)

1. **Stabilize regressions first**
   - Restore exact match for **1→2** (and reconfirm 2→3 … 12→13, 14→15).
   - Decide: fix vs revert identity alignment.

2. **Then solve 13→14 properly**
   - Correct pairing: base Active (idx 3) ↔ DTO Active (idx 2); REMOVE only AreaKm2 (idx 2).
   - Ensure same alignment across `InputFields`, `Columns`, `Table.Columns`, `Links.Fields`, and EXE Execution/Validation siblings (or rely on fanoutRemoves after one seed REMOVE).
   - After splice, Active must keep original Id/Order/ColumnName/Has* flags.

3. **Sweep remaining steps** (15→16, 16→17, …) once 13→14 is green.

4. **Cleanup later** (not urgent)
   - Remove debug `fetch` instrumentation in `dto.diffPlan.ts` / probes if user asks.
   - Many “skipped derived value (non-JSON literal)” warnings for object-valued derived paths — expected for some templates.

---

## 8. Pitfalls / lessons learned

- **Don’t invent placeholder parent paths** when sibling not in doc — drops onto wrong plugin.
- **Per-seed dedup for ADD rows**, not global — multiple new rows share parent `Table.Rows`.
- **`resolveCanonicalArrayPaths(.../Rows/[])`** returns existing row slots when Rows non-empty — wrong for appending a new row; use grandparent.
- **Fanout modify** must match **all** trailing `[]` indices, not only the last (else rewrite every row’s column j).
- **Cell append ≠ new row**: bucket may show “all recorded cells are ADD” even when the row already exists — cross-check `getAtPath(base, row)`.
- **`@Type:i`** in historical paths = array position `i`, verified type — not ordinal-among-type.
- **Noise GUIDs/RND** in text diffs are OK to ignore via `normalizeNoise`; structural/value drift is not.
- Testing page + log probes beat guessing from Apply DTO UI.

---

## 9. Todo status (at handoff)

| Id | Status | Notes |
|----|--------|-------|
| row-level-bucketing | completed | Keep |
| fanout-removes | completed | Keep |
| per-seed-dedup | completed | Keep |
| partial-row-cell-add | completed | Keep |
| fanout-field-add-remove | completed | Keep |
| identity-pairing-delete-middle | completed *code* | **Behavior broken — needs verify/fix** |
| identity-pairing-verify | **in_progress / failed** | L164/L166 regressions |

---

## 10. User preferences

- Goal is **exact match** on Testing page, not “close enough”.
- Prefer reading debug logs after each Testing rerun (`recheck` / `re-checked`).
- Don’t commit unless asked.
- Keep changes focused; match existing code style.
- Frontend design rules in user_rules are **not** relevant to this backend/service work.

---

## 11. One-sentence state for the next agent

**Identity alignment was patched (identity-key gate + keep dtoIdx on append + dtoSourceIndex for ADD seeds); awaiting Testing re-run to confirm 1→2 is green again and 13→14 reaches 0/0.**
