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

/** 이미지가 없을 때 그리는 대체 이미지: 제목으로 정한 색 + 제목·플랫폼 글자 (CSS .gen) */
export const hue = (t: string) => [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)
export const genBg = (t: string) =>
  `radial-gradient(120% 90% at 0% 0%, hsl(${hue(t)} 55% 32%), transparent 60%), linear-gradient(160deg, hsl(${(hue(t) + 40) % 360} 45% 18%), #121214)`

function art(el: HTMLElement) {
  el.classList.add('gen')
  el.style.background = genBg(el.dataset.art ?? '')
}

function show(el: HTMLElement) {
  el.dataset.seen = '1'
  const url = el.dataset.bg
  if (!url) return art(el)
  // 미리 받아 보고 실패하면(외부 사이트가 막는 경우 등) 대체 이미지
  const img = new Image()
  img.referrerPolicy = 'no-referrer'
  img.onload = () => el.dataset.bg === url && (el.classList.remove('gen'), (el.style.background = `center/cover no-repeat url("${url}")`))
  img.onerror = () => el.dataset.bg === url && art(el)
  img.src = url
}

type Pic = { poster?: string; title: string; platform?: string }

function set(el: HTMLElement, v?: Pic) {
  el.dataset.art = v?.title ?? ''
  el.dataset.plat = v?.platform && v.platform !== '극장' ? v.platform : ''
  if (v?.poster) el.dataset.bg = v.poster
  else delete el.dataset.bg
  if (!io || el.dataset.seen) show(el)
  else io.observe(el)
}

// v-bg="작품": 포스터, 없거나 못 불러오면 대체 이미지
export const vBg: Directive<HTMLElement, Pic | undefined> = {
  mounted: (el, { value }) => set(el, value),
  updated: (el, { value, oldValue }) => (value?.poster !== oldValue?.poster || value?.title !== oldValue?.title) && set(el, value),
  unmounted: (el) => io?.unobserve(el),
}
