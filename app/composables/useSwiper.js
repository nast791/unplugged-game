import {
  computed,
  isRef,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  unref,
  watch,
} from 'vue';

const COMPOSABLE_KEYS = ['containerRef', 'scrollbarRef', 'enabled', 'scrollbar', 'modules', 'on'];

const splitOptions = source => {
  const raw = source && typeof source === 'object' ? source : {};
  if (raw.swiper) {
    return {
      containerRef: raw.containerRef,
      scrollbarRef: raw.scrollbarRef,
      enabled: raw.enabled,
      scrollbar: raw.scrollbar,
      modules: raw.modules,
      on: raw.on ?? {},
      swiper: { ...raw.swiper },
    };
  }

  const composable = {};
  const swiper = {};
  for (const [key, value] of Object.entries(raw)) {
    if (COMPOSABLE_KEYS.includes(key)) composable[key] = value;
    else swiper[key] = value;
  }

  return {
    containerRef: composable.containerRef,
    scrollbarRef: composable.scrollbarRef,
    enabled: composable.enabled,
    scrollbar: composable.scrollbar,
    modules: composable.modules,
    on: composable.on ?? {},
    swiper,
  };
};

const readInput = input => (typeof input === 'function' ? input() : unref(input));

const realSlidesCount = instance => {
  const slides = instance?.slides ?? [];
  if (!slides.length) return 0;
  return slides.filter(slide => !slide.classList.contains('swiper-slide-duplicate')).length;
};

export const useSwiper = (input = {}) => {
  const first = readInput(input) ?? {};
  const containerRef = first.containerRef ?? ref(null);
  const scrollbarRef = first.scrollbarRef ?? ref(null);

  const instance = shallowRef(null);
  const isAvailable = ref(true);
  const activeIndex = ref(0);
  const isFirstVisible = ref(true);
  const isLastVisible = ref(false);

  const syncEdges = swiper => {
    if (!swiper) return;
    isFirstVisible.value = swiper.isBeginning;
    isLastVisible.value = swiper.isEnd;
    activeIndex.value = swiper.activeIndex ?? 0;
  };

  const destroy = () => {
    if (!import.meta.client) return;
    instance.value?.destroy(true, true);
    instance.value = null;
    activeIndex.value = 0;
    isFirstVisible.value = true;
    isLastVisible.value = false;
  };

  const init = async () => {
    const options = splitOptions(readInput(input));

    if (!import.meta.client) return;
    if (options.enabled !== undefined && !unref(options.enabled)) {
      destroy();
      return;
    }
    if (!containerRef.value) return;

    let Swiper;
    let Navigation;
    let Scrollbar;
    let Mousewheel;

    try {
      Swiper = (await import('swiper')).default;
      ({ Navigation, Scrollbar, Mousewheel } = await import('swiper/modules'));
    } catch {
      isAvailable.value = false;
      if (import.meta.dev) {
        console.warn('useSwiper: нужен пакет "swiper" и его CSS (pnpm add swiper)');
      }
      return;
    }

    if (!containerRef.value) return;

    isAvailable.value = true;
    destroy();

    const modules = [Navigation, Mousewheel];
    if (options.scrollbar) modules.push(Scrollbar);
    if (options.modules?.length) modules.push(...options.modules);

    const scrollEl = scrollbarRef.value?.$el || scrollbarRef.value;
    const userOn = options.on;

    instance.value = new Swiper(containerRef.value, {
      ...options.swiper,
      modules,
      scrollbar:
        options.scrollbar && scrollEl
          ? {
              el: scrollEl,
              draggable: true,
              ...(typeof options.scrollbar === 'object' ? options.scrollbar : {}),
            }
          : false,
      on: {
        ...userOn,
        init: swiper => {
          syncEdges(swiper);
          userOn.init?.(swiper);
        },
        slideChange: swiper => {
          syncEdges(swiper);
          userOn.slideChange?.(swiper);
        },
        progress: (swiper, progress) => {
          isFirstVisible.value = progress <= 0;
          isLastVisible.value = progress >= 1;
          userOn.progress?.(swiper, progress);
        },
        reachBeginning: swiper => {
          isFirstVisible.value = true;
          userOn.reachBeginning?.(swiper);
        },
        reachEnd: swiper => {
          isLastVisible.value = true;
          userOn.reachEnd?.(swiper);
        },
        resize: swiper => {
          syncEdges(swiper);
          userOn.resize?.(swiper);
        },
      },
    });
  };

  const update = () => instance.value?.update();
  const reinit = () => (import.meta.client ? nextTick(() => init()) : Promise.resolve());

  if (import.meta.client) {
    if (isRef(input) || typeof input === 'function') {
      watch(input, () => reinit(), { deep: true });
    }
    onMounted(() => nextTick(() => init()));
    onBeforeUnmount(() => destroy());
  }

  const slideNext = () => instance.value?.slideNext();

  const slidePrev = () => {
    const swiper = instance.value;
    if (!swiper) return;
    if (swiper.params?.loop) {
      const count = realSlidesCount(swiper);
      if (count > 0) {
        swiper.slideToLoop((swiper.realIndex - 1 + count) % count);
        return;
      }
    }
    swiper.slidePrev();
  };

  return {
    containerRef,
    scrollbarRef,
    swiper: instance,
    isAvailable: computed(() => isAvailable.value),
    activeIndex,
    isFirstVisible,
    isLastVisible,
    slideNext,
    slidePrev,
    slideTo: (index, speed) => instance.value?.slideTo(index, speed),
    slideToLoop: (index, speed) => instance.value?.slideToLoop(index, speed),
    update,
    reinit,
    destroy,
  };
};

export default useSwiper;
