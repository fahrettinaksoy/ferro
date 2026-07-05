// Vuetify bileşenleri (v-navigation-drawer, v-virtual-scroll, v-menu ...) tarayıcı
// düzen API'lerine dayanır; happy-dom bunları sağlamaz — testler için sahte
// (no-op) uygulamalar yeterli, gerçek düzen ölçümü test edilen davranış değil.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    }) as unknown as MediaQueryList
}
