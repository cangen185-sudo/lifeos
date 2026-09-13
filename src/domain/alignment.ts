import type { Commitment, Desire, Goal, PriorityBand } from './types'

const STOP = new Set([
  '的',
  '了',
  '和',
  '与',
  '在',
  '是',
  '我',
  '一个',
  '完成',
  '进行',
  '今天',
  '这个',
  '那个',
  '以及',
])

export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().trim()
  const parts = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const grams: string[] = []
  for (const part of parts) {
    if (!STOP.has(part)) grams.push(part)
    if (/[\u4e00-\u9fff]/.test(part) && part.length >= 2) {
      for (let i = 0; i < part.length - 1; i += 1) {
        const gram = part.slice(i, i + 2)
        if (!STOP.has(gram)) grams.push(gram)
      }
    }
  }
  return [...new Set(grams.filter((item) => item.length >= 2))]
}

export function overlapScore(query: string, corpus: string): number {
  if (!query.trim() || !corpus.trim()) return 0
  if (query.includes(corpus) || corpus.includes(query)) return 1
  const a = tokenize(query)
  const b = new Set(tokenize(corpus))
  if (a.length === 0 || b.size === 0) return 0
  let hits = 0
  for (const token of a) {
    if (b.has(token)) hits += 1
  }
  return hits / a.length
}

export type AlignmentSuggestion = {
  goalId?: string
  commitmentId?: string
  score: number
  whyPath: string[]
}

export function suggestAlignment(
  title: string,
  goals: Goal[],
  desires: Desire[],
  commitments: Commitment[],
): AlignmentSuggestion {
  let best: AlignmentSuggestion = { score: 0, whyPath: [] }

  for (const goal of goals) {
    if (goal.status !== 'active') continue
    const desire = desires.find((item) => item.id === goal.primaryDesireId)
    const corpus = `${goal.title} ${goal.description ?? ''} ${desire?.title ?? ''} ${desire?.description ?? ''}`
    const score = overlapScore(title, corpus)
    if (score > best.score) {
      best = {
        goalId: goal.id,
        score,
        whyPath: whyPathFor(goal, desire),
      }
    }
  }

  for (const commitment of commitments) {
    if (commitment.state !== 'active' && commitment.state !== 'draft') continue
    const goal = goals.find((item) => item.id === commitment.primaryGoalId)
    const desire = desires.find((item) => item.id === goal?.primaryDesireId)
    const corpus = `${commitment.title} ${commitment.rationale ?? ''} ${goal?.title ?? ''}`
    const score = overlapScore(title, corpus) + 0.05
    if (score > best.score) {
      best = {
        goalId: goal?.id,
        commitmentId: commitment.id,
        score,
        whyPath: whyPathFor(goal, desire, commitment),
      }
    }
  }

  if (best.score < 0.18) {
    return { score: best.score, whyPath: [] }
  }
  return best
}

export function whyPathFor(
  goal?: Goal,
  desire?: Desire,
  commitment?: Commitment,
): string[] {
  const path: string[] = []
  if (commitment) path.push(commitment.title)
  if (goal) path.push(goal.title)
  if (desire) path.push(desire.title)
  return path
}

export function importanceScore(
  band: PriorityBand,
  desire?: Desire,
  commitment?: Commitment,
): number {
  const desireWeight = desire?.active ? desire.importance * 12 : 0
  const bandWeight = band === 'must' ? 28 : band === 'should' ? 10 : 3
  const commitmentWeight = commitment?.state === 'active' ? 10 : 0
  return desireWeight + bandWeight + commitmentWeight
}

export function whyLine(path: string[]): string {
  if (path.length === 0) return '未对齐人生方向'
  return path.join(' → ')
}
