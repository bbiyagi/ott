import { computed, ref } from 'vue'
import type { CalEvent } from '../data/mock'
import { TODAY, addDays, iso, sameDay } from './date'

export type CalView = 'month' | 'week'
export const VIEWS: [CalView, string][] = [['month', '월간'], ['week', '주간']]

export function useCalendar(events: () => CalEvent[]) {
  const view = ref<CalView>('month')
  const y = ref(TODAY.getFullYear())
  const m = ref(TODAY.getMonth())
  const sel = ref(TODAY) // 선택한 날짜. 주간 보기는 이 날짜가 속한 주

  const byDay = computed(() => {
    const map = new Map<string, CalEvent[]>()
    for (const e of events()) {
      const list = map.get(e.date)
      if (list) list.push(e)
      else map.set(e.date, [e])
    }
    return map
  })
  const on = (d: Date) => byDay.value.get(iso(d)) ?? []

  const grid = computed(() => {
    const first = new Date(y.value, m.value, 1).getDay()
    const dim = new Date(y.value, m.value + 1, 0).getDate()
    return Array.from({ length: Math.ceil((first + dim) / 7) * 7 }, (_, i) => {
      const day = i - first + 1
      return day < 1 || day > dim ? null : new Date(y.value, m.value, day)
    })
  })
  const week = computed(() => {
    const start = addDays(sel.value, -sel.value.getDay())
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  })

  function pick(d: Date) {
    sel.value = d
    y.value = d.getFullYear()
    m.value = d.getMonth()
  }
  function step(dir: number) {
    if (view.value === 'month') pick(new Date(y.value, m.value + dir, 1))
    else pick(addDays(sel.value, dir * 7))
  }
  const toToday = () => pick(TODAY)

  const isToday = (d: Date) => sameDay(d, TODAY)
  const numCls = (d: Date) => (isToday(d) ? 'accent' : d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : '')

  return { view, y, m, sel, on, grid, week, pick, step, toToday, isToday, numCls }
}
