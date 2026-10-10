import type { Directive } from 'vue'

// v-reveal: 스크롤로 화면에 들어올 때 한 번만 살짝 떠오른다.
// 숨기는 클래스도 JS가 붙이므로, JS가 못 돌면 내용은 그냥 보인다
const io =
  typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue
            e.target.classList.add('in')
            io!.unobserve(e.target)
          }
        },
        { rootMargin: '0px 0px -8% 0px' },
      )

export const vReveal: Directive<HTMLElement> = {
  mounted(el) {
    if (!io) return
    el.classList.add('reveal')
    io.observe(el)
  },
  unmounted(el) {
    io?.unobserve(el)
  },
}
