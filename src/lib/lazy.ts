import type { Directive } from 'vue'

// v-bg="url": 포스터를 화면 가까이(400px 전) 왔을 때 불러온다. 수십 장을 한 번에 받지 않도록.
// 한 번 보인 요소는 이후 주소가 바뀌면(필터·탭 전환) 바로 바꾼다
const io =
  typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue
            show(e.target as HTMLElement)
            io!.unobserve(e.target)
          }
        },
        { rootMargin: '400px' },
      )

function show(el: HTMLElement) {
  el.dataset.seen = '1'
  if (el.dataset.bg) el.style.background = `center/cover no-repeat url("${el.dataset.bg}")`
}

function set(el: HTMLElement, url?: string) {
  if (!url) {
    delete el.dataset.bg
    el.style.background = '' // 줄무늬 자리표시로
    return
  }
  el.dataset.bg = url
  if (!io || el.dataset.seen) show(el)
  else io.observe(el)
}

export const vBg: Directive<HTMLElement, string | undefined> = {
  mounted: (el, { value }) => set(el, value),
  updated: (el, { value, oldValue }) => value !== oldValue && set(el, value),
  unmounted: (el) => io?.unobserve(el),
}
