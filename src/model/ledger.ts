import type { ResourceSet } from '../data'
import { ZERO, add, newId } from './empire'
import type { Empire, LedgerKind, LedgerLine } from './empire'

export function line(
  turn: number,
  kind: LedgerKind,
  label: string,
  delta: ResourceSet,
  by: string,
  at: string,
  extra: { planetId?: string; notes?: string } = {},
): LedgerLine {
  return { id: newId(), turn, kind, label, delta, by, at, ...extra }
}

export const ledgerTotal = (lines: LedgerLine[]): ResourceSet => lines.reduce((acc, l) => add(acc, l.delta), ZERO)

/** Turns present in the ledger, newest first. */
export function ledgerTurns(ledger: LedgerLine[]): number[] {
  return [...new Set(ledger.map((l) => l.turn))].sort((a, b) => b - a)
}

/** Stockpile at the close of a turn (all lines up to and including it). */
export function balanceAfterTurn(ledger: LedgerLine[], turn: number): ResourceSet {
  return ledgerTotal(ledger.filter((l) => l.turn <= turn))
}

/** Record a manual ledger line in the current turn (GM ruling, repairs, immigration, a gift...). */
export function addAdjustment(empire: Empire, label: string, delta: ResourceSet, by: string, notes?: string): Empire {
  const at = new Date().toISOString()
  return {
    ...empire,
    resources: add(empire.resources, delta),
    ledger: [...empire.ledger, line(empire.turn, 'adjustment', label, delta, by, at, { notes })],
    updatedAt: at,
    updatedBy: by,
  }
}
